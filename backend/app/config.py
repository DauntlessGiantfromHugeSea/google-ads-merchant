"""Zentrale Konfiguration, geladen aus Umgebungsvariablen (.env)."""
from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    app_env: str = "development"
    secret_key: str = "dev-insecure-secret-change-me-please-0123456789"
    access_token_expire_minutes: int = 60

    database_url: str = "sqlite:///./dev.db"
    redis_url: str = "redis://localhost:6379/0"

    credential_encryption_key: str = ""

    # Google Ads
    google_ads_developer_token: str = ""
    google_ads_client_id: str = ""
    google_ads_client_secret: str = ""
    google_ads_login_customer_id: str = ""

    # Content API / Merchant
    google_oauth_client_id: str = ""
    google_oauth_client_secret: str = ""

    pagespeed_api_key: str = ""

    # Max. Anzahl Unterseiten, die der SEO-Crawler pro Lauf prüft.
    seo_max_pages: int = 40

    # Öffentliche Basis-URL (für OAuth-Redirects), z.B. https://north-flow.de
    public_base_url: str = "http://localhost:8000"

    # Microsoft 365 / Outlook (Mail senden via Graph)
    microsoft_client_id: str = ""
    microsoft_client_secret: str = ""
    microsoft_tenant: str = "common"

    # Wenn true: Rechnungs-/RE-Funktionen nur aus dem Tailscale-Netz (100.64.0.0/10)
    tailscale_guard: bool = False

    # Briefpapier: Pfad zur eigenen Vorlage (PDF empfohlen, auch PNG/JPG/SVG).
    # Leer = automatische Suche nach templates/letterhead.{pdf,png,jpg,svg}.
    letterhead_path: str = ""

    # "demo" | "live" | "" (auto: live falls Credentials vorhanden)
    data_source_mode: str = "demo"

    @property
    def use_live_data(self) -> bool:
        if self.data_source_mode == "live":
            return True
        if self.data_source_mode == "demo":
            return False
        return bool(self.google_ads_developer_token)


@lru_cache
def get_settings() -> Settings:
    return Settings()
