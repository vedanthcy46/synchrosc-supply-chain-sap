"""API tests for /api/health and /api/dashboard/summary."""
from fastapi.testclient import TestClient
from app.main import app

client = TestClient(app)


def test_health_check_returns_ok():
    """Verify health endpoint returns ok and simulation mode."""
    response = client.get("/api/health")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "ok"
    assert data["execution_mode"] == "simulation"
    assert "database" in data
    assert response.headers.get("X-Correlation-ID") is not None


def test_dashboard_summary():
    """Verify dashboard summary endpoint returns KPI counts."""
    response = client.get("/api/dashboard/summary")
    assert response.status_code == 200
    data = response.json()
    assert "active_incidents_count" in data
    assert "pending_approvals_count" in data
    assert data["execution_mode"] == "simulation"
