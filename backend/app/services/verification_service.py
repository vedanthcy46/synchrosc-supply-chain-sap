"""Verification Service (Member 4 domain).

Recalculates supply-chain timeline after simulated execution and records verification outcome.
"""
from typing import Dict, Any
from sqlalchemy.orm import Session
from app.models.execution import ExecutionRecord
from app.models.incident import Incident
from app.models.scenario import ScenarioRecord
from app.models.supply_chain import InventoryRecord, ShipmentRecord
from app.services.audit_service import record_audit_event


def verify_execution_outcome(
    db: Session,
    incident_id: str,
    scenario_id: str,
    correlation_id: str,
    action_id: str,
) -> Dict[str, Any]:
    """Verify that the executed scenario resolved or mitigated the projected shortage."""
    incident = db.query(Incident).filter(Incident.incident_id == incident_id).first()
    scenario = db.query(ScenarioRecord).filter(ScenarioRecord.scenario_id == scenario_id).first()

    execution = db.query(ExecutionRecord).filter(ExecutionRecord.action_id == action_id).first()
    effect = execution.simulation_effect if execution else None
    verified = bool(
        incident
        and scenario
        and scenario.incident_id == incident_id
        and execution
        and execution.incident_id == incident_id
        and execution.scenario_id == scenario_id
        and effect
        and effect.get("arrival_days") == scenario.arrival_days
    )
    if verified and scenario.strategy_type == "alternate_supplier":
        action = next((a for a in (scenario.actions or []) if a.get("type") == "purchase_order"), {})
        verified = bool(
            effect.get("supplier_id") == action.get("supplier_id")
            and effect.get("quantity", 0) >= action.get("quantity", 0) > 0
        )
    if verified and scenario.strategy_type == "expedite_shipment":
        action = next((a for a in (scenario.actions or []) if a.get("type") == "expedite_freight"), {})
        shipment = db.query(ShipmentRecord).filter(ShipmentRecord.shipment_id == action.get("shipment_id")).first()
        verified = bool(
            shipment
            and shipment.current_eta_days == action.get("new_eta_days", scenario.arrival_days)
            and effect.get("shipment_id") == shipment.shipment_id
            and effect.get("quantity", 0) >= shipment.quantity
        )
    if verified and scenario.strategy_type == "inventory_transfer":
        action = next((a for a in (scenario.actions or []) if a.get("type") == "inter_warehouse_transfer"), {})
        destination = db.query(InventoryRecord).filter(
            InventoryRecord.component_id == "CMP-201",
            InventoryRecord.warehouse_id == action.get("to_warehouse"),
        ).first()
        source = db.query(InventoryRecord).filter(
            InventoryRecord.component_id == "CMP-201",
            InventoryRecord.warehouse_id == action.get("from_warehouse"),
        ).first()
        quantity = int(action.get("quantity", 0))
        verified = bool(
            destination
            and source
            and effect.get("from_warehouse") == source.warehouse_id
            and effect.get("to_warehouse") == destination.warehouse_id
            and effect.get("quantity") == quantity
            and source.on_hand_qty == effect.get("source_before_qty", 0) - quantity
            and destination.on_hand_qty == effect.get("destination_before_qty", 0) + quantity
        )

    residual = None
    baseline_exposure = None
    if verified:
        impacts = (incident.impact_summary or {}).get("component_impacts", [])
        impact = next((item for item in impacts if item.get("component_id") == "CMP-201"), None)
        if impact:
            coverage = impact.get("coverage_days")
            eta = impact.get("delayed_shipment_eta_days")
            demand = impact.get("daily_demand", 0)
            if coverage is not None and eta is not None and demand > 0:
                baseline_exposure = max(0, round((eta - coverage) * demand))
                recovered_qty = effect.get("quantity", 0)
                residual = max(0, baseline_exposure - recovered_qty)
                verified = residual == scenario.unmet_demand_units_before_recovery
        else:
            verified = False
    if not verified:
        summary = f"Simulated execution of {scenario_id} failed outcome verification."
    elif residual:
        summary = f"Simulated execution of {scenario_id} verified; estimated residual shortage is {residual} units."
    else:
        summary = f"Simulated execution of {scenario_id} verified; the plan estimates no residual shortage."

    record_audit_event(
        db=db,
        incident_id=incident_id,
        correlation_id=correlation_id,
        event_type="OUTCOME_VERIFIED",
        entity_type="Incident",
        entity_id=incident_id,
        actor_type="system",
        actor_id="verification_service",
        before_state={"verified": False},
        after_state={"verified": verified, "residual_unmet": residual, "baseline_shortage_units": baseline_exposure},
        reason=summary,
        evidence_refs=[scenario_id] if scenario else [],
    )

    return {
        "verified": verified,
        "summary": summary,
        "incident_id": incident_id,
        "scenario_id": scenario_id,
    }
