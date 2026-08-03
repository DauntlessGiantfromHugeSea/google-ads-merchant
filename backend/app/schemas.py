"""Pydantic-Schemas für Request/Response."""
from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, EmailStr, field_validator

from app.models import AccountType, ReportStatus, ReportType, UserRole


# --- Auth ---
class RegisterRequest(BaseModel):
    organization_name: str
    email: EmailStr
    password: str
    full_name: str = ""


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class Token(BaseModel):
    access_token: str
    token_type: str = "bearer"


class UserOut(BaseModel):
    id: str
    email: EmailStr
    full_name: str
    role: UserRole
    organization_id: str
    client_id: str | None = None
    totp_enabled: bool = False

    class Config:
        from_attributes = True


class TwoFASetupOut(BaseModel):
    secret: str
    otpauth_uri: str
    qr_svg: str  # data:image/svg+xml;... zum direkten Einbetten


class TwoFACode(BaseModel):
    code: str


class NotificationOut(BaseModel):
    id: str
    type: str
    title: str
    body: str
    link: str
    read: bool
    client_id: str | None = None
    created_at: datetime

    class Config:
        from_attributes = True


# --- Clients ---
class ClientCreate(BaseModel):
    name: str
    contact_email: str = ""
    notes: str = ""


class ClientOut(BaseModel):
    id: str
    name: str
    notes: str
    onboarding_completed: bool
    created_at: datetime
    status: str
    tags: str
    archived: bool = False
    contact_email: str
    contact_person: str
    phone: str
    website: str
    address: str
    contract_package: str
    contract_status: str
    contract_start: str
    contract_end: str
    contract_fee: str
    contract_billing: str
    contract_notes: str
    company: str = ""
    billing_address: str = ""
    vat_id: str = ""
    billing_email: str = ""
    participants_enabled: bool = False
    pipeline_stage: str = ""
    deal_value: float = 0.0
    next_followup: str = ""
    hourly_rate: float = 0.0

    class Config:
        from_attributes = True


class ClientPatch(BaseModel):
    """Alle Felder optional – nur gesetzte werden aktualisiert."""
    name: str | None = None
    notes: str | None = None
    status: str | None = None
    tags: str | None = None
    archived: bool | None = None
    contact_email: str | None = None
    company: str | None = None
    billing_address: str | None = None
    vat_id: str | None = None
    billing_email: str | None = None
    contact_person: str | None = None
    phone: str | None = None
    website: str | None = None
    address: str | None = None
    contract_package: str | None = None
    contract_status: str | None = None
    contract_start: str | None = None
    contract_end: str | None = None
    contract_fee: str | None = None
    contract_billing: str | None = None
    contract_notes: str | None = None
    pipeline_stage: str | None = None
    deal_value: float | None = None
    next_followup: str | None = None
    hourly_rate: float | None = None


# --- To-Dos ---
class TodoCreate(BaseModel):
    title: str
    description: str = ""
    due_date: str = ""
    status: str = "open"
    priority: str = "normal"
    assignee: str = ""
    project_id: str | None = None
    assignee_id: str | None = None
    recurrence: str = ""


class TodoPatch(BaseModel):
    title: str | None = None
    description: str | None = None
    due_date: str | None = None
    status: str | None = None
    priority: str | None = None
    assignee: str | None = None
    project_id: str | None = None
    assignee_id: str | None = None
    recurrence: str | None = None


class TodoOut(BaseModel):
    id: str
    title: str
    description: str
    status: str
    priority: str
    assignee: str
    due_date: str
    created_at: datetime
    client_id: str
    project_id: str | None = None
    assignee_id: str | None = None
    assignee_name: str = ""
    recurrence: str = ""
    checklist_total: int = 0
    checklist_done: int = 0

    class Config:
        from_attributes = True


class ChecklistItemOut(BaseModel):
    id: str
    text: str
    done: bool
    position: int

    class Config:
        from_attributes = True


