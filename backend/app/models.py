"""Datenmodell der Reporting-Plattform.

Mandantentrennung: alles hängt an einer Organization (Agentur). Kunden,
Konten und Reports sind darunter gescoped. Kunden-User sind zusätzlich an
einen konkreten Client gebunden und sehen nur dessen Daten.
"""
from __future__ import annotations

import enum
import uuid
from datetime import datetime, timezone

from sqlalchemy import (
    JSON,
    Boolean,
    DateTime,
    Enum,
    Float,
    ForeignKey,
    String,
    Text,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


def _uuid() -> str:
    return str(uuid.uuid4())


def _now() -> datetime:
    return datetime.now(timezone.utc)


class UserRole(str, enum.Enum):
    agency_admin = "agency_admin"
    agency_member = "agency_member"
    client_user = "client_user"


class AccountType(str, enum.Enum):
    google_ads = "google_ads"
    merchant_center = "merchant_center"
    website = "website"


class ReportType(str, enum.Enum):
    ads = "ads"
    merchant = "merchant"
    seo = "seo"
    combined = "combined"


class ReportStatus(str, enum.Enum):
    pending = "pending"
    running = "running"
    completed = "completed"
    failed = "failed"


class Organization(Base):
    __tablename__ = "organizations"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)

    users: Mapped[list[User]] = relationship(back_populates="organization", cascade="all, delete-orphan")
    clients: Mapped[list[Client]] = relationship(back_populates="organization", cascade="all, delete-orphan")


class User(Base):
    __tablename__ = "users"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    email: Mapped[str] = mapped_column(String(255), unique=True, index=True, nullable=False)
    full_name: Mapped[str] = mapped_column(String(255), default="")
    hashed_password: Mapped[str] = mapped_column(String(255), nullable=False)
    role: Mapped[UserRole] = mapped_column(Enum(UserRole), default=UserRole.agency_member)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)

    organization_id: Mapped[str] = mapped_column(ForeignKey("organizations.id"))
    organization: Mapped[Organization] = relationship(back_populates="users")

    # Nur für client_user gesetzt: an welchen Kunden dieser Login gebunden ist.
    client_id: Mapped[str | None] = mapped_column(ForeignKey("clients.id"), nullable=True)


class Client(Base):
    __tablename__ = "clients"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    contact_email: Mapped[str] = mapped_column(String(255), default="")
    notes: Mapped[str] = mapped_column(Text, default="")
    onboarding_completed: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)

    organization_id: Mapped[str] = mapped_column(ForeignKey("organizations.id"))
    organization: Mapped[Organization] = relationship(back_populates="clients")

    accounts: Mapped[list[Account]] = relationship(back_populates="client", cascade="all, delete-orphan")
    reports: Mapped[list[ReportRun]] = relationship(back_populates="client", cascade="all, delete-orphan")


class Account(Base):
    """Ein verknüpftes Konto eines Kunden: Google Ads, Merchant Center oder Website."""

    __tablename__ = "accounts"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    type: Mapped[AccountType] = mapped_column(Enum(AccountType), nullable=False)
    # Ads: customer_id; Merchant: merchant_id; Website: URL
    external_id: Mapped[str] = mapped_column(String(512), nullable=False)
    label: Mapped[str] = mapped_column(String(255), default="")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)

    client_id: Mapped[str] = mapped_column(ForeignKey("clients.id"))
    client: Mapped[Client] = relationship(back_populates="accounts")

    credential: Mapped[GoogleCredential | None] = relationship(
        back_populates="account", uselist=False, cascade="all, delete-orphan"
    )


class GoogleCredential(Base):
    """Verschlüsselt gespeicherte OAuth-Tokens je Konto."""

    __tablename__ = "google_credentials"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    account_id: Mapped[str] = mapped_column(ForeignKey("accounts.id"), unique=True)
    account: Mapped[Account] = relationship(back_populates="credential")

    # Fernet-verschlüsselt (siehe core/crypto.py)
    encrypted_refresh_token: Mapped[str] = mapped_column(Text, default="")
    scopes: Mapped[str] = mapped_column(Text, default="")
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now, onupdate=_now)


class ReportRun(Base):
    """Ein Report-Lauf. Die ausgewerteten Daten bleiben als Snapshot erhalten,
    das PDF wird nur flüchtig beim Download erzeugt."""

    __tablename__ = "report_runs"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    type: Mapped[ReportType] = mapped_column(Enum(ReportType), default=ReportType.combined)
    status: Mapped[ReportStatus] = mapped_column(Enum(ReportStatus), default=ReportStatus.pending)
    period_start: Mapped[str] = mapped_column(String(10), default="")
    period_end: Mapped[str] = mapped_column(String(10), default="")
    data_source: Mapped[str] = mapped_column(String(16), default="demo")
    error: Mapped[str] = mapped_column(Text, default="")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    client_id: Mapped[str] = mapped_column(ForeignKey("clients.id"))
    client: Mapped[Client] = relationship(back_populates="reports")

    # Die bleibenden Daten: ausgewertete Kennzahlen als JSON-Snapshot.
    ads_data: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    merchant_data: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    seo_data: Mapped[dict | None] = mapped_column(JSON, nullable=True)
