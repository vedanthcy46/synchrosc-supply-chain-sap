"""Schemas for recovery scenarios and scenario selection."""
from typing import Any, Dict, List, Optional
from pydantic import BaseModel, Field
from app.schemas.common import PolicyDisposition, WorkflowState, StrategyType


class RecoveryScenario(BaseModel):
    scenario_id: str
    incident_id: str
    name: str
    strategy_type: StrategyType = StrategyType.ALTERNATE_SUPPLIER
    actions: List[Dict[str, Any]] = Field(default_factory=list)
    incremental_cost: float
    currency: str = "INR"
    arrival_days: int
    unmet_demand_units_before_recovery: int = 0
    estimated_production_delay_days: int = 0
    feasible: bool = True
    feasibility_reasons: List[str] = Field(default_factory=list)
    risk_score: int = 0
    rank: int = 1
    reasoning_summary: str = ""
    policy_status: PolicyDisposition = PolicyDisposition.APPROVAL_REQUIRED
    reason_codes: List[str] = Field(default_factory=list)
    plan_version: str = "v1.0"


class ScenarioListResponse(BaseModel):
    incident_id: str
    status: WorkflowState = WorkflowState.OPTIONS_READY
    impact: Optional[Dict[str, Any]] = None
    scenarios: List[RecoveryScenario] = Field(default_factory=list)


class ScenarioSelectRequest(BaseModel):
    scenario_id: str


class ScenarioSelectResponse(BaseModel):
    incident_id: str
    scenario_id: str
    plan_version: str
    policy_status: PolicyDisposition
    approval_id: Optional[str] = None
    workflow_status: WorkflowState
    reason_codes: List[str] = Field(default_factory=list)
