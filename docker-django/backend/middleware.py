from django.conf import settings
from django.utils.functional import SimpleLazyObject
from channels.middleware import BaseMiddleware
from channels.db import database_sync_to_async
from channels.sessions import CookieMiddleware, SessionMiddleware
import logging

# Configura il logger
logger = logging.getLogger(__name__)

def get_user_from_cookie(request):
    """
    Recupera l'utente dal cookie JWT
    """
    # Importa qui per evitare problemi di inizializzazione circolare
    from django.contrib.auth.models import AnonymousUser
    from rest_framework_simplejwt.authentication import JWTAuthentication
    from rest_framework_simplejwt.exceptions import InvalidToken, TokenError
    
    user = None
    auth_cookie = request.COOKIES.get(settings.SIMPLE_JWT['AUTH_COOKIE'], None)
    
    if auth_cookie:
        # Autenticazione tramite JWT
        jwt_auth = JWTAuthentication()
        
        try:
            # Il token nel cookie è già nel formato corretto, non serve aggiungere "Bearer"
            validated_token = jwt_auth.get_validated_token(auth_cookie)
            user = jwt_auth.get_user(validated_token)
            logger.debug(f"Utente autenticato: {user.username if user else 'Nessuno'}")
        except (InvalidToken, TokenError) as e:
            # Log dell'errore per debug
            logger.error(f"Errore di autenticazione JWT: {str(e)}")
            pass
    else:
        logger.debug("Nessun cookie JWT trovato")
            
    return user or AnonymousUser()

class JWTCookieAuthenticationMiddleware:
    """
    Middleware per autenticare l'utente tramite JWT in cookie
    """
    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        # Prima dell'esecuzione della view
        request.user = SimpleLazyObject(lambda: get_user_from_cookie(request))
        
        # Esecuzione della view
        response = self.get_response(request)
        
        # Dopo l'esecuzione della view
        return response

@database_sync_to_async
def get_user_from_websocket_scope(scope):
    """
    Recupera l'utente dal cookie JWT presente nella scope del WebSocket
    """
    from django.contrib.auth.models import AnonymousUser, User
    from rest_framework_simplejwt.authentication import JWTAuthentication
    from rest_framework_simplejwt.exceptions import InvalidToken, TokenError

    if "headers" not in scope:
        return AnonymousUser()

    # Cerca il cookie nei header della richiesta WebSocket
    cookies = {}
    for header in scope.get("headers", []):
        if header[0].decode('utf-8') == 'cookie':
            cookie_str = header[1].decode('utf-8')
            for item in cookie_str.split('; '):
                if '=' in item:
                    key, value = item.split('=', 1)
                    cookies[key] = value

    access_token = cookies.get(settings.SIMPLE_JWT['AUTH_COOKIE'])
    
    if not access_token:
        logger.warning("[WEBSOCKET AUTH] Token JWT non trovato")
        return AnonymousUser()
    
    # Verifica il token
    try:
        jwt_auth = JWTAuthentication()
        validated_token = jwt_auth.get_validated_token(access_token)
        user = jwt_auth.get_user(validated_token)
        logger.info(f"[WEBSOCKET AUTH] Utente autenticato: {user.username}")
        return user
    except Exception as e:
        logger.error(f"[WEBSOCKET AUTH] Errore di autenticazione: {str(e)}")
        return AnonymousUser()

class JWTAuthMiddleware(BaseMiddleware):
    """
    Middleware personalizzato per Channels che autentica le connessioni WebSocket tramite JWT
    """
    async def __call__(self, scope, receive, send):
        # Assicuriamo che lo scope contenga una sessione anche se non c'è
        if 'session' not in scope:
            logger.warning("[JWT AUTH] Sessione mancante nello scope, ne aggiungo una vuota")
            scope['session'] = {}
            
        # Aggiungiamo l'utente allo scope
        scope['user'] = await get_user_from_websocket_scope(scope)
        return await super().__call__(scope, receive, send)

def JWTAuthMiddlewareStack(inner):
    """
    Middleware stack che autentica le connessioni WebSocket tramite JWT
    e aggiunge la sessione
    """
    # Utilizziamo CookieMiddleware e SessionMiddleware per aggiungere il supporto alle sessioni
    return CookieMiddleware(
        SessionMiddleware(
            JWTAuthMiddleware(inner)
        )
    )