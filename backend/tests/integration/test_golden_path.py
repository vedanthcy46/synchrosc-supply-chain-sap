"""Integration test covering the end-to-end Golden Path scenario (Section 08)."""
from fastapi.testclient import TestClient
from app.main import app
from app.seed.seed_demo import reset_demo_database

client = TestClient(app)


def test_end_to_end_golden_path():
    # 1. Seed demo data
    reset_demo_database()

    # 2. Verify or create shipping delay disruption
    create_evt_resp = client.post(
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
    assert create_evt_resp.status_code == 201
    evt_data = create_evt_resp.json()
    incident_id = evt_data["incident_id"]
    assert evt_data["status"] == "DETECTED"

    # 3. Run analysis
    analyze_resp = client.post(f"/api/incidents/{incident_id}/analyze")
    assert analyze_resp.status_code == 200
    analysis = analyze_resp.json()

    # 4. Assert component coverage is 5 days and ETA is 12 days
    impact = analysis["impact"]
    assert impact["coverage_days"] == 5.0
    assert impact["delayed_shipment_eta_days"] == 12
    assert impact["projected_stockout_before_eta"] is True

    # 5. Assert 3+ recovery options exist with cost, lead time, feasibility, and policy disposition
    scenarios = analysis["scenarios"]
    assert len(scenarios) >= 3
    scenario_ids = [s["scenario_id"] for s in scenarios]
    assert "SCN-ALT-SUPPLIER" in scenario_ids
    assert "SCN-EXPEDITE" in scenario_ids
    assert "SCN-TRANSFER" in scenario_ids

    # 6. Select alternate supplier scenario
    select_resp = client.post(
        f"/api/incidents/{incident_id}/select-scenario",
        json={"scenario_id": "SCN-ALT-SUPPLIER"},
    )
    assert select_resp.status_code == 200
    selection = select_resp.json()

    # 7. Assert a pending approval is created (demo incremental cost ₹64,000 exceeds ₹50,000 limit)
    assert selection["workflow_status"] == "AWAITING_APPROVAL"
    approval_id = selection["approval_id"]
    assert approval_id is not None
    assert "COST_ABOVE_AUTO_APPROVAL_LIMIT" in selection["reason_codes"]

    # 8. Attempt execution before approval; assert rejection (409) and no state mutation
    pre_exec_resp = client.post(
        "/api/actions/SCN-ALT-SUPPLIER/execute",
        headers={"Idempotency-Key": "test-key-001"},
        json={"incident_id": incident_id, "approval_id": approval_id},
    )
    assert pre_exec_resp.status_code == 409
    err = pre_exec_resp.json()["error"]
    assert err["code"] == "APPROVAL_NOT_GRANTED"

    # Verify incident remains in AWAITING_APPROVAL
    inc_status_check = client.get(f"/api/incidents/{incident_id}").json()
    assert inc_status_check["status"] == "AWAITING_APPROVAL"

    # 9. Approve the exact scenario plan version
    decision_resp = client.post(
        f"/api/approvals/{approval_id}/decision",
        json={
            "decision": "approve",
            "decision_comment": "Approved for this incident and plan version.",
            "reviewed_by": "demo-operator",
        },
    )
    assert decision_resp.status_code == 200
    decision_data = decision_resp.json()
    assert decision_data["status"] == "approved"

    # Incident status should now be READY_TO_EXECUTE
    inc_ready_check = client.get(f"/api/incidents/{incident_id}").json()
    assert inc_ready_check["status"] == "READY_TO_EXECUTE"

    # 10. Execute the simulated action
    exec_resp = client.post(
        "/api/actions/SCN-ALT-SUPPLIER/execute",
        headers={"Idempotency-Key": "test-key-001"},
        json={"incident_id": incident_id, "approval_id": approval_id},
    )
    assert exec_resp.status_code == 200
    exec_data = exec_resp.json()
    assert exec_data["execution_status"] == "completed"
    assert exec_data["execution_mode"] == "simulation"
    action_id = exec_data["action_id"]

    # 11. Verify stock/supply timeline outcome and append-only audit records
    audit_resp = client.get(f"/api/incidents/{incident_id}/audit")
    assert audit_resp.status_code == 200
    audit_data = audit_resp.json()
    assert len(audit_data["items"]) >= 4

    event_types = [item["event_type"] for item in audit_data["items"]]
    assert "WORKFLOW_ANALYZING_STARTED" in event_types
    assert "SCENARIO_SELECTED" in event_types
    assert "APPROVAL_APPROVED" in event_types
    assert "SIMULATED_ACTION_EXECUTED" in event_types

    # Incident should now be terminal VERIFIED state
    final_inc = client.get(f"/api/incidents/{incident_id}").json()
    assert final_inc["status"] == "VERIFIED"

    # 12. Replay execution with same key; assert idempotency (same result, no double application)
    replay_resp = client.post(
        "/api/actions/SCN-ALT-SUPPLIER/execute",
        headers={"Idempotency-Key": "test-key-001"},
        json={"incident_id": incident_id, "approval_id": approval_id},
    )
    assert replay_resp.status_code == 200
    replay_data = replay_resp.json()
    assert replay_data["action_id"] == action_id
    assert replay_data["audit_id"] == exec_data["audit_id"]
