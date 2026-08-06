"""Öffentliche Assets (z. B. Logo-Varianten): hochladen und über eine offene
URL zum Einbinden auf anderen Seiten ausliefern."""
import base64
import uuid

from fastapi import APIRouter, Depends, File, Form, HTTPException, Response, UploadFile, status
from sqlalchemy.orm import Session

from app.api.deps import require_agency
from app.database import get_db
from app.models import Asset, User
from app.schemas import AssetOut

router = APIRouter(prefix="/api/assets", tags=["assets"])
_MAX_BYTES = 10 * 1024 * 1024  # 10 MB je Asset


@router.get("", response_model=list[AssetOut])
def list_assets(user: User = Depends(require_agency), db: Session = Depends(get_db)):
    return (db.query(Asset).filter(Asset.organization_id == user.organization_id)
            .order_by(Asset.created_at.desc()).all())


@router.post("", response_model=AssetOut, status_code=201)
async def upload_asset(file: UploadFile = File(...), label: str = Form(""),
                       user: User = Depends(require_agency), db: Session = Depends(get_db)):
    data = await file.read()
    if len(data) > _MAX_BYTES:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Datei zu groß (max. 10 MB)")
    a = Asset(organization_id=user.organization_id, token=uuid.uuid4().hex,
              label=label.strip() or (file.filename or "Asset"),
              filename=file.filename or "datei", content_type=file.content_type or "application/octet-stream",
              size=len(data), data_base64=base64.b64encode(data).decode(),
              created_by=user.full_name or user.email)
    db.add(a)
    db.commit()
    db.refresh(a)
    return a


@router.delete("/{asset_id}", status_code=204)
def delete_asset(asset_id: str, user: User = Depends(require_agency), db: Session = Depends(get_db)):
    a = db.get(Asset, asset_id)
    if a and a.organization_id == user.organization_id:
        db.delete(a)
        db.commit()


@router.get("/{token}")
def serve_asset(token: str, db: Session = Depends(get_db)):
    """Öffentliche Auslieferung (ohne Login) – für <img src=...> auf anderen Seiten."""
    a = db.query(Asset).filter(Asset.token == token).first()
    if not a:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Asset nicht gefunden")
    return Response(content=base64.b64decode(a.data_base64),
                    media_type=a.content_type or "application/octet-stream",
                    headers={"Cache-Control": "public, max-age=3600",
                             "Access-Control-Allow-Origin": "*"})
