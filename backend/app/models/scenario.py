"""SQLAlchemy model for Recovery Scenarios."""
from sqlalchemy import Column, String, Integer, Float, Boolean, Text, JSON
from app.db.session import Base
from app.models.incident import utc_now_iso


class ScenarioRecord(Base):
    __tablename__ = "scenarios"

    scenario_id = Column(String(64), primary_key=True, index=True)
    incident_id = Column(String(64), nullable=False, index=True)
    name = Column(String(255), nullable=False)
    strategy_type = Column(String(64), nullable=False)
    actions = Column(JSON, nullable=False, default=list)
    incremental_cost = Column(Float, nullable=False, default=0.0)
    currency = Column(String(16), nullable=False, default="INR")
    arrival_days = Column(Integer, nullable=False, default=0)
    unmet_demand_units_before_recovery = Column(Integer, nullable=False, default=0)
    estimated_production_delay_days = Column(Integer, nullable=False, default=0)
    feasible = Column(Boolean, nullable=False, default=True)
    feasibility_reasons = Column(JSON, nullable=False, default=list)
    risk_score = Column(Integer, nullable=False, default=0)
    rank = Column(Integer, nullable=False, default=1)
    reasoning_summary = Column(Text, nullable=False, default="")
    policy_status = Column(String(32), nullable=False, default="APPROVAL_REQUIRED")
    reason_codes = Column(JSON, nullable=False, default=list)
    plan_version = Column(String(32), nullable=False, default="v1.0")
    created_at = Column(String(64), nullable=False, default=utc_now_iso)
