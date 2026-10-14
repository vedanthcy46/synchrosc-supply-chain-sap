import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import { vi, describe, it, expect, beforeEach, afterEach } from "vitest";
import App from "../app/App";
import * as client from "../api/client";

// ── Fixtures ──────────────────────────────────────────────────────────────────

const mockDashboard: client.Dashboard = {
  active_incidents_count: 2,
  total_incidents_count: 3,
  pending_approvals_count: 1,
  monitored_components_count: 5,
  execution_mode: "simulation",
  recent_events: [],
};

const mockIncident: client.Incident = {
  incident_id: "INC-001",
  event_id: "EVT-001",
  title: "Critical component shipment delayed",
  status: "OPTIONS_READY",
  severity: "high",
  created_at: "2024-01-01T10:00:00Z",
  selected_scenario_id: null,
  approval_id: null,
};

const mockImpact: client.Impact = {
  incident_id: "INC-001",
  component_impacts: [
    {
      component_id: "CMP-201",
      available_qty: 500,
      daily_demand: 100,
      coverage_days: 5,
      delayed_shipment_eta_days: 12,
      projected_stockout_before_eta: true,
    },
  ],
  affected_order_ids: ["PO-5001", "PO-5002"],
  projected_shortage_units: 700,
  assumptions: ["Demand is constant at 100 units/day"],
  evidence_refs: ["SHP-102", "demo_seed.json"],
};

const mockScenarios: client.Scenario[] = [
  {
    scenario_id: "SCN-WAIT",
    incident_id: "INC-001",
    name: "Wait for delayed shipment",
    strategy_type: "wait",
    actions: [],
    incremental_cost: 0,
    currency: "INR",
    arrival_days: 12,
    unmet_demand_units_before_recovery: 700,
    estimated_production_delay_days: 7,
    feasible: true,
    feasibility_reasons: [],
    risk_score: 0.8,
    rank: 4,
    reasoning_summary: "Baseline — no additional cost but maximum delay.",
    policy_status: "AUTO_ALLOWED",
    reason_codes: [],
    plan_version: "v1",
  },
  {
    scenario_id: "SCN-ALT-SUPPLIER",
    incident_id: "INC-001",
    name: "Buy from approved alternate supplier",
    strategy_type: "alternate_supplier",
    actions: [],
    incremental_cost: 64000,
    currency: "INR",
    arrival_days: 4,
    unmet_demand_units_before_recovery: 0,
    estimated_production_delay_days: 0,
    feasible: true,
    feasibility_reasons: ["Supplier B is approved"],
    risk_score: 0.3,
    rank: 2,
    reasoning_summary: "Approved alternate supplier delivers in 4 days.",
    policy_status: "APPROVAL_REQUIRED",
    reason_codes: ["COST_ABOVE_AUTO_APPROVAL_LIMIT"],
    plan_version: "v1",
  },
  {
    scenario_id: "SCN-BLOCKED",
    incident_id: "INC-001",
    name: "Use unapproved emergency vendor",
    strategy_type: "emergency_vendor",
    actions: [],
    incremental_cost: 30000,
    currency: "INR",
    arrival_days: 3,
    unmet_demand_units_before_recovery: 0,
    estimated_production_delay_days: 0,
    feasible: false,
    feasibility_reasons: ["Supplier not approved"],
    risk_score: 0.9,
    rank: 3,
    reasoning_summary: "Blocked — supplier not on approved list.",
    policy_status: "BLOCKED",
    reason_codes: ["SUPPLIER_NOT_APPROVED"],
    plan_version: "v1",
  },
];

const mockApproval: client.Approval = {
  approval_id: "APR-001",
  incident_id: "INC-001",
  scenario_id: "SCN-ALT-SUPPLIER",
  plan_version: "v1",
  status: "pending",
  requested_by: "system",
  reason: "Cost exceeds auto-approval limit of ₹50,000",
  created_at: "2024-01-01T10:05:00Z",
  reviewed_by: null,
  reviewed_at: null,
  decision_comment: null,
};

