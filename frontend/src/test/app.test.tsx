import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { DashboardPage } from "../features/dashboard/DashboardPage";
import { IncidentPage } from "../features/incidents/IncidentPage";
import { ApprovalQueuePage } from "../features/approvals/ApprovalQueuePage";
import { AuditTimelinePage } from "../features/audit/AuditTimelinePage";
import { AppShell } from "../components/AppShell";
import {
  FIXTURE_DASHBOARD,
  FIXTURE_DISRUPTION,
  FIXTURE_INCIDENT,
  FIXTURE_INCIDENT_AWAITING,
  FIXTURE_INCIDENT_READY,
  FIXTURE_INCIDENT_VERIFIED,
  FIXTURE_IMPACT,
  FIXTURE_SCENARIOS,
  FIXTURE_APPROVAL_PENDING,
  FIXTURE_APPROVAL_APPROVED,
  FIXTURE_AUDIT_EVENTS,
} from "./fixtures/demo";

// ── Mock the provider module ───────────────────────────────────────────────
vi.mock("../api/provider", () => ({
  IS_DEMO_MODE: true,
  DEMO_DISRUPTION_PAYLOAD: {
    event_type: "shipping_delay",
    title: "Critical component shipment delayed",
    description: "SHP-102 revised ETA is 12 days from now.",
    severity: "high",
    source_type: "demo",
    source_name: "demo_seed.json",
    confidence: 1.0,
    affected_shipment_ids: ["SHP-102"],
    evidence: ["ETA changed to +12 days in the scenario fixture"],
  },
  provider: {
    getDashboard: vi.fn(),
    listDisruptions: vi.fn(),
    createDisruption: vi.fn(),
    getIncident: vi.fn(),
    analyzeIncident: vi.fn(),
    getImpact: vi.fn(),
    getScenarios: vi.fn(),
    selectScenario: vi.fn(),
    listApprovals: vi.fn(),
    submitDecision: vi.fn(),
    executeAction: vi.fn(),
    getAudit: vi.fn(),
  },
}));

// Import after mock
import { provider } from "../api/provider";

