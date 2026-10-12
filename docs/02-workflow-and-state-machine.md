# 02 — Workflow and State Machine

## Main states

| State | Meaning | Next permitted states |
|---|---|---|
| `DETECTED` | Event persisted and evidence attached | `ANALYZING`, `FAILED` |
| `ANALYZING` | Impact calculations are running | `OPTIONS_READY`, `FAILED` |
| `OPTIONS_READY` | Scenarios and policy assessments exist | `AWAITING_APPROVAL`, `READY_TO_EXECUTE`, `CLOSED` |
| `AWAITING_APPROVAL` | Selected option is awaiting a human decision | `READY_TO_EXECUTE`, `OPTIONS_READY`, `CLOSED` |
| `READY_TO_EXECUTE` | An option is permitted and selected | `EXECUTING` |
| `EXECUTING` | Simulated change is being applied | `VERIFYING`, `FAILED` |
| `VERIFYING` | Post-action state is being recalculated | `VERIFIED`, `FAILED` |
| `VERIFIED` | Outcome and audit record persisted | terminal |
| `CLOSED` | User abandoned/rejected incident | terminal, unless reopened explicitly |
| `FAILED` | Technical failure; no success may be displayed | retry only from a documented recoverable state |

## Transition rules

- A workflow status can only be changed by the backend orchestrator/service, never directly by the browser.
- An approval decision is scoped to one `approval_id`, one `incident_id`, and one exact `scenario_id`/plan version.
- If a scenario changes after approval, the old approval becomes invalid; approval must be requested for the new plan version.
- `REJECTED` means no execution. The user can select another option or close the incident.
- A `BLOCKED` option cannot be executed by an approval alone. The hard constraint must be corrected (e.g., supplier must be approved) and options regenerated.
- Duplicate execution calls must not apply the same inventory/order changes twice. Use an idempotency key and/or persisted execution status.
- A failed or timed-out operation must not be shown as verified. Provide a retry-safe error state.

## Suggested orchestration interface

```python
async def analyze_incident(incident_id: str) -> IncidentWorkflowResult:
    event = await event_repo.get_required(incident_id)
    impact = await impact_service.analyze(event)
    options = await planner.generate(event, impact)
    assessed = [policy_engine.assess(option, context) for option in options]
    return await workflow_service.persist_analysis(incident_id, impact, assessed)
```

Keep the orchestrator as a coordinator, not the place where every business calculation lives. Each service should expose typed input and output objects.

## Approval and execution flow

1. User selects an option.
2. Backend reloads the current incident and option from storage.
3. Policy is re-evaluated server-side against current stock, supplier approval, budget, and plan version.
4. `BLOCKED` → return `409` with reason codes; do not create executable approval.
5. `APPROVAL_REQUIRED` → create/reuse pending approval; do not execute.
6. `AUTO_ALLOWED` → mark ready to execute only if the user selected this option and demo configuration permits auto-action. For the presentation, manual confirmation is still acceptable.
7. Approved request → executor checks the approval is still valid, applies the simulated state mutation once, writes audit, verifies outcomes.

## Failure handling

- Validation error: `422`, no workflow created.
- Incident or scenario not found: `404`.
- Illegal state transition / stale approval / blocked action: `409`.
- Unexpected server failure: `500` with a correlation ID; log stack trace server-side, not sensitive details to the user.
- External provider unavailable: fall back to deterministic demo event if that is an explicitly enabled demo mode; display “demo fixture” provenance.
