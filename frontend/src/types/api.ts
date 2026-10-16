// Shared API types — derived from backend schemas and contract documents.
// snake_case matches JSON wire format.

export type WorkflowStatus =
  | "DETECTED"
  | "ANALYZING"
  | "OPTIONS_READY"
  | "AWAITING_APPROVAL"
  | "READY_TO_EXECUTE"
  | "EXECUTING"
  | "VERIFYING"
  | "VERIFIED"
  | "CLOSED"
  | "FAILED";

export type PolicyStatus = "AUTO_ALLOWED" | "APPROVAL_REQUIRED" | "BLOCKED";
export type ApprovalStatus = "pending" | "approved" | "rejected" | "stale";
export type SeverityLevel = "low" | "medium" | "high" | "critical";

export interface Incident {
  incident_id: string;
  event_id: string;
  title: string;
  status: WorkflowStatus;
  severity: SeverityLevel;
  impact_summary?: ImpactAnalysis | null;
  selected_scenario_id?: string | null;
  approval_id?: string | null;
  created_at: string;
  updated_at?: string;
}

export interface ComponentImpact {
  component_id: string;
  warehouse_id?: string | null;
  on_hand_qty?: number | null;
  reserved_qty?: number | null;
  available_qty: number;
  daily_demand: number;
  coverage_days?: number | null;
  delayed_shipment_eta_days?: number | null;
  baseline_eta_days?: number | null;
  shipment_id?: string | null;
  projected_stockout_before_eta: boolean;
  shortage_qty?: number | null;
}

export interface ProductionOrderRisk {
  order_id: string;
  product_id?: string | null;
  due_in_days?: number | null;
  required_qty?: number | null;
  priority?: string | null;
  status?: string | null;
}

export interface ImpactAnalysis {
  incident_id: string;
  component_impacts: ComponentImpact[];
  affected_order_ids: string[];
  affected_orders?: ProductionOrderRisk[];
  estimated_stockout_in_days?: number | null;
  projected_shortage_units: number;
  summary?: string | null;
  assumptions: string[];
  evidence_refs: string[];
  warnings?: string[];
  data_provenance?: string | null;
  computed_at: string;
}

export interface RecoveryScenario {
  scenario_id: string;
  incident_id: string;
  name: string;
  strategy_type: string;
  actions?: Record<string, unknown>[];
  incremental_cost: number;
  currency: string;
  arrival_days: number;
  unmet_demand_units_before_recovery: number;
  estimated_production_delay_days: number;
  feasible: boolean;
  feasibility_reasons: string[];
  risk_score: number;
  rank: number;
  reasoning_summary: string;
  policy_status: PolicyStatus;
  reason_codes: string[];
  plan_version: string;
}

export interface ApprovalRequest {
  approval_id: string;
  incident_id: string;
  scenario_id: string;
  plan_version: string;
  status: ApprovalStatus;
  requested_by: string;
  reviewed_by?: string | null;
  reason: string;
  created_at: string;
  reviewed_at?: string | null;
  decision_comment?: string | null;
}

export interface AuditEvent {
  audit_id: string;
  incident_id: string;
  correlation_id: string;
  actor_type: string;
  actor_id: string;
  event_type: string;
  entity_type: string;
  entity_id: string;
  before_state?: Record<string, unknown> | null;
  after_state?: Record<string, unknown> | null;
  reason?: string | null;
  evidence_refs: string[];
  created_at: string;
}

export interface Dashboard {
  active_incidents_count: number;
  total_incidents_count: number;
  pending_approvals_count: number;
  monitored_components_count: number;
  execution_mode: string;
  recent_events: Array<{
    event_id: string;
    title: string;
    severity: string;
    source_type: string;
    detected_at: string;
  }>;
}

export interface DisruptionEvent {
  event_id: string;
  incident_id?: string | null;
  event_type: string;
  title: string;
  description: string;
  severity: string;
  source_type: string;
  source_name: string;
  confidence: number;
  affected_shipment_ids: string[];
  affected_supplier_ids: string[];
  evidence: string[];
  detected_at: string;
}

export interface DisruptionCreateRequest {
  event_type: string;
  title: string;
  description: string;
  severity: string;
  source_type: string;
  source_name: string;
  confidence: number;
  affected_shipment_ids: string[];
  evidence: string[];
}

export interface DisruptionCreateResponse {
  incident_id: string;
  event_id: string;
  status: string;
  created_at: string;
}

export interface ScenarioListResponse {
  incident_id: string;
  status: string;
  impact?: Record<string, unknown> | null;
  scenarios: RecoveryScenario[];
}

export interface ScenarioSelectResponse {
  incident_id: string;
  scenario_id: string;
  plan_version: string;
  policy_status: PolicyStatus;
  approval_id?: string | null;
  workflow_status: string;
  reason_codes: string[];
}

export interface ApprovalDecisionRequest {
  decision: "approve" | "reject";
  decision_comment?: string;
  reviewed_by: string;
}

export interface ApprovalDecisionResponse {
  approval_id: string;
  status: ApprovalStatus;
  reviewed_by: string;
  decision_comment?: string | null;
  reviewed_at: string;
}

export interface ExecutionResult {
  action_id: string;
  incident_id: string;
  scenario_id: string;
  execution_status: string;
  execution_mode: string;
  updated_resource_ids: string[];
  audit_id: string;
  executed_at: string;
}

export interface ApiError {
  code: string;
  message: string;
  details?: Record<string, unknown>;
  correlation_id?: string;
}

export interface ApiErrorEnvelope {
  error: ApiError;
}
