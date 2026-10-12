"""Dashboard summary metrics route (Member 1 + Member 5)."""
from typing import Dict, Any
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from app.db.session import get_db
from app.models.incident import Incident, DisruptionEventRecord
from app.models.approval import ApprovalRecord
from app.models.supply_chain import InventoryRecord
from app.core.config import settings

router = APIRouter(prefix="/dashboard", tags=["Dashboard"])


@router.get("/summary")
def get_dashboard_summary(db: Session = Depends(get_db)) -> Dict[str, Any]:
    """Retrieve high-level KPI counts and recent alerts for the Control Tower."""
    total_incidents = db.query(Incident).count()
    active_incidents = (
        db.query(Incident)
        .filter(Incident.status.notin_(["VERIFIED", "CLOSED"]))
        .count()
    )
    pending_approvals = (
        db.query(ApprovalRecord)
        .filter(ApprovalRecord.status == "pending")
        .count()
    )
    monitored_components = db.query(InventoryRecord.component_id).distinct().count()

    recent_events = (
        db.query(DisruptionEventRecord)
        .order_by(DisruptionEventRecord.detected_at.desc())
        .limit(5)
        .all()
    )

    return {
        "active_incidents_count": active_incidents,
        "total_incidents_count": total_incidents,
        "pending_approvals_count": pending_approvals,
        "monitored_components_count": monitored_components or 1,
        "execution_mode": settings.EXECUTION_MODE,
        "recent_events": [
            {
                "event_id": e.event_id,
                "title": e.title,
                "severity": e.severity,
                "source_type": e.source_type,
                "detected_at": e.detected_at,
            }
            for e in recent_events
        ],
    }
