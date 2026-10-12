"""Mock LLM Provider adapter.

Used for text classification or explanation enrichment.
Arithmetic, governance, approval decisions, and state transitions remain strictly deterministic.
"""
from typing import Dict, Any


class MockLLMProvider:
    """Mock LLM adapter providing deterministic summaries and explanation text."""

    def summarize_disruption(self, event_text: str) -> str:
        return f"Shipment delay threatens critical component stock before revised ETA."

    def explain_recommendation(self, scenario_name: str, cost: float, lead_time_days: int) -> str:
        return (
            f"Recommended '{scenario_name}' because it resolves projected stockout "
            f"with an arrival in {lead_time_days} days at lowest incremental recovery cost of ₹{cost:,.2f}."
        )
