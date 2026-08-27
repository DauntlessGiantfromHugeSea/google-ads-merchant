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
    # WordPress-Update-Digest-Webhook (WPMonitor o. Ä.) – ein Endpunkt fürs ganze Konto.
    wp_token: Mapped[str] = mapped_column(String(64), default="")
    wp_secret: Mapped[str] = mapped_column(Text, default="")  # optionales Signatur-Secret (verschlüsselt)

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

    # Brute-Force-Schutz: Fehlversuche zählen, Konto nach Grenze zeitweise sperren.
    failed_logins: Mapped[int] = mapped_column(default=0)
    locked_until: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


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
    hourly_rate: Mapped[float] = mapped_column(Float, default=0.0)     # €/h für die Zeitabrechnung

    # Vertragsdaten
    contract_package: Mapped[str] = mapped_column(String(255), default="")
    contract_status: Mapped[str] = mapped_column(String(64), default="")  # aktiv/pausiert/beendet
    contract_start: Mapped[str] = mapped_column(String(10), default="")
    contract_end: Mapped[str] = mapped_column(String(10), default="")
    contract_fee: Mapped[str] = mapped_column(String(64), default="")     # z.B. "990 € / Monat"
    contract_billing: Mapped[str] = mapped_column(String(64), default="")  # monatlich/jährlich
    contract_notes: Mapped[str] = mapped_column(Text, default="")
    # Erinnerung "Vertrag läuft aus" schon verschickt? (Reset, wenn sich contract_end ändert)
    contract_end_notified: Mapped[bool] = mapped_column(Boolean, default=False)

    # Analytics: veröffentlichtes Google-Sheet (CSV) für den automatischen KPI-Import
    kpi_sheet_url: Mapped[str] = mapped_column(Text, default="")
    kpi_synced_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    # Teilnehmermanagement (Contact Form 7 -> Webhook)
    participants_enabled: Mapped[bool] = mapped_column(Boolean, default=False)
    participant_token: Mapped[str] = mapped_column(String(64), default="")
    # Webhook: Mail-Benachrichtigung bei neuem Eintrag.
    webhook_notify_enabled: Mapped[bool] = mapped_column(Boolean, default=True)   # überhaupt mailen?
    webhook_notify_agency: Mapped[bool] = mapped_column(Boolean, default=True)    # an mich/Team
    webhook_notify_client: Mapped[bool] = mapped_column(Boolean, default=False)   # an Kunden
    webhook_notify_email: Mapped[str] = mapped_column(String(255), default="")    # feste Zusatzadresse
    webhook_include_fields: Mapped[bool] = mapped_column(Boolean, default=False)  # alle Felder in die Mail
    webhook_include_link: Mapped[bool] = mapped_column(Boolean, default=True)     # Link zum Eintrag
    # Webhook: automatische Bestätigungsmail an den Anmelder (eigenes Logo/Absender).
    webhook_confirm_enabled: Mapped[bool] = mapped_column(Boolean, default=False)
    webhook_confirm_subject: Mapped[str] = mapped_column(String(255), default="")
    webhook_confirm_text: Mapped[str] = mapped_column(Text, default="")
    webhook_from: Mapped[str] = mapped_column(String(255), default="")            # z.B. noreply@north-lab.de
    webhook_logo_base64: Mapped[str] = mapped_column(Text, default="")
    webhook_logo_content_type: Mapped[str] = mapped_column(String(64), default="")

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
    hourly_rate: Mapped[float] = mapped_column(Float, default=0.0)   # €/h; überschreibt den Kundensatz
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)

    client_id: Mapped[str] = mapped_column(ForeignKey("clients.id"))
    client: Mapped[Client] = relationship()


