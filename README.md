# SynchroSC — Supply Chain Resilience Control Tower

> **Purpose:** Build a trustworthy agentic supply-chain resilience prototype that detects a disruption, analyses business impact, compares recovery plans, routes risky decisions through human approval, executes a simulated action, and verifies the outcome.

SynchroSC is a simulated supply-chain recovery control tower. It detects a shipment delay, calculates inventory and production exposure, compares recovery plans, routes risky actions for human approval, simulates an authorized change, and records its verification and audit history. It never writes to a live SAP or supplier system.

## Read this first

1. `docs/00-product-charter.md` — the problem, MVP, scope, and acceptance criteria.
2. `docs/01-architecture.md` — how modules connect.
3. `docs/02-workflow-and-state-machine.md` — the end-to-end lifecycle.
4. `docs/03-domain-model-and-contracts.md` and `contracts/` — shared payload shapes.
5. `docs/07-git-branching-and-integration.md` — branch and pull-request rules.
6. The relevant file in `docs/member-guides/` — each member's independent build brief.

## Recommended stack

- **Backend:** Python 3.11+, FastAPI, Pydantic v2, SQLite for local demo (PostgreSQL optional for deployment), pytest.
- **Frontend:** React + TypeScript + Vite + Tailwind CSS.
- **Agent orchestration:** Explicit Python workflow/orchestrator. LangGraph is optional, not a prerequisite.
- **LLM:** Provider-neutral adapter, used for extraction/classification/explanation only. Deterministic Python code owns arithmetic, constraints, approval decisions, and simulated execution.
- **SAP:** Mock adapter first. Add a real SAP integration only if event credentials, sandbox access, permissions, and relevant APIs are provided. Never label mock data as live SAP data.

## First team session

- Choose a repository owner and create the GitHub repository.
- Merge the shared contracts and project scaffold to `main` before parallel implementation.
- Load the same demo data from `data/demo_seed.json` (also documented in `docs/05-demo-scenario-and-rules.md`).
- Assign the five branches shown in `docs/07-git-branching-and-integration.md`.
- Each member must develop against the endpoint contracts and pass their module tests before opening a PR.

## Run locally

Use Python 3.11+ and Node.js 20+.

Backend (PowerShell, from `backend/`):

```bash
python -m venv .venv
.venv\Scripts\Activate.ps1
pip install -r requirements.txt
Copy-Item .env.example .env
uvicorn app.main:app --reload --port 8000
```

Frontend (from `frontend/`):

```bash
npm ci
npm run dev
```

The API uses a seeded SQLite database by default. To use Neon, set `DATABASE_URL` in the ignored `backend/.env` file to the valid PostgreSQL connection string. The database must allow SSL connections. Do not put credentials in source files or commit `.env`.

Open the Vite URL shown in the terminal, then use **Simulate disruption** to run the complete demo. Backend API docs are available at `http://localhost:8000/docs`.

## Project rules

- No direct commits to `main`; use feature branches and pull requests.
- Do not change a shared schema unilaterally. Propose contract changes to Member 1, update the contract doc and example, and notify all members.
- Keep every action simulated in the hackathon MVP. No live purchase, freight booking, supplier switch, or write to an SAP tenant.
- Keep secrets in environment variables; never commit `.env` files or real credentials.
- Any recommendation must show its source data, calculations, constraints, assumptions, and approval state.
