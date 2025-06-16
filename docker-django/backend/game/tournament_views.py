from rest_framework import status
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework.permissions import IsAuthenticated
from django.contrib.auth.models import User
from .models import Tournament, TournamentParticipant, TournamentMatch, GameSession
from rest_framework.parsers import MultiPartParser, FormParser, JSONParser
import logging
from .serializers import TournamentSerializer, TournamentCreateSerializer, TournamentParticipantSerializer
from rest_framework_simplejwt.authentication import JWTAuthentication
from rest_framework.permissions import BasePermission
import random
import math
from django.utils import timezone
import json
from django.shortcuts import get_object_or_404
from django.db.models import Q
import traceback

class IsBlockchainService(BasePermission):
	"""
	Custom permission to only allow the blockchain service to access the view.
	"""
	def has_permission(self, request, view):
		# Check if the request has a valid JWT token for the blockchain service
		try:
			auth_header = request.headers.get('Authorization')
			if not auth_header or not auth_header.startswith('Bearer '):
				return False
			
			# The actual validation of the token is handled by JWTAuthentication
			return True
		except Exception:
			return False

class BlockchainCallbackAPIView(APIView):
	"""
	API view for receiving blockchain transaction confirmations.
	POST: Update match with blockchain transaction details
	"""
	authentication_classes = [JWTAuthentication]
	permission_classes = [IsBlockchainService]
	parser_classes = [JSONParser]

	def post(self, request, tournament_pk, match_pk):
		try:
			# Get the match
			match = get_object_or_404(TournamentMatch, 
									tournament_id=tournament_pk, 
									id=match_pk)
			
			# Update the match with blockchain data
			blockchain_address = request.data.get('blockchain_address')
			if not blockchain_address:
				return Response(
					{'detail': 'blockchain_address is required'}, 
					status=status.HTTP_400_BAD_REQUEST
				)
			
			match.blockchain_address = blockchain_address
			match.save()
			
			return Response({
				'detail': 'Match blockchain address updated successfully',
				'match_id': match.id,
				'blockchain_address': match.blockchain_address
			}, status=status.HTTP_200_OK)
			
		except Exception as e:
			return Response(
				{'detail': f'Error updating match: {str(e)}'},
				status=status.HTTP_500_INTERNAL_SERVER_ERROR
			)

