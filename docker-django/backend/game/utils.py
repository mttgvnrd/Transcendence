from django.http import HttpResponseRedirect
from django.urls import reverse
from django.contrib import messages
from functools import wraps
import logging
import time
import uuid
from asgiref.sync import sync_to_async

# Configurazione logger
logger = logging.getLogger(__name__)

def login_required_message(view_func):
	"""
	Un decoratore che estende il comportamento di login_required 
	aggiungendo un messaggio per l'utente se non autenticato.
	"""
	@wraps(view_func)
	def _wrapped_view(request, *args, **kwargs):
		if not request.user.is_authenticated:
			messages.warning(request, "Devi accedere per visualizzare questa pagina.")
			return HttpResponseRedirect(reverse('login'))
		return view_func(request, *args, **kwargs)
	return _wrapped_view

def log_execution_time(view_func):
	"""
	Un decoratore che registra il tempo di esecuzione di una vista.
	Utile per il debug delle prestazioni.
	"""
	@wraps(view_func)
	def _wrapped_view(request, *args, **kwargs):
		start_time = time.time()
		result = view_func(request, *args, **kwargs)
		execution_time = time.time() - start_time
		logger.debug(
			f"Execution time for {view_func.__name__}: {execution_time:.4f} seconds"
		)
		return result
	return _wrapped_view

def update_user_activity(view_func):
	"""
	Un decoratore che aggiorna lo stato online dell'utente.
	"""
	@wraps(view_func)
	def _wrapped_view(request, *args, **kwargs):
		if request.user.is_authenticated:
			profile = request.user.game_userprofile
			profile.is_online = True
			profile.save(update_fields=['is_online', 'last_seen'])
		return view_func(request, *args, **kwargs)
	return _wrapped_view

@sync_to_async
def find_available_game_session():
	from .models import GameSession  # Import protetto dentro funzione

	try:
		session = GameSession.objects.filter(status="waiting", player2__isnull=True).first()
		return session
	except Exception as e:
		logger.error(f"Errore nella ricerca di una sessione disponibile: {e}")
		return None

def create_new_game_session(player1_user):
	"""
	Crea una nuova sessione di gioco con il player1 specificato.

	Args:
		player1_user (User): L'utente che crea la sessione di gioco.

	Returns:
		GameSession: L'oggetto GameSession creato oppure None in caso di errore.
	"""
	from .models import GameSession  # Import protetto dentro funzione

	logger.info(f"Creazione di una nuova sessione di gioco per l'utente: {player1_user.username}")

	try:
		new_game = GameSession.objects.create(player1=player1_user, id=uuid.uuid4())
		logger.info(f"Nuova sessione di gioco creata con ID: {new_game.id}")
		return new_game
	except Exception as e:
		logger.error(f"Errore durante la creazione della sessione di gioco: {e}")
		return None

@sync_to_async
def save_match_history(game_id, left_score, right_score):
	from .models import GameSession, MatchHistory  # Import protetto dentro funzione

	try:
		session = GameSession.objects.filter(game_id=game_id).first()
		if not session:
			logger.warning(f"Sessione di gioco con ID {game_id} non trovata.")
			return

		player1 = session.player1
		player2 = session.player2

		winner = None
		loser = None

		if left_score > right_score:
			winner = player1
			loser = player2
		elif right_score > left_score:
			winner = player2
			loser = player1

		MatchHistory.objects.create(
			user=player1,
			opponent=player2,
			winner=winner,
			loser=loser,
			score=f"{left_score}-{right_score}",
			opponent_is_bot=False,
			winner_is_bot=False,
			game_id=game_id
		)

		if winner:
			winner.game_userprofile.wins += 1
			winner.game_userprofile.save()
		if loser:
			loser.game_userprofile.losses += 1
			loser.game_userprofile.save()

		logger.info(f"Match salvato correttamente per il game_id {game_id}.")

	except Exception as e:
		logger.error(f"[DB ERROR] Impossibile salvare il match per il game_id {game_id}: {e}") 