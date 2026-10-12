"""Schemas for Impact Analysis and component risk metrics."""
from typing import List, Optional
from pydantic import BaseModel, Field


class ComponentImpact(BaseModel):
    component_id: str
    available_qty: int
    daily_demand: int
    coverage_days: Optional[float] = None
    delayed_shipment_eta_days: Optional[int] = None
    projected_stockout_before_eta: bool = False


class ImpactAnalysis(BaseModel):
    incident_id: str
    component_impacts: List[ComponentImpact] = Field(default_factory=list)
    affected_order_ids: List[str] = Field(default_factory=list)
    estimated_stockout_in_days: Optional[float] = None
    projected_shortage_units: int = 0
    assumptions: List[str] = Field(default_factory=list)
    evidence_refs: List[str] = Field(default_factory=list)
    computed_at: str
