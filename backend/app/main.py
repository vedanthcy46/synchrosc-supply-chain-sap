"""SynchroSC Main FastAPI Application (Owned by Member 1 / Team Lead)."""
import logging
import uuid
from contextlib import asynccontextmanager
from typing import AsyncGenerator

from fastapi import FastAPI, Request, status
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

from app.core.config import settings
from app.db.session import init_db
from app.seed.seed_demo import seed_demo_data
from app.schemas.common import AppException, ErrorEnvelope, ErrorDetail
from app.api.router import api_router

logger = logging.getLogger("synchrosc")
logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncGenerator[None, None]:
    """Lifespan context initializing database tables and demo seed."""
    logger.info("Initializing SynchroSC database tables...")
    init_db()

    if settings.USE_DEMO_SEED:
        logger.info("Populating synthetic demo seed dataset...")
        seed_demo_data()

    yield
    logger.info("SynchroSC backend shutting down.")


app = FastAPI(
    title="SynchroSC Control Tower API",
    version="1.0.0",
    description="Agentic supply-chain resilience prototype for SAP Hackathon. All executions are simulated.",
    lifespan=lifespan,
)

# CORS Middleware
origins = settings.CORS_ORIGINS if isinstance(settings.CORS_ORIGINS, list) else [settings.CORS_ORIGINS]
app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["X-Correlation-ID"],
)


@app.middleware("http")
async def correlation_id_middleware(request: Request, call_next):
    """Correlation ID middleware propagating or generating unique request tracking ID."""
    corr_id = request.headers.get("X-Correlation-ID") or f"corr-{uuid.uuid4().hex[:8]}"
    request.state.correlation_id = corr_id

    response = await call_next(request)
    response.headers["X-Correlation-ID"] = corr_id
    return response


# --- Standard Error Envelope Exception Handlers ---


@app.exception_handler(AppException)
async def app_exception_handler(request: Request, exc: AppException) -> JSONResponse:
    """Format domain AppException into standard error envelope."""
    corr_id = getattr(request.state, "correlation_id", "corr-unknown")
    logger.warning("Domain exception [%s] on %s: %s", corr_id, request.url.path, exc.message)

    payload = ErrorEnvelope(
        error=ErrorDetail(
            code=exc.code,
            message=exc.message,
            details=exc.details,
            correlation_id=corr_id,
        )
    )
    return JSONResponse(status_code=exc.status_code, content=payload.model_dump())


@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request: Request, exc: RequestValidationError) -> JSONResponse:
    """Format Pydantic schema validation failures into common error envelope (422)."""
    corr_id = getattr(request.state, "correlation_id", "corr-unknown")
    payload = ErrorEnvelope(
        error=ErrorDetail(
            code="VALIDATION_ERROR",
            message="Request validation failed against contract schema.",
            details={"errors": exc.errors()},
            correlation_id=corr_id,
        )
    )
    return JSONResponse(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, content=payload.model_dump())


@app.exception_handler(StarletteHTTPException)
async def http_exception_handler(request: Request, exc: StarletteHTTPException) -> JSONResponse:
    """Format standard Starlette HTTPExceptions into common error envelope."""
    corr_id = getattr(request.state, "correlation_id", "corr-unknown")
    payload = ErrorEnvelope(
        error=ErrorDetail(
            code=f"HTTP_{exc.status_code}",
            message=str(exc.detail),
            details={},
            correlation_id=corr_id,
        )
    )
    return JSONResponse(status_code=exc.status_code, content=payload.model_dump())


@app.exception_handler(Exception)
async def unhandled_exception_handler(request: Request, exc: Exception) -> JSONResponse:
    """Catch unhandled errors, log internal trace, and return opaque 500 error envelope."""
    corr_id = getattr(request.state, "correlation_id", "corr-unknown")
    logger.exception("Unhandled server error [%s] on %s: %s", corr_id, request.url.path, exc)

    payload = ErrorEnvelope(
        error=ErrorDetail(
            code="INTERNAL_SERVER_ERROR",
            message="An unexpected server error occurred. Please contact support with correlation ID.",
            details={},
            correlation_id=corr_id,
        )
    )
    return JSONResponse(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, content=payload.model_dump())


# Include aggregated API routers
app.include_router(api_router, prefix=settings.API_PREFIX)
