"""Audit timeline routes (Member 4 domain)."""
from typing import Dict, Any, List
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from app.db.session import get_db
from app.repositories.incident_repository import IncidentRepository
from app.services.audit_service import get_incident_audit_trail

router = APIRouter(prefix="/incidents", tags=["Audit"])


@router.get("/{incident_id}/audit")
def get_incident_audit(
    incident_id: str,
    db: Session = Depends(get_db),
) -> Dict[str, Any]:
    """Retrieve the append-only chronological audit log for an incident."""
    repo = IncidentRepository(db)
    incident = repo.get_required(incident_id)

    trail = get_incident_audit_trail(db, incident_id)

    return {
        "incident_id": incident.incident_id,
        "items": [
            {
                "audit_id": t.audit_id,
                "incident_id": t.incident_id,
                "correlation_id": t.correlation_id,
                "actor_type": t.actor_type,
                "actor_id": t.actor_id,
                "event_type": t.event_type,
                "entity_type": t.entity_type,
                "entity_id": t.entity_id,
                "before_state": t.before_state,
                "after_state": t.after_state,
                "reason": t.reason,
                "evidence_refs": t.evidence_refs,
                "created_at": t.created_at,
            }
            for t in trail
        ],
    }
