"""Health check and readiness route."""
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from sqlalchemy import text
from app.core.config import settings
from app.db.session import get_db

router = APIRouter(tags=["Health"])


@router.get("/health")
def get_health(db: Session = Depends(get_db)) -> dict:
    """Readiness/health check verifying database connectivity and configuration."""
    db_status = "connected"
    try:
        db.execute(text("SELECT 1"))
    except Exception as exc:
        db_status = f"unhealthy: {str(exc)}"

    return {
        "status": "ok" if db_status == "connected" else "degraded",
        "database": db_status,
        "execution_mode": settings.EXECUTION_MODE,
        "app_env": settings.APP_ENV,
        "llm_provider": settings.LLM_PROVIDER,
    }
