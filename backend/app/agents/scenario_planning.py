"""Scenario Planning Agent (Member 3 domain).

Thin orchestration layer: fetches supply-chain context, delegates all
calculations to option_scoring, and returns typed RecoveryScenario objects.
"""
from typing import List, Optional
from sqlalchemy.orm import Session

from app.schemas.impact import ImpactAnalysis
from app.schemas.scenario import RecoveryScenario
from app.services.option_scoring import generate_scenarios


async def plan_recovery(
    incident_id: str,
    impact: ImpactAnalysis,
    db: Optional[Session] = None,
) -> List[RecoveryScenario]:
    """Generate ranked recovery scenarios for an incident.

    Args:
        incident_id: The incident being recovered.
        impact: Typed impact analysis produced by Member 2's service.
        db: Optional SQLAlchemy session for live supply-chain record lookup.

    Returns:
        Ranked list of RecoveryScenario objects. Output is deterministic for
        unchanged inputs. No LLM is required.
    """
    return await generate_scenarios(incident_id=incident_id, impact=impact, db=db)


class ScenarioPlanningAgent:
    """Agent wrapper for recovery scenario generation (Member 3 domain)."""

    @staticmethod
    async def plan_recovery(
        incident_id: str,
        impact: ImpactAnalysis,
        db: Optional[Session] = None,
    ) -> List[RecoveryScenario]:
        """Delegate to module-level plan_recovery for testability."""
        return await plan_recovery(incident_id=incident_id, impact=impact, db=db)
