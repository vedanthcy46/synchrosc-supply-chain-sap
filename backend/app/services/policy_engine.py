"""Policy Engine Service (Member 4 domain).

Evaluates recovery scenarios against hard constraints, thresholds, and governance rules.
"""
from typing import Dict, Any, List
from app.core.config import settings
from app.schemas.common import PolicyDisposition
from app.schemas.scenario import RecoveryScenario


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

    # 2. Check actions for unapproved/blocked suppliers
    for action in scenario.actions:
        if action.get("type") == "purchase_order":
            supplier_id = action.get("supplier_id")
            # If supplier is SUP-X or explicit unapproved
            if supplier_id == "SUP-X" or context.get("supplier_approved") is False:
                return {
                    "policy_status": PolicyDisposition.BLOCKED,
                    "reason_codes": ["SUPPLIER_NOT_APPROVED"],
                }
            if context.get("supplier_risk_status") in {"blocked", "unknown"}:
                return {
                    "policy_status": PolicyDisposition.BLOCKED,
                    "reason_codes": ["SUPPLIER_RISK_BLOCKED"],
                }

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