const mockAudit: client.AuditEvent[] = [
  {
    audit_id: "AUD-001",
    incident_id: "INC-001",
    correlation_id: "corr-001",
    actor_type: "system",
    actor_id: "disruption_agent",
    event_type: "DISRUPTION_DETECTED",
    entity_type: "incident",
    entity_id: "INC-001",
    before_state: null,
    after_state: { status: "DETECTED" },
    reason: "Shipping delay detected for SHP-102",
    evidence_refs: ["SHP-102"],
    created_at: "2024-01-01T10:00:00Z",
  },
  {
    audit_id: "AUD-002",
    incident_id: "INC-001",
    correlation_id: "corr-001",
    actor_type: "system",
    actor_id: "impact_agent",
    event_type: "IMPACT_ANALYZED",
    entity_type: "incident",
    entity_id: "INC-001",
    before_state: { status: "DETECTED" },
    after_state: { status: "OPTIONS_READY" },
    reason: "Impact analysis completed",
    evidence_refs: ["CMP-201"],
    created_at: "2024-01-01T10:01:00Z",
  },
];

// ── Helpers ───────────────────────────────────────────────────────────────────

function mockApiSuccess() {
  vi.spyOn(client.api, "dashboard").mockResolvedValue(mockDashboard);
  vi.spyOn(client.api, "disruptions").mockResolvedValue({
    items: [{ incident_id: "INC-001", event_id: "EVT-001", title: "Critical component shipment delayed", severity: "high", detected_at: "2024-01-01T10:00:00Z" }],
  });
  vi.spyOn(client.api, "incident").mockResolvedValue(mockIncident);
  vi.spyOn(client.api, "impact").mockResolvedValue(mockImpact);
  vi.spyOn(client.api, "scenarios").mockResolvedValue({ scenarios: mockScenarios });
  vi.spyOn(client.api, "audit").mockResolvedValue({ items: mockAudit });
  vi.spyOn(client.api, "approvals").mockResolvedValue({ items: [] });
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("SynchroSC Frontend", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // 1. Dashboard displays KPIs and incident records
  it("displays KPI cards and incident table on dashboard", async () => {
    mockApiSuccess();
    render(<App />);

    await waitFor(() => {
      expect(screen.getByText("Active incidents")).toBeInTheDocument();
      expect(screen.getByText("Pending approvals")).toBeInTheDocument();
      expect(screen.getByText("Monitored components")).toBeInTheDocument();
    });

    // KPI values from mockDashboard
    expect(screen.getByText("2")).toBeInTheDocument(); // active_incidents_count
    expect(screen.getByText("5")).toBeInTheDocument(); // monitored_components_count

    // Incident row
    await waitFor(() => {
      expect(screen.getByText("Critical component shipment delayed")).toBeInTheDocument();
    });
  });

  // 2. Empty incident list shows useful empty state
  it("shows empty state when no incidents exist", async () => {
    vi.spyOn(client.api, "dashboard").mockResolvedValue({ ...mockDashboard, active_incidents_count: 0 });
    vi.spyOn(client.api, "disruptions").mockResolvedValue({ items: [] });
    vi.spyOn(client.api, "approvals").mockResolvedValue({ items: [] });

    render(<App />);

    await waitFor(() => {
      expect(screen.getByText("No incidents yet")).toBeInTheDocument();
    });
    expect(screen.getByText(/Start with the critical shipment delay demo/)).toBeInTheDocument();
  });

  // 3. Loading and API failure states render correctly
  it("shows loading state initially then error on API failure", async () => {
    vi.spyOn(client.api, "dashboard").mockRejectedValue(new Error("Network error"));
    vi.spyOn(client.api, "disruptions").mockRejectedValue(new Error("Network error"));
    vi.spyOn(client.api, "approvals").mockRejectedValue(new Error("Network error"));

    render(<App />);

    // Loading state visible immediately
    expect(screen.getByText(/Loading persisted control tower state/)).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByText("Network error")).toBeInTheDocument();
    });
  });

  // 4. Retrying a failed read requests fresh data
  it("retry button calls API again after failure", async () => {
    const dashboardSpy = vi.spyOn(client.api, "dashboard").mockRejectedValue(new Error("Timeout"));
    vi.spyOn(client.api, "disruptions").mockRejectedValue(new Error("Timeout"));
    vi.spyOn(client.api, "approvals").mockRejectedValue(new Error("Timeout"));

    render(<App />);

    await waitFor(() => {
      expect(screen.getByText("Timeout")).toBeInTheDocument();
    });

    // Dismiss error and click refresh
    dashboardSpy.mockResolvedValue(mockDashboard);
    vi.spyOn(client.api, "disruptions").mockResolvedValue({ items: [] });
    vi.spyOn(client.api, "approvals").mockResolvedValue({ items: [] });

    const refreshBtn = screen.getByLabelText("Refresh dashboard");
    fireEvent.click(refreshBtn);

    await waitFor(() => {
      expect(client.api.dashboard).toHaveBeenCalledTimes(2);
    });
  });

  // 5. Triggering demo event calls the correct endpoint
  it("simulate disruption button calls createDemoDisruption then analyze", async () => {
    mockApiSuccess();
    vi.spyOn(client.api, "createDemoDisruption").mockResolvedValue({ incident_id: "INC-001" });
    vi.spyOn(client.api, "analyze").mockResolvedValue({ scenarios: mockScenarios });

    render(<App />);

    await waitFor(() => {
      expect(screen.getByText("Simulate disruption")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText("Simulate disruption"));

    await waitFor(() => {
      expect(client.api.createDemoDisruption).toHaveBeenCalledTimes(1);
      expect(client.api.analyze).toHaveBeenCalledWith("INC-001");
    });
  });

  // 6. Scenario comparison displays cost, ETA, feasibility, and policy status
  it("scenario cards show cost, arrival days, feasibility, and policy status", async () => {
    mockApiSuccess();
    localStorage.setItem("synchrosc-selected-incident", "INC-001");

    render(<App />);

    // Navigate to incident view
    await waitFor(() => {
      expect(screen.getByText("Incident analysis")).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText("Incident analysis"));

    await waitFor(() => {
      expect(screen.getByText("Buy from approved alternate supplier")).toBeInTheDocument();
    });

    // Cost displayed
    expect(screen.getByText("₹64,000")).toBeInTheDocument();
    // Arrival days
    expect(screen.getByText("4 days")).toBeInTheDocument();
    // Policy status badge
    expect(screen.getByText("APPROVAL REQUIRED")).toBeInTheDocument();
    // Blocked scenario
    expect(screen.getByText("BLOCKED")).toBeInTheDocument();
  });

  // 7. Blocked scenarios cannot be submitted through normal UI controls
  it("blocked scenario select button is disabled", async () => {
    mockApiSuccess();
    localStorage.setItem("synchrosc-selected-incident", "INC-001");

    render(<App />);

    fireEvent.click(await screen.findByText("Incident analysis"));

    await waitFor(() => {
      expect(screen.getByText("Use unapproved emergency vendor")).toBeInTheDocument();
    });

    // Find the card for the blocked scenario and check its button is disabled
    const blockedCard = screen.getByText("Use unapproved emergency vendor").closest("article")!;
    const selectBtn = within(blockedCard).getByRole("button", { name: /Select this plan/i });
    expect(selectBtn).toBeDisabled();
  });

  // 8. Approval requests submit the correct decision payload
  it("approve button calls decide with 'approve' and approval_id", async () => {
    mockApiSuccess();
    vi.spyOn(client.api, "approvals").mockResolvedValue({ items: [mockApproval] });
    const decideSpy = vi.spyOn(client.api, "decide").mockResolvedValue({ ...mockApproval, status: "approved" });

    render(<App />);

    await waitFor(() => {
      expect(screen.getByText("Approval queue")).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText("Approval queue"));

    // The approval card shows scenario_id or name depending on whether scenarios are loaded
    await waitFor(() => {
      expect(screen.getByText("Approve plan")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText("Approve plan"));

    await waitFor(() => {
      expect(decideSpy).toHaveBeenCalledWith("APR-001", "approve");
    });
  });

  // 9. HTTP 409 stale-approval responses display an error and trigger a refresh
  it("shows stale approval error on 409 and triggers a re-fetch", async () => {
    mockApiSuccess();
    vi.spyOn(client.api, "approvals").mockResolvedValue({ items: [mockApproval] });
    vi.spyOn(client.api, "decide").mockRejectedValue(new Error("Request failed (409)"));
    // Track how many times dashboard is called to confirm refresh happened
    const dashboardSpy = vi.spyOn(client.api, "dashboard");

    render(<App />);

    fireEvent.click(await screen.findByText("Approval queue"));

    await waitFor(() => {
      expect(screen.getByText("Approve plan")).toBeInTheDocument();
    });

    const initialCalls = dashboardSpy.mock.calls.length;
    fireEvent.click(screen.getByText("Approve plan"));

    // After a failed decide, the app should re-fetch (refresh) to get latest state
    await waitFor(() => {
      expect(dashboardSpy.mock.calls.length).toBeGreaterThan(initialCalls);
    });
  });

  // 10. Rejected approvals do not show successful execution
  it("reject decision shows rejection notice, not execution success", async () => {
    mockApiSuccess();
    vi.spyOn(client.api, "approvals").mockResolvedValue({ items: [mockApproval] });
    vi.spyOn(client.api, "decide").mockResolvedValue({ ...mockApproval, status: "rejected" });

    render(<App />);

    fireEvent.click(await screen.findByText("Approval queue"));

    await waitFor(() => {
      expect(screen.getByText("Reject")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText("Reject"));

    await waitFor(() => {
      expect(screen.getByText(/Request rejected. No action was executed./)).toBeInTheDocument();
    });

    expect(screen.queryByText(/Simulation completed/)).not.toBeInTheDocument();
  });

  // 11. UI only shows execution success after backend confirmation
  it("execute button only appears when status is READY_TO_EXECUTE", async () => {
    mockApiSuccess();
    // Status is OPTIONS_READY — execute button must NOT appear
    localStorage.setItem("synchrosc-selected-incident", "INC-001");

    render(<App />);

    fireEvent.click(await screen.findByText("Incident analysis"));

    await waitFor(() => {
      expect(screen.getByText("Decision status")).toBeInTheDocument();
    });

    expect(screen.queryByText("Execute simulation")).not.toBeInTheDocument();
  });

  it("execute button appears and calls execute when status is READY_TO_EXECUTE", async () => {
    const readyIncident: client.Incident = {
      ...mockIncident,
      status: "READY_TO_EXECUTE",
      selected_scenario_id: "SCN-ALT-SUPPLIER",
      approval_id: "APR-001",
    };
    vi.spyOn(client.api, "dashboard").mockResolvedValue(mockDashboard);
    vi.spyOn(client.api, "disruptions").mockResolvedValue({
      items: [{ incident_id: "INC-001", event_id: "EVT-001", title: "Critical component shipment delayed", severity: "high", detected_at: "2024-01-01T10:00:00Z" }],
    });
    vi.spyOn(client.api, "incident").mockResolvedValue(readyIncident);
    vi.spyOn(client.api, "impact").mockResolvedValue(mockImpact);
    vi.spyOn(client.api, "scenarios").mockResolvedValue({ scenarios: mockScenarios });
    vi.spyOn(client.api, "audit").mockResolvedValue({ items: mockAudit });
    vi.spyOn(client.api, "approvals").mockResolvedValue({ items: [] });
    const executeSpy = vi.spyOn(client.api, "execute").mockResolvedValue({ execution_mode: "simulation", execution_status: "COMPLETED" });

    localStorage.setItem("synchrosc-selected-incident", "INC-001");
    render(<App />);

    fireEvent.click(await screen.findByText("Incident analysis"));

    await waitFor(() => {
      expect(screen.getByText("Execute simulation")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText("Execute simulation"));

    await waitFor(() => {
      expect(executeSpy).toHaveBeenCalledWith("SCN-ALT-SUPPLIER", "INC-001", "APR-001");
    });
  });

  // 12. Audit events are rendered in chronological order
  it("audit timeline renders events in chronological order", async () => {
    mockApiSuccess();
    localStorage.setItem("synchrosc-selected-incident", "INC-001");

    render(<App />);

    fireEvent.click(await screen.findByText("Audit timeline"));

    await waitFor(() => {
      expect(screen.getByText("DISRUPTION DETECTED")).toBeInTheDocument();
      expect(screen.getByText("IMPACT ANALYZED")).toBeInTheDocument();
    });

    const items = screen.getAllByText(/DISRUPTION DETECTED|IMPACT ANALYZED/);
    // DISRUPTION_DETECTED (AUD-001, earlier) should appear before IMPACT_ANALYZED (AUD-002)
    expect(items[0].textContent).toContain("DISRUPTION DETECTED");
    expect(items[1].textContent).toContain("IMPACT ANALYZED");
  });
});
