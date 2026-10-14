# SynchroSC Control Tower

The React interface reads and writes operational state through the FastAPI service. The browser never connects directly to PostgreSQL; the backend owns database credentials and policy enforcement.

## Run locally

From this directory:

```bash
npm install
npm run dev
```

Start the backend separately at `http://localhost:8000`. Vite forwards `/api` requests to that service during local development. To use another backend, create a `frontend/.env.local` file with:

```env
VITE_API_BASE_URL=https://your-api-host.example/api
```

The value must be the API base path, including `/api`. Do not put a database connection string, database password, or other server credential in a `VITE_` variable; Vite embeds those values into browser code.

## Database-backed workflow

The dashboard reads the summary, disruption list, approvals, and database health from the API. Creating a disruption, analyzing an incident, selecting a scenario, deciding an approval, and executing a simulation all use the agreed API routes. Incident details, impact, recovery options, workflow status, and audit history are reloaded from the server after mutations so a browser refresh reconstructs persisted state.

All actions are simulated. The UI reports success only after a successful API response. A `409` policy or stale-state response is surfaced to the operator, then the latest server state is fetched again.

## Screens

- Control tower KPIs and recent disruption events
- Incident impact, source evidence, assumptions, and ranked recovery options
- Approval review with exact scenario and plan version, approve/reject controls
- Audit timeline, including simulated execution and verification events
- Database connection and simulation-mode indicators

The interface uses the backend's live records. When the database is empty, create the demo disruption from the dashboard or load the backend seed data; the UI does not silently substitute mock business metrics.
