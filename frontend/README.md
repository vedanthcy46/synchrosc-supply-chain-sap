# SynchroSC Frontend

React + TypeScript + Vite control tower UI for the SynchroSC supply-chain resilience prototype.

## Requirements

- Node.js 20+
- Backend running on `http://localhost:8000` (see `backend/` for setup)

## Installation

```bash
cd frontend
npm ci
```

## Environment setup

Copy the example file and edit as needed:

```bash
cp .env.example .env
```

| Variable | Default | Purpose |
|---|---|---|
| `VITE_API_BASE_URL` | `http://localhost:8000/api` | Backend API base path |
| `VITE_DEMO_MODE` | `true` | Label data as simulated in the UI |

## Start locally

```bash
npm run dev
```

Open the Vite URL shown in the terminal (default: `http://localhost:5173`).

## Run tests

```bash
npm test          # single run
npm run test:watch  # watch mode
```

13 tests covering all QA requirements: KPI display, empty states, loading/error states, retry, demo event creation, scenario comparison, blocked scenario enforcement, approval decisions, 409 handling, rejection safety, execution gating, and audit ordering.

## Production build

```bash
npm run build
```

Output is written to `dist/`. TypeScript is checked before bundling — the build fails on type errors.

## Type check only

```bash
npm run lint
```

## Golden-path demo sequence

1. Open the Control Tower (`/`).
2. Click **Simulate disruption** — creates the demo shipping-delay event and runs analysis.
3. The app navigates to **Incident analysis** showing 500 units available, 100 units/day demand, 5-day coverage, 12-day ETA.
4. Review the recovery options panel — four ranked scenarios with costs, ETAs, and policy dispositions.
5. Click **Select this plan** on the alternate-supplier scenario (₹64,000 — exceeds the ₹50,000 threshold, so `APPROVAL_REQUIRED`).
6. Open **Approval queue** — the pending request appears with plan version and policy reasons.
7. Click **Approve plan** — the backend confirms the approval.
8. Return to **Incident analysis** — the **Execute simulation** button is now visible.
9. Click **Execute simulation** — the backend runs the simulated action and records verification.
10. Open **Audit timeline** — all workflow events appear in chronological order.
11. Refresh the browser — the incident and approval state reload from the backend via `localStorage` key.

## Switch from fixture/demo mode to real API mode

The app always calls the real backend API. `VITE_DEMO_MODE=true` only controls the "DEMO · SIMULATED DATA" label in the UI — it does not substitute fixture data for real responses.

To point at a different backend:

```bash
# .env
VITE_API_BASE_URL=https://your-backend-host/api
VITE_DEMO_MODE=false
```

Restart `npm run dev` after changing `.env`.

## Folder structure

```
src/
  api/client.ts          Centralized fetch client + all typed API functions
  app/App.tsx            Single-page application shell and all views
  types/api.ts           Re-exports shared API types
  test/
    setup.ts             Vitest + jest-dom setup
    App.test.tsx         All 13 QA tests
  style.css              Global CSS (no CSS-in-JS, no Tailwind)
  main.tsx               React entry point
```

## Notes for Member 1

- `GET /dashboard/summary` must return `active_incidents_count`, `pending_approvals_count`, `monitored_components_count`, `execution_mode`, and `recent_events`.
- `POST /disruptions` must return `{ incident_id, event_id, status, created_at }`.
- `POST /incidents/{id}/analyze` must return `{ scenarios: Scenario[] }` (the frontend reads `result.scenarios`).
- `GET /incidents/{id}/scenarios` must return `{ scenarios: Scenario[] }`.
- `GET /disruptions` must return `{ items: [...] }` where each item has an optional `incident_id`.
- `GET /approvals` and `GET /incidents/{id}/audit` must return `{ items: [...] }`.