class TournamentAPIView(APIView):
	"""
	API view for tournament management.
	GET: Get all tournaments for the current user
	POST: Create a new tournament
	"""
	permission_classes = (IsAuthenticated,)
	parser_classes = (MultiPartParser, FormParser, JSONParser)

	def get(self, request, *args, **kwargs):
		try:
			tournaments = Tournament.objects.all()
			serialized_tournaments = []
			for tournament in tournaments:
				tournament_data = TournamentSerializer(tournament).data
				participants = TournamentParticipant.objects.filter(tournament=tournament)
				participants_data = []
				for participant in participants:
					participant_data = {
						'id': participant.id,
						'nickname': participant.nickname
					}
					participants_data.append(participant_data)
				tournament_data['participants'] = participants_data
				if tournament.status in ['in_progress', 'completed']:
					matches = TournamentMatch.objects.filter(tournament=tournament)
					matches_data = []
					for match in matches:
						match_data = {
							'id': match.id,
							'round': match.round,
							'player_1': {
								'id': match.player_1.id,
								'nickname': match.player_1.nickname,
							},
							'player_2': {
								'id': match.player_2.id,
								'nickname': match.player_2.nickname,
							},
							'winner': match.winner.id if match.winner else None,
							'score_player_1': match.score_player_1,
							'score_player_2': match.score_player_2
						}
						matches_data.append(match_data)
					tournament_data['matches'] = matches_data
				serialized_tournaments.append(tournament_data)
			return Response(serialized_tournaments, status=status.HTTP_200_OK)
		except Exception as e:
			return Response(
				{'detail': f'Error retrieving tournaments: {str(e)}'},
				status=status.HTTP_500_INTERNAL_SERVER_ERROR
			)

	def post(self, request, *args, **kwargs):
		try:
			# Check if user has a display name
			if not hasattr(request.user, 'game_userprofile') or not request.user.game_userprofile.display_name:
				return Response(
					{'detail': 'You must set a display name before creating a tournament.'},
					status=status.HTTP_400_BAD_REQUEST
				)

			tournament_data = {}
			name = request.data.get('name')
			if not name:
				return Response({'name': ['This field is required.']}, status=status.HTTP_400_BAD_REQUEST)
			tournament_data['name'] = name
			
			max_participants = request.data.get('max_participants')
			if not max_participants:
				return Response({'max_participants': ['This field is required.']}, status=status.HTTP_400_BAD_REQUEST)
			try:
				max_participants = int(max_participants)
				if max_participants not in [4, 8, 16]:
					return Response({'max_participants': ['Must be 4, 8, or 16.']}, status=status.HTTP_400_BAD_REQUEST)
				tournament_data['max_participants'] = max_participants
			except (ValueError, TypeError):
				return Response({'max_participants': ['Must be a valid integer.']}, status=status.HTTP_400_BAD_REQUEST)

			# Check if tournament with same name exists
			if Tournament.objects.filter(name=name).exists():
				return Response(
					{'detail': f'A tournament with the name "{name}" already exists.'},
					status=status.HTTP_400_BAD_REQUEST
				)

			print(f"[Tournament Creation] Creating tournament with name: {name}, max participants: {max_participants}")
			print(f"[Tournament Creation] Creator user: {request.user.username}")
			print(f"[Tournament Creation] Creator display name: {request.user.game_userprofile.display_name}")

			tournament = Tournament.objects.create(
				name=name,
				max_participants=max_participants,
				creator=request.user,
				status='registration_open'
			)
			
			print(f"[Tournament Creation] Tournament created with ID: {tournament.id}")
			
			participant = TournamentParticipant.objects.create(
				tournament=tournament,
				nickname=request.user.game_userprofile.display_name
			)
			
			print(f"[Tournament Creation] Creator participant created with ID: {participant.id}")
			
			tournament_data = TournamentSerializer(tournament).data
			participants = TournamentParticipant.objects.filter(tournament=tournament)
			participants_data = []
			for p in participants:
				participant_data = {
					'id': p.id,
					'nickname': p.nickname
				}
				participants_data.append(participant_data)
			tournament_data['participants'] = participants_data
			return Response(tournament_data, status=status.HTTP_201_CREATED)
		except Exception as e:
			import traceback
			error_details = traceback.format_exc()
			print(f"[Tournament Creation Error] {str(e)}")
			print(f"[Tournament Creation Error] Full traceback:\n{error_details}")
			
			# If tournament was created but participant creation failed, delete the tournament
			if 'tournament' in locals():
				try:
					tournament.delete()
					print("[Tournament Creation Error] Cleaned up partially created tournament")
				except Exception as cleanup_error:
					print(f"[Tournament Creation Error] Failed to cleanup tournament: {str(cleanup_error)}")
			
			return Response(
				{
					'detail': f'Error creating tournament: {str(e)}',
					'error_details': error_details
				},
				status=status.HTTP_500_INTERNAL_SERVER_ERROR
			)

	def _generate_tournament_matches(self, tournament, participants):
		random.shuffle(participants)
		num_participants = len(participants)
		num_rounds = math.ceil(math.log2(num_participants))
		matches_to_create = []
		first_round_matches = num_participants - (2 ** (num_rounds - 1))
		if first_round_matches == 0:
			first_round_matches = num_participants // 2
		for i in range(first_round_matches):
			player1 = participants[i * 2]
			player2 = participants[i * 2 + 1]
			match = TournamentMatch(
				tournament=tournament,
				round=1,
				player_1=player1,
				player_2=player2
			)
			matches_to_create.append(match)
		TournamentMatch.objects.bulk_create(matches_to_create)

