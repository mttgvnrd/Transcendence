from django.db import models
from django.contrib.auth.models import User
from django.db.models import Q
from django.utils.timezone import now
from django.contrib.auth import get_user_model
from django.utils import timezone
from django.core.validators import MinLengthValidator, MaxLengthValidator
from django.core.exceptions import ValidationError
import os
import uuid
import logging

logger = logging.getLogger(__name__)

def validate_image_size(image):
	"""Valida che l'immagine non superi 2MB"""
	if image.size > 2 * 1024 * 1024:  # 2MB
		raise ValidationError("L'immagine non può superare 2MB")

def user_profile_image_path(instance, filename):
	"""Genera un percorso univoco per l'immagine di profilo"""
	ext = filename.split('.')[-1]
	return f'profile_pics/{instance.user.username}_{now().strftime("%Y%m%d%H%M%S")}.{ext}'

def delete_old_profile_image(sender, instance, **kwargs):
	"""Elimina la vecchia immagine del profilo quando viene caricata una nuova"""
	logger = logging.getLogger(__name__)
	logger.info(f"delete_old_profile_image: Inizio processo per l'istanza {instance.pk}")
	
	if not instance.pk:  # Se è una nuova istanza, non c'è vecchia immagine da eliminare
		logger.info("delete_old_profile_image: Nuova istanza, nessuna immagine da eliminare")
		return
	
	try:
		old_instance = UserProfile.objects.get(pk=instance.pk)
		logger.info(f"delete_old_profile_image: Vecchia istanza trovata con immagine: {old_instance.profile_image}")
		
		if old_instance.profile_image and old_instance.profile_image != instance.profile_image:
			logger.info(f"delete_old_profile_image: Immagine diversa rilevata. Vecchia: {old_instance.profile_image}, Nuova: {instance.profile_image}")
			
			# Verifica che non sia l'immagine di default
			if old_instance.profile_image.name != 'profile_pics/default.jpg':
				logger.info(f"delete_old_profile_image: Non è l'immagine di default, procedo con l'eliminazione")
				if os.path.isfile(old_instance.profile_image.path):
					logger.info(f"delete_old_profile_image: File trovato al percorso: {old_instance.profile_image.path}")
					try:
						os.remove(old_instance.profile_image.path)
						logger.info("delete_old_profile_image: File eliminato con successo")
					except Exception as e:
						logger.error(f"delete_old_profile_image: Errore durante l'eliminazione del file: {str(e)}")
				else:
					logger.warning(f"delete_old_profile_image: File non trovato al percorso: {old_instance.profile_image.path}")
			else:
				logger.info("delete_old_profile_image: È l'immagine di default, non la elimino")
		else:
			logger.info("delete_old_profile_image: Nessuna differenza nelle immagini o immagine non presente")
	except UserProfile.DoesNotExist:
		logger.error(f"delete_old_profile_image: Profilo non trovato per pk={instance.pk}")
	except Exception as e:
		logger.error(f"delete_old_profile_image: Errore imprevisto: {str(e)}")

