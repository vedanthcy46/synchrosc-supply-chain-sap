"""Unit tests for DisruptionSensingAgent (Member 2 domain)."""
import pytest
from pydantic import ValidationError
from app.agents.disruption_sensing import DisruptionSensingAgent
from app.schemas.disruption import DisruptionCategory
from app.schemas.common import SeverityLevel, SourceType


def test_valid_event_normalized():
    """Verify that a valid disruption event payload is normalized correctly."""
    raw_payload = {
        "event_type": "  SHIPPING_DELAY  ",
        "title": "  Critical component shipment delayed  ",
        "description": "  SHP-102 revised ETA is 12 days from now.  ",
        "severity": "high",
        "source_type": "demo",
        "source_name": "  demo_seed.json  ",
        "confidence": 1.0,
        "affected_shipment_ids": ["SHP-102", "SHP-102"],  # duplicate test
        "evidence": ["ETA changed to +12 days in the scenario fixture"],
    }

    event = DisruptionSensingAgent.validate_and_normalize(raw_payload)

    assert event.event_type == "shipping_delay"
    assert event.title == "Critical component shipment delayed"
    assert event.description == "SHP-102 revised ETA is 12 days from now."
    assert event.severity == SeverityLevel.HIGH
    assert event.source_type == SourceType.DEMO
    assert event.source_name == "demo_seed.json"
    assert event.confidence == 1.0
    assert event.affected_shipment_ids == ["SHP-102"]  # deduplicated
    assert event.evidence == ["ETA changed to +12 days in the scenario fixture"]


def test_invalid_event_input_raises_validation_error():
    """Verify that blank titles, missing descriptions, or invalid confidence raise clear validation errors."""
    # Blank title
    with pytest.raises((ValueError, ValidationError)):
        DisruptionSensingAgent.validate_and_normalize({
            "title": "   ",
            "description": "Valid description",
        })

    # Missing description
    with pytest.raises((ValueError, ValidationError)):
        DisruptionSensingAgent.validate_and_normalize({
            "title": "Valid title",
            "description": "",
        })

    # Confidence > 1.0
    with pytest.raises((ValueError, ValidationError)):
        DisruptionSensingAgent.validate_and_normalize({
            "title": "Valid title",
            "description": "Valid description",
            "confidence": 1.5,
        })

    # Confidence < 0.0
    with pytest.raises((ValueError, ValidationError)):
        DisruptionSensingAgent.validate_and_normalize({
            "title": "Valid title",
            "description": "Valid description",
            "confidence": -0.2,
        })

    # Non-dictionary payload
    with pytest.raises(ValueError):
        DisruptionSensingAgent.validate_and_normalize("invalid string payload")  # type: ignore


def test_disruption_evidence_preserved():
    """Verify that evidence metadata and references are preserved without alteration or hallucination."""
    evidence_items = [
        "Carrier EDI status code: DELAY_PORT_CONGESTION",
        "Vessel tracking timestamp 2026-10-12T08:00:00Z",
    ]
    payload = {
        "title": "Port Congestion Delay",
        "description": "Container ship anchored outside Port A",
        "evidence": evidence_items,
    }

    event = DisruptionSensingAgent.validate_and_normalize(payload)
    assert event.evidence == evidence_items

    # Fallback to description if no evidence provided
    payload_no_evidence = {
        "title": "Port Congestion Delay",
        "description": "Container ship anchored outside Port A",
    }
    event_no_evidence = DisruptionSensingAgent.validate_and_normalize(payload_no_evidence)
    assert len(event_no_evidence.evidence) == 1
    assert "Source statement: Container ship anchored outside Port A" in event_no_evidence.evidence[0]


def test_disruption_classification_categories():
    """Verify that handbook disruption categories are assigned correctly using deterministic rules."""
    # 1. Shipping delay
    cls1 = DisruptionSensingAgent.classify_disruption(
        event_type="shipping_delay",
        title="Delayed container shipment",
        description="Vessel arrival postponed by 8 days",
    )
    assert cls1.category == DisruptionCategory.SHIPPING_DELAY
    assert cls1.confidence >= 0.9

    # 2. Supplier disruption
    cls2 = DisruptionSensingAgent.classify_disruption(
        event_type="unknown",
        title="Supplier insolvency alert",
        description="Primary vendor filed for bankruptcy protection",
    )
    assert cls2.category == DisruptionCategory.SUPPLIER_DISRUPTION

    # 3. Production halt
    cls3 = DisruptionSensingAgent.classify_disruption(
        event_type="unknown",
        title="Assembly line down",
        description="Main production machine suffered motor breakdown",
    )
    assert cls3.category == DisruptionCategory.PRODUCTION_HALT

    # 4. Inventory shortage
    cls4 = DisruptionSensingAgent.classify_disruption(
        event_type="unknown",
        title="Warehouse stockout alert",
        description="Buffer inventory depleted below safety threshold",
    )
    assert cls4.category == DisruptionCategory.INVENTORY_SHORTAGE

    # 5. Quality issue
    cls5 = DisruptionSensingAgent.classify_disruption(
        event_type="unknown",
        title="Defect rate surge",
        description="Batch inspection failed contamination check",
    )
    assert cls5.category == DisruptionCategory.QUALITY_ISSUE

    # 6. Weather delay
    cls6 = DisruptionSensingAgent.classify_disruption(
        event_type="unknown",
        title="Typhoon warning in South China Sea",
        description="Severe storm rerouting ocean cargo carriers",
    )
    assert cls6.category == DisruptionCategory.WEATHER_DELAY

    # 7. Other
    cls7 = DisruptionSensingAgent.classify_disruption(
        event_type="unknown",
        title="Regulatory inquiry",
        description="Audit documentation requested by regional board",
    )
    assert cls7.category == DisruptionCategory.OTHER


def test_extract_from_unstructured_text():
    """Verify entity extraction from raw text alert without LLM invention."""
    text = "Urgent: Shipment SHP-102 from SUP-A is delayed by customs inspection at Port A."
    event = DisruptionSensingAgent.extract_from_unstructured_text(text, source_name="email_alert")

    assert "SHP-102" in event.affected_shipment_ids
    assert "SUP-A" in event.affected_supplier_ids
    assert event.event_type == "shipping_delay"
    assert event.source_type == SourceType.FEED
    assert any("Extracted from raw text" in ev for ev in event.evidence)
