"""Action execution routes (Member 4 domain)."""
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
    idempotency_key: str = Header(..., alias="Idempotency-Key", min_length=1, max_length=255),
    db: Session = Depends(get_db),
) -> ExecutionResult:
    """Execute an authorised simulated recovery action with idempotency enforcement."""
    correlation_id = getattr(request.state, "correlation_id", "corr-direct")
    return await execute_approved_scenario(
        scenario_id=scenario_id,
        incident_id=payload.incident_id,
        approval_id=payload.approval_id,
        idempotency_key=idempotency_key.strip(),
        db=db,
        correlation_id=correlation_id,
    )