class TournamentDetailAPIView(APIView):
	"""
	API view for individual tournament operations.
	GET: Get details of a specific tournament
	DELETE: Delete a tournament
	"""
	permission_classes = (IsAuthenticated,)

	def get(self, request, pk, *args, **kwargs):
		try:
			tournament = Tournament.objects.get(pk=pk)
			if tournament.creator != request.user:
				participants = TournamentParticipant.objects.filter(tournament=tournament)
				user_is_participant = False
				for participant in participants:
					if participant.nickname == request.user.game_userprofile.display_name:
						user_is_participant = True
						break
				if not user_is_participant:
					return Response(
						{'detail': 'You are not a participant in this tournament'},
						status=status.HTTP_403_FORBIDDEN
					)
			tournament_data = TournamentSerializer(tournament).data
			matches = TournamentMatch.objects.filter(tournament=tournament)
			matches_data = []
			for match in matches:
				match_data = {
					'id': match.id,
					'round': match.round,
					'player_1': {
						'id': match.player_1.id,
						'nickname': match.player_1.nickname,
					},
					'player_2': {
						'id': match.player_2.id,
						'nickname': match.player_2.nickname,
					},
					'winner': match.winner.id if match.winner else None,
					'score_player_1': match.score_player_1,
					'score_player_2': match.score_player_2
				}
				matches_data.append(match_data)
			tournament_data['matches'] = matches_data
			return Response(tournament_data, status=status.HTTP_200_OK)
		except Tournament.DoesNotExist:
			return Response(
				{'detail': 'Tournament not found'},
				status=status.HTTP_404_NOT_FOUND
			)
		except Exception as e:
			return Response(
				{'detail': f'Error retrieving tournament: {str(e)}'},
				status=status.HTTP_500_INTERNAL_SERVER_ERROR
			)
	def delete(self, request, pk, *args, **kwargs):
		try:
			tournament = Tournament.objects.get(pk=pk)
			if tournament.creator != request.user:
				return Response(
					{'detail': 'Only the tournament creator can delete it'},
					status=status.HTTP_403_FORBIDDEN
				)
			tournament.delete()
			return Response(status=status.HTTP_204_NO_CONTENT)
		except Tournament.DoesNotExist:
			return Response(
				{'detail': 'Tournament not found'},
				status=status.HTTP_404_NOT_FOUND
			)
		except Exception as e:
			return Response(
				{'detail': f'Error deleting tournament: {str(e)}'},
				status=status.HTTP_500_INTERNAL_SERVER_ERROR
			)

class ConcludeTournamentAPIView(APIView):
	"""
	API view to conclude a tournament.
	POST: Mark a tournament as completed
	"""
	permission_classes = (IsAuthenticated,)

	def post(self, request, pk, *args, **kwargs):
		try:
			tournament = Tournament.objects.get(pk=pk)
			if tournament.creator != request.user:
				return Response(
					{'detail': 'Only the tournament creator can conclude it'},
					status=status.HTTP_403_FORBIDDEN
				)
			tournament.status = 'completed'
			participants = TournamentParticipant.objects.filter(tournament=tournament)
			winner = None
			max_wins = -1
			for participant in participants:
				wins = TournamentMatch.objects.filter(
					tournament=tournament,
					winner=participant
				).count()
				if wins > max_wins:
					max_wins = wins
					winner = participant
			if winner:
				tournament.winner_nickname = winner.nickname
			tournament.end_date = timezone.now()
			tournament.save()
			return Response(
				TournamentSerializer(tournament).data,
				status=status.HTTP_200_OK
			)
		except Tournament.DoesNotExist:
			return Response(
				{'detail': 'Tournament not found'},
				status=status.HTTP_404_NOT_FOUND
			)
		except Exception as e:
			return Response(
				{'detail': f'Error concluding tournament: {str(e)}'},
				status=status.HTTP_500_INTERNAL_SERVER_ERROR
			)

