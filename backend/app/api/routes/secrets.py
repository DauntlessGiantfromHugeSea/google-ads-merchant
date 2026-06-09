"""Passwort-Safe: Ende-zu-Ende verschlüsselte Einmal-Geheimnisse.

Der Server speichert nur den Chiffretext. Ver-/Entschlüsselung passiert im
Browser; der Schlüssel reist im URL-Fragment und erreicht den Server nie.
Nach `views_left` Aufrufen oder Ablauf wird der Eintrag gelöscht. Anlegen
erfordert Login (beide Seiten), Abrufen ist per Link öffentlich.
"""
import secrets as pysecrets
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.database import get_db
from app.models import Secret, User
from app.schemas import SecretCreate, SecretInfoOut, SecretRevealOut

router = APIRouter(prefix="/api/secrets", tags=["secrets"])


def _expired(sec: Secret) -> bool:
    if sec.expires_at is None:
        return False
    exp = sec.expires_at
    if exp.tzinfo is None:
        exp = exp.replace(tzinfo=timezone.utc)
    return exp < datetime.now(timezone.utc)


@router.post("", status_code=201)
def create_secret(data: SecretCreate, user: User = Depends(get_current_user), db: Session = Depends(get_db)) -> dict:
    views = max(1, min(10, data.views_left))
    ttl = max(1, min(720, data.ttl_hours))  # 1 h … 30 Tage
    sid = pysecrets.token_urlsafe(24)
    sec = Secret(
        id=sid, ciphertext=data.ciphertext, iv=data.iv, views_left=views,
        note=data.note[:255], created_by=user.full_name or user.email,
        expires_at=datetime.now(timezone.utc) + timedelta(hours=ttl),
    )
    db.add(sec)
    db.commit()
    return {"id": sid, "views_left": views}


@router.get("/{sid}", response_model=SecretInfoOut)
def secret_info(sid: str, db: Session = Depends(get_db)):
    """Öffentlich: Existenz + Restaufrufe, OHNE einen Aufruf zu verbrauchen."""
    sec = db.get(Secret, sid)
    if not sec or _expired(sec) or sec.views_left <= 0:
        if sec:
            db.delete(sec)
            db.commit()
        raise HTTPException(status.HTTP_410_GONE, "Nicht (mehr) verfügbar")
    return SecretInfoOut(id=sec.id, views_left=sec.views_left, note=sec.note,
                         created_by=sec.created_by, expires_at=sec.expires_at)


@router.post("/{sid}/reveal", response_model=SecretRevealOut)
def reveal_secret(sid: str, db: Session = Depends(get_db)):
    """Öffentlich: liefert den Chiffretext und verbraucht einen Aufruf."""
    sec = db.get(Secret, sid)
    if not sec or _expired(sec) or sec.views_left <= 0:
        if sec:
            db.delete(sec)
            db.commit()
        raise HTTPException(status.HTTP_410_GONE, "Nicht (mehr) verfügbar")
    sec.views_left -= 1
    remaining = sec.views_left
    ciphertext, iv = sec.ciphertext, sec.iv
    if remaining <= 0:
        db.delete(sec)
    db.commit()
    return SecretRevealOut(ciphertext=ciphertext, iv=iv, views_left=remaining)
