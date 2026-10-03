import logging
import time
from datetime import datetime, timezone
from uuid import UUID

from sqlalchemy import (
    DateTime,
    Float,
    ForeignKey,
    Integer,
    String,
    Text,
    UniqueConstraint,
    Uuid,
    create_engine,
    inspect,
    text,
)
from sqlalchemy.exc import OperationalError
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, sessionmaker
from sqlalchemy.pool import NullPool

from app.core.config import (
    BACKEND_DIR,
    is_supabase_url,
    is_transaction_pooler,
    settings,
)

logger = logging.getLogger(__name__)

SHELF_PUBLIC = "public"
SHELF_QUARANTINE = "quarantine"


class Base(DeclarativeBase):
    pass


class PassageRow(Base):
    __tablename__ = "passages"

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    language: Mapped[str] = mapped_column(String(8), default="ru", index=True)
    level: Mapped[str] = mapped_column(String(8), index=True)
    topic: Mapped[str] = mapped_column(String(200))
    genre: Mapped[str | None] = mapped_column(String(40), nullable=True)
    title: Mapped[str] = mapped_column(String(300))
    text: Mapped[str] = mapped_column(Text)
    tokens_json: Mapped[str] = mapped_column(Text)
    calibration_json: Mapped[str] = mapped_column(Text)
    word_count: Mapped[int]
    translation: Mapped[str | None] = mapped_column(Text, nullable=True)
    shelf_status: Mapped[str] = mapped_column(
        String(16), default=SHELF_PUBLIC, index=True
    )
    audio_url: Mapped[str | None] = mapped_column(String(500), nullable=True)
    audio_cues_json: Mapped[str | None] = mapped_column(Text, nullable=True)
    series_id: Mapped[str | None] = mapped_column(String(64), nullable=True, index=True)
    chapter_index: Mapped[int | None] = mapped_column(Integer, nullable=True)
    comprehension_json: Mapped[str | None] = mapped_column(Text, nullable=True)
    topic_hash: Mapped[str | None] = mapped_column(String(64), nullable=True, index=True)
    source_name: Mapped[str | None] = mapped_column(String(120), nullable=True)
    source_url: Mapped[str | None] = mapped_column(String(500), nullable=True)
    source_date: Mapped[str | None] = mapped_column(String(32), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
    )


class FeedbackRow(Base):
    __tablename__ = "feedback"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    passage_id: Mapped[str] = mapped_column(String(36), index=True)
    rating: Mapped[str] = mapped_column(String(16))
    device_id: Mapped[str | None] = mapped_column(String(64), nullable=True, index=True)
    user_id: Mapped[int | None] = mapped_column(Integer, nullable=True, index=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
    )


class UserRow(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    email: Mapped[str | None] = mapped_column(String(320), unique=True, nullable=True)
    google_sub: Mapped[str | None] = mapped_column(String(128), unique=True, nullable=True)
    display_name: Mapped[str | None] = mapped_column(String(200), nullable=True)
    auth_id: Mapped[UUID | None] = mapped_column(Uuid(as_uuid=True), unique=True, nullable=True)
    trial_ends_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    stripe_customer_id: Mapped[str | None] = mapped_column(
        String(64), unique=True, nullable=True, index=True
    )
    stripe_subscription_id: Mapped[str | None] = mapped_column(String(64), nullable=True)
    subscription_status: Mapped[str | None] = mapped_column(String(24), nullable=True)
    subscription_plan: Mapped[str | None] = mapped_column(String(16), nullable=True)
    current_period_end: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    cancel_at_period_end: Mapped[bool] = mapped_column(default=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
    )


class StripeEventRow(Base):
    """Webhook events already applied, so Stripe retries are no-ops."""

    __tablename__ = "stripe_events"

    id: Mapped[str] = mapped_column(String(80), primary_key=True)
    kind: Mapped[str] = mapped_column(String(80))
    received_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
    )


class MagicLinkRow(Base):
    __tablename__ = "magic_links"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    email: Mapped[str] = mapped_column(String(320), index=True)
    token: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    used: Mapped[bool] = mapped_column(default=False)


class LearnerRow(Base):
    __tablename__ = "learners"
    __table_args__ = (UniqueConstraint("device_id", "language"),)

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    device_id: Mapped[str] = mapped_column(String(64), index=True)
    user_id: Mapped[int | None] = mapped_column(
        Integer, ForeignKey("users.id"), nullable=True, index=True
    )
    language: Mapped[str] = mapped_column(String(8))
    level: Mapped[str] = mapped_column(String(8), default="A2")
    consecutive_up: Mapped[int] = mapped_column(Integer, default=0)
    consecutive_down: Mapped[int] = mapped_column(Integer, default=0)
    placed: Mapped[int] = mapped_column(Integer, default=0)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
    )


