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

    # Branding: im Tool hochgeladenes Logo (base64 + MIME-Typ).
    logo_base64: Mapped[str] = mapped_column(Text, default="")
    logo_content_type: Mapped[str] = mapped_column(String(64), default="")

    # Kontakt der Agentur (für Kunden sichtbar)
    agency_contact_name: Mapped[str] = mapped_column(String(255), default="")
    agency_contact_email: Mapped[str] = mapped_column(String(255), default="")
    agency_contact_phone: Mapped[str] = mapped_column(String(64), default="")
    agency_contact_note: Mapped[str] = mapped_column(Text, default="")

    # Microsoft-Mail (OAuth): verschlüsselter Refresh-Token + verbundene Adresse
    ms_refresh_token: Mapped[str] = mapped_column(Text, default="")
    ms_email: Mapped[str] = mapped_column(String(255), default="")

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
    notes: Mapped[str] = mapped_column(Text, default="")
    onboarding_completed: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)

    # Status & Tags
    status: Mapped[str] = mapped_column(String(32), default="aktiv")  # lead/aktiv/pausiert/beendet
    tags: Mapped[str] = mapped_column(Text, default="")              # kommagetrennt

    # Kontaktdaten
    contact_email: Mapped[str] = mapped_column(String(255), default="")
    contact_person: Mapped[str] = mapped_column(String(255), default="")
    phone: Mapped[str] = mapped_column(String(64), default="")
    website: Mapped[str] = mapped_column(String(512), default="")
    address: Mapped[str] = mapped_column(Text, default="")

    # Rechnungsdaten (RE)
    company: Mapped[str] = mapped_column(String(255), default="")
    billing_address: Mapped[str] = mapped_column(Text, default="")
    vat_id: Mapped[str] = mapped_column(String(64), default="")        # USt-IdNr
    billing_email: Mapped[str] = mapped_column(String(255), default="")

    # Vertragsdaten
    contract_package: Mapped[str] = mapped_column(String(255), default="")
    contract_status: Mapped[str] = mapped_column(String(64), default="")  # aktiv/pausiert/beendet
    contract_start: Mapped[str] = mapped_column(String(10), default="")
    contract_end: Mapped[str] = mapped_column(String(10), default="")
    contract_fee: Mapped[str] = mapped_column(String(64), default="")     # z.B. "990 € / Monat"
    contract_billing: Mapped[str] = mapped_column(String(64), default="")  # monatlich/jährlich
    contract_notes: Mapped[str] = mapped_column(Text, default="")

    organization_id: Mapped[str] = mapped_column(ForeignKey("organizations.id"))
    organization: Mapped[Organization] = relationship(back_populates="clients")

    accounts: Mapped[list[Account]] = relationship(back_populates="client", cascade="all, delete-orphan")
    reports: Mapped[list[ReportRun]] = relationship(back_populates="client", cascade="all, delete-orphan")
    todos: Mapped[list[Todo]] = relationship(back_populates="client", cascade="all, delete-orphan")
    updates: Mapped[list[ClientUpdate]] = relationship(back_populates="client", cascade="all, delete-orphan")


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

    @property
    def credentials_configured(self) -> bool:
        return bool(self.credential and self.credential.encrypted_payload)


class GoogleCredential(Base):
    """Verschlüsselt gespeicherte OAuth-Tokens je Konto."""

    __tablename__ = "google_credentials"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    account_id: Mapped[str] = mapped_column(ForeignKey("accounts.id"), unique=True)
    account: Mapped[Account] = relationship(back_populates="credential")

    # Fernet-verschlüsselter JSON-Blob mit den API-Zugangsdaten dieses Kontos
    # (z.B. developer_token, client_id, client_secret, refresh_token,
    # login_customer_id). Wird pro Kunde manuell hinterlegt.
    encrypted_payload: Mapped[str] = mapped_column(Text, default="")
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


class Todo(Base):
    """Aufgabe/To-Do zu einem Kunden."""

    __tablename__ = "todos"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    title: Mapped[str] = mapped_column(String(512), nullable=False)
    description: Mapped[str] = mapped_column(Text, default="")
    status: Mapped[str] = mapped_column(String(32), default="open")  # open/in_progress/done
    priority: Mapped[str] = mapped_column(String(16), default="normal")  # low/normal/high
    assignee: Mapped[str] = mapped_column(String(255), default="")  # Name/E-Mail des Team-Mitglieds
    due_date: Mapped[str] = mapped_column(String(10), default="")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)

    client_id: Mapped[str] = mapped_column(ForeignKey("clients.id"))
    client: Mapped[Client] = relationship(back_populates="todos")


class Project(Base):
    """Projekt/Kampagne zu einem Kunden – Kern der Agenturarbeit (Kanban)."""

    __tablename__ = "projects"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    title: Mapped[str] = mapped_column(String(512), nullable=False)
    description: Mapped[str] = mapped_column(Text, default="")
    type: Mapped[str] = mapped_column(String(32), default="design")   # design/marketing/web/seo/social/sonstiges
    status: Mapped[str] = mapped_column(String(32), default="backlog")  # backlog/in_progress/review/done
    assignee: Mapped[str] = mapped_column(String(255), default="")
    due_date: Mapped[str] = mapped_column(String(10), default="")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)

    client_id: Mapped[str] = mapped_column(ForeignKey("clients.id"))
    client: Mapped[Client] = relationship()


