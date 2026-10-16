import type {
  Dashboard,
  DisruptionCreateRequest,
  DisruptionCreateResponse,
  DisruptionEvent,
  ImpactAnalysis,
  Incident,
  ApprovalRequest,
  ApprovalDecisionResponse,
  AuditEvent,
  RecoveryScenario,
  ScenarioListResponse,
  ScenarioSelectResponse,
  ExecutionResult,
  ApiErrorEnvelope,
} from "../types/api";

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:8000/api";

export class ApiRequestError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly correlationId?: string,
    public readonly details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "ApiRequestError";
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${API_BASE}${path}`, {
      ...init,
      headers: {
        "Content-Type": "application/json",
        ...init?.headers,
      },
    });
  } catch {
    throw new ApiRequestError(0, "NETWORK_ERROR", "Cannot reach the SynchroSC API. Check that the backend is running.");
  }

  let body: unknown;
  const contentType = response.headers.get("content-type") ?? "";
  if (contentType.includes("application/json")) {
    body = await response.json().catch(() => ({}));
  } else {
    body = {};
  }

  if (!response.ok) {
    const envelope = body as Partial<ApiErrorEnvelope>;
    const err = envelope?.error;
    throw new ApiRequestError(
      response.status,
      err?.code ?? "REQUEST_FAILED",
      err?.message ?? `Request failed (${response.status})`,
      err?.correlation_id,
      err?.details,
    );
  }

  return body as T;
}

// ── Dashboard ──────────────────────────────────────────────────────────────
export const getDashboard = () => request<Dashboard>("/dashboard/summary");

// ── Disruptions ────────────────────────────────────────────────────────────
export const listDisruptions = () =>
  request<{ items: DisruptionEvent[]; total: number }>("/disruptions");

export const createDisruption = (payload: DisruptionCreateRequest) =>
  request<DisruptionCreateResponse>("/disruptions", {
    method: "POST",
    body: JSON.stringify(payload),
  });

// ── Incidents ──────────────────────────────────────────────────────────────
export const getIncident = (id: string) =>
  request<Incident>(`/incidents/${encodeURIComponent(id)}`);

export const analyzeIncident = (id: string) =>
  request<ScenarioListResponse>(`/incidents/${encodeURIComponent(id)}/analyze`, {
    method: "POST",
  });

export const getImpact = (id: string) =>
  request<ImpactAnalysis>(`/incidents/${encodeURIComponent(id)}/impact`);

export const getScenarios = (id: string) =>
  request<ScenarioListResponse>(`/incidents/${encodeURIComponent(id)}/scenarios`);

export const selectScenario = (incidentId: string, scenarioId: string) =>
  request<ScenarioSelectResponse>(
    `/incidents/${encodeURIComponent(incidentId)}/select-scenario`,
    { method: "POST", body: JSON.stringify({ scenario_id: scenarioId }) },
  );

// ── Approvals ──────────────────────────────────────────────────────────────
export const listApprovals = () =>
  request<{ items: ApprovalRequest[] }>("/approvals");

export const submitDecision = (
  approvalId: string,
  decision: "approve" | "reject",
  comment = "Reviewed in the control tower.",
  reviewedBy = "demo-operator",
) =>
  request<ApprovalDecisionResponse>(
    `/approvals/${encodeURIComponent(approvalId)}/decision`,
    {
      method: "POST",
      body: JSON.stringify({ decision, decision_comment: comment, reviewed_by: reviewedBy }),
    },
  );

// ── Actions ────────────────────────────────────────────────────────────────
export const executeAction = (
  scenarioId: string,
  incidentId: string,
  approvalId?: string | null,
) =>
  request<ExecutionResult>(
    `/actions/${encodeURIComponent(scenarioId)}/execute`,
    {
      method: "POST",
      headers: { "Idempotency-Key": crypto.randomUUID() },
      body: JSON.stringify({
        incident_id: incidentId,
        ...(approvalId ? { approval_id: approvalId } : {}),
      }),
    },
  );

// ── Audit ──────────────────────────────────────────────────────────────────
export const getAudit = (incidentId: string) =>
  request<{ incident_id: string; items: AuditEvent[] }>(
    `/incidents/${encodeURIComponent(incidentId)}/audit`,
  );

// ── Health ─────────────────────────────────────────────────────────────────
export const getHealth = () => request<{ status: string }>("/health");

// ── Demo convenience ───────────────────────────────────────────────────────
export const DEMO_DISRUPTION_PAYLOAD: DisruptionCreateRequest = {
  event_type: "shipping_delay",
  title: "Critical component shipment delayed",
  description: "SHP-102 revised ETA is 12 days from now.",
  severity: "high",
  source_type: "demo",
  source_name: "demo_seed.json",
  confidence: 1.0,
  affected_shipment_ids: ["SHP-102"],
  evidence: ["ETA changed to +12 days in the scenario fixture"],
};

// Re-export types for convenience
export type { RecoveryScenario, Incident, ImpactAnalysis, ApprovalRequest, AuditEvent, Dashboard };