class TournamentMatchAPIView(APIView):
	"""
	API view for tournament match operations.
	GET: Get details of a specific match
	PUT: Update match results
	POST: Create a game_remote session for this match
	"""
	permission_classes = (IsAuthenticated,)

	def get(self, request, tournament_pk, match_pk, *args, **kwargs):
		try:
			match = TournamentMatch.objects.get(
				pk=match_pk,
				tournament_id=tournament_pk
			)
			tournament = match.tournament
			if tournament.creator != request.user:
				participants = TournamentParticipant.objects.filter(tournament=tournament)
				user_is_participant = False
				for participant in participants:
					if participant.nickname == request.user.game_userprofile.display_name:
						user_is_participant = True
						break
				if not user_is_participant:
					return Response(
						{'detail': 'You are not a participant in this tournament'},
						status=status.HTTP_403_FORBIDDEN
					)
			match_data = {
				'id': match.id,
				'round': match.round,
				'player_1': {
					'id': match.player_1.id,
					'nickname': match.player_1.nickname
				},
				'player_2': {
					'id': match.player_2.id,
					'nickname': match.player_2.nickname
				},
				'winner': match.winner.id if match.winner else None,
				'score_player_1': match.score_player_1,
				'score_player_2': match.score_player_2
			}
			return Response(match_data, status=status.HTTP_200_OK)
		except TournamentMatch.DoesNotExist:
			return Response(
				{'detail': 'Match not found'},
				status=status.HTTP_404_NOT_FOUND
			)
		except Exception as e:
			return Response(
				{'detail': f'Error retrieving match: {str(e)}'},
				status=status.HTTP_500_INTERNAL_SERVER_ERROR
			)

	def post(self, request, tournament_pk, match_pk, *args, **kwargs):
		try:
			match = TournamentMatch.objects.get(
				pk=match_pk,
				tournament_id=tournament_pk
			)
			if match.winner:
				return Response(
					{'detail': 'This match already has a result.'},
					status=status.HTTP_400_BAD_REQUEST
				)
			
			# Verifica che tutti i match precedenti (con ID inferiore) siano stati completati
			previous_matches = TournamentMatch.objects.filter(
				tournament_id=tournament_pk,
				pk__lt=match_pk,
				round=match.round
			)
			
			incomplete_matches = [m.pk for m in previous_matches if m.winner is None]
			if incomplete_matches:
				return Response(
					{'detail': f'Previous matches (IDs: {incomplete_matches}) must be completed first.'},
					status=status.HTTP_400_BAD_REQUEST
				)
				
			user_nickname = request.user.game_userprofile.display_name
			if user_nickname != match.player_1.nickname and user_nickname != match.player_2.nickname:
				return Response(
					{'detail': 'You are not a player in this match.'},
					status=status.HTTP_403_FORBIDDEN
				)
			try:
				player1 = User.objects.get(username=match.player_1.nickname)
				player2 = User.objects.get(username=match.player_2.nickname)
			except User.DoesNotExist:
				return Response(
					{'detail': 'One of the players does not exist.'},
					status=status.HTTP_400_BAD_REQUEST
				)
			existing_session = GameSession.objects.filter(
				Q(player1=player1, player2=player2) | 
				Q(player1=player2, player2=player1),
				status__in=["waiting", "ready"],
				session_type="tournament"
			).first()
			if existing_session:
				return Response({
					'game_id': existing_session.game_id,
					'player1': existing_session.player1_username,
					'player2': existing_session.player2_username,
					'status': existing_session.status
				}, status=status.HTTP_200_OK)
			game_session = GameSession.objects.create(
				player1=player1,
				player2=player2,
				player1_username=player1.game_userprofile.display_name,
				player2_username=player2.game_userprofile.display_name,
				status="waiting",
				session_type="tournament"
			)
			return Response({
				'game_id': game_session.game_id,
				'player1': player1.game_userprofile.display_name,
				'player2': player2.game_userprofile.display_name
			}, status=status.HTTP_201_CREATED)
		except TournamentMatch.DoesNotExist:
			return Response(
				{'detail': 'Match not found'},
				status=status.HTTP_404_NOT_FOUND
			)
		except Exception as e:
			return Response(
				{'detail': f'Error creating game session: {str(e)}'},
				status=status.HTTP_500_INTERNAL_SERVER_ERROR
			)

	def put(self, request, tournament_pk, match_pk, *args, **kwargs):
		try:
			match = TournamentMatch.objects.get(
				pk=match_pk,
				tournament_id=tournament_pk
			)
			tournament = match.tournament
			if tournament.creator != request.user:
				participants = TournamentParticipant.objects.filter(tournament=tournament)
				user_is_participant = False
				for participant in participants:
					if participant.nickname == request.user.game_userprofile.display_name:
						user_is_participant = True
						break
				if not user_is_participant:
					return Response(
						{'detail': 'You are not a participant in this tournament'},
						status=status.HTTP_403_FORBIDDEN
					)
			score_player_1 = request.data.get('score_player_1')
			score_player_2 = request.data.get('score_player_2')
			if score_player_1 is None or score_player_2 is None:
				return Response(
					{'detail': 'Both scores are required'},
					status=status.HTTP_400_BAD_REQUEST
				)
			try:
				score_player_1 = int(score_player_1)
				score_player_2 = int(score_player_2)
			except ValueError:
				return Response(
					{'detail': 'Scores must be integers'},
					status=status.HTTP_400_BAD_REQUEST
				)
			match.score_player_1 = score_player_1
			match.score_player_2 = score_player_2
			if score_player_1 > score_player_2:
				match.winner = match.player_1
			elif score_player_2 > score_player_1:
				match.winner = match.player_2
			else:
				return Response(
					{'detail': 'Scores cannot be tied'},
					status=status.HTTP_400_BAD_REQUEST
				)
			match.save()
			self._check_and_create_next_round_matches(match)
			match_data = {
				'id': match.id,
				'round': match.round,
				'player_1': {
					'id': match.player_1.id,
					'nickname': match.player_1.nickname
				},
				'player_2': {
					'id': match.player_2.id,
					'nickname': match.player_2.nickname
				},
				'winner': match.winner.id if match.winner else None,
				'score_player_1': match.score_player_1,
				'score_player_2': match.score_player_2
			}
			return Response(match_data, status=status.HTTP_200_OK)
		except TournamentMatch.DoesNotExist:
			return Response(
				{'detail': 'Match not found'},
				status=status.HTTP_404_NOT_FOUND
			)
		except Exception as e:
			return Response(
				{'detail': f'Error updating match: {str(e)}'},
				status=status.HTTP_500_INTERNAL_SERVER_ERROR
			)

	def _check_and_create_next_round_matches(self, completed_match):
		try:
			tournament = completed_match.tournament
			current_round = completed_match.round
			
			# Verifica che il match completato abbia un vincitore
			if not completed_match.winner:
				print(f"[Round Update] Match {completed_match.id} non ha un vincitore! Impossibile continuare.")
				return
				
			print(f"[Round Update] Verifica turno successivo per torneo {tournament.id}, round corrente {current_round}")
			
			round_matches = TournamentMatch.objects.filter(
				tournament=tournament,
				round=current_round
			)
			
			print(f"[Round Update] Trovati {round_matches.count()} match nel round {current_round}")
			
			all_completed = all(match.winner is not None for match in round_matches)
			if not all_completed:
				print(f"[Round Update] Non tutti i match del round {current_round} sono completati. In attesa...")
				return  # Not all matches are completed yet
				
			next_round = current_round + 1
			next_round_exists = TournamentMatch.objects.filter(
				tournament=tournament,
				round=next_round
			).exists()
			
			if next_round_exists:
				print(f"[Round Update] Il round {next_round} è già stato creato")
				return  # Next round already created
				
			winners = [match.winner for match in round_matches]
			print(f"[Round Update] Vincitori trovati: {len(winners)}")
			
			if len(winners) == 1:
				print(f"[Round Update] Un solo vincitore trovato: {winners[0].nickname}. Torneo concluso!")
				tournament.winner_nickname = winners[0].nickname
				tournament.status = 'completed'
				tournament.end_date = timezone.now()
				tournament.save()
				return
				
			matches_to_create = []
			# Fix: modifica la logica per gestire correttamente il caso con 2 vincitori (finale)
			for i in range(0, len(winners), 2):
				if i + 1 < len(winners):
					# Caso standard: accoppia i vincitori a due a due
					match = TournamentMatch(
						tournament=tournament,
						round=next_round,
						player_1=winners[i],
						player_2=winners[i + 1]
					)
					matches_to_create.append(match)
			
			# Se non sono stati creati match ma ci sono vincitori, crea la finale
			if len(matches_to_create) == 0 and len(winners) == 2:
				match = TournamentMatch(
					tournament=tournament,
					round=next_round,
					player_1=winners[0],
					player_2=winners[1]
				)
				matches_to_create.append(match)
				
			created_matches = TournamentMatch.objects.bulk_create(matches_to_create)
			print(f"[Round Update] Creati {len(created_matches)} match per il round {next_round}")
			
			for match in created_matches:
				print(f"[Round Update] Nuovo match creato: {match.player_1.nickname} vs {match.player_2.nickname}")
				
		except Exception as e:
			print(f"[Round Update] Errore nella creazione dei match del round successivo: {str(e)}")
			import traceback
			print(traceback.format_exc())
			raise

