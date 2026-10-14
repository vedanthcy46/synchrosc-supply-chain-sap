"""Unit tests for Member 3: option_scoring service and scenario planning agent.

All tests are deterministic and use synthetic demo fixtures only.
No live SAP, supplier services, or LLM required.
"""
import pytest
from app.services.option_scoring import (
    calc_usable_inventory,
    calc_coverage_days,
    calc_alt_supplier_premium,
    calc_shortage_exposure,
    calc_risk_score,
    rank_scenarios,
    generate_scenarios,
    _build_alt_supplier,
    _build_expedite,
    _build_wh_transfer,
    _build_wait_baseline,
)
from app.schemas.impact import ImpactAnalysis, ComponentImpact
from app.schemas.common import PolicyDisposition


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _make_impact(available_qty: int = 500, daily_demand: int = 100) -> ImpactAnalysis:
    return ImpactAnalysis(
        incident_id="INC-TEST",
        component_impacts=[
            ComponentImpact(
                component_id="CMP-201",
                available_qty=available_qty,
                daily_demand=daily_demand,
                coverage_days=available_qty / daily_demand if daily_demand > 0 else None,
                delayed_shipment_eta_days=12,
                projected_stockout_before_eta=True,
            )
        ],
        estimated_stockout_in_days=5.0,
        projected_shortage_units=700,
        assumptions=["demo fixture"],
        evidence_refs=["SHP-102"],
        computed_at="2024-01-01T00:00:00+00:00",
    )


# ---------------------------------------------------------------------------
# Inventory calculations
# ---------------------------------------------------------------------------

def test_usable_inventory_excludes_reserved():
    assert calc_usable_inventory(700, 200) == 500


def test_usable_inventory_never_negative():
    assert calc_usable_inventory(100, 200) == 0


def test_coverage_days_normal():
    assert calc_coverage_days(500, 100) == 5.0


def test_coverage_days_zero_demand_returns_none():
    result = calc_coverage_days(500, 0)
    assert result is None


def test_coverage_days_zero_demand_does_not_crash():
    # Must not raise ZeroDivisionError
    calc_coverage_days(0, 0)


# ---------------------------------------------------------------------------
# Cost calculations
# ---------------------------------------------------------------------------

def test_alt_supplier_premium_is_64000():
    assert calc_alt_supplier_premium(800, 1080, 1000) == 64_000.0


def test_expedite_cost_constant():
    from app.services.option_scoring import _EXPEDITE_COST_INR
    assert _EXPEDITE_COST_INR == 90_000.0


def test_transfer_cost_constant():
    from app.services.option_scoring import _WH_B_TRANSFER_COST_INR
    assert _WH_B_TRANSFER_COST_INR == 12_000.0


def test_alt_supplier_premium_non_negative_for_cheaper_supplier():
    # If alternate is cheaper, premium should be 0 (not negative)
    assert calc_alt_supplier_premium(800, 900, 1000) == 0.0


# ---------------------------------------------------------------------------
# Shortage exposure
# ---------------------------------------------------------------------------

def test_shortage_exposure_arrival_not_counted_before_eta():
    """800 units arriving on day 4 must not reduce shortage on days 1-3."""
    # 500 usable, 100/day demand, 800 arrive day 4, horizon 12
    # Days 1-3: consume 100/day from 500 → 200 consumed, 300 left after day 3
    # Day 4: +800 → 1100, consume 100 → 1000 left
    # Days 5-12: consume 100/day → no shortage
    unmet = calc_shortage_exposure(500, 100, 800, 4, 12)
    assert unmet == 0  # full coverage once arrival applied


def test_shortage_exposure_wait_scenario_has_unmet_demand():
    """Waiting 12 days with 5-day coverage means 7 days × 100 = 700 unmet units."""
    # 500 usable, 100/day, 800 arrive day 12, horizon 12
    # Days 1-5: consume 100/day → stock exhausted after day 5
    # Days 6-11: 0 stock, 100 unmet each day = 600 unmet
    # Day 12: +800 arrive, consume 100 → no unmet on day 12
    unmet = calc_shortage_exposure(500, 100, 800, 12, 12)
    assert unmet == 600


def test_shortage_exposure_partial_transfer():
    """300-unit transfer on day 2 with 500 usable: residual shortage exists."""
    # Day 1: consume 100 from 500 → 400 left, 0 unmet
    # Day 2: +300 → 700, consume 100 → 600 left, 0 unmet
    # Days 3-8: consume 100/day → exhausted after day 8 (600/100=6 more days)
    # Days 9-12: 0 stock, 100 unmet each = 400 unmet
    unmet = calc_shortage_exposure(500, 100, 300, 2, 12)
    assert unmet == 400


def test_shortage_exposure_zero_demand_returns_zero():
    assert calc_shortage_exposure(500, 0, 800, 4, 12) == 0


def test_shortage_exposure_quantities_non_negative():
    # Should not produce negative unmet
    result = calc_shortage_exposure(10_000, 100, 0, 4, 12)
    assert result >= 0


# ---------------------------------------------------------------------------
# Scenario generation
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_generates_at_least_three_recovery_alternatives():
    impact = _make_impact()
    scenarios = await generate_scenarios("INC-TEST", impact)
    # Exclude the wait baseline
    actionable = [s for s in scenarios if s.scenario_id != "SCN-WAIT"]
    assert len(actionable) >= 3


