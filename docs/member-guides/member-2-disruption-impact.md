# Member 2 — Disruption Sensing and Impact Analysis

## Your mission

Turn external or simulated signals into a typed, evidence-linked disruption event, then calculate which inventory and production commitments are at risk. Your module must produce reliable structured data, not merely a chatbot summary.

## Owned paths

- `backend/app/agents/disruption_sensing.py`
- `backend/app/services/impact_analysis.py`
- `backend/app/schemas/disruption.py`
- `backend/app/schemas/impact.py`
- `backend/app/api/routes/disruptions.py`
- `backend/app/api/routes/impact.py` (or contribute the impact endpoint to a clearly agreed route file)
- Unit tests for detection and impact calculations

Coordinate with Member 1 on `common.py`, DB/repository setup, and router registration. Don't edit `main.py` or router aggregation; Member 1 integrates your router.

## Inputs

- A typed disruption event.
- Shipment records and shipment-to-component mapping.
- Inventory on hand, reserved inventory, daily demand, and warehouse ID.
- Production orders and component requirements.
- Event evidence/source provenance.

## Outputs

`ImpactAnalysis`, including affected shipment/component/order IDs, current available quantity, daily demand, coverage days, ETA relative to now, projected stockout-before-arrival, estimated shortage exposure, assumptions, timestamps, and evidence references.

## Required behaviour

1. Validate and normalise event type/severity/source fields.
2. Preserve the original alert text and evidence metadata; don't silently replace it with an LLM-generated claim.
3. Resolve affected shipment IDs to known records. Return a structured warning if an ID is unknown; don't make up records.
4. Calculate `available_qty = max(0, on_hand_qty - reserved_qty)`.
5. Calculate `coverage_days = available_qty / daily_demand` only when demand is positive.
6. Compare coverage against the delayed ETA and map component requirements to production orders.
7. Produce a human-readable summary supported by the calculated fields and evidence.
8. Use deterministic demo fixtures when no external signal provider is configured.

## Optional LLM use

You may add a text-to-event extraction function. It must return proposed typed fields plus confidence and evidence. Pydantic validation is mandatory. Low-confidence or schema-invalid output should require review or use a demo fixture. The LLM does not set cost, supplier approval, final risk disposition, or workflow state.

## Suggested service interface

```python
async def analyze_impact(incident_id: str) -> ImpactAnalysis:
    """Read persisted event/supply data; return typed, reproducible impact results."""
```

## Required tests

- 500 available units at 100/day => 5 days of coverage.
- 700 on hand minus 200 reserved => 500 available.
- Zero demand => coverage `null`, no crash.
- `SHP-102` with ETA 12 days is delayed beyond 5-day stock coverage.
- Affected production orders are found through component requirements.
- Unknown shipment/component IDs create a warning and never produce fabricated impact.
- Repeat run over unchanged inputs produces the same numeric values.

## Done means

A demo event can be posted to the API and the frontend can display impact data with evidence. Every displayed metric can be traced to a known fixture field or formula. The module returns typed objects, not custom keys that differ from `docs/03-domain-model-and-contracts.md`.
