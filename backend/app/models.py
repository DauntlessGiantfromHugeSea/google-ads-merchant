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
    # Postanschrift der Agentur (für Verträge, Parteien-Block)
    agency_address: Mapped[str] = mapped_column(Text, default="")
    # E-Mail-Benachrichtigungen bei wichtigen Ereignissen (über Microsoft-Mail)
    email_notifications: Mapped[bool] = mapped_column(Boolean, default=True)
    # Untertitel auf der Login-Seite (editierbar im Branding)
    login_tagline: Mapped[str] = mapped_column(String(255), default="Reporting-Plattform für deine Kunden.")
    # Standard-Terminlink (z. B. Zoom/Meet/Calendly)
    meeting_link: Mapped[str] = mapped_column(String(512), default="")

    # Zeitzone für Anzeige & Reports (IANA-Name, z. B. Europe/Berlin)
    timezone: Mapped[str] = mapped_column(String(64), default="Europe/Berlin")

    # Microsoft-Mail (OAuth): verschlüsselter Refresh-Token + verbundene Adresse
    ms_refresh_token: Mapped[str] = mapped_column(Text, default="")
    ms_email: Mapped[str] = mapped_column(String(255), default="")

    # Uptime-Kuma-Webhook-Token (für Monitoring-Meldungen)
    monitor_token: Mapped[str] = mapped_column(String(64), default="")

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

    # Einladung: Token zum Passwort-Selbstfestlegen (bis gesetzt)
    invite_token: Mapped[str] = mapped_column(String(64), default="")
    invite_expires: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    # Zwei-Faktor-Authentifizierung (TOTP). Secret verschlüsselt gespeichert.
    totp_secret: Mapped[str] = mapped_column(Text, default="")
    totp_enabled: Mapped[bool] = mapped_column(Boolean, default=False)


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
    archived: Mapped[bool] = mapped_column(Boolean, default=False)

    # Vertrieb / CRM-Pipeline
    pipeline_stage: Mapped[str] = mapped_column(String(24), default="")  # lead/kontaktiert/angebot/gewonnen/verloren
    deal_value: Mapped[float] = mapped_column(Float, default=0.0)        # erwarteter Wert (€)
    next_followup: Mapped[str] = mapped_column(String(10), default="")   # nächstes Follow-up (YYYY-MM-DD)

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

    # Teilnehmermanagement (Contact Form 7 -> Webhook)
    participants_enabled: Mapped[bool] = mapped_column(Boolean, default=False)
    participant_token: Mapped[str] = mapped_column(String(64), default="")

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

    # Optionale Zuordnung zu einem Projekt des Kunden.
    project_id: Mapped[str | None] = mapped_column(ForeignKey("projects.id"), nullable=True)
    # Optionale Zuordnung zu einem Nutzer (Agentur-Mitarbeiter/Admin oder Kunde).
    assignee_id: Mapped[str | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    # Wurde für diese Aufgabe schon eine Überfällig-Erinnerung erzeugt?
    overdue_notified: Mapped[bool] = mapped_column(Boolean, default=False)
    # Wiederkehrend: "" | daily | weekly | monthly
    recurrence: Mapped[str] = mapped_column(String(16), default="")

    checklist: Mapped[list[ChecklistItem]] = relationship(
        back_populates="todo", cascade="all, delete-orphan", order_by="ChecklistItem.position")


class ChecklistItem(Base):
    """Unteraufgabe / Checklisten-Punkt einer Aufgabe."""

    __tablename__ = "checklist_items"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    todo_id: Mapped[str] = mapped_column(ForeignKey("todos.id"))
    text: Mapped[str] = mapped_column(String(512), default="")
    done: Mapped[bool] = mapped_column(Boolean, default=False)
    position: Mapped[int] = mapped_column(default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)

    todo: Mapped[Todo] = relationship(back_populates="checklist")


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
    # Briefing/Projektziel, Budget (€) und Stundenkontingent.
    brief: Mapped[str] = mapped_column(Text, default="")
    budget: Mapped[float] = mapped_column(Float, default=0.0)
    hours_quota: Mapped[float] = mapped_column(Float, default=0.0)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)

    client_id: Mapped[str] = mapped_column(ForeignKey("clients.id"))
    client: Mapped[Client] = relationship()


