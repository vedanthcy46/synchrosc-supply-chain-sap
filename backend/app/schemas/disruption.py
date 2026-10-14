"""Schemas for disruption events and incident creation (Member 2 domain)."""
from enum import Enum
from typing import List, Optional, Any
from pydantic import BaseModel, Field, field_validator
from app.schemas.common import SeverityLevel, SourceType, WorkflowState


class DisruptionCategory(str, Enum):
    SHIPPING_DELAY = "shipping_delay"
    SUPPLIER_DISRUPTION = "supplier_disruption"
    PRODUCTION_HALT = "production_halt"
    INVENTORY_SHORTAGE = "inventory_shortage"
    QUALITY_ISSUE = "quality_issue"
    WEATHER_DELAY = "weather_delay"
    OTHER = "other"


class DisruptionClassification(BaseModel):
    category: DisruptionCategory
    confidence: float = Field(default=1.0, ge=0.0, le=1.0)
    classification_reason: str


class DisruptionEventBase(BaseModel):
    event_type: str = Field(default="shipping_delay", min_length=1)
    title: str = Field(..., min_length=1)
    description: str = Field(..., min_length=1)
    severity: SeverityLevel = SeverityLevel.HIGH
    source_type: SourceType = SourceType.DEMO
    source_name: str = "demo_seed.json"
    source_url: Optional[str] = None
    confidence: float = Field(default=1.0, ge=0.0, le=1.0)
    affected_shipment_ids: List[str] = Field(default_factory=list)
    affected_supplier_ids: List[str] = Field(default_factory=list)
    evidence: List[str] = Field(default_factory=list)

    @field_validator("title", "description", mode="before")
    @classmethod
    def strip_and_validate_text(cls, v: Any) -> Any:
        if isinstance(v, str):
            return v.strip()
        return v

    @field_validator("event_type", mode="before")
    @classmethod
    def normalize_event_type(cls, v: Any) -> Any:
        if isinstance(v, str):
            return v.strip().lower()
        return v


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


class DisruptionListResponse(BaseModel):
    items: List[DisruptionEvent]
    total: int
    next_cursor: Optional[str] = None
