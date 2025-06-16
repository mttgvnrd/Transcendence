from rest_framework import status
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework.permissions import AllowAny, IsAuthenticated
from .serializers import UserRegistrationSerializer, UserProfileSerializer, UserLoginSerializer
from django.contrib.auth.models import User
from .models import UserProfile
from rest_framework.parsers import MultiPartParser, FormParser, JSONParser
from rest_framework_simplejwt.tokens import RefreshToken
from django.conf import settings
from django.http import JsonResponse
from django.views.decorators.csrf import ensure_csrf_cookie
from django.utils.decorators import method_decorator
import logging
import json
from .two_factor_utils import generate_secret_key, generate_qr_code, verify_token, generate_backup_codes


class UserRegistrationAPIView(APIView):
	"""
	API view per la registrazione di nuovi utenti.
	POST: Crea un nuovo utente con il relativo profilo
	"""
	permission_classes = (AllowAny,)
	parser_classes = (MultiPartParser, FormParser, JSONParser)

	def post(self, request, *args, **kwargs):
		serializer = UserRegistrationSerializer(data=request.data)
		if serializer.is_valid():
			user = serializer.save()
			user_profile = UserProfile.objects.get(user=user)
			profile_serializer = UserProfileSerializer(user_profile)
			return Response(
				{
					"user": {
						"id": user.id,
						"username": user.username,
						"email": user.email
					},
					"profile": profile_serializer.data,
					"message": "Utente registrato con successo!"
				},
				status=status.HTTP_201_CREATED
			)
		return Response(serializer.errors)
    
class UserLoginAPIView(APIView):
	"""
	API view per il login degli utenti.
	POST: Verifica le credenziali e restituisce un token JWT in cookie HttpOnly
	"""
	permission_classes = (AllowAny,)
	serializer_class = UserLoginSerializer

	def post(self, request, *args, **kwargs):
		serializer = self.serializer_class(data=request.data)
		if serializer.is_valid():
			user = serializer.validated_data['user']
			has_2fa = False
			try:
				user_profile = user.game_userprofile
				has_2fa = user_profile.two_factor_enabled
			except Exception as e:
				logger = logging.getLogger(__name__)
			if has_2fa:
				temp_refresh = RefreshToken.for_user(user)
				temp_refresh['is_2fa_session'] = True
				response = Response({
					"detail": "Autenticazione a due fattori richiesta",
					"requires_2fa": True,
					"user": {
						"id": user.id,
						"username": user.username,
					},
				}, status=status.HTTP_200_OK)
				response.set_cookie(
					key='temp_2fa_token',
					value=str(temp_refresh.access_token),
					expires=settings.SIMPLE_JWT['ACCESS_TOKEN_LIFETIME'],
					secure=settings.SIMPLE_JWT['AUTH_COOKIE_SECURE'],
					httponly=settings.SIMPLE_JWT['AUTH_COOKIE_HTTP_ONLY'],
					samesite=settings.SIMPLE_JWT['AUTH_COOKIE_SAMESITE'],
					path=settings.SIMPLE_JWT['AUTH_COOKIE_PATH'],
				)
				return response
			refresh = RefreshToken.for_user(user)
			response = Response({
				"detail": "Login effettuato con successo",
				"requires_2fa": False,
				"user": {
					"id": user.id,
					"username": user.username,
					"email": user.email
				},
			}, status=status.HTTP_200_OK)
			response.set_cookie(
				key=settings.SIMPLE_JWT['AUTH_COOKIE'],
				value=str(refresh.access_token),
				expires=settings.SIMPLE_JWT['ACCESS_TOKEN_LIFETIME'],
				secure=settings.SIMPLE_JWT['AUTH_COOKIE_SECURE'],
				httponly=settings.SIMPLE_JWT['AUTH_COOKIE_HTTP_ONLY'],
				samesite=settings.SIMPLE_JWT['AUTH_COOKIE_SAMESITE'],
				path=settings.SIMPLE_JWT['AUTH_COOKIE_PATH'],
			)
			response.set_cookie(
				key=settings.SIMPLE_JWT['AUTH_COOKIE_REFRESH'],
				value=str(refresh),
				expires=settings.SIMPLE_JWT['REFRESH_TOKEN_LIFETIME'],
				secure=settings.SIMPLE_JWT['AUTH_COOKIE_SECURE'],
				httponly=settings.SIMPLE_JWT['AUTH_COOKIE_HTTP_ONLY'],
				samesite=settings.SIMPLE_JWT['AUTH_COOKIE_SAMESITE'],
				path=settings.SIMPLE_JWT['AUTH_COOKIE_PATH'],
			)
			return response
		return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

