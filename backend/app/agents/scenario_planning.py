"""Scenario Planning Agent (Member 3 domain).

Orchestrates candidate generation and multi-criteria evaluation for recovery plans.
"""
from typing import List
from app.schemas.impact import ImpactAnalysis
from app.schemas.scenario import RecoveryScenario
from app.services.option_scoring import generate_scenarios


class ScenarioPlanningAgent:
    """Agent generating and evaluating recovery scenarios."""

    @staticmethod
    async def plan_recovery(incident_id: str, impact: ImpactAnalysis) -> List[RecoveryScenario]:
        return await generate_scenarios(incident_id=incident_id, impact=impact)