class Appointment(Base):
    """Termin je Kunde – mit Link, Teilnehmern (Mitarbeitern) und Protokoll."""

    __tablename__ = "appointments"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    organization_id: Mapped[str] = mapped_column(ForeignKey("organizations.id"))
    client_id: Mapped[str] = mapped_column(ForeignKey("clients.id"), index=True)
    title: Mapped[str] = mapped_column(String(512), default="")
    starts_at: Mapped[str] = mapped_column(String(32), default="")   # "YYYY-MM-DDTHH:MM"
    link: Mapped[str] = mapped_column(String(512), default="")
    note: Mapped[str] = mapped_column(Text, default="")
    protocol: Mapped[str] = mapped_column(Text, default="")          # Protokoll/Notizen
    assignees: Mapped[list] = mapped_column(JSON, default=list)      # Mitarbeiter-User-IDs
    created_by: Mapped[str] = mapped_column(String(255), default="")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)


class ProjectEvent(Base):
    """Projektchronik: automatisch protokollierte Änderungen + Entscheidungen."""

    __tablename__ = "project_events"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    project_id: Mapped[str] = mapped_column(ForeignKey("projects.id"), index=True)
    client_id: Mapped[str] = mapped_column(ForeignKey("clients.id"))
    organization_id: Mapped[str] = mapped_column(ForeignKey("organizations.id"))
    kind: Mapped[str] = mapped_column(String(24), default="note")  # created/status/edit/note/decision
    text: Mapped[str] = mapped_column(Text, default="")
    actor: Mapped[str] = mapped_column(String(255), default="")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)


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


class Milestone(Base):
    """Launch-/Projekt-Meilenstein je Kunde (Roadmap, für Kunde sichtbar)."""

    __tablename__ = "milestones"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    client_id: Mapped[str] = mapped_column(ForeignKey("clients.id"))
    title: Mapped[str] = mapped_column(String(512), nullable=False)
    description: Mapped[str] = mapped_column(Text, default="")
    status: Mapped[str] = mapped_column(String(16), default="planned")  # planned/in_progress/done
    date: Mapped[str] = mapped_column(String(10), default="")
    position: Mapped[int] = mapped_column(default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)


class Approval(Base):
    """Freigabe-Anfrage je Kunde (z.B. Staging-Link). Kunde gibt frei oder
    fordert Änderungen an."""

    __tablename__ = "approvals"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    client_id: Mapped[str] = mapped_column(ForeignKey("clients.id"))
    title: Mapped[str] = mapped_column(String(512), nullable=False)
    description: Mapped[str] = mapped_column(Text, default="")
    link: Mapped[str] = mapped_column(String(512), default="")
    status: Mapped[str] = mapped_column(String(24), default="pending")  # pending/approved/changes_requested
    response_comment: Mapped[str] = mapped_column(Text, default="")
    responded_by: Mapped[str] = mapped_column(String(255), default="")
    responded_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)


class MonitorStatus(Base):
    """Status einer überwachten Website (aus Uptime Kuma per Webhook)."""

    __tablename__ = "monitor_status"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    organization_id: Mapped[str] = mapped_column(ForeignKey("organizations.id"))
    name: Mapped[str] = mapped_column(String(255), default="")
    url: Mapped[str] = mapped_column(String(512), default="")
    status: Mapped[str] = mapped_column(String(16), default="pending")  # up/down/pending
    message: Mapped[str] = mapped_column(Text, default="")
    client_id: Mapped[str | None] = mapped_column(ForeignKey("clients.id"), nullable=True)
    changed_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)


