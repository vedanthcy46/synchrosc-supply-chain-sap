# 08 — Test Plan and Acceptance Criteria

## Required test layers

### Unit tests
- Stock coverage: 500 available / 100 daily demand returns 5 days.
- Zero daily demand produces `null` coverage and no divide-by-zero error.
- Reserved inventory is not counted as available.
- Cost calculations match input components and currency.
- Unapproved/blocked supplier yields `BLOCKED`.
- Cost over threshold yields `APPROVAL_REQUIRED`.
- Transfer option flags residual shortage where it cannot bridge the delay.
- Ranking explains why the first option wins.

### API tests
- Event creation validates required fields.
- Unknown incident/scenario/approval returns `404`.
- Invalid body returns `422` with the common error envelope.
- Analyse endpoint returns impact and at least three scenarios.
- Approval decision rejects non-pending and stale requests.
- Execute endpoint refuses unapproved and blocked actions with `409`.
- Two execute requests using the same idempotency key do not mutate state twice.
- Audit endpoint returns policy checks, approvals, action result, and verification events.

### Integration test: golden path
1. Seed demo data.
2. Create `shipping_delay` event affecting `SHP-102`.
3. Run analysis.
4. Assert component coverage is 5 days and ETA is 12 days.
5. Assert 3+ recovery options exist with cost, lead time, feasibility, and policy disposition.
6. Select alternate supplier scenario.
7. Assert a pending approval is created (demo incremental cost ₹64,000 exceeds ₹50,000 limit).
8. Attempt execution before approval; assert rejection and no state mutation.
9. Approve the exact scenario plan version.
10. Execute the simulated action.
11. Verify stock/supply timeline outcome and append-only audit records.
12. Replay execution with same key; assert no duplicate purchase/inventory adjustment.

### UI acceptance
- User sees a visible demo-data banner or provenance label.
- Loading and failure states are handled.
- A clear alert identifies the disruption.
- Impact evidence and assumptions are visible.
- At least three options can be compared without hiding cost or residual risk.
- Approval controls show status and prevent misleading success states.
- Audit timeline can be opened from the incident.
- Refresh does not erase a persisted incident or approval.

## Demo acceptance script

A new judge should be able to complete the golden path in under five minutes without using Swagger or editing the database manually. Use a seeded-reset button/script to ensure repeatability.

## Regression checklist before merge/release

- [ ] Backend unit tests pass.
- [ ] Backend API/integration tests pass.
- [ ] Frontend lint/build passes.
- [ ] Golden-path run passes from a clean seed.
- [ ] Blocked action cannot execute.
- [ ] Rejected approval does not execute.
- [ ] Duplicate execution is idempotent.
- [ ] Costs and inventory values in UI match API response.
- [ ] No secret or live credential in repository.
- [ ] Hosted demo and local fallback both work.
