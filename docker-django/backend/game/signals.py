from django.db.models.signals import post_save
from django.dispatch import receiver
from django.contrib.auth.models import User
from .models import UserProfile

@receiver(post_save, sender=User)
def create_user_profile(sender, instance, created, **kwargs):
	if created:
		try:
			# Assicurati che lo username sia lungo almeno 3 caratteri
			display_name = instance.username
			if len(display_name) < 3:
				display_name = display_name.ljust(3, '1')  # Aggiungi '1' fino a raggiungere 3 caratteri
			
			# Se esiste già un profilo con questo display_name, aggiungi un numero progressivo
			base_display_name = display_name
			counter = 1
			while UserProfile.objects.filter(display_name=display_name).exists():
				display_name = f"{base_display_name}{counter}"
				counter += 1
			
			# Crea il profilo con il display_name validato
			UserProfile.objects.create(user=instance, display_name=display_name)
			print(f"Profilo utente creato con successo per {instance.username} con display_name: {display_name}")
		except Exception as e:
			print(f"Errore durante la creazione del profilo utente: {e}")

@receiver(post_save, sender=User)
def save_user_profile(sender, instance, **kwargs):
	try:
		instance.game_userprofile.save()
	except UserProfile.DoesNotExist:
		# Se il profilo non esiste, crealo
		display_name = instance.username
		if len(display_name) < 3:
			display_name = display_name.ljust(3, '1')
		
		base_display_name = display_name
		counter = 1
		while UserProfile.objects.filter(display_name=display_name).exists():
			display_name = f"{base_display_name}{counter}"
			counter += 1
		
		UserProfile.objects.create(user=instance, display_name=display_name)