class CookieTokenRefreshView(APIView):
	"""
	API view per il refresh del token JWT usando il refresh token in cookie HttpOnly
	POST: Rinnova il token di accesso usando il refresh token
	"""
	permission_classes = (AllowAny,)

	def post(self, request, *args, **kwargs):
		refresh_token = request.COOKIES.get(settings.SIMPLE_JWT['AUTH_COOKIE_REFRESH'])
		if refresh_token is None:
			return Response({"detail": "Refresh token non trovato"}, status=status.HTTP_400_BAD_REQUEST)
		try:
			refresh = RefreshToken(refresh_token)
			access_token = refresh.access_token
			response = Response({
				"detail": "Token aggiornato con successo",
			}, status=status.HTTP_200_OK)
			response.set_cookie(
				key=settings.SIMPLE_JWT['AUTH_COOKIE'],
				value=str(access_token),
				expires=settings.SIMPLE_JWT['ACCESS_TOKEN_LIFETIME'],
				secure=settings.SIMPLE_JWT['AUTH_COOKIE_SECURE'],
				httponly=settings.SIMPLE_JWT['AUTH_COOKIE_HTTP_ONLY'],
				samesite=settings.SIMPLE_JWT['AUTH_COOKIE_SAMESITE'],
				path=settings.SIMPLE_JWT['AUTH_COOKIE_PATH'],
			)
			if settings.SIMPLE_JWT['ROTATE_REFRESH_TOKENS']:
				response.set_cookie(
					key=settings.SIMPLE_JWT['AUTH_COOKIE_REFRESH'],
					value=str(refresh),
					expires=settings.SIMPLE_JWT['REFRESH_TOKEN_LIFETIME'],
					secure=settings.SIMPLE_JWT['AUTH_COOKIE_SECURE'],
					httponly=settings.SIMPLE_JWT['AUTH_COOKIE_HTTP_ONLY'],
					samesite=settings.SIMPLE_JWT['AUTH_COOKIE_SAMESITE'],
					path=settings.SIMPLE_JWT['AUTH_COOKIE_PATH'],
				)
			return response
		except Exception as e:
			return Response({"detail": f"Token non valido o scaduto: {str(e)}"}, status=status.HTTP_401_UNAUTHORIZED)

class LogoutView(APIView):
	"""
	API view per effettuare il logout
	POST: Elimina i cookie di autenticazione
	"""
	permission_classes = (AllowAny,)

	def post(self, request, *args, **kwargs):
		response = Response({"detail": "Logout effettuato con successo"}, status=status.HTTP_200_OK)
		for cookie_name in [settings.SIMPLE_JWT['AUTH_COOKIE'], settings.SIMPLE_JWT['AUTH_COOKIE_REFRESH'], 'csrftoken']:
			response.delete_cookie(
				cookie_name,
				path='/',
				domain=None,
				samesite=settings.SIMPLE_JWT['AUTH_COOKIE_SAMESITE']
			)
		return response

