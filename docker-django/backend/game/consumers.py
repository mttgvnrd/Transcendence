import json
import uuid
import logging
import asyncio
import math 
import random
import datetime
from channels.generic.websocket import AsyncJsonWebsocketConsumer
from asgiref.sync import sync_to_async
from backend.game.game_utils import create_new_game_session
import time

# WebSockets, un protocollo che consente la comunicazione bidirezionale a bassa latenza.

logger = logging.getLogger(__name__)
logger.setLevel(logging.DEBUG)

from asgiref.sync import sync_to_async

# Tutta la logica viene passata a una funzione sincrona
@sync_to_async
def create_game_session(game_id, player1_scope, player2_scope):
	from .models import GameSession  # 👈 Import locale, ok
	from django.contrib.auth.models import User
	from django.db import IntegrityError
	
	player1_user = player1_scope.get("user") if player1_scope and "user" in player1_scope else None
	player2_user = player2_scope.get("user") if player2_scope and "user" in player2_scope else None
	
	# Verifica che gli utenti siano autenticati
	if player1_user and not player1_user.is_authenticated:
		player1_user = None
	if player2_user and not player2_user.is_authenticated:
		player2_user = None

	existing = GameSession.objects.filter(game_id=game_id).first()
	if existing:
		logger.warning(f"[CREATE SESSION] Sessione già esistente per game_id: {game_id}")
		return existing

	try:
		session = GameSession.objects.create(
			game_id=game_id,
			player1=player1_user,
			player2=player2_user,
			status="active"
		)
		logger.info(f"[CREATE SESSION] Salvata sessione: {session}")
		return session
	except IntegrityError as e:
		logger.error(f"[CREATE SESSION] Errore di integrità: {e}")
		return None

# Funzioni helper per la gestione dello stato utente
@sync_to_async
def set_user_online(user):
	from .models import UserProfile
	if user.is_authenticated:
		profile, created = UserProfile.objects.get_or_create(user=user)
		profile.is_online = True
		profile.save(update_fields=['is_online', 'last_seen'])
		# logger.info(f"[USER STATUS] Utente {user.username} impostato come online")
		return True
	return False

@sync_to_async
def set_user_offline(user):
	from .models import UserProfile
	if user.is_authenticated:
		profile, created = UserProfile.objects.get_or_create(user=user)
		profile.is_online = False
		profile.save(update_fields=['is_online', 'last_seen'])
		# logger.info(f"[USER STATUS] Utente {user.username} impostato come offline")
		return True
	return False

@sync_to_async
def get_online_users():
	from .models import UserProfile
	from django.contrib.auth.models import User
	
	online_profiles = UserProfile.objects.filter(is_online=True)
	return [
		{
			'id': profile.user.id,
			'username': profile.user.username,
			'display_name': profile.display_name or profile.user.username
		}
		for profile in online_profiles
	]

# Aggiungo la nuova classe per gestire lo stato dell'utente
class UserStatusConsumer(AsyncJsonWebsocketConsumer):
	"""
	Consumer per tracciare lo stato online/offline degli utenti.
	Apre una connessione dopo il login e la chiude quando l'utente si disconnette.
	"""
	connected_users = set()  # Memorizza gli ID delle connessioni attive
	user_connections = {}    # Dizionario per tracciare le connessioni multiple per utente

	async def connect(self):
		user = self.scope["user"]
		if not user.is_authenticated:
			# logger.warning("[USER STATUS] Tentativo di connessione da utente non autenticato")
			await self.close()
			return
		
		# Accetta la connessione WebSocket
		await self.accept()
		# logger.info(f"[USER STATUS] Connessione accettata per {user.username}")
		
		# Aggiungi l'utente al gruppo per ricevere aggiornamenti sullo stato
		await self.channel_layer.group_add(
			"user_status",
			self.channel_name
		)
		
		# Aggiungi questa connessione all'utente (gestisce connessioni multiple dallo stesso utente)
		if user.id not in self.user_connections:
			self.user_connections[user.id] = set()
		self.user_connections[user.id].add(self.channel_name)
		
		# Imposta l'utente come online solo se è il primo a connettersi
		if user.id not in self.connected_users:
			# Imposta l'utente come online
			success = await set_user_online(user)
			if success:
				# Aggiungi l'utente al set di utenti connessi
				self.connected_users.add(user.id)
				
				# logger.info(f"[USER STATUS] Utente {user.username} (ID: {user.id}) impostato come ONLINE")
				
				# Invia un aggiornamento a tutti gli utenti connessi sullo stato di questo utente
				await self.channel_layer.group_send(
					"user_status",
					{
						"type": "status_update",
						"user_id": user.id,
						"username": user.username,
						"status": "online"
					}
				)
		# else:
			# logger.info(f"[USER STATUS] Utente {user.username} (ID: {user.id}) già online, nuova connessione aggiunta")
		
		# Ottieni e invia la lista completa degli utenti online all'utente appena connesso
		online_users = await get_online_users()
		# logger.info(f"[USER STATUS] Invio lista utenti online a {user.username}: {[u['username'] for u in online_users]}")
		await self.send_json({
			"type": "online_users",
			"users": online_users
		})
		
		# Invia anche la lista completa degli utenti online a tutti i client
		# Questo assicura che tutti abbiano una visione consistente
		online_users = await get_online_users()
		await self.channel_layer.group_send(
			"user_status",
			{
				"type": "send_online_users",
				"users": online_users
			}
		)

	async def disconnect(self, close_code):
		user = self.scope["user"]
		if user.is_authenticated:
			# Rimuovi questa connessione dall'utente
			if user.id in self.user_connections:
				self.user_connections[user.id].discard(self.channel_name)
				
				# Verifica se ci sono ancora altre connessioni attive per questo utente
				if not self.user_connections[user.id]:
					# Nessuna connessione rimasta, imposta l'utente come offline
					del self.user_connections[user.id]
					
					# Imposta l'utente come offline
					await set_user_offline(user)
					
					# Rimuovi l'utente dal set di utenti connessi
					if user.id in self.connected_users:
						self.connected_users.remove(user.id)
					
					# logger.info(f"[USER STATUS] Utente {user.username} (ID: {user.id}) impostato come OFFLINE - nessuna connessione attiva")
					
					# Invia un aggiornamento a tutti gli utenti connessi
					await self.channel_layer.group_send(
						"user_status",
						{
							"type": "status_update",
							"user_id": user.id,
							"username": user.username,
							"status": "offline"
						}
					)
					
					# Invia anche la lista completa degli utenti online a tutti i client
					# dopo che questo utente è stato disconnesso
					online_users = await get_online_users()
					await self.channel_layer.group_send(
						"user_status",
						{
							"type": "send_online_users",
							"users": online_users
						}
					)
				# else:
					# logger.info(f"[USER STATUS] Utente {user.username} (ID: {user.id}) ancora online - rimangono {len(self.user_connections[user.id])} connessioni attive")
			
			# Rimuovi l'utente dal gruppo
			await self.channel_layer.group_discard(
				"user_status",
				self.channel_name
			)
			
			# logger.info(f"[USER STATUS] Connessione di {user.username} chiusa")

	async def receive_json(self, content):
		"""
		Gestisce i messaggi ricevuti dal client.
		Al momento non c'è bisogno di gestire messaggi specifici.
		"""
		# Aggiungiamo un handler per richieste di aggiornamento esplicite
		if content.get("type") == "request_online_users":
			# logger.info("[USER STATUS] Richiesta aggiornamento lista utenti online ricevuta")
			await self.broadcast_online_users()

	async def status_update(self, event):
		"""
		Invia aggiornamenti sullo stato degli utenti ai client connessi.
		"""
		await self.send_json({
			"type": "status_update",
			"user_id": event["user_id"],
			"username": event["username"],
			"status": event["status"]
		})
		
	async def broadcast_online_users(self, event=None):
		"""
		Ottiene la lista degli utenti online dal database e la invia a tutti i client.
		Questo garantisce che tutti i client abbiano la stessa visione degli utenti online.
		"""
		# Se viene chiamato direttamente (non come handler di un evento)
		if event is None:
			# Ottieni la lista degli utenti online
			online_users = await get_online_users()
			
			# Invia la lista a tutti i client connessi nel gruppo
			await self.channel_layer.group_send(
				"user_status",
				{
					"type": "send_online_users",
					"users": online_users
				}
			)
		# Se è chiamato come handler di un evento, non fa nulla
		# perché verrà gestito da send_online_users
		
	async def send_online_users(self, event):
		"""
		Riceve la lista degli utenti online dall'evento e la invia al client.
		Questo metodo viene chiamato su ogni consumer connesso al gruppo.
		"""
		await self.send_json({
			"type": "online_users",
			"users": event["users"]
		})

