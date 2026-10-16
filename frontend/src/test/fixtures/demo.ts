import type {
  Dashboard,
  Incident,
  ImpactAnalysis,
  RecoveryScenario,
  ApprovalRequest,
  AuditEvent,
  DisruptionEvent,
} from "../../types/api";

export const FIXTURE_INCIDENT: Incident = {
  incident_id: "INC-001",
  event_id: "EVT-001",
  title: "Critical component shipment delayed",
  status: "OPTIONS_READY",
  severity: "high",
  selected_scenario_id: null,
  approval_id: null,
  created_at: "2026-01-01T10:00:00Z",
  updated_at: "2026-01-01T10:05:00Z",
};

export const FIXTURE_INCIDENT_AWAITING: Incident = {
  ...FIXTURE_INCIDENT,
  status: "AWAITING_APPROVAL",
  selected_scenario_id: "SCN-ALT-SUPPLIER",
  approval_id: "APR-001",
};

export const FIXTURE_INCIDENT_READY: Incident = {
  ...FIXTURE_INCIDENT,
  status: "READY_TO_EXECUTE",
  selected_scenario_id: "SCN-ALT-SUPPLIER",
  approval_id: "APR-001",
};

export const FIXTURE_INCIDENT_VERIFIED: Incident = {
  ...FIXTURE_INCIDENT,
  status: "VERIFIED",
  selected_scenario_id: "SCN-ALT-SUPPLIER",
  approval_id: "APR-001",
};

export const FIXTURE_IMPACT: ImpactAnalysis = {
  incident_id: "INC-001",
  component_impacts: [
    {
      component_id: "CMP-201",
      warehouse_id: "WH-A",
      on_hand_qty: 700,
      reserved_qty: 200,
      available_qty: 500,
      daily_demand: 100,
      coverage_days: 5,
      delayed_shipment_eta_days: 12,
      baseline_eta_days: 4,
      shipment_id: "SHP-102",
      projected_stockout_before_eta: true,
      shortage_qty: 700,
    },
  ],
  affected_order_ids: ["PO-5001", "PO-5002", "PO-5003"],
  affected_orders: [
    { order_id: "PO-5001", product_id: "PRD-100", due_in_days: 6, required_qty: 300, priority: "critical", status: "planned" },
    { order_id: "PO-5002", product_id: "PRD-220", due_in_days: 8, required_qty: 250, priority: "high", status: "planned" },
    { order_id: "PO-5003", product_id: "PRD-300", due_in_days: 10, required_qty: 400, priority: "normal", status: "planned" },
  ],
  estimated_stockout_in_days: 5,
  projected_shortage_units: 700,
  summary: "CMP-201 stock covers 5 days. SHP-102 revised ETA is 12 days.",
  assumptions: [
    "Available stock = max(0, 700 - 200) = 500 units",
    "Coverage = 500 / 100 = 5 days",
    "Delayed shipment arrives in 12 days — after baseline coverage period",
  ],
  evidence_refs: ["SHP-102", "WH-A", "demo_seed.json"],
  warnings: ["Stockout projected before SHP-102 revised ETA"],
  data_provenance: "synthetic_demo",
  computed_at: "2026-01-01T10:05:00Z",
};

export const FIXTURE_SCENARIO_ALT_SUPPLIER: RecoveryScenario = {
  scenario_id: "SCN-ALT-SUPPLIER",
  incident_id: "INC-001",
  name: "Order from approved alternate supplier (SUP-B)",
  strategy_type: "alternate_supplier",
  actions: [],
  incremental_cost: 64000,
  currency: "INR",
  arrival_days: 4,
  unmet_demand_units_before_recovery: 0,
  estimated_production_delay_days: 0,
  feasible: true,
  feasibility_reasons: ["SUP-B approved, 800 units available, 4-day lead time"],
  risk_score: 20,
  rank: 1,
  reasoning_summary: "Recommended: arrives before stockout, fully resolves the shortage.",
  policy_status: "APPROVAL_REQUIRED",
  reason_codes: ["COST_ABOVE_AUTO_APPROVAL_LIMIT"],
  plan_version: "v1.0",
};

export const FIXTURE_SCENARIO_EXPEDITE: RecoveryScenario = {
  scenario_id: "SCN-EXPEDITE",
  incident_id: "INC-001",
  name: "Expedite SHP-102 via air freight",
  strategy_type: "expedite_shipment",
  actions: [],
  incremental_cost: 90000,
  currency: "INR",
  arrival_days: 4,
  unmet_demand_units_before_recovery: 0,
  estimated_production_delay_days: 0,
  feasible: true,
  feasibility_reasons: ["Air freight available"],
  risk_score: 25,
  rank: 2,
  reasoning_summary: "Resolves shortage but highest cost option.",
  policy_status: "APPROVAL_REQUIRED",
  reason_codes: ["COST_ABOVE_AUTO_APPROVAL_LIMIT"],
  plan_version: "v1.0",
};

export const FIXTURE_SCENARIO_TRANSFER: RecoveryScenario = {
  scenario_id: "SCN-TRANSFER",
  incident_id: "INC-001",
  name: "Transfer 300 units from Warehouse B",
  strategy_type: "inventory_transfer",
  actions: [],
  incremental_cost: 12000,
  currency: "INR",
  arrival_days: 2,
  unmet_demand_units_before_recovery: 400,
  estimated_production_delay_days: 3,
  feasible: true,
  feasibility_reasons: ["300 transferable units at WH-B"],
  risk_score: 35,
  rank: 3,
  reasoning_summary: "Partial mitigation. Leaves 400-unit residual shortage.",
  policy_status: "AUTO_ALLOWED",
  reason_codes: ["RESIDUAL_SHORTAGE_RISK"],
  plan_version: "v1.0",
};

