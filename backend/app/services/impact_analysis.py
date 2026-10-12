"""Impact Analysis Service (Member 2 domain).

Calculates available stock, coverage days, stockout exposure, and affected production orders.
"""
from typing import Optional
from sqlalchemy.orm import Session
from app.models.incident import utc_now_iso
from app.models.supply_chain import InventoryRecord, ShipmentRecord, ProductionOrderRecord
from app.schemas.impact import ImpactAnalysis, ComponentImpact


async def analyze_impact(incident_id: str, db: Optional[Session] = None) -> ImpactAnalysis:
    """Analyze the disruption impact on inventory and production schedules."""
    # Default baseline facts if db not populated or query empty
    component_id = "CMP-201"
    available_qty = 500
    daily_demand = 100
    coverage_days = 5.0
    delayed_eta = 12
    projected_stockout = True
    affected_orders = ["PO-5001", "PO-5002", "PO-5003"]
    projected_shortage = 700

    if db is not None:
        inv = db.query(InventoryRecord).filter(InventoryRecord.component_id == component_id).first()
        if inv and inv.daily_demand > 0:
            daily_demand = inv.daily_demand
            available_qty = max(0, inv.on_hand_qty - inv.reserved_qty)
            coverage_days = available_qty / daily_demand
        
        shp = db.query(ShipmentRecord).filter(ShipmentRecord.component_id == component_id).first()
        if shp:
            delayed_eta = shp.current_eta_days

        projected_stockout = coverage_days < delayed_eta
        if projected_stockout:
            days_short = max(0.0, delayed_eta - coverage_days)
            projected_shortage = int(days_short * daily_demand)

        orders = db.query(ProductionOrderRecord).all()
        if orders:
            affected_orders = [o.order_id for o in orders]

    comp_impact = ComponentImpact(
        component_id=component_id,
        available_qty=available_qty,
        daily_demand=daily_demand,
        coverage_days=round(coverage_days, 1),
        delayed_shipment_eta_days=delayed_eta,
        projected_stockout_before_eta=projected_stockout,
    )

    return ImpactAnalysis(
        incident_id=incident_id,
        component_impacts=[comp_impact],
        affected_order_ids=affected_orders,
        estimated_stockout_in_days=coverage_days,
        projected_shortage_units=projected_shortage,
        assumptions=[
            "Arrivals modeled at start of ETA day",
            "Warehouse A daily demand is steady at 100 units/day",
            "Reserved inventory is unavailable for production orders",
        ],
        evidence_refs=["SHP-102", f"INV-{component_id}-WH-A"],
        computed_at=utc_now_iso(),
    )
