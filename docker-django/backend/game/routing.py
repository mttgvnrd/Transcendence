from django.urls import re_path
from . import consumers

websocket_urlpatterns = [
	re_path(r'ws/game/(?P<game_id>[^/]+)/$', consumers.GameConsumer.as_asgi()),
	re_path(r'ws/status/$', consumers.UserStatusConsumer.as_asgi()),
]