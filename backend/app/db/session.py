"""Database session, engine, and base declarative setup supporting PostgreSQL and SQLite."""
from typing import Generator
from sqlalchemy import create_engine
from sqlalchemy.orm import declarative_base, sessionmaker, Session
from app.core.config import settings

# Normalize dialect prefix if postgres:// was provided (SQLAlchemy 2.0 requires postgresql://)
raw_db_url = settings.DATABASE_URL
if raw_db_url.startswith("postgres://"):
    db_url = raw_db_url.replace("postgres://", "postgresql://", 1)
else:
    db_url = raw_db_url

engine_kwargs = {
    "echo": False,
    "pool_pre_ping": True,
}

if db_url.startswith("sqlite"):
    engine_kwargs["connect_args"] = {"check_same_thread": False}
else:
    # Serverless cloud PostgreSQL (e.g. Neon) pool tuning to avoid idle connection dropoffs
    engine_kwargs["pool_recycle"] = 300

engine = create_engine(db_url, **engine_kwargs)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

Base = declarative_base()


def get_db() -> Generator[Session, None, None]:
    """Dependency that yields a database session and safely closes it."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def init_db() -> None:
    """Initialize database schemas and tables."""
    import app.models.incident  # noqa: F401
    import app.models.supply_chain  # noqa: F401
    import app.models.scenario  # noqa: F401
    import app.models.approval  # noqa: F401
    import app.models.audit  # noqa: F401

    Base.metadata.create_all(bind=engine)
