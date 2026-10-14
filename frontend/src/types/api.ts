export type Severity = "low" | "medium" | "high" | "critical";
export type WorkflowStatus =
  | "DETECTED" | "ANALYZING" | "OPTIONS_READY" | "AWAITING_APPROVAL"
  | "READY_TO_EXECUTE" | "EXECUTING" | "VERIFYING" | "VERIFIED" | "CLOSED" | "FAILED";
export type PolicyStatus = "AUTO_ALLOWED" | "APPROVAL_REQUIRED" | "BLOCKED";

export interface DashboardSummary {
  active_incidents_count: number;
  total_incidents_count: number;
  pending_approvals_count: number;
  monitored_components_count: number;
  execution_mode: string;
  recent_events: Array<{ event_id: string; title: string; severity: Severity; source_type: string; detected_at: string }>;
}
export interface DisruptionEvent {
  event_id: string; incident_id: string; event_type: string; title: string; description: string;
  severity: Severity; source_type: string; source_name: string; confidence: number;
  affected_shipment_ids: string[]; evidence: string[]; detected_at: string;
}
export interface Incident {
  incident_id: string; event_id: string; title: string; status: WorkflowStatus; severity: Severity;
  impact_summary?: string | null; selected_scenario_id?: string | null; approval_id?: string | null;
  created_at: string; updated_at: string;
}
export interface ComponentImpact {
  component_id: string; available_qty: number; daily_demand: number; coverage_days: number | null;
  delayed_shipment_eta_days: number | null; projected_stockout_before_eta: boolean;
}
export interface ImpactAnalysis {
  incident_id: string; component_impacts: ComponentImpact[]; affected_order_ids: string[];
  estimated_stockout_in_days: number | null; projected_shortage_units: number;
  assumptions: string[]; evidence_refs: string[]; computed_at: string;
}
export interface RecoveryScenario {
  scenario_id: string; incident_id: string; name: string; strategy_type: string;
  actions: Array<Record<string, unknown>>; incremental_cost: number; currency: string;
  arrival_days: number; unmet_demand_units_before_recovery: number; estimated_production_delay_days: number;
  feasible: boolean; feasibility_reasons: string[]; risk_score: number; rank: number;
  reasoning_summary: string; policy_status: PolicyStatus; reason_codes: string[]; plan_version: string;
}
export interface ScenarioList {
  incident_id: string; status: WorkflowStatus; impact?: Record<string, unknown> | null;
  scenarios: RecoveryScenario[];
}
export interface Approval {
  approval_id: string; incident_id: string; scenario_id: string; plan_version: string; status: string;
  requested_by: string; reviewed_by?: string | null; reason: string; created_at: string;
  reviewed_at?: string | null; decision_comment?: string | null;
}
export interface AuditEvent {
  audit_id: string; incident_id: string; event_type: string; actor_type: string; actor_id: string;
  reason: string; evidence_refs: string[]; created_at: string;
}
export interface ExecutionResult {
  action_id: string; incident_id: string; scenario_id: string; execution_status: string;
  execution_mode: string; updated_resource_ids: string[]; audit_id: string; executed_at: string;
}
export interface Health {
  status: string; database: string; execution_mode: string; app_env: string; llm_provider: string;
}
