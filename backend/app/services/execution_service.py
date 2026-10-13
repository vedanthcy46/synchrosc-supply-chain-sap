"""Simulation-only action execution with persisted idempotency and policy guards."""
import hashlib
import json
import uuid
from typing import Optional

from sqlalchemy.orm import Session
from sqlalchemy.exc import IntegrityError

from app.models.approval import ApprovalRecord
from app.models.execution import ExecutionRecord
from app.models.incident import Incident, utc_now_iso
from app.models.scenario import ScenarioRecord
from app.models.supply_chain import InventoryRecord, ShipmentRecord
from app.orchestration.state_machine import validate_transition
from app.schemas.action import ExecutionResult
from app.schemas.common import (
    AppException,
    ApprovalStatus,
    PolicyDisposition,
    ResourceNotFoundError,
    WorkflowState,
)
from app.schemas.scenario import RecoveryScenario
from app.services.audit_service import record_audit_event
from app.services.policy_engine import assess_scenario, load_policy_context
from app.services.verification_service import verify_execution_outcome


def _scenario_model(record: ScenarioRecord) -> RecoveryScenario:
    return RecoveryScenario(
        scenario_id=record.scenario_id,
        incident_id=record.incident_id,
        name=record.name,
        strategy_type=record.strategy_type,
        actions=record.actions,
        incremental_cost=record.incremental_cost,
        currency=record.currency,
        arrival_days=record.arrival_days,
        unmet_demand_units_before_recovery=record.unmet_demand_units_before_recovery,
        estimated_production_delay_days=record.estimated_production_delay_days,
        feasible=record.feasible,
        feasibility_reasons=record.feasibility_reasons,
        risk_score=record.risk_score,
        rank=record.rank,
        reasoning_summary=record.reasoning_summary,
        policy_status=record.policy_status,
        reason_codes=record.reason_codes,
        plan_version=record.plan_version,
    )


def _apply_simulated_action(db: Session, scenario: ScenarioRecord):
    """Apply a scenario only to persisted demo records and return its evidence."""
    updated_resources = []
    effect = {"strategy_type": scenario.strategy_type, "arrival_days": scenario.arrival_days}
    if scenario.strategy_type == "alternate_supplier":
        action = next((a for a in scenario.actions if a.get("type") == "purchase_order"), {})
        effect.update({"supplier_id": action.get("supplier_id"), "quantity": action.get("quantity", 0)})
        updated_resources.append(f"PO-SIM-{scenario.scenario_id}")
    elif scenario.strategy_type == "expedite_shipment":
        action = next((a for a in scenario.actions if a.get("type") == "expedite_freight"), {})
        shipment = db.query(ShipmentRecord).filter(ShipmentRecord.shipment_id == action.get("shipment_id")).first()
        if not shipment:
            raise AppException("ACTION_RESOURCE_MISSING", "Shipment for the selected action no longer exists.", 409)
        previous_eta = shipment.current_eta_days
        shipment.current_eta_days = action.get("new_eta_days", scenario.arrival_days)
        shipment.transport_mode = action.get("new_mode", shipment.transport_mode)
        effect.update({"shipment_id": shipment.shipment_id, "previous_eta_days": previous_eta, "quantity": action.get("quantity", shipment.quantity)})
        updated_resources.append(shipment.shipment_id)
    elif scenario.strategy_type == "inventory_transfer":
        action = next((a for a in scenario.actions if a.get("type") == "inter_warehouse_transfer"), {})
        quantity = int(action.get("quantity", 0))
        source = db.query(InventoryRecord).filter(
            InventoryRecord.component_id == "CMP-201",
            InventoryRecord.warehouse_id == action.get("from_warehouse"),
        ).first()
        destination = db.query(InventoryRecord).filter(
            InventoryRecord.component_id == "CMP-201",
            InventoryRecord.warehouse_id == action.get("to_warehouse"),
        ).first()
        if not source or not destination or source.on_hand_qty - source.reserved_qty < quantity:
            raise AppException("ACTION_RESOURCE_MISSING", "Transfer inventory is no longer available.", 409)
        source_before = source.on_hand_qty
        destination_before = destination.on_hand_qty
        source.on_hand_qty -= quantity
        destination.on_hand_qty += quantity
        effect.update({
            "from_warehouse": source.warehouse_id,
            "to_warehouse": destination.warehouse_id,
            "source_before_qty": source_before,
            "destination_before_qty": destination_before,
            "quantity": quantity,
        })
        updated_resources.extend([f"INV-{source.warehouse_id}-{source.component_id}", f"INV-{destination.warehouse_id}-{destination.component_id}"])
    else:
        raise AppException("UNSUPPORTED_ACTION", "This simulated action type is not supported.", 409)
    return updated_resources, effect


