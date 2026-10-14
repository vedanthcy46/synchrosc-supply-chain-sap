"""API tests for Impact endpoints (Member 2 domain)."""
from fastapi.testclient import TestClient
from app.main import app
from app.seed.seed_demo import reset_demo_database

client = TestClient(app)


def setup_function():
    reset_demo_database()


def test_get_incident_impact_success():
    """Verify GET /api/incidents/{incident_id}/impact returns ImpactAnalysis matching schema."""
    response = client.get("/api/incidents/INC-001/impact")
    assert response.status_code == 200
    data = response.json()

    assert data["incident_id"] == "INC-001"
    assert "component_impacts" in data
    assert len(data["component_impacts"]) >= 1

    comp = data["component_impacts"][0]
    assert comp["component_id"] == "CMP-201"
    assert comp["available_qty"] == 500
    assert comp["daily_demand"] == 100
    assert comp["coverage_days"] == 5.0
    assert comp["delayed_shipment_eta_days"] == 12
    assert comp["projected_stockout_before_eta"] is True
    assert comp["shortage_qty"] == 700

    assert data["projected_shortage_units"] == 700
    assert data["estimated_stockout_in_days"] == 5.0
    assert len(data["affected_order_ids"]) >= 3
    assert "SHP-102" in data["evidence_refs"]
    assert len(data["assumptions"]) >= 2
    assert "computed_at" in data


def test_get_incident_impact_unknown_returns_404():
    """Verify GET /api/incidents/{unknown_id}/impact returns 404 with standard error envelope."""
    response = client.get("/api/incidents/INC-NONEXISTENT/impact")
    assert response.status_code == 404
    err_body = response.json()
    assert "error" in err_body
    assert err_body["error"]["code"] == "NOT_FOUND"
    assert "correlation_id" in err_body["error"]


def test_get_incident_impact_recalculate():
    """Verify GET /api/incidents/{incident_id}/impact?recalculate=true triggers fresh calculation."""
    # First analyze incident through workflow so impact_summary is cached
    client.post("/api/incidents/INC-001/analyze")

    # Fetch with recalculate=true
    response = client.get("/api/incidents/INC-001/impact?recalculate=true")
    assert response.status_code == 200
    data = response.json()
    assert data["incident_id"] == "INC-001"
    assert data["projected_shortage_units"] == 700
