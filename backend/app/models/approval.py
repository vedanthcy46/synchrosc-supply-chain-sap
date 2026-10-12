"""SQLAlchemy model for Approval Requests."""
from sqlalchemy import Column, String, Text
from app.db.session import Base
from app.models.incident import utc_now_iso


class ApprovalRecord(Base):
    __tablename__ = "approvals"

    approval_id = Column(String(64), primary_key=True, index=True)
    incident_id = Column(String(64), nullable=False, index=True)
    scenario_id = Column(String(64), nullable=False, index=True)
    plan_version = Column(String(32), nullable=False, default="v1.0")
    status = Column(String(32), nullable=False, default="pending", index=True)  # pending | approved | rejected | stale
    requested_by = Column(String(128), nullable=False, default="system")
    reviewed_by = Column(String(128), nullable=True)
    reason = Column(Text, nullable=False, default="")
    decision_comment = Column(Text, nullable=True)
    created_at = Column(String(64), nullable=False, default=utc_now_iso)
    reviewed_at = Column(String(64), nullable=True)
