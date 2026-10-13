"""Scenario Planning and Option Scoring Service (Member 3 domain).

Generates candidate recovery alternatives and calculates transparent, deterministic ranking.
All values are synthetic demo fixtures — not live SAP or supplier data.
"""
from typing import List, Optional
from sqlalchemy.orm import Session

from app.schemas.impact import ImpactAnalysis
from app.schemas.scenario import RecoveryScenario
from app.schemas.common import PolicyDisposition, StrategyType

# ---------------------------------------------------------------------------
# Demo fixture constants (synthetic — see data/demo_seed.json)
# ---------------------------------------------------------------------------
_COMPONENT_ID = "CMP-201"
_SHIPMENT_ID = "SHP-102"
_SHIPMENT_QTY = 800
_REVISED_ETA_DAYS = 12
_EXPEDITE_ETA_DAYS = 4
_EXPEDITE_COST_INR = 90_000.0

_SUPPLIER_B_ID = "SUP-B"
_SUPPLIER_B_QTY = 800
_SUPPLIER_B_ETA_DAYS = 4
_SUPPLIER_B_UNIT_COST = 1_080.0
_BASELINE_UNIT_COST = 1_000.0

_WH_B_TRANSFER_QTY = 300
_WH_B_TRANSFER_ETA_DAYS = 2
_WH_B_TRANSFER_COST_INR = 12_000.0

_PLAN_VERSION = "v1.0"


# ---------------------------------------------------------------------------
# Pure calculation helpers
# ---------------------------------------------------------------------------

def calc_usable_inventory(on_hand: int, reserved: int) -> int:
    """Return available (usable) inventory after excluding reserved stock."""
    return max(0, on_hand - reserved)


def calc_coverage_days(available_qty: int, daily_demand: int) -> Optional[float]:
    """Return days of stock coverage, or None when demand is zero (avoids division by zero)."""
    if daily_demand <= 0:
        return None
    return available_qty / daily_demand


def calc_alt_supplier_premium(qty: int, unit_cost: float, baseline_cost: float) -> float:
    """Return incremental cost of purchasing from alternate supplier vs baseline.

    Formula: qty × (unit_cost − baseline_cost)
    Demo: 800 × (1080 − 1000) = ₹64,000
    """
    return max(0.0, qty * (unit_cost - baseline_cost))


def calc_shortage_exposure(
    available_qty: int,
    daily_demand: int,
    arrival_qty: int,
    arrival_day: int,
    horizon_days: int,
) -> int:
    """Deterministic day-by-day shortage calculation.

    Arrivals are applied at the *start* of arrival_day (convention from demo_seed.json).
    Quantities are kept non-negative throughout.
    Returns total unmet demand units over the horizon.
    """
    if daily_demand <= 0:
        return 0

    stock = available_qty
    unmet = 0
    for day in range(1, horizon_days + 1):
        if day == arrival_day:
            stock += arrival_qty          # arrival at start of day
        consumed = min(stock, daily_demand)
        unmet += daily_demand - consumed
        stock = max(0, stock - consumed)
    return unmet


def calc_risk_score(
    unmet_units: int,
    incremental_cost: float,
    arrival_days: int,
    max_cost_ref: float = 90_000.0,
) -> int:
    """Deterministic risk score in [0, 100].

    Components (each 0-100, weighted):
      - shortage_component  (40 %): unmet_units / 800 capped at 1
      - cost_component      (30 %): incremental_cost / max_cost_ref capped at 1
      - speed_component     (30 %): arrival_days / 12 capped at 1

    A higher score means higher risk.
    """
    shortage_ratio = min(1.0, unmet_units / max(1, _SHIPMENT_QTY))
    cost_ratio = min(1.0, incremental_cost / max(1.0, max_cost_ref))
    speed_ratio = min(1.0, arrival_days / _REVISED_ETA_DAYS)
    raw = 0.40 * shortage_ratio + 0.30 * cost_ratio + 0.30 * speed_ratio
    return round(raw * 100)


