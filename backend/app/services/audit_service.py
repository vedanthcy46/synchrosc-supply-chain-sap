"""Audit Service (Member 4 domain).

Provides append-only audit event recording and read-only event logs.
"""
import uuid
from typing import Optional, List, Dict, Any
from sqlalchemy.orm import Session
from app.models.audit import AuditEventRecord
from app.models.incident import utc_now_iso


def record_audit_event(
    db: Session,
    incident_id: str,
    correlation_id: str,
    event_type: str,
    entity_type: str,
    entity_id: str,
    actor_type: str = "system",
    actor_id: str = "system",
    before_state: Optional[Dict[str, Any]] = None,
    after_state: Optional[Dict[str, Any]] = None,
    reason: Optional[str] = None,
    evidence_refs: Optional[List[str]] = None,
) -> AuditEventRecord:
    """Append a new immutable audit record."""
    audit_id = f"AUD-{uuid.uuid4().hex[:8]}"
    record = AuditEventRecord(
        audit_id=audit_id,
        incident_id=incident_id,
        correlation_id=correlation_id,
        actor_type=actor_type,
        actor_id=actor_id,
        event_type=event_type,
        entity_type=entity_type,
        entity_id=entity_id,
        before_state=before_state,
        after_state=after_state,
        reason=reason,
        evidence_refs=evidence_refs or [],
        created_at=utc_now_iso(),
    )
    db.add(record)
    db.commit()
    db.refresh(record)
    return record


def get_incident_audit_trail(db: Session, incident_id: str) -> List[AuditEventRecord]:
    """Retrieve full chronological audit trail for an incident."""
    return (
        db.query(AuditEventRecord)
        .filter(AuditEventRecord.incident_id == incident_id)
        .order_by(AuditEventRecord.created_at.asc())
        .all()
    )
