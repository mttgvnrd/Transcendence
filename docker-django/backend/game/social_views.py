from rest_framework import status
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework.permissions import IsAuthenticated
from django.contrib.auth.models import User
from .models import Friendship, FriendRequest
from django.shortcuts import get_object_or_404
from django.db.models import Q

class UserSearchAPIView(APIView):
	"""
	API view for searching users.
	GET: Search users by username
	"""
	permission_classes = (IsAuthenticated,)

	def get(self, request, *args, **kwargs):
		query = request.GET.get('search', '')
		if query:
			friend_ids = Friendship.objects.filter(user=request.user).values_list('friend_id', flat=True)
			users = User.objects.filter(username__istartswith=query).exclude(id=request.user.id).exclude(id__in=friend_ids)
			pending_requests = FriendRequest.objects.filter(
				sender=request.user,
				status='pending'
			).values_list('recipient_id', flat=True)
			users_data = []
			for user in users:
				user_data = {
					'id': user.id,
					'username': user.username,
					'has_pending_request': user.id in pending_requests
				}
				users_data.append(user_data)
			return Response({'users': users_data}, status=status.HTTP_200_OK)
		return Response({'users': []}, status=status.HTTP_200_OK)

class FriendRequestAPIView(APIView):
	"""
	API view per inviare richieste di amicizia.
	POST: Invia una richiesta di amicizia a un utente specifico
	"""
	permission_classes = (IsAuthenticated,)

	def post(self, request, user_id, *args, **kwargs):
		try:
			recipient = User.objects.get(id=user_id)
			if recipient == request.user:
				return Response(
					{"detail": "Non puoi inviare una richiesta di amicizia a te stesso."},
					status=status.HTTP_400_BAD_REQUEST
				)
			if Friendship.objects.filter(user=request.user, friend=recipient).exists() or \
				Friendship.objects.filter(user=recipient, friend=request.user).exists():
				return Response(
					{"detail": "Siete già amici."},
					status=status.HTTP_400_BAD_REQUEST
				)

			# Cerca tutte le richieste esistenti tra i due utenti (in entrambe le direzioni)
			existing_requests = FriendRequest.objects.filter(
				(Q(sender=request.user, recipient=recipient) |
				 Q(sender=recipient, recipient=request.user))
			)

			# Se esistono richieste, le eliminiamo tutte
			if existing_requests.exists():
				existing_requests.delete()

			# Crea una nuova richiesta
			FriendRequest.objects.create(sender=request.user, recipient=recipient)
			return Response(
				{"detail": f"Richiesta di amicizia inviata a {recipient.username}."},
				status=status.HTTP_201_CREATED
			)
		except User.DoesNotExist:
			return Response(
				{"detail": "Utente non trovato."},
				status=status.HTTP_404_NOT_FOUND
			)
		except Exception as e:
			return Response(
				{"detail": f"Si è verificato un errore: {str(e)}"},
				status=status.HTTP_500_INTERNAL_SERVER_ERROR
			)
		
class DisplayFriendRequestsAPIView(APIView):
	"""
	API view per visualizzare le richieste di amicizia.
	"""
	permission_classes = (IsAuthenticated,)

	def get(self, request, *args, **kwargs):
		try:
			friend_requests = FriendRequest.objects.filter(recipient=request.user, status='pending')
			friend_requests_data = [
				{
					'id': fr.id,
					'sender': fr.sender.username,
					'recipient': fr.recipient.username,
					'status': fr.status
				} for fr in friend_requests
			]
			return Response({'requests': friend_requests_data}, status=status.HTTP_200_OK)
		except Exception as e:
			return Response(
				{"detail": f"Si è verificato un errore: {str(e)}"},
				status=status.HTTP_500_INTERNAL_SERVER_ERROR
			)
		
