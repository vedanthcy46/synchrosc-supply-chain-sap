"""SQLAlchemy models for Incidents and Disruption Events."""
from datetime import datetime, timezone
from sqlalchemy import Column, String, Float, Text, JSON
from app.db.session import Base


def utc_now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


class Incident(Base):
    __tablename__ = "incidents"

    incident_id = Column(String(64), primary_key=True, index=True)
    event_id = Column(String(64), nullable=False, index=True)
    title = Column(String(255), nullable=False)
    status = Column(String(32), nullable=False, default="DETECTED", index=True)
    severity = Column(String(32), nullable=False, default="high")
    impact_summary = Column(JSON, nullable=True)
    selected_scenario_id = Column(String(64), nullable=True)
    approval_id = Column(String(64), nullable=True)
    created_at = Column(String(64), nullable=False, default=utc_now_iso)
    updated_at = Column(String(64), nullable=False, default=utc_now_iso, onupdate=utc_now_iso)


class DisruptionEventRecord(Base):
    __tablename__ = "disruption_events"

    event_id = Column(String(64), primary_key=True, index=True)
    incident_id = Column(String(64), nullable=True, index=True)
    event_type = Column(String(64), nullable=False)
    title = Column(String(255), nullable=False)
    description = Column(Text, nullable=False)
    severity = Column(String(32), nullable=False, default="high")
    source_type = Column(String(32), nullable=False, default="demo")
    source_name = Column(String(64), nullable=False, default="demo_seed.json")
    source_url = Column(String(255), nullable=True)
    confidence = Column(Float, nullable=False, default=1.0)
    affected_shipment_ids = Column(JSON, nullable=False, default=list)
    affected_supplier_ids = Column(JSON, nullable=False, default=list)
    evidence = Column(JSON, nullable=False, default=list)
    detected_at = Column(String(64), nullable=False, default=utc_now_iso)