class ChecklistCreate(BaseModel):
    text: str


class ChecklistPatch(BaseModel):
    text: str | None = None
    done: bool | None = None


class AssigneeOut(BaseModel):
    """Zuweisbarer Nutzer für Aufgaben (Agentur-Team oder Kunden-Login)."""
    id: str
    full_name: str
    email: EmailStr
    role: UserRole
    kind: str  # "agency" | "client"


# --- Projekte (Kanban) ---
class ProjectCreate(BaseModel):
    title: str
    description: str = ""
    type: str = "design"
    status: str = "backlog"
    assignee: str = ""
    due_date: str = ""
    brief: str = ""
    budget: float = 0.0
    hours_quota: float = 0.0
    hourly_rate: float = 0.0


class ProjectPatch(BaseModel):
    title: str | None = None
    description: str | None = None
    type: str | None = None
    status: str | None = None
    assignee: str | None = None
    due_date: str | None = None
    brief: str | None = None
    budget: float | None = None
    hours_quota: float | None = None
    hourly_rate: float | None = None


class ProjectOut(BaseModel):
    id: str
    client_id: str
    title: str
    description: str
    type: str
    status: str
    assignee: str
    due_date: str
    brief: str = ""
    budget: float = 0.0
    hours_quota: float = 0.0
    hourly_rate: float = 0.0
    created_at: datetime

    class Config:
        from_attributes = True


class ProjectGlobalOut(ProjectOut):
    client_name: str = ""


class ProjectEventOut(BaseModel):
    id: str
    kind: str
    text: str
    actor: str
    created_at: datetime

    class Config:
        from_attributes = True


class ProjectEventCreate(BaseModel):
    text: str
    kind: str = "decision"


# --- Termine ---
class AppointmentCreate(BaseModel):
    title: str = ""
    starts_at: str = ""
    link: str = ""
    note: str = ""
    assignees: list[str] = []


class AppointmentPatch(BaseModel):
    title: str | None = None
    starts_at: str | None = None
    link: str | None = None
    note: str | None = None
    protocol: str | None = None
    assignees: list[str] | None = None


class AppointmentOut(BaseModel):
    id: str
    client_id: str
    client_name: str = ""
    title: str
    starts_at: str
    link: str
    note: str
    protocol: str
    assignees: list[str] = []
    assignee_names: list[str] = []
    created_at: datetime

    class Config:
        from_attributes = True


class TodoGlobalOut(TodoOut):
    client_name: str = ""
    project_title: str = ""


# --- Leistungs-/Paketkatalog ---
class PackageCreate(BaseModel):
    name: str
    category: str = ""
    price: str = ""
    interval: str = "monatlich"
    description: str = ""
    unit: str = "Stunden"
    unit_price: float = 0.0
    active: bool = True


class PackagePatch(BaseModel):
    name: str | None = None
    category: str | None = None
    price: str | None = None
    interval: str | None = None
    description: str | None = None
    unit: str | None = None
    unit_price: float | None = None
    active: bool | None = None


class PackageOut(BaseModel):
    id: str
    name: str
    category: str = ""
    price: str
    interval: str
    description: str
    unit: str
    unit_price: float
    active: bool

    class Config:
        from_attributes = True


# --- Angebote ---
class OfferItemIn(BaseModel):
    description: str = ""
    quantity: float = 1.0
    unit: str = "Stunden"
    unit_price: float = 0.0


class OfferItemOut(OfferItemIn):
    id: str
    position: int
    line_total: float = 0.0

    class Config:
        from_attributes = True


class OfferCreate(BaseModel):
    title: str = ""
    number: str = ""
    date: str = ""
    intro: str = ""
    vat_rate: float = 0.0
    items: list[OfferItemIn] = []


class OfferUpdate(BaseModel):
    title: str | None = None
    number: str | None = None
    date: str | None = None
    intro: str | None = None
    vat_rate: float | None = None
    items: list[OfferItemIn] | None = None


