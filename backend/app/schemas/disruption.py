"""Schemas for disruption events and incident creation."""
from typing import List, Optional
from pydantic import BaseModel, Field
from app.schemas.common import SeverityLevel, SourceType, WorkflowState


class DisruptionEventBase(BaseModel):
    event_type: str = "shipping_delay"
    title: str
    description: str
    severity: SeverityLevel = SeverityLevel.HIGH
    source_type: SourceType = SourceType.DEMO
    source_name: str = "demo_seed.json"
    source_url: Optional[str] = None
    confidence: float = Field(default=1.0, ge=0.0, le=1.0)
    affected_shipment_ids: List[str] = Field(default_factory=list)
    affected_supplier_ids: List[str] = Field(default_factory=list)
    evidence: List[str] = Field(default_factory=list)


class DisruptionEventCreate(DisruptionEventBase):
    pass


class DisruptionEvent(DisruptionEventBase):
    event_id: str
    incident_id: Optional[str] = None
    detected_at: str


class DisruptionCreateResponse(BaseModel):
    incident_id: str
    event_id: str
    status: WorkflowState = WorkflowState.DETECTED
    created_at: str