class MonitorEvent(Base):
    """Verlauf: einzelne Status-Meldung eines Monitors (Up/Down-Historie)."""

    __tablename__ = "monitor_events"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    organization_id: Mapped[str] = mapped_column(ForeignKey("organizations.id"))
    client_id: Mapped[str | None] = mapped_column(ForeignKey("clients.id"), nullable=True)
    name: Mapped[str] = mapped_column(String(255), default="")
    url: Mapped[str] = mapped_column(String(512), default="")
    status: Mapped[str] = mapped_column(String(16), default="pending")
    message: Mapped[str] = mapped_column(Text, default="")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)


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
    category: Mapped[str] = mapped_column(String(80), default="")
    price: Mapped[str] = mapped_column(String(64), default="")
    interval: Mapped[str] = mapped_column(String(32), default="monatlich")  # monatlich/jährlich/einmalig
    description: Mapped[str] = mapped_column(Text, default="")
    unit: Mapped[str] = mapped_column(String(32), default="Stunden")       # Stunden/Monat/Pauschal
    unit_price: Mapped[float] = mapped_column(Float, default=0.0)          # Stundensatz/Einzelpreis
    active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)


class Offer(Base):
    """Angebot je Kunde/Lead (Positionen, Gesamtbetrag, online annehmbar)."""

    __tablename__ = "offers"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    organization_id: Mapped[str] = mapped_column(ForeignKey("organizations.id"))
    client_id: Mapped[str] = mapped_column(ForeignKey("clients.id"))
    number: Mapped[str] = mapped_column(String(64), default="")
    date: Mapped[str] = mapped_column(String(10), default="")
    title: Mapped[str] = mapped_column(String(512), default="")
    intro: Mapped[str] = mapped_column(Text, default="")
    status: Mapped[str] = mapped_column(String(16), default="draft")  # draft/sent/accepted/declined
    vat_rate: Mapped[float] = mapped_column(Float, default=0.0)        # % (0 = keine USt ausweisen)
    public_token: Mapped[str] = mapped_column(String(64), default="")
    accepted_by: Mapped[str] = mapped_column(String(255), default="")
    accepted_email: Mapped[str] = mapped_column(String(255), default="")
    # E-Mail-Verifizierung der Annahme (Code an die hinterlegte Kunden-Adresse).
    accept_code: Mapped[str] = mapped_column(String(16), default="")
    accept_code_expires: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)
    sent_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    accepted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    items: Mapped[list[OfferItem]] = relationship(
        back_populates="offer", cascade="all, delete-orphan", order_by="OfferItem.position")


class OfferItem(Base):
    """Angebotsposition."""

    __tablename__ = "offer_items"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    offer_id: Mapped[str] = mapped_column(ForeignKey("offers.id"))
    position: Mapped[int] = mapped_column(default=0)
    description: Mapped[str] = mapped_column(Text, default="")
    quantity: Mapped[float] = mapped_column(Float, default=1.0)
    unit: Mapped[str] = mapped_column(String(32), default="Stunden")
    unit_price: Mapped[float] = mapped_column(Float, default=0.0)

    offer: Mapped[Offer] = relationship(back_populates="items")


class Contract(Base):
    """Vertrag je Kunde, online digital unterschreibbar."""

    __tablename__ = "contracts"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    organization_id: Mapped[str] = mapped_column(ForeignKey("organizations.id"))
    client_id: Mapped[str] = mapped_column(ForeignKey("clients.id"))
    number: Mapped[str] = mapped_column(String(64), default="")
    date: Mapped[str] = mapped_column(String(10), default="")
    title: Mapped[str] = mapped_column(String(512), default="")
    body: Mapped[str] = mapped_column(Text, default="")
    # Parteien (automatisch aus Agentur-/Kundendaten, editierbar)
    provider_block: Mapped[str] = mapped_column(Text, default="")  # Dienstleister/Agentur
    client_block: Mapped[str] = mapped_column(Text, default="")    # Kunde
    # Inkludierte Leistungen (Liste {description, qty, unit, price}) – am Ende vor den Unterschriften
    services: Mapped[list] = mapped_column(JSON, default=list)
    status: Mapped[str] = mapped_column(String(16), default="draft")  # draft/sent/signed/declined
    public_token: Mapped[str] = mapped_column(String(64), default="")
    # Digitale Unterschrift – Kunde
    signer_name: Mapped[str] = mapped_column(String(255), default="")
    signer_email: Mapped[str] = mapped_column(String(255), default="")
    signature_image: Mapped[str] = mapped_column(Text, default="")  # PNG data-URL
    signed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    signed_ip: Mapped[str] = mapped_column(String(64), default="")
    signed_place: Mapped[str] = mapped_column(String(255), default="")
    # Digitale Unterschrift – Agentur (Dienstleister)
    agency_signer_name: Mapped[str] = mapped_column(String(255), default="")
    agency_signature_image: Mapped[str] = mapped_column(Text, default="")
    agency_signed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    agency_signed_place: Mapped[str] = mapped_column(String(255), default="")
    # E-Mail-Verifizierung der Unterschrift
    sign_code: Mapped[str] = mapped_column(String(16), default="")
    sign_code_expires: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)
    sent_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


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


