"""Disruption sensing routes (Member 2 domain)."""
from typing import Dict, Any, List, Optional
from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.orm import Session
from app.db.session import get_db
from app.models.incident import Incident, DisruptionEventRecord, utc_now_iso
from app.schemas.disruption import (
    DisruptionEventCreate,
    DisruptionCreateResponse,
    DisruptionEvent,
    DisruptionListResponse,
)
from app.schemas.common import WorkflowState
from app.agents.disruption_sensing import DisruptionSensingAgent

router = APIRouter(prefix="/disruptions", tags=["Disruptions"])


@router.get("", response_model=DisruptionListResponse)
def list_disruptions(
    severity: Optional[str] = Query(None, description="Filter disruptions by severity"),
    limit: int = Query(100, ge=1, le=500),
    db: Session = Depends(get_db),
) -> DisruptionListResponse:
    """List all sensed and recorded disruption events."""
    query = db.query(DisruptionEventRecord)
    if severity:
        query = query.filter(DisruptionEventRecord.severity == severity.lower())

    total_count = query.count()
    events = (
        query.order_by(DisruptionEventRecord.detected_at.desc())
        .limit(limit)
        .all()
    )

    items = [
        DisruptionEvent(
            event_id=e.event_id,
            incident_id=e.incident_id,
            event_type=e.event_type,
            title=e.title,
            description=e.description,
            severity=e.severity,
            source_type=e.source_type,
            source_name=e.source_name,
            source_url=e.source_url,
            confidence=e.confidence,
            affected_shipment_ids=e.affected_shipment_ids or [],
            affected_supplier_ids=e.affected_supplier_ids or [],
            evidence=e.evidence or [],
            detected_at=e.detected_at,
        )
        for e in events
    ]

    return DisruptionListResponse(
        items=items,
        total=total_count,
    )


@router.post("", status_code=status.HTTP_201_CREATED, response_model=DisruptionCreateResponse)
def create_disruption(
    payload: DisruptionEventCreate,
    db: Session = Depends(get_db),
) -> DisruptionCreateResponse:
    """Validate, normalize, and persist a disruption event through DisruptionSensingAgent,

    creating an initial incident in DETECTED state.
    """
    # Normalize and validate through agent domain logic
    normalized = DisruptionSensingAgent.validate_and_normalize(payload.model_dump())

    # Generate sequential incident and event IDs
    existing_count = db.query(Incident).count()
    incident_id = f"INC-{existing_count + 1:03d}"
    event_id = f"EVT-{existing_count + 1:03d}"
    now_iso = utc_now_iso()

    event_record = DisruptionEventRecord(
        event_id=event_id,
        incident_id=incident_id,
        event_type=normalized.event_type,
        title=normalized.title,
        description=normalized.description,
        severity=normalized.severity.value,
        source_type=normalized.source_type.value,
        source_name=normalized.source_name,
        source_url=normalized.source_url,
        confidence=normalized.confidence,
        affected_shipment_ids=normalized.affected_shipment_ids,
        affected_supplier_ids=normalized.affected_supplier_ids,
        evidence=normalized.evidence,
        detected_at=now_iso,
    )
    db.add(event_record)

    incident_record = Incident(
        incident_id=incident_id,
        event_id=event_id,
        title=normalized.title,
        status=WorkflowState.DETECTED.value,
        severity=normalized.severity.value,
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
