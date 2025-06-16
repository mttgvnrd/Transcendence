from rest_framework import status
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework.permissions import IsAuthenticated
from .models import GameSession
from django.shortcuts import get_object_or_404
from django.db import transaction
from django.db.models import Q
from django.utils import timezone
from datetime import timedelta
import uuid
import logging

logger = logging.getLogger(__name__)

class FindOrCreateGameSession(APIView):
	"""
	API view per trovare o creare una nuova sessione di gioco.
	"""
	permission_classes = [IsAuthenticated]

	def post(self, request, *args, **kwargs):
		try:
			with transaction.atomic():  # Previene race conditions
				# Prima pulisci le sessioni zombie
				self.cleanup_stale_sessions()
				
				# Controlla se l'utente è già in una sessione attiva
				user_session = GameSession.objects.filter(
					status__in=['waiting', 'ready'],
					session_type='casual'
				).filter(
					player1_username=request.user.username
				).first()

				if user_session:
					return Response({
						'game_id': str(user_session.game_id),
						'status': user_session.status,
						'role': 'player1',
						'player1_username': user_session.player1_username,
					})

				user_session = GameSession.objects.filter(
					status__in=['waiting', 'ready'],
					session_type='casual'
				).filter(
					player2_username=request.user.username
				).first()

				if user_session:
					return Response({
						'game_id': str(user_session.game_id),
						'status': user_session.status,
						'role': 'player2',
						'player2_username': user_session.player2_username,
					})

				# Cerca una sessione disponibile
				# Ordina per created_at per prendere sempre la più vecchia prima
				existing_session = GameSession.objects.filter(
					status='waiting',
					player2__isnull=True,
					session_type='casual',
					created_at__gte=timezone.now() - timedelta(minutes=5)  # Solo sessioni create negli ultimi 5 minuti
				).exclude(
					player1=request.user
				).exclude(
					player1_username=request.user.username
				).order_by('created_at').select_for_update().first()

				if existing_session:
					# Aggiorna atomicamente la sessione
					existing_session.player2 = request.user
					existing_session.status = 'ready'
					existing_session.player2_username = request.user.username
					existing_session.save()
					
					return Response({
						'game_id': str(existing_session.game_id),
						'status': existing_session.status,
						'role': 'player2',
						'player2_username': existing_session.player2_username,
					})
				else:
					# Crea una nuova sessione
					new_session = GameSession.objects.create(
						player1=request.user,
						player1_username=request.user.username,
						game_id=uuid.uuid4(),
						status='waiting',
						session_type='casual'
					)
					return Response({
						'game_id': str(new_session.game_id),
						'status': new_session.status,
						'role': 'player1',
						'player1_username': new_session.player1_username,
					})
		except Exception as e:
			logger.error(f"Error in FindOrCreateGameSession: {str(e)}")
			return Response(
				{'error': 'Failed to create or join game session'},
				status=status.HTTP_500_INTERNAL_SERVER_ERROR
			)

	def cleanup_stale_sessions(self):
		"""
		Pulisce le sessioni zombie:
		- Sessioni in waiting più vecchie di 5 minuti
		- Sessioni in ready ma inattive da più di 5 minuti
		- Sessioni con status inconsistente
		"""
		try:
			five_minutes_ago = timezone.now() - timedelta(minutes=5)
			
			# Trova e cancella le sessioni zombie
			stale_sessions = GameSession.objects.filter(
				session_type='casual'
			).filter(
				# Sessioni waiting vecchie
				Q(status='waiting', created_at__lt=five_minutes_ago) |
				# Sessioni ready ma inattive
				Q(status='ready', created_at__lt=five_minutes_ago, player2__isnull=True) |
				# Sessioni con stati inconsistenti
				Q(status__in=['waiting', 'ready'], player1__isnull=True)
			)
			
			if stale_sessions.exists():
				count = stale_sessions.count()
				stale_sessions.update(status='cancelled')
				logger.info(f"[CLEANUP] Cancelled {count} stale sessions")
		except Exception as e:
			logger.error(f"Error in cleanup_stale_sessions: {str(e)}")
			# Non solleviamo l'eccezione per non bloccare la creazione della sessione