def rank_scenarios(scenarios: List[RecoveryScenario]) -> List[RecoveryScenario]:
    """Assign deterministic ranks using the default objective:

    1. Infeasible scenarios are excluded from the ranked recommendations.
    2. Prefer scenarios that eliminate all shortage (unmet_demand == 0).
    3. Among tied objective groups, prefer lowest incremental_cost.
    4. Break ties by arrival_days (shorter first), then risk_score (lower first).

    The baseline 'wait' scenario (SCN-WAIT) is always ranked last and flagged
    as non-executable.
    """
    feasible = [s for s in scenarios if s.feasible and s.scenario_id != "SCN-WAIT"]
    wait = [s for s in scenarios if s.scenario_id == "SCN-WAIT"]
    infeasible = [s for s in scenarios if not s.feasible and s.scenario_id != "SCN-WAIT"]

    def sort_key(s: RecoveryScenario):
        no_shortage = 0 if s.unmet_demand_units_before_recovery == 0 else 1
        return (no_shortage, s.incremental_cost, s.arrival_days, s.risk_score)

    feasible.sort(key=sort_key)

    ranked: List[RecoveryScenario] = []
    for i, s in enumerate(feasible, start=1):
        s.rank = i
        ranked.append(s)

    # Infeasible scenarios get ranks after feasible ones
    for i, s in enumerate(infeasible, start=len(feasible) + 1):
        s.rank = i
        ranked.append(s)

    # Wait baseline always last
    for s in wait:
        s.rank = len(ranked) + 1
        ranked.append(s)

    return ranked


# ---------------------------------------------------------------------------
# Scenario builders
# ---------------------------------------------------------------------------

def _build_expedite(incident_id: str, available_qty: int, daily_demand: int) -> RecoveryScenario:
    unmet = calc_shortage_exposure(
        available_qty=available_qty,
        daily_demand=daily_demand,
        arrival_qty=_SHIPMENT_QTY,
        arrival_day=_EXPEDITE_ETA_DAYS,
        horizon_days=_REVISED_ETA_DAYS,
    )
    risk = calc_risk_score(unmet, _EXPEDITE_COST_INR, _EXPEDITE_ETA_DAYS)
    return RecoveryScenario(
        scenario_id="SCN-EXPEDITE",
        incident_id=incident_id,
        name="Expedite current shipment SHP-102 via air freight",
        strategy_type=StrategyType.EXPEDITE_SHIPMENT,
        actions=[{
            "type": "expedite_freight",
            "shipment_id": _SHIPMENT_ID,
            "new_mode": "air",
            "new_eta_days": _EXPEDITE_ETA_DAYS,
            "extra_cost_inr": _EXPEDITE_COST_INR,
            "data_source": "demo_fixture",
        }],
        incremental_cost=_EXPEDITE_COST_INR,
        currency="INR",
        arrival_days=_EXPEDITE_ETA_DAYS,
        unmet_demand_units_before_recovery=unmet,
        estimated_production_delay_days=0 if unmet == 0 else _EXPEDITE_ETA_DAYS,
        feasible=True,
        feasibility_reasons=["Air freight slot available per demo fixture; carrier confirmation required."],
        risk_score=risk,
        rank=0,  # assigned by rank_scenarios
        reasoning_summary=(
            f"Expediting SHP-102 to day {_EXPEDITE_ETA_DAYS} costs ₹{_EXPEDITE_COST_INR:,.0f}. "
            f"Unmet demand before arrival: {unmet} units. "
            "Higher freight premium than alternate supplier option."
        ),
        policy_status=PolicyDisposition.APPROVAL_REQUIRED,
        reason_codes=["COST_ABOVE_AUTO_APPROVAL_LIMIT"],
        plan_version=_PLAN_VERSION,
    )


