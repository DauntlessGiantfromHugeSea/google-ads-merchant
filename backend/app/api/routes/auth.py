"""Registrierung (Agentur + Admin), Login und Zwei-Faktor-Authentifizierung."""
import math
from datetime import datetime, timedelta, timezone

import pyotp
import segno
from fastapi import APIRouter, Depends, Form, HTTPException, status
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.core.crypto import decrypt, encrypt
from app.core.security import create_access_token, hash_password, password_problem, verify_password
from app.database import get_db
from app.models import Organization, User, UserRole
from app.schemas import (
    RegisterRequest, SetPasswordRequest, Token, TwoFACode, TwoFASetupOut, UserOut,
)

router = APIRouter(prefix="/api/auth", tags=["auth"])
_ISSUER = "North Flow"

# Brute-Force-Schutz: nach so vielen Fehlversuchen wird das Konto zeitweise gesperrt.
_MAX_FAILED_LOGINS = 5
_LOCK_MINUTES = 15
# Fester Dummy-Hash, um die Antwortzeit bei unbekannter E-Mail anzugleichen
# (erschwert das Erraten gültiger Adressen über Timing).
_DUMMY_HASH = "$2b$12$" + "z" * 53


def _aware(dt: datetime | None) -> datetime | None:
    if dt is None:
        return None
    return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)


def _register_failure(user: User, db: Session) -> None:
    """Zählt einen Fehlversuch; sperrt das Konto ab der Grenze für eine Weile."""
    user.failed_logins = (user.failed_logins or 0) + 1
    if user.failed_logins >= _MAX_FAILED_LOGINS:
        user.locked_until = datetime.now(timezone.utc) + timedelta(minutes=_LOCK_MINUTES)
        user.failed_logins = 0
    db.commit()


def _verify_totp(user: User, code: str) -> bool:
    secret = decrypt(user.totp_secret)
    if not secret or not code:
        return False
    return pyotp.TOTP(secret).verify(code.strip().replace(" ", ""), valid_window=1)


def _invite_user(token: str, db: Session) -> User:
    u = db.query(User).filter(User.invite_token == token).first()
    if not u or not token:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Einladung ungültig")
    exp = u.invite_expires
    if exp is not None:
        if exp.tzinfo is None:
            exp = exp.replace(tzinfo=timezone.utc)
        if exp < datetime.now(timezone.utc):
            raise HTTPException(status.HTTP_410_GONE, "Einladung abgelaufen")
    return u


@router.get("/invite/{token}")
def invite_info(token: str, db: Session = Depends(get_db)) -> dict:
    u = _invite_user(token, db)
    return {"email": u.email, "full_name": u.full_name}


@router.post("/invite/{token}", response_model=Token)
def invite_set_password(token: str, data: SetPasswordRequest, db: Session = Depends(get_db)) -> Token:
    if (msg := password_problem(data.password)):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, msg)
    u = _invite_user(token, db)
    u.hashed_password = hash_password(data.password)
    u.invite_token = ""
    u.invite_expires = None
    db.commit()
    tok = create_access_token(u.id, {"role": u.role.value, "org": u.organization_id})
    return Token(access_token=tok)


@router.get("/registration-open")
def registration_open(db: Session = Depends(get_db)) -> dict:
    """Selbst-Registrierung ist nur beim Erst-Setup offen (keine Agentur da)."""
    return {"open": db.query(Organization).first() is None}


