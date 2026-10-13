"""Persisted simulated executions used for durable idempotency."""
from sqlalchemy import Column, String, JSON, UniqueConstraint
from app.db.session import Base


class ExecutionRecord(Base):
    __tablename__ = "executions"
    __table_args__ = (UniqueConstraint("idempotency_key", name="uq_execution_idempotency_key"),)

    action_id = Column(String(64), primary_key=True, index=True)
    idempotency_key = Column(String(255), nullable=False, index=True)
    incident_id = Column(String(64), nullable=False, index=True)
    scenario_id = Column(String(64), nullable=False)
    request_fingerprint = Column(String(128), nullable=False)
    status = Column(String(32), nullable=False, default="running")
    simulation_effect = Column(JSON, nullable=True)
    result = Column(JSON, nullable=True)