class LearnerTapRow(Base):
    """Lemmas opened in the gloss. Separate from lemmas finished in a passage."""

    __tablename__ = "learner_taps"
    __table_args__ = (UniqueConstraint("device_id", "language", "lemma"),)

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    device_id: Mapped[str] = mapped_column(String(64), index=True)
    user_id: Mapped[int | None] = mapped_column(Integer, nullable=True, index=True)
    language: Mapped[str] = mapped_column(String(8))
    lemma: Mapped[str] = mapped_column(String(120))
    seen_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        index=True,
    )


class LearnerNewsSaveRow(Base):
    """A learner chose to keep a shared news passage on their shelf."""

    __tablename__ = "learner_news_saves"
    __table_args__ = (UniqueConstraint("device_id", "passage_id"),)

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    device_id: Mapped[str] = mapped_column(String(64), index=True)
    user_id: Mapped[int | None] = mapped_column(Integer, nullable=True, index=True)
    language: Mapped[str] = mapped_column(String(8))
    passage_id: Mapped[str] = mapped_column(String(36), index=True)
    saved_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
    )


class LearnerLemmaRow(Base):
    __tablename__ = "learner_lemmas"
    __table_args__ = (UniqueConstraint("device_id", "language", "lemma"),)

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    device_id: Mapped[str] = mapped_column(String(64), index=True)
    user_id: Mapped[int | None] = mapped_column(Integer, nullable=True, index=True)
    language: Mapped[str] = mapped_column(String(8))
    lemma: Mapped[str] = mapped_column(String(120))
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
    )


class LearnerStarRow(Base):
    __tablename__ = "learner_stars"
    __table_args__ = (UniqueConstraint("device_id", "language", "lemma"),)

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    device_id: Mapped[str] = mapped_column(String(64), index=True)
    user_id: Mapped[int | None] = mapped_column(Integer, nullable=True, index=True)
    language: Mapped[str] = mapped_column(String(8))
    lemma: Mapped[str] = mapped_column(String(120))
    gloss: Mapped[str | None] = mapped_column(String(200), nullable=True)
    reading: Mapped[str | None] = mapped_column(String(200), nullable=True)
    passage_id: Mapped[str | None] = mapped_column(String(36), nullable=True)
    context: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
    )


class LearnerReadRow(Base):
    __tablename__ = "learner_reads"
    __table_args__ = (UniqueConstraint("device_id", "passage_id"),)

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    device_id: Mapped[str] = mapped_column(String(64), index=True)
    user_id: Mapped[int | None] = mapped_column(Integer, nullable=True, index=True)
    passage_id: Mapped[str] = mapped_column(String(36), index=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
    )


class LearnerCardRow(Base):
    __tablename__ = "learner_cards"
    __table_args__ = (UniqueConstraint("device_id", "language", "lemma"),)

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    device_id: Mapped[str] = mapped_column(String(64), index=True)
    user_id: Mapped[int | None] = mapped_column(Integer, nullable=True, index=True)
    language: Mapped[str] = mapped_column(String(8))
    lemma: Mapped[str] = mapped_column(String(120))
    gloss: Mapped[str | None] = mapped_column(String(200), nullable=True)
    reading: Mapped[str | None] = mapped_column(String(200), nullable=True)
    context: Mapped[str | None] = mapped_column(Text, nullable=True)
    passage_id: Mapped[str | None] = mapped_column(String(36), nullable=True)
    ease: Mapped[float] = mapped_column(Float, default=2.5)
    interval: Mapped[int] = mapped_column(Integer, default=0)
    reps: Mapped[int] = mapped_column(Integer, default=0)
    due_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
    )


class TrialEventRow(Base):
    __tablename__ = "trial_events"

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    kind: Mapped[str] = mapped_column(String(40), index=True)
    device_id: Mapped[str | None] = mapped_column(String(64), nullable=True, index=True)
    user_id: Mapped[int | None] = mapped_column(Integer, nullable=True, index=True)
    passage_id: Mapped[str | None] = mapped_column(String(36), nullable=True, index=True)
    payload_json: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        index=True,
    )


class NewsIssueRow(Base):
    """One checked news passage per language, band, and UTC day. Shared across learners."""

    __tablename__ = "news_issues"
    __table_args__ = (UniqueConstraint("issue_date", "language", "level"),)

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    issue_date: Mapped[str] = mapped_column(String(10), index=True)
    language: Mapped[str] = mapped_column(String(8), index=True)
    level: Mapped[str] = mapped_column(String(8))
    status: Mapped[str] = mapped_column(String(16), default="pending", index=True)
    passage_id: Mapped[str | None] = mapped_column(String(36), nullable=True)
    source_name: Mapped[str | None] = mapped_column(String(120), nullable=True)
    source_url: Mapped[str | None] = mapped_column(String(500), nullable=True)
    headline: Mapped[str | None] = mapped_column(String(300), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
    )


