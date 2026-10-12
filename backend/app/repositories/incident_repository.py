"""Repository for Incidents and Disruption Events."""
from typing import Optional, List
from sqlalchemy.orm import Session
from app.models.incident import Incident, DisruptionEventRecord, utc_now_iso
from app.repositories.base import BaseRepository
from app.schemas.common import ResourceNotFoundError


class IncidentRepository(BaseRepository[Incident]):
    def __init__(self, db: Session) -> None:
        super().__init__(Incident, db)

    def get_by_id(self, incident_id: str) -> Optional[Incident]:
        return self.db.query(Incident).filter(Incident.incident_id == incident_id).first()

    def get_required(self, incident_id: str) -> Incident:
        incident = self.get_by_id(incident_id)
        if not incident:
            raise ResourceNotFoundError("Incident", incident_id)
        return incident

    def get_by_event_id(self, event_id: str) -> Optional[Incident]:
        return self.db.query(Incident).filter(Incident.event_id == event_id).first()

    def list_all(self, skip: int = 0, limit: int = 100) -> List[Incident]:
        return self.db.query(Incident).order_by(Incident.created_at.desc()).offset(skip).limit(limit).all()

    def update_status(self, incident: Incident, status: str) -> Incident:
        incident.status = status
        incident.updated_at = utc_now_iso()
        return self.update(incident)


class DisruptionEventRepository(BaseRepository[DisruptionEventRecord]):
    def __init__(self, db: Session) -> None:
        super().__init__(DisruptionEventRecord, db)

    def get_by_id(self, event_id: str) -> Optional[DisruptionEventRecord]:
        return self.db.query(DisruptionEventRecord).filter(DisruptionEventRecord.event_id == event_id).first()

    def get_required(self, event_id: str) -> DisruptionEventRecord:
        event = self.get_by_id(event_id)
        if not event:
            raise ResourceNotFoundError("DisruptionEvent", event_id)
        return event

    def list_all(self, skip: int = 0, limit: int = 100) -> List[DisruptionEventRecord]:
        return self.db.query(DisruptionEventRecord).order_by(DisruptionEventRecord.detected_at.desc()).offset(skip).limit(limit).all()