class UserProfile(models.Model):
	user = models.OneToOneField(User, on_delete=models.CASCADE, related_name='game_userprofile')
	profile_image = models.ImageField(
		upload_to=user_profile_image_path, 
		default='profile_pics/default.jpg',
		validators=[validate_image_size]
	)
	bio = models.TextField(
		blank=True, 
		max_length=500,
		validators=[MaxLengthValidator(500)]
	)
	display_name = models.CharField(
		max_length=50, 
		unique=True, 
		null=True,
		blank=True,
		validators=[MinLengthValidator(3), MaxLengthValidator(50)]
	)
	wins = models.IntegerField(default=0)
	losses = models.IntegerField(default=0)
	is_online = models.BooleanField(default=False)
	last_seen = models.DateTimeField(auto_now=True)
	# 2FA fields
	two_factor_enabled = models.BooleanField(default=False)
	two_factor_secret = models.CharField(max_length=32, null=True, blank=True)
	two_factor_backup_codes = models.TextField(null=True, blank=True)

	def save(self, *args, **kwargs):
		"""Override del metodo save per gestire l'eliminazione della vecchia immagine e impostare il display_name"""
		# Se il display_name non è impostato, usa lo username
		if not self.display_name:
			self.display_name = self.user.username

		if self.pk:  # Se l'istanza esiste già
			try:
				old_instance = UserProfile.objects.get(pk=self.pk)
				if old_instance.profile_image and old_instance.profile_image != self.profile_image:
					# Verifica che non sia l'immagine di default
					if old_instance.profile_image.name != 'profile_pics/default.jpg':
						if os.path.isfile(old_instance.profile_image.path):
							logger.info(f"Eliminazione vecchia immagine: {old_instance.profile_image.path}")
							os.remove(old_instance.profile_image.path)
							logger.info("Vecchia immagine eliminata con successo")
			except UserProfile.DoesNotExist:
				pass
		super().save(*args, **kwargs)

	def is_recently_active(self):
		"""Determina se l'utente è online negli ultimi 30 secondi"""
		from datetime import timedelta
		return self.last_seen >= now() - timedelta(seconds=30)
	
	@property
	def total_games(self):
		"""Ritorna il numero totale di partite giocate"""
		return self.wins + self.losses
	
	@property
	def win_ratio(self):
		"""Ritorna il rapporto vittorie/partite totali"""
		if self.total_games == 0:
			return 0
		return round((self.wins / self.total_games) * 100, 1)
	
	def clean(self):
		# Verifica che display_name sia diverso da username esistenti
		if self.display_name:
			if User.objects.filter(username__iexact=self.display_name).exists():
				raise ValidationError({'display_name': 'Questo nome è già in uso come username.'})

	def __str__(self):
		return self.user.username


class Channel(models.Model):
	name = models.CharField(max_length=255, unique=True)
	created_at = models.DateTimeField(auto_now_add=True)

	def __str__(self):
		return self.name

class MatchHistory(models.Model):
	user = models.ForeignKey(User, on_delete=models.CASCADE, related_name='matches')
	opponent = models.ForeignKey(User, null=True, blank=True, on_delete=models.SET_NULL)
	match_date = models.DateTimeField(auto_now_add=True)
	winner = models.ForeignKey(User, on_delete=models.CASCADE, related_name='won_matches', null=True, blank=True)
	loser = models.ForeignKey(User, on_delete=models.CASCADE, related_name='lost_matches', null=True, blank=True)
	score = models.CharField(max_length=50)
	opponent_is_bot = models.BooleanField(default=False)
	winner_is_bot = models.BooleanField(default=False)
	game_id = models.UUIDField(null=True, blank=True, help_text="Solo per partite remote")
	abandoned = models.BooleanField(default=False, help_text="Indica se la partita è stata abbandonata da un giocatore")
	is_tournament = models.BooleanField(default=False, help_text="Indica se la partita fa parte di un torneo")

	def __str__(self):
		return f"{self.user.username} vs {self.opponent.username if self.opponent else 'AI'} - {self.match_date}"


class Friendship(models.Model):
	user = models.ForeignKey(User, related_name='game_friendships', on_delete=models.CASCADE)  # Relazione semplificata
	friend = models.ForeignKey(User, related_name='game_friends', on_delete=models.CASCADE) # Relazione semplificata
	created_at = models.DateTimeField(auto_now_add=True)

	class Meta:
		unique_together = ('user', 'friend') # Impedisce amicizie duplicate

	def __str__(self):
		return f"{self.user.username} -> {self.friend.username}"


class FriendRequest(models.Model):
	sender = models.ForeignKey(User, related_name='friend_requests', on_delete=models.CASCADE)
	recipient = models.ForeignKey(User, related_name='received_friend_requests', on_delete=models.CASCADE)
	created_at = models.DateTimeField(auto_now_add=True)
	status = models.CharField(max_length=10, choices=[('pending', 'Pending'), ('accepted', 'Accepted'), ('declined', 'Declined')], default='pending')

	class Meta:
		unique_together = ('sender', 'recipient') # Impedisce richieste duplicate

	def __str__(self):
		return f"{self.sender} -> {self.recipient} ({self.status})"