class OfferOut(BaseModel):
    id: str
    client_id: str
    client_name: str = ""
    number: str
    date: str
    title: str
    intro: str
    status: str
    vat_rate: float
    public_token: str
    accepted_by: str
    created_at: datetime
    sent_at: datetime | None = None
    accepted_at: datetime | None = None
    items: list[OfferItemOut] = []
    net: float = 0.0
    vat: float = 0.0
    gross: float = 0.0


class OfferAccept(BaseModel):
    name: str = ""
    email: str = ""
    code: str = ""


# --- Verträge (digital unterschreibbar) ---
class ContractServiceItem(BaseModel):
    description: str = ""
    qty: float = 1.0
    unit: str = ""
    price: float = 0.0


class ContractCreate(BaseModel):
    title: str = ""
    body: str = ""
    number: str = ""
    date: str = ""
    provider_block: str = ""
    client_block: str = ""
    services: list[ContractServiceItem] = []


class ContractPatch(BaseModel):
    title: str | None = None
    body: str | None = None
    number: str | None = None
    date: str | None = None
    provider_block: str | None = None
    client_block: str | None = None
    services: list[ContractServiceItem] | None = None


class ContractOut(BaseModel):
    id: str
    client_id: str
    number: str
    date: str
    title: str
    body: str
    provider_block: str = ""
    client_block: str = ""
    services: list[ContractServiceItem] = []
    status: str
    public_token: str
    signer_name: str
    signer_email: str
    signed_at: datetime | None = None
    agency_signer_name: str = ""
    agency_signed_at: datetime | None = None
    created_at: datetime
    sent_at: datetime | None = None

    @field_validator("services", mode="before")
    @classmethod
    def _svc_default(cls, v):
        return v or []

    class Config:
        from_attributes = True


class ContractSign(BaseModel):
    name: str = ""
    email: str = ""
    code: str = ""
    signature_image: str = ""
    place: str = ""


class ContractView(BaseModel):
    """E-Mail-Verifizierung, um den Vertrag überhaupt anzuzeigen."""
    code: str = ""
    email: str = ""


# --- Kundendaten-Formular (Intake) ---
class IntakeCreate(BaseModel):
    label: str = ""
    client_id: str | None = None
    ttl_hours: int = 720  # 30 Tage


class IntakeFormOut(BaseModel):
    id: str
    label: str
    client_id: str | None = None
    created_by: str
    created_at: datetime
    expires_at: datetime | None = None
    submission_count: int = 0


class IntakePublicOut(BaseModel):
    id: str
    label: str


class IntakeSubmit(BaseModel):
    company: str = ""
    contact_person: str = ""
    email: str = ""
    phone: str = ""
    website: str = ""
    billing_address: str = ""
    vat_id: str = ""
    billing_email: str = ""
    notes: str = ""


class IntakeSubmissionOut(BaseModel):
    id: str
    data: dict
    applied: bool
    created_at: datetime


# --- Briefing-/Anfrageformulare ---
class BriefingCreate(BaseModel):
    briefing_type: str = "general"
    label: str = ""
    intro: str = ""
    client_id: str | None = None
    ttl_hours: int = 720


class BriefingFormOut(BaseModel):
    id: str
    briefing_type: str
    label: str
    intro: str = ""
    client_id: str | None = None
    created_by: str
    created_at: datetime
    expires_at: datetime | None = None
    submission_count: int = 0


class BriefingPublicOut(BaseModel):
    id: str
    briefing_type: str
    type_label: str
    label: str
    intro: str = ""
    format_hint: str = ""
    channel_hint: str = ""


class BriefingSubmit(BaseModel):
    contact_name: str = ""
    contact_email: str = ""
    company: str = ""
    audience: str = ""      # Zielgruppe
    goal: str = ""          # Ziel
    format: str = ""        # Format
    channel: str = ""       # Kanal
    deadline: str = ""      # Deadline (YYYY-MM-DD)
    details: str = ""


