"""Impact analysis routes (Member 2 domain)."""
from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session
from app.db.session import get_db
from app.repositories.incident_repository import IncidentRepository
from app.services.impact_analysis import analyze_impact
from app.schemas.impact import ImpactAnalysis

router = APIRouter(prefix="/incidents", tags=["Impact"])


@router.get("/{incident_id}/impact", response_model=ImpactAnalysis)
async def get_incident_impact(
    incident_id: str,
    recalculate: bool = Query(False, description="Force fresh calculation instead of cached impact"),
    db: Session = Depends(get_db),
) -> ImpactAnalysis:
    """Retrieve or compute the impact analysis for a given incident."""
    repo = IncidentRepository(db)
    incident = repo.get_required(incident_id)

    if not recalculate and incident.impact_summary:
        return ImpactAnalysis(**incident.impact_summary)

    impact = await analyze_impact(incident_id=incident_id, db=db)
    return impact