class ProjectFile(Base):
    """Datei-Anhang zu einem Projekt. Für den Kunden im Portal herunterladbar.
    In der DB gespeichert (wie Dokumente)."""

    __tablename__ = "project_files"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    filename: Mapped[str] = mapped_column(String(512), default="datei")
    content_type: Mapped[str] = mapped_column(String(128), default="application/octet-stream")
    size: Mapped[int] = mapped_column(default=0)
    data_base64: Mapped[str] = mapped_column(Text, default="")
    uploaded_by: Mapped[str] = mapped_column(String(255), default="")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)

    organization_id: Mapped[str] = mapped_column(ForeignKey("organizations.id"))
    project_id: Mapped[str] = mapped_column(ForeignKey("projects.id"))
    client_id: Mapped[str] = mapped_column(ForeignKey("clients.id"))


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


class Invoice(Base):
    """Extern erstellte Rechnung (E-Rechnung), hier nur zur Übersicht/Status
    verwaltet. Die Datei wird optional mitgespeichert."""

    __tablename__ = "invoices"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    number: Mapped[str] = mapped_column(String(128), default="")
    amount: Mapped[float] = mapped_column(Float, default=0.0)
    currency: Mapped[str] = mapped_column(String(8), default="EUR")
    issue_date: Mapped[str] = mapped_column(String(10), default="")   # YYYY-MM-DD
    due_date: Mapped[str] = mapped_column(String(10), default="")     # YYYY-MM-DD
    service_period: Mapped[str] = mapped_column(String(7), default="")  # Leistungszeitraum YYYY-MM
    status: Mapped[str] = mapped_column(String(16), default="offen")  # offen/bezahlt/storniert
    note: Mapped[str] = mapped_column(Text, default="")
    source: Mapped[str] = mapped_column(String(16), default="upload")  # upload/xrechnung
    # optional gespeicherte Datei (die Rechnung)
    filename: Mapped[str] = mapped_column(String(512), default="")
    content_type: Mapped[str] = mapped_column(String(128), default="")
    data_base64: Mapped[str] = mapped_column(Text, default="")
    # Zahlungsbeleg (Kontoauszug/Nachweis)
    receipt_filename: Mapped[str] = mapped_column(String(512), default="")
    receipt_content_type: Mapped[str] = mapped_column(String(128), default="")
    receipt_base64: Mapped[str] = mapped_column(Text, default="")
    paid_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    reminded_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_by: Mapped[str] = mapped_column(String(255), default="")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)

    organization_id: Mapped[str] = mapped_column(ForeignKey("organizations.id"))
    client_id: Mapped[str | None] = mapped_column(ForeignKey("clients.id"), nullable=True)
    client: Mapped[Client | None] = relationship()


class Onboarding(Base):
    """Onboarding-Dokument je Kunde: Ist-Analyse (Status quo) + Anforderungen
    ans Projekt. Von der Agentur geführt gepflegt. Felder liegen als JSON, damit
    die Struktur ohne Migration erweitert werden kann."""

    __tablename__ = "onboardings"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    data: Mapped[dict] = mapped_column(JSON, default=dict)            # {feld_id: text}
    checklist: Mapped[list] = mapped_column(JSON, default=list)       # [{id,text,done,note,group}]
    status: Mapped[str] = mapped_column(String(16), default="offen")  # offen/in_arbeit/fertig
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now, onupdate=_now)

    organization_id: Mapped[str] = mapped_column(ForeignKey("organizations.id"))
    client_id: Mapped[str] = mapped_column(ForeignKey("clients.id"))
    client: Mapped[Client] = relationship()


