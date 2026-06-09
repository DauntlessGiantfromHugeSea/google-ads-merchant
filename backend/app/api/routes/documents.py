"""Dokumente je Kunde (Verträge, Briefings …), in der DB gespeichert."""
import base64

from fastapi import APIRouter, Depends, File, HTTPException, Response, UploadFile, status
from sqlalchemy.orm import Session

from app.api.deps import get_current_user, get_scoped_client, require_agency
from app.database import get_db
from app.models import Document, User
from app.schemas import DocumentOut

router = APIRouter(prefix="/api/clients/{client_id}/documents", tags=["documents"])
_MAX_BYTES = 15 * 1024 * 1024  # 15 MB


@router.get("", response_model=list[DocumentOut])
def list_documents(client_id: str, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    get_scoped_client(client_id, user, db)
    return (db.query(Document).filter(Document.client_id == client_id)
            .order_by(Document.created_at.desc()).all())


@router.post("", response_model=DocumentOut, status_code=201)
async def upload_document(
    client_id: str, file: UploadFile = File(...),
    user: User = Depends(require_agency), db: Session = Depends(get_db),
):
    get_scoped_client(client_id, user, db)
    data = await file.read()
    if len(data) > _MAX_BYTES:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Datei zu groß (max. 15 MB)")
    doc = Document(
        client_id=client_id, filename=file.filename or "datei",
        content_type=file.content_type or "application/octet-stream",
        size=len(data), data_base64=base64.b64encode(data).decode(),
        uploaded_by=user.full_name or user.email,
    )
    db.add(doc)
    db.commit()
    db.refresh(doc)
    return doc


@router.get("/{doc_id}/download")
def download_document(client_id: str, doc_id: str,
                      user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    get_scoped_client(client_id, user, db)
    doc = db.get(Document, doc_id)
    if not doc or doc.client_id != client_id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Dokument nicht gefunden")
    return Response(
        content=base64.b64decode(doc.data_base64),
        media_type=doc.content_type,
        headers={"Content-Disposition": f'attachment; filename="{doc.filename}"'},
    )


@router.delete("/{doc_id}", status_code=204)
def delete_document(client_id: str, doc_id: str,
                    user: User = Depends(require_agency), db: Session = Depends(get_db)):
    get_scoped_client(client_id, user, db)
    doc = db.get(Document, doc_id)
    if doc and doc.client_id == client_id:
        db.delete(doc)
        db.commit()
