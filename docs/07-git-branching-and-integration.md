# 07 — Git Branching and Team Integration Rules

## Repository strategy

Use a **single monorepo**. All members branch from the same `main` and work only in their owned paths. Shared contracts are agreed once before parallel work begins.

## Branch names

| Member | Branch | Main owned paths |
|---|---|---|
| Member 1 / Lead | `feat/orchestrator-api` | `backend/app/main.py`, `backend/app/orchestration/`, `backend/app/schemas/common.py`, `backend/app/api/router.py`, config/db setup, integration |
| Member 2 | `feat/disruption-impact` | `backend/app/agents/disruption_sensing.py`, `backend/app/services/impact_analysis.py`, `backend/app/schemas/disruption.py`, `backend/app/schemas/impact.py`, domain route module for disruptions/impact |
| Member 3 | `feat/scenario-planner` | `backend/app/agents/scenario_planning.py`, `backend/app/services/option_scoring.py`, `backend/app/schemas/scenario.py`, scenarios route module |
| Member 4 | `feat/policy-actions-audit` | `backend/app/services/policy_engine.py`, `execution_service.py`, `audit_service.py`, approval/action/audit schemas and route modules |
| Member 5 | `feat/frontend-control-tower` | `frontend/src/**`, UI tests and API client; coordinate shared API examples with lead |

Route modules should be separate files, so members do not conflict editing a single `routes.py`. Member 1 registers all routers during integration. If a file is outside your ownership path, open an issue or ask the owner before editing.

## Initial setup sequence

1. Member 1 creates the repository and commits this documentation kit plus the agreed base scaffold to `main`.
2. Team reviews names, data fields, status enums, routes, and demo assumptions in one short contract review.
3. Member 1 creates the initial schema modules and empty route/module stubs if needed; merges that PR first.
4. Everyone fetches the updated `main` and creates their branch from it.
5. Each contributor commits focused changes and pushes frequently.
6. Open PRs early as drafts; merge complete slices after tests pass.
7. Member 1 integrates in this order: schemas/app skeleton → Member 2 impact → Member 3 scenarios → Member 4 policy/action → Member 5 UI → end-to-end fixes.

## Pull request rules

- No direct push to `main`.
- PR title names the module, e.g. `feat(impact): calculate stockout exposure`.
- Include summary, files changed, test commands/results, and a screenshot for UI changes.
- No PR should silently change a shared contract. Update the contract docs and examples in the same PR.
- Require at least one teammate review; lead approves backend contract/state-machine changes.
- Keep PRs small enough to understand. Avoid combining unrelated formatting or refactoring.

## Daily integration rhythm

- Start: each member states target deliverable and blocking dependency.
- Midpoint: pull latest `main`, resolve interface differences early.
- End: push code, open/update draft PR, report tests run, update task status.
- Integrator runs the smoke scenario every time a module merges.

## Git commands

```bash
git clone <repository-url>
cd synchrosc
git checkout main
git pull origin main
git checkout -b feat/disruption-impact
# work and test
git add <owned-paths>
git commit -m "feat(impact): calculate inventory exposure"
git push -u origin feat/disruption-impact
```

Before raising a PR:

```bash
git fetch origin
git rebase origin/main
# rerun tests; resolve any conflicts
```

## Resolving contract changes

1. Contributor opens an issue with current shape, proposed shape, consumer impact, and sample payload.
2. Member 1 decides whether the change is necessary and version-compatible.
3. Update Pydantic schema, Markdown contract, and JSON fixture together.
4. Notify every consumer and rebase branches.
5. Add/adjust tests before merge.

## Avoid these integration failures

- Two branches create differently named fields for the same concept.
- Frontend invents an endpoint before it exists in the contract.
- Agent returns prose that another module tries to parse.
- Member 4 trusts a UI-supplied `approved=true` or `policy_status`.
- Member 1 merges everything only at the end.
- Secrets or personal credentials are committed.
