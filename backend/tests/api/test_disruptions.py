"""API tests for Disruption endpoints (Member 2 domain)."""
from fastapi.testclient import TestClient
from app.main import app
from app.seed.seed_demo import reset_demo_database

client = TestClient(app)


def setup_function():
    reset_demo_database()


def test_create_disruption_endpoint_success():
    """Verify POST /api/disruptions creates an incident and returns 201 Created."""
    response = client.post(
        "/api/disruptions",
        json={
            "event_type": "shipping_delay",
            "title": "Critical component shipment delayed",
            "description": "SHP-102 revised ETA is 12 days from now.",
            "severity": "high",
            "source_type": "demo",
            "source_name": "demo_seed.json",
            "confidence": 1.0,
            "affected_shipment_ids": ["SHP-102"],
            "evidence": ["ETA changed to +12 days in the scenario fixture"],
        },
    )
    assert response.status_code == 201
    data = response.json()
    assert "incident_id" in data
    assert "event_id" in data
    assert data["status"] == "DETECTED"
    assert "created_at" in data


def test_create_disruption_validation_error():
    """Verify POST /api/disruptions with missing required fields or invalid values returns 422."""
    # Blank title
    resp1 = client.post(
        "/api/disruptions",
        json={
            "title": "   ",
            "description": "Some description",
        },
    )
    assert resp1.status_code == 422
    err1 = resp1.json()
    assert "error" in err1
    assert err1["error"]["code"] == "VALIDATION_ERROR"

    # Out-of-bounds confidence (> 1.0)
    resp2 = client.post(
        "/api/disruptions",
        json={
            "title": "Valid title",
            "description": "Valid description",
            "confidence": 2.5,
        },
    )
    assert resp2.status_code == 422
    err2 = resp2.json()
    assert "error" in err2
    assert err2["error"]["code"] == "VALIDATION_ERROR"


def test_list_disruptions_endpoint():
    """Verify GET /api/disruptions returns items list and total count."""
    response = client.get("/api/disruptions")
    assert response.status_code == 200
    data = response.json()
    assert "items" in data
    assert "total" in data
    assert isinstance(data["items"], list)
    assert data["total"] >= 1


def test_list_disruptions_severity_filter():
    """Verify GET /api/disruptions?severity=high filters by severity."""
    response = client.get("/api/disruptions?severity=high")
    assert response.status_code == 200
    data = response.json()
    for item in data["items"]:
        assert item["severity"] == "high"
