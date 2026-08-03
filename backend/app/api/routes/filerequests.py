"""Datei-Anforderungen: öffentlicher Upload-Link, Mail bei Upload, Dateien auf
der Platte (bis 10 GB je Anforderung), Auto-Löschung nach 7 Tagen.

Große Dateien werden in Blöcken auf die Platte gestreamt – nicht in die DB und
nicht komplett in den Speicher geladen."""
import os
import re
import tempfile
import uuid
import zipfile
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, File, Form, HTTPException, Request, UploadFile, status
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session
from starlette.background import BackgroundTask

from app.api.deps import get_scoped_client, require_agency
from app.config import get_settings
from app.database import get_db
from app.models import Client, FileRequest, Organization, UploadedFile, User
from app.schemas import FileRequestCreate, FileRequestOut, PublicUploadInfo, UploadedFileOut
from app.services.notify import _agency_user_ids, notify_users

settings = get_settings()
router = APIRouter(prefix="/api/filerequests", tags=["filerequests"])          # Agentur
public_router = APIRouter(prefix="/api/upload", tags=["filerequests"])          # öffentlich

_CHUNK = 1024 * 1024


def _safe(name: str) -> str:
    return re.sub(r"[^A-Za-z0-9._-]", "_", (name or "datei"))[:200] or "datei"


def _remove_file(f: UploadedFile) -> None:
    try:
        if f.storage_path and os.path.isfile(f.storage_path):
            os.remove(f.storage_path)
    except OSError:
        pass


def cleanup_expired(db: Session, org_id: str | None = None) -> int:
    """Abgelaufene Dateien von Platte und aus der DB entfernen."""
    now = datetime.now(timezone.utc)
    q = db.query(UploadedFile).filter(UploadedFile.expires_at.isnot(None), UploadedFile.expires_at < now)
    if org_id:
        q = q.filter(UploadedFile.organization_id == org_id)
    n = 0
    for f in q.all():
        _remove_file(f)
        db.delete(f)
        n += 1
    if n:
        db.commit()
    return n


def _out(fr: FileRequest, db: Session) -> FileRequestOut:
    client = db.get(Client, fr.client_id) if fr.client_id else None
    files = sorted(fr.files, key=lambda x: x.created_at, reverse=True)
    return FileRequestOut(
        id=fr.id, token=fr.token, title=fr.title, message=fr.message, active=fr.active,
        client_id=fr.client_id, client_name=client.name if client else "",
        created_at=fr.created_at, file_count=len(files), total_size=sum(f.size for f in files),
        files=[UploadedFileOut.model_validate(f) for f in files],
    )


# ---------- Agentur ----------
@router.get("", response_model=list[FileRequestOut])
def list_requests(user: User = Depends(require_agency), db: Session = Depends(get_db)):
    cleanup_expired(db, user.organization_id)
    rows = (db.query(FileRequest).filter(FileRequest.organization_id == user.organization_id)
            .order_by(FileRequest.created_at.desc()).all())
    return [_out(fr, db) for fr in rows]


@router.post("", response_model=FileRequestOut, status_code=201)
def create_request(data: FileRequestCreate, user: User = Depends(require_agency), db: Session = Depends(get_db)):
    if data.client_id:
        get_scoped_client(data.client_id, user, db)
    fr = FileRequest(organization_id=user.organization_id, client_id=data.client_id or None,
                     title=data.title.strip() or "Datei-Anforderung", message=data.message.strip(),
                     token=uuid.uuid4().hex, created_by=user.full_name or user.email)
    db.add(fr)
    db.commit()
    db.refresh(fr)
    return _out(fr, db)


def _load(req_id: str, user: User, db: Session) -> FileRequest:
    fr = db.get(FileRequest, req_id)
    if not fr or fr.organization_id != user.organization_id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Anforderung nicht gefunden")
    return fr


@router.get("/{req_id}", response_model=FileRequestOut)
def get_request(req_id: str, user: User = Depends(require_agency), db: Session = Depends(get_db)):
    cleanup_expired(db, user.organization_id)
    return _out(_load(req_id, user, db), db)


@router.patch("/{req_id}", response_model=FileRequestOut)
def toggle_request(req_id: str, active: bool, user: User = Depends(require_agency), db: Session = Depends(get_db)):
    fr = _load(req_id, user, db)
    fr.active = active
    db.commit()
    db.refresh(fr)
    return _out(fr, db)


@router.delete("/{req_id}", status_code=204)
def delete_request(req_id: str, user: User = Depends(require_agency), db: Session = Depends(get_db)):
    fr = _load(req_id, user, db)
    for f in fr.files:
        _remove_file(f)
    db.delete(fr)
    db.commit()


@router.delete("/{req_id}/files/{file_id}", status_code=204)
def delete_file(req_id: str, file_id: str, user: User = Depends(require_agency), db: Session = Depends(get_db)):
    _load(req_id, user, db)
    f = db.get(UploadedFile, file_id)
    if f and f.request_id == req_id and f.organization_id == user.organization_id:
        _remove_file(f)
        db.delete(f)
        db.commit()


@router.get("/{req_id}/files/{file_id}/download")
def download_file(req_id: str, file_id: str, user: User = Depends(require_agency), db: Session = Depends(get_db)):
    _load(req_id, user, db)
    f = db.get(UploadedFile, file_id)
    if not f or f.request_id != req_id or f.organization_id != user.organization_id or not os.path.isfile(f.storage_path):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Datei nicht gefunden")
    return FileResponse(f.storage_path, media_type=f.content_type or "application/octet-stream", filename=f.filename)


