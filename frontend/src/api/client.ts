import type {
  Approval, AuditEvent, DashboardSummary, DisruptionEvent, ExecutionResult,
  Health, ImpactAnalysis, Incident, RecoveryScenario, ScenarioList,
} from "../types/api";

const baseUrl = (import.meta.env.VITE_API_BASE_URL || "/api").replace(/\/$/, "");

export class ApiError extends Error {
  constructor(message: string, public status: number, public code?: string) {
    super(message);
    this.name = "ApiError";
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${baseUrl}${path}`, {
      ...init,
      headers: { "Content-Type": "application/json", ...init?.headers },
    });
  } catch {
    throw new ApiError("Can't reach the control tower API. Check that the backend is running and try again.", 0);
  }
  if (!response.ok) {
    const body = await response.json().catch(() => null) as {
      detail?: string; error?: { message?: string; code?: string };
    } | null;
    throw new ApiError(
      body?.error?.message || body?.detail || `Request failed (${response.status}).`,
      response.status,
      body?.error?.code,
    );
  }
  return response.json() as Promise<T>;
}

export const api = {
  health: () => request<Health>("/health"),
  dashboard: () => request<DashboardSummary>("/dashboard/summary"),
  disruptions: () => request<{ items: DisruptionEvent[] }>("/disruptions"),
  approvals: () => request<{ items: Approval[] }>("/approvals"),
  incident: (id: string) => request<Incident>(`/incidents/${encodeURIComponent(id)}`),
  impact: (id: string) => request<ImpactAnalysis>(`/incidents/${encodeURIComponent(id)}/impact`),
  scenarios: (id: string) => request<ScenarioList>(`/incidents/${encodeURIComponent(id)}/scenarios`),
  audit: (id: string) => request<{ incident_id: string; items: AuditEvent[] }>(`/incidents/${encodeURIComponent(id)}/audit`),
  createDisruption: (input: {
    event_type: string; title: string; description: string; severity: string; source_type: string;
    source_name: string; confidence: number; affected_shipment_ids: string[]; evidence: string[];
  }) => request<{ incident_id: string; event_id: string; status: string; created_at: string }>("/disruptions", {
    method: "POST", body: JSON.stringify(input),
  }),
  analyze: (id: string) => request<ScenarioList>(`/incidents/${encodeURIComponent(id)}/analyze`, { method: "POST" }),
  selectScenario: (incidentId: string, scenarioId: string) => request<{
    incident_id: string; scenario_id: string; plan_version: string; policy_status: string;
    approval_id?: string | null; workflow_status: string; reason_codes: string[];
  }>(`/incidents/${encodeURIComponent(incidentId)}/select-scenario`, {
    method: "POST", body: JSON.stringify({ scenario_id: scenarioId }),
  }),
  decideApproval: (id: string, decision: "approve" | "reject") => request<{
    approval_id: string; status: string; reviewed_by: string; reviewed_at: string;
  }>(`/approvals/${encodeURIComponent(id)}/decision`, {
    method: "POST", body: JSON.stringify({ decision, reviewed_by: "demo-operator" }),
  }),
  execute: (scenarioId: string, incidentId: string, approvalId?: string | null) => request<ExecutionResult>(
    `/actions/${encodeURIComponent(scenarioId)}/execute`, {
      method: "POST",
      headers: { "Idempotency-Key": `synchrosc-${crypto.randomUUID()}` },
      body: JSON.stringify({ incident_id: incidentId, ...(approvalId ? { approval_id: approvalId } : {}) }),
    },
  ),
};

export type { RecoveryScenario };
