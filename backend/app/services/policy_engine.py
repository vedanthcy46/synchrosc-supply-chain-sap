"""Policy Engine Service (Member 4 domain).

Evaluates recovery scenarios against hard constraints, thresholds, and governance rules.
"""
from typing import Dict, Any, List
from app.core.config import settings
from app.schemas.common import PolicyDisposition
from app.schemas.scenario import RecoveryScenario
from app.models.supply_chain import InventoryRecord, ShipmentRecord, SupplierRecord


def assess_scenario(
    scenario: RecoveryScenario,
    context: Dict[str, Any],
) -> Dict[str, Any]:
    """Assess a recovery scenario against safety, budget, and supplier governance rules."""
    disposition = PolicyDisposition.AUTO_ALLOWED
    reason_codes: List[str] = []

    # 1. Hard constraints: Check feasibility
    if not scenario.feasible:
        return {
            "policy_status": PolicyDisposition.BLOCKED,
            "reason_codes": ["PLAN_INFEASIBLE"] + scenario.feasibility_reasons,
        }
    if scenario.incremental_cost < 0:
        return {"policy_status": PolicyDisposition.BLOCKED, "reason_codes": ["INVALID_RECOVERY_COST"]}

    # 2. Check every purchase against the current supplier record. Policy must
    # be based on server-loaded facts, never fields supplied by the caller.
    for action in scenario.actions:
        if action.get("type") == "purchase_order":
            supplier_id = action.get("supplier_id")
            suppliers = context.get("suppliers", {})
            supplier = suppliers.get(supplier_id) if suppliers else None
            if supplier is None:
                # Backwards-compatible context for callers that assess only one supplier.
                supplier = context if context.get("supplier_id") == supplier_id else None
            if supplier is None or not supplier.get("approved", False):
                return {
                    "policy_status": PolicyDisposition.BLOCKED,
                    "reason_codes": ["SUPPLIER_NOT_APPROVED"],
                }
            if supplier.get("risk_status", "unknown") in {"blocked", "unknown"}:
                return {
                    "policy_status": PolicyDisposition.BLOCKED,
                    "reason_codes": ["SUPPLIER_RISK_BLOCKED"],
                }
            quantity = action.get("quantity")
            if quantity is not None and (not isinstance(quantity, int) or quantity <= 0):
                return {"policy_status": PolicyDisposition.BLOCKED, "reason_codes": ["ACTION_QUANTITY_INVALID"]}
            if quantity is not None and quantity > supplier.get("available_capacity", 0):
                return {
                    "policy_status": PolicyDisposition.BLOCKED,
                    "reason_codes": ["SUPPLIER_CAPACITY_EXCEEDED"],
                }
            eta = action.get("eta_days", scenario.arrival_days)
            if eta < 0 or eta > scenario.arrival_days:
                return {
                    "policy_status": PolicyDisposition.BLOCKED,
                    "reason_codes": ["ACTION_TIMING_INFEASIBLE"],
                }
        elif action.get("type") == "expedite_freight":
            shipments = context.get("shipments", {})
            shipment = shipments.get(action.get("shipment_id"))
            if (
                shipment is None
                or action.get("new_eta_days", -1) < 0
                or action.get("new_eta_days", scenario.arrival_days) > scenario.arrival_days
                or action.get("new_eta_days", 0) >= shipment.get("current_eta_days", 0)
            ):
                return {"policy_status": PolicyDisposition.BLOCKED, "reason_codes": ["ACTION_TIMING_INFEASIBLE"]}
            if action.get("quantity", shipment.get("quantity", 0)) > shipment.get("quantity", 0):
                return {"policy_status": PolicyDisposition.BLOCKED, "reason_codes": ["ACTION_QUANTITY_INVALID"]}
            quantity = action.get("quantity", shipment.get("quantity", 0))
            if not isinstance(quantity, int) or quantity <= 0:
                return {"policy_status": PolicyDisposition.BLOCKED, "reason_codes": ["ACTION_QUANTITY_INVALID"]}
        elif action.get("type") == "inter_warehouse_transfer":
            inventory = context.get("inventory", {})
            source = inventory.get((action.get("from_warehouse"), "CMP-201"))
            quantity = action.get("quantity", 0)
            if not isinstance(quantity, int) or quantity <= 0:
                return {"policy_status": PolicyDisposition.BLOCKED, "reason_codes": ["ACTION_QUANTITY_INVALID"]}
            if (
                source is None
                or quantity > source.get("available_qty", 0)
                or (source.get("transferable_qty") is not None and quantity > source["transferable_qty"])
            ):
                return {"policy_status": PolicyDisposition.BLOCKED, "reason_codes": ["TRANSFER_STOCK_UNAVAILABLE"]}
            if (action.get("to_warehouse"), "CMP-201") not in inventory:
                return {"policy_status": PolicyDisposition.BLOCKED, "reason_codes": ["TRANSFER_DESTINATION_UNAVAILABLE"]}
            eta = action.get("eta_days", scenario.arrival_days)
            if eta < 0 or eta > scenario.arrival_days:
                return {"policy_status": PolicyDisposition.BLOCKED, "reason_codes": ["ACTION_TIMING_INFEASIBLE"]}

    # 3. Soft constraints: Check cost threshold
    limit = context.get("auto_approval_limit_inr", settings.AUTO_APPROVAL_LIMIT_INR)
    if scenario.incremental_cost > limit:
        disposition = PolicyDisposition.APPROVAL_REQUIRED
        reason_codes.append("COST_ABOVE_AUTO_APPROVAL_LIMIT")

    # 4. Soft constraints: Check residual shortage or elevated risk
    if scenario.unmet_demand_units_before_recovery > 0:
        disposition = PolicyDisposition.APPROVAL_REQUIRED
        reason_codes.append("RESIDUAL_SHORTAGE_RISK")
        reason_codes.append("ELEVATED_OPERATIONAL_RISK")

    if context.get("severity") in {"high", "critical"} and "ELEVATED_OPERATIONAL_RISK" not in reason_codes:
        if disposition != PolicyDisposition.BLOCKED:
            disposition = PolicyDisposition.APPROVAL_REQUIRED
            reason_codes.append("ELEVATED_OPERATIONAL_RISK")

    return {
        "policy_status": disposition,
        "reason_codes": reason_codes,
    }


def load_policy_context(db, incident) -> Dict[str, Any]:
    """Build policy facts from current persisted records."""
    return {
        "severity": incident.severity,
        "suppliers": {
            supplier.supplier_id: {
                "approved": supplier.approved,
                "risk_status": supplier.risk_status,
                "available_capacity": supplier.available_capacity,
            }
            for supplier in db.query(SupplierRecord).all()
        },
        "shipments": {
            shipment.shipment_id: {
                "quantity": shipment.quantity,
                "current_eta_days": shipment.current_eta_days,
            }
            for shipment in db.query(ShipmentRecord).all()
        },
        "inventory": {
            (record.warehouse_id, record.component_id): {
                "available_qty": max(0, record.on_hand_qty - record.reserved_qty),
                "transferable_qty": record.transferable_qty,
            }
            for record in db.query(InventoryRecord).all()
        },
    }
