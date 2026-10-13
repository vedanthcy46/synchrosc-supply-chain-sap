"""Schemas for Impact Analysis and component risk metrics (Member 2 domain)."""
from typing import List, Optional
from pydantic import BaseModel, Field


class ComponentImpact(BaseModel):
    component_id: str
    warehouse_id: Optional[str] = None
    on_hand_qty: Optional[int] = None
    reserved_qty: Optional[int] = None
    available_qty: int
    daily_demand: int
    coverage_days: Optional[float] = None
    delayed_shipment_eta_days: Optional[int] = None
    baseline_eta_days: Optional[int] = None
    shipment_id: Optional[str] = None
    projected_stockout_before_eta: bool = False
    shortage_qty: Optional[int] = None


class ProductionOrderRisk(BaseModel):
    order_id: str
    product_id: Optional[str] = None
    due_in_days: Optional[int] = None
    required_qty: Optional[int] = None
    priority: Optional[str] = None
    status: Optional[str] = None


class ImpactAnalysis(BaseModel):
    incident_id: str
    component_impacts: List[ComponentImpact] = Field(default_factory=list)
    affected_order_ids: List[str] = Field(default_factory=list)
    affected_orders: List[ProductionOrderRisk] = Field(default_factory=list)
    estimated_stockout_in_days: Optional[float] = None
    projected_shortage_units: int = 0
    summary: Optional[str] = None
    assumptions: List[str] = Field(default_factory=list)
    evidence_refs: List[str] = Field(default_factory=list)
    warnings: List[str] = Field(default_factory=list)
    data_provenance: Optional[str] = "synthetic_demo"
    computed_at: str