def _build_alt_supplier(incident_id: str, available_qty: int, daily_demand: int) -> RecoveryScenario:
    premium = calc_alt_supplier_premium(_SUPPLIER_B_QTY, _SUPPLIER_B_UNIT_COST, _BASELINE_UNIT_COST)
    unmet = calc_shortage_exposure(
        available_qty=available_qty,
        daily_demand=daily_demand,
        arrival_qty=_SUPPLIER_B_QTY,
        arrival_day=_SUPPLIER_B_ETA_DAYS,
        horizon_days=_REVISED_ETA_DAYS,
    )
    risk = calc_risk_score(unmet, premium, _SUPPLIER_B_ETA_DAYS)
    return RecoveryScenario(
        scenario_id="SCN-ALT-SUPPLIER",
        incident_id=incident_id,
        name="Order 800 units from approved alternate Supplier B",
        strategy_type=StrategyType.ALTERNATE_SUPPLIER,
        actions=[{
            "type": "purchase_order",
            "supplier_id": _SUPPLIER_B_ID,
            "quantity": _SUPPLIER_B_QTY,
            "unit_cost_inr": _SUPPLIER_B_UNIT_COST,
            "baseline_unit_cost_inr": _BASELINE_UNIT_COST,
            "unit_premium_inr": _SUPPLIER_B_UNIT_COST - _BASELINE_UNIT_COST,
            "total_incremental_premium_inr": premium,
            "eta_days": _SUPPLIER_B_ETA_DAYS,
            "note": "Incremental cost is the premium above baseline, not the full purchase value.",
            "data_source": "demo_fixture",
        }],
        incremental_cost=premium,
        currency="INR",
        arrival_days=_SUPPLIER_B_ETA_DAYS,
        unmet_demand_units_before_recovery=unmet,
        estimated_production_delay_days=0 if unmet == 0 else _SUPPLIER_B_ETA_DAYS,
        feasible=True,
        feasibility_reasons=["Supplier B is approved and has 800 units available per demo fixture."],
        risk_score=risk,
        rank=0,
        reasoning_summary=(
            f"Supplier B delivers {_SUPPLIER_B_QTY} units on day {_SUPPLIER_B_ETA_DAYS}. "
            f"Incremental premium: ₹{premium:,.0f} (800 × ₹80). "
            "Lowest cost among full-recovery options; preferred over expediting."
        ),
        policy_status=PolicyDisposition.APPROVAL_REQUIRED,
        reason_codes=["COST_ABOVE_AUTO_APPROVAL_LIMIT"],
        plan_version=_PLAN_VERSION,
    )


def _build_wh_transfer(incident_id: str, available_qty: int, daily_demand: int) -> RecoveryScenario:
    unmet = calc_shortage_exposure(
        available_qty=available_qty,
        daily_demand=daily_demand,
        arrival_qty=_WH_B_TRANSFER_QTY,
        arrival_day=_WH_B_TRANSFER_ETA_DAYS,
        horizon_days=_REVISED_ETA_DAYS,
    )
    risk = calc_risk_score(unmet, _WH_B_TRANSFER_COST_INR, _WH_B_TRANSFER_ETA_DAYS)
    prod_delay = max(0, _REVISED_ETA_DAYS - int((available_qty + _WH_B_TRANSFER_QTY) / max(1, daily_demand)))
    return RecoveryScenario(
        scenario_id="SCN-WH-TRANSFER",
        incident_id=incident_id,
        name="Transfer 300 units from Warehouse B (partial mitigation only)",
        strategy_type=StrategyType.INVENTORY_TRANSFER,
        actions=[{
            "type": "inter_warehouse_transfer",
            "from_warehouse": "WH-B",
            "to_warehouse": "WH-A",
            "quantity": _WH_B_TRANSFER_QTY,
            "transfer_cost_inr": _WH_B_TRANSFER_COST_INR,
            "eta_days": _WH_B_TRANSFER_ETA_DAYS,
            "data_source": "demo_fixture",
        }],
        incremental_cost=_WH_B_TRANSFER_COST_INR,
        currency="INR",
        arrival_days=_WH_B_TRANSFER_ETA_DAYS,
        unmet_demand_units_before_recovery=unmet,
        estimated_production_delay_days=prod_delay,
        feasible=True,
        feasibility_reasons=["WH-B has 300 transferable units per demo fixture."],
        risk_score=risk,
        rank=0,
        reasoning_summary=(
            f"Transfer of {_WH_B_TRANSFER_QTY} units arrives on day {_WH_B_TRANSFER_ETA_DAYS} "
            f"at ₹{_WH_B_TRANSFER_COST_INR:,.0f}. "
            f"PARTIAL MITIGATION ONLY: {unmet} units of residual shortage remain before delayed shipment arrives. "
            "This option does NOT fully resolve the disruption."
        ),
        policy_status=PolicyDisposition.APPROVAL_REQUIRED,
        reason_codes=["RESIDUAL_SHORTAGE_RISK", "ELEVATED_OPERATIONAL_RISK"],
        plan_version=_PLAN_VERSION,
    )