class Payment(Base):
    """Zahlungsein-/-ausgang (einfaches Kassenbuch): Betrag mit Richtung (+/-),
    Absender/Empfänger, IBAN, Betreff. Optional an Kunde/Rechnung gekoppelt."""

    __tablename__ = "payments"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    date: Mapped[str] = mapped_column(String(10), default="")          # YYYY-MM-DD
    direction: Mapped[str] = mapped_column(String(4), default="in")    # in (+) / out (-)
    amount: Mapped[float] = mapped_column(Float, default=0.0)          # immer positiv
    currency: Mapped[str] = mapped_column(String(8), default="EUR")
    counterparty: Mapped[str] = mapped_column(String(255), default="")  # Absender/Empfänger
    iban: Mapped[str] = mapped_column(String(64), default="")
    reference: Mapped[str] = mapped_column(Text, default="")           # Betreff/Verwendungszweck
    note: Mapped[str] = mapped_column(Text, default="")
    created_by: Mapped[str] = mapped_column(String(255), default="")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)

    organization_id: Mapped[str] = mapped_column(ForeignKey("organizations.id"))
    client_id: Mapped[str | None] = mapped_column(ForeignKey("clients.id"), nullable=True)
    invoice_id: Mapped[str | None] = mapped_column(ForeignKey("invoices.id"), nullable=True)


class Asset(Base):
    """Öffentlich abrufbare Datei (z. B. Logo-Variante) zur Einbindung auf
    anderen Seiten. Auslieferung ohne Login über einen unrat­baren Token."""

    __tablename__ = "assets"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    token: Mapped[str] = mapped_column(String(64), unique=True, index=True, default=_uuid)
    label: Mapped[str] = mapped_column(String(255), default="")
    filename: Mapped[str] = mapped_column(String(512), default="datei")
    content_type: Mapped[str] = mapped_column(String(128), default="application/octet-stream")
    size: Mapped[int] = mapped_column(default=0)
    data_base64: Mapped[str] = mapped_column(Text, default="")
    created_by: Mapped[str] = mapped_column(String(255), default="")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)

    organization_id: Mapped[str] = mapped_column(ForeignKey("organizations.id"))


class RichDoc(Base):
    """Frei zusammengestelltes Dokument (Report/Brief) aus Blöcken. Wird als
    PDF gerendert und kann per Mail verschickt werden."""

    __tablename__ = "rich_docs"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    title: Mapped[str] = mapped_column(String(255), default="")
    theme: Mapped[str] = mapped_column(String(24), default="editorial")  # editorial/letterhead
    accent: Mapped[str] = mapped_column(String(16), default="#4a7c2f")
    footer: Mapped[str] = mapped_column(String(255), default="")
    blocks: Mapped[list] = mapped_column(JSON, default=list)   # [{id,type,...}]
    created_by: Mapped[str] = mapped_column(String(255), default="")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now, onupdate=_now)

    organization_id: Mapped[str] = mapped_column(ForeignKey("organizations.id"))
    client_id: Mapped[str | None] = mapped_column(ForeignKey("clients.id"), nullable=True)


class FileRequest(Base):
    """Öffentliche Datei-Anforderung: über den Link können (ohne Login) Dateien
    hochgeladen werden. Dateien liegen auf der Platte (nicht in der DB)."""

    __tablename__ = "file_requests"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    token: Mapped[str] = mapped_column(String(64), unique=True, index=True, default=_uuid)
    title: Mapped[str] = mapped_column(String(255), default="")
    message: Mapped[str] = mapped_column(Text, default="")   # Hinweis an den Uploader
    active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_by: Mapped[str] = mapped_column(String(255), default="")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)

    organization_id: Mapped[str] = mapped_column(ForeignKey("organizations.id"))
    client_id: Mapped[str | None] = mapped_column(ForeignKey("clients.id"), nullable=True)
    files: Mapped[list[UploadedFile]] = relationship(back_populates="request", cascade="all, delete-orphan")


class UploadedFile(Base):
    """Eine hochgeladene Datei zu einer Anforderung. Wird nach Ablauf oder auf
    Wunsch von der Platte und aus der DB entfernt."""

    __tablename__ = "uploaded_files"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    filename: Mapped[str] = mapped_column(String(512), default="datei")
    content_type: Mapped[str] = mapped_column(String(128), default="application/octet-stream")
    size: Mapped[int] = mapped_column(default=0)
    storage_path: Mapped[str] = mapped_column(Text, default="")
    uploader: Mapped[str] = mapped_column(String(255), default="")   # optionaler Name
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)
    expires_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    organization_id: Mapped[str] = mapped_column(ForeignKey("organizations.id"))
    request_id: Mapped[str] = mapped_column(ForeignKey("file_requests.id"))
    request: Mapped[FileRequest] = relationship(back_populates="files")


