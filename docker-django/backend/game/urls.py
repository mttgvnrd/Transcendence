from django.conf import settings
from django.urls import path
from django.conf.urls.static import static

from .auth_views import (
	UserRegistrationAPIView, UserLoginAPIView, LogoutView,
	CookieTokenRefreshView, GetCSRFTokenView, CheckAuthStatus,
	GetAccessToken, Setup2FAAPIView, Verify2FAAPIView,
	Verify2FALoginAPIView, Disable2FAAPIView
)

from .user_views import (
	UserAccountAPIView, DeleteAccountAPIView,
	ProfileImageUploadAPIView, UsernameAPIView, RecentMatchesAPIView
)

from .tournament_views import (
	TournamentAPIView, TournamentDetailAPIView, ConcludeTournamentAPIView,
	TournamentMatchAPIView, TournamentJoinAPIView, TournamentLeaveAPIView,
	BlockchainCallbackAPIView
)

from .social_views import (
	UserSearchAPIView, FriendRequestAPIView, DisplayFriendRequestsAPIView,
	AcceptFriendRequestAPIView, RejectFriendRequestAPIView, FriendListAPIView,
	RemoveFriendAPIView
)

from .game_views import (
	FindOrCreateGameSession, JoinGameSession, GetGameSession, CleanupGameSession
)
urlpatterns = [
	path('api/auth/register/', UserRegistrationAPIView.as_view(), name='api_register'),
	path('api/auth/login/', UserLoginAPIView.as_view(), name='api_login'),
	path('api/auth/logout/', LogoutView.as_view(), name='api_logout'),
	path('api/auth/token/refresh/', CookieTokenRefreshView.as_view(), name='token_refresh'),
	path('api/auth/token/', GetAccessToken.as_view(), name='get_access_token'),
	path('api/auth/status/', CheckAuthStatus.as_view(), name='auth_status'),
	path('api/auth/2fa/setup/', Setup2FAAPIView.as_view(), name='api_2fa_setup'),
	path('api/auth/2fa/verify/', Verify2FAAPIView.as_view(), name='api_2fa_verify'),
	path('api/auth/2fa/disable/', Disable2FAAPIView.as_view(), name='api_2fa_disable'),
	path('api/account/delete/', DeleteAccountAPIView.as_view(), name='api_delete_account'),
	path('api/account/', UserAccountAPIView.as_view(), name='api_account'),
	path('api/csrf/', GetCSRFTokenView.as_view(), name='get_csrf_token'),
	path('api/tournaments/', TournamentAPIView.as_view(), name='api_tournaments'),
	path('api/tournaments/<int:pk>/', TournamentDetailAPIView.as_view(), name='api_tournament_detail'),
	path('api/tournaments/<int:pk>/join/', TournamentJoinAPIView.as_view(), name='api_tournament_join'),
	path('api/tournaments/<int:pk>/leave/', TournamentLeaveAPIView.as_view(), name='api_tournament_leave'),
	path('api/tournaments/<int:pk>/conclude/', ConcludeTournamentAPIView.as_view(), name='api_conclude_tournament'),
	path('api/tournaments/<int:tournament_pk>/matches/<int:match_pk>/', TournamentMatchAPIView.as_view(), name='api_tournament_match'),
	path('api/tournaments/<int:tournament_pk>/matches/<int:match_pk>/blockchain-callback/', BlockchainCallbackAPIView.as_view(), name='api_blockchain_callback'),
	path('api/auth/2fa/login/verify/', Verify2FALoginAPIView.as_view(), name='api_2fa_login_verify'),
	path('api/friend/search/', UserSearchAPIView.as_view(), name='api_search_users'),
	path('api/friend/list/', FriendListAPIView.as_view(), name='api_friend_list'),
	path('api/friend/request/send/<int:user_id>/', FriendRequestAPIView.as_view(), name='api_send_friend_request'),
	path('api/friend/requests/', DisplayFriendRequestsAPIView.as_view(), name='api_display_friend_requests'),
	path('api/friend/request/accept/<int:request_id>/', AcceptFriendRequestAPIView.as_view(), name='api_accept_friend_request'),
	path('api/friend/request/reject/<int:request_id>/', RejectFriendRequestAPIView.as_view(), name='api_reject_friend_request'),
	path('api/friend/remove/<int:friend_id>/', RemoveFriendAPIView.as_view(), name='api_remove_friend'),
	path('api/games/sessions/', FindOrCreateGameSession.as_view(), name='api_find_or_create_game'),
	path('api/games/sessions/<uuid:game_id>/join/', JoinGameSession.as_view(), name='api_join_game'),
	path('api/games/sessions/<uuid:game_id>/', GetGameSession.as_view(), name='api_get_game'),
	path('api/games/sessions/<uuid:game_id>/cleanup/', CleanupGameSession.as_view(), name='cleanup_game_session'),
	path('api/account/upload-image/', ProfileImageUploadAPIView.as_view(), name='api_upload_profile_image'),
	path('api/users/me/', UsernameAPIView.as_view(), name='api_get_username'),
	path('api/matches/recent/', RecentMatchesAPIView.as_view(), name='api_recent_matches'),
]

urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)
urlpatterns += static(settings.STATIC_URL, document_root=settings.STATIC_ROOT)