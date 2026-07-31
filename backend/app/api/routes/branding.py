"""Branding: Logo im Tool hochladen, anzeigen, entfernen."""
import base64

from fastapi import APIRouter, Depends, File, HTTPException, Response, UploadFile, status
from sqlalchemy.orm import Session

from app.api.deps import require_admin
from app.database import get_db
from app.models import Organization, User

router = APIRouter(prefix="/api/branding", tags=["branding"])

_DEFAULT_TAGLINE = "Reporting-Plattform für deine Kunden."


@router.get("/login-info")
def login_info(db: Session = Depends(get_db)) -> dict:
    """Öffentlich: Texte für die Login-Seite (Untertitel)."""
    org = db.query(Organization).first()
    return {"tagline": (org.login_tagline if org and org.login_tagline else _DEFAULT_TAGLINE)}


@router.patch("/login-info")
def set_login_info(data: dict, user: User = Depends(require_admin), db: Session = Depends(get_db)) -> dict:
    org = db.get(Organization, user.organization_id)
    org.login_tagline = (data.get("tagline") or _DEFAULT_TAGLINE)[:255]
    db.commit()
    return {"tagline": org.login_tagline}

_ALLOWED = {"image/png", "image/jpeg", "image/svg+xml", "image/webp", "image/gif"}
_MAX_BYTES = 2 * 1024 * 1024  # 2 MB


@router.get("/logo")
def get_logo(db: Session = Depends(get_db)):
    """Öffentlich (für die Login-Maske): liefert das Logo der Agentur."""
    org = db.query(Organization).filter(Organization.logo_base64 != "").first()
    if not org or not org.logo_base64:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Kein Logo")
    return Response(
        content=base64.b64decode(org.logo_base64),
        media_type=org.logo_content_type or "image/png",
        # Logo ändert sich selten -> vom Browser 1 h cachen lassen (weniger
        # Backend-/DB-Treffer beim Laden, Login-Logo & Favicon erscheinen sofort).
        headers={"Cache-Control": "public, max-age=3600"},
    )


@router.post("/logo", status_code=204)
async def upload_logo(
    file: UploadFile = File(...),
    user: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    if file.content_type not in _ALLOWED:
        raise HTTPException(status.HTTP_400_BAD_REQUEST,
                            "Nur PNG, JPG, SVG, WEBP oder GIF erlaubt")
    data = await file.read()
    if len(data) > _MAX_BYTES:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Datei zu groß (max. 2 MB)")
    org = db.get(Organization, user.organization_id)
    org.logo_base64 = base64.b64encode(data).decode()
    org.logo_content_type = file.content_type
    db.commit()


@router.delete("/logo", status_code=204)
def delete_logo(user: User = Depends(require_admin), db: Session = Depends(get_db)):
    org = db.get(Organization, user.organization_id)
    org.logo_base64 = ""
    org.logo_content_type = ""
    db.commit()