class TimeEntry(Base):
    """Zeiterfassung je Nutzer (Stoppuhr oder manuell). Läuft, solange
    ended_at leer ist; duration_seconds wird beim Stoppen berechnet."""

    __tablename__ = "time_entries"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    description: Mapped[str] = mapped_column(Text, default="")
    started_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)
    ended_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    duration_seconds: Mapped[int] = mapped_column(default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)

    organization_id: Mapped[str] = mapped_column(ForeignKey("organizations.id"))
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id"))
    client_id: Mapped[str | None] = mapped_column(ForeignKey("clients.id"), nullable=True)
    project_id: Mapped[str | None] = mapped_column(ForeignKey("projects.id"), nullable=True)
    client: Mapped[Client | None] = relationship()


class ProjectDoc(Base):
    """Projekt-Dokumentation je Kunde: feste Abschnitts-Boxen (inkl. aktuellem
    Arbeitsstand) + Arbeitsprotokoll (was wurde gemacht). Beides als PDF."""

    __tablename__ = "project_docs"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    sections: Mapped[dict] = mapped_column(JSON, default=dict)   # {abschnitt_id: text}
    log: Mapped[list] = mapped_column(JSON, default=list)        # [{id,date,text,author}]
    status: Mapped[str] = mapped_column(String(40), default="")  # Phase/Status frei
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now, onupdate=_now)

    organization_id: Mapped[str] = mapped_column(ForeignKey("organizations.id"))
    client_id: Mapped[str] = mapped_column(ForeignKey("clients.id"))
    client: Mapped[Client] = relationship()


class KpiSnapshot(Base):
    """Kennzahlen eines Kunden für einen Zeitraum (Monat). Importiert aus einem
    veröffentlichten Google-Sheet (CSV) – nativ dargestellt, kein iframe."""

    __tablename__ = "kpi_snapshots"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    period: Mapped[str] = mapped_column(String(7), default="")  # YYYY-MM
    metrics: Mapped[dict] = mapped_column(JSON, default=dict)   # {kanonischer_key: wert}
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)

    organization_id: Mapped[str] = mapped_column(ForeignKey("organizations.id"))
    client_id: Mapped[str] = mapped_column(ForeignKey("clients.id"))
    client: Mapped[Client] = relationship()


class Credential(Base):
    """Interne Zugangsdaten je Kunde (nur fürs Agentur-Team). Benutzername,
    Passwort und Notiz liegen verschlüsselt (Fernet) in payload_enc – auch in
    DB-Backups nur verschlüsselt lesbar."""

    __tablename__ = "credentials"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    label: Mapped[str] = mapped_column(String(255), default="")
    url: Mapped[str] = mapped_column(String(512), default="")
    category: Mapped[str] = mapped_column(String(80), default="")
    payload_enc: Mapped[str] = mapped_column(Text, default="")  # verschlüsselt: {username,password,notes}
    created_by: Mapped[str] = mapped_column(String(255), default="")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now, onupdate=_now)

    organization_id: Mapped[str] = mapped_column(ForeignKey("organizations.id"))
    client_id: Mapped[str] = mapped_column(ForeignKey("clients.id"))
    client: Mapped[Client] = relationship()


class Dashboard(Base):
    """Eingebettetes Analytics-Dashboard je Kunde (z. B. Looker-Studio-Embed).
    Es wird nur der Link gespeichert – keine Zugangsdaten, keine Daten."""

    __tablename__ = "dashboards"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    label: Mapped[str] = mapped_column(String(255), default="")
    url: Mapped[str] = mapped_column(Text, default="")
    position: Mapped[int] = mapped_column(default=0)
    created_by: Mapped[str] = mapped_column(String(255), default="")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)

    organization_id: Mapped[str] = mapped_column(ForeignKey("organizations.id"))
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


