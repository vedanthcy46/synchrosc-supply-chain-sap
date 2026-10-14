"""Unit tests for Impact Analysis calculations and business rules (Member 2 domain)."""
import pytest
from app.services.impact_analysis import (
    calculate_available_stock,
    calculate_stock_coverage,
    calculate_shortage_exposure,
    evaluate_order_risks,
    analyze_impact,
)
from app.models.supply_chain import ProductionOrderRecord
from app.db.session import SessionLocal
from app.seed.seed_demo import reset_demo_database


def test_available_stock_calculation():
    """Verify available_qty = max(0, on_hand_qty - reserved_qty).

    Reserved stock must not be counted as available.
    """
    # Handbook scenario: 700 on hand, 200 reserved => 500 available
    assert calculate_available_stock(700, 200) == 500

    # Zero reserved
    assert calculate_available_stock(700, 0) == 700

    # Reserved equals on-hand
    assert calculate_available_stock(500, 500) == 0

    # Reserved exceeds on-hand (e.g. over-allocation) -> returns 0, never negative
    assert calculate_available_stock(200, 300) == 0


def test_stock_coverage_handbook_example():
    """Verify baseline coverage: 500 available / 100 daily demand returns 5.0 days."""
    coverage = calculate_stock_coverage(available_qty=500, daily_demand=100)
    assert coverage == 5.0


def test_zero_daily_demand_returns_null_and_no_divide_by_zero():
    """Verify that zero daily demand returns None (null) and does not crash."""
    coverage = calculate_stock_coverage(available_qty=500, daily_demand=0)
    assert coverage is None

    # Negative daily demand also returns None safely
    coverage_neg = calculate_stock_coverage(available_qty=500, daily_demand=-10)
    assert coverage_neg is None


def test_shortage_exposure_calculation():
    """Verify demand until arrival and shortage exposure calculation:

    demand_until_arrival = 100 * 12 = 1200 units.
    shortage = 1200 - 500 = 700 units.
    """
    shortage = calculate_shortage_exposure(available_qty=500, daily_demand=100, arrival_days=12)
    assert shortage == 700

    # When available stock exceeds demand until arrival, shortage is 0
    no_shortage = calculate_shortage_exposure(available_qty=1500, daily_demand=100, arrival_days=12)
    assert no_shortage == 0

    # Zero arrival days or zero demand returns 0
    assert calculate_shortage_exposure(available_qty=500, daily_demand=0, arrival_days=12) == 0
    assert calculate_shortage_exposure(available_qty=500, daily_demand=100, arrival_days=0) == 0


def test_production_orders_at_risk_identification():
    """Verify production orders requiring the component are identified as at risk

    when due before the shipment arrival.
    """
    orders = [
        ProductionOrderRecord(
            order_id="PO-5001",
            product_id="PRD-100",
            component_requirements=[{"component_id": "CMP-201", "quantity": 300}],
            priority="critical",
            due_in_days=6,
            status="planned",
        ),
        ProductionOrderRecord(
            order_id="PO-5002",
            product_id="PRD-220",
            component_requirements=[{"component_id": "CMP-201", "quantity": 250}],
            priority="high",
            due_in_days=8,
            status="planned",
        ),
        ProductionOrderRecord(
            order_id="PO-9999",
            product_id="PRD-999",
            component_requirements=[{"component_id": "CMP-OTHER", "quantity": 100}],
            priority="normal",
            due_in_days=5,
            status="planned",
        ),
        ProductionOrderRecord(
            order_id="PO-5004",
            product_id="PRD-400",
            component_requirements=[{"component_id": "CMP-201", "quantity": 100}],
            priority="normal",
            due_in_days=20,  # Due well after arrival (12 days)
            status="planned",
        ),
    ]

    order_ids, order_risks = evaluate_order_risks(
        component_id="CMP-201",
        available_qty=500,
        coverage_days=5.0,
        arrival_days=12,
        orders=orders,
    )

    # PO-5001 and PO-5002 are due before arrival (day 12) and at/after coverage (day 5)
    assert "PO-5001" in order_ids
    assert "PO-5002" in order_ids
    # PO-9999 uses CMP-OTHER, not CMP-201
    assert "PO-9999" not in order_ids
    # PO-5004 is due after arrival day 12, not at risk prior to arrival
    assert "PO-5004" not in order_ids


@pytest.mark.asyncio
async def test_analyze_impact_service_end_to_end():
    """Verify end-to-end impact analysis service using seed database."""
    reset_demo_database()
    db = SessionLocal()
    try:
        impact = await analyze_impact(incident_id="INC-001", db=db)

        assert impact.incident_id == "INC-001"
        assert len(impact.component_impacts) >= 1

        comp = impact.component_impacts[0]
        assert comp.component_id == "CMP-201"
        assert comp.available_qty == 500
        assert comp.daily_demand == 100
        assert comp.coverage_days == 5.0
        assert comp.delayed_shipment_eta_days == 12
        assert comp.projected_stockout_before_eta is True
        assert comp.shortage_qty == 700

        assert impact.projected_shortage_units == 700
        assert impact.estimated_stockout_in_days == 5.0
        assert "PO-5001" in impact.affected_order_ids
        assert "PO-5002" in impact.affected_order_ids
        assert "PO-5003" in impact.affected_order_ids

        # Traceability & Evidence
        assert "SHP-102" in impact.evidence_refs
        assert any("WH-A" in ev for ev in impact.evidence_refs)
        assert len(impact.assumptions) >= 2
    finally:
        db.close()


@pytest.mark.asyncio
async def test_deterministic_reproducibility():
    """Verify that repeating analyze_impact with identical input produces exact same values."""
    reset_demo_database()
    db = SessionLocal()
    try:
        run1 = await analyze_impact(incident_id="INC-001", db=db)
        run2 = await analyze_impact(incident_id="INC-001", db=db)

        assert run1.projected_shortage_units == run2.projected_shortage_units
        assert run1.estimated_stockout_in_days == run2.estimated_stockout_in_days
        assert run1.affected_order_ids == run2.affected_order_ids
        assert run1.component_impacts[0].available_qty == run2.component_impacts[0].available_qty
        assert run1.component_impacts[0].coverage_days == run2.component_impacts[0].coverage_days
    finally:
        db.close()