class TournamentJoinAPIView(APIView):
	"""
	API view for joining a tournament.
	POST: Join a tournament as a participant
	"""
	permission_classes = (IsAuthenticated,)

	def post(self, request, pk, *args, **kwargs):
		try:
			# Check if user has a display name
			if not hasattr(request.user, 'game_userprofile') or not request.user.game_userprofile.display_name:
				return Response(
					{'detail': 'You must set a display name before joining a tournament.'},
					status=status.HTTP_400_BAD_REQUEST
				)

			tournament = Tournament.objects.get(pk=pk)
			if tournament.status != 'registration_open':
				return Response(
					{'detail': f'This tournament is not open for registration. Current status: {tournament.status}'},
					status=status.HTTP_400_BAD_REQUEST
				)
			
			user_display_name = request.user.game_userprofile.display_name
			if TournamentParticipant.objects.filter(tournament=tournament, nickname=user_display_name).exists():
				return Response(
					{'detail': f'You are already registered for this tournament with nickname: {user_display_name}'},
					status=status.HTTP_400_BAD_REQUEST
				)
			
			current_participants = TournamentParticipant.objects.filter(tournament=tournament).count()
			if current_participants >= tournament.max_participants:
				return Response(
					{'detail': f'This tournament is already full. Current participants: {current_participants}/{tournament.max_participants}'},
					status=status.HTTP_400_BAD_REQUEST
				)
			
			participant = TournamentParticipant.objects.create(
				tournament=tournament,
				nickname=user_display_name
			)
			
			new_participant_count = TournamentParticipant.objects.filter(tournament=tournament).count()
			if new_participant_count == tournament.max_participants:
				tournament.status = 'in_progress'
				tournament.save()
				participants = list(TournamentParticipant.objects.filter(tournament=tournament))
				self._generate_tournament_matches(tournament, participants)
			
			return Response({
				'detail': 'Successfully joined tournament.',
				'tournament_id': tournament.id,
				'participant_id': participant.id,
				'nickname': user_display_name
			}, status=status.HTTP_200_OK)
		
		except Tournament.DoesNotExist:
			return Response(
				{'detail': 'Tournament not found.'},
				status=status.HTTP_404_NOT_FOUND
			)
		except Exception as e:
			import traceback
			error_details = traceback.format_exc()
			return Response(
				{
					'detail': f'Error joining tournament: {str(e)}',
					'error_details': error_details
				},
				status=status.HTTP_500_INTERNAL_SERVER_ERROR
			)

	def _generate_tournament_matches(self, tournament, participants):
		"""Generate matches for a tournament using a bracket system"""
		random.shuffle(participants)  # Randomize the order of participants
		num_participants = len(participants)
		num_rounds = math.ceil(math.log2(num_participants))
		matches_to_create = []
		
		# Calculate number of matches in first round
		first_round_matches = num_participants - (2 ** (num_rounds - 1))
		if first_round_matches == 0:
			first_round_matches = num_participants // 2
		
		print(f"[Tournament Matches] Creating {first_round_matches} matches for round 1")
		print(f"[Tournament Matches] Total participants: {num_participants}")
		
		# Create first round matches
		for i in range(first_round_matches):
			player1 = participants[i * 2]
			player2 = participants[i * 2 + 1]
			match = TournamentMatch(
				tournament=tournament,
				round=1,
				player_1=player1,
				player_2=player2
			)
			matches_to_create.append(match)
			print(f"[Tournament Matches] Match created: {player1.nickname} vs {player2.nickname}")
		
		# Bulk create all matches
		created_matches = TournamentMatch.objects.bulk_create(matches_to_create)
		print(f"[Tournament Matches] Successfully created {len(created_matches)} matches")