class MailThread(Base):
    """E-Mail-Konversation mit einem Kontakt/Kunden. Jede Konversation trägt
    eine eindeutige Referenz (z. B. NF-7QK4-9ZM2P), die im Betreff mitgeschickt
    wird. Antworten des Kunden werden über diese Referenz automatisch der
    richtigen Konversation zugeordnet, sobald der Posteingang abgeglichen wird."""

    __tablename__ = "mail_threads"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    reference: Mapped[str] = mapped_column(String(32), index=True)   # z.B. NF-7QK4-9ZM2P
    subject: Mapped[str] = mapped_column(String(400), default="")    # Betreff ohne Referenz
    contact_email: Mapped[str] = mapped_column(String(255), default="")
    contact_name: Mapped[str] = mapped_column(String(255), default="")
    status: Mapped[str] = mapped_column(String(16), default="open")  # open / closed
    unread: Mapped[bool] = mapped_column(Boolean, default=False)     # ungelesene Kundenantwort
    last_message_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)
    last_direction: Mapped[str] = mapped_column(String(4), default="out")  # out / in
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)

    organization_id: Mapped[str] = mapped_column(ForeignKey("organizations.id"), index=True)
    client_id: Mapped[str | None] = mapped_column(ForeignKey("clients.id"), nullable=True)
    created_by: Mapped[str | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    client: Mapped[Client | None] = relationship()


class MailMessage(Base):
    """Einzelne Nachricht innerhalb einer Konversation – ausgehend (Agentur ->
    Kunde) oder eingehend (Kunde -> Agentur, per Posteingang-Abgleich)."""

    __tablename__ = "mail_messages"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    thread_id: Mapped[str] = mapped_column(ForeignKey("mail_threads.id"), index=True)
    direction: Mapped[str] = mapped_column(String(4), default="out")  # out / in
    from_email: Mapped[str] = mapped_column(String(255), default="")
    to_email: Mapped[str] = mapped_column(String(255), default="")
    subject: Mapped[str] = mapped_column(String(400), default="")
    body: Mapped[str] = mapped_column(Text, default="")
    author: Mapped[str] = mapped_column(String(255), default="")     # Name des Absenders (Agentur)
    graph_message_id: Mapped[str] = mapped_column(String(255), default="", index=True)  # Dedupe eingehend
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)

    organization_id: Mapped[str] = mapped_column(ForeignKey("organizations.id"))


class WpUpdate(Base):
    """Ein aktuell fälliges WordPress-Update (Core/Plugin/Theme) einer Website.
    Kommt aus dem WPMonitor-Digest; per Host dem Kunden zugeordnet (client_id
    kann leer sein, wenn die Seite keinem Kunden zugeordnet werden konnte)."""

    __tablename__ = "wp_updates"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=_uuid)
    organization_id: Mapped[str] = mapped_column(ForeignKey("organizations.id"), index=True)
    client_id: Mapped[str | None] = mapped_column(ForeignKey("clients.id"), nullable=True, index=True)
    site: Mapped[str] = mapped_column(String(255), default="")     # Anzeigename der Seite
    host: Mapped[str] = mapped_column(String(255), default="", index=True)
    url: Mapped[str] = mapped_column(String(512), default="")
    type: Mapped[str] = mapped_column(String(16), default="plugin")  # core / plugin / theme
    slug: Mapped[str] = mapped_column(String(200), default="")
    name: Mapped[str] = mapped_column(String(255), default="")
    installed: Mapped[str] = mapped_column(String(40), default="")
    latest: Mapped[str] = mapped_column(String(40), default="")
    first_seen: Mapped[str] = mapped_column(String(40), default="")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)
