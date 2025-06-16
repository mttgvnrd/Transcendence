from rest_framework import status
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework.permissions import IsAuthenticated
from .serializers import UserProfileSerializer, UserProfileDetailSerializer
from django.contrib.auth.models import User
from .models import UserProfile, MatchHistory
from rest_framework.parsers import MultiPartParser, FormParser, JSONParser
from .two_factor_utils import verify_token
import json

class UserAccountAPIView(APIView):
	"""
	API view per gestire i dettagli completi del profilo utente.
	GET: Ottieni tutti i dettagli del profilo
	PUT: Aggiorna i dettagli del profilo
	"""
	permission_classes = (IsAuthenticated,)
	parser_classes = (MultiPartParser, FormParser, JSONParser)

	def get(self, request, *args, **kwargs):
		try:
			user_profile = UserProfile.objects.get(user=request.user)
			serializer = UserProfileDetailSerializer(user_profile)
			return Response(serializer.data, status=status.HTTP_200_OK)
		except Exception as e:
			return Response({"detail": f"Errore nel recupero del profilo: {str(e)}"}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

	def put(self, request, *args, **kwargs):
		user_profile = UserProfile.objects.get(user=request.user)
		allowed_fields = ['bio', 'display_name', 'profile_image']
		data = {}
		for field in allowed_fields:
			if field in request.data:
				data[field] = request.data[field]
		serializer = UserProfileSerializer(user_profile, data=data, partial=True)
		if serializer.is_valid():
			serializer.save()
			detail_serializer = UserProfileDetailSerializer(user_profile)
			return Response(detail_serializer.data, status=status.HTTP_200_OK)
		return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

	def post(self, request, *args, **kwargs):
		return self.put(request, *args, **kwargs)
	
class DeleteAccountAPIView(APIView):
	"""
	API view per eliminare l'account dell'utente.
	Se l'utente ha 2FA abilitato, è necessario fornire un token valido o un codice di backup.
	"""
	permission_classes = (IsAuthenticated,)

	def post(self, request, *args, **kwargs):
		try:
			user = request.user
			user_profile = user.game_userprofile
			if user_profile.two_factor_enabled:
				token = request.data.get('token')
				backup_code = request.data.get('backup_code')
				
				if not token and not backup_code:
					return Response({
						'success': False,
						'error': 'È richiesto il token di autenticazione a due fattori o un codice di backup',
						'requires_2fa': True
					}, status=status.HTTP_400_BAD_REQUEST)
				
				if token:
					is_valid = verify_token(user_profile.two_factor_secret, token)
					if not is_valid:
						return Response({
							'success': False,
							'error': 'Token di autenticazione non valido',
							'requires_2fa': True
						}, status=status.HTTP_400_BAD_REQUEST)
				elif backup_code:
					try:
						backup_codes = json.loads(user_profile.two_factor_backup_codes)
						if backup_code not in backup_codes:
							return Response({
								'success': False,
								'error': 'Codice di backup non valido',
								'requires_2fa': True
							}, status=status.HTTP_400_BAD_REQUEST)
						# Rimuovi il codice di backup usato
						backup_codes.remove(backup_code)
						user_profile.two_factor_backup_codes = json.dumps(backup_codes)
						user_profile.save()
					except (json.JSONDecodeError, TypeError):
						return Response({
							'success': False,
							'error': 'Errore nella verifica del codice di backup',
							'requires_2fa': True
						}, status=status.HTTP_400_BAD_REQUEST)
			
			# Procedi con l'eliminazione dell'account
			user.delete()
			return Response({
				'success': True,
				'message': 'Account eliminato con successo'
			}, status=status.HTTP_200_OK)
		except Exception as e:
			return Response({
				'success': False,
				'error': f'Errore nell\'eliminazione dell\'account: {str(e)}'
			}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
		
class ProfileImageUploadAPIView(APIView):
	"""
	API view specifica per l'upload dell'immagine profilo.
	POST: Carica una nuova immagine del profilo
	"""
	permission_classes = (IsAuthenticated,)
	parser_classes = (MultiPartParser, FormParser)

	def post(self, request, *args, **kwargs):
		try:
			user_profile = UserProfile.objects.get(user=request.user)
			profile_image = None
			if 'profile_image' in request.data:
				profile_image = request.data['profile_image']
			elif 'profile_image' in request.FILES:
				profile_image = request.FILES['profile_image']
			elif len(request.FILES) > 0:
				key = list(request.FILES.keys())[0]
				profile_image = request.FILES[key]
			if not profile_image:
				return Response(
					{'detail': 'Immagine del profilo non fornita'},
					status=status.HTTP_400_BAD_REQUEST
				)
			user_profile.profile_image = profile_image
			user_profile.save()
			detail_serializer = UserProfileDetailSerializer(user_profile)
			return Response(detail_serializer.data, status=status.HTTP_200_OK)
		except Exception as e:
			return Response(
				{'detail': f'Errore durante il caricamento dell\'immagine: {str(e)}'},
				status=status.HTTP_500_INTERNAL_SERVER_ERROR
			)
		
class UsernameAPIView(APIView):
	"""
	API view per ottenere il nome utente dell'utente autenticato.
	"""
	permission_classes = (IsAuthenticated,)

	def get(self, request, *args, **kwargs):
		return Response({'username': request.user.username}, status=status.HTTP_200_OK)
	
class RecentMatchesAPIView(APIView):
	"""
	API per ottenere gli ultimi 5 match di un utente.
	"""
	permission_classes = [IsAuthenticated]

	def get(self, request):
		user = request.user
		recent_matches = MatchHistory.objects.filter(
			user=user
		).order_by('-match_date')[:5]
		matches_data = []
		for match in recent_matches:
			opponent_name = match.opponent.username if match.opponent else 'AI'
			is_winner = match.winner == user if match.winner else False
			matches_data.append({
				'id': match.id,
				'opponent': opponent_name,
				'result': 'Vittoria' if is_winner else 'Sconfitta',
				'score': match.score,
				'date': match.match_date.strftime('%d/%m/%Y'),
				'is_remote': match.game_id is not None,
				'abandoned': match.abandoned,
				'is_tournament': match.is_tournament,
				'type': 'Torneo' if match.is_tournament else ('Online' if match.game_id else 'Locale')
			})
		return Response(matches_data)