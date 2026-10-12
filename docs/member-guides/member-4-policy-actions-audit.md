# Member 4 — Policy Gate, Human Approval, Simulated Execution, and Audit

## Your mission

Ensure the system cannot turn an attractive recommendation into an unsafe action. Enforce hard constraints, route thresholded actions to people, execute only authorised simulations, prevent duplicate state changes, and record the complete decision history.

## Owned paths

- `backend/app/services/policy_engine.py`
- `backend/app/services/execution_service.py`
- `backend/app/services/audit_service.py`
- `backend/app/services/verification_service.py`
- `backend/app/schemas/approval.py` and action/audit schema files
- `backend/app/api/routes/approvals.py`
- `backend/app/api/routes/actions.py`
- `backend/app/api/routes/audit.py`
- Unit/API tests for controls

Member 1 owns router registration and workflow-level wiring. Coordinate exact input types and state semantics with Members 1 and 3.

## Required policy dispositions

- `AUTO_ALLOWED`: all hard constraints pass and configured auto-action conditions pass.
- `APPROVAL_REQUIRED`: feasible, but cost/risk/criticality threshold requires authorised human review.
- `BLOCKED`: hard policy failure; approval alone cannot make the action legal.

## Minimum rules

- `approved=false` supplier => `BLOCKED`.
- supplier `risk_status=blocked` or `unknown` for the demo's restricted action => `BLOCKED`.
- capacity/quantity/timing impossible => `BLOCKED`.
- incremental recovery cost greater than ₹50,000 => `APPROVAL_REQUIRED`.
- event severity high/critical => `APPROVAL_REQUIRED` for the relevant corrective action.
- stale plan version or approval => reject execution.
- a rejected approval => no execution.
- client-provided policy state is ignored; reload from backend and re-evaluate.

## Approval API

`POST /api/approvals/{approval_id}/decision` accepts `approve` or `reject`, reviewer ID (demo value), and optional comment. The server verifies pending status, incident/scenario binding, and `plan_version`. Replaying the decision must not create duplicate action.

## Simulated executor

- Only this service applies the approved action to demo state.
- Require an idempotency key.
- Store the execution result before returning success.
- On repeat with same key, return the original result; don't subtract stock or create the alternate purchase a second time.
- Make it explicit in `ExecutionResult` that `execution_mode="simulation"`.
- Do not call live SAP, logistics, supplier, or payment endpoints.

## Audit log

Append records for event acceptance, impact completion, scenario/policy evaluation, option selection, approval request, approve/reject decision, execution attempt/result, and verification. Store actor, timestamps, reason codes, source evidence, scenario/plan version, before/after state, correlation ID. Expose read-only listing only.

## Verification

After simulated execution, calculate the expected arrival/inventory timeline again. Compare it to the baseline, indicate whether shortage exposure changed, and append a verification result. If verification fails, report `FAILED` — don't show green success.

## Required tests

- High-cost alternate supplier requires approval.
- Attempting execution before approval returns `409` and leaves state unchanged.
- Rejection prevents execution.
- Unapproved supplier remains blocked despite an attempted approval.
- Stale plan version cannot be executed.
- Duplicate idempotency key cannot double-apply an action.
- Audit captures all required states and has no update/delete endpoint.
- Execution result says simulation mode.

## Done means

The golden-path demo shows a genuine server-side policy decision and approval check. It must be impossible to execute a blocked/unapproved plan merely by altering the frontend request.