class BriefingSubmissionOut(BaseModel):
    id: str
    briefing_type: str
    data: dict
    converted: bool
    project_id: str | None = None
    created_at: datetime


class BriefingConvert(BaseModel):
    client_id: str | None = None  # Zielkunde; leer -> Formular-Kunde oder neuer Lead


# --- Teilnehmermanagement (Contact Form 7) ---
class ParticipantOut(BaseModel):
    id: str
    form_name: str
    name: str
    email: str
    status: str
    data: dict
    created_at: datetime

    class Config:
        from_attributes = True


class ParticipantPatch(BaseModel):
    status: str | None = None
    name: str | None = None
    email: str | None = None


class ParticipantsStatus(BaseModel):
    enabled: bool
    webhook_url: str = ""
    count: int = 0


# --- Google-Ads-Aktivitätsprotokoll ---
class AdsActivityCreate(BaseModel):
    date: str = ""
    category: str = "aktivitaet"
    title: str
    body: str = ""


class AdsActivityOut(BaseModel):
    id: str
    client_id: str
    date: str
    category: str
    title: str
    body: str
    author: str
    created_at: datetime

    class Config:
        from_attributes = True


# --- Launch: Meilensteine ---
class MilestoneCreate(BaseModel):
    title: str
    description: str = ""
    status: str = "planned"
    date: str = ""


class MilestonePatch(BaseModel):
    title: str | None = None
    description: str | None = None
    status: str | None = None
    date: str | None = None


class MilestoneOut(BaseModel):
    id: str
    client_id: str
    title: str
    description: str
    status: str
    date: str
    position: int
    created_at: datetime

    class Config:
        from_attributes = True


# --- Launch: Freigaben ---
class ApprovalCreate(BaseModel):
    title: str
    description: str = ""
    link: str = ""


class ApprovalRespond(BaseModel):
    decision: str  # approved | changes_requested
    comment: str = ""


class ApprovalOut(BaseModel):
    id: str
    client_id: str
    title: str
    description: str
    link: str
    status: str
    response_comment: str
    responded_by: str
    responded_at: datetime | None = None
    created_at: datetime

    class Config:
        from_attributes = True


# --- Monitoring (Uptime Kuma) ---
class MonitorOut(BaseModel):
    id: str
    name: str
    url: str
    status: str
    message: str
    client_id: str | None = None
    client_name: str = ""
    changed_at: datetime

    class Config:
        from_attributes = True


class MonitorEventOut(BaseModel):
    id: str
    name: str
    url: str
    status: str
    message: str
    created_at: datetime

    class Config:
        from_attributes = True


# --- Microsoft-Mail ---
class MailStatus(BaseModel):
    connected: bool
    email: str = ""
    configured: bool = False


class MailAttachment(BaseModel):
    name: str = "anhang"
    content_type: str = "application/octet-stream"
    content_bytes: str = ""  # Base64 (ohne data:-Präfix) – wird nur durchgereicht, nicht gespeichert


class MailSend(BaseModel):
    to: str
    subject: str = ""
    body: str = ""
    html: bool = False
    attachments: list[MailAttachment] = []


# --- Dokumente ---
class DocumentOut(BaseModel):
    id: str
    filename: str
    content_type: str
    size: int
    uploaded_by: str
    created_at: datetime
    client_id: str

    class Config:
        from_attributes = True


# --- Rechnungen (extern erstellt, hier verwaltet) ---
class InvoiceUpdate(BaseModel):
    number: str | None = None
    amount: float | None = None
    currency: str | None = None
    issue_date: str | None = None
    due_date: str | None = None
    status: str | None = None
    note: str | None = None
    client_id: str | None = None


