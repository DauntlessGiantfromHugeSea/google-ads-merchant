"""Leistungs-/Paketkatalog der Agentur."""
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.api.deps import require_agency
from app.database import get_db
from app.models import ServicePackage, User
from app.schemas import PackageCreate, PackageOut, PackagePatch

router = APIRouter(prefix="/api/packages", tags=["packages"])


@router.get("", response_model=list[PackageOut])
def list_packages(user: User = Depends(require_agency), db: Session = Depends(get_db)):
    return (db.query(ServicePackage)
            .filter(ServicePackage.organization_id == user.organization_id)
            .order_by(ServicePackage.created_at.desc()).all())


@router.post("", response_model=PackageOut, status_code=201)
def create_package(data: PackageCreate, user: User = Depends(require_agency), db: Session = Depends(get_db)):
    pkg = ServicePackage(organization_id=user.organization_id, **data.model_dump())
    db.add(pkg)
    db.commit()
    db.refresh(pkg)
    return pkg


@router.patch("/{pkg_id}", response_model=PackageOut)
def update_package(pkg_id: str, data: PackagePatch, user: User = Depends(require_agency), db: Session = Depends(get_db)):
    pkg = db.get(ServicePackage, pkg_id)
    if not pkg or pkg.organization_id != user.organization_id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Paket nicht gefunden")
    for field, value in data.model_dump(exclude_unset=True).items():
        setattr(pkg, field, value)
    db.commit()
    db.refresh(pkg)
    return pkg


@router.delete("/{pkg_id}", status_code=204)
def delete_package(pkg_id: str, user: User = Depends(require_agency), db: Session = Depends(get_db)):
    pkg = db.get(ServicePackage, pkg_id)
    if pkg and pkg.organization_id == user.organization_id:
        db.delete(pkg)
        db.commit()
