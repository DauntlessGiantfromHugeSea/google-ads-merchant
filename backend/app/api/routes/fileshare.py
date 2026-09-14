"""Sichere Dateifreigabe.

Mehrere Dateien in EINER Freigabe, die nur eine vorab festgelegte Empfänger-Mail
öffnen darf: Der Empfänger gibt seine Mail an, bekommt einen Code an genau diese
Adresse, und erst nach Eingabe des Codes sieht/lädt er die Dateien.
Limitiert auf Anzahl Öffnungen (0 = unbegrenzt) und Dauer; danach werden die
Dateien vom Server gelöscht.
"""
import os
import re
import secrets as pysecrets
import shutil
from datetime import datetime, timedelta, timezone

import httpx
from fastapi import APIRouter, Depends, File, Form, HTTPException, Request, UploadFile, status
from fastapi.responses import FileResponse, StreamingResponse
from sqlalchemy.orm import Session
from starlette.background import BackgroundTask

from app.api.deps import get_db, require_agency
from app.config import get_settings
from app.core.security import create_access_token, decode_access_token
from app.models import FileShare, Organization, User

settings = get_settings()
router = APIRouter(prefix="/api/shares", tags=["fileshare"])
public_router = APIRouter(prefix="/api/share", tags=["fileshare"])

_EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
_GRACE = timedelta(minutes=30)   # nach Aufbrauch/Ablauf noch so lange laufende Downloads zulassen


def _share_dir(share_id: str) -> str:
    return os.path.join(settings.upload_dir, "shares", share_id)


def _public_url(token: str) -> str:
    return f"{settings.public_base_url.rstrip('/')}/freigabe/{token}"


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _aware(dt: datetime | None) -> datetime | None:
    if dt and dt.tzinfo is None:
        return dt.replace(tzinfo=timezone.utc)
    return dt


def _time_expired(s: FileShare) -> bool:
    exp = _aware(s.expires_at)
    return bool(exp and _now() > exp)


def _spent(s: FileShare) -> bool:
    return s.max_opens > 0 and s.opens >= s.max_opens


def _gone(s: FileShare) -> bool:
    """Freigabe nicht mehr nutzbar (geschlossen oder Zeit abgelaufen)."""
    return s.closed_at is not None or _time_expired(s)


def _close_share(db: Session, s: FileShare) -> None:
    """Dateien vom Server entfernen, Freigabe als geschlossen markieren."""
    try:
        shutil.rmtree(_share_dir(s.id), ignore_errors=True)
    except OSError:
        pass
    s.files = []
    if s.closed_at is None:
        s.closed_at = _now()


def cleanup_shares(db: Session, org_id: str | None = None) -> int:
    """Abgelaufene/aufgebrauchte Freigaben schließen und Dateien löschen."""
    q = db.query(FileShare).filter(FileShare.closed_at.is_(None))
    if org_id:
        q = q.filter(FileShare.organization_id == org_id)
    n = 0
    for s in q.all():
        la = _aware(s.last_access)
        spent_grace = _spent(s) and (la is None or _now() > la + _GRACE)
        if _time_expired(s) or spent_grace:
            _close_share(db, s)
            n += 1
    if n:
        db.commit()
    return n


def _out(s: FileShare) -> dict:
    return {
        "id": s.id, "title": s.title, "allowed_email": s.allowed_email,
        "max_opens": s.max_opens, "opens": s.opens,
        "expires_at": _aware(s.expires_at).isoformat() if s.expires_at else "",
        "closed": _gone(s), "file_count": len(s.files or []),
        "files": [{"name": f.get("name", ""), "size": f.get("size", 0)} for f in (s.files or [])],
        "has_link": bool(s.link_url), "link_url": s.link_url,
        "url": _public_url(s.token), "created_at": _aware(s.created_at).isoformat() if s.created_at else "",
    }


# ---------- Agentur ----------
@router.get("")
def list_shares(user: User = Depends(require_agency), db: Session = Depends(get_db)) -> list[dict]:
    cleanup_shares(db, user.organization_id)
    rows = (db.query(FileShare).filter(FileShare.organization_id == user.organization_id)
            .order_by(FileShare.created_at.desc()).all())
    return [_out(s) for s in rows]


