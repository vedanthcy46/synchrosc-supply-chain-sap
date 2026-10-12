# 10 — Local Setup, Deployment, and Operations

## Environment conventions

- Python 3.11 or newer for backend; Node.js LTS for frontend.
- Local backend default: `http://localhost:8000`.
- Local frontend default: Vite URL, commonly `http://localhost:5173`.
- Frontend accesses backend through `VITE_API_BASE_URL`.
- Backend settings are environment-driven. Commit `.env.example`, not `.env`.
- SQLite is sufficient for a repeatable hackathon demo. Use PostgreSQL only if hosted deployment requires it or team setup is comfortable.

## Backend `.env.example`

```dotenv
APP_ENV=development
API_PREFIX=/api
DATABASE_URL=sqlite:///./synchrosc.db
CORS_ORIGINS=http://localhost:5173
LLM_PROVIDER=mock
LLM_API_KEY=
AUTO_APPROVAL_LIMIT_INR=50000
EXECUTION_MODE=simulation
USE_DEMO_SEED=true
```

The exact settings class is owned by Member 1. Keep defaults safe: `LLM_PROVIDER=mock`, `EXECUTION_MODE=simulation`, and demo seed enabled for local runs.

## Frontend `.env.example`

```dotenv
VITE_API_BASE_URL=http://localhost:8000/api
VITE_DEMO_MODE=true
```

## Startup order

1. Create a virtual environment and install backend requirements.
2. Copy `.env.example` to `.env` locally and review values.
3. Run database initialisation and seed script.
4. Start FastAPI on port 8000.
5. Install frontend dependencies and start Vite.
6. Open `/api/health` and confirm UI API calls work.

## Deployment approach

- Deploy one backend service and one static frontend service.
- Configure frontend API base URL to the hosted backend URL.
- Configure backend CORS for only the actual frontend origin.
- Use a persistent database where supported; if SQLite is ephemeral on the chosen host, use managed PostgreSQL or document that every redeploy resets demo data.
- Set all provider keys through hosting environment variables.
- Keep `EXECUTION_MODE=simulation` in every demo deployment.
- Add a seed/reset script for the golden path, protected so it cannot reset non-demo data.

## Operational checklist

- Health endpoint checks API readiness and database reachability.
- Logs include correlation ID and incident ID but redact secrets.
- Use bounded timeouts for external/LLM requests.
- The deterministic demo remains usable if an optional model provider fails.
- Display an actionable error if the backend is unavailable; never fabricate successful execution.
- Review logs after a failed run and preserve audit records for demo evidence.