@router.post("/register", response_model=UserOut, status_code=201)
def register(data: RegisterRequest, db: Session = Depends(get_db)) -> User:
    """Legt EINMALIG die Agentur an und macht den ersten Nutzer zum Admin.
    Danach ist Selbst-Registrierung gesperrt – neue Nutzer kommen nur noch
    über die Einladung durch die Agentur (Kunden-Zugänge) hinein."""
    if db.query(Organization).first():
        raise HTTPException(
            status.HTTP_403_FORBIDDEN,
            "Registrierung ist geschlossen. Zugänge werden nur per Einladung vergeben.",
        )
    if db.query(User).filter(User.email == data.email).first():
        raise HTTPException(status.HTTP_409_CONFLICT, "E-Mail bereits registriert")
    if (msg := password_problem(data.password)):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, msg)
    org = Organization(name=data.organization_name)
    db.add(org)
    db.flush()
    user = User(
        email=data.email,
        full_name=data.full_name,
        hashed_password=hash_password(data.password),
        role=UserRole.agency_admin,
        organization_id=org.id,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


@router.post("/login", response_model=Token)
def login(
    form: OAuth2PasswordRequestForm = Depends(),
    otp: str | None = Form(None),
    db: Session = Depends(get_db),
) -> Token:
    now = datetime.now(timezone.utc)
    user = db.query(User).filter(User.email == form.username).first()

    # Konto zeitweise gesperrt? (Anmelde-Timeout nach zu vielen Fehlversuchen)
    if user:
        locked = _aware(user.locked_until)
        if locked and locked > now:
            mins = max(1, math.ceil((locked - now).total_seconds() / 60))
            raise HTTPException(
                status.HTTP_429_TOO_MANY_REQUESTS,
                f"Zu viele Fehlversuche. Konto für {mins} Minute(n) gesperrt – bitte später erneut.")

    # Passwort prüfen (bei unbekannter E-Mail Dummy-Prüfung gegen Timing-Angriffe)
    if not user or not verify_password(form.password, user.hashed_password):
        if not user:
            verify_password(form.password, _DUMMY_HASH)
        else:
            _register_failure(user, db)
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Falsche Zugangsdaten")

    if user.totp_enabled:
        if not otp:
            # Passwort war korrekt – nur der zweite Faktor fehlt (kein Fehlversuch).
            # Frontend erkennt diesen Code und blendet das 2FA-Feld ein.
            raise HTTPException(status.HTTP_401_UNAUTHORIZED, "2FA_REQUIRED")
        if not _verify_totp(user, otp):
            _register_failure(user, db)  # falsche Codes zählen zum Brute-Force-Schutz
            raise HTTPException(status.HTTP_401_UNAUTHORIZED, "2FA_INVALID")

    # Erfolg: Fehlversuche/Sperre zurücksetzen.
    if user.failed_logins or user.locked_until:
        user.failed_logins = 0
        user.locked_until = None
        db.commit()
    token = create_access_token(user.id, {"role": user.role.value, "org": user.organization_id})
    return Token(access_token=token)


@router.get("/me", response_model=UserOut)
def me(user: User = Depends(get_current_user)) -> User:
    return user


# --- Zwei-Faktor-Authentifizierung (TOTP, Authenticator-App) ---
@router.post("/2fa/setup", response_model=TwoFASetupOut)
def twofa_setup(user: User = Depends(get_current_user), db: Session = Depends(get_db)) -> TwoFASetupOut:
    """Erzeugt ein neues TOTP-Secret (noch nicht aktiv) inkl. QR-Code."""
    secret = pyotp.random_base32()
    uri = pyotp.TOTP(secret).provisioning_uri(name=user.email, issuer_name=_ISSUER)
    user.totp_secret = encrypt(secret)
    user.totp_enabled = False
    db.commit()
    qr = segno.make(uri, error="m").svg_data_uri(scale=5, dark="#0c0c10", light="#ffffff")
    return TwoFASetupOut(secret=secret, otpauth_uri=uri, qr_svg=qr)


@router.post("/2fa/enable", response_model=UserOut)
def twofa_enable(data: TwoFACode, user: User = Depends(get_current_user), db: Session = Depends(get_db)) -> User:
    """Aktiviert 2FA nach Prüfung des ersten Codes aus der App."""
    if user.totp_enabled:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "2FA ist bereits aktiv")
    if not _verify_totp(user, data.code):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Code ungültig – bitte erneut versuchen")
    user.totp_enabled = True
    db.commit()
    db.refresh(user)
    return user


@router.post("/2fa/disable", response_model=UserOut)
def twofa_disable(data: TwoFACode, user: User = Depends(get_current_user), db: Session = Depends(get_db)) -> User:
    """Schaltet 2FA ab (Bestätigung mit gültigem Code)."""
    if not user.totp_enabled:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "2FA ist nicht aktiv")
    if not _verify_totp(user, data.code):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Code ungültig")
    user.totp_enabled = False
    user.totp_secret = ""
    db.commit()
    db.refresh(user)
    return user
