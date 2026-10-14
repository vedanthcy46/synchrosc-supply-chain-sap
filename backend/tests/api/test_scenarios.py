"""API tests for GET /api/incidents/{incident_id}/scenarios (Member 3 domain).

Uses TestClient with the full FastAPI app and the demo seed database.
No live SAP, external supplier services, or LLM required.
"""
from fastapi.testclient import TestClient
from app.main import app
from app.seed.seed_demo import reset_demo_database

client = TestClient(app)


def setup_function():
    reset_demo_database()


def test_unknown_incident_scenarios_returns_404():
    """Unknown incident ID must return 404 with standard error envelope."""
    response = client.get("/api/incidents/INC-DOES-NOT-EXIST/scenarios")
    assert response.status_code == 404
    data = response.json()
    assert "error" in data
    assert data["error"]["code"] == "NOT_FOUND"
    assert "correlation_id" in data["error"]


def test_scenarios_endpoint_returns_documented_structure():
    """After running analysis, GET /scenarios must return the documented response shape."""
    # Run analysis to populate scenarios
    analyze_resp = client.post("/api/incidents/INC-001/analyze")
    assert analyze_resp.status_code == 200

    response = client.get("/api/incidents/INC-001/scenarios")
    assert response.status_code == 200

    data = response.json()
    assert "incident_id" in data
    assert "status" in data
    assert "scenarios" in data
    assert data["incident_id"] == "INC-001"


def test_scenarios_endpoint_returns_at_least_three_scenarios():
    """After analysis, at least three recovery scenarios must be present."""
    client.post("/api/incidents/INC-001/analyze")
    response = client.get("/api/incidents/INC-001/scenarios")
    assert response.status_code == 200
    data = response.json()
    actionable = [s for s in data["scenarios"] if s["scenario_id"] != "SCN-WAIT"]
    assert len(actionable) >= 3


def test_scenarios_contain_required_fields():
    """Each scenario must include all documented contract fields."""
    client.post("/api/incidents/INC-001/analyze")
    response = client.get("/api/incidents/INC-001/scenarios")
    assert response.status_code == 200

    required_fields = {
        "scenario_id", "incident_id", "name", "strategy_type",
        "incremental_cost", "currency", "arrival_days",
        "unmet_demand_units_before_recovery", "feasible",
        "feasibility_reasons", "risk_score", "rank",
        "reasoning_summary", "policy_status", "reason_codes", "plan_version",
    }
    for scenario in response.json()["scenarios"]:
        for field in required_fields:
            assert field in scenario, f"Missing field '{field}' in scenario {scenario.get('scenario_id')}"


def test_alt_supplier_ranks_first_in_api_response():
    """SCN-ALT-SUPPLIER must have rank 1 (lowest cost full-recovery option)."""
    client.post("/api/incidents/INC-001/analyze")
    response = client.get("/api/incidents/INC-001/scenarios")
    assert response.status_code == 200

    scenarios = response.json()["scenarios"]
    alt = next((s for s in scenarios if s["scenario_id"] == "SCN-ALT-SUPPLIER"), None)
    assert alt is not None
    assert alt["rank"] == 1


def test_transfer_scenario_discloses_residual_shortage():
    """SCN-WH-TRANSFER must show unmet_demand_units_before_recovery > 0."""
    client.post("/api/incidents/INC-001/analyze")
    response = client.get("/api/incidents/INC-001/scenarios")
    assert response.status_code == 200

    scenarios = response.json()["scenarios"]
    transfer = next((s for s in scenarios if s["scenario_id"] == "SCN-WH-TRANSFER"), None)
    assert transfer is not None
    assert transfer["unmet_demand_units_before_recovery"] > 0


def test_wait_baseline_is_not_ranked_first():
    """SCN-WAIT must not be ranked as the top recommended action."""
    client.post("/api/incidents/INC-001/analyze")
    response = client.get("/api/incidents/INC-001/scenarios")
    assert response.status_code == 200

    scenarios = response.json()["scenarios"]
    if scenarios:
        top = min(scenarios, key=lambda s: s["rank"])
        assert top["scenario_id"] != "SCN-WAIT"


def test_currency_is_inr():
    """All scenarios must use INR as the currency."""
    client.post("/api/incidents/INC-001/analyze")
    response = client.get("/api/incidents/INC-001/scenarios")
    assert response.status_code == 200
    for scenario in response.json()["scenarios"]:
        assert scenario["currency"] == "INR"