class AcceptFriendRequestAPIView(APIView):
	"""
	API view per accettare una richiesta di amicizia.
	POST: Accetta la richiesta di amicizia e crea una relazione di amicizia tra gli utenti
	"""
	permission_classes = (IsAuthenticated,)

	def post(self, request, request_id, *args, **kwargs):
		try:
			friend_request = get_object_or_404(FriendRequest, id=request_id)
			if friend_request.recipient != request.user:
				return Response(
					{"detail": "Non puoi accettare questa richiesta di amicizia."},
					status=status.HTTP_403_FORBIDDEN
				)
			if friend_request.status != 'pending':
				return Response(
					{"detail": "Questa richiesta di amicizia è già stata elaborata."},
					status=status.HTTP_400_BAD_REQUEST
				)
			if not Friendship.objects.filter(user=friend_request.sender, friend=friend_request.recipient).exists() and \
				not Friendship.objects.filter(user=friend_request.recipient, friend=friend_request.sender).exists():
				Friendship.objects.create(user=friend_request.sender, friend=friend_request.recipient)
				Friendship.objects.create(user=friend_request.recipient, friend=friend_request.sender)
			friend_request.status = 'accepted'
			friend_request.save()
			return Response(
				{"detail": f"Hai accettato la richiesta di amicizia di {friend_request.sender.username}."},
				status=status.HTTP_200_OK
			)
		except FriendRequest.DoesNotExist:
			return Response(
				{"detail": "Richiesta di amicizia non trovata."},
				status=status.HTTP_404_NOT_FOUND
			)
		except Exception as e:
			return Response(
				{"detail": f"Si è verificato un errore: {str(e)}"},
				status=status.HTTP_500_INTERNAL_SERVER_ERROR
			)
		
class RejectFriendRequestAPIView(APIView):
	"""
	API view per rifiutare una richiesta di amicizia.
	POST: Rifiuta la richiesta di amicizia
	"""
	permission_classes = (IsAuthenticated,)

	def post(self, request, request_id, *args, **kwargs):
		try:
			friend_request = get_object_or_404(FriendRequest, id=request_id)
			if friend_request.recipient != request.user:
				return Response(
					{"detail": "Non puoi rifiutare questa richiesta di amicizia."},
					status=status.HTTP_403_FORBIDDEN
				)
			if friend_request.status != 'pending':
				return Response(
					{"detail": "Questa richiesta di amicizia è già stata elaborata."},
					status=status.HTTP_400_BAD_REQUEST
				)
			friend_request.status = 'declined'
			friend_request.save()
			return Response(
				{"detail": "Richiesta di amicizia rifiutata."},
				status=status.HTTP_200_OK
			)
		except FriendRequest.DoesNotExist:
			return Response(
				{"detail": "Richiesta di amicizia non trovata."},
				status=status.HTTP_404_NOT_FOUND
			)
		except Exception as e:
			return Response(
				{"detail": f"Si è verificato un errore: {str(e)}"},
				status=status.HTTP_500_INTERNAL_SERVER_ERROR
			)
		
class FriendListAPIView(APIView):
	"""
	API view per ottenere la lista degli amici.
	GET: Restituisce la lista degli amici dell'utente autenticato
	"""
	permission_classes = (IsAuthenticated,)

	def get(self, request, *args, **kwargs):
		try:
			friendships = Friendship.objects.filter(user=request.user)
			friends_data = []
			for friendship in friendships:
				is_online = hasattr(friendship.friend, 'game_userprofile') and friendship.friend.game_userprofile.is_online
				friends_data.append({
					'id': friendship.friend.id,
					'username': friendship.friend.username,
					'is_online': is_online
				})
			return Response({'friends': friends_data}, status=status.HTTP_200_OK)
		except Exception as e:
			return Response(
				{"detail": f"Si è verificato un errore: {str(e)}"},
				status=status.HTTP_500_INTERNAL_SERVER_ERROR
			)

class RemoveFriendAPIView(APIView):
	"""
	API view per rimuovere un amico dalla lista amici.
	POST: Rimuove l'amicizia tra l'utente autenticato e l'amico specificato
	"""
	permission_classes = (IsAuthenticated,)

	def post(self, request, friend_id, *args, **kwargs):
		try:
			friend = get_object_or_404(User, id=friend_id)
			
			# Verifica se esiste l'amicizia
			friendship1 = Friendship.objects.filter(user=request.user, friend=friend)
			friendship2 = Friendship.objects.filter(user=friend, friend=request.user)
			
			if not friendship1.exists() and not friendship2.exists():
				return Response(
					{"detail": "Questo utente non è nella tua lista amici."},
					status=status.HTTP_400_BAD_REQUEST
				)
			
			# Rimuovi entrambe le relazioni di amicizia
			friendship1.delete()
			friendship2.delete()
			
			return Response(
				{"detail": f"Hai rimosso {friend.username} dalla tua lista amici."},
				status=status.HTTP_200_OK
			)
		except User.DoesNotExist:
			return Response(
				{"detail": "Utente non trovato."},
				status=status.HTTP_404_NOT_FOUND
			)
		except Exception as e:
			return Response(
				{"detail": f"Si è verificato un errore: {str(e)}"},
				status=status.HTTP_500_INTERNAL_SERVER_ERROR
			)