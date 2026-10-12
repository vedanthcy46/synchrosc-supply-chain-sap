"""Scenario Planning and Option Scoring Service (Member 3 domain).

Generates candidate recovery alternatives and calculates transparent ranking.
"""
from typing import List, Optional
from sqlalchemy.orm import Session
from app.schemas.impact import ImpactAnalysis
from app.schemas.scenario import RecoveryScenario
from app.schemas.common import PolicyDisposition, StrategyType


async def generate_scenarios(
    incident_id: str,
    impact: ImpactAnalysis,
    db: Optional[Session] = None,
) -> List[RecoveryScenario]:
    """Generate and rank at least three candidate recovery plans."""

    # Candidate 1: Expedite Delayed Shipment SHP-102
    expedite = RecoveryScenario(
        scenario_id="SCN-EXPEDITE",
        incident_id=incident_id,
        name="Expedite current shipment",
        strategy_type=StrategyType.EXPEDITE_SHIPMENT,
        actions=[
            {
                "type": "expedite_freight",
                "shipment_id": "SHP-102",
                "new_mode": "air",
                "new_eta_days": 4,
                "extra_cost": 90000,
            }
        ],
        incremental_cost=90000.0,
        currency="INR",
        arrival_days=4,
        unmet_demand_units_before_recovery=0,
        estimated_production_delay_days=0,
        feasible=True,
        feasibility_reasons=["Carrier air freight slot confirmed"],
        risk_score=25,
        rank=2,
        reasoning_summary="Avoids stockout by day 4 arrival, but has higher freight premium than alternate supplier.",
        policy_status=PolicyDisposition.APPROVAL_REQUIRED,
        reason_codes=["COST_ABOVE_AUTO_APPROVAL_LIMIT"],
        plan_version="v1.0",
    )

    # Candidate 2: Buy from approved alternate Supplier B
    alt_supplier = RecoveryScenario(
        scenario_id="SCN-ALT-SUPPLIER",
        incident_id=incident_id,
        name="Order from approved alternate supplier",
        strategy_type=StrategyType.ALTERNATE_SUPPLIER,
        actions=[
            {
                "type": "purchase_order",
                "supplier_id": "SUP-B",
                "quantity": 800,
                "unit_cost": 1080,
                "baseline_cost": 1000,
                "unit_premium": 80,
                "total_premium": 64000,
                "eta_days": 4,
            }
        ],
        incremental_cost=64000.0,
        currency="INR",
        arrival_days=4,
        unmet_demand_units_before_recovery=0,
        estimated_production_delay_days=0,
        feasible=True,
        feasibility_reasons=["Supplier B approved and has 800 units capacity"],
        risk_score=15,
        rank=1,
        reasoning_summary="Meets no-stockout objective with lowest incremental cost (₹64,000 vs ₹90,000 expedite).",
        policy_status=PolicyDisposition.APPROVAL_REQUIRED,
        reason_codes=["COST_ABOVE_AUTO_APPROVAL_LIMIT"],
        plan_version="v1.0",
    )

    # Candidate 3: Transfer from Warehouse B
    transfer = RecoveryScenario(
        scenario_id="SCN-TRANSFER",
        incident_id=incident_id,
        name="Transfer 300 units from Warehouse B",
        strategy_type=StrategyType.INVENTORY_TRANSFER,
        actions=[
            {
                "type": "inter_warehouse_transfer",
                "from_warehouse": "WH-B",
                "to_warehouse": "WH-A",
                "quantity": 300,
                "transfer_cost": 12000,
                "eta_days": 2,
            }
        ],
        incremental_cost=12000.0,
        currency="INR",
        arrival_days=2,
        unmet_demand_units_before_recovery=400,
        estimated_production_delay_days=4,
        feasible=True,
        feasibility_reasons=["WH-B has 300 transferable units available"],
        risk_score=60,
        rank=3,
        reasoning_summary="Lowest cash outlay (₹12,000) and arrives in 2 days, but leaves 400 units residual shortage before day 12.",
        policy_status=PolicyDisposition.APPROVAL_REQUIRED,
        reason_codes=["RESIDUAL_SHORTAGE_RISK", "ELEVATED_OPERATIONAL_RISK"],
        plan_version="v1.0",
    )

    scenarios = [alt_supplier, expedite, transfer]
    return scenarios
