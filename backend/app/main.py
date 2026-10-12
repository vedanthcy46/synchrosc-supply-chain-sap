"""SynchroSC FastAPI scaffold. Members should wire routers during implementation."""
from fastapi import FastAPI

app = FastAPI(title="SynchroSC API", version="0.1.0", description="Hackathon prototype; all execution is simulated.")

@app.get("/api/health")
def health() -> dict[str, str]:
    return {"status": "ok", "execution_mode": "simulation"}
