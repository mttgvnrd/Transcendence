from rest_framework import serializers
from django.contrib.auth.models import User
from django.contrib.auth.password_validation import validate_password
from .models import UserProfile
from django.core.validators import EmailValidator
from django.contrib.auth import authenticate
from .models import Tournament, TournamentParticipant, TournamentMatch

class UserRegistrationSerializer(serializers.Serializer):
	username = serializers.CharField(
		required=True,
		min_length=4,
		max_length=150,
		error_messages={
			'required': 'Il campo username è obbligatorio.',
			'min_length': 'Lo username deve essere di almeno 4 caratteri.',
			'max_length': 'Lo username può avere al massimo 150 caratteri.'
		}
	)
	
	email = serializers.EmailField(
		required=True,
		validators=[EmailValidator()],
		error_messages={
			'required': 'Il campo email è obbligatorio.',
			'invalid': 'Inserisci un indirizzo email valido.'
		}
	)
	password = serializers.CharField(
		required=True,
		write_only=True,
		style={'input_type': 'password'},
		validators=[validate_password],
		error_messages={
			'required': 'Il campo password è obbligatorio.'
		}
	)
	password2 = serializers.CharField(
		required=True,
		write_only=True,
		style={'input_type': 'password'},
		error_messages={
			'required': 'Il campo conferma password è obbligatorio.'
		}
	)
	
	profile_image = serializers.ImageField(
		required=False,
		allow_null=True
	)
	
	def validate_username(self, value):
		if User.objects.filter(username=value).exists():
			raise serializers.ValidationError("Questo nome utente è già in uso.")
		return value
	
	def validate_email(self, value):
		if User.objects.filter(email=value).exists():
			raise serializers.ValidationError("Questo indirizzo email è già in uso.")
		return value
	
	def validate(self, data):
		if data['password'] != data['password2']:
			raise serializers.ValidationError({"password2": "Le password non corrispondono."})
		return data
	
	def create(self, validated_data):
		# Rimuove campi non necessari per la creazione dell'utente
		validated_data.pop('password2')
		profile_image = validated_data.pop('profile_image', None)
		
		# Crea l'utente
		user = User.objects.create_user(
			username=validated_data['username'],
			email=validated_data['email'],
			password=validated_data['password']
		)
		
		# Crea o ottiene il profilo utente (può già essere creato dai signals)
		user_profile, created = UserProfile.objects.get_or_create(user=user)
		
		# Aggiorna l'immagine del profilo se fornita
		if profile_image:
			user_profile.profile_image = profile_image
			user_profile.save()
		
		return user

class UserLoginSerializer(serializers.Serializer):
	username = serializers.CharField(required=True)
	password = serializers.CharField(required=True, style={'input_type': 'password'})
	
	def validate(self, data):
		user = authenticate(username=data['username'], password=data['password'])
		if not user:
			raise serializers.ValidationError("Credenziali non valide")
		if not user.is_active:
			raise serializers.ValidationError("L'account è disattivato")
		# Aggiungi utente per uso futuro
		data['user'] = user
		return data
	
	def create(self, validated_data):
		user = authenticate(username=validated_data['username'], password=validated_data['password'])
		if not user:
			raise serializers.ValidationError("Credenziali non valide")
		return user


class UserProfileSerializer(serializers.ModelSerializer):
	"""Serializer per visualizzare i dati del profilo utente"""
	username = serializers.CharField(source='user.username', read_only=True)
	email = serializers.EmailField(source='user.email', read_only=True)
	
	class Meta:
		model = UserProfile
		fields = ['username', 'email', 'profile_image', 'bio', 'display_name', 
				  'wins', 'losses', 'is_online', 'last_seen', 'two_factor_enabled']
		read_only_fields = ['wins', 'losses', 'is_online', 'last_seen', 'two_factor_enabled']


class UserProfileDetailSerializer(serializers.ModelSerializer):
	"""Serializer completo per visualizzare tutti i dati del profilo utente"""
	username = serializers.CharField(source='user.username', read_only=True)
	email = serializers.EmailField(source='user.email', read_only=True)
	date_joined = serializers.DateTimeField(source='user.date_joined', read_only=True)
	last_login = serializers.DateTimeField(source='user.last_login', read_only=True)
	total_games = serializers.IntegerField(read_only=True)
	win_ratio = serializers.FloatField(read_only=True)
	
	class Meta:
		model = UserProfile
		fields = [
			'username', 'email', 'profile_image', 'bio', 'display_name',
			'wins', 'losses', 'is_online', 'last_seen', 'two_factor_enabled',
			'date_joined', 'last_login', 'total_games', 'win_ratio'
		]
		read_only_fields = [
			'wins', 'losses', 'is_online', 'last_seen', 'two_factor_enabled',
			'date_joined', 'last_login', 'total_games', 'win_ratio'
		]

class TournamentParticipantSerializer(serializers.ModelSerializer):
	"""Serializer for tournament participants"""
	class Meta:
		model = TournamentParticipant
		fields = ['id', 'nickname']
		read_only_fields = ['id']

class TournamentMatchSerializer(serializers.ModelSerializer):
	"""Serializer for tournament matches"""
	player_1 = TournamentParticipantSerializer(read_only=True)
	player_2 = TournamentParticipantSerializer(read_only=True)
	winner = TournamentParticipantSerializer(read_only=True)
	
	class Meta:
		model = TournamentMatch
		fields = ['id', 'round', 'player_1', 'player_2', 'score_player_1', 
				 'score_player_2', 'winner']
		read_only_fields = ['id', 'round', 'player_1', 'player_2', 'winner']

class TournamentSerializer(serializers.ModelSerializer):
	"""Serializer for tournaments"""
	participants = TournamentParticipantSerializer(many=True, read_only=True)
	creator_username = serializers.CharField(source='creator.username', read_only=True)
	
	class Meta:
		model = Tournament
		fields = ['id', 'name', 'start_date', 'end_date', 'creator_username',
				 'num_participants', 'max_participants', 'status', 'participants', 'winner_nickname']
		read_only_fields = ['id', 'start_date', 'end_date', 'creator_username',
						   'num_participants', 'status', 'winner_nickname']

class TournamentCreateSerializer(serializers.ModelSerializer):
	"""Serializer for creating tournaments"""
	class Meta:
		model = Tournament
		fields = ['id', 'name', 'num_participants']
		read_only_fields = ['id']
		
	def validate_num_participants(self, value):
		"""Validate that number of participants is valid (4, 8, or 16)"""
		valid_numbers = [4, 8, 16]
		if value not in valid_numbers:
			raise serializers.ValidationError(
				f"Number of participants must be one of {valid_numbers}"
			)
		return value
		
	def create(self, validated_data):
		creator = validated_data.pop('creator', None)
		tournament = Tournament.objects.create(
			creator=creator,
			**validated_data
		)
		return tournament
