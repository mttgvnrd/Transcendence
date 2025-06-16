import pyotp
import qrcode
from io import BytesIO
import base64
import random
import string

def generate_secret_key():
	"""Generate a new secret key for 2FA"""
	return pyotp.random_base32()

def generate_qr_code(secret_key, username):
	"""Generate QR code for Google Authenticator"""
	totp = pyotp.TOTP(secret_key)
	provisioning_uri = totp.provisioning_uri(username, issuer_name="Pong Game")

	qr = qrcode.QRCode(version=1, box_size=10, border=5)
	qr.add_data(provisioning_uri)
	qr.make(fit=True)

	img = qr.make_image(fill_color="#0d6efd", back_color="#ffffff")
	buffered = BytesIO()
	img.save(buffered, format="PNG")
	return base64.b64encode(buffered.getvalue()).decode()

def verify_token(secret_key, token):
	"""Verify the 2FA token"""
	totp = pyotp.TOTP(secret_key)
	return totp.verify(token)

def generate_backup_codes(count=10):
	"""Generate backup codes for 2FA"""
	codes = []
	for _ in range(count):
		code = ''.join(random.choices(string.ascii_uppercase + string.digits, k=8))
		codes.append(code)
	return codes 