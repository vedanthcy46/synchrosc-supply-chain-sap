# 12 — Canonical Repository Folder Structure

The tree below is the agreed target. Empty modules can be created as placeholders during the initial scaffold; each member implements the files listed in their member guide. Avoid creating a second competing version of the same folder or module.

```text
synchrosc/
├── README.md
├── .gitignore
├── .env.example
├── docs/
│   ├── 00-product-charter.md
│   ├── 01-architecture.md
│   ├── 02-workflow-and-state-machine.md
│   ├── 03-domain-model-and-contracts.md
│   ├── 04-api-contracts.md
│   ├── 05-demo-scenario-and-rules.md
│   ├── 06-security-governance-and-audit.md
│   ├── 07-git-branching-and-integration.md
│   ├── 08-test-plan-and-acceptance.md
│   ├── 09-demo-script.md
│   ├── 10-deployment-and-operations.md
│   ├── 11-folder-structure.md
│   └── member-guides/
│       ├── member-1-team-lead-orchestrator.md
│       ├── member-2-disruption-impact.md
│       ├── member-3-scenario-planner.md
│       ├── member-4-policy-actions-audit.md
│       └── member-5-frontend-and-qa.md
├── contracts/
│   ├── disruption-event.example.json
│   ├── scenario-list.example.json
│   └── error.example.json
├── data/
│   └── demo_seed.json
├── backend/
│   ├── requirements.txt
│   ├── .env.example
│   ├── app/
│   │   ├── main.py
│   │   ├── core/config.py
│   │   ├── api/router.py
│   │   ├── api/routes/
│   │   │   ├── health.py
│   │   │   ├── disruptions.py
│   │   │   ├── incidents.py
│   │   │   ├── impact.py
│   │   │   ├── scenarios.py
│   │   │   ├── approvals.py
│   │   │   ├── actions.py
│   │   │   └── audit.py
│   │   ├── schemas/
│   │   │   ├── common.py
│   │   │   ├── disruption.py
│   │   │   ├── impact.py
│   │   │   ├── scenario.py
│   │   │   ├── approval.py
│   │   │   └── action.py
│   │   ├── db/session.py
│   │   ├── models/
│   │   │   ├── incident.py
│   │   │   ├── supply_chain.py
│   │   │   ├── scenario.py
│   │   │   ├── approval.py
│   │   │   └── audit.py
│   │   ├── repositories/
│   │   ├── agents/
│   │   │   ├── disruption_sensing.py
│   │   │   └── scenario_planning.py
│   │   ├── services/
│   │   │   ├── impact_analysis.py
│   │   │   ├── option_scoring.py
│   │   │   ├── policy_engine.py
│   │   │   ├── execution_service.py
│   │   │   ├── audit_service.py
│   │   │   └── verification_service.py
│   │   ├── orchestration/
│   │   │   ├── workflow.py
│   │   │   └── state_machine.py
│   │   ├── adapters/
│   │   │   ├── event_source/mock_source.py
│   │   │   ├── sap/mock_sap.py
│   │   │   └── llm/mock_provider.py
│   │   └── seed/seed_demo.py
│   └── tests/
│       ├── unit/
│       ├── api/
│       └── integration/test_golden_path.py
├── frontend/
│   ├── package.json
│   ├── vite.config.ts
│   ├── .env.example
│   └── src/
│       ├── main.tsx
│       ├── app/App.tsx
│       ├── api/client.ts
│       ├── types/api.ts
│       ├── components/
│       ├── features/dashboard/
│       ├── features/incidents/
│       ├── features/scenarios/
│       ├── features/approvals/
│       └── features/audit/
├── scripts/
│   ├── seed_demo.py
│   └── reset_demo.py
└── tests/
    └── README.md
```

## Folder ownership

| Path | Owner | Rule |
|---|---|---|
| `docs/`, `contracts/` | Member 1 owns contract review; all may propose changes | Keep code and docs/examples aligned |
| `backend/app/main.py`, `api/router.py`, `orchestration/` | Member 1 | Router integration and state machine |
| `backend/app/agents/disruption_sensing.py`, `services/impact_analysis.py` | Member 2 | Detector and impact math |
| `backend/app/agents/scenario_planning.py`, `services/option_scoring.py` | Member 3 | Candidate plans and transparent ranking |
| `backend/app/services/policy_engine.py`, `execution_service.py`, `audit_service.py`, `verification_service.py` | Member 4 | Guards, approval, action, trace |
| `frontend/src/**` | Member 5 | UI, API client, frontend tests |
| `backend/app/schemas/common.py`, DB connection/config | Member 1; domain schema files owned by relevant member | Coordinate schema changes before merge |

## Design note

The exact internal filenames can change if the team agrees before parallel coding. Once implementation begins, treat this tree as frozen except through a contract/architecture PR.
