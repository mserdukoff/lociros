from contextlib import asynccontextmanager
import logging
import sys

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware

from app.api.routes import router
from app.core.config import settings
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


@asynccontextmanager
async def lifespan(_app: FastAPI):
    configure_logging()
    validate_production()
    init_db()
    start_workers()
    logger.info(
        "Lociros backend ready env=%s db=%s workers=%s",
        settings.app_env,
        (
            "sqlite"
            if settings.sqlalchemy_url().startswith("sqlite")
            else "supabase"
            if settings.is_supabase
            else "postgres"
        ),
        settings.generate_workers,
    )
    yield
    stop_workers()


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


@app.middleware("http")
async def attach_user(request: Request, call_next):
    request.state.user_id = user_id_from_request(request)
    return await call_next(request)


@app.get("/health")
def root_health():
    return {"ok": True, "name": "lociros"}


app.include_router(router)