class Game: ## Definisco la classe, il costruttore accetta un game_id opzionale.
	def __init__(self, game_id=None, channel_layer=None): # si potrebbe usare la var. (object)
		if game_id:
			try:
				self.game_id = uuid.UUID(str(game_id))  # Converte in stringa prima di creare UUID
				logger.info(f"[GAME] Utilizzo del game_id fornito: {self.game_id}")
			except ValueError:
				self.game_id = uuid.uuid4() # Genera un nuovo game_id casuale se game_id non è valido.
				logger.warning(f"[GAME] game_id fornito non valido, generato nuovo game_id: {self.game_id}")
		else:
			self.game_id = uuid.uuid4() # game_id == null
			logger.info(f"[GAME] game_id non fornito, generato nuovo game_id: {self.game_id}")

		self.players = [] # Inizializza una lista vuota per memorizzare i websocket dei giocatori.
		self.state = { # Inizializza lo stato del gioco con posizioni, velocità e punteggi iniziali.
			"ball_position": {"x": 0.5, "y": 0.5},
			"ball_velocity": {"x": 0.01, "y": 0.01},
			"paddles": {"left": 0.5, "right": 0.5},
			"scores": {"left": 0, "right": 0},
		}
		
		# Inizializza la variabile game_started a False all'inizio
		self.game_started = False
		
		# Posizioni dei paddle
		self.paddle_positions = {"left": 0.0, "right": 1.0}
		
		# Aggiungi lock per proteggere lo stato da accessi concorrenti
		self.lock = asyncio.Lock()
		
		# Channel layer per la comunicazione
		self.channel_layer = channel_layer
		
		# Inizializza i riferimenti ai giocatori
		self.player1 = None  # Controlla il paddle di sinistra
		self.player2 = None  # Controlla il paddle di destra

		# Inizializza lo stato di connessione dei giocatori
		self.player1_connected = False
		self.player2_connected = False

		self.paddle_positions = {"left": 0.02, "right": 0.98}

		self.lock = asyncio.Lock() # Inizializza un lock asincrono per evitare race conditions.
		self.game_started = False  # Aggiungi un flag di stato
		self.speed_multiplier = 1.0
		self.channel_layer = channel_layer

		self.pending_reset = False

		# Aggiungi variabili per il movimento dei paddle
		self.paddle_movements = {"left": 0, "right": 0}  # -1 per su, 0 per fermo, 1 per giù
		self.paddle_speed = 0.012  # Velocità di movimento dei paddle (normalizzata e ridotta per maggiore controllo)
		
		# Aumenta la frequenza di aggiornamento
		self.update_interval = 1/120  # 120 FPS per movimento più fluido

		# Aggiungi variabili per la gestione della velocità come in game_local.js
		self.base_ball_speed = 0.005  # Equivalente a ballSpeed = 5 ma normalizzato per coordinate 0-1
		self.current_multiplier = self.base_ball_speed  # Inizia con la velocità base

		# Add ready states
		self.player1_ready = False
		self.player2_ready = False

	async def is_active_player(self, player):
		try:
			await player.send_json({"type": "ping"})
			return True
		except:
			return False
	
	async def start_game(self):
		import random

		# Verifica che ci siano entrambi i giocatori
		if not self.player1 or not self.player2:
			logger.warning(f"[GAME] Impossibile avviare la partita {self.game_id} - Mancano giocatori.")
			return False

		# Reset lo stato del gioco
		self.state = {
			"ball_position": {"x": 0.5, "y": 0.5},
			"ball_velocity": {"x": 0.01, "y": 0.01},
			"paddles": {"left": 0.5, "right": 0.5},
			"scores": {"left": 0, "right": 0},
		}

		# Imposta il gioco come avviato
		self.game_started = True
		logger.info(f"[GAME] Partita {self.game_id} avviata.")
		logger.info(f"[GAME] Game started with ID: {self.game_id}")

		# Soft reset palla all'avvio con direzione casuale
		await self.soft_reset_ball(scored_left=random.choice([True, False]))

		# Salva la sessione
		try:
			logger.info(f"[CREATE SESSION] Creo sessione per game_id: {self.game_id}")
			if self.player1 and "user" in self.player1.scope:
				logger.info(f"[CREATE SESSION] player1: {self.player1.scope['user']}")
			else:
				logger.info(f"[CREATE SESSION] player1: None o utente non autenticato")
				
			await create_game_session(
				self.game_id,
				self.player1.scope if self.player1 else None,
				self.player2.scope if self.player2 else None
			)
		except Exception as e:
			logger.error(f"[CREATE SESSION] Errore durante la creazione della sessione: {e}")
			import traceback
			logger.error(traceback.format_exc())

		# 🚀 Avvia il game loop in un task separato
		try:
			asyncio.create_task(self.update_game_loop())
			logger.info("[LOOP] Game loop avviato dopo start_game")
			return True
		except Exception as e:
			logger.error(f"[LOOP] Errore nell'avvio del game loop: {e}")
			import traceback
			logger.error(traceback.format_exc())
			self.game_started = False
			return False

	async def add_player(self, consumer):
		"""Aggiunge un nuovo giocatore alla partita."""
		if consumer in self.players:
			logger.warning("[GAME] Questo giocatore è già nella partita.")
			return False  # ❗️

		if not self.player1:
			self.player1 = consumer
			self.player1_connected = True
			consumer.side = "left"
			logger.info("[GAME] Giocatore 1 aggiunto.")
		elif not self.player2:
			self.player2 = consumer
			self.player2_connected = True
			consumer.side = "right"
			logger.info("[GAME] Giocatore 2 aggiunto.")
		else:
			logger.warning(f"[GAME] La partita {self.game_id} è già piena.")
			return False  # ❗️

		self.players = [self.player1, self.player2]  # Aggiorna sempre la lista
		return True  # ✅
	
	async def remove_player(self, consumer):
		"""Rimuove un giocatore dalla partita."""
		self.game_started = False
		if consumer == self.player1:
			self.player1 = None
			logger.info("[GAME] Giocatore 1 rimosso.")
		elif consumer == self.player2:
			self.player2 = None
			logger.info("[GAME] Giocatore 2 rimosso.")
		self.players = [self.player1, self.player2]  # Aggiorna la lista dei giocatori

		if consumer == self.player1:
			consumer.side = "left"
		else:
			consumer.side = "right"
	
	# Aggiornamento del gioco:
	async def update_game_loop(self):
		logger.info("[LOOP] Game loop avviato")
		error_count = 0
		
		try:
			while any(self.players) and self.game_started:
				try:
					await asyncio.sleep(self.update_interval)
					
					async with self.lock:
						# Aggiorna la posizione dei paddle in base al movimento
						await self.update_paddles()
						# Aggiorna la posizione della palla
						await self.update_ball()
						# Notifica i client dello stato aggiornato
						await self.notify_players()
					
					# Reset contatore errori se l'aggiornamento va a buon fine
					error_count = 0
					
				except Exception as e:
					error_count += 1
					logger.error(f"[LOOP] Errore #{error_count} nel game loop: {e}")
					
					if error_count >= 5:
						logger.error("[LOOP] Troppi errori consecutivi, terminazione del loop")
						break
					
					await asyncio.sleep(0.1)
		except Exception as e:
			logger.error(f"[LOOP] Errore fatale nel game loop: {e}")
			import traceback
			logger.error(traceback.format_exc())
		finally:
			logger.info("[LOOP] Game loop terminato")
			self.game_started = False
	
	async def update_paddles(self):
		"""Aggiorna la posizione dei paddle in base ai movimenti"""
		paddle_height = 0.2  # Altezza normalizzata del paddle
		
		# Calcola il delta time per movimento uniforme
		current_time = time.time()
		if not hasattr(self, 'last_update_time'):
			self.last_update_time = current_time
		delta_time = current_time - self.last_update_time
		self.last_update_time = current_time
		
		# Calcola lo spostamento in base al delta time
		movement_amount = self.paddle_speed * delta_time * 60  # Normalizza per 60 FPS
		
		# Aggiorna paddle sinistro
		if self.paddle_movements["left"] != 0:
			current_pos = self.state["paddles"]["left"]
			new_pos = current_pos + (self.paddle_movements["left"] * movement_amount)
			self.state["paddles"]["left"] = max(0.0, min(1.0 - paddle_height, new_pos))
			
		# Aggiorna paddle destro
		if self.paddle_movements["right"] != 0:
			current_pos = self.state["paddles"]["right"]
			new_pos = current_pos + (self.paddle_movements["right"] * movement_amount)
			self.state["paddles"]["right"] = max(0.0, min(1.0 - paddle_height, new_pos))

	async def soft_reset_ball(self, scored_left=False):
		import math
		import random

		self.state["ball_position"] = {"x": 0.5, "y": 0.5}
		self.current_multiplier = self.base_ball_speed  # Reset del moltiplicatore alla velocità base

		direction = 1 if scored_left else -1
		y_sign = random.choice([-1, 1])

		# Imposta la velocità iniziale come in game_local.js
		self.state["ball_velocity"] = {
			"x": direction * self.base_ball_speed,
			"y": y_sign * self.base_ball_speed
		}

		await self.notify_players()
		await asyncio.sleep(0.8)

	async def update_ball(self):
		import random

		ball_radius = 0.02
		paddle_height = 0.2

		ball_x = self.state["ball_position"]["x"]
		ball_y = self.state["ball_position"]["y"]
		vx = self.state["ball_velocity"]["x"]
		vy = self.state["ball_velocity"]["y"]

		# Muovi la palla
		ball_x += vx
		ball_y += vy

		# Gestione punto segnato
		if ball_x + ball_radius < 0.0:
			self.state["scores"]["right"] += 1
			await self.soft_reset_ball(scored_left=False)
			await self.check_game_over()
			return

		if ball_x - ball_radius > 1.0:
			self.state["scores"]["left"] += 1
			await self.soft_reset_ball(scored_left=True)
			await self.check_game_over()
			return

		# Rimbalzo sui bordi superiore e inferiore (come in game_local.js)
		if ball_y <= ball_radius:
			ball_y = ball_radius
			vy = abs(vy)  # Inverte la direzione verticale
		elif ball_y >= 1 - ball_radius:
			ball_y = 1 - ball_radius
			vy = -abs(vy)  # Inverte la direzione verticale

		# Collisione con i paddle (come in game_local.js)
		if vx < 0:  # Movimento verso sinistra
			paddle_y = self.state["paddles"]["left"]
			if ball_x - ball_radius <= self.paddle_positions["left"] and ball_x >= self.paddle_positions["left"] - ball_radius:
				if paddle_y <= ball_y <= paddle_y + paddle_height:
					# Aumenta il moltiplicatore come in game_local.js (max 9.5)
					if self.current_multiplier < 0.0095:  # 9.5 normalizzato
						self.current_multiplier *= 1.10  # Aumentato da 1.05 a 1.10
					
					# Calcola la distanza dal centro del paddle
					distanza = abs(paddle_y + paddle_height / 2 - ball_y)
					
					# Calcola la nuova velocità come in game_local.js
					vx = (1 - 0.3 * (distanza / (paddle_height / 2)))
					vx = min(1, max(0.7, vx)) * self.current_multiplier
					
					# Calcola la componente Y della velocità
					vy = (ball_y < paddle_y + paddle_height / 2) and -self.current_multiplier or self.current_multiplier

		elif vx > 0:  # Movimento verso destra
			paddle_y = self.state["paddles"]["right"]
			if ball_x + ball_radius >= self.paddle_positions["right"] and ball_x <= self.paddle_positions["right"] + ball_radius:
				if paddle_y <= ball_y <= paddle_y + paddle_height:
					# Aumenta il moltiplicatore come in game_local.js (max 9.5)
					if self.current_multiplier < 0.0095:  # 9.5 normalizzato
						self.current_multiplier *= 1.10  # Aumentato da 1.05 a 1.10
					
					# Calcola la distanza dal centro del paddle
					distanza = abs(paddle_y + paddle_height / 2 - ball_y)
					
					# Calcola la nuova velocità come in game_local.js
					vx = -(1 - 0.3 * (distanza / (paddle_height / 2)))
					vx = max(-1, min(-0.7, vx)) * self.current_multiplier
					
					# Calcola la componente Y della velocità
					vy = (ball_y < paddle_y + paddle_height / 2) and -self.current_multiplier or self.current_multiplier

		# Aggiorna lo stato
		self.state["ball_position"] = {"x": ball_x, "y": ball_y}
		self.state["ball_velocity"] = {"x": vx, "y": vy}

		await self.notify_players()

	async def notify_players(self):
		"""Notifica tutti i giocatori del nuovo stato del gioco."""
		try:
			# Use channel layer to broadcast game state to all connected clients
			await self.channel_layer.group_send(
				f"game_{self.game_id}",
				{
					"type": "game_state_update",
					"state": {
						"ball_position": self.state["ball_position"],
						"ball_velocity": self.state["ball_velocity"],
						"paddles": self.state["paddles"],
						"scores": self.state["scores"],
						"game_started": self.game_started,
						"paddle_positions": self.paddle_positions
					}
				}
			)
		except Exception as e:
			logger.warning(f"[NOTIFY ERROR] Problema nell'invio dello stato del gioco: {e}")
			import traceback
			logger.error(traceback.format_exc())

	async def check_game_over(self):
		if self.state["scores"]["left"] >= 5 or self.state["scores"]["right"] >= 5:
			# Determine the winner
			winner = "player1" if self.state["scores"]["left"] >= 5 else "player2"
			
			await self.channel_layer.group_send(
				f"game_{self.game_id}",
				{
					"type": "game_end",
					"winner": winner,
					"player1_score": self.state["scores"]["left"],
					"player2_score": self.state["scores"]["right"]
				}
			)
			self.game_started = False

			# Save match history
			from .game_utils import save_match_history
			await save_match_history(
				self.game_id,
				self.state["scores"]["left"],
				self.state["scores"]["right"]
			)
			
			# Pulizia della game room
			try:
				# Contrassegna la sessione per l'eliminazione
				self.cleanup_scheduled = True
				
				# Crea un task per la pulizia ritardata
				room_group_name = f"game_{self.game_id}"
				# Import GameConsumer per accedere alla funzione di pulizia
				from backend.game.consumers import GameConsumer
				# Crea un'istanza consumer temporanea per accedere al metodo
				for consumer in GameConsumer.game_rooms[room_group_name].players:
					if consumer:
						asyncio.create_task(consumer.cleanup_game_room_after_delay(room_group_name, 3))
						break
			except Exception as e:
				logger.error(f"[CLEANUP ERROR] Errore durante la pulizia della game room: {e}")
			
			# Reset scores for potential new game
			self.state["scores"]["left"] = 0
			self.state["scores"]["right"] = 0

	async def check_all_players_ready(self):
		"""Check if all players are ready and start the game if they are"""
		if self.player1_ready and self.player2_ready:
			# Start the game immediately when both players are ready
			if self.player1 and self.player2:
				await self.channel_layer.group_send(
					f"game_{self.game_id}",
					{
						"type": "all_players_ready"
					}
				)
				
				await self.channel_layer.group_send(
					f"game_{self.game_id}",
					{
						"type": "game_start",
						"player1_name": getattr(self.player1.scope.get("user", None), "username", "Player 1"),
						"player2_name": getattr(self.player2.scope.get("user", None), "username", "Player 2"),
					}
				)
				await self.start_game()

