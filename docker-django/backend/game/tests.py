from django.test import TestCase

# Create your tests here.
from django.contrib.auth.models import User
from .models import GameSession
import logging
logger = logging.getLogger(__name__)
import uuid
from .game_utils import create_new_game_session
from django.conf import settings
from django.test import TestCase
from django.db import connection


class GameSessionTestCase(TestCase):
	def test_create_new_game_session(self):
		try:
			logger.info(f"Database di test: {connection.creation.create_test_db()}")
		except Exception as e:
			logger.error(f"Errore durante la creazione del database: {e}")
		user = User.objects.create_user(username='testuser', password='testpassword')
		new_game = create_new_game_session(user)
		self.assertIsNotNone(new_game)
		self.assertIsInstance(new_game, GameSession)
		self.assertIsNotNone(new_game.id)
		self.assertEqual(new_game.player1, user)
		game_from_db = GameSession.objects.get(id=new_game.id)
		self.assertEqual(game_from_db, new_game)