@pytest.mark.asyncio
async def test_all_three_scenario_ids_present():
    impact = _make_impact()
    scenarios = await generate_scenarios("INC-TEST", impact)
    ids = {s.scenario_id for s in scenarios}
    assert "SCN-EXPEDITE" in ids
    assert "SCN-ALT-SUPPLIER" in ids
    assert "SCN-WH-TRANSFER" in ids


@pytest.mark.asyncio
async def test_wait_baseline_is_not_executable():
    impact = _make_impact()
    scenarios = await generate_scenarios("INC-TEST", impact)
    wait = next(s for s in scenarios if s.scenario_id == "SCN-WAIT")
    assert wait.feasible is False
    assert "BASELINE_COMPARISON_ONLY" in wait.reason_codes
    assert wait.policy_status == PolicyDisposition.BLOCKED


@pytest.mark.asyncio
async def test_transfer_scenario_shows_residual_shortage():
    impact = _make_impact()
    scenarios = await generate_scenarios("INC-TEST", impact)
    transfer = next(s for s in scenarios if s.scenario_id == "SCN-WH-TRANSFER")
    assert transfer.unmet_demand_units_before_recovery > 0
    assert "RESIDUAL_SHORTAGE_RISK" in transfer.reason_codes


@pytest.mark.asyncio
async def test_alt_supplier_incremental_cost_is_64000():
    impact = _make_impact()
    scenarios = await generate_scenarios("INC-TEST", impact)
    alt = next(s for s in scenarios if s.scenario_id == "SCN-ALT-SUPPLIER")
    assert alt.incremental_cost == 64_000.0


@pytest.mark.asyncio
async def test_expedite_incremental_cost_is_90000():
    impact = _make_impact()
    scenarios = await generate_scenarios("INC-TEST", impact)
    exp = next(s for s in scenarios if s.scenario_id == "SCN-EXPEDITE")
    assert exp.incremental_cost == 90_000.0


# ---------------------------------------------------------------------------
# Ranking
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_alt_supplier_ranks_ahead_of_expedite_default_objective():
    """Under default objective (no-stockout first, then lowest cost):
    SCN-ALT-SUPPLIER (₹64k) must rank above SCN-EXPEDITE (₹90k).
    Both arrive day 4 and both eliminate shortage.
    """
    impact = _make_impact()
    scenarios = await generate_scenarios("INC-TEST", impact)
    alt = next(s for s in scenarios if s.scenario_id == "SCN-ALT-SUPPLIER")
    exp = next(s for s in scenarios if s.scenario_id == "SCN-EXPEDITE")
    assert alt.rank < exp.rank


@pytest.mark.asyncio
async def test_wait_baseline_does_not_outrank_actionable_plans():
    impact = _make_impact()
    scenarios = await generate_scenarios("INC-TEST", impact)
    wait = next(s for s in scenarios if s.scenario_id == "SCN-WAIT")
    actionable = [s for s in scenarios if s.scenario_id != "SCN-WAIT" and s.feasible]
    for s in actionable:
        assert s.rank < wait.rank


@pytest.mark.asyncio
async def test_infeasible_scenarios_not_ranked_as_feasible():
    impact = _make_impact()
    scenarios = await generate_scenarios("INC-TEST", impact)
    feasible_ranked = [s for s in scenarios if s.feasible and s.scenario_id != "SCN-WAIT"]
    infeasible = [s for s in scenarios if not s.feasible]
    if feasible_ranked and infeasible:
        max_feasible_rank = max(s.rank for s in feasible_ranked)
        for inf in infeasible:
            assert inf.rank > max_feasible_rank


@pytest.mark.asyncio
async def test_ranking_is_deterministic():
    impact = _make_impact()
    result_a = await generate_scenarios("INC-TEST", impact)
    result_b = await generate_scenarios("INC-TEST", impact)
    ranks_a = [(s.scenario_id, s.rank) for s in result_a]
    ranks_b = [(s.scenario_id, s.rank) for s in result_b]
    assert ranks_a == ranks_b


@pytest.mark.asyncio
async def test_transfer_ranks_below_full_recovery_options():
    """Transfer is partial mitigation; it must rank below full-recovery options."""
    impact = _make_impact()
    scenarios = await generate_scenarios("INC-TEST", impact)
    transfer = next(s for s in scenarios if s.scenario_id == "SCN-WH-TRANSFER")
    alt = next(s for s in scenarios if s.scenario_id == "SCN-ALT-SUPPLIER")
    exp = next(s for s in scenarios if s.scenario_id == "SCN-EXPEDITE")
    assert transfer.rank > alt.rank
    assert transfer.rank > exp.rank


# ---------------------------------------------------------------------------
# Missing / unknown incident data
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_missing_component_impact_uses_fixture_defaults():
    """When impact has no component data, service must not fabricate scenarios
    with invented values — it falls back to documented demo fixture defaults."""
    impact = ImpactAnalysis(
        incident_id="INC-UNKNOWN",
        component_impacts=[],
        estimated_stockout_in_days=None,
        projected_shortage_units=0,
        assumptions=[],
        evidence_refs=[],
        computed_at="2024-01-01T00:00:00+00:00",
    )
    scenarios = await generate_scenarios("INC-UNKNOWN", impact)
    # Must still return at least 3 actionable scenarios using fixture defaults
    actionable = [s for s in scenarios if s.scenario_id != "SCN-WAIT"]
    assert len(actionable) >= 3
    # All must reference the correct incident
    for s in scenarios:
        assert s.incident_id == "INC-UNKNOWN"
