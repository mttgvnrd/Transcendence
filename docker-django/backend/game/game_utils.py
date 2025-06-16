# ✅ Qui niente import "a freddo"!

import logging
import uuid
from asgiref.sync import sync_to_async

logger = logging.getLogger(__name__)

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
def save_match_history(game_id, left_score, right_score, abandoned=False):
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

		# Crea il record per player1 (il creatore della sessione)
		match1 = MatchHistory.objects.create(
			user=player1,
			opponent=player2,
			winner=winner,
			loser=loser,
			score=f"{left_score}-{right_score}",
			opponent_is_bot=False,
			winner_is_bot=False,
			game_id=game_id,
			abandoned=abandoned,
			is_tournament=session.session_type == 'tournament'
		)

		# Crea un secondo record per player2 per assicurarsi che entrambi abbiano la partita nella loro storia
		if player2 and player1 != player2:  # Evita duplicati se ci fosse un solo giocatore
			match2 = MatchHistory.objects.create(
				user=player2,
				opponent=player1,
				winner=winner,
				loser=loser,
				score=f"{right_score}-{left_score}" if player1 == winner else f"{left_score}-{right_score}",
				opponent_is_bot=False,
				winner_is_bot=False,
				game_id=game_id,
				abandoned=abandoned,
				is_tournament=session.session_type == 'tournament'
			)

		# Aggiorna le statistiche del profilo
		if winner:
			profile = getattr(winner, 'game_userprofile', None)
			if profile:
				profile.wins += 1
				profile.save()
		
		if loser:
			profile = getattr(loser, 'game_userprofile', None)
			if profile:
				profile.losses += 1
				profile.save()

		logger.info(f"Match salvato correttamente per il game_id {game_id}. {'(Abbandonato)' if abandoned else ''} {'(Torneo)' if session.session_type == 'tournament' else ''}")
		return match1

	except Exception as e:
		logger.error(f"[DB ERROR] Impossibile salvare il match per il game_id {game_id}: {e}")
		import traceback
		logger.error(traceback.format_exc())
