"""Approval decision routes (Member 4 domain)."""
from typing import Dict, Any, List
from fastapi import APIRouter, Depends, Request
from sqlalchemy.orm import Session
from app.db.session import get_db
from app.models.approval import ApprovalRecord
from app.models.incident import Incident, utc_now_iso
from app.models.scenario import ScenarioRecord
from app.schemas.scenario import RecoveryScenario
from app.schemas.approval import ApprovalDecisionRequest, ApprovalDecisionResponse, ApprovalRequest
from app.schemas.common import (
    ApprovalStatus,
    ResourceNotFoundError,
    AppException,
    WorkflowState,
)
from app.orchestration.state_machine import validate_transition
from app.services.audit_service import record_audit_event
from app.services.policy_engine import assess_scenario, load_policy_context

router = APIRouter(prefix="/approvals", tags=["Approvals"])


@router.get("")
def list_approvals(db: Session = Depends(get_db)) -> Dict[str, Any]:
    """List pending and recently reviewed human approval requests."""
    records = db.query(ApprovalRecord).order_by(ApprovalRecord.created_at.desc()).all()
    return {
        "items": [
            ApprovalRequest(
                approval_id=r.approval_id,
                incident_id=r.incident_id,
                scenario_id=r.scenario_id,
                plan_version=r.plan_version,
                status=ApprovalStatus(r.status),
                requested_by=r.requested_by,
                reviewed_by=r.reviewed_by,
                reason=r.reason,
                created_at=r.created_at,
                reviewed_at=r.reviewed_at,
                decision_comment=r.decision_comment,
            )
            for r in records
        ]
    }


@router.post("/{approval_id}/decision", response_model=ApprovalDecisionResponse)
def submit_approval_decision(
    approval_id: str,
    payload: ApprovalDecisionRequest,
    request: Request,
    db: Session = Depends(get_db),
) -> ApprovalDecisionResponse:
    """Approve or reject a pending approval request bound to an exact scenario plan version."""
    correlation_id = getattr(request.state, "correlation_id", "corr-direct")
    approval = db.query(ApprovalRecord).filter(ApprovalRecord.approval_id == approval_id).first()
    if not approval:
        raise ResourceNotFoundError("ApprovalRequest", approval_id)

    if approval.status != ApprovalStatus.PENDING.value:
        raise AppException(
            code="APPROVAL_NOT_PENDING",
            message=f"Approval request {approval_id} is already in state '{approval.status}'.",
            status_code=409,
            reason_codes=["APPROVAL_ALREADY_RESOLVED"],
        )

    incident = db.query(Incident).filter(Incident.incident_id == approval.incident_id).first()
    scenario = db.query(ScenarioRecord).filter(ScenarioRecord.scenario_id == approval.scenario_id).first()
    if not incident or not scenario:
        raise ResourceNotFoundError("Scenario", approval.scenario_id)
    if (
        scenario.incident_id != approval.incident_id
        or scenario.plan_version != approval.plan_version
        or incident.selected_scenario_id != approval.scenario_id
        or incident.approval_id != approval.approval_id
        or incident.status != WorkflowState.AWAITING_APPROVAL.value
    ):
        approval.status = ApprovalStatus.STALE.value
        approval.reviewed_at = utc_now_iso()
        db.commit()
        record_audit_event(
            db=db,
            incident_id=approval.incident_id,
            correlation_id=correlation_id,
            event_type="APPROVAL_STALE",
            entity_type="ApprovalRequest",
            entity_id=approval_id,
            actor_type="system",
            actor_id="approval_service",
            before_state={"status": ApprovalStatus.PENDING.value},
            after_state={"status": ApprovalStatus.STALE.value, "plan_version": approval.plan_version},
            reason="Approval no longer matches the selected plan version.",
            evidence_refs=[approval_id, approval.scenario_id],
        )
        raise AppException(
            code="STALE_APPROVAL",
            message="Approval no longer matches the selected scenario and current plan.",
            status_code=409,
            reason_codes=["STALE_PLAN_VERSION"],
        )

    policy_scenario = RecoveryScenario(
        scenario_id=scenario.scenario_id,
        incident_id=scenario.incident_id,
        name=scenario.name,
        strategy_type=scenario.strategy_type,
        actions=scenario.actions,
        incremental_cost=scenario.incremental_cost,
        currency=scenario.currency,
        arrival_days=scenario.arrival_days,
        unmet_demand_units_before_recovery=scenario.unmet_demand_units_before_recovery,
        estimated_production_delay_days=scenario.estimated_production_delay_days,
        feasible=scenario.feasible,
        feasibility_reasons=scenario.feasibility_reasons,
        risk_score=scenario.risk_score,
        rank=scenario.rank,
        reasoning_summary=scenario.reasoning_summary,
        policy_status=scenario.policy_status,
        reason_codes=scenario.reason_codes,
        plan_version=scenario.plan_version,
    )
    current_assessment = assess_scenario(policy_scenario, load_policy_context(db, incident))
    if current_assessment["policy_status"].value == "BLOCKED":
        approval.status = ApprovalStatus.STALE.value
        approval.reviewed_at = utc_now_iso()
        approval.decision_comment = "Invalidated: current policy now blocks this plan."
        db.commit()
        record_audit_event(
            db=db,
            incident_id=approval.incident_id,
            correlation_id=correlation_id,
            event_type="APPROVAL_INVALIDATED",
            entity_type="ApprovalRequest",
            entity_id=approval_id,
            actor_type="system",
            actor_id="policy_engine",
            before_state={"status": ApprovalStatus.PENDING.value},
            after_state={
                "status": ApprovalStatus.STALE.value,
                "reason_codes": current_assessment["reason_codes"],
            },
            reason="Current policy hard-blocked the plan; approval is no longer actionable.",
            evidence_refs=[approval_id, scenario.scenario_id],
        )
        raise AppException(
            code="ACTION_BLOCKED",
            message="Current policy blocks this scenario; the approval request is no longer actionable.",
            status_code=409,
            reason_codes=current_assessment["reason_codes"],
        )

    now_iso = utc_now_iso()
    new_status = ApprovalStatus.APPROVED if payload.decision == "approve" else ApprovalStatus.REJECTED

    approval.status = new_status.value
    approval.reviewed_by = payload.reviewed_by
    approval.decision_comment = payload.decision_comment
    approval.reviewed_at = now_iso

    # Update Incident State if Approved
    if new_status == ApprovalStatus.APPROVED:
        validate_transition(incident.status, WorkflowState.READY_TO_EXECUTE)
        incident.status = WorkflowState.READY_TO_EXECUTE.value
    else:
        validate_transition(incident.status, WorkflowState.OPTIONS_READY)
        incident.status = WorkflowState.OPTIONS_READY.value
        incident.selected_scenario_id = None
        incident.approval_id = None
    incident.updated_at = now_iso

    db.commit()

    record_audit_event(
        db=db,
        incident_id=approval.incident_id,
        correlation_id=correlation_id,
        event_type=f"APPROVAL_{new_status.value.upper()}",
        entity_type="ApprovalRequest",
        entity_id=approval_id,
        actor_type="user",
        actor_id=payload.reviewed_by,
        before_state={"status": ApprovalStatus.PENDING.value},
        after_state={"status": new_status.value, "decision_comment": payload.decision_comment},
        reason=f"Human reviewer decided: {payload.decision}",
        evidence_refs=[approval_id, approval.scenario_id],
    )

    return ApprovalDecisionResponse(
        approval_id=approval_id,
        status=new_status,
        reviewed_by=payload.reviewed_by,
        decision_comment=payload.decision_comment,
        reviewed_at=now_iso,
    )
