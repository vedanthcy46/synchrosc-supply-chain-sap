"""Shared domain enums, error envelopes, and contract types."""
from enum import Enum
from typing import Any, Dict, Generic, List, Optional, TypeVar
from pydantic import BaseModel, Field


class WorkflowState(str, Enum):
    DETECTED = "DETECTED"
    ANALYZING = "ANALYZING"
    OPTIONS_READY = "OPTIONS_READY"
    AWAITING_APPROVAL = "AWAITING_APPROVAL"
    READY_TO_EXECUTE = "READY_TO_EXECUTE"
    EXECUTING = "EXECUTING"
    VERIFYING = "VERIFYING"
    VERIFIED = "VERIFIED"
    CLOSED = "CLOSED"
    FAILED = "FAILED"


class PolicyDisposition(str, Enum):
    AUTO_ALLOWED = "AUTO_ALLOWED"
    APPROVAL_REQUIRED = "APPROVAL_REQUIRED"
    BLOCKED = "BLOCKED"


class ApprovalStatus(str, Enum):
    PENDING = "pending"
    APPROVED = "approved"
    REJECTED = "rejected"
    STALE = "stale"


class SeverityLevel(str, Enum):
    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"
    CRITICAL = "critical"


class SourceType(str, Enum):
    DEMO = "demo"
    FEED = "feed"
    SAP = "sap"


class ActorType(str, Enum):
    SYSTEM = "system"
    USER = "user"
    AGENT = "agent"


class StrategyType(str, Enum):
    EXPEDITE_SHIPMENT = "expedite_shipment"
    ALTERNATE_SUPPLIER = "alternate_supplier"
    INVENTORY_TRANSFER = "inventory_transfer"
    COMBINED = "combined"


class ErrorDetail(BaseModel):
    code: str
    message: str
    details: Dict[str, Any] = Field(default_factory=dict)
    correlation_id: str


class ErrorEnvelope(BaseModel):
    error: ErrorDetail


T = TypeVar("T")


class StandardAgentEnvelope(BaseModel, Generic[T]):
    status: str = "ok"  # ok | needs_review | blocked | error
    summary: str
    data: Optional[T] = None
    reason_codes: List[str] = Field(default_factory=list)
    evidence_refs: List[str] = Field(default_factory=list)
    warnings: List[str] = Field(default_factory=list)


class ListResponse(BaseModel, Generic[T]):
    items: List[T]
    next_cursor: Optional[str] = None
    total: Optional[int] = None


class AppException(Exception):
    """Base application exception mapping to standard API error envelopes."""

    def __init__(
        self,
        code: str,
        message: str,
        status_code: int = 400,
        details: Optional[Dict[str, Any]] = None,
        reason_codes: Optional[List[str]] = None,
    ) -> None:
        super().__init__(message)
        self.code = code
        self.message = message
        self.status_code = status_code
        self.details = details or {}
        if reason_codes is not None:
            self.details["reason_codes"] = reason_codes


class ResourceNotFoundError(AppException):
    def __init__(self, resource: str, identifier: str) -> None:
        super().__init__(
            code="NOT_FOUND",
            message=f"{resource} '{identifier}' was not found.",
            status_code=404,
            details={"resource": resource, "identifier": identifier},
        )


class IllegalStateTransitionError(AppException):
    def __init__(self, current_state: str, attempted_state: str, reason: str = "") -> None:
        msg = f"Cannot transition from {current_state} to {attempted_state}."
        if reason:
            msg += f" {reason}"
        super().__init__(
            code="ILLEGAL_STATE_TRANSITION",
            message=msg,
            status_code=409,
            details={"current_state": current_state, "attempted_state": attempted_state},
        )


class ActionBlockedError(AppException):
    def __init__(self, message: str, reason_codes: Optional[List[str]] = None) -> None:
        super().__init__(
            code="ACTION_BLOCKED",
            message=message,
            status_code=409,
            details={"reason_codes": reason_codes or ["ACTION_BLOCKED"]},
            reason_codes=reason_codes or ["ACTION_BLOCKED"],
        )


class StaleApprovalError(AppException):
    def __init__(self, message: str = "The approval request or plan version is stale.") -> None:
        super().__init__(
            code="STALE_APPROVAL",
            message=message,
            status_code=409,
            reason_codes=["STALE_PLAN_VERSION"],
        )