class GenerateQuotaRow(Base):
    __tablename__ = "generate_quota"
    __table_args__ = (UniqueConstraint("account_key", "year_month"),)

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    account_key: Mapped[str] = mapped_column(String(80), index=True)
    year_month: Mapped[str] = mapped_column(String(7))
    count: Mapped[int] = mapped_column(Integer, default=0)


class LlmUsageRow(Base):
    """OpenRouter tokens spent per account per month, for spotting heavy users."""

    __tablename__ = "llm_usage"
    __table_args__ = (UniqueConstraint("account_key", "year_month"),)

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    account_key: Mapped[str] = mapped_column(String(80), index=True)
    year_month: Mapped[str] = mapped_column(String(7))
    calls: Mapped[int] = mapped_column(Integer, default=0)
    prompt_tokens: Mapped[int] = mapped_column(Integer, default=0)
    completion_tokens: Mapped[int] = mapped_column(Integer, default=0)


class GenerationJobRow(Base):
    __tablename__ = "generation_jobs"

    id: Mapped[str] = mapped_column(String(36), primary_key=True)
    status: Mapped[str] = mapped_column(String(16), index=True, default="pending")
    level: Mapped[str] = mapped_column(String(8))
    topic: Mapped[str] = mapped_column(String(200))
    genre: Mapped[str | None] = mapped_column(String(40), nullable=True)
    language: Mapped[str] = mapped_column(String(8), index=True)
    known_lemmas_json: Mapped[str | None] = mapped_column(Text, nullable=True)
    device_id: Mapped[str | None] = mapped_column(String(64), nullable=True, index=True)
    user_id: Mapped[int | None] = mapped_column(Integer, nullable=True, index=True)
    passage_id: Mapped[str | None] = mapped_column(String(36), nullable=True)
    error: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        index=True,
    )
    started_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    finished_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )


_DB_URL = settings.sqlalchemy_url()
connect_args: dict = {}
engine_kwargs: dict = {"pool_pre_ping": True}
if _DB_URL.startswith("sqlite"):
    connect_args = {"check_same_thread": False}
elif is_transaction_pooler(_DB_URL):
    # Transaction-mode PgBouncer/Supavisor cannot keep session state.
    engine_kwargs = {"poolclass": NullPool, "pool_pre_ping": True}
    connect_args["connect_timeout"] = 10
else:
    engine_kwargs["pool_size"] = settings.db_pool_size
    engine_kwargs["max_overflow"] = settings.db_max_overflow
    engine_kwargs["pool_recycle"] = settings.db_pool_recycle
    connect_args["connect_timeout"] = 10

engine = create_engine(_DB_URL, connect_args=connect_args, **engine_kwargs)
SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False)

_SQLITE_COLUMNS: dict[str, list[tuple[str, str]]] = {
    "passages": [
        ("language", "VARCHAR(8) DEFAULT 'ru'"),
        ("translation", "TEXT"),
        ("shelf_status", "VARCHAR(16) DEFAULT 'public'"),
        ("audio_url", "VARCHAR(500)"),
        ("audio_cues_json", "TEXT"),
        ("series_id", "VARCHAR(64)"),
        ("chapter_index", "INTEGER"),
        ("comprehension_json", "TEXT"),
        ("topic_hash", "VARCHAR(64)"),
        ("source_name", "VARCHAR(120)"),
        ("source_url", "VARCHAR(500)"),
        ("source_date", "VARCHAR(32)"),
    ],
    "learners": [
        ("user_id", "INTEGER"),
        ("consecutive_up", "INTEGER DEFAULT 0"),
        ("consecutive_down", "INTEGER DEFAULT 0"),
        ("placed", "INTEGER DEFAULT 1"),
    ],
    "learner_lemmas": [("user_id", "INTEGER")],
    "learner_stars": [
        ("user_id", "INTEGER"),
        ("reading", "VARCHAR(200)"),
        ("context", "TEXT"),
    ],
    "learner_reads": [("user_id", "INTEGER")],
    "feedback": [
        ("device_id", "VARCHAR(64)"),
        ("user_id", "INTEGER"),
    ],
    "users": [
        ("auth_id", "CHAR(36)"),
        ("trial_ends_at", "TIMESTAMP WITH TIME ZONE"),
        ("stripe_customer_id", "VARCHAR(64)"),
        ("stripe_subscription_id", "VARCHAR(64)"),
        ("subscription_status", "VARCHAR(24)"),
        ("subscription_plan", "VARCHAR(16)"),
        ("current_period_end", "TIMESTAMP WITH TIME ZONE"),
        ("cancel_at_period_end", "BOOLEAN DEFAULT FALSE"),
    ],
}


