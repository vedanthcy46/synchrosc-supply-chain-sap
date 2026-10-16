// Provider — switches between mock and live API based on VITE_DEMO_MODE.
// All pages import from here, never directly from client.ts or mockProvider.ts.
import * as live from "./client";
import * as mock from "./mockProvider";
import type {
  DisruptionCreateRequest,
  DisruptionCreateResponse,
  DisruptionEvent,
  Dashboard,
  ImpactAnalysis,
  Incident,
  ApprovalRequest,
  ApprovalDecisionResponse,
  AuditEvent,
  ScenarioListResponse,
  ScenarioSelectResponse,
  ExecutionResult,
} from "../types/api";

export const IS_DEMO_MODE = import.meta.env.VITE_DEMO_MODE === "true";

export const provider = {
  getDashboard: (): Promise<Dashboard> =>
    IS_DEMO_MODE ? mock.mockGetDashboard() : live.getDashboard(),

  listDisruptions: (): Promise<{ items: DisruptionEvent[]; total: number }> =>
    IS_DEMO_MODE ? mock.mockListDisruptions() : live.listDisruptions(),

  createDisruption: (payload: DisruptionCreateRequest): Promise<DisruptionCreateResponse> =>
    IS_DEMO_MODE ? mock.mockCreateDisruption(payload) : live.createDisruption(payload),

  getIncident: (id: string): Promise<Incident> =>
    IS_DEMO_MODE ? mock.mockGetIncident(id) : live.getIncident(id),

  analyzeIncident: (id: string): Promise<ScenarioListResponse> =>
    IS_DEMO_MODE ? mock.mockAnalyzeIncident(id) : live.analyzeIncident(id),

  getImpact: (id: string): Promise<ImpactAnalysis> =>
    IS_DEMO_MODE ? mock.mockGetImpact(id) : live.getImpact(id),

  getScenarios: (id: string): Promise<ScenarioListResponse> =>
    IS_DEMO_MODE ? mock.mockGetScenarios(id) : live.getScenarios(id),

  selectScenario: (incidentId: string, scenarioId: string): Promise<ScenarioSelectResponse> =>
    IS_DEMO_MODE
      ? mock.mockSelectScenario(incidentId, scenarioId)
      : live.selectScenario(incidentId, scenarioId),

  listApprovals: (): Promise<{ items: ApprovalRequest[] }> =>
    IS_DEMO_MODE ? mock.mockListApprovals() : live.listApprovals(),

  submitDecision: (
    approvalId: string,
    decision: "approve" | "reject",
    comment?: string,
    reviewedBy?: string,
  ): Promise<ApprovalDecisionResponse> =>
    IS_DEMO_MODE
      ? mock.mockSubmitDecision(approvalId, decision, comment ?? "Reviewed in the control tower.", reviewedBy ?? "demo-operator")
      : live.submitDecision(approvalId, decision, comment, reviewedBy),

  executeAction: (
    scenarioId: string,
    incidentId: string,
    approvalId?: string | null,
  ): Promise<ExecutionResult> =>
    IS_DEMO_MODE
      ? mock.mockExecuteAction(scenarioId, incidentId, approvalId, crypto.randomUUID())
      : live.executeAction(scenarioId, incidentId, approvalId),

  getAudit: (incidentId: string): Promise<{ incident_id: string; items: AuditEvent[] }> =>
    IS_DEMO_MODE ? mock.mockGetAudit(incidentId) : live.getAudit(incidentId),
};

export { live, mock };
export { DEMO_DISRUPTION_PAYLOAD } from "./client";
