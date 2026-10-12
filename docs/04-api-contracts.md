# 04 — HTTP API Contracts

Base path: `/api`. JSON request and response bodies. All error responses use the shared error envelope below. The backend is the authority for state transitions.

## Common error shape

```json
{
  "error": {
    "code": "ACTION_BLOCKED",
    "message": "This scenario cannot be executed because the supplier is not approved.",
    "details": {"reason_codes": ["SUPPLIER_NOT_APPROVED"]},
    "correlation_id": "corr-uuid"
  }
}
```

## Routes

| Method | Route | Owner | Purpose |
|---|---|---|---|
| `GET` | `/api/health` | Member 1 | Readiness/health check |
| `GET` | `/api/dashboard/summary` | Member 1 + Member 5 | KPI counts and high-level statuses |
| `GET` | `/api/disruptions` | Member 2 | List events/incidents |
| `POST` | `/api/disruptions` | Member 2 + Member 1 | Validate and persist event, create incident |
| `GET` | `/api/incidents/{incident_id}` | Member 1 | Incident details + workflow status |
| `POST` | `/api/incidents/{incident_id}/analyze` | Member 1 | Run impact, scenario generation and policy assessment |
| `GET` | `/api/incidents/{incident_id}/impact` | Member 2 | Impact report |
| `GET` | `/api/incidents/{incident_id}/scenarios` | Member 3 | Ranked options |
| `POST` | `/api/incidents/{incident_id}/select-scenario` | Member 1 | Select scenario; returns execution/approval disposition |
| `GET` | `/api/approvals` | Member 4 | Pending/recent approvals |
| `POST` | `/api/approvals/{approval_id}/decision` | Member 4 | Approve or reject exact plan version |
| `POST` | `/api/actions/{scenario_id}/execute` | Member 4 | Execute an authorised simulated action |
| `GET` | `/api/incidents/{incident_id}/audit` | Member 4 | Read the incident's audit timeline |

## Request examples

### Create event
`POST /api/disruptions`

```json
{
  "event_type": "shipping_delay",
  "title": "Critical component shipment delayed",
  "description": "SHP-102 revised ETA is 12 days from now.",
  "severity": "high",
  "source_type": "demo",
  "source_name": "demo_seed.json",
  "confidence": 1.0,
  "affected_shipment_ids": ["SHP-102"],
  "evidence": ["ETA changed to +12 days in the scenario fixture"]
}
```

Expected response: `201 Created`

```json
{
  "incident_id": "INC-001",
  "event_id": "EVT-001",
  "status": "DETECTED",
  "created_at": "2026-10-12T10:30:00Z"
}
```

### Run analysis
`POST /api/incidents/INC-001/analyze`

Expected response should include `incident_id`, `status`, `impact_summary`, `scenario_count`, and `scenario_ids`. Use `202 Accepted` only if work continues asynchronously; otherwise `200 OK` is simpler for the hackathon demo.

### Scenario response shape

```json
{
  "incident_id": "INC-001",
  "status": "OPTIONS_READY",
  "impact": {
    "component_id": "CMP-201",
    "available_qty": 500,
    "daily_demand": 100,
    "coverage_days": 5,
    "delayed_shipment_eta_days": 12,
    "projected_stockout_before_eta": true
  },
  "scenarios": [
    {
      "scenario_id": "SCN-ALT-SUPPLIER",
      "name": "Order from approved alternate supplier",
      "incremental_cost": 64000,
      "currency": "INR",
      "arrival_days": 4,
      "estimated_production_delay_days": 0,
      "feasible": true,
      "policy_status": "APPROVAL_REQUIRED",
      "reason_codes": ["COST_ABOVE_AUTO_APPROVAL_LIMIT"]
    }
  ]
}
```

### Approval decision
`POST /api/approvals/APR-001/decision`

```json
{
  "decision": "approve",
  "decision_comment": "Approved for this incident and plan version.",
  "reviewed_by": "demo-operator"
}
```

Only `approve` and `reject` are valid decisions. The server must confirm the approval is still pending and refers to the latest version of the selected scenario. A rejection never executes an action.

### Execute action
`POST /api/actions/SCN-ALT-SUPPLIER/execute`

Header: `Idempotency-Key: <unique-client-generated-value>`

Request body: `{ "incident_id": "INC-001", "approval_id": "APR-001" }` for an approval-required action; omit `approval_id` only if current policy status is `AUTO_ALLOWED`.

The endpoint rechecks policy and approval state on the server. Return `409` for stale, blocked, rejected, or not-yet-approved plans. Successful simulated execution returns action ID, execution status, updated resource IDs, and audit ID.

## HTTP status conventions

- `200` read/update succeeded.
- `201` new event/approval created.
- `202` accepted but still running.
- `400` malformed request semantics.
- `404` object does not exist.
- `409` invalid workflow state, stale approval, blocked action, or duplicate conflicting execution.
- `422` schema/field validation failed.
- `500` unexpected internal error; surface a correlation ID, not a stack trace.

## Contract rules

- All list responses include `items` and optionally `next_cursor`; do not make frontend parsing depend on one undocumented shape.
- Every response with a decision includes `reason_codes` and `evidence_refs` where relevant.
- Never trust frontend-computed cost, policy status, approver identity, or execution status. Recompute and validate on the backend.