class Tournament(models.Model):
	name = models.CharField(max_length=255)
	start_date = models.DateTimeField(auto_now_add=True)
	end_date = models.DateTimeField(null=True, blank=True)
	creator = models.ForeignKey(User, on_delete=models.CASCADE, related_name='game_tournaments')
	num_participants = models.IntegerField(default=0)
	max_participants = models.IntegerField(choices=[(4, '4'), (8, '8'), (16, '16')], default=4)
	status = models.CharField(max_length=20, choices=[
		('registration_open', 'Registration Open'),
		('in_progress', 'In Progress'), 
		('completed', 'Completed')
	], default='registration_open')
	winner_nickname = models.CharField(max_length=255, null=True, blank=True)

	def save(self, *args, **kwargs):
		super().save(*args, **kwargs)
		self.num_participants = self.participants.count()
		super().save(update_fields=['num_participants'])
	
	def conclude_tournament(self):
		self.status = 'completed'
		self.end_date = timezone.now()
		self.save()
		
	def start_tournament(self):
		"""Start the tournament if enough participants have registered"""
		if self.participants.count() == self.max_participants:
			self.status = 'in_progress'
		self.save()

class TournamentParticipant(models.Model):
	tournament = models.ForeignKey(Tournament, on_delete=models.CASCADE, related_name='participants')
	nickname = models.CharField(max_length=255)

	def save(self, *args, **kwargs):
		super().save(*args, **kwargs)
		self.tournament.num_participants = self.tournament.participants.count()
		self.tournament.save(update_fields=['num_participants'])
	
class TournamentMatch(models.Model):
	tournament = models.ForeignKey(Tournament, on_delete=models.CASCADE, related_name='matches')
	tournament_name = models.CharField(max_length=255, blank=True, null=True)  # Nome del torneo
	player_1 = models.ForeignKey(TournamentParticipant, on_delete=models.CASCADE, related_name='matches_as_player_1')
	player_2 = models.ForeignKey(TournamentParticipant, on_delete=models.CASCADE, related_name='matches_as_player_2')
	score_player_1 = models.IntegerField(default=0)
	score_player_2 = models.IntegerField(default=0)
	winner = models.ForeignKey(TournamentParticipant, on_delete=models.SET_NULL, null=True, blank=True, related_name='won_matches')
	round = models.IntegerField(default=1)  # Nuovo campo per indicare il turno

	def save(self, *args, **kwargs):
		# Quando salviamo il match, aggiorniamo il nome del torneo
		if self.tournament and (not self.tournament_name or self.tournament_name != self.tournament.name):
			self.tournament_name = self.tournament.name
		super().save(*args, **kwargs)

	def __str__(self):
		tournament_info = f"Torneo {self.tournament_name}" if self.tournament_name else f"Torneo {self.tournament.id}"
		return f"{tournament_info} - Turno {self.round}: {self.player_1.nickname} vs {self.player_2.nickname}"

def generate_uuid():
	new_uuid = uuid.uuid4()
	logger.info(f"UUID generato: {new_uuid}")
	return new_uuid

class GameSession(models.Model):
	id = models.UUIDField(primary_key=True, default=generate_uuid, editable=False)
	game_id = models.UUIDField(default=uuid.uuid4, unique=True)
	player1 = models.ForeignKey(User, on_delete=models.CASCADE, related_name="hosted_games")
	player2 = models.ForeignKey(User, on_delete=models.CASCADE, related_name="joined_games", null=True, blank=True)
	created_at = models.DateTimeField(auto_now_add=True)
	status = models.CharField(max_length=20, default="waiting")
	player1_username = models.CharField(max_length=255, null=True, blank=True)
	player2_username = models.CharField(max_length=255, null=True, blank=True)
	session_type = models.CharField(max_length=20, choices=[
		('tournament', 'Tournament Match'),
		('casual', 'Casual 1vs1')
	], default='casual')
	class Meta:
		db_table = 'remote_gamesession'
		
	def __str__(self):
		return f"gamesession {self.id}: {self.player1} vs {self.player2 if self.player2 else 'Waiting...'}"