class GameConsumer(AsyncJsonWebsocketConsumer):
	game_rooms = {}  # { "game_id": Game instance }

	async def connect(self):
		# Gestione della connessione
		self.game_id = self.scope["url_route"]["kwargs"].get("game_id", None)
		logger.info(f"[CONNECT] Tentativo di connessione con game_id: {self.game_id or '(vuoto)'}")

		client_ip, client_port = self.scope["client"]
		logger.info(f"[CONNECT] Connessione da {client_ip}:{client_port}")

		# 🧠 Ottieni la sessione utente (se disponibile)
		if "session" in self.scope:
			session_key = self.scope["session"].session_key
			if not session_key:
				await sync_to_async(self.scope["session"].save)()
				session_key = self.scope["session"].session_key
			logger.info(f"[SESSION] Trovata sessione con key: {session_key}")
		else:
			logger.warning("[SESSION] Nessuna sessione trovata nello scope")

		# Se non è stato passato un game_id dalla URL
		if not self.game_id:
			from backend.game.models import GameSession  # Import locale per evitare circolare
			try:
				if "user" in self.scope and self.scope["user"].is_authenticated:
					game_session = await sync_to_async(GameSession.objects.get)(player1=self.scope["user"], status="waiting")
					self.game_id = str(game_session.game_id)
					logger.info(f"[SESSION] Trovata GameSession esistente per {self.scope['user']}: {self.game_id}")
				else:
					# Genera un nuovo game_id casuale per utenti non autenticati
					self.game_id = str(uuid.uuid4())
					logger.info(f"[SESSION] Creato nuovo game_id per utente non autenticato: {self.game_id}")
			except GameSession.DoesNotExist:
				# Crea una nuova sessione se l'utente è autenticato
				if "user" in self.scope and self.scope["user"].is_authenticated:
					game_session = await sync_to_async(create_new_game_session)(self.scope["user"])
					self.game_id = str(game_session.game_id)
					logger.info(f"[SESSION] Creata nuova GameSession {self.game_id} per {self.scope['user']}")
				else:
					# Genera un nuovo game_id casuale per utenti non autenticati
					self.game_id = str(uuid.uuid4())
					logger.info(f"[SESSION] Creato nuovo game_id per utente non autenticato: {self.game_id}")

		self.room_group_name = f"game_{self.game_id}"

		# Crea una nuova stanza se non esiste
		if self.room_group_name not in GameConsumer.game_rooms:
			from backend.game.consumers import Game  # Import locale (se Game è in consumers o altro modulo)
			GameConsumer.game_rooms[self.room_group_name] = Game(self.game_id, channel_layer=self.channel_layer)
			logger.info(f"[NEW GAME ROOM] Creata nuova stanza di gioco: {self.room_group_name}")
		else:
			logger.info(f"[EXISTING GAME] GameID {self.game_id} già esistente, aggiungendo un nuovo giocatore.")

		game = GameConsumer.game_rooms[self.room_group_name]
		logger.info(f"[PLAYER COUNT] Giocatori attuali in {self.game_id}: {len([p for p in game.players if p])}")

		# 👻 Cleanup automatico dei giocatori disconnessi
		for p in [game.player1, game.player2]:
			if p and not await game.is_active_player(p):
				logger.warning("[CLEANUP] Rimozione giocatore inattivo")
				await game.remove_player(p)

		game.players = [game.player1, game.player2]

		# Check if game is full before adding player
		active_players = len([p for p in game.players if p])
		if active_players >= 2:
			logger.warning(f"[FULL GAME] Partita {self.game_id} piena. Connessione rifiutata.")
			await self.close(code=4000)
			return

		# ➕ Aggiunta player
		logger.info(f"[CONSUMER] Game object: {game}")
		logger.info(f"[CONSUMER] Players list before add_player: {[p.side if p else None for p in game.players]}")

		success = await game.add_player(self)
		logger.debug(f"[DEBUG] Esito add_player: {success}")

		if not success:
			await self.close(code=4001)
			return

		logger.info(f"[CONSUMER] Players list after add_player: {[p.side if p else None for p in game.players]}")

		if self not in [game.player1, game.player2]:
			logger.warning("[CONNECT] Il consumer non è stato assegnato correttamente. Forzando chiusura.")
			await self.close(code=4001)
			return

		# Assegna il lato
		if game.player1 and game.player1.channel_name == self.channel_name:
			self.side = "left"
		elif game.player2 and game.player2.channel_name == self.channel_name:
			self.side = "right"
		else:
			logger.error("[CONNECT] Errore: il giocatore non è stato assegnato correttamente.")
			await self.close(code=4001)
			return

		# Join del gruppo
		await self.channel_layer.group_add(self.room_group_name, self.channel_name)
		await self.accept()  # 🔥 Important: solo ora

		# Invia il ruolo assegnato
		await self.send_json({
			"type": "assign_role",
			"role": self.side,
			"can_start_game": self.side == "left",
		})

		# Notifica attesa secondo player
		if len([p for p in game.players if p]) < 2:
			await self.send_json({"type": "waiting_for_opponent"})
		else:
			# Se entrambi i player sono connessi
			await self.channel_layer.group_send(
				self.room_group_name,
				{
					"type": "send_players_ready",
					"playersConnected": 2,
					"player1": getattr(game.player1.scope.get("user", None), "username", "Player 1") if game.player1 else "Player 1",
					"player2": getattr(game.player2.scope.get("user", None), "username", "Player 2") if game.player2 else "Player 2",
				}
			)

		# Notifica stato ai giocatori
		await game.notify_players()

		logger.info(f"[PLAYER JOIN] Il client si è unito alla partita {self.game_id}")

	async def send_game_over(self, event):
		await self.send_json({
			"type": "game_over",
			"player1_score": event["player1_score"],
			"player2_score": event["player2_score"]
		})
		
		# Aggiorna il record del torneo se questa è una partita di torneo
		game = GameConsumer.game_rooms.get(self.room_group_name)
		if game:
			# Esegui l'aggiornamento in modo asincrono
			asyncio.create_task(self.update_tournament_match(
				self.game_id, 
				event["player1_score"], 
				event["player2_score"]
			))

	async def update_tournament_match(self, game_id, player1_score, player2_score):
		try:
			# Importa i modelli necessari
			from .models import GameSession, TournamentMatch, TournamentParticipant
			from django.db.models import Q
			from asgiref.sync import sync_to_async
			import logging
			import traceback
			
			logger = logging.getLogger(__name__)
			logger.error(f"[TOURNAMENT UPDATE] INIZIO aggiornamento torneo per game_id: {game_id}, score: {player1_score}-{player2_score}")
			
			# Funzione per trovare e aggiornare il record del torneo
			@sync_to_async
			def find_and_update_tournament_match():
				try:
					# Trova la sessione di gioco
					session = GameSession.objects.filter(game_id=game_id).first()
					if not session:
						logger.error(f"[TOURNAMENT UPDATE] Sessione di gioco con ID {game_id} non trovata.")
						return
						
					# Verifica se è una partita di torneo
					if session.session_type != 'tournament':
						logger.error(f"[TOURNAMENT UPDATE] La sessione {game_id} non è una partita di torneo. Tipo: {session.session_type}")
						return
						
					# Ottieni i nomi degli utenti
					player1_name = session.player1.username
					player2_name = session.player2.username
					
					logger.error(f"[TOURNAMENT UPDATE] Cercando match di torneo per {player1_name} vs {player2_name}")
					
					# Cerca i partecipanti ai tornei con questi nickname
					participant1_list = TournamentParticipant.objects.filter(nickname=player1_name)
					participant2_list = TournamentParticipant.objects.filter(nickname=player2_name)
					
					if not participant1_list or not participant2_list:
						logger.error(f"[TOURNAMENT UPDATE] Partecipanti al torneo non trovati: {player1_name}, {player2_name}")
						# Lista tutti i partecipanti per debug
						all_participants = TournamentParticipant.objects.all()
						logger.error(f"[TOURNAMENT UPDATE] Tutti i partecipanti: {[p.nickname for p in all_participants]}")
						return
					
					# Cerca il match di torneo che coinvolge entrambi i giocatori e che non ha ancora un vincitore
					match = None
					
					# Per ogni coppia di partecipanti (potrebbero partecipare a più tornei)
					for participant1 in participant1_list:
						for participant2 in participant2_list:
							# Verifica che appartengano allo stesso torneo
							if participant1.tournament_id != participant2.tournament_id:
								continue
								
							logger.error(f"[TOURNAMENT UPDATE] Verificando torneo {participant1.tournament_id}: {participant1.nickname} vs {participant2.nickname}")
							
							# Cerca il match nel torneo tra questi partecipanti che non ha ancora un vincitore
							potential_match = TournamentMatch.objects.filter(
								Q(player_1=participant1, player_2=participant2) | 
								Q(player_1=participant2, player_2=participant1),
								winner__isnull=True,
								# Aggiunta verifica che il torneo sia in corso
								tournament__status='in_progress'
							).first()
							
							if potential_match:
								match = potential_match
								logger.error(f"[TOURNAMENT UPDATE] Match di torneo trovato: ID={match.id}, Torneo={match.tournament.id}, {match.player_1.nickname} vs {match.player_2.nickname}")
								break
						
						if match:
							break
					
					if not match:
						logger.error(f"[TOURNAMENT UPDATE] Match di torneo non trovato per {player1_name} vs {player2_name}")
						# Cerca comunque tutti i match di questi partecipanti anche con vincitore per debug
						all_matches = []
						for participant1 in participant1_list:
							for participant2 in participant2_list:
								if participant1.tournament_id == participant2.tournament_id:
									matches = TournamentMatch.objects.filter(
										Q(player_1=participant1, player_2=participant2) | 
										Q(player_1=participant2, player_2=participant1)
									)
									all_matches.extend(matches)
						
						logger.error(f"[TOURNAMENT UPDATE] Match trovati (anche con vincitore): {[(m.id, m.tournament.id, m.winner.nickname if m.winner else 'None') for m in all_matches]}")
						return
					
					# Aggiorna il punteggio in base ai ruoli dei giocatori
					if match.player_1.nickname == player1_name:
						match.score_player_1 = player1_score
						match.score_player_2 = player2_score
						match.winner = match.player_1 if player1_score > player2_score else match.player_2
					else:
						# Se i giocatori sono invertiti, invertiamo anche i punteggi
						match.score_player_1 = player2_score
						match.score_player_2 = player1_score
						# Correggiamo la logica del vincitore quando i giocatori sono invertiti
						match.winner = match.player_2 if player1_score > player2_score else match.player_1
					
					logger.error(f"[TOURNAMENT UPDATE] Impostazione punteggi: {match.score_player_1}-{match.score_player_2}, vincitore: {match.winner.nickname}")
					
					# Salva il match
					match.save()
					logger.error(f"[TOURNAMENT UPDATE] Match di torneo salvato con successo")
					
					# Ottieni le informazioni sul round e il torneo per debug
					tournament = match.tournament
					current_round = match.round
					round_matches = TournamentMatch.objects.filter(tournament=tournament, round=current_round)
					all_completed = all(m.winner is not None for m in round_matches)
					logger.error(f"[TOURNAMENT UPDATE] Torneo ID={tournament.id}, Round={current_round}, Match completati: {all_completed}")
					
					# Conta i vincitori per verificare se servirebbe creare un nuovo round
					winners = [m.winner for m in round_matches if m.winner is not None]
					logger.error(f"[TOURNAMENT UPDATE] Vincitori trovati: {[w.nickname for w in winners]}, totale: {len(winners)}")
					
					# Verifica se dobbiamo creare i match del turno successivo
					from .tournament_views import TournamentMatchAPIView
					api_view = TournamentMatchAPIView()
					logger.error(f"[TOURNAMENT UPDATE] Chiamata a _check_and_create_next_round_matches")
					try:
						api_view._check_and_create_next_round_matches(match)
						logger.error(f"[TOURNAMENT UPDATE] Chiamata completata con successo")
					except Exception as e:
						logger.error(f"[TOURNAMENT UPDATE] Errore durante la creazione del prossimo round: {str(e)}")
						import traceback
						logger.error(traceback.format_exc())
					
					# Verifica se il match della finale è stato creato
					next_round = current_round + 1
					next_round_matches = TournamentMatch.objects.filter(tournament=tournament, round=next_round)
					logger.error(f"[TOURNAMENT UPDATE] Match del round {next_round} creati: {len(next_round_matches)}")
					for next_match in next_round_matches:
						logger.error(f"[TOURNAMENT UPDATE] Match finale: {next_match.player_1.nickname} vs {next_match.player_2.nickname}")
					
				except Exception as e:
					logger.error(f"[TOURNAMENT UPDATE] Errore durante l'aggiornamento del match di torneo: {str(e)}")
					logger.error(traceback.format_exc())
					raise
			
			# Esegui la funzione di aggiornamento
			await find_and_update_tournament_match()
			logger.error(f"[TOURNAMENT UPDATE] COMPLETATO aggiornamento torneo")
		except Exception as e:
			logger.error(f"[TOURNAMENT UPDATE] Errore nell'aggiornamento del match di torneo: {str(e)}")
			logger.error(traceback.format_exc())

	async def send_players_ready(self, event):
		"""Send updated ready status to all players"""
		game = GameConsumer.game_rooms.get(self.room_group_name)
		if game:
			await self.send_json({
				"type": "players_ready",
				"playersConnected": event["playersConnected"],
				"player1": event["player1"],
				"player2": event["player2"],
				"player1_ready": game.player1_ready,
				"player2_ready": game.player2_ready
			})

	async def disconnect(self, close_code):
		game = GameConsumer.game_rooms.get(self.room_group_name)
		if game:
			# Se la partita è in corso, assegna la vittoria all'avversario
			if game.game_started:
				logger.info(f"[DISCONNECT] Giocatore {self.side} ha abbandonato la partita {self.game_id} durante il gioco")
				
				# Determina quale giocatore si è disconnesso e assegna la vittoria all'altro
				winner_side = "right" if self.side == "left" else "left"
				winner_role = "player2" if self.side == "left" else "player1"
				
				# Imposta il punteggio a 3-0
				if winner_side == "left":
					game.state["scores"]["left"] = 3
					game.state["scores"]["right"] = 0
				else:
					game.state["scores"]["left"] = 0
					game.state["scores"]["right"] = 3
				
				# Invia un messaggio di fine partita con il motivo dell'abbandono
				await self.channel_layer.group_send(
					self.room_group_name,
					{
						"type": "game_abandoned",
						"winner": winner_role,
						"player1_score": game.state["scores"]["left"],
						"player2_score": game.state["scores"]["right"],
						"abandoned_by": self.side
					}
				)
				
				# Termina la partita
				game.game_started = False
				
				# Salva la partita nello storico
				from .game_utils import save_match_history
				await save_match_history(
					self.game_id,
					game.state["scores"]["left"],
					game.state["scores"]["right"],
					abandoned=True
				)

				# Aggiorna il match del torneo se è una partita di torneo
				try:
					session_info = await self.get_session_info(self.game_id)
					if session_info and session_info['type'] == 'tournament':
						logger.error(f"[DISCONNECT] Chiamata update_tournament_match per partita di torneo abbandonata")
						await self.update_tournament_match(
							self.game_id,
							game.state["scores"]["left"],
							game.state["scores"]["right"]
						)
						logger.error(f"[DISCONNECT] Aggiornamento match torneo completato")
				except Exception as e:
					logger.error(f"[DISCONNECT] Errore durante l'aggiornamento del match di torneo: {str(e)}")
					import traceback
					logger.error(traceback.format_exc())

			# Rimuovi il giocatore dalla stanza
			await self.channel_layer.group_discard(
				self.room_group_name,
				self.channel_name
			)
			
			# Aggiorna lo stato dei giocatori connessi
			if self.side == "left":
				game.player1_connected = False
			else:
				game.player2_connected = False
			
			# Se nessun giocatore è connesso, rimuovi la stanza
			if not game.player1_connected and not game.player2_connected:
				del GameConsumer.game_rooms[self.room_group_name]

	async def cleanup_game_room_after_delay(self, room_group_name, delay_seconds):
		"""Helper per eliminare una game room dopo un ritardo specificato"""
		await asyncio.sleep(delay_seconds)
		
		if room_group_name in GameConsumer.game_rooms:
			logger.info(f"[CLEANUP] Rimozione della game room dopo {delay_seconds}s")
			del GameConsumer.game_rooms[room_group_name]

	async def game_abandoned(self, event):
		"""Gestisce l'evento di abbandono di una partita"""
		await self.send_json({
			"type": "game_abandoned",
			"winner": event["winner"],
			"player1_score": event["player1_score"],
			"player2_score": event["player2_score"],
			"abandoned_by": event["abandoned_by"],
			"message": f"L'avversario ha abbandonato la partita. Vittoria assegnata {event['player1_score']}-{event['player2_score']}."
		})

	async def receive_json(self, content):
		logger.info(f"[RECEIVE] JSON ricevuto: {content}")

		game = GameConsumer.game_rooms.get(self.room_group_name)
		if not game:
			logger.warning(f"[INVALID GAME] Messaggio per partita inesistente: {self.game_id}")
			return

		msg_type = content.get("type")
		logger.info(f"[MESSAGE RECEIVED] Tipo: {msg_type} | Partita: {self.game_id}")

		try:
			# Add handler for leave_waiting_room message
			if msg_type == "leave_waiting_room":
				logger.info(f"[LEAVE WAITING] Giocatore {self.side} lascia la waiting room {self.game_id}")
				
				# Aggiorna lo stato della sessione nel database
				try:
					from .models import GameSession
					
					@sync_to_async
					def update_session():
						session = GameSession.objects.filter(game_id=self.game_id).first()
						if session and session.status == "waiting":
							session.status = "cancelled"
							session.save()
							logger.info(f"[CLEANUP] Sessione {self.game_id} marcata come cancelled nel database")
					
					await update_session()
				except Exception as e:
					logger.error(f"[CLEANUP] Errore nell'aggiornamento dello stato della sessione: {e}")

				# Rimuovi il giocatore dalla stanza
				if self.side == "left":
					game.player1 = None
					game.player1_connected = False
				else:
					game.player2 = None
					game.player2_connected = False
				
				# Se nessun giocatore è connesso, rimuovi la stanza
				if not game.player1_connected and not game.player2_connected:
					logger.info(f"[CLEANUP] Rimozione game room {self.game_id} - nessun giocatore connesso")
					del GameConsumer.game_rooms[self.room_group_name]

				await self.channel_layer.group_discard(self.room_group_name, self.channel_name)
				return

			# Add handler for player ready message
			if msg_type == "player_ready":
				if self.side == "left":
					game.player1_ready = True
					logger.info(f"[READY] Player 1 ready in game {self.game_id}")
				elif self.side == "right":
					game.player2_ready = True
					logger.info(f"[READY] Player 2 ready in game {self.game_id}")
				
				# Notify all players about ready status
				await self.channel_layer.group_send(
					self.room_group_name,
					{
						"type": "send_players_ready",
						"playersConnected": 2,
						"player1": getattr(game.player1.scope.get("user", None), "username", "Player 1") if game.player1 else "Player 1",
						"player2": getattr(game.player2.scope.get("user", None), "username", "Player 2") if game.player2 else "Player 2",
					}
				)
				
				# Check if both players are ready
				await game.check_all_players_ready()
				
			# Handle paddle movement (start/stop)
			elif msg_type == "paddle_move":
				if not hasattr(game, 'game_started') or not game.game_started:
					logger.warning(f"[MOVE IGNORED] Movimento prima dell'inizio della partita {self.game_id}")
					return

				direction = content.get("direction")
				action = content.get("action", "start")  # "start" or "stop"
				
				if direction not in ["up", "down"]:
					logger.warning(f"[MOVE] Direzione non valida: {direction}")
					return

				side = getattr(self, 'side', None)
				if not side:
					logger.error(f"[MOVE] Paddle non trovato nella partita {self.game_id}")
					return
				
				# Converti direzione in movimento
				movement = -1 if direction == "up" else 1
				if action == "stop":
					movement = 0
				
				# Aggiorna il movimento del paddle
				game.paddle_movements[side] = movement
				logger.info(f"[MOVE] Paddle '{side}' movimento impostato a {movement} nella partita {self.game_id}")

			# Gestione del nuovo messaggio paddle_position per sincronizzazione diretta
			elif msg_type == "paddle_position":
				if not hasattr(game, 'game_started') or not game.game_started:
					logger.warning(f"[POSITION IGNORED] Posizionamento prima dell'inizio della partita {self.game_id}")
					return
				
				position = content.get("position")
				if position is None:
					logger.warning(f"[POSITION] Posizione non specificata")
					return
				
				side = getattr(self, 'side', None)
				if not side or side not in game.state["paddles"]:
					logger.error(f"[POSITION] Paddle '{getattr(self, 'side', None)}' non trovato nella partita {self.game_id}")
					return
				
				# Controlla che la posizione sia valida (tra 0 e 0.8)
				paddle_height = 0.2
				position = max(0.0, min(1.0 - paddle_height, float(position)))
				
				# Imposta direttamente la posizione del paddle
				game.state["paddles"][side] = position
				
				# Notifica la posizione solo al giocatore avversario per ottimizzare la frequenza
				try:
					# Trova l'avversario
					if side == "left" and game.player2:
						await game.player2.send_json({
							"type": "game_update",
							"ballX": game.state["ball_position"]["x"] * 1000,
							"ballY": game.state["ball_position"]["y"] * 500,
							"paddle1Y": game.state["paddles"]["left"] * 500,
							"paddle2Y": game.state["paddles"]["right"] * 500,
							"player1Score": game.state["scores"]["left"],
							"player2Score": game.state["scores"]["right"]
						})
					elif side == "right" and game.player1:
						await game.player1.send_json({
							"type": "game_update",
							"ballX": game.state["ball_position"]["x"] * 1000,
							"ballY": game.state["ball_position"]["y"] * 500,
							"paddle1Y": game.state["paddles"]["left"] * 500,
							"paddle2Y": game.state["paddles"]["right"] * 500,
							"player1Score": game.state["scores"]["left"],
							"player2Score": game.state["scores"]["right"]
						})
				except Exception as e:
					logger.warning(f"[POSITION] Errore nell'invio dell'aggiornamento: {e}")
					# Se fallisce, usa la notifica standard come fallback
					await game.notify_players()

			# 👥 Riconnessione client già assegnato
			elif msg_type == "join":
				if self.side is not None:
					await game.notify_players()

			# 🟢 Avvia partita (solo Player1 può farlo)
			elif msg_type == "start_game":
				if game.player1 and game.player2:
					if self.side == "left":  # Solo Player1 può avviare
						if not hasattr(game, 'game_started') or not game.game_started:
							logger.info(f"[START GAME] Avvio partita {self.game_id}")
							
							# Notify players that the game is starting
							await self.channel_layer.group_send(
								self.room_group_name,
								{
									"type": "game_start",
									"player1_name": getattr(game.player1.scope.get("user", None), "username", "Player 1") if game.player1 else "Player 1",
									"player2_name": getattr(game.player2.scope.get("user", None), "username", "Player 2") if game.player2 else "Player 2",
								}
							)
							
							await game.start_game()
						else:
							logger.warning(f"[START GAME] Partita {self.game_id} già avviata")
					else:
						logger.warning(f"[START GAME] Solo Player1 può avviare la partita {self.game_id}")
				else:
					logger.warning(f"[START GAME] Impossibile avviare {self.game_id}: mancano giocatori")
					await self.send_json({"type": "error", "message": "Waiting for both players to join"})
			
			# Handle ping messages to check connection
			elif msg_type == "ping":
				await self.send_json({"type": "pong"})
				logger.debug(f"[PING] Ping ricevuto da {self.channel_name}, pong inviato")
				
		except Exception as e:
			logger.error(f"[ERROR] Errore durante l'elaborazione del messaggio: {str(e)}")
			import traceback
			logger.error(traceback.format_exc())
			
	async def game_start(self, event):
		"""Handle game start event"""
		await self.send_json({
			"type": "game_start",
			"player1_name": event["player1_name"],
			"player2_name": event["player2_name"]
		})
		
	# Handler for the 'game_state_update' event that sends the new state to each client
	async def game_state_update(self, event):
		try:
			state = event.get("state", {})
			ball_position = state.get("ball_position", {"x": 0.5, "y": 0.5})
			paddles = state.get("paddles", {"left": 0.5, "right": 0.5})
			scores = state.get("scores", {"left": 0, "right": 0})
			
			await self.send_json({
				"type": "game_update",
				"ballX": ball_position["x"] * 1000,  # Scale to canvas size
				"ballY": ball_position["y"] * 500,
				"paddle1Y": paddles["left"] * 500,
				"paddle2Y": paddles["right"] * 500,
				"player1Score": scores["left"],
				"player2Score": scores["right"]
			})
		except Exception as e:
			logger.error(f"[ERROR] Errore durante l'invio dell'aggiornamento di stato: {str(e)}")
			import traceback
			logger.error(traceback.format_exc())
		
	async def game_end(self, event):
		"""Handle game end event"""
		import logging
		logger = logging.getLogger(__name__)
		logger.error(f"[GAME END] INIZIO gestione game_end: {event}")
		
		await self.send_json({
			"type": "game_end",
			"winner": event["winner"],
			"player1_score": event["player1_score"],
			"player2_score": event["player2_score"]
		})
		
		# Aggiorna il record del torneo se questa è una partita di torneo
		try:
			# Verifica il tipo di sessione
			from .models import GameSession
			from asgiref.sync import sync_to_async
			
			@sync_to_async
			def get_session_info():
				session = GameSession.objects.filter(game_id=self.game_id).first()
				if session:
					logger.error(f"[GAME END] Trovata sessione {self.game_id}, tipo: {session.session_type}")
					return {
						'type': session.session_type,
						'player1': session.player1.username if session.player1 else None,
						'player2': session.player2.username if session.player2 else None
					}
				logger.error(f"[GAME END] Sessione {self.game_id} non trovata")
				return None
				
			session_info = await get_session_info()
			
			if session_info and session_info['type'] == 'tournament':
				logger.error(f"[GAME END] Chiamata update_tournament_match per partita di torneo tra {session_info['player1']} e {session_info['player2']}")
				# Esegui l'aggiornamento in modo asincrono
				asyncio.create_task(self.update_tournament_match(
					self.game_id, 
					event["player1_score"], 
					event["player2_score"]
				))
				logger.error(f"[GAME END] Task update_tournament_match creato")
				
				# Attendi un po' prima di considerare la partita conclusa
				# per dare tempo all'aggiornamento del match del torneo
				await asyncio.sleep(1.5)
		except Exception as e:
			logger.error(f"[GAME END] Errore durante la verifica/aggiornamento del torneo: {str(e)}")
			import traceback
			logger.error(traceback.format_exc())
			
		logger.error("[GAME END] FINE gestione game_end")

	async def all_players_ready(self, event):
		"""Handle all players ready event"""
		await self.send_json({
			"type": "all_players_ready"
		})

	async def game_countdown(self, event):
		"""Remove this method as it's no longer needed"""
		pass

	async def prepare_countdown(self, event):
		"""Remove this method as it's no longer needed"""
		pass

	async def send_message(self, event):
		# Send message to WebSocket
		await self.send(text_data=json.dumps({
			"type": "message",
			"message": event["message"]
		}))