def wait_for_db(attempts: int = 30, delay: float = 1.0) -> None:
    """Block until the database accepts connections (Supabase / Compose startup)."""
    last: Exception | None = None
    for i in range(attempts):
        try:
            with engine.connect() as conn:
                conn.execute(text("SELECT 1"))
            return
        except OperationalError as exc:
            last = exc
            logger.warning("Database not ready (%s/%s): %s", i + 1, attempts, exc)
            time.sleep(delay)
    raise RuntimeError(f"Database did not become ready after {attempts}s") from last


def _is_postgres() -> bool:
    return _DB_URL.startswith("postgresql")


def _with_advisory_lock(fn) -> None:
    if not _is_postgres():
        fn()
        return
    if is_transaction_pooler(_DB_URL):
        logger.warning(
            "Skipping session advisory lock: DATABASE_URL is a transaction pooler "
            "(port 6543). Use the Supabase session pooler (port 5432) in production."
        )
        fn()
        return
    with engine.connect() as conn:
        conn.execute(text("SELECT pg_advisory_lock(872314)"))
        conn.commit()
        try:
            fn()
        finally:
            conn.execute(text("SELECT pg_advisory_unlock(872314)"))
            conn.commit()


APP_TABLES = (
    "passages",
    "feedback",
    "users",
    "magic_links",
    "learners",
    "learner_lemmas",
    "learner_stars",
    "learner_reads",
    "learner_cards",
    "learner_taps",
    "learner_news_saves",
    "trial_events",
    "generate_quota",
    "generation_jobs",
    "news_issues",
    "stripe_events",
    "llm_usage",
)


def lock_down_public_schema(conn) -> None:
    """Enable RLS and revoke PostgREST roles so the Data API cannot read app tables.

    The FastAPI process connects as the table owner (or postgres), which bypasses
    RLS. anon / authenticated have no policies, so REST/GraphQL access is denied.
    """
    names = set(inspect(conn).get_table_names())
    for table in APP_TABLES:
        if table not in names:
            continue
        conn.execute(text(f'ALTER TABLE "{table}" ENABLE ROW LEVEL SECURITY'))
    conn.execute(
        text(
            """
            DO $$
            DECLARE
              r text;
            BEGIN
              FOREACH r IN ARRAY ARRAY['anon', 'authenticated'] LOOP
                IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = r) THEN
                  EXECUTE format('REVOKE ALL ON ALL TABLES IN SCHEMA public FROM %I', r);
                  EXECUTE format('REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM %I', r);
                  EXECUTE format('REVOKE ALL ON SCHEMA public FROM %I', r);
                  EXECUTE format(
                    'ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM %I',
                    r
                  );
                  EXECUTE format(
                    'ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON SEQUENCES FROM %I',
                    r
                  );
                END IF;
              END LOOP;
            END $$;
            """
        )
    )


def _stamp_alembic_if_needed() -> None:
    """Adopt Alembic on a schema created by create_all so later migrations apply."""
    try:
        names = set(inspect(engine).get_table_names())
        if "alembic_version" in names or "passages" not in names:
            return
        from alembic.config import Config
        from alembic import command

        cfg = Config(str(BACKEND_DIR / "alembic.ini"))
        command.stamp(cfg, "head")
    except Exception:
        logger.exception("Could not stamp Alembic version; future migrations may need a manual stamp")


def _ensure_sqlite_columns() -> None:
    """Add columns that create_all will not add onto tables that already exist."""
    insp = inspect(engine)
    tables = set(insp.get_table_names())
    with engine.begin() as conn:
        for table, cols in _SQLITE_COLUMNS.items():
            if table not in tables:
                continue
            existing = {col["name"] for col in insp.get_columns(table)}
            for name, ddl in cols:
                if name not in existing:
                    conn.execute(text(f"ALTER TABLE {table} ADD COLUMN {name} {ddl}"))


def init_db() -> None:
    wait_for_db()

    def _bootstrap() -> None:
        Base.metadata.create_all(bind=engine)
        _ensure_sqlite_columns()
        _stamp_alembic_if_needed()
        if _is_postgres() and is_supabase_url(_DB_URL):
            with engine.begin() as conn:
                lock_down_public_schema(conn)
        if settings.skip_seed:
            return
        from app.services.seed import seed_library
        from app.services.catalog_ja import seed_catalog

        seed_library()
        seed_catalog()

    _with_advisory_lock(_bootstrap)
