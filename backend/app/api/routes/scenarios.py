"""Recovery scenario routes (Member 3 domain).

GET /api/incidents/{incident_id}/scenarios
  Returns ranked recovery scenarios for an incident.
  Returns HTTP 404 when the incident does not exist (via ResourceNotFoundError).

Router registration is handled by Member 1 in app/api/router.py.
"""
from typing import Any, Dict
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.repositories.incident_repository import IncidentRepository
from app.models.scenario import ScenarioRecord
from app.schemas.scenario import RecoveryScenario, ScenarioListResponse
from app.schemas.common import PolicyDisposition, StrategyType, WorkflowState

router = APIRouter(prefix="/incidents", tags=["Scenarios"])


@router.get("/{incident_id}/scenarios", response_model=ScenarioListResponse)
def list_incident_scenarios(
    incident_id: str,
    db: Session = Depends(get_db),
) -> Dict[str, Any]:
    """Retrieve ranked recovery scenarios for an incident.

    Returns the incident ID, current workflow status, impact summary, and
    a list of ranked RecoveryScenario objects ordered by rank ascending.

    Raises ResourceNotFoundError (HTTP 404) when the incident does not exist.
    Scenario feasibility, cost, policy status, and execution permission are
    determined server-side only.
    """
    repo = IncidentRepository(db)
    incident = repo.get_required(incident_id)  # raises ResourceNotFoundError -> 404

    records = (
        db.query(ScenarioRecord)
        .filter(ScenarioRecord.incident_id == incident_id)
        .order_by(ScenarioRecord.rank.asc())
        .all()
    )

    scenarios = [
        RecoveryScenario(
            scenario_id=r.scenario_id,
            incident_id=r.incident_id,
            name=r.name,
            strategy_type=StrategyType(r.strategy_type),
            actions=r.actions,
            incremental_cost=r.incremental_cost,
            currency=r.currency,
            arrival_days=r.arrival_days,
            unmet_demand_units_before_recovery=r.unmet_demand_units_before_recovery,
            estimated_production_delay_days=r.estimated_production_delay_days,
            feasible=r.feasible,
            feasibility_reasons=r.feasibility_reasons,
            risk_score=r.risk_score,
            rank=r.rank,
            reasoning_summary=r.reasoning_summary,
            policy_status=PolicyDisposition(r.policy_status),
            reason_codes=r.reason_codes,
            plan_version=r.plan_version,
        )
        for r in records
    ]

    return ScenarioListResponse(
        incident_id=incident.incident_id,
        status=WorkflowState(incident.status),
        impact=incident.impact_summary,
        scenarios=scenarios,
    )