async def execute_approved_scenario(
    scenario_id: str,
    incident_id: str,
    approval_id: Optional[str],
    idempotency_key: str,
    db: Session,
    correlation_id: str,
) -> ExecutionResult:
    """Apply a recovery scenario to demo state exactly once; never call live systems."""
    incident = db.query(Incident).filter(Incident.incident_id == incident_id).first()
    if not incident:
        raise ResourceNotFoundError("Incident", incident_id)
    scenario = db.query(ScenarioRecord).filter(ScenarioRecord.scenario_id == scenario_id).first()
    if not scenario or scenario.incident_id != incident_id:
        raise ResourceNotFoundError("Scenario", scenario_id)

    fingerprint = hashlib.sha256(
        json.dumps(
            {"incident_id": incident_id, "scenario_id": scenario_id, "approval_id": approval_id},
            sort_keys=True,
        ).encode("utf-8")
    ).hexdigest()
    prior = db.query(ExecutionRecord).filter(ExecutionRecord.idempotency_key == idempotency_key).first()
    if prior:
        if prior.request_fingerprint != fingerprint:
            raise AppException(
                code="IDEMPOTENCY_KEY_REUSED",
                message="This idempotency key was already used for a different action.",
                status_code=409,
                reason_codes=["IDEMPOTENCY_KEY_REUSED"],
            )
        if prior.status != "completed" or not prior.result:
            raise AppException(
                code="EXECUTION_IN_PROGRESS",
                message="An execution using this idempotency key is already in progress or needs recovery.",
                status_code=409,
                reason_codes=["EXECUTION_IN_PROGRESS"],
            )
        return ExecutionResult.model_validate(prior.result)

    record_audit_event(
        db=db,
        incident_id=incident_id,
        correlation_id=correlation_id,
        event_type="EXECUTION_ATTEMPTED",
        entity_type="Scenario",
        entity_id=scenario_id,
        actor_type="user",
        actor_id="demo-operator",
        before_state={"workflow_status": incident.status},
        after_state={"approval_id": approval_id, "plan_version": scenario.plan_version},
        reason="Execution request received; server-side policy and authorization checks started.",
        evidence_refs=[scenario_id, *([approval_id] if approval_id else [])],
    )

    # Re-evaluate against current database facts; stored/client policy values are not authority.
    assessment = assess_scenario(_scenario_model(scenario), load_policy_context(db, incident))
    scenario.policy_status = assessment["policy_status"].value
    scenario.reason_codes = assessment["reason_codes"]
    if assessment["policy_status"] == PolicyDisposition.BLOCKED:
        db.commit()
        record_audit_event(
            db=db,
            incident_id=incident_id,
            correlation_id=correlation_id,
            event_type="EXECUTION_DENIED",
            entity_type="Scenario",
            entity_id=scenario_id,
            actor_type="system",
            actor_id="policy_engine",
            after_state={"status": "blocked", "reason_codes": assessment["reason_codes"]},
            reason="Current policy blocked the execution attempt.",
            evidence_refs=[scenario_id],
        )
        raise AppException(
            code="ACTION_BLOCKED",
            message=f"Scenario {scenario_id} is blocked by current policy.",
            status_code=409,
            reason_codes=assessment["reason_codes"],
        )

    approval = None
    if assessment["policy_status"] == PolicyDisposition.APPROVAL_REQUIRED:
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
        if (
            approval.incident_id != incident_id
            or approval.scenario_id != scenario_id
            or approval.plan_version != scenario.plan_version
        ):
            raise AppException(
                code="STALE_PLAN_VERSION",
                message="Approval does not match the current incident, scenario, and plan version.",
                status_code=409,
                reason_codes=["STALE_PLAN_VERSION"],
            )
        if approval.status != ApprovalStatus.APPROVED.value:
            raise AppException(
                code="APPROVAL_NOT_GRANTED",
                message=f"Approval {approval_id} is '{approval.status}', not 'approved'.",
                status_code=409,
                reason_codes=[f"APPROVAL_{approval.status.upper()}"],
            )

    if incident.selected_scenario_id != scenario_id:
        raise AppException(
            code="SCENARIO_NOT_SELECTED",
            message="Select this scenario through the incident workflow before execution.",
            status_code=409,
            reason_codes=["SCENARIO_NOT_SELECTED"],
        )
    if incident.status != WorkflowState.READY_TO_EXECUTE.value:
        raise AppException(
            code="ACTION_NOT_READY",
            message=f"Incident is '{incident.status}' and is not ready to execute.",
            status_code=409,
            reason_codes=["ACTION_NOT_READY"],
        )

    # Lock and refresh the incident before claiming the key. This also prevents a
    # second request with a different idempotency key from executing the same plan.
    incident = (
        db.query(Incident)
        .filter(Incident.incident_id == incident_id)
        .with_for_update()
        .populate_existing()
        .first()
    )
    if not incident:
        raise ResourceNotFoundError("Incident", incident_id)
    if incident.selected_scenario_id != scenario_id or incident.status != WorkflowState.READY_TO_EXECUTE.value:
        raise AppException(
            code="ACTION_NOT_READY",
            message="The incident is no longer ready to execute this selected scenario.",
            status_code=409,
            reason_codes=["ACTION_NOT_READY"],
        )

    # The unique key and state transition commit together, before mutations.
    claim = ExecutionRecord(
        action_id=f"ACT-{uuid.uuid4().hex[:8]}",
        idempotency_key=idempotency_key,
        incident_id=incident_id,
        scenario_id=scenario_id,
        request_fingerprint=fingerprint,
        status="running",
        result=None,
    )
    db.add(claim)
    validate_transition(incident.status, WorkflowState.EXECUTING)
    incident.status = WorkflowState.EXECUTING.value
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        competing = db.query(ExecutionRecord).filter(ExecutionRecord.idempotency_key == idempotency_key).first()
        if competing and competing.request_fingerprint == fingerprint and competing.status == "completed" and competing.result:
            return ExecutionResult.model_validate(competing.result)
        raise AppException(
            code="EXECUTION_IN_PROGRESS",
            message="An execution using this idempotency key is already in progress.",
            status_code=409,
            reason_codes=["EXECUTION_IN_PROGRESS"],
        )

    previous_state = WorkflowState.READY_TO_EXECUTE.value

    record_audit_event(
        db=db,
        incident_id=incident_id,
        correlation_id=correlation_id,
        event_type="SIMULATED_ACTION_ATTEMPTED",
        entity_type="Scenario",
        entity_id=scenario_id,
        actor_type="user" if approval else "system",
        actor_id=approval.reviewed_by if approval else "demo-operator",
        before_state={"workflow_status": previous_state},
        after_state={"workflow_status": WorkflowState.EXECUTING.value, "plan_version": scenario.plan_version},
        reason="Authorized simulation started.",
        evidence_refs=[scenario_id, *([approval_id] if approval_id else [])],
    )

    try:
        updated_resources, simulated_effect = _apply_simulated_action(db, scenario)
        validate_transition(incident.status, WorkflowState.VERIFYING)
        incident.status = WorkflowState.VERIFYING.value
        claim.simulation_effect = simulated_effect
        db.commit()
        verification = verify_execution_outcome(db, incident_id, scenario_id, correlation_id, claim.action_id)
        if not verification["verified"]:
            raise AppException("VERIFICATION_FAILED", verification["summary"], 409)
    except Exception as exc:
        failure_code = exc.code if isinstance(exc, AppException) else type(exc).__name__
        db.rollback()
        failed_incident = db.query(Incident).filter(Incident.incident_id == incident_id).first()
        if failed_incident and failed_incident.status in {WorkflowState.EXECUTING.value, WorkflowState.VERIFYING.value}:
            failed_incident.status = WorkflowState.FAILED.value
            failed_incident.updated_at = utc_now_iso()
        failed_claim = db.query(ExecutionRecord).filter(ExecutionRecord.action_id == claim.action_id).first()
        if failed_claim:
            failed_claim.status = "failed"
        db.commit()
        record_audit_event(
            db=db,
            incident_id=incident_id,
            correlation_id=correlation_id,
            event_type="EXECUTION_FAILED",
            entity_type="Scenario",
            entity_id=scenario_id,
            actor_type="system",
            actor_id="simulated_executor",
            after_state={"workflow_status": WorkflowState.FAILED.value, "failure_code": failure_code},
            reason="Simulated action failed or did not pass verification.",
            evidence_refs=[scenario_id, claim.action_id],
        )
        if isinstance(exc, AppException):
            raise
        raise AppException(
            code="SIMULATION_FAILED",
            message="The simulated action failed. The incident is marked failed and requires recovery.",
            status_code=500,
            reason_codes=["SIMULATION_FAILED"],
        ) from exc

    validate_transition(incident.status, WorkflowState.VERIFIED)
    incident.status = WorkflowState.VERIFIED.value
    incident.updated_at = utc_now_iso()
    action_id = claim.action_id
    result = ExecutionResult(
        action_id=action_id,
        incident_id=incident_id,
        scenario_id=scenario_id,
        execution_status="completed",
        execution_mode="simulation",
        updated_resource_ids=updated_resources,
        audit_id="",
        executed_at=utc_now_iso(),
    )
    audit_record = record_audit_event(
        db=db,
        incident_id=incident_id,
        correlation_id=correlation_id,
        event_type="SIMULATED_ACTION_EXECUTED",
        entity_type="Scenario",
        entity_id=scenario_id,
        actor_type="user" if approval else "system",
        actor_id=approval.reviewed_by if approval else "demo-operator",
        before_state={"workflow_status": WorkflowState.READY_TO_EXECUTE.value},
        after_state={"workflow_status": WorkflowState.VERIFIED.value, "updated_resources": updated_resources},
        reason=f"Executed recovery scenario {scenario_id} ({scenario.name}) in simulation.",
        evidence_refs=[scenario_id, *updated_resources, *([approval_id] if approval_id else [])],
    )
    result.audit_id = audit_record.audit_id
    claim.status = "completed"
    claim.result = result.model_dump(mode="json")
    db.commit()
    return result
