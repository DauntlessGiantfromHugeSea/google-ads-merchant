"""Pydantic-Schemas für Request/Response."""
from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, EmailStr

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
    contact_email: str
    notes: str
    onboarding_completed: bool
    created_at: datetime

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

    def as_payload(self) -> dict:
        return {k: v for k, v in self.model_dump().items() if v}


class CredentialStatus(BaseModel):
    configured: bool
    fields_present: list[str] = []


# --- Client user invitation ---
class InviteClientUser(BaseModel):
    email: EmailStr
    password: str
    full_name: str = ""


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
