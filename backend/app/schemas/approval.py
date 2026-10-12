"""Schemas for Approval Requests and decisions."""
from typing import Optional
from pydantic import BaseModel, field_validator
from app.schemas.common import ApprovalStatus


class ApprovalRequest(BaseModel):
    approval_id: str
    incident_id: str
    scenario_id: str
    plan_version: str
    status: ApprovalStatus = ApprovalStatus.PENDING
    requested_by: str = "system"
    reviewed_by: Optional[str] = None
    reason: str = ""
    created_at: str
    reviewed_at: Optional[str] = None
    decision_comment: Optional[str] = None


class ApprovalDecisionRequest(BaseModel):
    decision: str  # "approve" | "reject"
    decision_comment: Optional[str] = None
    reviewed_by: str = "demo-operator"

    @field_validator("decision")
    @classmethod
    def validate_decision(cls, v: str) -> str:
        v_clean = v.strip().lower()
        if v_clean not in {"approve", "reject"}:
            raise ValueError("decision must be either 'approve' or 'reject'")
        return v_clean


class ApprovalDecisionResponse(BaseModel):
    approval_id: str
    status: ApprovalStatus
    reviewed_by: str
    decision_comment: Optional[str] = None
    reviewed_at: str
