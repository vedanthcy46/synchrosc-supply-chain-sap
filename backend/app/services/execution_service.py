"""Simulated Action Execution Service (Member 4 domain).

Executes approved recovery plans in simulation mode with idempotency and state transition guards.
"""
import uuid
from typing import Optional, Dict
from sqlalchemy.orm import Session
from app.core.config import settings
from app.models.incident import Incident, utc_now_iso
from app.models.scenario import ScenarioRecord
from app.models.approval import ApprovalRecord
from app.models.supply_chain import ShipmentRecord, InventoryRecord
from app.schemas.action import ExecutionResult
from app.schemas.common import (
    AppException,
    ActionBlockedError,
    WorkflowState,
    PolicyDisposition,
    ApprovalStatus,
    ResourceNotFoundError,
)
from app.orchestration.state_machine import validate_transition
from app.services.audit_service import record_audit_event

# Idempotency cache: maps idempotency_key -> ExecutionResult dict
_IDEMPOTENCY_CACHE: Dict[str, ExecutionResult] = {}


async def execute_approved_scenario(
    scenario_id: str,
    incident_id: str,
    approval_id: Optional[str],
    idempotency_key: str,
    db: Session,
    correlation_id: str,
) -> ExecutionResult:
    """Execute an authorized scenario in simulation mode."""

    # 1. Idempotency Check: if key already executed, return cached result
    if idempotency_key in _IDEMPOTENCY_CACHE:
        return _IDEMPOTENCY_CACHE[idempotency_key]

    # 2. Fetch incident and scenario
    incident = db.query(Incident).filter(Incident.incident_id == incident_id).first()
    if not incident:
        raise ResourceNotFoundError("Incident", incident_id)

    scenario = db.query(ScenarioRecord).filter(ScenarioRecord.scenario_id == scenario_id).first()
    if not scenario:
        raise ResourceNotFoundError("Scenario", scenario_id)

    # 3. Policy Guard: Hard blocked scenario cannot be executed
    if scenario.policy_status == PolicyDisposition.BLOCKED.value:
        raise ActionBlockedError(
            message=f"Scenario {scenario_id} is blocked and cannot be executed.",
            reason_codes=scenario.reason_codes or ["ACTION_BLOCKED"],
        )

    # 4. Approval Guard: If scenario requires approval, verify valid approval
    if scenario.policy_status == PolicyDisposition.APPROVAL_REQUIRED.value:
        if not approval_id:
            raise AppException(
                code="APPROVAL_REQUIRED",
                message=f"Scenario {scenario_id} requires human approval before execution.",
                status_code=409,
                reason_codes=["APPROVAL_REQUIRED"],
            )
        approval = db.query(ApprovalRecord).filter(ApprovalRecord.approval_id == approval_id).first()
        if not approval:
            raise ResourceNotFoundError("ApprovalRequest", approval_id)

        if approval.status != ApprovalStatus.APPROVED.value:
            raise AppException(
                code="APPROVAL_NOT_GRANTED",
                message=f"Approval {approval_id} is '{approval.status}', not 'approved'.",
                status_code=409,
                reason_codes=[f"APPROVAL_{approval.status.upper()}"],
            )

        if approval.plan_version != scenario.plan_version:
            raise AppException(
                code="STALE_PLAN_VERSION",
                message="Approval plan version does not match current scenario version.",
                status_code=409,
                reason_codes=["STALE_PLAN_VERSION"],
            )

    # 5. State Machine Guard: Transition to EXECUTING
    validate_transition(incident.status, WorkflowState.EXECUTING)
    incident.status = WorkflowState.EXECUTING.value
    db.commit()

    # 6. Apply Simulated Mutations (never live SAP writes)
    updated_resources = []
    if scenario.strategy_type == "alternate_supplier":
        # Simulate creating alternate purchase order
        updated_resources.append("PO-SIM-SUP-B")
    elif scenario.strategy_type == "expedite_shipment":
        shp = db.query(ShipmentRecord).filter(ShipmentRecord.shipment_id == "SHP-102").first()
        if shp:
            shp.current_eta_days = 4
            shp.transport_mode = "air"
            updated_resources.append(shp.shipment_id)
    elif scenario.strategy_type == "inventory_transfer":
        inv_b = db.query(InventoryRecord).filter(InventoryRecord.warehouse_id == "WH-B").first()
        if inv_b:
            inv_b.on_hand_qty = max(0, inv_b.on_hand_qty - 300)
            updated_resources.append(f"INV-WH-B-{inv_b.component_id}")

    # Transition to VERIFYING and then VERIFIED
    validate_transition(incident.status, WorkflowState.VERIFYING)
    incident.status = WorkflowState.VERIFYING.value
    db.commit()

    validate_transition(incident.status, WorkflowState.VERIFIED)
    incident.status = WorkflowState.VERIFIED.value
    incident.updated_at = utc_now_iso()
    db.commit()

    action_id = f"ACT-{uuid.uuid4().hex[:8]}"

    # 7. Audit log record
    audit_record = record_audit_event(
        db=db,
        incident_id=incident_id,
        correlation_id=correlation_id,
        event_type="SIMULATED_ACTION_EXECUTED",
        entity_type="Scenario",
        entity_id=scenario_id,
        actor_type="user" if approval_id else "system",
        actor_id="demo-operator" if approval_id else "system",
        before_state={"workflow_status": WorkflowState.READY_TO_EXECUTE.value},
        after_state={"workflow_status": WorkflowState.VERIFIED.value, "updated_resources": updated_resources},
        reason=f"Executed recovery scenario {scenario_id} ({scenario.name})",
        evidence_refs=[scenario_id] + updated_resources,
    )

    result = ExecutionResult(
        action_id=action_id,
        incident_id=incident_id,
        scenario_id=scenario_id,
        execution_status="completed",
        execution_mode=settings.EXECUTION_MODE,
        updated_resource_ids=updated_resources,
        audit_id=audit_record.audit_id,
        executed_at=utc_now_iso(),
    )

    _IDEMPOTENCY_CACHE[idempotency_key] = result
    return result