def _build_wait_baseline(incident_id: str, available_qty: int, daily_demand: int) -> RecoveryScenario:
    """Baseline comparison only — not an executable recovery action."""
    unmet = calc_shortage_exposure(
        available_qty=available_qty,
        daily_demand=daily_demand,
        arrival_qty=_SHIPMENT_QTY,
        arrival_day=_REVISED_ETA_DAYS,
        horizon_days=_REVISED_ETA_DAYS,
    )
    risk = calc_risk_score(unmet, 0.0, _REVISED_ETA_DAYS)
    return RecoveryScenario(
        scenario_id="SCN-WAIT",
        incident_id=incident_id,
        name="[BASELINE] Wait for delayed shipment SHP-102 — NOT a recovery action",
        strategy_type=StrategyType.EXPEDITE_SHIPMENT,
        actions=[],
        incremental_cost=0.0,
        currency="INR",
        arrival_days=_REVISED_ETA_DAYS,
        unmet_demand_units_before_recovery=unmet,
        estimated_production_delay_days=max(0, _REVISED_ETA_DAYS - int(available_qty / max(1, daily_demand))),
        feasible=False,  # Not feasible as a recovery plan — stockout occurs
        feasibility_reasons=[
            "Waiting for the delayed shipment results in a stockout before arrival.",
            "This entry is a comparison baseline only and must not be selected for execution.",
        ],
        risk_score=risk,
        rank=0,
        reasoning_summary=(
            f"Waiting for SHP-102 at revised ETA day {_REVISED_ETA_DAYS} results in "
            f"{unmet} units of unmet demand. Included for comparison only."
        ),
        policy_status=PolicyDisposition.BLOCKED,
        reason_codes=["PLAN_INFEASIBLE", "BASELINE_COMPARISON_ONLY"],
        plan_version=_PLAN_VERSION,
    )


# ---------------------------------------------------------------------------
# Public entry point (called by orchestrator and agent)
# ---------------------------------------------------------------------------

async def generate_scenarios(
    incident_id: str,
    impact: ImpactAnalysis,
    db: Optional[Session] = None,
) -> List[RecoveryScenario]:
    """Generate and rank at least three candidate recovery plans for an incident.

    Consumes the typed ImpactAnalysis from Member 2.
    Uses DB supply-chain records when available; falls back to demo fixture values.
    All calculations are deterministic — no LLM involvement.
    """
    # Extract inventory facts from impact report (Member 2 output)
    comp = next(
        (c for c in impact.component_impacts if c.component_id == _COMPONENT_ID),
        None,
    )
    available_qty = comp.available_qty if comp else 500
    daily_demand = comp.daily_demand if comp else 100

    scenarios = [
        _build_alt_supplier(incident_id, available_qty, daily_demand),
        _build_expedite(incident_id, available_qty, daily_demand),
        _build_wh_transfer(incident_id, available_qty, daily_demand),
        _build_wait_baseline(incident_id, available_qty, daily_demand),
    ]

    return rank_scenarios(scenarios)