@router.get("/{req_id}/download-all")
def download_all(req_id: str, user: User = Depends(require_agency), db: Session = Depends(get_db)):
    """Alle Dateien einer Anforderung als ZIP. Ohne Kompression (schnell), da
    die Inhalte meist schon komprimiert sind."""
    fr = _load(req_id, user, db)
    files = [f for f in fr.files if f.storage_path and os.path.isfile(f.storage_path)]
    if not files:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Keine Dateien vorhanden")
    os.makedirs(settings.upload_dir, exist_ok=True)
    tmp = tempfile.NamedTemporaryFile(delete=False, suffix=".zip", dir=settings.upload_dir)
    tmp.close()
    used: set[str] = set()
    with zipfile.ZipFile(tmp.name, "w", zipfile.ZIP_STORED, allowZip64=True) as z:
        for f in files:
            name = f.filename or "datei"
            if name in used:
                base, ext = os.path.splitext(name)
                i = 1
                while f"{base}_{i}{ext}" in used:
                    i += 1
                name = f"{base}_{i}{ext}"
            used.add(name)
            z.write(f.storage_path, arcname=name)
    zip_name = f"{_safe(fr.title)}.zip"
    return FileResponse(tmp.name, media_type="application/zip", filename=zip_name,
                        background=BackgroundTask(lambda p=tmp.name: os.path.isfile(p) and os.remove(p)))


# ---------- Öffentlich (ohne Login) ----------
@public_router.get("/{token}", response_model=PublicUploadInfo)
def public_info(token: str, db: Session = Depends(get_db)):
    fr = db.query(FileRequest).filter(FileRequest.token == token).first()
    if not fr:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Link nicht gefunden")
    org = db.get(Organization, fr.organization_id)
    return PublicUploadInfo(
        title=fr.title, message=fr.message,
        agency_name=(getattr(org, "agency_contact_name", "") or (org.name if org else "")),
        active=fr.active, max_bytes=settings.max_upload_bytes, retention_days=settings.upload_retention_days,
    )


@public_router.post("/{token}")
async def public_upload(token: str, request: Request,
                        files: list[UploadFile] = File(...), uploader: str = Form(""),
                        db: Session = Depends(get_db)):
    fr = db.query(FileRequest).filter(FileRequest.token == token).first()
    if not fr or not fr.active:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Link nicht gefunden oder deaktiviert")

    used = sum(f.size for f in fr.files)
    limit = settings.max_upload_bytes
    dest_dir = os.path.join(settings.upload_dir, fr.id)
    os.makedirs(dest_dir, exist_ok=True)
    exp = datetime.now(timezone.utc) + timedelta(days=settings.upload_retention_days)
    saved: list[UploadedFile] = []

    for up in files:
        safe = _safe(up.filename or "datei")
        path = os.path.join(dest_dir, f"{uuid.uuid4().hex}_{safe}")
        written = 0
        try:
            with open(path, "wb") as out:
                while True:
                    chunk = await up.read(_CHUNK)
                    if not chunk:
                        break
                    written += len(chunk)
                    if used + written > limit:
                        out.close()
                        os.remove(path)
                        # bereits gespeicherte dieser Runde zurückrollen
                        for s in saved:
                            _remove_file(s)
                            db.delete(s)
                        db.commit()
                        raise HTTPException(status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
                                            f"Limit von {limit // (1024**3)} GB überschritten.")
                    out.write(chunk)
        finally:
            await up.close()
        rec = UploadedFile(organization_id=fr.organization_id, request_id=fr.id,
                           filename=safe, content_type=up.content_type or "application/octet-stream",
                           size=written, storage_path=path, uploader=(uploader or "").strip()[:255], expires_at=exp)
        db.add(rec)
        saved.append(rec)
        used += written

    db.commit()
    _notify_upload(fr, saved, uploader, db)
    return {"ok": True, "count": len(saved)}


def _notify_upload(fr: FileRequest, saved: list[UploadedFile], uploader: str, db: Session) -> None:
    """In-App-Benachrichtigung + E-Mail an die Agentur (Mail ist Pflicht-Wunsch)."""
    total_mb = sum(f.size for f in saved) / (1024 * 1024)
    names = ", ".join(f.filename for f in saved[:5]) + ("…" if len(saved) > 5 else "")
    body = f"{len(saved)} Datei(en){f' von {uploader}' if uploader else ''}: {names} ({total_mb:.1f} MB)"
    link = f"/dateien/{fr.id}"
    try:
        notify_users(db, _agency_user_ids(db, fr.organization_id),
                     org_id=fr.organization_id, client_id=fr.client_id,
                     type_="file_uploaded", title=f"Neuer Upload · {fr.title}", body=body, link=link)
        db.commit()
    except Exception:
        db.rollback()
    # E-Mail über Microsoft-Konto (best effort, blockiert den Upload nicht)
    try:
        org = db.get(Organization, fr.organization_id)
        to = (getattr(org, "agency_contact_email", "") or getattr(org, "ms_email", "") or "").strip()
        if org and org.ms_refresh_token and to:
            from app.api.routes.mail import render_email_html, send_via_graph
            txt = (f"Guten Tag,\n\nfür die Anforderung „{fr.title}“ wurden gerade {len(saved)} Datei(en) "
                   f"hochgeladen{f' von {uploader}' if uploader else ''}:\n\n"
                   + "\n".join(f"• {f.filename} ({f.size/(1024*1024):.1f} MB)" for f in saved)
                   + "\n\nDie Dateien findest du in North Flow unter „Dateien“. "
                   f"Sie werden nach {settings.upload_retention_days} Tagen automatisch gelöscht.")
            send_via_graph(org, to, f"Neuer Upload: {fr.title}", render_email_html(org, txt), html=True)
    except Exception:
        pass
