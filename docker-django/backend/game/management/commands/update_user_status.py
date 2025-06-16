from django.core.management.base import BaseCommand
from django.utils import timezone
from datetime import timedelta
from backend.game.models import UserProfile
import logging

logger = logging.getLogger(__name__)

class Command(BaseCommand):
    help = 'Aggiorna lo stato online/offline degli utenti'

    def handle(self, *args, **options):
        # Considera gli utenti non attivi da più di 1 minuto come offline
        cutoff_time = timezone.now() - timedelta(minutes=1)
        
        # Trova tutti gli utenti attualmente segnati come online
        # ma che non hanno attività recente
        profiles = UserProfile.objects.filter(
            is_online=True,
            last_seen__lt=cutoff_time
        )
        
        count = profiles.count()
        if count > 0:
            # Imposta questi utenti come offline
            profiles.update(is_online=False)
            logger.info(f"Aggiornati {count} utenti da online a offline")
            self.stdout.write(
                self.style.SUCCESS(f"Aggiornati con successo {count} utenti da online a offline")
            )
        else:
            logger.info("Nessun utente da aggiornare")
            self.stdout.write(
                self.style.SUCCESS("Nessun utente da aggiornare")
            ) 