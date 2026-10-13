"""Disruption Sensing Agent (Member 2 domain).

Converts raw signals, text alerts, or structured dictionaries into validated,
evidence-linked DisruptionEvent entities according to the SynchroSC handbook.
"""
import re
from typing import Dict, Any, List, Optional
from app.schemas.common import SeverityLevel, SourceType
from app.schemas.disruption import (
    DisruptionEventCreate,
    DisruptionCategory,
    DisruptionClassification,
)


class DisruptionSensingAgent:
    """Agent responsible for validating, normalizing, classifying, and preserving

    evidence for disruption signals.
    """

    # Keyword mapping for deterministic classification
    CATEGORY_KEYWORDS = {
        DisruptionCategory.WEATHER_DELAY: [
            "weather", "storm", "hurricane", "typhoon", "cyclone", "flood", "fog"
        ],
        DisruptionCategory.QUALITY_ISSUE: [
            "defect", "quality", "recall", "contamination", "inspection", "failed inspection"
        ],
        DisruptionCategory.PRODUCTION_HALT: [
            "production", "machine", "line down", "assembly", "breakdown", "maintenance"
        ],
        DisruptionCategory.SUPPLIER_DISRUPTION: [
            "supplier", "vendor", "capacity", "bankruptcy", "strike", "insolvency",
            "factory shutdown", "labor", "dispute"
        ],
        DisruptionCategory.INVENTORY_SHORTAGE: [
            "inventory", "stock", "stockout", "shortage", "warehouse", "buffer"
        ],
        DisruptionCategory.SHIPPING_DELAY: [
            "shipping", "shipment", "transit", "delay", "delayed", "eta",
            "vessel", "port", "customs", "delivery", "freight", "carrier", "route"
        ],
    }

    @classmethod
    def normalize_string(cls, val: Any) -> str:
        """Strip and normalize string values, guarding against None."""
        if val is None:
            return ""
        return str(val).strip()

    @classmethod
    def classify_disruption(
        cls,
        event_type: str,
        title: str,
        description: str,
    ) -> DisruptionClassification:
        """Classify disruption into standard handbook categories using deterministic rules."""
        norm_type = cls.normalize_string(event_type).lower()
        combined_text = f"{norm_type} {title} {description}".lower()

        # Check explicit matching first
        for cat in DisruptionCategory:
            if cat.value == norm_type:
                return DisruptionClassification(
                    category=cat,
                    confidence=1.0,
                    classification_reason=f"Explicit event_type match: '{cat.value}'",
                )

        # Keyword matching
        for category, keywords in cls.CATEGORY_KEYWORDS.items():
            for kw in keywords:
                if kw in combined_text:
                    return DisruptionClassification(
                        category=category,
                        confidence=0.9,
                        classification_reason=f"Matched keyword '{kw}' associated with {category.value}",
                    )

        return DisruptionClassification(
            category=DisruptionCategory.OTHER,
            confidence=0.5,
            classification_reason="No specialized category keywords matched; classified as 'other'",
        )

    @classmethod
    def validate_and_normalize(cls, payload: Dict[str, Any]) -> DisruptionEventCreate:
        """Validate and normalize incoming disruption payload.

        Preserves original evidence, sanitizes strings, and enforces schema rules.
        """
        if not isinstance(payload, dict):
            raise ValueError("Disruption payload must be a JSON object dictionary.")

        # Title & Description validation
        raw_title = payload.get("title")
        if not raw_title or not str(raw_title).strip():
            raise ValueError("Disruption title is required and cannot be empty.")
        clean_title = str(raw_title).strip()

        raw_desc = payload.get("description")
        if not raw_desc or not str(raw_desc).strip():
            raise ValueError("Disruption description is required and cannot be empty.")
        clean_desc = str(raw_desc).strip()

        # Event type normalization
        raw_event_type = payload.get("event_type", "shipping_delay")
        clean_event_type = cls.normalize_string(raw_event_type).lower() or "shipping_delay"

        # Severity validation
        raw_severity = payload.get("severity", SeverityLevel.HIGH.value)
        if isinstance(raw_severity, SeverityLevel):
            clean_severity = raw_severity
        else:
            sev_str = cls.normalize_string(raw_severity).lower()
            try:
                clean_severity = SeverityLevel(sev_str)
            except ValueError:
                clean_severity = SeverityLevel.HIGH

        # Source type validation
        raw_source_type = payload.get("source_type", SourceType.DEMO.value)
        if isinstance(raw_source_type, SourceType):
            clean_source_type = raw_source_type
        else:
            src_str = cls.normalize_string(raw_source_type).lower()
            try:
                clean_source_type = SourceType(src_str)
            except ValueError:
                clean_source_type = SourceType.DEMO

        # Confidence validation (0.0 to 1.0)
        raw_confidence = payload.get("confidence", 1.0)
        try:
            confidence = float(raw_confidence)
            if not (0.0 <= confidence <= 1.0):
                raise ValueError("Confidence must be between 0.0 and 1.0.")
        except (ValueError, TypeError) as exc:
            raise ValueError(f"Invalid confidence value '{raw_confidence}': must be a float between 0.0 and 1.0.") from exc

        # Source metadata
        source_name = cls.normalize_string(payload.get("source_name", "demo_seed.json")) or "demo_seed.json"
        source_url = payload.get("source_url")
        if source_url:
            source_url = cls.normalize_string(source_url) or None

        # ID lists and evidence preservation
        def clean_str_list(items: Any) -> List[str]:
            if not items:
                return []
            if isinstance(items, str):
                items = [items]
            if isinstance(items, (list, tuple, set)):
                result = []
                for it in items:
                    s = cls.normalize_string(it)
                    if s and s not in result:
                        result.append(s)
                return result
            return []

        affected_shipment_ids = clean_str_list(payload.get("affected_shipment_ids"))
        affected_supplier_ids = clean_str_list(payload.get("affected_supplier_ids"))

        # Preserve raw evidence exactly as provided, maintaining traceability
        raw_evidence = payload.get("evidence", [])
        evidence = clean_str_list(raw_evidence)
        if not evidence and clean_desc:
            # If no explicit evidence array was provided, record description as source evidence
            evidence = [f"Source statement: {clean_desc}"]

        return DisruptionEventCreate(
            event_type=clean_event_type,
            title=clean_title,
            description=clean_desc,
            severity=clean_severity,
            source_type=clean_source_type,
            source_name=source_name,
            source_url=source_url,
            confidence=confidence,
            affected_shipment_ids=affected_shipment_ids,
            affected_supplier_ids=affected_supplier_ids,
            evidence=evidence,
        )

    @classmethod
    def parse_alert_signal(cls, payload: Dict[str, Any]) -> DisruptionEventCreate:
        """Primary interface for parsing incoming alert payloads into validated schemas."""
        return cls.validate_and_normalize(payload)

    @classmethod
    def extract_from_unstructured_text(
        cls,
        text: str,
        source_name: str = "text_alert",
    ) -> DisruptionEventCreate:
        """Deterministic entity extraction from raw alert text without LLM hallucination.

        Treats external text strictly as untrusted evidence.
        """
        clean_text = cls.normalize_string(text)
        if not clean_text:
            raise ValueError("Alert text cannot be empty.")

        # Extract known ID patterns
        shipment_matches = re.findall(r"\bSHP-\d+\b", clean_text, re.IGNORECASE)
        supplier_matches = re.findall(r"\bSUP-[A-Z0-9]+\b", clean_text, re.IGNORECASE)

        # Normalize casing of matched IDs
        shipment_ids = list(dict.fromkeys([s.upper() for s in shipment_matches]))
        supplier_ids = list(dict.fromkeys([s.upper() for s in supplier_matches]))

        # Title: first sentence or line
        lines = [line.strip() for line in clean_text.splitlines() if line.strip()]
        title = lines[0] if lines else "Unstructured supply chain disruption alert"
        if len(title) > 80:
            title = title[:77] + "..."

        # Classify
        classification = cls.classify_disruption(
            event_type="shipping_delay" if shipment_ids else "other",
            title=title,
            description=clean_text,
        )

        return DisruptionEventCreate(
            event_type=classification.category.value,
            title=title,
            description=clean_text,
            severity=SeverityLevel.HIGH,
            source_type=SourceType.FEED,
            source_name=source_name,
            confidence=classification.confidence,
            affected_shipment_ids=shipment_ids,
            affected_supplier_ids=supplier_ids,
            evidence=[f"Extracted from raw text: '{clean_text}'"],
        )