class JoinGameSession(APIView):
	"""
	API view per unire una sessione di gioco.
	"""
	permission_classes = [IsAuthenticated]
	
	def post(self, request, game_id, *args, **kwargs):
		try:
			with transaction.atomic():
				game_session = get_object_or_404(GameSession, game_id=game_id)
				
				# Se la sessione è troppo vecchia e ancora in waiting, cancellala
				if game_session.status == 'waiting' and \
				   game_session.created_at < timezone.now() - timedelta(minutes=5):
					game_session.status = 'cancelled'
					game_session.save()
					return Response(
						{'error': 'This game session has expired.'},
						status=status.HTTP_400_BAD_REQUEST
					)

				# Se l'utente è già nella sessione, restituisci le info
				if game_session.player1 == request.user:
					return Response({
						'game_id': str(game_session.game_id),
						'status': game_session.status,
						'role': 'player1',
						'session_type': game_session.session_type
					})
				elif game_session.player2 == request.user:
					return Response({
						'game_id': str(game_session.game_id),
						'status': game_session.status,
						'role': 'player2',
						'session_type': game_session.session_type
					})

				# Se la sessione è piena, errore
				if game_session.player2 is not None and game_session.player2 != request.user:
					return Response(
						{'error': 'This game session is already full.'},
						status=status.HTTP_400_BAD_REQUEST
					)

				# Unisciti come player2
				game_session.player2 = request.user
				game_session.player2_username = request.user.username
				game_session.status = 'ready'
				game_session.save()
				
				return Response({
					'game_id': str(game_session.game_id),
					'status': game_session.status,
					'role': 'player2',
					'session_type': game_session.session_type
				})
		except Exception as e:
			return Response(
				{'error': f'Failed to join game session: {str(e)}'},
				status=status.HTTP_500_INTERNAL_SERVER_ERROR
			)
		
class GetGameSession(APIView):
	"""
	API view per ottenere informazioni su una sessione di gioco specifica.
	"""
	permission_classes = [IsAuthenticated]

	def get(self, request, game_id, *args, **kwargs):
		try:
			game_session = get_object_or_404(GameSession, game_id=game_id)
			role = None
			if game_session.player1 == request.user:
				role = 'player1'
			elif game_session.player2 == request.user:
				role = 'player2'
			else:
				role = 'spectator'
			return Response({
				'game_id': str(game_session.game_id),
				'status': game_session.status,
				'role': role,
				'player1': game_session.player1.username if game_session.player1 else None,
				'player2': game_session.player2.username if game_session.player2 else None,
				'created_at': game_session.created_at,
				'session_type': game_session.session_type
			})
		except Exception as e:
			return Response(
				{'error': f'Failed to get game session: {str(e)}'},
				status=status.HTTP_500_INTERNAL_SERVER_ERROR
			)

class CleanupGameSession(APIView):
	"""
	API view per pulire una sessione di gioco.
	"""
	permission_classes = [IsAuthenticated]

	def post(self, request, game_id, *args, **kwargs):
		try:
			# Trova la sessione
			session = GameSession.objects.filter(
				game_id=game_id,
				player1=request.user,  # Solo il creatore può pulire la sessione
				status__in=['waiting', 'cancelled']
			).first()

			if session:
				session.status = 'cancelled'
				session.save()
				return Response({'status': 'cleaned'})
			return Response({'status': 'not_found'}, status=status.HTTP_404_NOT_FOUND)
		except Exception as e:
			return Response(
				{'error': f'Failed to cleanup game session: {str(e)}'},
				status=status.HTTP_500_INTERNAL_SERVER_ERROR
			) 