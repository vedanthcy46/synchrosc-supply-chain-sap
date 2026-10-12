# 06 — Safety, Compliance, and Human Governance

## Fundamental rule

This is a hackathon prototype with **simulated execution only**. The backend must not place a real purchase order, book a carrier, change a supplier master, or write to a live SAP tenant.

## Policy dispositions

Use exactly three machine-readable dispositions:

- `AUTO_ALLOWED`: passes all hard constraints and falls within the configured autonomy limits.
- `APPROVAL_REQUIRED`: otherwise feasible, but at least one soft risk/threshold needs an authorised human decision.
- `BLOCKED`: violates a hard rule; human approval alone cannot authorise it.

## Suggested MVP rules

1. Any supplier with `approved=false` → `BLOCKED` (`SUPPLIER_NOT_APPROVED`).
2. Supplier risk status `blocked` → `BLOCKED` (`SUPPLIER_RISK_BLOCKED`).
3. Unknown risk status for a restricted/critical action → `BLOCKED` or `APPROVAL_REQUIRED` according to an explicit team policy; for the demo, choose `BLOCKED` so unknown is never silently treated as clear.
4. Incremental cost above `AUTO_APPROVAL_LIMIT_INR=50000` → `APPROVAL_REQUIRED` (`COST_ABOVE_AUTO_APPROVAL_LIMIT`).
5. High/critical disruption severity or transport route marked elevated risk → `APPROVAL_REQUIRED` (`ELEVATED_OPERATIONAL_RISK`).
6. Insufficient capacity, impossible arrival, missing component data, or invalid quantity → `BLOCKED` (`PLAN_INFEASIBLE`).
7. Approval is bound to exact `scenario_id` and `plan_version`; any change invalidates it.
8. Only the backend may transition to `EXECUTING`. UI controls are not security controls.
9. Every approval, rejection, policy evaluation, execution attempt, successful action, failure, and verification outcome creates an audit event.

## Audit event minimum fields

- `audit_id`, `incident_id`, `correlation_id`, `created_at`.
- Actor type and actor identifier.
- Event/action type and referenced entity.
- Before and after states where relevant.
- Evidence refs, reason codes, policy disposition, approval ID.
- Success/failure status and failure reason if any.

Use append-only application behaviour: don't expose update/delete audit endpoints. A database administrator could still change a local SQLite file; do not call this cryptographically immutable or tamper-proof. A production system would need stronger storage and access controls.

## Human approval UI

The approval screen must display:
- what action is proposed and which shipment/component/order it affects;
- cost and cost threshold;
- alternative options and residual risk;
- policy checks and reason codes;
- event/source evidence and assumptions;
- selected scenario and plan version;
- Approve and Reject actions with required decision comments if your policy asks for them.

Disable or handle expired/stale approvals. A stale approval must not be accepted based solely on a hidden browser value.

## LLM boundaries

Allowed: summarise alert evidence, classify unstructured text into a proposed schema, draft human-readable explanation, extract candidate entities with source references.

Not allowed to decide alone: cost arithmetic, inventory math, capacity constraints, supplier approval, compliance disposition, policy override, final authorisation, or execution success.

Validate model output with Pydantic, preserve evidence, handle malformed/low-confidence output, and provide a deterministic demo fallback. Treat external text and supplier documents as untrusted content (prompt injection risk).

## Secrets and privacy

- `.env` is local only and git-ignored; commit `.env.example` with names and safe placeholders.
- Do not paste secrets into source code, issue text, demo screenshots, or audit records.
- Store only demo operator names and synthetic business data for the hackathon.
- Log correlation IDs and controlled metadata, not keys or sensitive payloads.
