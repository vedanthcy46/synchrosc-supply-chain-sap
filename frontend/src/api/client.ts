const API_BASE = import.meta.env.VITE_API_BASE_URL || "http://localhost:8000/api";

export type Incident = {
  incident_id: string;
  event_id: string;
  title: string;
  status: string;
  severity: string;
  impact_summary?: Impact;
  selected_scenario_id?: string | null;
  approval_id?: string | null;
  created_at: string;
};

export type Impact = {
  incident_id: string;
  component_impacts: Array<{
    component_id: string;
    available_qty: number;
    daily_demand: number;
    coverage_days: number | null;
    delayed_shipment_eta_days: number | null;
    projected_stockout_before_eta: boolean;
  }>;
  affected_order_ids: string[];
  projected_shortage_units: number;
  assumptions: string[];
  evidence_refs: string[];
};

export type Scenario = {
  scenario_id: string;
  incident_id: string;
  name: string;
  strategy_type: string;
  actions: Array<Record<string, unknown>>;
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
  policy_status: "AUTO_ALLOWED" | "APPROVAL_REQUIRED" | "BLOCKED";
  reason_codes: string[];
  plan_version: string;
};

export type Approval = {
  approval_id: string;
  incident_id: string;
  scenario_id: string;
  plan_version: string;
  status: "pending" | "approved" | "rejected" | "stale";
  requested_by: string;
  reviewed_by?: string | null;
  reason: string;
  created_at: string;
  reviewed_at?: string | null;
  decision_comment?: string | null;
};

export type AuditEvent = {
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
};

export type Dashboard = {
  active_incidents_count: number;
  total_incidents_count: number;
  pending_approvals_count: number;
  monitored_components_count: number;
  execution_mode: string;
  recent_events: Array<{ event_id: string; title: string; severity: string; source_type: string; detected_at: string }>;
};

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", ...init?.headers },
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = body?.error;
    throw new Error(error?.message || `Request failed (${response.status})`);
  }
  return body as T;
}

export const api = {
  dashboard: () => request<Dashboard>("/dashboard/summary"),
  disruptions: () => request<{ items: Array<{ incident_id?: string; event_id: string; title: string; severity: string; detected_at: string }> }>("/disruptions"),
  incident: (id: string) => request<Incident>(`/incidents/${encodeURIComponent(id)}`),
  impact: (id: string) => request<Impact>(`/incidents/${encodeURIComponent(id)}/impact`),
  scenarios: (id: string) => request<{ scenarios: Scenario[] }>(`/incidents/${encodeURIComponent(id)}/scenarios`),
  audit: (id: string) => request<{ items: AuditEvent[] }>(`/incidents/${encodeURIComponent(id)}/audit`),
  approvals: () => request<{ items: Approval[] }>("/approvals"),
  createDemoDisruption: () => request<{ incident_id: string }>("/disruptions", {
    method: "POST",
    body: JSON.stringify({
      event_type: "shipping_delay",
      title: "Critical component shipment delayed",
      description: "SHP-102 revised ETA is 12 days from now.",
      severity: "high",
      source_type: "demo",
      source_name: "demo_seed.json",
      confidence: 1,
      affected_shipment_ids: ["SHP-102"],
      evidence: ["ETA changed to +12 days in the scenario fixture"],
    }),
  }),
  analyze: (id: string) => request<{ scenarios: Scenario[] }>(`/incidents/${encodeURIComponent(id)}/analyze`, { method: "POST" }),
  selectScenario: (id: string, scenarioId: string) => request<{ approval_id?: string | null; workflow_status: string }>(
    `/incidents/${encodeURIComponent(id)}/select-scenario`,
    { method: "POST", body: JSON.stringify({ scenario_id: scenarioId }) },
  ),
  decide: (id: string, decision: "approve" | "reject") => request<Approval>(`/approvals/${encodeURIComponent(id)}/decision`, {
    method: "POST",
    body: JSON.stringify({ decision, reviewed_by: "demo-operator", decision_comment: "Reviewed in the control tower." }),
  }),
  execute: (scenarioId: string, incidentId: string, approvalId?: string | null) => request<{ execution_mode: string; execution_status: string }>(
    `/actions/${encodeURIComponent(scenarioId)}/execute`,
    {
      method: "POST",
      headers: { "Idempotency-Key": crypto.randomUUID() },
      body: JSON.stringify({ incident_id: incidentId, ...(approvalId ? { approval_id: approvalId } : {}) }),
    },
  ),
};