class InvoiceOut(BaseModel):
    id: str
    number: str
    amount: float
    currency: str
    issue_date: str
    due_date: str
    status: str          # offen/bezahlt/storniert (überfällig wird abgeleitet)
    overdue: bool = False
    note: str
    source: str
    filename: str
    has_file: bool = False
    client_id: str | None = None
    client_name: str = ""
    created_at: datetime

    class Config:
        from_attributes = True


# --- Interne Zugangsdaten (Team-Tresor je Kunde) ---
class VaultCredentialIn(BaseModel):
    label: str = ""
    url: str = ""
    category: str = ""
    username: str = ""
    password: str = ""
    notes: str = ""


class VaultCredentialOut(BaseModel):
    id: str
    label: str
    url: str
    category: str
    username: str = ""
    notes: str = ""
    has_password: bool = False
    created_by: str = ""
    updated_at: datetime | None = None


class VaultCredentialReveal(BaseModel):
    password: str = ""


# --- Datei-Anforderungen (öffentlicher Upload) ---
class FileRequestCreate(BaseModel):
    title: str = ""
    message: str = ""
    client_id: str | None = None


class UploadedFileOut(BaseModel):
    id: str
    filename: str
    content_type: str
    size: int
    uploader: str = ""
    created_at: datetime
    expires_at: datetime | None = None

    class Config:
        from_attributes = True


class FileRequestOut(BaseModel):
    id: str
    token: str
    title: str
    message: str
    active: bool
    client_id: str | None = None
    client_name: str = ""
    created_at: datetime
    file_count: int = 0
    total_size: int = 0
    files: list[UploadedFileOut] = []


class PublicUploadInfo(BaseModel):
    title: str = ""
    message: str = ""
    agency_name: str = ""
    active: bool = True
    max_bytes: int = 0
    retention_days: int = 7


# --- Zeiterfassung (Stoppuhr) ---
class TimeStart(BaseModel):
    client_id: str | None = None
    project_id: str | None = None
    description: str = ""


class TimeManual(BaseModel):
    client_id: str | None = None
    project_id: str | None = None
    description: str = ""
    date: str = ""          # YYYY-MM-DD
    minutes: int = 0


class TimePatch(BaseModel):
    client_id: str | None = None
    project_id: str | None = None
    description: str | None = None
    minutes: int | None = None
    date: str | None = None   # Tag verschieben (YYYY-MM-DD)


class TimeEntryOut(BaseModel):
    id: str
    client_id: str | None = None
    client_name: str = ""
    project_id: str | None = None
    project_title: str = ""
    user_name: str = ""
    description: str = ""
    started_at: datetime
    ended_at: datetime | None = None
    duration_seconds: int = 0
    billable_seconds: int = 0    # auf 15-Min-Takt aufgerundet
    running: bool = False

    class Config:
        from_attributes = True


# --- Projekt-Dokumentation (feste Boxen + Arbeitsprotokoll) ---
class ProjectDocIn(BaseModel):
    sections: dict = {}
    log: list = []
    status: str = ""


class ProjectDocOut(BaseModel):
    sections: dict = {}
    log: list = []
    status: str = ""
    updated_at: datetime | None = None


# --- Onboarding (Ist-Analyse + Anforderungen je Kunde) ---
class OnboardingIn(BaseModel):
    data: dict = {}
    checklist: list = []
    status: str = "offen"


class OnboardingOut(BaseModel):
    data: dict = {}
    checklist: list = []
    status: str = "offen"
    updated_at: datetime | None = None


# --- KPIs (nativer Analytics-Import aus Google-Sheet) ---
class KpiSnapshotOut(BaseModel):
    period: str
    metrics: dict = {}
    extras: dict = {}


class KpiSourceIn(BaseModel):
    url: str = ""


class KpiSourceOut(BaseModel):
    url: str = ""
    has_url: bool = False
    synced_at: datetime | None = None
    error: str = ""


# --- Analytics-Dashboards (Embed-Link je Kunde) ---
class DashboardCreate(BaseModel):
    label: str = ""
    url: str


