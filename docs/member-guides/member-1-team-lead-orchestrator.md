# Member 1 — Team Lead, Backend Foundation, and Orchestrator

## Your mission

Own the end-to-end integration, not every feature. Establish a stable foundation, freeze shared contracts, coordinate branches, make the workflow run from one API entry point, and keep the team unblocked. Your definition of success is a complete vertical slice whose modules can be tested separately.

## First tasks before parallel coding

1. Create the GitHub monorepo and add this kit.
2. Review product scope, demo values, state names, and API contracts with all four members.
3. Create an initial PR for `backend/requirements.txt`, `.env.example`, `main.py`, config, DB session/base setup, shared `schemas/common.py`, router aggregator, health route, and empty route/service module placeholders.
4. Merge foundation before teammates branch from `main`.
5. Add CI checks: Python tests/lint and frontend build once package scaffolding exists.

## Owned paths

- `backend/app/main.py`
- `backend/app/core/config.py`
- `backend/app/api/router.py`
- `backend/app/api/routes/incidents.py` (workflow entry/read endpoints)
- `backend/app/schemas/common.py`
- `backend/app/db/session.py`
- `backend/app/orchestration/workflow.py`
- `backend/app/orchestration/state_machine.py`
- `backend/app/repositories/` conventions and shared base
- contract docs and `contracts/` review
- `README.md`, integration tests, router registrations and deployment coordination

Do not implement the other member's core logic inside the orchestrator. Call their service interfaces.

## Proposed module interfaces

```python
# Member 2
async def analyze_impact(incident_id: str) -> ImpactAnalysis: ...

# Member 3
async def generate_scenarios(incident_id: str, impact: ImpactAnalysis) -> list[RecoveryScenario]: ...

# Member 4
async def assess_scenario(scenario: RecoveryScenario, context: PolicyContext) -> PolicyAssessment: ...
async def create_approval_or_mark_ready(incident_id: str, scenario_id: str) -> SelectionResult: ...
async def execute_approved_scenario(scenario_id: str, approval_id: str | None, idempotency_key: str) -> ExecutionResult: ...
```

Names may be adjusted before implementation, but the team must settle on one typed interface. Don't have modules import from a route file; routes call services and the orchestrator calls services.

## Workflow responsibilities

- Own legal state transitions and persist each state.
- Create a correlation ID for each request/workflow.
- Create/retrieve an incident idempotently for the event ID if desired.
- Run impact, scenario planning, and policy assessment in documented order.
- Save intermediate results so UI can load incident state after refresh.
- Return structured errors and keep stack traces in server logs only.
- Integrate each domain router once its branch is merged.
- Implement health endpoint and demo seed/reset wiring.

## Implementation checklist

- [ ] FastAPI app starts and `/api/health` works.
- [ ] Config reads environment variables with safe defaults.
- [ ] DB session is shared; service functions do not open ad hoc databases.
- [ ] Shared typed error envelope and correlation ID middleware/dependency exist.
- [ ] State machine rejects illegal transitions.
- [ ] `POST /api/incidents/{id}/analyze` calls Member 2 → Member 3 → Member 4.
- [ ] Status/results persisted and retrievable by GET endpoints.
- [ ] Every router is included without circular imports.
- [ ] Golden-path integration test passes.
- [ ] Setup docs run on a clean clone.

## Acceptance tests you own

- Starting an incident moves `DETECTED → ANALYZING → OPTIONS_READY`.
- A route cannot bypass policy or call execution directly with client-supplied status.
- A failed module leaves a clear error state and does not claim success.
- Unknown incident IDs return `404`.
- UI can refresh and reconstruct current state from APIs.

## Team-lead practices

- Hold a 10-minute daily integration sync.
- Review PRs for contract compatibility and tests, not just whether code “runs on my machine”.
- Merge foundational changes early and feature changes in small slices.
- Keep a `BLOCKED` list and solve interface questions before writing speculative code.
- Preserve demo mode as the reliable fallback if external LLM/SAP access is unavailable.
