"""Impact Analysis Service (Member 2 domain).

Calculates available stock, stock coverage days, shortage exposure,
and identifies production orders at risk using deterministic formulas
prescribed in the SynchroSC implementation handbook.
"""
from typing import Optional, List, Dict, Any, Tuple
from sqlalchemy.orm import Session
from app.models.incident import Incident, DisruptionEventRecord, utc_now_iso
from app.models.supply_chain import InventoryRecord, ShipmentRecord, ProductionOrderRecord
from app.schemas.impact import ImpactAnalysis, ComponentImpact, ProductionOrderRisk
from app.schemas.common import ResourceNotFoundError


def calculate_available_stock(on_hand_qty: int, reserved_qty: int) -> int:
    """Calculate usable stock: available_qty = max(0, on_hand_qty - reserved_qty).

    Reserved stock must not be counted as available stock.
    """
    return max(0, on_hand_qty - reserved_qty)


def calculate_stock_coverage(available_qty: int, daily_demand: int) -> Optional[float]:
    """Calculate stock coverage in days.

    Returns available_qty / daily_demand when daily_demand > 0.
    Returns None when daily_demand is zero (avoids division-by-zero).
    """
    if daily_demand <= 0:
        return None
    return available_qty / daily_demand


def calculate_shortage_exposure(
    available_qty: int,
    daily_demand: int,
    arrival_days: int,
) -> int:
    """Calculate demand uncovered by usable stock prior to arrival.

    demand_until_arrival = daily_demand * arrival_days.
    shortage = max(0, demand_until_arrival - available_qty).
    """
    if daily_demand <= 0 or arrival_days <= 0:
        return 0
    demand_until_arrival = daily_demand * arrival_days
    return max(0, demand_until_arrival - available_qty)


def evaluate_order_risks(
    component_id: str,
    available_qty: int,
    coverage_days: Optional[float],
    arrival_days: Optional[int],
    orders: List[ProductionOrderRecord],
) -> Tuple[List[str], List[ProductionOrderRisk]]:
    """Determine which production orders requiring the component are at risk

    due to stockout before the shipment arrival date.
    """
    affected_order_ids: List[str] = []
    affected_order_details: List[ProductionOrderRisk] = []

    # Filter orders requiring the given component
    relevant_orders = []
    for order in orders:
        req_qty = 0
        for req in (order.component_requirements or []):
            if isinstance(req, dict) and req.get("component_id") == component_id:
                req_qty += req.get("quantity", 0)
        if req_qty > 0:
            relevant_orders.append((order, req_qty))

    # Sort orders chronologically by due_in_days
    relevant_orders.sort(key=lambda item: item[0].due_in_days)

    cumulative_allocated = 0
    for order, req_qty in relevant_orders:
        due_days = order.due_in_days
        cumulative_allocated += req_qty

        # An order is at risk if:
        # 1. Stockout occurs before arrival AND order is due before arrival and at/after stockout, OR
        # 2. Cumulative requirements exceed current available stock prior to arrival.
        is_at_risk = False
        if arrival_days is not None:
            if due_days <= arrival_days:
                if coverage_days is not None and due_days >= coverage_days:
                    is_at_risk = True
                elif cumulative_allocated > available_qty:
                    is_at_risk = True

        if is_at_risk:
            if order.order_id not in affected_order_ids:
                affected_order_ids.append(order.order_id)
            affected_order_details.append(
                ProductionOrderRisk(
                    order_id=order.order_id,
                    product_id=order.product_id,
                    due_in_days=due_days,
                    required_qty=req_qty,
                    priority=order.priority,
                    status=order.status,
                )
            )

    return affected_order_ids, affected_order_details


