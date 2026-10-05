from contextlib import asynccontextmanager
import logging
import sys

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware

from app.api.routes import router
from app.core.config import settings
from app.core.limits import BodySizeLimit
from app.models.db import init_db
from app.services.auth import user_id_from_request
from app.services.generation_jobs import start_workers, stop_workers

logger = logging.getLogger(__name__)


def configure_logging() -> None:
    level = getattr(logging, settings.log_level.upper(), logging.INFO)
    logging.basicConfig(
        level=level,
        format="%(asctime)s %(levelname)s [%(name)s] %(message)s",
        stream=sys.stdout,
        force=True,
    )


def validate_production() -> None:
    if not settings.is_production:
        return
    if settings.jwt_secret in {"", "dev-change-me"}:
        raise RuntimeError(
            "JWT_SECRET must be a long random value when APP_ENV=production."
        )
    if settings.paywall:
        missing = [
            name
            for name, value in (
                ("STRIPE_SECRET_KEY", settings.stripe_secret_key),
                ("STRIPE_WEBHOOK_SECRET", settings.stripe_webhook_secret),
                ("STRIPE_PRICE_MONTHLY", settings.stripe_price_monthly),
            )
            if not value
        ]
        if missing:
            logger.error(
                "Paywall is on but billing is not configured (%s). Expired users cannot subscribe.",
                ", ".join(missing),
            )
    if not settings.supabase_service_role_key:
        logger.warning(
            "SUPABASE_SERVICE_ROLE_KEY is not set. Account deletion will leave the Supabase login behind."
        )
    if not settings.require_auth:
        logger.warning("REQUIRE_AUTH is off in production. Guests can queue custom passages.")
    if not settings.proxy_secret:
        logger.warning(
            "PROXY_SECRET is not set. Requests arrive from Vercel's shared addresses, so guest rate limits pool across users."
        )
    if not settings.redis_url:
        logger.warning("REDIS_URL is not set. Rate limits are per process, not shared across replicas.")


def configure_sentry() -> None:
    if not settings.sentry_dsn:
        return
    try:
        import sentry_sdk
    except ImportError:
        logger.warning("SENTRY_DSN is set but sentry-sdk is not installed.")
        return
    sentry_sdk.init(
        dsn=settings.sentry_dsn,
        environment=settings.app_env,
        traces_sample_rate=settings.sentry_traces_sample_rate,
        send_default_pii=False,
    )


configure_sentry()


def preload_analyzers() -> None:
    """Load each public language's analyzer before the replica reports healthy.

    Otherwise the first readers after a deploy wait while a model loads (up to
    20 s for Arabic), and nginx sends traffic to a replica that is not warm.
    """
    import time

    from app.services import morph, morph_ja

    loaders = [("ja", morph_ja.sudachi)]
    if settings.show_russian:
        loaders.append(("ru", morph.morph_analyzer))
    if settings.show_italian:
        from app.services import morph_it

        loaders.append(("it", morph_it.italian_nlp))
    if settings.show_arabic:
        from app.services import morph_ar

        loaders.append(("ar", morph_ar._camel))
    for language, load in loaders:
        started = time.monotonic()
        load()
        logger.info("Loaded %s analyzer in %.1fs", language, time.monotonic() - started)


@asynccontextmanager
async def lifespan(_app: FastAPI):
    configure_logging()
    validate_production()
    init_db()
    if settings.preload_analyzers:
        preload_analyzers()
    start_workers()
    if settings.news_scheduler:
        from app.services.news import start_news_scheduler

        start_news_scheduler()
    logger.info(
        "Lociros backend ready env=%s db=%s workers=%s news=%s redis=%s",
        settings.app_env,
        (
            "sqlite"
            if settings.sqlalchemy_url().startswith("sqlite")
            else "supabase"
            if settings.is_supabase
            else "postgres"
        ),
        settings.generate_workers,
        settings.news_scheduler,
        bool(settings.redis_url),
    )
    yield
    stop_workers()
    from app.services.news import stop_news_scheduler

    stop_news_scheduler()


_docs = not settings.is_production
app = FastAPI(
    title="Lociros",
    version="0.2.0",
    lifespan=lifespan,
    docs_url="/docs" if _docs else None,
    redoc_url="/redoc" if _docs else None,
    openapi_url="/openapi.json" if _docs else None,
)
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_origin_regex=settings.cors_origin_regex or None,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.add_middleware(BodySizeLimit, max_bytes=settings.max_body_bytes)


@app.middleware("http")
async def attach_user(request: Request, call_next):
    request.state.user_id = user_id_from_request(request)
    return await call_next(request)


@app.get("/health")
def root_health():
    return {"ok": True, "name": "lociros"}


app.include_router(router)
