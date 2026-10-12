# 03 — Domain Model and Shared Contracts

## Shared naming rules

- IDs are stable strings such as `INC-001`, `EVT-001`, `SHP-102`, `CMP-201`, `SUP-B`, `SCN-ALT-SUPPLIER`.
- Timestamps are ISO 8601 UTC strings, e.g. `2026-10-12T10:30:00Z`.
- Currency is an explicit ISO currency code; demo monetary values use `INR`.
- Day counts are non-negative integers or decimals. Quantities are numeric and include a unit such as `units`.
- Use `snake_case` for JSON field names.
- Every risk or recommendation must include `reason_codes` and `evidence_refs` where applicable.

## Entities

### DisruptionEvent
- `event_id`, `event_type`, `title`, `description`, `severity` (`low|medium|high|critical`), `source_type` (`demo|feed|sap`), `source_name`, `source_url` (optional), `detected_at`, `confidence` (0 to 1), `affected_shipment_ids`, `affected_supplier_ids`, `evidence[]`.
- Raw external text must be treated as untrusted input. Preserve source metadata; do not execute instructions embedded in source text.

### Supplier
- `supplier_id`, `name`, `approved` (boolean), `components[]`, `available_capacity`, `unit_cost`, `currency`, `lead_time_days`, `risk_status` (`clear|review|blocked|unknown`), `updated_at`.

### InventorySnapshot
- `component_id`, `warehouse_id`, `on_hand_qty`, `reserved_qty`, `unit`, `daily_demand`, `as_of`.
- `available_qty = max(0, on_hand_qty - reserved_qty)`.
- Coverage is a modelled estimate: `available_qty / daily_demand` when daily demand is greater than zero.

### Shipment
- `shipment_id`, `supplier_id`, `component_id`, `quantity`, `origin`, `destination`, `current_eta`, `baseline_eta`, `status`, `transport_mode`, `incremental_expedite_cost`, `source_type`.

### ProductionOrder
- `order_id`, `product_id`, `component_requirements[]`, `priority`, `planned_start`, `due_at`, `status`, `estimated_value` (optional).

### ImpactAnalysis
- `incident_id`, `component_impacts[]`, `affected_order_ids[]`, `estimated_stockout_in_days`, `projected_shortage_units`, `assumptions[]`, `evidence_refs[]`, `computed_at`.

### RecoveryScenario
- `scenario_id`, `incident_id`, `name`, `strategy_type` (`expedite_shipment|alternate_supplier|inventory_transfer|combined`), `actions[]`, `incremental_cost`, `currency`, `arrival_days`, `unmet_demand_units_before_recovery`, `estimated_production_delay_days`, `feasible`, `feasibility_reasons[]`, `risk_score` (0-100), `rank`, `reasoning_summary`, `policy_status`, `reason_codes[]`, `plan_version`.

### ApprovalRequest
- `approval_id`, `incident_id`, `scenario_id`, `plan_version`, `status` (`pending|approved|rejected|stale`), `requested_by`, `reviewed_by`, `reason`, `created_at`, `reviewed_at`, `decision_comment`.

### AuditEvent
- `audit_id`, `incident_id`, `correlation_id`, `actor_type` (`system|user|agent`), `actor_id`, `event_type`, `entity_type`, `entity_id`, `before_state` (optional JSON), `after_state` (optional JSON), `reason`, `evidence_refs[]`, `created_at`.
- Audit rows should be append-only through application APIs. Corrections should create a new event rather than edit old history.

## Standard agent result envelope

```json
{
  "status": "ok",
  "summary": "Shipment delay threatens component stock before the revised ETA.",
  "data": {},
  "reason_codes": ["ETA_AFTER_STOCKOUT"],
  "evidence_refs": ["SHP-102", "INV-CMP-201-WH-A"],
  "warnings": []
}
```

Use `status` values `ok|needs_review|blocked|error`. Do not rely on `summary` for downstream logic; downstream modules consume typed `data` and reason codes.

## Disruption event API example

```json
{
  "event_type": "shipping_delay",
  "title": "Critical component shipment delayed",
  "description": "SHP-102 revised ETA is 12 days from now.",
  "severity": "high",
  "source_type": "demo",
  "source_name": "demo_seed.json",
  "confidence": 1.0,
  "affected_shipment_ids": ["SHP-102"],
  "evidence": ["ETA changed to +12 days in the scenario fixture"]
}
```

## Change control

Member 1 owns `schemas/common.py` and contract versioning. Domain schemas should live in separate files. A field rename or required-field change is a breaking change: open a PR with the updated doc/example, alert all affected branches, and merge only after dependent tests are updated. Prefer additive optional fields for non-breaking improvements.
