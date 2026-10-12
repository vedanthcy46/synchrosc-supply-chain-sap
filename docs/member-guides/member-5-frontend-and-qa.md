# Member 5 — React Control Tower, API Integration, and QA

## Your mission

Deliver the judge-facing experience and make the complete workflow usable without Swagger or database edits. Build against the agreed API contracts, using mock fixtures if backend endpoints are still in progress, then switch to the API client without redesigning the UI.

## Owned paths

- `frontend/src/**`
- Frontend tests and `frontend/README.md`
- UI screenshots in PRs and test notes

Do not change backend response fields locally to make a component easier. If an API contract is unclear, ask Member 1 and update the shared contract before consuming a different shape.

## Required screens

1. **Control Tower:** disruption KPIs, recent incidents, create/simulate event, current status.
2. **Incident Details:** source evidence, component/shipment, stock availability, coverage, ETA, affected orders, assumptions.
3. **Recovery Options:** comparison table/cards for incremental cost, arrival days, production impact, feasibility, policy disposition, and rationale.
4. **Approval Queue/Detail:** what action is requested, policy reason, plan version, Approve/Reject form, stale/pending feedback.
5. **Audit Timeline:** detection → analysis → recommendation → policy → approval → simulated execution → verification.

## Visual direction

Use an enterprise product style: clean white/light neutral surfaces, navy/blue primary actions, teal for recovered/verified, amber for approval/warning, red only for critical/blocking states. Avoid luxury gold, overdone gradients, excessive glass cards, or decorative animation that competes with operational information. Optimise hierarchy and readable tables.

## API client and states

- Centralise HTTP requests in `src/api/client.ts`.
- Define shared response types in `src/types/api.ts` matching the contract docs.
- Do not hardcode `localhost` inside individual components; use `VITE_API_BASE_URL`.
- Implement loading, empty, error, retry, and success states.
- Show “Demo / simulated data” where relevant.
- Handle `409` approval/stale/block responses visibly and refetch backend state.
- Never optimistically show an action as completed before the server confirms it.

## Suggested feature structure

```text
frontend/src/
├── app/App.tsx
├── api/client.ts
├── types/api.ts
├── components/{StatusBadge,MetricCard,ErrorPanel,LoadingState}.tsx
├── features/dashboard/{DashboardPage,IncidentList}.tsx
├── features/incidents/{IncidentPage,ImpactSummary,EvidencePanel}.tsx
├── features/scenarios/{ScenarioComparison,ScenarioDetails}.tsx
├── features/approvals/{ApprovalQueue,ApprovalDetail}.tsx
└── features/audit/{AuditTimeline}.tsx
```

## Development sequence

1. Create wireframes and mock JSON using `contracts/` examples.
2. Build the route structure and typed API client.
3. Make dashboard/incident/scenario screens functional with mock data.
4. Connect real API endpoints as they merge; delete duplicate hardcoded business calculations.
5. Add approve/reject flow and refresh incident state after action.
6. Add audit timeline and responsive/error states.
7. Rehearse full golden path with the rest of the team.

## QA checklist

- Does every visible metric come from the backend or carry a clear “demo sample” label?
- Can a user identify why one option is recommended?
- Are cost units and currency shown consistently?
- Does a blocked option look different from one awaiting approval?
- Does rejection keep the action unexecuted?
- Can browser refresh reload the same incident and approval state?
- Are keyboard focus, labels, contrast, and mobile width acceptable?
- Is success shown only after verified API response?

## Done means

A judge can open the dashboard, trigger a disruption, understand impact, compare three plans, approve one, observe the simulated result, and inspect the audit trail. The demo runs without opening developer tools or using Swagger.