class TournamentLeaveAPIView(APIView):
	"""
	API view for leaving a tournament.
	POST: Unregister from a tournament as a participant
	"""
	permission_classes = (IsAuthenticated,)

	def post(self, request, pk, *args, **kwargs):
		try:
			tournament = Tournament.objects.get(pk=pk)
			if tournament.status != 'registration_open':
				return Response(
					{'detail': 'You cannot leave a tournament that has already started or is completed.'},
					status=status.HTTP_400_BAD_REQUEST
				)
			try:
				participant = TournamentParticipant.objects.get(tournament=tournament, nickname=request.user.game_userprofile.display_name)
			except TournamentParticipant.DoesNotExist:
				return Response(
					{'detail': 'You are not registered for this tournament.'},
					status=status.HTTP_400_BAD_REQUEST
				)
			participant_count = TournamentParticipant.objects.filter(tournament=tournament).count()
			if participant_count == 1 and tournament.creator == request.user:
				tournament.delete()
				return Response({'detail': 'You were the last participant. Tournament has been deleted.'}, 
								status=status.HTTP_200_OK)
			participant.delete()
			tournament.num_participants = TournamentParticipant.objects.filter(tournament=tournament).count()
			tournament.save()
			return Response({'detail': 'Successfully left the tournament.'}, status=status.HTTP_200_OK)
		except Tournament.DoesNotExist:
			return Response(
				{'detail': 'Tournament not found.'},
				status=status.HTTP_404_NOT_FOUND
			)
		except Exception as e:
			return Response(
				{'detail': f'Error leaving tournament: {str(e)}'},
				status=status.HTTP_500_INTERNAL_SERVER_ERROR
			)