@router.post("", status_code=201)
async def create_share(
    request: Request,
    allowed_email: str = Form(...),
    max_opens: int = Form(1),
    expires_hours: int = Form(168),
    title: str = Form(""),
    notify: bool = Form(True),
    link_url: str = Form(""),
    link_password: str = Form(""),
    files: list[UploadFile] | None = File(None),
    user: User = Depends(require_agency),
    db: Session = Depends(get_db),
) -> dict:
    allowed = (allowed_email or "").strip().lower()
    if not _EMAIL_RE.match(allowed):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Bitte eine gültige Empfänger-E-Mail angeben.")
    files = [f for f in (files or []) if f and f.filename]
    link = (link_url or "").strip()
    if not files and not link:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Bitte Dateien wählen oder einen Link angeben.")
    max_opens = max(0, int(max_opens))
    expires_hours = max(1, int(expires_hours))

    share = FileShare(
        organization_id=user.organization_id, created_by=(user.full_name or user.email),
        title=(title or "").strip()[:255], token=pysecrets.token_urlsafe(24),
        allowed_email=allowed, max_opens=max_opens, link_url=link[:1024],
        link_password=(link_password or "").strip()[:255],
        expires_at=_now() + timedelta(hours=expires_hours))
    db.add(share)
    db.flush()  # id für den Ordner

    dest = _share_dir(share.id)
    os.makedirs(dest, exist_ok=True)
    saved: list[dict] = []
    total = 0
    for uf in files:
        name = os.path.basename(uf.filename or "datei")
        path = os.path.join(dest, f"{len(saved):02d}_{name}")
        size = 0
        with open(path, "wb") as out:
            while chunk := await uf.read(1024 * 1024):
                size += len(chunk)
                total += len(chunk)
                if total > settings.max_upload_bytes:
                    out.close(); shutil.rmtree(dest, ignore_errors=True)
                    raise HTTPException(status.HTTP_400_BAD_REQUEST, "Dateien zu groß.")
                out.write(chunk)
        saved.append({"name": name, "content_type": uf.content_type or "application/octet-stream",
                      "size": size, "path": path})
    share.files = saved
    db.commit()
    db.refresh(share)

    if notify:
        _mail_link(share, db)
    return _out(share)


@router.delete("/{share_id}", status_code=204)
def delete_share(share_id: str, user: User = Depends(require_agency), db: Session = Depends(get_db)) -> None:
    s = db.get(FileShare, share_id)
    if s and s.organization_id == user.organization_id:
        _close_share(db, s)
        db.delete(s)
        db.commit()


def _mail_link(share: FileShare, db: Session) -> None:
    """Schickt der erlaubten Adresse den Link zur Freigabe (Code kommt erst beim Öffnen)."""
    from app.api.routes.mail import render_email_html, send_via_graph  # noqa: PLC0415
    org = db.get(Organization, share.organization_id)
    if not org or not org.ms_refresh_token:
        return
    body = (f"Hallo,\n\ndir wurde eine sichere Dateifreigabe bereitgestellt"
            f"{(' – ' + share.title) if share.title else ''}.\n\n"
            f"Zum Öffnen diesen Link aufrufen und deine E-Mail-Adresse bestätigen:\n\n"
            f"{_public_url(share.token)}\n\n"
            f"Aus Sicherheitsgründen bekommst du dort einen Bestätigungscode an genau "
            f"diese Adresse.\n\nBeste Grüße")
    try:
        send_via_graph(org, share.allowed_email, "Sichere Dateifreigabe",
                       render_email_html(org, body), html=True)
    except Exception:
        pass


# ---------- Öffentlich ----------
def _mask(email: str) -> str:
    if "@" not in email:
        return "***"
    name, dom = email.split("@", 1)
    return (name[0] + "***" if name else "***") + "@" + dom


@public_router.get("/{token}")
def public_info(token: str, db: Session = Depends(get_db)) -> dict:
    s = db.query(FileShare).filter(FileShare.token == token).first()
    if not s:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Freigabe nicht gefunden.")
    if _gone(s):
        _close_share(db, s); db.commit()
        return {"title": s.title, "closed": True}
    if _spent(s):
        return {"title": s.title, "closed": True}   # aufgebraucht (Dateien räumt der Sweep ab)
    return {"title": s.title, "closed": False, "file_count": len(s.files or [])}


@public_router.post("/{token}/request-code")
def request_code(token: str, body: dict, db: Session = Depends(get_db)) -> dict:
    s = db.query(FileShare).filter(FileShare.token == token).first()
    if not s or _gone(s) or _spent(s):
        raise HTTPException(status.HTTP_410_GONE, "Diese Freigabe ist nicht mehr verfügbar.")
    email = (body.get("email") or "").strip().lower()
    # Nur wenn die Adresse berechtigt ist, wird tatsächlich ein Code gesendet.
    if email and email == s.allowed_email:
        s.code = f"{pysecrets.randbelow(1000000):06d}"
        s.code_expires = _now() + timedelta(minutes=15)
        db.commit()
        from app.api.routes.mail import render_email_html, send_via_graph  # noqa: PLC0415
        org = db.get(Organization, s.organization_id)
        if org and org.ms_refresh_token:
            body_text = (f"Hallo,\n\ndein Bestätigungscode für die Dateifreigabe:\n\n    {s.code}\n\n"
                         f"Der Code ist 15 Minuten gültig.\n\nBeste Grüße")
            try:
                send_via_graph(org, s.allowed_email, "Dein Bestätigungscode",
                               render_email_html(org, body_text), html=True)
            except Exception:
                pass
    # Generische Antwort – verrät nicht, welche Adresse berechtigt ist.
    return {"sent": True}


