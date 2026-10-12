"""Incident workflow and details routes (Owned by Member 1)."""
from typing import Any, Dict
from fastapi import APIRouter, Depends, Request
from sqlalchemy.orm import Session
from app.db.session import get_db
from app.repositories.incident_repository import IncidentRepository
from app.orchestration.workflow import IncidentOrchestrator
from app.schemas.scenario import (
    ScenarioListResponse,
    ScenarioSelectRequest,
    ScenarioSelectResponse,
)

router = APIRouter(prefix="/incidents", tags=["Incidents & Workflow"])


@router.get("/{incident_id}")
def get_incident(
    incident_id: str,
    db: Session = Depends(get_db),
) -> Dict[str, Any]:
    """Retrieve incident details and current workflow status."""
    repo = IncidentRepository(db)
    incident = repo.get_required(incident_id)

    return {
        "incident_id": incident.incident_id,
        "event_id": incident.event_id,
        "title": incident.title,
        "status": incident.status,
        "severity": incident.severity,
        "impact_summary": incident.impact_summary,
        "selected_scenario_id": incident.selected_scenario_id,
        "approval_id": incident.approval_id,
        "created_at": incident.created_at,
        "updated_at": incident.updated_at,
    }


@router.post("/{incident_id}/analyze", response_model=ScenarioListResponse)
async def analyze_incident(
    incident_id: str,
    request: Request,
    db: Session = Depends(get_db),
) -> ScenarioListResponse:
    """Run disruption impact analysis, scenario generation, and policy evaluation."""
    correlation_id = getattr(request.state, "correlation_id", "corr-direct")
    return await IncidentOrchestrator.run_analysis_workflow(
        incident_id=incident_id,
        db=db,
        correlation_id=correlation_id,
    )


@router.post("/{incident_id}/select-scenario", response_model=ScenarioSelectResponse)
def select_scenario(
    incident_id: str,
    payload: ScenarioSelectRequest,
    request: Request,
    db: Session = Depends(get_db),
) -> ScenarioSelectResponse:
    """Select a candidate scenario, routing through policy and creating approval if required."""
    correlation_id = getattr(request.state, "correlation_id", "corr-direct")
    return IncidentOrchestrator.select_scenario(
        incident_id=incident_id,
        scenario_id=payload.scenario_id,
        db=db,
        correlation_id=correlation_id,
    )
