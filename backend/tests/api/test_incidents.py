"""API tests for incident workflow endpoints."""
from fastapi.testclient import TestClient
from app.main import app
from app.seed.seed_demo import reset_demo_database

client = TestClient(app)


def setup_function():
    reset_demo_database()


def test_unknown_incident_returns_404():
    """Verify unknown incident ID returns 404 with structured error envelope."""
    response = client.get("/api/incidents/UNKNOWN-999")
    assert response.status_code == 404
    data = response.json()
    assert "error" in data
    assert data["error"]["code"] == "NOT_FOUND"
    assert "correlation_id" in data["error"]


def test_incident_details_and_refresh():
    """Verify an incident is retrievable by ID and maintains state across fetches."""
    response = client.get("/api/incidents/INC-001")
    assert response.status_code == 200
    data = response.json()
    assert data["incident_id"] == "INC-001"
    assert data["status"] == "DETECTED"


def test_analyze_incident_moves_to_options_ready():
    """Verify POST /api/incidents/{id}/analyze executes pipeline and returns options."""
    response = client.post("/api/incidents/INC-001/analyze")
    assert response.status_code == 200
    data = response.json()
    assert data["incident_id"] == "INC-001"
    assert data["status"] == "OPTIONS_READY"
    assert "impact" in data
    assert data["impact"]["coverage_days"] == 5.0
    assert data["impact"]["delayed_shipment_eta_days"] == 12
    assert len(data["scenarios"]) >= 3


def test_select_scenario_creates_approval():
    """Verify selecting a scenario exceeding auto-approval limit transitions to AWAITING_APPROVAL."""
    # Run analysis first
    client.post("/api/incidents/INC-001/analyze")

    # Select SCN-ALT-SUPPLIER (cost ₹64,000 > ₹50,000 threshold)
    response = client.post(
        "/api/incidents/INC-001/select-scenario",
        json={"scenario_id": "SCN-ALT-SUPPLIER"},
    )
    assert response.status_code == 200
    data = response.json()
    assert data["workflow_status"] == "AWAITING_APPROVAL"
    assert data["approval_id"] is not None
    assert "COST_ABOVE_AUTO_APPROVAL_LIMIT" in data["reason_codes"]

    # Verify incident state is persisted upon refresh
    refreshed = client.get("/api/incidents/INC-001").json()
    assert refreshed["status"] == "AWAITING_APPROVAL"
    assert refreshed["approval_id"] == data["approval_id"]