class SeoAudit(Base):
    """Gespeicherter SEO-Audit (Verlauf/Drift), optional einem Kunden zugeordnet."""

    __tablename__ = "seo_audits"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    organization_id: Mapped[str] = mapped_column(ForeignKey("organizations.id"))
    client_id: Mapped[str | None] = mapped_column(ForeignKey("clients.id"), nullable=True, index=True)
    url: Mapped[str] = mapped_column(String(512), default="")
    score: Mapped[int] = mapped_column(default=0)
    grade: Mapped[str] = mapped_column(String(2), default="")
    data: Mapped[dict] = mapped_column(JSON, default=dict)
    created_by: Mapped[str] = mapped_column(String(255), default="")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)


class Participant(Base):
    """Teilnehmer-/Anmeldungseintrag (aus Contact Form 7 per Webhook)."""

    __tablename__ = "participants"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    organization_id: Mapped[str] = mapped_column(ForeignKey("organizations.id"))
    client_id: Mapped[str] = mapped_column(ForeignKey("clients.id"), index=True)
    form_name: Mapped[str] = mapped_column(String(255), default="")
    name: Mapped[str] = mapped_column(String(255), default="")
    email: Mapped[str] = mapped_column(String(255), default="")
    status: Mapped[str] = mapped_column(String(24), default="new")  # new/confirmed/cancelled
    data: Mapped[dict] = mapped_column(JSON, default=dict)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)


class BriefingForm(Base):
    """Öffentliches Briefing-/Anfrageformular je Briefing-Art."""

    __tablename__ = "briefing_forms"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)  # Token = Link-ID
    organization_id: Mapped[str] = mapped_column(ForeignKey("organizations.id"))
    client_id: Mapped[str | None] = mapped_column(ForeignKey("clients.id"), nullable=True)
    briefing_type: Mapped[str] = mapped_column(String(40), default="general")
    label: Mapped[str] = mapped_column(String(255), default="")
    intro: Mapped[str] = mapped_column(Text, default="")
    created_by: Mapped[str] = mapped_column(String(255), default="")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)
    expires_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class BriefingSubmission(Base):
    """Eine über ein Briefing-Formular eingereichte Anfrage."""

    __tablename__ = "briefing_submissions"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    form_id: Mapped[str] = mapped_column(ForeignKey("briefing_forms.id"))
    briefing_type: Mapped[str] = mapped_column(String(40), default="general")
    data: Mapped[dict] = mapped_column(JSON, default=dict)
    converted: Mapped[bool] = mapped_column(Boolean, default=False)
    project_id: Mapped[str | None] = mapped_column(String(36), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)


class Notification(Base):
    """In-App-Benachrichtigung für einen Nutzer (Glocke im Header)."""

    __tablename__ = "notifications"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    organization_id: Mapped[str] = mapped_column(ForeignKey("organizations.id"))
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id"), index=True)
    client_id: Mapped[str | None] = mapped_column(ForeignKey("clients.id"), nullable=True)
    type: Mapped[str] = mapped_column(String(40), default="info")
    title: Mapped[str] = mapped_column(String(255), default="")
    body: Mapped[str] = mapped_column(Text, default="")
    link: Mapped[str] = mapped_column(String(255), default="")  # Frontend-Pfad, z.B. /clients/<id>
    read: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)
