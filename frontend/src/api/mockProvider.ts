// Mock provider — mirrors the live API interface.
// Used when VITE_DEMO_MODE=true. Never used in live API mode.
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
  ApprovalStatus,
} from "../types/api";

const STORAGE_KEY = "synchrosc_mock_state";

interface MockState {
  incidents: Incident[];
  disruptions: DisruptionEvent[];
  approvals: ApprovalRequest[];
  auditEvents: AuditEvent[];
  impacts: Record<string, ImpactAnalysis>;
  scenarios: Record<string, RecoveryScenario[]>;
  executions: Record<string, ExecutionResult>;
  idempotencyKeys: string[];
}

function now(): string {
  return new Date().toISOString();
}

function uid(prefix: string, n: number): string {
  return `${prefix}-${String(n).padStart(3, "0")}`;
}

const INITIAL_STATE: MockState = {
  incidents: [],
  disruptions: [],
  approvals: [],
  auditEvents: [],
  impacts: {},
  scenarios: {},
  executions: {},
  idempotencyKeys: [],
};

function loadState(): MockState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw) as MockState;
  } catch {
    // ignore
  }
  return { ...INITIAL_STATE };
}

function saveState(s: MockState): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
  } catch {
    // ignore
  }
}

function delay(ms = 350): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function addAudit(
  state: MockState,
  incidentId: string,
  eventType: string,
  entityType: string,
  entityId: string,
  actorType: string,
  actorId: string,
  reason: string,
  before?: Record<string, unknown> | null,
  after?: Record<string, unknown> | null,
  evidenceRefs: string[] = [],
): void {
  state.auditEvents.push({
    audit_id: `AUD-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    incident_id: incidentId,
    correlation_id: `corr-mock-${Date.now()}`,
    actor_type: actorType,
    actor_id: actorId,
    event_type: eventType,
    entity_type: entityType,
    entity_id: entityId,
    before_state: before ?? null,
    after_state: after ?? null,
    reason,
    evidence_refs: evidenceRefs,
    created_at: now(),
  });
}

// ── Public API ─────────────────────────────────────────────────────────────

export async function mockGetDashboard(): Promise<Dashboard> {
  await delay(200);
  const s = loadState();
  const active = s.incidents.filter((i) => !["VERIFIED", "CLOSED"].includes(i.status)).length;
  const pending = s.approvals.filter((a) => a.status === "pending").length;
  return {
    active_incidents_count: active,
    total_incidents_count: s.incidents.length,
    pending_approvals_count: pending,
    monitored_components_count: 1,
    execution_mode: "simulation",
    recent_events: s.disruptions.slice(0, 5).map((d) => ({
      event_id: d.event_id,
      title: d.title,
      severity: d.severity,
      source_type: d.source_type,
      detected_at: d.detected_at,
    })),
  };
}

export async function mockListDisruptions(): Promise<{ items: DisruptionEvent[]; total: number }> {
  await delay(200);
  const s = loadState();
  return { items: s.disruptions, total: s.disruptions.length };
}

export async function mockCreateDisruption(
  payload: DisruptionCreateRequest,
): Promise<DisruptionCreateResponse> {
  await delay(400);
  const s = loadState();
  const n = s.incidents.length + 1;
  const incidentId = uid("INC", n);
  const eventId = uid("EVT", n);
  const ts = now();

  const disruption: DisruptionEvent = {
    event_id: eventId,
    incident_id: incidentId,
    event_type: payload.event_type,
    title: payload.title,
    description: payload.description,
    severity: payload.severity,
    source_type: payload.source_type,
    source_name: payload.source_name,
    confidence: payload.confidence,
    affected_shipment_ids: payload.affected_shipment_ids,
    affected_supplier_ids: [],
    evidence: payload.evidence,
    detected_at: ts,
  };

  const incident: Incident = {
    incident_id: incidentId,
    event_id: eventId,
    title: payload.title,
    status: "DETECTED",
    severity: payload.severity as Incident["severity"],
    selected_scenario_id: null,
    approval_id: null,
    created_at: ts,
    updated_at: ts,
  };

  s.disruptions.unshift(disruption);
  s.incidents.unshift(incident);

  addAudit(s, incidentId, "DISRUPTION_DETECTED", "Incident", incidentId, "system", "disruption_sensing", "Disruption event detected and incident created.", null, { status: "DETECTED" }, payload.evidence);

  saveState(s);
  return { incident_id: incidentId, event_id: eventId, status: "DETECTED", created_at: ts };
}

export async function mockGetIncident(id: string): Promise<Incident> {
  await delay(150);
  const s = loadState();
  const incident = s.incidents.find((i) => i.incident_id === id);
  if (!incident) throw new Error(`Incident '${id}' was not found.`);
  return { ...incident };
}

export async function mockAnalyzeIncident(id: string): Promise<ScenarioListResponse> {
  await delay(600);
  const s = loadState();
  const incident = s.incidents.find((i) => i.incident_id === id);
  if (!incident) throw new Error(`Incident '${id}' was not found.`);

  const impact: ImpactAnalysis = {
    incident_id: id,
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
    summary: "CMP-201 stock covers 5 days at 100 units/day. SHP-102 revised ETA is 12 days — stockout before arrival.",
    assumptions: [
      "Available stock = max(0, 700 - 200) = 500 units",
      "Coverage = 500 / 100 = 5 days",
      "Delayed shipment arrives in 12 days — after baseline coverage period",
      "Daily demand is constant at 100 units/day",
      "No other supply sources assumed unless a recovery option is selected",
    ],
    evidence_refs: ["SHP-102", "WH-A", "demo_seed.json"],
    warnings: ["Stockout projected before SHP-102 revised ETA"],
    data_provenance: "synthetic_demo",
    computed_at: now(),
  };

  const scenarios: RecoveryScenario[] = [
    {
      scenario_id: "SCN-TRANSFER",
      incident_id: id,
      name: "Transfer 300 units from Warehouse B",
      strategy_type: "inventory_transfer",
      actions: [],
      incremental_cost: 12000,
      currency: "INR",
      arrival_days: 2,
      unmet_demand_units_before_recovery: 400,
      estimated_production_delay_days: 3,
      feasible: true,
      feasibility_reasons: ["300 transferable units available at WH-B"],
      risk_score: 35,
      rank: 3,
      reasoning_summary: "Fastest partial mitigation. Covers 3 days of demand but leaves a 400-unit residual shortage if used alone. Lowest cost but does not fully resolve the gap.",
      policy_status: "AUTO_ALLOWED",
      reason_codes: ["RESIDUAL_SHORTAGE_RISK", "ELEVATED_OPERATIONAL_RISK"],
      plan_version: "v1.0",
    },
    {
      scenario_id: "SCN-ALT-SUPPLIER",
      incident_id: id,
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
      reasoning_summary: "Recommended: arrives before stockout, fully resolves the shortage, lower cost than expedited freight. Requires approval because ₹64,000 exceeds the ₹50,000 auto-approval threshold.",
      policy_status: "APPROVAL_REQUIRED",
      reason_codes: ["COST_ABOVE_AUTO_APPROVAL_LIMIT"],
      plan_version: "v1.0",
    },
    {
      scenario_id: "SCN-EXPEDITE",
      incident_id: id,
      name: "Expedite SHP-102 via air freight",
      strategy_type: "expedite_shipment",
      actions: [],
      incremental_cost: 90000,
      currency: "INR",
      arrival_days: 4,
      unmet_demand_units_before_recovery: 0,
      estimated_production_delay_days: 0,
      feasible: true,
      feasibility_reasons: ["SHP-102 can be expedited; air freight available"],
      risk_score: 25,
      rank: 2,
      reasoning_summary: "Resolves the shortage but at ₹90,000 incremental freight cost — highest cost option. Requires approval. Ranked below alternate supplier on cost efficiency.",
      policy_status: "APPROVAL_REQUIRED",
      reason_codes: ["COST_ABOVE_AUTO_APPROVAL_LIMIT"],
      plan_version: "v1.0",
    },
    {
      scenario_id: "SCN-WAIT",
      incident_id: id,
      name: "Wait for delayed SHP-102 (baseline)",
      strategy_type: "expedite_shipment",
      actions: [],
      incremental_cost: 0,
      currency: "INR",
      arrival_days: 12,
      unmet_demand_units_before_recovery: 700,
      estimated_production_delay_days: 7,
      feasible: false,
      feasibility_reasons: ["Stockout occurs at day 5; shipment arrives at day 12"],
      risk_score: 90,
      rank: 4,
      reasoning_summary: "Baseline reference only. Waiting results in a 7-day production delay and 700-unit shortage. Not a recommended recovery action.",
      policy_status: "BLOCKED",
      reason_codes: ["PROJECTED_STOCKOUT", "PRODUCTION_DELAY_RISK"],
      plan_version: "v1.0",
    },
  ];

  s.impacts[id] = impact;
  s.scenarios[id] = scenarios;
  incident.status = "OPTIONS_READY";
  incident.updated_at = now();

  addAudit(s, id, "IMPACT_ANALYZED", "Incident", id, "agent", "impact_analysis_agent", "Impact analysis completed. 4 recovery options generated.", { status: "DETECTED" }, { status: "OPTIONS_READY" }, ["SHP-102", "CMP-201"]);
  addAudit(s, id, "SCENARIOS_GENERATED", "Incident", id, "agent", "scenario_planning_agent", "4 recovery scenarios generated and ranked by policy engine.", null, { scenario_count: 4 }, ["SCN-ALT-SUPPLIER", "SCN-EXPEDITE", "SCN-TRANSFER", "SCN-WAIT"]);

  saveState(s);
  return { incident_id: id, status: "OPTIONS_READY", scenarios };
}

export async function mockGetImpact(id: string): Promise<ImpactAnalysis> {
  await delay(150);
  const s = loadState();
  const impact = s.impacts[id];
  if (!impact) throw new Error(`Impact analysis for incident '${id}' is not available. Run analysis first.`);
  return { ...impact };
}

export async function mockGetScenarios(id: string): Promise<ScenarioListResponse> {
  await delay(150);
  const s = loadState();
  const scenarios = s.scenarios[id] ?? [];
  return { incident_id: id, status: "OPTIONS_READY", scenarios };
}

export async function mockSelectScenario(
  incidentId: string,
  scenarioId: string,
): Promise<ScenarioSelectResponse> {
  await delay(400);
  const s = loadState();
  const incident = s.incidents.find((i) => i.incident_id === incidentId);
  if (!incident) throw new Error(`Incident '${incidentId}' was not found.`);

  const scenarios = s.scenarios[incidentId] ?? [];
  const scenario = scenarios.find((sc) => sc.scenario_id === scenarioId);
  if (!scenario) throw new Error(`Scenario '${scenarioId}' was not found.`);

  if (scenario.policy_status === "BLOCKED") {
    throw Object.assign(new Error("This scenario is blocked by current policy and cannot be selected."), { status: 409, code: "ACTION_BLOCKED" });
  }

  const prevStatus = incident.status;
  let approvalId: string | null = null;

  if (scenario.policy_status === "APPROVAL_REQUIRED") {
    approvalId = `APR-${Date.now()}`;
    // Invalidate any previous pending approvals for this incident
    s.approvals.forEach((a) => {
      if (a.incident_id === incidentId && a.status === "pending") {
        a.status = "stale";
      }
    });
    const approval: ApprovalRequest = {
      approval_id: approvalId,
      incident_id: incidentId,
      scenario_id: scenarioId,
      plan_version: scenario.plan_version,
      status: "pending",
      requested_by: "system",
      reviewed_by: null,
      reason: `Incremental cost ₹${scenario.incremental_cost.toLocaleString("en-IN")} exceeds auto-approval limit of ₹50,000. Human approval required.`,
      created_at: now(),
      reviewed_at: null,
      decision_comment: null,
    };
    s.approvals.unshift(approval);
    incident.status = "AWAITING_APPROVAL";
    addAudit(s, incidentId, "APPROVAL_REQUESTED", "ApprovalRequest", approvalId, "system", "policy_engine", `Approval required: ${scenario.reason_codes.join(", ")}`, { status: prevStatus }, { status: "AWAITING_APPROVAL", approval_id: approvalId }, [scenarioId]);
  } else {
    incident.status = "READY_TO_EXECUTE";
    addAudit(s, incidentId, "SCENARIO_SELECTED_AUTO", "Incident", incidentId, "system", "policy_engine", "Scenario auto-allowed by policy. Ready to execute.", { status: prevStatus }, { status: "READY_TO_EXECUTE" }, [scenarioId]);
  }

  incident.selected_scenario_id = scenarioId;
  incident.approval_id = approvalId;
  incident.updated_at = now();

  addAudit(s, incidentId, "SCENARIO_SELECTED", "RecoveryScenario", scenarioId, "user", "demo-operator", `Scenario '${scenario.name}' selected.`, null, { scenario_id: scenarioId, plan_version: scenario.plan_version }, [scenarioId]);

  saveState(s);
  return {
    incident_id: incidentId,
    scenario_id: scenarioId,
    plan_version: scenario.plan_version,
    policy_status: scenario.policy_status,
    approval_id: approvalId,
    workflow_status: incident.status,
    reason_codes: scenario.reason_codes,
  };
}

export async function mockListApprovals(): Promise<{ items: ApprovalRequest[] }> {
  await delay(150);
  const s = loadState();
  return { items: s.approvals };
}

export async function mockSubmitDecision(
  approvalId: string,
  decision: "approve" | "reject",
  comment: string,
  reviewedBy: string,
): Promise<ApprovalDecisionResponse> {
  await delay(400);
  const s = loadState();
  const approval = s.approvals.find((a) => a.approval_id === approvalId);
  if (!approval) throw new Error(`Approval '${approvalId}' was not found.`);
  if (approval.status !== "pending") {
    throw Object.assign(
      new Error(`Approval '${approvalId}' is already in state '${approval.status}'.`),
      { status: 409, code: "APPROVAL_ALREADY_RESOLVED" },
    );
  }

  const incident = s.incidents.find((i) => i.incident_id === approval.incident_id);
  if (!incident) throw new Error(`Incident '${approval.incident_id}' was not found.`);

  const ts = now();
  const newStatus: ApprovalStatus = decision === "approve" ? "approved" : "rejected";
  approval.status = newStatus;
  approval.reviewed_by = reviewedBy;
  approval.decision_comment = comment;
  approval.reviewed_at = ts;

  const prevStatus = incident.status;
  if (decision === "approve") {
    incident.status = "READY_TO_EXECUTE";
    addAudit(s, incident.incident_id, "APPROVAL_APPROVED", "ApprovalRequest", approvalId, "user", reviewedBy, `Human reviewer approved: ${comment}`, { status: "pending" }, { status: "approved", decision_comment: comment }, [approvalId, approval.scenario_id]);
  } else {
    incident.status = "OPTIONS_READY";
    incident.selected_scenario_id = null;
    incident.approval_id = null;
    addAudit(s, incident.incident_id, "APPROVAL_REJECTED", "ApprovalRequest", approvalId, "user", reviewedBy, `Human reviewer rejected: ${comment}`, { status: prevStatus }, { status: "rejected", decision_comment: comment }, [approvalId, approval.scenario_id]);
  }
  incident.updated_at = ts;

  saveState(s);
  return { approval_id: approvalId, status: newStatus, reviewed_by: reviewedBy, decision_comment: comment, reviewed_at: ts };
}

export async function mockExecuteAction(
  scenarioId: string,
  incidentId: string,
  approvalId?: string | null,
  idempotencyKey?: string,
): Promise<ExecutionResult> {
  await delay(700);
  const s = loadState();

  if (idempotencyKey && s.idempotencyKeys.includes(idempotencyKey)) {
    throw Object.assign(new Error("Duplicate execution request. This action has already been submitted."), { status: 409, code: "DUPLICATE_EXECUTION" });
  }

  const incident = s.incidents.find((i) => i.incident_id === incidentId);
  if (!incident) throw new Error(`Incident '${incidentId}' was not found.`);

  const scenarios = s.scenarios[incidentId] ?? [];
  const scenario = scenarios.find((sc) => sc.scenario_id === scenarioId);
  if (!scenario) throw new Error(`Scenario '${scenarioId}' was not found.`);

  if (scenario.policy_status === "BLOCKED") {
    throw Object.assign(new Error("This scenario is blocked by current policy and cannot be executed."), { status: 409, code: "ACTION_BLOCKED" });
  }

  if (scenario.policy_status === "APPROVAL_REQUIRED") {
    if (!approvalId) {
      throw Object.assign(new Error("This scenario requires an approved approval request before execution."), { status: 409, code: "APPROVAL_REQUIRED" });
    }
    const approval = s.approvals.find((a) => a.approval_id === approvalId);
    if (!approval || approval.status !== "approved") {
      throw Object.assign(new Error("The approval request is not in approved state. Execution is not permitted."), { status: 409, code: "APPROVAL_NOT_APPROVED" });
    }
  }

  if (incident.status !== "READY_TO_EXECUTE") {
    throw Object.assign(new Error(`Incident is in state '${incident.status}'. Execution requires READY_TO_EXECUTE.`), { status: 409, code: "ILLEGAL_STATE_TRANSITION" });
  }

  if (idempotencyKey) s.idempotencyKeys.push(idempotencyKey);

  const actionId = `ACT-${Date.now()}`;
  const auditId = `AUD-EXEC-${Date.now()}`;
  const ts = now();

  incident.status = "VERIFIED";
  incident.updated_at = ts;

  const result: ExecutionResult = {
    action_id: actionId,
    incident_id: incidentId,
    scenario_id: scenarioId,
    execution_status: "completed",
    execution_mode: "simulation",
    updated_resource_ids: [incidentId, scenarioId, ...(approvalId ? [approvalId] : [])],
    audit_id: auditId,
    executed_at: ts,
  };

  s.executions[actionId] = result;

  addAudit(s, incidentId, "EXECUTION_STARTED", "Incident", incidentId, "system", "execution_service", "Simulated execution started.", { status: "READY_TO_EXECUTE" }, { status: "EXECUTING" }, [scenarioId]);
  addAudit(s, incidentId, "EXECUTION_COMPLETED", "Incident", incidentId, "system", "execution_service", `Simulated execution completed. Action ${actionId} recorded.`, { status: "EXECUTING" }, { status: "VERIFIED", action_id: actionId }, [scenarioId, actionId]);
  addAudit(s, incidentId, "VERIFICATION_COMPLETED", "Incident", incidentId, "system", "verification_service", "Outcome verification recorded. All actions are simulated — no live system was modified.", { status: "EXECUTING" }, { status: "VERIFIED", execution_mode: "simulation" }, [auditId]);

  saveState(s);
  return result;
}

export async function mockGetAudit(incidentId: string): Promise<{ incident_id: string; items: AuditEvent[] }> {
  await delay(150);
  const s = loadState();
  const items = s.auditEvents
    .filter((e) => e.incident_id === incidentId)
    .sort((a, b) => a.created_at.localeCompare(b.created_at));
  return { incident_id: incidentId, items };
}

export function mockResetState(): void {
  localStorage.removeItem(STORAGE_KEY);
}
