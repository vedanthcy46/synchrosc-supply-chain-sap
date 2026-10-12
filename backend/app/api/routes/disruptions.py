"""Disruption sensing routes (Member 2 domain)."""
import uuid
from typing import Dict, Any, List
from fastapi import APIRouter, Depends, status
from sqlalchemy.orm import Session
from app.db.session import get_db
from app.models.incident import Incident, DisruptionEventRecord, utc_now_iso
from app.schemas.disruption import DisruptionEventCreate, DisruptionCreateResponse
from app.schemas.common import WorkflowState

router = APIRouter(prefix="/disruptions", tags=["Disruptions"])


@router.get("")
def list_disruptions(db: Session = Depends(get_db)) -> Dict[str, Any]:
    """List all sensed disruption events."""
    events = (
        db.query(DisruptionEventRecord)
        .order_by(DisruptionEventRecord.detected_at.desc())
        .all()
    )
    return {
        "items": [
            {
                "event_id": e.event_id,
                "incident_id": e.incident_id,
                "event_type": e.event_type,
                "title": e.title,
                "description": e.description,
                "severity": e.severity,
                "source_type": e.source_type,
                "source_name": e.source_name,
                "confidence": e.confidence,
                "affected_shipment_ids": e.affected_shipment_ids,
                "evidence": e.evidence,
                "detected_at": e.detected_at,
            }
            for e in events
        ]
    }


@router.post("", status_code=status.HTTP_201_CREATED, response_model=DisruptionCreateResponse)
def create_disruption(
    payload: DisruptionEventCreate,
    db: Session = Depends(get_db),
) -> DisruptionCreateResponse:
    """Validate and persist a disruption event, creating an initial incident in DETECTED state."""
    # Generate stable IDs or random if multiple
    existing_count = db.query(Incident).count()
    incident_id = f"INC-{existing_count + 1:03d}"
    event_id = f"EVT-{existing_count + 1:03d}"
    now_iso = utc_now_iso()

    event_record = DisruptionEventRecord(
        event_id=event_id,
        incident_id=incident_id,
        event_type=payload.event_type,
        title=payload.title,
        description=payload.description,
        severity=payload.severity.value,
        source_type=payload.source_type.value,
        source_name=payload.source_name,
        source_url=payload.source_url,
        confidence=payload.confidence,
        affected_shipment_ids=payload.affected_shipment_ids,
        affected_supplier_ids=payload.affected_supplier_ids,
        evidence=payload.evidence,
        detected_at=now_iso,
    )
    db.add(event_record)

    incident_record = Incident(
        incident_id=incident_id,
        event_id=event_id,
        title=payload.title,
        status=WorkflowState.DETECTED.value,
        severity=payload.severity.value,
        created_at=now_iso,
        updated_at=now_iso,
    )
    db.add(incident_record)
    db.commit()

    return DisruptionCreateResponse(
        incident_id=incident_id,
        event_id=event_id,
        status=WorkflowState.DETECTED,
        created_at=now_iso,
    )
