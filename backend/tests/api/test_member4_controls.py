"""Member 4 approval, policy enforcement, and idempotency controls."""
from fastapi.testclient import TestClient

from app.db.session import SessionLocal
from app.main import app
from app.models.scenario import ScenarioRecord
from app.models.supply_chain import InventoryRecord, SupplierRecord
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

    audit = client.get("/api/incidents/INC-001/audit").json()["items"]
    rejection = next(item for item in audit if item["event_type"] == "APPROVAL_REJECTED")
    assert rejection["actor_id"] == "reviewer-1"
    assert rejection["entity_id"] == approval_id
    assert any(item["event_type"] == "SCENARIO_SELECTED" for item in audit)

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


def test_action_arriving_after_plan_window_is_hard_blocked():
    reset_demo_database()
    assert client.post("/api/incidents/INC-001/analyze").status_code == 200

    db = SessionLocal()
    try:
        scenario = db.query(ScenarioRecord).filter(ScenarioRecord.scenario_id == "SCN-ALT-SUPPLIER").one()
        actions = [dict(action) for action in scenario.actions]
        actions[0]["eta_days"] = scenario.arrival_days + 1
        scenario.actions = actions
        db.commit()
    finally:
        db.close()

    selection = client.post(
        "/api/incidents/INC-001/select-scenario",
        json={"scenario_id": "SCN-ALT-SUPPLIER"},
    )
    assert selection.status_code == 409
    assert selection.json()["error"]["code"] == "ACTION_BLOCKED"
    assert "ACTION_TIMING_INFEASIBLE" in selection.json()["error"]["details"].get("reason_codes", [])


def test_partial_transfer_verifies_with_residual_shortage_recorded():
    reset_demo_database()
    assert client.post("/api/incidents/INC-001/analyze").status_code == 200
    selection = client.post(
        "/api/incidents/INC-001/select-scenario",
        json={"scenario_id": "SCN-TRANSFER"},
    )
    assert selection.status_code == 200
    assert selection.json()["workflow_status"] == "AWAITING_APPROVAL"
    assert "RESIDUAL_SHORTAGE_RISK" in selection.json()["reason_codes"]
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


def test_transfer_retry_does_not_apply_inventory_change_twice():
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

    def warehouse_quantities():
        db = SessionLocal()
        try:
            rows = db.query(InventoryRecord).filter(
                InventoryRecord.component_id == "CMP-201",
                InventoryRecord.warehouse_id.in_(["WH-A", "WH-B"]),
            ).all()
            return {row.warehouse_id: row.on_hand_qty for row in rows}
        finally:
            db.close()

    before = warehouse_quantities()
    headers = {"Idempotency-Key": "transfer-retry"}
    payload = {"incident_id": "INC-001", "approval_id": approval_id}
    first = client.post("/api/actions/SCN-TRANSFER/execute", headers=headers, json=payload)
    assert first.status_code == 200
    after_first = warehouse_quantities()
    assert after_first["WH-B"] == before["WH-B"] - 300
    assert after_first["WH-A"] == before["WH-A"] + 300

    replay = client.post("/api/actions/SCN-TRANSFER/execute", headers=headers, json=payload)
    assert replay.status_code == 200
    assert replay.json()["action_id"] == first.json()["action_id"]
    assert warehouse_quantities() == after_first

    second_key = client.post(
        "/api/actions/SCN-TRANSFER/execute",
        headers={"Idempotency-Key": "transfer-retry-different-key"},
        json=payload,
    )
    assert second_key.status_code == 409
    # Re-evaluation hard-blocks the second transfer because the first consumed
    # the available stock, and a distinct retry key still cannot mutate state.
    assert second_key.json()["error"]["code"] == "ACTION_BLOCKED"
    assert warehouse_quantities() == after_first