class GetCSRFTokenView(APIView):
	"""
	API view per ottenere il CSRF token
	GET: Restituisce il CSRF token
	"""
	permission_classes = (AllowAny,)

	@method_decorator(ensure_csrf_cookie)
	def get(self, request, *args, **kwargs):
		return JsonResponse({'message': 'CSRF token generato'})

class CheckAuthStatus(APIView):
	"""
	API view per verificare lo stato di autenticazione dell'utente
	GET: Restituisce lo stato di autenticazione dell'utente
	"""
	permission_classes = (AllowAny,)

	def get(self, request, *args, **kwargs):
		if request.user.is_authenticated:
			return JsonResponse({
				'isAuthenticated': True,
				'username': request.user.username
			})
		else:
			return JsonResponse({'isAuthenticated': False})

class GetAccessToken(APIView):
	"""
	API view per ottenere il token di accesso
	GET: Restituisce il token di accesso
	"""
	permission_classes = (AllowAny,)

	def get(self, request, *args, **kwargs):
		if request.user.is_authenticated:
			access_token = request.COOKIES.get(settings.SIMPLE_JWT['AUTH_COOKIE'])
			if access_token:
				return JsonResponse({
					'token': access_token
				})
		return JsonResponse({'token': None}, status=401)

class Setup2FAAPIView(APIView):
	"""
	API view for setting up two-factor authentication.
	POST: Generate and return 2FA secret key, QR code, and backup codes
	"""
	permission_classes = (IsAuthenticated,)

	def post(self, request, *args, **kwargs):
		try:
			user_profile = request.user.game_userprofile
			if not user_profile.two_factor_enabled:
				secret_key = generate_secret_key()
				qr_code = generate_qr_code(secret_key, request.user.username)
				backup_codes = generate_backup_codes()
				user_profile.two_factor_secret = secret_key
				user_profile.two_factor_backup_codes = json.dumps(backup_codes)
				user_profile.save()
				return Response({
					'success': True,
					'qr_code': qr_code,
					'backup_codes': backup_codes
				}, status=status.HTTP_200_OK)
			return Response({
				'success': False, 
				'error': '2FA already enabled'
			}, status=status.HTTP_400_BAD_REQUEST)
		except Exception as e:
			return Response({
				'success': False,
				'error': f'Errore nella configurazione di 2FA: {str(e)}'
			}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

class Verify2FAAPIView(APIView):
	"""
	API view per verificare il token 2FA durante la configurazione iniziale.
	POST: Verifica il token e attiva 2FA per l'utente
	"""
	permission_classes = (IsAuthenticated,)

	def post(self, request, *args, **kwargs):
		try:
			user_profile = request.user.game_userprofile
			token = request.data.get('token')
			if not token:
				return Response({
					'success': False,
					'error': 'Token non fornito'
				}, status=status.HTTP_200_OK)
			if not user_profile.two_factor_secret:
				return Response({
					'success': False,
					'error': 'Configurazione 2FA non inizializzata'
				}, status=status.HTTP_200_OK)
			is_valid = verify_token(user_profile.two_factor_secret, token)
			if is_valid:
				user_profile.two_factor_enabled = True
				user_profile.save()
				return Response({
					'success': True,
					'message': 'Autenticazione a due fattori attivata con successo'
				}, status=status.HTTP_200_OK)
			else:
				backup_codes_json = request.data.get('backup_codes')
				if backup_codes_json and user_profile.two_factor_backup_codes:
					try:
						backup_codes = json.loads(user_profile.two_factor_backup_codes)
						if token in backup_codes:
							backup_codes.remove(token)
							user_profile.two_factor_backup_codes = json.dumps(backup_codes)
							user_profile.two_factor_enabled = True
							user_profile.save()
							return Response({
								'success': True,
								'message': 'Autenticazione a due fattori attivata con successo usando un backup code'
							}, status=status.HTTP_200_OK)
					except json.JSONDecodeError:
						pass
				return Response({
					'success': False,
					'error': 'Codice di verifica non valido. Per favore, riprova con un codice valido.'
				}, status=status.HTTP_200_OK)
		except Exception as e:
			return Response({
				'success': False,
				'error': f'Errore nella verifica del token 2FA: {str(e)}'
			}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
		
class Verify2FALoginAPIView(APIView):
	"""
	API view per verificare il token 2FA durante il login.
	POST: Verifica il token 2FA e completa il processo di login
	"""
	permission_classes = (AllowAny,)

	def post(self, request, *args, **kwargs):
		try:
			temp_token = request.COOKIES.get('temp_2fa_token')
			if not temp_token:
				return Response({
					'success': False,
					'error': 'Sessione di verifica 2FA non valida'
				}, status=status.HTTP_401_UNAUTHORIZED)
			token = request.data.get('token')
			if not token:
				return Response({
					'success': False,
					'error': 'Token 2FA non fornito'
				}, status=status.HTTP_400_BAD_REQUEST)
			try:
				from rest_framework_simplejwt.tokens import AccessToken
				decoded_token = AccessToken(temp_token)
				user_id = decoded_token['user_id']
				if not decoded_token.get('is_2fa_session', False):
					return Response({
						'success': False,
						'error': 'Token non valido per la verifica 2FA'
					}, status=status.HTTP_401_UNAUTHORIZED)
				from django.contrib.auth.models import User
				user = User.objects.get(id=user_id)
				user_profile = user.game_userprofile
				is_valid = verify_token(user_profile.two_factor_secret, token)
				if is_valid:
					refresh = RefreshToken.for_user(user)
					response = Response({
						'success': True,
						'detail': 'Login completato con successo',
						'user': {
							'id': user.id,
							'username': user.username,
							'email': user.email
						}
					}, status=status.HTTP_200_OK)
					response.set_cookie(
						key=settings.SIMPLE_JWT['AUTH_COOKIE'],
						value=str(refresh.access_token),
						expires=settings.SIMPLE_JWT['ACCESS_TOKEN_LIFETIME'],
						secure=settings.SIMPLE_JWT['AUTH_COOKIE_SECURE'],
						httponly=settings.SIMPLE_JWT['AUTH_COOKIE_HTTP_ONLY'],
						samesite=settings.SIMPLE_JWT['AUTH_COOKIE_SAMESITE'],
						path=settings.SIMPLE_JWT['AUTH_COOKIE_PATH'],
					)
					response.set_cookie(
						key=settings.SIMPLE_JWT['AUTH_COOKIE_REFRESH'],
						value=str(refresh),
						expires=settings.SIMPLE_JWT['REFRESH_TOKEN_LIFETIME'],
						secure=settings.SIMPLE_JWT['AUTH_COOKIE_SECURE'],
						httponly=settings.SIMPLE_JWT['AUTH_COOKIE_HTTP_ONLY'],
						samesite=settings.SIMPLE_JWT['AUTH_COOKIE_SAMESITE'],
						path=settings.SIMPLE_JWT['AUTH_COOKIE_PATH'],
					)
					response.delete_cookie('temp_2fa_token')
					return response
				else:
					if user_profile.two_factor_backup_codes:
						try:
							backup_codes = json.loads(user_profile.two_factor_backup_codes)
							if token in backup_codes:
								backup_codes.remove(token)
								user_profile.two_factor_backup_codes = json.dumps(backup_codes)
								user_profile.save()
								refresh = RefreshToken.for_user(user)
								response = Response({
									'success': True,
									'detail': 'Login completato con successo usando un backup code',
									'user': {
										'id': user.id,
										'username': user.username,
										'email': user.email
									}
								}, status=status.HTTP_200_OK)
								response.set_cookie(
									key=settings.SIMPLE_JWT['AUTH_COOKIE'],
									value=str(refresh.access_token),
									expires=settings.SIMPLE_JWT['ACCESS_TOKEN_LIFETIME'],
									secure=settings.SIMPLE_JWT['AUTH_COOKIE_SECURE'],
									httponly=settings.SIMPLE_JWT['AUTH_COOKIE_HTTP_ONLY'],
									samesite=settings.SIMPLE_JWT['AUTH_COOKIE_SAMESITE'],
									path=settings.SIMPLE_JWT['AUTH_COOKIE_PATH'],
								)
								response.set_cookie(
									key=settings.SIMPLE_JWT['AUTH_COOKIE_REFRESH'],
									value=str(refresh),
									expires=settings.SIMPLE_JWT['REFRESH_TOKEN_LIFETIME'],
									secure=settings.SIMPLE_JWT['AUTH_COOKIE_SECURE'],
									httponly=settings.SIMPLE_JWT['AUTH_COOKIE_HTTP_ONLY'],
									samesite=settings.SIMPLE_JWT['AUTH_COOKIE_SAMESITE'],
									path=settings.SIMPLE_JWT['AUTH_COOKIE_PATH'],
								)
								response.delete_cookie('temp_2fa_token')
								return response
						except json.JSONDecodeError:
							pass
					return Response({
						'success': False,
						'error': 'Token 2FA non valido'
					}, status=status.HTTP_401_UNAUTHORIZED)
			except Exception as e:
				return Response({
					'success': False,
					'error': f'Errore nella verifica del token: {str(e)}'
				}, status=status.HTTP_401_UNAUTHORIZED)
		except Exception as e:
			return Response({
				'success': False,
				'error': 'Errore nella verifica dell\'autenticazione a due fattori'
			}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

class Disable2FAAPIView(APIView):
	"""
	API view per disabilitare l'autenticazione a due fattori.
	POST: Disabilita 2FA per l'utente autenticato dopo la verifica del token o del codice di backup
	"""
	permission_classes = (IsAuthenticated,)

	def post(self, request, *args, **kwargs):
		try:
			user_profile = request.user.game_userprofile
			if user_profile.two_factor_enabled:
				token = request.data.get('token')
				backup_code = request.data.get('backup_code')
				
				if not token and not backup_code:
					return Response({
						'success': False,
						'error': 'È richiesto il token di autenticazione a due fattori o un codice di backup'
					}, status=status.HTTP_400_BAD_REQUEST)
				
				if token:
					is_valid = verify_token(user_profile.two_factor_secret, token)
					if not is_valid:
						return Response({
							'success': False,
							'error': 'Token di autenticazione non valido'
						}, status=status.HTTP_400_BAD_REQUEST)
				elif backup_code:
					try:
						backup_codes = json.loads(user_profile.two_factor_backup_codes)
						if backup_code not in backup_codes:
							return Response({
								'success': False,
								'error': 'Codice di backup non valido'
							}, status=status.HTTP_400_BAD_REQUEST)
						# Rimuovi il codice di backup usato
						backup_codes.remove(backup_code)
						user_profile.two_factor_backup_codes = json.dumps(backup_codes)
					except (json.JSONDecodeError, TypeError):
						return Response({
							'success': False,
							'error': 'Errore nella verifica del codice di backup'
						}, status=status.HTTP_400_BAD_REQUEST)
				
				# Disabilita 2FA
				user_profile.two_factor_enabled = False
				user_profile.two_factor_secret = None
				user_profile.two_factor_backup_codes = None
				user_profile.save()
				
				return Response({
					'success': True,
					'message': 'Autenticazione a due fattori disattivata con successo'
				}, status=status.HTTP_200_OK)
			else:
				return Response({
					'success': False,
					'error': 'L\'autenticazione a due fattori non è attualmente abilitata'
				}, status=status.HTTP_400_BAD_REQUEST)
		except Exception as e:
			return Response({
				'success': False,
				'error': f'Errore durante la disattivazione dell\'autenticazione a due fattori: {str(e)}'
			}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)