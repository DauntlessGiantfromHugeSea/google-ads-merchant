"""Symmetrische Verschlüsselung für gespeicherte OAuth-Tokens (Fernet).

Im Dev-Modus ohne gesetzten Key wird ein flüchtiger Key erzeugt, damit das
System startet. Für Produktion MUSS CREDENTIAL_ENCRYPTION_KEY gesetzt sein,
sonst sind gespeicherte Tokens nach Neustart nicht mehr entschlüsselbar.
"""
import base64
import hashlib

from cryptography.fernet import Fernet

from app.config import get_settings

settings = get_settings()


def _get_fernet() -> Fernet:
    key = settings.credential_encryption_key
    if not key:
        # Dev-Fallback: deterministisch aus secret_key abgeleitet.
        digest = hashlib.sha256(settings.secret_key.encode()).digest()
        key = base64.urlsafe_b64encode(digest).decode()
    return Fernet(key.encode() if isinstance(key, str) else key)


def encrypt(plaintext: str) -> str:
    if not plaintext:
        return ""
    return _get_fernet().encrypt(plaintext.encode()).decode()


def decrypt(token: str) -> str:
    if not token:
        return ""
    return _get_fernet().decrypt(token.encode()).decode()
