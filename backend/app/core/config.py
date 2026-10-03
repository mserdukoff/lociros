from pathlib import Path
from urllib.parse import urlparse

from pydantic import Field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

BACKEND_DIR = Path(__file__).resolve().parents[2]
PROJECT_ROOT = BACKEND_DIR.parent


def _parseable_db_url(url: str) -> str:
    """urlparse does not like SQLAlchemy's postgresql+psycopg2 scheme."""
    if url.startswith("postgresql+psycopg2://"):
        return "postgresql://" + url[len("postgresql+psycopg2://") :]
    return url


def normalize_database_url(url: str) -> str:
    """Hosted Postgres URLs often start with postgres://."""
    if url.startswith("postgres://"):
        return "postgresql+psycopg2://" + url[len("postgres://") :]
    if url.startswith("postgresql://") and "+psycopg" not in url:
        return "postgresql+psycopg2://" + url[len("postgresql://") :]
    return url


def is_supabase_url(url: str) -> bool:
    host = (urlparse(_parseable_db_url(url)).hostname or "").lower()
    return (
        host.endswith(".supabase.co")
        or host.endswith(".supabase.com")
        or host.endswith(".pooler.supabase.com")
    )


def is_transaction_pooler(url: str) -> bool:
    """Supabase transaction-mode pooler (shared or dedicated) listens on 6543."""
    return urlparse(_parseable_db_url(url)).port == 6543


def resolve_sslmode(url: str, sslmode: str) -> str:
    if sslmode:
        return sslmode
    if is_supabase_url(url):
        return "require"
    return ""


def apply_db_sslmode(url: str, sslmode: str) -> str:
    if not sslmode or "sslmode=" in url or not url.startswith("postgresql"):
        return url
    sep = "&" if "?" in url else "?"
    return f"{url}{sep}sslmode={sslmode}"


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=BACKEND_DIR / ".env",
        env_file_encoding="utf-8",
        extra="ignore",
        populate_by_name=True,
    )

    app_env: str = "development"
    log_level: str = "info"
    openrouter_api_key: str = ""
    llm_model: str = "openai/gpt-4o-mini"
    database_url: str = f"sqlite:///{BACKEND_DIR / 'levla.db'}"
    cors_origins: str = "http://localhost:3000,http://127.0.0.1:3000"
    cors_origin_regex: str = ""
    jwt_secret: str = "dev-change-me"
    supabase_url: str = ""
    google_client_id: str = ""
    google_client_secret: str = ""
    public_base_url: str = "http://localhost:3000"
    azure_speech_key: str = ""
    azure_speech_region: str = ""
    azure_speech_voice: str = "ja-JP-NanamiNeural"
    audio_dir: str = ""
    show_russian: bool = True
    show_italian: bool = True
    show_arabic: bool = True
    require_auth_enabled: bool | None = Field(default=None, validation_alias="REQUIRE_AUTH")
    generate_monthly_cap: int = 10
    auth_cookie_name: str = "lociros_token"
    data_root: str = Field(default="", validation_alias="DATA_DIR")
    cookie_secure: bool | None = None
    cookie_samesite: str = "lax"
    cookie_domain: str = ""
    db_pool_size: int = 5
    db_max_overflow: int = 10
    db_pool_recycle: int = 600
    db_sslmode: str = ""
    skip_seed: bool = False
    generate_workers: int = 2
    generate_max_pending: int = 3
    admin_emails: str = ""
    paywall_enabled: bool | None = None
    trial_days: int = 7
    free_guest_passages: int = 1
    stripe_secret_key: str = ""
    stripe_webhook_secret: str = ""
    stripe_price_monthly: str = ""
    stripe_price_annual: str = ""
    stripe_automatic_tax: bool = True
    supabase_service_role_key: str = ""
    contact_email: str = "hello@lociros.com"
    news_scheduler: bool = True
    max_body_bytes: int = 256 * 1024
    sentry_dsn: str = ""
    sentry_traces_sample_rate: float = 0.0
    allow_legacy_tokens: bool | None = None

    @field_validator("database_url", mode="before")
    @classmethod
    def _normalize_db_url(cls, value: object) -> object:
        if isinstance(value, str):
            return normalize_database_url(value)
        return value

    @property
    def is_production(self) -> bool:
        return self.app_env.lower() in {"production", "prod"}

    @property
    def paywall(self) -> bool:
        if self.paywall_enabled is not None:
            return self.paywall_enabled
        return self.is_production

    @property
    def require_auth(self) -> bool:
        if self.require_auth_enabled is not None:
            return self.require_auth_enabled
        return self.is_production

    @property
    def legacy_tokens(self) -> bool:
        if self.allow_legacy_tokens is not None:
            return self.allow_legacy_tokens
        return not self.is_production

    @property
    def billing_configured(self) -> bool:
        return bool(self.stripe_secret_key and self.stripe_price_monthly)

    @property
    def is_supabase(self) -> bool:
        return is_supabase_url(self.database_url)

    @property
    def effective_supabase_url(self) -> str:
        if self.supabase_url:
            return self.supabase_url.rstrip("/")
        host = (urlparse(_parseable_db_url(self.database_url)).hostname or "").lower()
        parts = host.split(".")
        if len(parts) >= 3 and parts[0] == "db" and host.endswith(".supabase.co"):
            return f"https://{parts[1]}.supabase.co"
        return ""

    @property
    def supabase_jwks_url(self) -> str:
        base = self.effective_supabase_url
        return f"{base}/auth/v1/.well-known/jwks.json" if base else ""

    @property
    def supabase_jwt_issuer(self) -> str:
        base = self.effective_supabase_url
        return f"{base}/auth/v1" if base else ""

    @property
    def uses_transaction_pooler(self) -> bool:
        return is_transaction_pooler(self.database_url)

    @property
    def effective_cookie_secure(self) -> bool:
        if self.cookie_secure is not None:
            return self.cookie_secure
        return self.is_production

    @property
    def audio_path(self) -> Path:
        if self.audio_dir:
            return Path(self.audio_dir)
        return BACKEND_DIR / "audio"

    @property
    def data_dir(self) -> Path:
        if self.data_root:
            return Path(self.data_root)
        return PROJECT_ROOT / "data"

    @property
    def admin_email_set(self) -> set[str]:
        return {e.strip().lower() for e in self.admin_emails.split(",") if e.strip()}

    def is_admin_email(self, email: str | None) -> bool:
        if not email:
            return False
        return email.strip().lower() in self.admin_email_set

    @property
    def cors_origin_list(self) -> list[str]:
        origins = [o.strip() for o in self.cors_origins.split(",") if o.strip()]
        base = self.public_base_url.rstrip("/")
        if base and base not in origins:
            origins.append(base)
        return origins

    def sqlalchemy_url(self) -> str:
        url = self.database_url
        sslmode = resolve_sslmode(url, self.db_sslmode)
        return apply_db_sslmode(url, sslmode)


settings = Settings()
