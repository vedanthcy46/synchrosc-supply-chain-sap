"""Action execution routes (Member 4 domain)."""
import uuid
from typing import Optional
from fastapi import APIRouter, Depends, Header, Request
from sqlalchemy.orm import Session
from app.db.session import get_db
from app.schemas.action import ExecutionRequest, ExecutionResult
from app.services.execution_service import execute_approved_scenario

router = APIRouter(prefix="/actions", tags=["Actions"])


@router.post("/{scenario_id}/execute", response_model=ExecutionResult)
async def execute_action(
    scenario_id: str,
    payload: ExecutionRequest,
    request: Request,
    idempotency_key: Optional[str] = Header(None, alias="Idempotency-Key"),
    db: Session = Depends(get_db),
) -> ExecutionResult:
    """Execute an authorised simulated recovery action with idempotency enforcement."""
    correlation_id = getattr(request.state, "correlation_id", "corr-direct")
    effective_idempotency_key = idempotency_key or f"idem-{uuid.uuid4().hex}"

    return await execute_approved_scenario(
        scenario_id=scenario_id,
        incident_id=payload.incident_id,
        approval_id=payload.approval_id,
        idempotency_key=effective_idempotency_key,
        db=db,
        correlation_id=correlation_id,
    )