async def analyze_impact(incident_id: str, db: Optional[Session] = None) -> ImpactAnalysis:
    """Analyze disruption impact on inventory availability and production commitments.

    Strictly deterministic and reproducible from database state.
    """
    assumptions = [
        "Arrivals modeled at start of ETA day",
        "Reserved inventory is strictly excluded from usable available stock",
    ]
    evidence_refs: List[str] = []
    warnings: List[str] = []
    component_impacts: List[ComponentImpact] = []
    all_affected_order_ids: List[str] = []
    all_affected_orders: List[ProductionOrderRisk] = []
    total_shortage_units = 0
    min_stockout_days: Optional[float] = None

    if db is None:
        warnings.append("No active database session provided; returning unpopulated impact analysis.")
        return ImpactAnalysis(
            incident_id=incident_id,
            component_impacts=[],
            affected_order_ids=[],
            estimated_stockout_in_days=None,
            projected_shortage_units=0,
            summary="No database session provided.",
            assumptions=assumptions,
            evidence_refs=[],
            warnings=warnings,
            computed_at=utc_now_iso(),
        )

    # 1. Retrieve Incident
    incident = db.query(Incident).filter(Incident.incident_id == incident_id).first()
    if not incident:
        raise ResourceNotFoundError("Incident", incident_id)

    # 2. Retrieve Associated Disruption Event
    event = db.query(DisruptionEventRecord).filter(DisruptionEventRecord.event_id == incident.event_id).first()
    if not event:
        # Fallback query by incident_id if event_id is not directly matched
        event = db.query(DisruptionEventRecord).filter(DisruptionEventRecord.incident_id == incident_id).first()

    shipment_ids = event.affected_shipment_ids if event else []
    if event and event.evidence:
        for ev in event.evidence:
            if isinstance(ev, str) and ev not in evidence_refs:
                evidence_refs.append(ev)

    # If no shipment IDs in event, look for any shipments marked delayed
    if not shipment_ids:
        delayed_shipments = db.query(ShipmentRecord).filter(ShipmentRecord.status == "delayed").all()
        shipment_ids = [s.shipment_id for s in delayed_shipments]
        if not shipment_ids:
            warnings.append("No affected shipment IDs identified for disruption.")

    resolved_components = set()

    for shp_id in shipment_ids:
        shp = db.query(ShipmentRecord).filter(ShipmentRecord.shipment_id == shp_id).first()
        if not shp:
            warnings.append(f"Shipment '{shp_id}' referenced in disruption was not found in records.")
            continue

        evidence_refs.append(shp.shipment_id)
        comp_id = shp.component_id
        resolved_components.add(comp_id)

        # Retrieve inventory record for component
        # Prioritize factory inventory (warehouse matching destination or with positive daily demand)
        dest_match = "WH-A" if "WH-A" in (shp.destination or "") else None
        inv_query = db.query(InventoryRecord).filter(InventoryRecord.component_id == comp_id)
        if dest_match:
            inv = inv_query.filter(InventoryRecord.warehouse_id == dest_match).first()
        else:
            inv = inv_query.filter(InventoryRecord.daily_demand > 0).first()

        if not inv:
            inv = inv_query.first()

        if not inv:
            warnings.append(f"No inventory record found for component '{comp_id}'.")
            continue

        evidence_refs.append(f"INV-{comp_id}-{inv.warehouse_id}")
        assumptions.append(f"Warehouse {inv.warehouse_id} daily demand assumed constant at {inv.daily_demand} units/day")

        # Business calculations
        available_qty = calculate_available_stock(inv.on_hand_qty, inv.reserved_qty)
        coverage_days = calculate_stock_coverage(available_qty, inv.daily_demand)

        delayed_eta = shp.current_eta_days
        baseline_eta = shp.baseline_eta_days

        projected_stockout = False
        shortage_qty = 0
        if coverage_days is not None and delayed_eta is not None:
            projected_stockout = coverage_days < delayed_eta
            if projected_stockout:
                shortage_qty = calculate_shortage_exposure(available_qty, inv.daily_demand, delayed_eta)

        total_shortage_units += shortage_qty
        if coverage_days is not None:
            if min_stockout_days is None or coverage_days < min_stockout_days:
                min_stockout_days = coverage_days

        # Identify production orders at risk
        all_orders = db.query(ProductionOrderRecord).all()
        order_ids, order_risks = evaluate_order_risks(
            component_id=comp_id,
            available_qty=available_qty,
            coverage_days=coverage_days,
            arrival_days=delayed_eta,
            orders=all_orders,
        )

        for oid in order_ids:
            if oid not in all_affected_order_ids:
                all_affected_order_ids.append(oid)
        all_affected_orders.extend(order_risks)

        comp_impact = ComponentImpact(
            component_id=comp_id,
            warehouse_id=inv.warehouse_id,
            on_hand_qty=inv.on_hand_qty,
            reserved_qty=inv.reserved_qty,
            available_qty=available_qty,
            daily_demand=inv.daily_demand,
            coverage_days=round(coverage_days, 1) if coverage_days is not None else None,
            delayed_shipment_eta_days=delayed_eta,
            baseline_eta_days=baseline_eta,
            shipment_id=shp.shipment_id,
            projected_stockout_before_eta=projected_stockout,
            shortage_qty=shortage_qty,
        )
        component_impacts.append(comp_impact)

    # Narrative summary
    if component_impacts:
        first_c = component_impacts[0]
        cov_text = f"{first_c.coverage_days} days" if first_c.coverage_days is not None else "indefinite"
        summary = (
            f"Component '{first_c.component_id}' usable stock ({first_c.available_qty} units) "
            f"provides {cov_text} of coverage. Delayed shipment ETA is {first_c.delayed_shipment_eta_days} days, "
            f"resulting in a projected shortfall of {total_shortage_units} units and placing "
            f"{len(all_affected_order_ids)} production order(s) at risk."
        )
    else:
        summary = "No component impacts could be computed from the provided disruption records."

    # Remove duplicates while preserving order
    dedup_evidence = list(dict.fromkeys(evidence_refs))
    dedup_assumptions = list(dict.fromkeys(assumptions))

    return ImpactAnalysis(
        incident_id=incident_id,
        component_impacts=component_impacts,
        affected_order_ids=all_affected_order_ids,
        affected_orders=all_affected_orders,
        estimated_stockout_in_days=min_stockout_days,
        projected_shortage_units=total_shortage_units,
        summary=summary,
        assumptions=dedup_assumptions,
        evidence_refs=dedup_evidence,
        warnings=warnings,
        data_provenance="synthetic_demo_database",
        computed_at=utc_now_iso(),
    )
