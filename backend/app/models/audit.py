"""SQLAlchemy model for Audit Events."""
from sqlalchemy import Column, String, Text, JSON
from app.db.session import Base
from app.models.incident import utc_now_iso


class AuditEventRecord(Base):
    __tablename__ = "audit_events"

    audit_id = Column(String(64), primary_key=True, index=True)
    incident_id = Column(String(64), nullable=False, index=True)
    correlation_id = Column(String(64), nullable=False, index=True)
    actor_type = Column(String(32), nullable=False, default="system")  # system | user | agent
    actor_id = Column(String(128), nullable=False, default="system")
    event_type = Column(String(64), nullable=False)
    entity_type = Column(String(64), nullable=False)
    entity_id = Column(String(64), nullable=False)
    before_state = Column(JSON, nullable=True)
    after_state = Column(JSON, nullable=True)
    reason = Column(Text, nullable=True)
    evidence_refs = Column(JSON, nullable=False, default=list)
    created_at = Column(String(64), nullable=False, default=utc_now_iso)
