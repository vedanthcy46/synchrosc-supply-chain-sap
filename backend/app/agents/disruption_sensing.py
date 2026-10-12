"""Disruption Sensing Agent (Member 2 domain).

Converts raw text or structured alerts into validated DisruptionEvent domain entities.
"""
from typing import Dict, Any
from app.schemas.disruption import DisruptionEventCreate


class DisruptionSensingAgent:
    """Agent responsible for parsing, normalizing, and verifying disruption signals."""

    @staticmethod
    def parse_alert_signal(payload: Dict[str, Any]) -> DisruptionEventCreate:
        """Parse raw incoming signal into validated DisruptionEventCreate schema."""
        return DisruptionEventCreate(**payload)