@public_router.post("/{token}/verify")
def verify(token: str, body: dict, db: Session = Depends(get_db)) -> dict:
    s = db.query(FileShare).filter(FileShare.token == token).first()
    if not s or _gone(s):
        raise HTTPException(status.HTTP_410_GONE, "Diese Freigabe ist nicht mehr verfügbar.")
    if _spent(s):
        raise HTTPException(status.HTTP_410_GONE, "Diese Freigabe wurde bereits (maximal oft) geöffnet.")
    email = (body.get("email") or "").strip().lower()
    code = (body.get("code") or "").strip()
    exp = _aware(s.code_expires)
    if email != s.allowed_email or not s.code or code != s.code or not exp or _now() > exp:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "E-Mail oder Code stimmt nicht (oder Code abgelaufen).")
    # Öffnung verbrauchen
    s.opens += 1
    s.last_access = _now()
    s.code = ""
    s.code_expires = None
    db.commit()
    access = create_access_token(s.id, {"k": "share"})
    # Der externe Link wird NICHT herausgegeben – der Download läuft server-seitig
    # über North Flow, damit Öffnungslimit/Ablauf wirklich greifen.
    return {"access": access,
            "files": [{"idx": i, "name": f.get("name", ""), "size": f.get("size", 0),
                       "content_type": f.get("content_type", "")} for i, f in enumerate(s.files or [])],
            "has_link": bool(s.link_url)}


def _share_from_access(token: str, request: Request, db: Session) -> FileShare:
    s = db.query(FileShare).filter(FileShare.token == token).first()
    if not s or _gone(s):
        raise HTTPException(status.HTTP_410_GONE, "Diese Freigabe ist nicht mehr verfügbar.")
    auth = request.headers.get("authorization", "")
    jwt = auth[7:] if auth.lower().startswith("bearer ") else request.query_params.get("t", "")
    payload = decode_access_token(jwt) if jwt else None
    if not payload or payload.get("sub") != s.id or payload.get("k") != "share":
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Nicht verifiziert.")
    return s


@public_router.get("/{token}/files/{idx}")
def download(token: str, idx: int, request: Request, db: Session = Depends(get_db)):
    s = _share_from_access(token, request, db)
    files = s.files or []
    if idx < 0 or idx >= len(files):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Datei nicht gefunden.")
    f = files[idx]
    if not os.path.isfile(f.get("path", "")):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Datei nicht mehr vorhanden.")
    return FileResponse(f["path"], media_type=f.get("content_type") or "application/octet-stream",
                        filename=f.get("name") or "datei")


def _nc_url(link: str) -> str:
    """Nextcloud-Freigabe-Link -> direkter Download-URL (Datei oder ZIP)."""
    u = (link or "").strip().rstrip("/")
    if "/s/" in u and not u.endswith("/download"):
        u += "/download"
    return u


def _nc_token(link: str) -> str:
    m = re.search(r"/s/([A-Za-z0-9]+)", link or "")
    return m.group(1) if m else ""


@public_router.get("/{token}/link")
def link_download(token: str, request: Request, db: Session = Depends(get_db)):
    """Streamt die Datei(en) server-seitig von der externen Quelle (z. B. Nextcloud)
    an den verifizierten Empfänger – der Link selbst bleibt verborgen, damit
    Öffnungslimit/Ablauf greifen."""
    s = _share_from_access(token, request, db)
    if not s.link_url:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Kein Link hinterlegt.")
    url = _nc_url(s.link_url)
    auth = (_nc_token(s.link_url) or "anonymous", s.link_password) if s.link_password else None
    try:
        cm = httpx.stream("GET", url, follow_redirects=True, timeout=None, auth=auth)
        resp = cm.__enter__()
    except httpx.HTTPError as exc:
        raise HTTPException(status.HTTP_502_BAD_GATEWAY, f"Quelle nicht erreichbar: {exc}") from exc
    ctype = resp.headers.get("content-type", "")
    if resp.status_code >= 300 or ctype.startswith("text/html"):
        cm.__exit__(None, None, None)
        raise HTTPException(status.HTTP_502_BAD_GATEWAY,
                            "Download von der Quelle fehlgeschlagen – Link oder Passwort prüfen.")
    cd = resp.headers.get("content-disposition", "")
    m = re.search(r'filename\*?=(?:UTF-8\'\')?"?([^";]+)"?', cd)
    fname = m.group(1) if m else ((s.title or "dateien").strip().replace(" ", "_") or "dateien") + ".zip"
    return StreamingResponse(
        resp.iter_bytes(), media_type=ctype or "application/octet-stream",
        headers={"Content-Disposition": f'attachment; filename="{fname}"'},
        background=BackgroundTask(cm.__exit__, None, None, None))