class DashboardOut(BaseModel):
    id: str
    label: str
    url: str
    position: int
    client_id: str
    created_at: datetime

    class Config:
        from_attributes = True


# --- Team ---
class TeamInvite(BaseModel):
    email: EmailStr
    password: str
    full_name: str = ""
    role: str = "agency_member"  # agency_member | agency_admin


class TeamRoleUpdate(BaseModel):
    role: str  # agency_member | agency_admin


# --- Passwort-Safe (zero-knowledge) ---
class SecretCreate(BaseModel):
    ciphertext: str
    iv: str = ""
    views_left: int = 5
    note: str = ""
    ttl_hours: int = 168  # Standard: 7 Tage


class SecretInfoOut(BaseModel):
    id: str
    views_left: int
    note: str
    created_by: str
    expires_at: datetime | None = None


class SecretRevealOut(BaseModel):
    ciphertext: str
    iv: str
    views_left: int


# --- Agentur-Kontakt (für Kunden sichtbar) ---
class AgencyContact(BaseModel):
    agency_contact_name: str = ""
    agency_contact_email: str = ""
    agency_contact_phone: str = ""
    agency_contact_note: str = ""
    agency_address: str = ""
    email_notifications: bool = True
    meeting_link: str = ""
    timezone: str = "Europe/Berlin"


# --- Passwort-Anforderung (öffentlicher Einreich-Link) ---
class RequestCreate(BaseModel):
    label: str = ""
    ttl_hours: int = 336  # 14 Tage


class RequestOut(BaseModel):
    id: str
    label: str
    created_by: str
    created_at: datetime
    expires_at: datetime | None = None
    submission_count: int = 0


class RequestPublicOut(BaseModel):
    id: str
    label: str


class SubmissionCreate(BaseModel):
    secret: str
    note: str = ""


class SubmissionOut(BaseModel):
    id: str
    secret: str
    note: str
    created_at: datetime


# --- Verlauf / Updates ---
class UpdateCreate(BaseModel):
    title: str = ""
    body: str
    category: str = "update"


class UpdateOut(BaseModel):
    id: str
    title: str
    body: str
    category: str
    author_name: str
    created_at: datetime
    client_id: str

    class Config:
        from_attributes = True


# --- Accounts ---
class AccountCreate(BaseModel):
    type: AccountType
    external_id: str
    label: str = ""


class AccountOut(BaseModel):
    id: str
    type: AccountType
    external_id: str
    label: str
    client_id: str
    credentials_configured: bool = False

    class Config:
        from_attributes = True


class CredentialIn(BaseModel):
    developer_token: str = ""      # nur Google Ads
    client_id: str = ""
    client_secret: str = ""
    refresh_token: str = ""
    login_customer_id: str = ""    # optional, Ads-MCC
    service_account_json: str = ""  # Merchant: kompletter JSON-Schlüssel

    def as_payload(self) -> dict:
        return {k: v for k, v in self.model_dump().items() if v}


class CredentialStatus(BaseModel):
    configured: bool
    fields_present: list[str] = []


# --- Client user invitation ---
class InviteClientUser(BaseModel):
    email: EmailStr
    password: str = ""       # leer = Einladungslink (Passwort selbst festlegen)
    full_name: str = ""


class SetPasswordRequest(BaseModel):
    password: str


# --- Reports ---
class ReportCreate(BaseModel):
    type: ReportType = ReportType.combined
    period_start: str
    period_end: str


class ReportOut(BaseModel):
    id: str
    type: ReportType
    status: ReportStatus
    period_start: str
    period_end: str
    data_source: str
    client_id: str
    created_at: datetime
    completed_at: datetime | None = None
    error: str = ""

    class Config:
        from_attributes = True


class ReportDetailOut(ReportOut):
    ads_data: dict | None = None
    merchant_data: dict | None = None
    seo_data: dict | None = None
