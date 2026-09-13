"""Datensicherung: Übersicht + Download der nächtlichen DB-Backups.

Nur für Admins und nur aus dem Tailscale-Netz (die Dumps enthalten alle Daten).
Die Dateien erzeugt der separate backup-Container; hier werden sie nur gelistet
und ausgeliefert."""
import json
import os

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import FileResponse

from app.api.deps import require_admin, require_tailnet
from app.config import get_settings
from app.models import User

router = APIRouter(prefix="/api/admin/backups", tags=["backup"],
                   dependencies=[Depends(require_tailnet), Depends(require_admin)])

# Status + „Jetzt sichern": nur Admin (kein Tailnet-Zwang) – es werden keine
# Daten ausgeliefert, nur ein Zeitstempel gelesen bzw. ein Trigger geschrieben.
ops_router = APIRouter(prefix="/api/admin/backup", tags=["backup"],
                       dependencies=[Depends(require_admin)])


def _backup_root() -> str:
    return get_settings().backup_dir or "/backups"


def _list_files() -> list[dict]:
    root = _backup_root()
    items: list[dict] = []
    for sub in ("daily", "weekly"):
        folder = os.path.join(root, sub)
        if not os.path.isdir(folder):
            continue
        for name in os.listdir(folder):
            if not name.endswith(".sql.gz"):
                continue
            path = os.path.join(folder, name)
            try:
                st = os.stat(path)
            except OSError:
                continue
            items.append({"name": name, "kind": sub, "size": st.st_size,
                          "modified": int(st.st_mtime)})
    items.sort(key=lambda x: x["modified"], reverse=True)
    return items


def _resolve(name: str) -> str:
    """Dateinamen sicher auf einen Pfad innerhalb des Backup-Ordners abbilden."""
    if not name or "/" in name or "\\" in name or not name.endswith(".sql.gz"):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Ungültiger Dateiname")
    root = os.path.realpath(_backup_root())
    for sub in ("daily", "weekly"):
        cand = os.path.realpath(os.path.join(root, sub, name))
        if cand.startswith(root + os.sep) and os.path.isfile(cand):
            return cand
    raise HTTPException(status.HTTP_404_NOT_FOUND, "Sicherung nicht gefunden")


@router.get("")
def list_backups(user: User = Depends(require_admin)) -> dict:
    files = _list_files()
    return {"backups": files, "count": len(files),
            "latest": files[0]["name"] if files else None}


@router.get("/{name}/download")
def download_backup(name: str, user: User = Depends(require_admin)):
    path = _resolve(name)
    return FileResponse(path, media_type="application/gzip", filename=name)


@ops_router.get("/status")
def backup_status(user: User = Depends(require_admin)) -> dict:
    """Letzter Sicherungsstand (für die Einstellungen): Zeitpunkt, Größe,
    Ergebnis des Hetzner-/Synology-Uploads. Ergänzt um die neueste Datei."""
    root = _backup_root()
    out: dict = {"status": None, "latest_file": None, "count": 0}
    try:
        with open(os.path.join(root, "status.json"), encoding="utf-8") as fh:
            out["status"] = json.load(fh)
    except (OSError, ValueError):
        pass
    files = _list_files()
    out["count"] = len(files)
    if files:
        out["latest_file"] = {"name": files[0]["name"], "size": files[0]["size"],
                              "modified": files[0]["modified"]}
    return out


@ops_router.post("/run")
def backup_run(user: User = Depends(require_admin)) -> dict:
    """Löst eine sofortige Sicherung aus (Trigger-Datei; der Backup-Dienst
    prüft alle ~20 s und legt dann sofort los)."""
    root = _backup_root()
    if not os.path.isdir(root):
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, "Backup-Verzeichnis nicht verfügbar")
    try:
        with open(os.path.join(root, ".run_now"), "w", encoding="utf-8") as fh:
            fh.write("")
    except OSError as exc:
        raise HTTPException(status.HTTP_500_INTERNAL_SERVER_ERROR,
                            "Trigger konnte nicht geschrieben werden (Schreibrecht?)") from exc
    return {"ok": True}