class ClientUpdate(Base):
    """Eintrag im Verlauf/Activity-Feed eines Kunden (Updates, Notizen)."""

    __tablename__ = "client_updates"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    title: Mapped[str] = mapped_column(String(512), default="")
    body: Mapped[str] = mapped_column(Text, default="")
    category: Mapped[str] = mapped_column(String(64), default="update")  # update/note/milestone
    author_name: Mapped[str] = mapped_column(String(255), default="")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)

    client_id: Mapped[str] = mapped_column(ForeignKey("clients.id"))
    client: Mapped[Client] = relationship(back_populates="updates")


class Document(Base):
    """Datei zu einem Kunden (Vertrag, Briefing …), in der DB gespeichert."""

    __tablename__ = "documents"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    filename: Mapped[str] = mapped_column(String(512), nullable=False)
    content_type: Mapped[str] = mapped_column(String(128), default="application/octet-stream")
    size: Mapped[int] = mapped_column(default=0)
    data_base64: Mapped[str] = mapped_column(Text, default="")
    uploaded_by: Mapped[str] = mapped_column(String(255), default="")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)

    client_id: Mapped[str] = mapped_column(ForeignKey("clients.id"))
    client: Mapped[Client] = relationship()


class AdsActivity(Base):
    """Google-Ads-Aktivitätsprotokoll je Kunde (Aktivitäten/Änderungen/Updates)."""

    __tablename__ = "ads_activities"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    client_id: Mapped[str] = mapped_column(ForeignKey("clients.id"))
    date: Mapped[str] = mapped_column(String(10), default="")
    category: Mapped[str] = mapped_column(String(32), default="aktivitaet")  # aktivitaet/aenderung/update
    title: Mapped[str] = mapped_column(String(512), nullable=False)
    body: Mapped[str] = mapped_column(Text, default="")
    author: Mapped[str] = mapped_column(String(255), default="")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)


class ServicePackage(Base):
    """Leistungs-/Paketkatalog der Agentur (für Vertragsdaten & Auswertung)."""

    __tablename__ = "service_packages"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    organization_id: Mapped[str] = mapped_column(ForeignKey("organizations.id"))
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    price: Mapped[str] = mapped_column(String(64), default="")
    interval: Mapped[str] = mapped_column(String(32), default="monatlich")  # monatlich/jährlich/einmalig
    description: Mapped[str] = mapped_column(Text, default="")
    active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)


class Secret(Base):
    """Ende-zu-Ende verschlüsseltes Einmal-Geheimnis (Passwort-Safe).
    Der Server speichert nur den Chiffretext – der Schlüssel liegt im Link
    (URL-Fragment) und erreicht den Server nie. Nach `views_left` Aufrufen
    oder Ablauf wird der Eintrag gelöscht."""

    __tablename__ = "secrets"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)  # zufälliges Token = Link-ID
    ciphertext: Mapped[str] = mapped_column(Text, nullable=False)
    iv: Mapped[str] = mapped_column(String(64), default="")
    views_left: Mapped[int] = mapped_column(default=5)
    note: Mapped[str] = mapped_column(String(255), default="")  # unverschlüsselter Hinweis (optional)
    created_by: Mapped[str] = mapped_column(String(255), default="")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)
    expires_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class SecretRequest(Base):
    """Öffentlicher Anforderungs-Link: Dritte können (ohne Login) ein Passwort
    einreichen. Nur die erstellende Agentur sieht die Einreichungen."""

    __tablename__ = "secret_requests"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)  # Token = Link-ID
    label: Mapped[str] = mapped_column(String(255), default="")
    created_by: Mapped[str] = mapped_column(String(255), default="")
    organization_id: Mapped[str] = mapped_column(ForeignKey("organizations.id"))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)
    expires_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class SecretSubmission(Base):
    """Eine über einen Anforderungs-Link eingereichte (serverseitig
    verschlüsselte) Geheimnis-Antwort."""

    __tablename__ = "secret_submissions"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    request_id: Mapped[str] = mapped_column(ForeignKey("secret_requests.id"))
    ciphertext: Mapped[str] = mapped_column(Text, nullable=False)  # Fernet-verschlüsselt
    note: Mapped[str] = mapped_column(String(255), default="")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)


class IntakeForm(Base):
    """Öffentliches Kundendaten-Formular (Onboarding/Rechnungsdaten per Link)."""

    __tablename__ = "intake_forms"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)  # Token = Link-ID
    organization_id: Mapped[str] = mapped_column(ForeignKey("organizations.id"))
    client_id: Mapped[str | None] = mapped_column(ForeignKey("clients.id"), nullable=True)
    label: Mapped[str] = mapped_column(String(255), default="")
    created_by: Mapped[str] = mapped_column(String(255), default="")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)
    expires_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class IntakeSubmission(Base):
    """Eine über ein Intake-Formular eingereichte Kundendaten-Antwort."""

    __tablename__ = "intake_submissions"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    form_id: Mapped[str] = mapped_column(ForeignKey("intake_forms.id"))
    data: Mapped[dict] = mapped_column(JSON, default=dict)
    applied: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)
