"""Member 4 approval, policy enforcement, and idempotency controls."""
from fastapi.testclient import TestClient

from app.db.session import SessionLocal
from app.main import app
from app.models.scenario import ScenarioRecord
from app.models.supply_chain import SupplierRecord
from app.seed.seed_demo import reset_demo_database


client = TestClient(app)


def select_alternate_supplier():
    reset_demo_database()
    analysis = client.post("/api/incidents/INC-001/analyze")
    assert analysis.status_code == 200
    response = client.post(
        "/api/incidents/INC-001/select-scenario",
        json={"scenario_id": "SCN-ALT-SUPPLIER"},
    )
    assert response.status_code == 200
    return response.json()["approval_id"]


def test_rejected_approval_never_executes():
    approval_id = select_alternate_supplier()

    decision = client.post(
        f"/api/approvals/{approval_id}/decision",
        json={"decision": "reject", "reviewed_by": "reviewer-1"},
    )
    assert decision.status_code == 200
    assert decision.json()["status"] == "rejected"

    attempt = client.post(
        "/api/actions/SCN-ALT-SUPPLIER/execute",
        headers={"Idempotency-Key": "rejected-action"},
        json={"incident_id": "INC-001", "approval_id": approval_id},
    )
    assert attempt.status_code == 409
    assert attempt.json()["error"]["code"] == "APPROVAL_NOT_GRANTED"
    assert client.get("/api/incidents/INC-001").json()["status"] == "OPTIONS_READY"


def test_supplier_becoming_unapproved_invalidates_pending_approval():
    approval_id = select_alternate_supplier()
    db = SessionLocal()
    try:
        supplier = db.query(SupplierRecord).filter(SupplierRecord.supplier_id == "SUP-B").one()
        supplier.approved = False
        db.commit()
    finally:
        db.close()

    decision = client.post(
        f"/api/approvals/{approval_id}/decision",
        json={"decision": "approve", "reviewed_by": "reviewer-1"},
    )
    assert decision.status_code == 409
    assert decision.json()["error"]["code"] == "ACTION_BLOCKED"

    execution = client.post(
        "/api/actions/SCN-ALT-SUPPLIER/execute",
        headers={"Idempotency-Key": "blocked-action"},
        json={"incident_id": "INC-001", "approval_id": approval_id},
    )
    assert execution.status_code == 409
    assert execution.json()["error"]["code"] == "ACTION_BLOCKED"
    assert client.get("/api/incidents/INC-001").json()["status"] == "AWAITING_APPROVAL"


def test_plan_version_change_invalidates_approval_and_execution():
    approval_id = select_alternate_supplier()
    decision = client.post(
        f"/api/approvals/{approval_id}/decision",
        json={"decision": "approve", "reviewed_by": "reviewer-1"},
    )
    assert decision.status_code == 200

    db = SessionLocal()
    try:
        scenario = db.query(ScenarioRecord).filter(ScenarioRecord.scenario_id == "SCN-ALT-SUPPLIER").one()
        scenario.plan_version = "v2"
        db.commit()
    finally:
        db.close()

    execution = client.post(
        "/api/actions/SCN-ALT-SUPPLIER/execute",
        headers={"Idempotency-Key": "stale-plan-action"},
        json={"incident_id": "INC-001", "approval_id": approval_id},
    )
    assert execution.status_code == 409
    assert execution.json()["error"]["code"] == "STALE_PLAN_VERSION"
    assert client.get("/api/incidents/INC-001").json()["status"] == "READY_TO_EXECUTE"


def test_execute_requires_idempotency_key():
    select_alternate_supplier()
    response = client.post(
        "/api/actions/SCN-ALT-SUPPLIER/execute",
        json={"incident_id": "INC-001"},
    )
    assert response.status_code == 422


def test_partial_transfer_verifies_with_residual_shortage_recorded():
    reset_demo_database()
    assert client.post("/api/incidents/INC-001/analyze").status_code == 200
    selection = client.post(
        "/api/incidents/INC-001/select-scenario",
        json={"scenario_id": "SCN-TRANSFER"},
    )
    assert selection.status_code == 200
    approval_id = selection.json()["approval_id"]
    assert client.post(
        f"/api/approvals/{approval_id}/decision",
        json={"decision": "approve", "reviewed_by": "reviewer-1"},
    ).status_code == 200

    execution = client.post(
        "/api/actions/SCN-TRANSFER/execute",
        headers={"Idempotency-Key": "transfer-action"},
        json={"incident_id": "INC-001", "approval_id": approval_id},
    )
    assert execution.status_code == 200
    assert execution.json()["execution_mode"] == "simulation"
    assert client.get("/api/incidents/INC-001").json()["status"] == "VERIFIED"

    events = client.get("/api/incidents/INC-001/audit").json()["items"]
    verification = next(item for item in events if item["event_type"] == "OUTCOME_VERIFIED")
    assert verification["after_state"] == {
        "verified": True,
        "residual_unmet": 400,
        "baseline_shortage_units": 700,
    }
