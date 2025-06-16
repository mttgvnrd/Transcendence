from django.conf import settings
from rest_framework_simplejwt.authentication import JWTAuthentication
import logging

logger = logging.getLogger(__name__)

class CookieJWTAuthentication(JWTAuthentication):
    """
    Autenticazione JWT personalizzata che legge il token solo dai cookie HTTP-only.
    Questa classe sovrascrive il metodo get_raw_token della classe JWTAuthentication standard
    per leggere il token dal cookie invece che dall'header Authorization.
    """
    def get_raw_token(self, request):
        # Ignora completamente l'header Authorization
        # Ottieni il token dal cookie
        return request.COOKIES.get(settings.SIMPLE_JWT['AUTH_COOKIE'])

    def authenticate(self, request):
        raw_token = self.get_raw_token(request)
        if raw_token is None:
            return None
            
        try:
            validated_token = self.get_validated_token(raw_token)
            return self.get_user(validated_token), validated_token
        except Exception as e:
            # Log dell'errore per debug
            logger.error(f"Errore di autenticazione JWT cookie: {str(e)}")
            return None 