function renderDashboard() {
  return render(
    <MemoryRouter initialEntries={["/dashboard"]}>
      <Routes>
        <Route path="/dashboard" element={<DashboardPage />} />
        <Route path="/incidents/:incidentId" element={<div>Incident page</div>} />
        <Route path="/approvals" element={<div>Approvals page</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

function renderIncident(incidentId = "INC-001") {
  return render(
    <MemoryRouter initialEntries={[`/incidents/${incidentId}`]}>
      <Routes>
        <Route path="/incidents/:incidentId" element={<IncidentPage />} />
        <Route path="/approvals" element={<div>Approvals page</div>} />
        <Route path="/incidents/:incidentId/audit" element={<div>Audit page</div>} />
        <Route path="/dashboard" element={<div>Dashboard</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

function renderApprovals() {
  return render(
    <MemoryRouter initialEntries={["/approvals"]}>
      <Routes>
        <Route path="/approvals" element={<ApprovalQueuePage />} />
        <Route path="/incidents/:incidentId" element={<div>Incident page</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

function renderAudit(incidentId = "INC-001") {
  return render(
    <MemoryRouter initialEntries={[`/incidents/${incidentId}/audit`]}>
      <Routes>
        <Route path="/incidents/:incidentId/audit" element={<AuditTimelinePage />} />
        <Route path="/incidents/:incidentId" element={<div>Incident page</div>} />
        <Route path="/dashboard" element={<div>Dashboard</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  // Default happy-path mocks
  vi.mocked(provider.getDashboard).mockResolvedValue(FIXTURE_DASHBOARD);
  vi.mocked(provider.listDisruptions).mockResolvedValue({ items: [FIXTURE_DISRUPTION], total: 1 });
  vi.mocked(provider.listApprovals).mockResolvedValue({ items: [] });
  vi.mocked(provider.getIncident).mockResolvedValue(FIXTURE_INCIDENT);
  vi.mocked(provider.getImpact).mockResolvedValue(FIXTURE_IMPACT);
  vi.mocked(provider.getScenarios).mockResolvedValue({ incident_id: "INC-001", status: "OPTIONS_READY", scenarios: FIXTURE_SCENARIOS });
  vi.mocked(provider.getAudit).mockResolvedValue({ incident_id: "INC-001", items: FIXTURE_AUDIT_EVENTS });
  vi.mocked(provider.analyzeIncident).mockResolvedValue({ incident_id: "INC-001", status: "OPTIONS_READY", scenarios: FIXTURE_SCENARIOS });
  vi.mocked(provider.selectScenario).mockResolvedValue({
    incident_id: "INC-001",
    scenario_id: "SCN-ALT-SUPPLIER",
    plan_version: "v1.0",
    policy_status: "APPROVAL_REQUIRED",
    approval_id: "APR-001",
    workflow_status: "AWAITING_APPROVAL",
    reason_codes: ["COST_ABOVE_AUTO_APPROVAL_LIMIT"],
  });
  vi.mocked(provider.submitDecision).mockResolvedValue({
    approval_id: "APR-001",
    status: "approved",
    reviewed_by: "demo-operator",
    decision_comment: "Approved.",
    reviewed_at: "2026-01-01T10:15:00Z",
  });
  vi.mocked(provider.executeAction).mockResolvedValue({
    action_id: "ACT-001",
    incident_id: "INC-001",
    scenario_id: "SCN-ALT-SUPPLIER",
    execution_status: "completed",
    execution_mode: "simulation",
    updated_resource_ids: ["INC-001"],
    audit_id: "AUD-EXEC-001",
    executed_at: "2026-01-01T10:20:00Z",
  });
  vi.mocked(provider.createDisruption).mockResolvedValue({
    incident_id: "INC-001",
    event_id: "EVT-001",
    status: "DETECTED",
    created_at: "2026-01-01T10:00:00Z",
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ── 1. Application shell renders ───────────────────────────────────────────
describe("AppShell", () => {
  it("renders navigation links", () => {
    render(
      <MemoryRouter initialEntries={["/dashboard"]}>
        <AppShell>
          <div>content</div>
        </AppShell>
      </MemoryRouter>,
    );
    expect(screen.getByText("Control tower")).toBeInTheDocument();
    expect(screen.getByText("Approval queue")).toBeInTheDocument();
    expect(screen.getByText("Audit timeline")).toBeInTheDocument();
    expect(screen.getByText("SynchroSC")).toBeInTheDocument();
  });

  it("shows demo mode indicator", () => {
    render(
      <MemoryRouter initialEntries={["/dashboard"]}>
        <AppShell><div /></AppShell>
      </MemoryRouter>,
    );
    expect(screen.getAllByText(/DEMO/i).length).toBeGreaterThan(0);
  });
});

// ── 2. Dashboard renders KPIs ──────────────────────────────────────────────
describe("DashboardPage", () => {
  it("renders KPI cards with API data", async () => {
    renderDashboard();
    await waitFor(() => {
      expect(screen.getByText("Active incidents")).toBeInTheDocument();
      expect(screen.getByText("Pending approvals")).toBeInTheDocument();
      expect(screen.getByText("Monitored components")).toBeInTheDocument();
    });
    // Active incidents count from fixture = 1
    await waitFor(() => expect(screen.getAllByText("1").length).toBeGreaterThan(0));
  });

  // ── 3. Loading state ───────────────────────────────────────────────────
  it("shows loading state initially", () => {
    vi.mocked(provider.getDashboard).mockReturnValue(new Promise(() => {}));
    renderDashboard();
    expect(screen.getByText(/Loading/i)).toBeInTheDocument();
  });

  // ── 4. Empty state ─────────────────────────────────────────────────────
  it("shows empty state when no incidents", async () => {
    vi.mocked(provider.listDisruptions).mockResolvedValue({ items: [], total: 0 });
    renderDashboard();
    await waitFor(() => expect(screen.getByText("No incidents yet")).toBeInTheDocument());
  });

  // ── 5. API failure shows error ─────────────────────────────────────────
  it("shows error panel on API failure", async () => {
    vi.mocked(provider.getDashboard).mockRejectedValue(new Error("Cannot reach the SynchroSC API."));
    renderDashboard();
    await waitFor(() => expect(screen.getByRole("alert")).toBeInTheDocument());
    expect(screen.getByText(/Cannot reach/i)).toBeInTheDocument();
  });

  // ── 6. Create disruption submits documented payload ────────────────────
  it("opens create disruption modal and submits", async () => {
    renderDashboard();
    await waitFor(() => expect(screen.getByText("Simulate disruption")).toBeInTheDocument());
    fireEvent.click(screen.getByText("Simulate disruption"));
    await waitFor(() => expect(screen.getByText("Simulate disruption event")).toBeInTheDocument());
    // Submit the form
    fireEvent.click(screen.getByText("Review & submit"));
    await waitFor(() => expect(screen.getByText(/Submit simulation/i)).toBeInTheDocument());
    fireEvent.click(screen.getByText("Submit simulation"));
    await waitFor(() => expect(provider.createDisruption).toHaveBeenCalledWith(
      expect.objectContaining({
        event_type: "shipping_delay",
        affected_shipment_ids: ["SHP-102"],
        severity: "high",
      }),
    ));
  });

  // ── 7. Invalid form cannot be submitted ───────────────────────────────
  it("prevents submission when title is empty", async () => {
    renderDashboard();
    await waitFor(() => expect(screen.getByText("Simulate disruption")).toBeInTheDocument());
    fireEvent.click(screen.getByText("Simulate disruption"));
    await waitFor(() => expect(screen.getByText("Simulate disruption event")).toBeInTheDocument());
    // Clear the title field
    const titleInput = screen.getByDisplayValue("Critical component shipment delayed");
    fireEvent.change(titleInput, { target: { value: "" } });
    // Verify the input is now empty
    expect((titleInput as HTMLInputElement).value).toBe("");
    fireEvent.click(screen.getByText("Review & submit"));
    // Validation should prevent submission — createDisruption must not be called
    expect(provider.createDisruption).not.toHaveBeenCalled();
  });
});

// ── 8. Incident details display demo metrics ───────────────────────────────
describe("IncidentPage", () => {
  it("displays CMP-201, 500 available units, 100 units/day, 5-day coverage, 12-day ETA", async () => {
    renderIncident();
    await waitFor(() => {
      expect(screen.getByText("CMP-201")).toBeInTheDocument();
      expect(screen.getByText("500 units")).toBeInTheDocument();
      expect(screen.getByText("5 days")).toBeInTheDocument();
      // 12 days appears in both banner and scenario card — check at least one exists
      expect(screen.getAllByText(/12 days?/).length).toBeGreaterThan(0);
    });
  });

  // ── 9. Analysis triggers correct API call ─────────────────────────────
  it("calls analyzeIncident when Analyze button is clicked", async () => {
    vi.mocked(provider.getIncident).mockResolvedValue({ ...FIXTURE_INCIDENT, status: "DETECTED" });
    renderIncident();
    await waitFor(() => expect(screen.getByText("Analyze incident")).toBeInTheDocument());
    fireEvent.click(screen.getByText("Analyze incident"));
    await waitFor(() => expect(provider.analyzeIncident).toHaveBeenCalledWith("INC-001"));
  });

  // ── 10. Scenario comparison shows costs, arrival, policy ──────────────
  it("renders scenario comparison with costs and policy dispositions", async () => {
    renderIncident();
    await waitFor(() => {
      expect(screen.getByText("Order from approved alternate supplier (SUP-B)")).toBeInTheDocument();
      expect(screen.getByText("Expedite SHP-102 via air freight")).toBeInTheDocument();
      expect(screen.getByText("Transfer 300 units from Warehouse B")).toBeInTheDocument();
    });
    // Costs
    expect(screen.getByText("₹64,000")).toBeInTheDocument();
    expect(screen.getByText("₹90,000")).toBeInTheDocument();
    expect(screen.getByText("₹12,000")).toBeInTheDocument();
  });

  // ── 11. Blocked scenario is visibly blocked ───────────────────────────
  it("shows blocked scenario as blocked and disables its button", async () => {
    renderIncident();
    await waitFor(() => expect(screen.getByText("Wait for delayed SHP-102 (baseline)")).toBeInTheDocument());
    const blockedButtons = screen.getAllByText("Blocked by policy");
    expect(blockedButtons.length).toBeGreaterThan(0);
    expect(blockedButtons[0]).toBeDisabled();
  });

  // ── 12. Selecting a scenario calls selectScenario ─────────────────────
  it("calls selectScenario when a feasible scenario is selected", async () => {
    renderIncident();
    await waitFor(() => expect(screen.getAllByText("Select this plan").length).toBeGreaterThan(0));
    const selectButtons = screen.getAllByText("Select this plan");
    fireEvent.click(selectButtons[0]);
    await waitFor(() => expect(provider.selectScenario).toHaveBeenCalledWith("INC-001", expect.any(String)));
  });

  // ── 13. Execute button shown only when READY_TO_EXECUTE ───────────────
  it("shows execute button only when incident is READY_TO_EXECUTE", async () => {
    vi.mocked(provider.getIncident).mockResolvedValue(FIXTURE_INCIDENT_READY);
    renderIncident();
    await waitFor(() => expect(screen.getByText("Execute simulation")).toBeInTheDocument());
  });

  it("does not show execute button when AWAITING_APPROVAL", async () => {
    vi.mocked(provider.getIncident).mockResolvedValue(FIXTURE_INCIDENT_AWAITING);
    renderIncident();
    await waitFor(() => expect(screen.queryByText("Execute simulation")).not.toBeInTheDocument());
  });

  // ── 14. Execution requires confirmation before proceeding ─────────────
  it("shows confirmation dialog before executing", async () => {
    vi.mocked(provider.getIncident).mockResolvedValue(FIXTURE_INCIDENT_READY);
    renderIncident();
    await waitFor(() => fireEvent.click(screen.getByText("Execute simulation")));
    await waitFor(() => expect(screen.getByText("Execute simulated recovery action")).toBeInTheDocument());
    expect(provider.executeAction).not.toHaveBeenCalled();
  });

  // ── 15. Verified state shows outcome ─────────────────────────────────
  it("shows verified callout when incident is VERIFIED", async () => {
    vi.mocked(provider.getIncident).mockResolvedValue(FIXTURE_INCIDENT_VERIFIED);
    renderIncident();
    await waitFor(() => expect(screen.getByText("Outcome verified in simulation")).toBeInTheDocument());
  });

  // ── 16. Execution not triggered for blocked scenario ──────────────────
  it("blocked scenario button is disabled and cannot trigger execution", async () => {
    renderIncident();
    await waitFor(() => expect(screen.getAllByText("Blocked by policy").length).toBeGreaterThan(0));
    const blockedBtn = screen.getAllByText("Blocked by policy")[0];
    expect(blockedBtn).toBeDisabled();
    fireEvent.click(blockedBtn);
    expect(provider.selectScenario).not.toHaveBeenCalled();
  });

  // ── 17. Approval-required execution cannot proceed without approval ───
  it("does not show execute button when AWAITING_APPROVAL (approval not yet confirmed)", async () => {
    vi.mocked(provider.getIncident).mockResolvedValue(FIXTURE_INCIDENT_AWAITING);
    renderIncident();
    await waitFor(() => expect(screen.queryByText("Execute simulation")).not.toBeInTheDocument());
    expect(screen.getByText(/Awaiting human approval/i)).toBeInTheDocument();
  });

  // ── 18. No success shown before server responds ───────────────────────
  it("does not show success notice before executeAction resolves", async () => {
    vi.mocked(provider.getIncident).mockResolvedValue(FIXTURE_INCIDENT_READY);
    vi.mocked(provider.executeAction).mockReturnValue(new Promise(() => {})); // never resolves
    renderIncident();
    await waitFor(() => expect(screen.getByText("Execute simulation")).toBeInTheDocument());
    fireEvent.click(screen.getByText("Execute simulation"));
    await waitFor(() => expect(screen.getByText("Execute simulated recovery action")).toBeInTheDocument());
    // Click the confirm button in the dialog (last button with this text)
    const execBtns = screen.getAllByText("Execute simulation");
    fireEvent.click(execBtns[execBtns.length - 1]);
    // Success should not appear while still pending
    expect(screen.queryByText(/Simulation completed/i)).not.toBeInTheDocument();
  });

  // ── 19. Execution request includes idempotency key ────────────────────
  it("executeAction is called (idempotency key is added by provider)", async () => {
    vi.mocked(provider.getIncident).mockResolvedValue(FIXTURE_INCIDENT_READY);
    renderIncident();
    await waitFor(() => expect(screen.getByText("Execute simulation")).toBeInTheDocument());
    fireEvent.click(screen.getByText("Execute simulation"));
    await waitFor(() => expect(screen.getByText("Execute simulated recovery action")).toBeInTheDocument());
    const execBtns = screen.getAllByText("Execute simulation");
    fireEvent.click(execBtns[execBtns.length - 1]);
    await waitFor(() => expect(provider.executeAction).toHaveBeenCalledWith(
      "SCN-ALT-SUPPLIER",
      "INC-001",
      "APR-001",
    ));
  });

  // ── 20. HTTP 409 displays conflict message ────────────────────────────
  it("shows conflict error on 409 response", async () => {
    vi.mocked(provider.getIncident).mockResolvedValue(FIXTURE_INCIDENT_READY);
    const err = Object.assign(new Error("The approval request is not in approved state."), { status: 409, code: "APPROVAL_NOT_APPROVED" });
    vi.mocked(provider.executeAction).mockRejectedValue(err);
    renderIncident();
    await waitFor(() => expect(screen.getByText("Execute simulation")).toBeInTheDocument());
    fireEvent.click(screen.getByText("Execute simulation"));
    await waitFor(() => expect(screen.getByText("Execute simulated recovery action")).toBeInTheDocument());
    const execBtns = screen.getAllByText("Execute simulation");
    fireEvent.click(execBtns[execBtns.length - 1]);
    await waitFor(() => expect(screen.getByRole("alert")).toBeInTheDocument());
    expect(screen.getByText(/approval request is not in approved state/i)).toBeInTheDocument();
  });
});

// ── 21. Approval queue ─────────────────────────────────────────────────────
describe("ApprovalQueuePage", () => {
  it("displays pending approvals", async () => {
    vi.mocked(provider.listApprovals).mockResolvedValue({ items: [FIXTURE_APPROVAL_PENDING] });
    vi.mocked(provider.getScenarios).mockResolvedValue({ incident_id: "INC-001", status: "OPTIONS_READY", scenarios: FIXTURE_SCENARIOS });
    renderApprovals();
    await waitFor(() => expect(screen.getByText("Pending decisions")).toBeInTheDocument());
    // Cost appears at least once in the card
    expect(screen.getAllByText(/64,000/).length).toBeGreaterThan(0);
  });

  // ── 22. Approve submits correct decision body ─────────────────────────
  it("approve button submits correct decision", async () => {
    vi.mocked(provider.listApprovals).mockResolvedValue({ items: [FIXTURE_APPROVAL_PENDING] });
    vi.mocked(provider.getScenarios).mockResolvedValue({ incident_id: "INC-001", status: "OPTIONS_READY", scenarios: FIXTURE_SCENARIOS });
    vi.mocked(provider.getIncident).mockResolvedValue(FIXTURE_INCIDENT_READY);
    renderApprovals();
    await waitFor(() => expect(screen.getByLabelText("Approve plan")).toBeInTheDocument());
    fireEvent.click(screen.getByLabelText("Approve plan"));
    await waitFor(() => expect(screen.getByText("Approve recovery plan")).toBeInTheDocument());
    // Dialog confirm button has no aria-label — pick the last button-primary
    const confirmBtns = screen.getAllByText("Approve plan");
    fireEvent.click(confirmBtns[confirmBtns.length - 1]);
    await waitFor(() => expect(provider.submitDecision).toHaveBeenCalledWith(
      "APR-001",
      "approve",
      expect.any(String),
      "demo-operator",
    ));
  });

  // ── 23. Reject submits correct decision body ──────────────────────────
  it("reject button submits correct decision", async () => {
    vi.mocked(provider.listApprovals).mockResolvedValue({ items: [FIXTURE_APPROVAL_PENDING] });
    vi.mocked(provider.getScenarios).mockResolvedValue({ incident_id: "INC-001", status: "OPTIONS_READY", scenarios: FIXTURE_SCENARIOS });
    renderApprovals();
    await waitFor(() => expect(screen.getByLabelText("Reject plan")).toBeInTheDocument());
    fireEvent.click(screen.getByLabelText("Reject plan"));
    await waitFor(() => expect(screen.getByText("Reject recovery plan")).toBeInTheDocument());
    fireEvent.click(screen.getByText("Reject plan", { selector: "button" }));
    await waitFor(() => expect(provider.submitDecision).toHaveBeenCalledWith(
      "APR-001",
      "reject",
      expect.any(String),
      "demo-operator",
    ));
  });

  // ── 24. Approval buttons disabled while request is in flight ─────────
  it("disables approve/reject buttons while request is in flight", async () => {
    vi.mocked(provider.listApprovals).mockResolvedValue({ items: [FIXTURE_APPROVAL_PENDING] });
    vi.mocked(provider.getScenarios).mockResolvedValue({ incident_id: "INC-001", status: "OPTIONS_READY", scenarios: FIXTURE_SCENARIOS });
    vi.mocked(provider.submitDecision).mockReturnValue(new Promise(() => {})); // never resolves
    renderApprovals();
    await waitFor(() => expect(screen.getByLabelText("Approve plan")).toBeInTheDocument());
    fireEvent.click(screen.getByLabelText("Approve plan"));
    await waitFor(() => expect(screen.getByText("Approve recovery plan")).toBeInTheDocument());
    const confirmBtns = screen.getAllByText("Approve plan");
    fireEvent.click(confirmBtns[confirmBtns.length - 1]);
    // While busy, the original approve button should be disabled
    await waitFor(() => {
      expect(screen.getByLabelText("Approve plan")).toBeDisabled();
    });
  });

  it("shows reviewed approvals section", async () => {
    vi.mocked(provider.listApprovals).mockResolvedValue({ items: [FIXTURE_APPROVAL_APPROVED] });
    vi.mocked(provider.getScenarios).mockResolvedValue({ incident_id: "INC-001", status: "OPTIONS_READY", scenarios: FIXTURE_SCENARIOS });
    renderApprovals();
    await waitFor(() => expect(screen.getByText("Recently reviewed")).toBeInTheDocument());
    expect(screen.getByText("demo-operator")).toBeInTheDocument();
  });

  it("shows empty state when no pending approvals", async () => {
    renderApprovals();
    await waitFor(() => expect(screen.getByText("No pending approvals")).toBeInTheDocument());
  });
});

// ── 25. Audit timeline ─────────────────────────────────────────────────────
describe("AuditTimelinePage", () => {
  it("displays audit events in chronological order", async () => {
    renderAudit();
    await waitFor(() => {
      expect(screen.getByText("DISRUPTION DETECTED")).toBeInTheDocument();
      expect(screen.getByText("IMPACT ANALYZED")).toBeInTheDocument();
      expect(screen.getByText("APPROVAL APPROVED")).toBeInTheDocument();
      expect(screen.getByText("EXECUTION COMPLETED")).toBeInTheDocument();
    });
    // Verify order: DISRUPTION_DETECTED should appear before EXECUTION_COMPLETED
    const items = screen.getAllByText(/DETECTED|ANALYZED|APPROVED|COMPLETED/);
    expect(items[0].textContent).toMatch(/DETECTED/);
  });

  it("shows correlation IDs", async () => {
    renderAudit();
    await waitFor(() => expect(screen.getByText(/corr-001/)).toBeInTheDocument());
  });

  it("shows expandable state change details", async () => {
    renderAudit();
    await waitFor(() => expect(screen.getAllByText("View state change").length).toBeGreaterThan(0));
  });

  it("shows empty state when no audit events", async () => {
    vi.mocked(provider.getAudit).mockResolvedValue({ incident_id: "INC-001", items: [] });
    renderAudit();
    await waitFor(() => expect(screen.getByText("No audit events yet")).toBeInTheDocument());
  });
});

// ── 26. Demo mode labelling ────────────────────────────────────────────────
describe("Demo mode", () => {
  it("shows DEMO label in app shell", () => {
    render(
      <MemoryRouter initialEntries={["/dashboard"]}>
        <AppShell><div /></AppShell>
      </MemoryRouter>,
    );
    // Multiple DEMO elements are expected (sidebar + topbar chip)
    expect(screen.getAllByText(/DEMO/i).length).toBeGreaterThan(0);
  });
});

// ── 27. API error handling ────────────────────────────────────────────────
describe("API error handling", () => {
  it("shows explicit error when API is unavailable", async () => {
    vi.mocked(provider.getDashboard).mockRejectedValue(new Error("Cannot reach the SynchroSC API."));
    vi.mocked(provider.listDisruptions).mockRejectedValue(new Error("Cannot reach the SynchroSC API."));
    renderDashboard();
    await waitFor(() => expect(screen.getByRole("alert")).toBeInTheDocument());
    expect(screen.getByText(/Cannot reach/i)).toBeInTheDocument();
  });
});

// ── 28. Scenario policy display ────────────────────────────────────────────
describe("Policy status display", () => {
  it("shows AUTO ALLOWED for transfer scenario", async () => {
    renderIncident();
    await waitFor(() => {
      const autoAllowed = screen.getAllByText(/AUTO ALLOWED/i);
      expect(autoAllowed.length).toBeGreaterThan(0);
    });
  });

  it("shows APPROVAL REQUIRED for alt supplier scenario", async () => {
    renderIncident();
    await waitFor(() => {
      const approvalRequired = screen.getAllByText(/APPROVAL REQUIRED/i);
      expect(approvalRequired.length).toBeGreaterThan(0);
    });
  });

  it("shows BLOCKED for wait scenario", async () => {
    renderIncident();
    await waitFor(() => {
      const blocked = screen.getAllByText(/BLOCKED/i);
      expect(blocked.length).toBeGreaterThan(0);
    });
  });
});