export const FIXTURE_SCENARIO_BLOCKED: RecoveryScenario = {
  scenario_id: "SCN-WAIT",
  incident_id: "INC-001",
  name: "Wait for delayed SHP-102 (baseline)",
  strategy_type: "expedite_shipment",
  actions: [],
  incremental_cost: 0,
  currency: "INR",
  arrival_days: 12,
  unmet_demand_units_before_recovery: 700,
  estimated_production_delay_days: 7,
  feasible: false,
  feasibility_reasons: ["Stockout at day 5; shipment at day 12"],
  risk_score: 90,
  rank: 4,
  reasoning_summary: "Baseline reference only. Not a recommended recovery action.",
  policy_status: "BLOCKED",
  reason_codes: ["PROJECTED_STOCKOUT", "PRODUCTION_DELAY_RISK"],
  plan_version: "v1.0",
};

export const FIXTURE_SCENARIOS = [
  FIXTURE_SCENARIO_ALT_SUPPLIER,
  FIXTURE_SCENARIO_EXPEDITE,
  FIXTURE_SCENARIO_TRANSFER,
  FIXTURE_SCENARIO_BLOCKED,
];

export const FIXTURE_APPROVAL_PENDING: ApprovalRequest = {
  approval_id: "APR-001",
  incident_id: "INC-001",
  scenario_id: "SCN-ALT-SUPPLIER",
  plan_version: "v1.0",
  status: "pending",
  requested_by: "system",
  reviewed_by: null,
  reason: "Incremental cost ₹64,000 exceeds auto-approval limit of ₹50,000.",
  created_at: "2026-01-01T10:10:00Z",
  reviewed_at: null,
  decision_comment: null,
};

export const FIXTURE_APPROVAL_APPROVED: ApprovalRequest = {
  ...FIXTURE_APPROVAL_PENDING,
  status: "approved",
  reviewed_by: "demo-operator",
  reviewed_at: "2026-01-01T10:15:00Z",
  decision_comment: "Approved for this incident and plan version.",
};

export const FIXTURE_APPROVAL_REJECTED: ApprovalRequest = {
  ...FIXTURE_APPROVAL_PENDING,
  status: "rejected",
  reviewed_by: "demo-operator",
  reviewed_at: "2026-01-01T10:15:00Z",
  decision_comment: "Rejected — alternative action required.",
};

export const FIXTURE_AUDIT_EVENTS: AuditEvent[] = [
  {
    audit_id: "AUD-001",
    incident_id: "INC-001",
    correlation_id: "corr-001",
    actor_type: "system",
    actor_id: "disruption_sensing",
    event_type: "DISRUPTION_DETECTED",
    entity_type: "Incident",
    entity_id: "INC-001",
    before_state: null,
    after_state: { status: "DETECTED" },
    reason: "Disruption event detected and incident created.",
    evidence_refs: ["SHP-102"],
    created_at: "2026-01-01T10:00:00Z",
  },
  {
    audit_id: "AUD-002",
    incident_id: "INC-001",
    correlation_id: "corr-002",
    actor_type: "agent",
    actor_id: "impact_analysis_agent",
    event_type: "IMPACT_ANALYZED",
    entity_type: "Incident",
    entity_id: "INC-001",
    before_state: { status: "DETECTED" },
    after_state: { status: "OPTIONS_READY" },
    reason: "Impact analysis completed.",
    evidence_refs: ["CMP-201", "SHP-102"],
    created_at: "2026-01-01T10:05:00Z",
  },
  {
    audit_id: "AUD-003",
    incident_id: "INC-001",
    correlation_id: "corr-003",
    actor_type: "user",
    actor_id: "demo-operator",
    event_type: "APPROVAL_APPROVED",
    entity_type: "ApprovalRequest",
    entity_id: "APR-001",
    before_state: { status: "pending" },
    after_state: { status: "approved" },
    reason: "Human reviewer approved.",
    evidence_refs: ["APR-001", "SCN-ALT-SUPPLIER"],
    created_at: "2026-01-01T10:15:00Z",
  },
  {
    audit_id: "AUD-004",
    incident_id: "INC-001",
    correlation_id: "corr-004",
    actor_type: "system",
    actor_id: "execution_service",
    event_type: "EXECUTION_COMPLETED",
    entity_type: "Incident",
    entity_id: "INC-001",
    before_state: { status: "READY_TO_EXECUTE" },
    after_state: { status: "VERIFIED", execution_mode: "simulation" },
    reason: "Simulated execution completed.",
    evidence_refs: ["ACT-001"],
    created_at: "2026-01-01T10:20:00Z",
  },
];

export const FIXTURE_DASHBOARD: Dashboard = {
  active_incidents_count: 1,
  total_incidents_count: 1,
  pending_approvals_count: 1,
  monitored_components_count: 1,
  execution_mode: "simulation",
  recent_events: [
    {
      event_id: "EVT-001",
      title: "Critical component shipment delayed",
      severity: "high",
      source_type: "demo",
      detected_at: "2026-01-01T10:00:00Z",
    },
  ],
};

export const FIXTURE_DISRUPTION: DisruptionEvent = {
  event_id: "EVT-001",
  incident_id: "INC-001",
  event_type: "shipping_delay",
  title: "Critical component shipment delayed",
  description: "SHP-102 revised ETA is 12 days from now.",
  severity: "high",
  source_type: "demo",
  source_name: "demo_seed.json",
  confidence: 1.0,
  affected_shipment_ids: ["SHP-102"],
  affected_supplier_ids: [],
  evidence: ["ETA changed to +12 days in the scenario fixture"],
  detected_at: "2026-01-01T10:00:00Z",
};
