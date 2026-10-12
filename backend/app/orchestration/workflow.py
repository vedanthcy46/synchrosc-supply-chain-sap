"""Workflow Orchestrator (Member 1 / Team Lead).

Coordinates the end-to-end resilience lifecycle:
Disruption Detection -> Impact Analysis -> Scenario Generation -> Policy Evaluation -> Decision/Approval -> Execution.
"""
import uuid
from typing import Dict, Any, List
from sqlalchemy.orm import Session
from app.models.incident import Incident, DisruptionEventRecord, utc_now_iso
from app.models.scenario import ScenarioRecord
from app.models.approval import ApprovalRecord
from app.models.supply_chain import SupplierRecord
from app.schemas.common import (
    WorkflowState,
    PolicyDisposition,
    ApprovalStatus,
    ResourceNotFoundError,
    ActionBlockedError,
)
from app.schemas.scenario import ScenarioListResponse, RecoveryScenario, ScenarioSelectResponse
from app.orchestration.state_machine import validate_transition
from app.services.impact_analysis import analyze_impact
from app.services.option_scoring import generate_scenarios
from app.services.policy_engine import assess_scenario
from app.services.audit_service import record_audit_event


class IncidentOrchestrator:
    """Central orchestrator managing multi-stage resilience workflows."""

    @staticmethod
    async def run_analysis_workflow(
        incident_id: str,
        db: Session,
        correlation_id: str,
    ) -> ScenarioListResponse:
        """Execute the analysis pipeline: Impact -> Scenarios -> Policy Assessment."""

        # 1. Fetch Incident
        incident = db.query(Incident).filter(Incident.incident_id == incident_id).first()
        if not incident:
            raise ResourceNotFoundError("Incident", incident_id)

        # 2. Transition State: -> ANALYZING
        validate_transition(incident.status, WorkflowState.ANALYZING)
        incident.status = WorkflowState.ANALYZING.value
        db.commit()

        # Audit transition to ANALYZING
        record_audit_event(
            db=db,
            incident_id=incident_id,
            correlation_id=correlation_id,
            event_type="WORKFLOW_ANALYZING_STARTED",
            entity_type="Incident",
            entity_id=incident_id,
            actor_type="agent",
            actor_id="orchestrator",
            before_state={"status": WorkflowState.DETECTED.value},
            after_state={"status": WorkflowState.ANALYZING.value},
            reason="Triggered impact and scenario analysis pipeline.",
        )

        try:
            # 3. Call Member 2: Impact Analysis
            impact = await analyze_impact(incident_id=incident_id, db=db)

            # 4. Call Member 3: Scenario Planning
            raw_scenarios = await generate_scenarios(incident_id=incident_id, impact=impact, db=db)

            # 5. Call Member 4: Policy Assessment for each scenario
            supplier_b = db.query(SupplierRecord).filter(SupplierRecord.supplier_id == "SUP-B").first()
            context: Dict[str, Any] = {
                "severity": incident.severity,
                "supplier_approved": supplier_b.approved if supplier_b else True,
                "supplier_risk_status": supplier_b.risk_status if supplier_b else "clear",
            }

            assessed_scenarios: List[RecoveryScenario] = []
            for scn in raw_scenarios:
                assessment = assess_scenario(scn, context)
                scn.policy_status = assessment["policy_status"]
                scn.reason_codes = assessment["reason_codes"]
                assessed_scenarios.append(scn)

                # Persist or update scenario record in database
                existing_scn = db.query(ScenarioRecord).filter(ScenarioRecord.scenario_id == scn.scenario_id).first()
                if not existing_scn:
                    db_scn = ScenarioRecord(
                        scenario_id=scn.scenario_id,
                        incident_id=incident_id,
                        name=scn.name,
                        strategy_type=scn.strategy_type.value,
                        actions=scn.actions,
                        incremental_cost=scn.incremental_cost,
                        currency=scn.currency,
                        arrival_days=scn.arrival_days,
                        unmet_demand_units_before_recovery=scn.unmet_demand_units_before_recovery,
                        estimated_production_delay_days=scn.estimated_production_delay_days,
                        feasible=scn.feasible,
                        feasibility_reasons=scn.feasibility_reasons,
                        risk_score=scn.risk_score,
                        rank=scn.rank,
                        reasoning_summary=scn.reasoning_summary,
                        policy_status=scn.policy_status.value,
                        reason_codes=scn.reason_codes,
                        plan_version=scn.plan_version,
                        created_at=utc_now_iso(),
                    )
                    db.add(db_scn)
                else:
                    existing_scn.policy_status = scn.policy_status.value
                    existing_scn.reason_codes = scn.reason_codes
                    existing_scn.rank = scn.rank

            # 6. Save intermediate results and transition to OPTIONS_READY
            validate_transition(incident.status, WorkflowState.OPTIONS_READY)
            incident.status = WorkflowState.OPTIONS_READY.value
            incident.impact_summary = impact.model_dump()
            incident.updated_at = utc_now_iso()
            db.commit()

            # Audit completion
            record_audit_event(
                db=db,
                incident_id=incident_id,
                correlation_id=correlation_id,
                event_type="SCENARIOS_GENERATED_AND_ASSESSED",
                entity_type="Incident",
                entity_id=incident_id,
                actor_type="agent",
                actor_id="orchestrator",
                before_state={"status": WorkflowState.ANALYZING.value},
                after_state={
                    "status": WorkflowState.OPTIONS_READY.value,
                    "scenarios_count": len(assessed_scenarios),
                },
                reason=f"Generated {len(assessed_scenarios)} recovery scenarios with policy evaluations.",
            )

            # Impact summary dictionary matching contract
            comp_first = impact.component_impacts[0] if impact.component_impacts else None
            impact_dict = {
                "component_id": comp_first.component_id if comp_first else "CMP-201",
                "available_qty": comp_first.available_qty if comp_first else 500,
                "daily_demand": comp_first.daily_demand if comp_first else 100,
                "coverage_days": comp_first.coverage_days if comp_first else 5,
                "delayed_shipment_eta_days": comp_first.delayed_shipment_eta_days if comp_first else 12,
                "projected_stockout_before_eta": comp_first.projected_stockout_before_eta if comp_first else True,
            }

            return ScenarioListResponse(
                incident_id=incident_id,
                status=WorkflowState.OPTIONS_READY,
                impact=impact_dict,
                scenarios=assessed_scenarios,
            )

        except Exception as exc:
            incident.status = WorkflowState.FAILED.value
            db.commit()
            record_audit_event(
                db=db,
                incident_id=incident_id,
                correlation_id=correlation_id,
                event_type="WORKFLOW_FAILED",
                entity_type="Incident",
                entity_id=incident_id,
                actor_type="system",
                actor_id="orchestrator",
                reason=f"Pipeline error: {str(exc)}",
            )
            raise exc

    @staticmethod
    def select_scenario(
        incident_id: str,
        scenario_id: str,
        db: Session,
        correlation_id: str,
    ) -> ScenarioSelectResponse:
        """Select a recovery scenario, creating human approval request or enabling direct execution."""
        incident = db.query(Incident).filter(Incident.incident_id == incident_id).first()
        if not incident:
            raise ResourceNotFoundError("Incident", incident_id)

        scenario = db.query(ScenarioRecord).filter(ScenarioRecord.scenario_id == scenario_id).first()
        if not scenario:
            raise ResourceNotFoundError("Scenario", scenario_id)

        # Re-check policy disposition
        if scenario.policy_status == PolicyDisposition.BLOCKED.value:
            raise ActionBlockedError(
                message=f"Scenario '{scenario_id}' is hard-blocked and cannot be selected.",
                reason_codes=scenario.reason_codes or ["ACTION_BLOCKED"],
            )

        approval_id = None
        target_state = WorkflowState.READY_TO_EXECUTE

        if scenario.policy_status == PolicyDisposition.APPROVAL_REQUIRED.value:
            target_state = WorkflowState.AWAITING_APPROVAL
            # Create or reuse existing pending approval
            existing_approval = (
                db.query(ApprovalRecord)
                .filter(
                    ApprovalRecord.incident_id == incident_id,
                    ApprovalRecord.scenario_id == scenario_id,
                    ApprovalRecord.plan_version == scenario.plan_version,
                    ApprovalRecord.status == ApprovalStatus.PENDING.value,
                )
                .first()
            )
            if existing_approval:
                approval_id = existing_approval.approval_id
            else:
                approval_id = f"APR-{uuid.uuid4().hex[:6].upper()}"
                new_approval = ApprovalRecord(
                    approval_id=approval_id,
                    incident_id=incident_id,
                    scenario_id=scenario_id,
                    plan_version=scenario.plan_version,
                    status=ApprovalStatus.PENDING.value,
                    requested_by="demo-operator",
                    reason=f"Policy requires approval: {', '.join(scenario.reason_codes)}",
                    created_at=utc_now_iso(),
                )
                db.add(new_approval)
                db.commit()

        # Validate state transition
        validate_transition(incident.status, target_state)
        incident.status = target_state.value
        incident.selected_scenario_id = scenario_id
        incident.approval_id = approval_id
        incident.updated_at = utc_now_iso()
        db.commit()

        record_audit_event(
            db=db,
            incident_id=incident_id,
            correlation_id=correlation_id,
            event_type="SCENARIO_SELECTED",
            entity_type="Scenario",
            entity_id=scenario_id,
            actor_type="user",
            actor_id="demo-operator",
            after_state={
                "selected_scenario_id": scenario_id,
                "workflow_status": target_state.value,
                "approval_id": approval_id,
            },
            reason=f"Selected scenario {scenario_id}; disposition: {scenario.policy_status}",
            evidence_refs=[scenario_id] + ([approval_id] if approval_id else []),
        )

        return ScenarioSelectResponse(
            incident_id=incident_id,
            scenario_id=scenario_id,
            plan_version=scenario.plan_version,
            policy_status=PolicyDisposition(scenario.policy_status),
            approval_id=approval_id,
            workflow_status=target_state,
            reason_codes=scenario.reason_codes or [],
        )
