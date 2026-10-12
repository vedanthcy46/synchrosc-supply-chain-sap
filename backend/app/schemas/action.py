"""Schemas for simulated action execution."""
from typing import List, Optional
from pydantic import BaseModel, Field


class ExecutionRequest(BaseModel):
    incident_id: str
    approval_id: Optional[str] = None


class ExecutionResult(BaseModel):
    action_id: str
    incident_id: str
    scenario_id: str
    execution_status: str = "completed"
    execution_mode: str = "simulation"
    updated_resource_ids: List[str] = Field(default_factory=list)
    audit_id: str
    executed_at: str
