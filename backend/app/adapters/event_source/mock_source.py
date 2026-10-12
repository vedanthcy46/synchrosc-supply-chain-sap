"""Mock Event Source adapter for deterministic disruption events."""
from typing import Dict, Any
from app.seed.seed_demo import get_demo_seed_path
import json


def load_demo_disruption_event() -> Dict[str, Any]:
    """Load the canonical demo shipping delay event fixture."""
    path = get_demo_seed_path()
    with open(path, "r", encoding="utf-8") as f:
        data = json.load(f)
    return data.get("demo_disruption", {})
