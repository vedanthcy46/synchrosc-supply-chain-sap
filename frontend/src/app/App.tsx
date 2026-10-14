import { useCallback, useEffect, useMemo, useState } from "react";
import { api, ApiError } from "../api/client";
import type {
  Approval, AuditEvent, DashboardSummary, DisruptionEvent, Health, ImpactAnalysis,
  Incident, RecoveryScenario, ScenarioList,
} from "../types/api";

type Page = "overview" | "incidents" | "approvals";
const money = (amount: number, currency = "INR") => new Intl.NumberFormat("en-IN", {
  style: "currency", currency, maximumFractionDigits: 0,
}).format(amount);
const date = (value?: string | null) => value ? new Date(value).toLocaleString("en-IN", {
  day: "numeric", month: "short", hour: "2-digit", minute: "2-digit",
}) : "—";
const pretty = (value?: string | null) => (value || "unknown").replaceAll("_", " ").replaceAll("-", " ").toLowerCase();

function App() {
  const [page, setPage] = useState<Page>("overview");
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [events, setEvents] = useState<DisruptionEvent[]>([]);
  const [approvals, setApprovals] = useState<Approval[]>([]);
  const [health, setHealth] = useState<Health | null>(null);
  const [incidentId, setIncidentId] = useState("");
  const [incident, setIncident] = useState<Incident | null>(null);
  const [impact, setImpact] = useState<ImpactAnalysis | null>(null);
  const [scenarioData, setScenarioData] = useState<ScenarioList | null>(null);
  const [audit, setAudit] = useState<AuditEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [selectedApproval, setSelectedApproval] = useState<Approval | null>(null);

  const refresh = useCallback(async () => {
    setError("");
    try {
      const [dash, disruptionList, approvalList, status] = await Promise.all([
        api.dashboard(), api.disruptions(), api.approvals(), api.health(),
      ]);
      setSummary(dash); setEvents(disruptionList.items); setApprovals(approvalList.items); setHealth(status);
      setIncidentId((current) => current || disruptionList.items[0]?.incident_id || "");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load the control tower.");
    } finally { setLoading(false); }
  }, []);

  const loadIncident = useCallback(async (id: string) => {
    if (!id) { setIncident(null); setImpact(null); setScenarioData(null); setAudit([]); return; }
    setDetailLoading(true); setError("");
    try {
      const results = await Promise.allSettled([api.incident(id), api.impact(id), api.scenarios(id), api.audit(id)]);
      const [incidentResult, impactResult, scenarioResult, auditResult] = results;
      if (incidentResult.status === "fulfilled") setIncident(incidentResult.value);
      else throw incidentResult.reason;
      setImpact(impactResult.status === "fulfilled" ? impactResult.value : null);
      setScenarioData(scenarioResult.status === "fulfilled" ? scenarioResult.value : null);
      setAudit(auditResult.status === "fulfilled" ? auditResult.value.items : []);
    } catch (err) { setError(err instanceof Error ? err.message : "Unable to load incident details."); }
    finally { setDetailLoading(false); }
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);
  useEffect(() => { void loadIncident(incidentId); }, [incidentId, loadIncident]);

  const activeEvents = useMemo(() => [...events].sort((a, b) =>
    new Date(b.detected_at).getTime() - new Date(a.detected_at).getTime()), [events]);
  const currentApproval = selectedApproval;

  const run = async (label: string, action: () => Promise<unknown>, success: string, reloadId?: string) => {
    setBusy(label); setNotice(""); setError("");
    try {
      await action();
      setNotice(success);
      await refresh();
      if (reloadId || incidentId) await loadIncident(reloadId || incidentId);
    } catch (err) {
      const apiError = err instanceof ApiError ? err : null;
      setError(apiError?.status === 409
        ? `${apiError.message} The latest server state has been refreshed.`
        : err instanceof Error ? err.message : "The action could not be completed.");
      await refresh();
      if (reloadId || incidentId) await loadIncident(reloadId || incidentId);
    } finally { setBusy(""); }
  };

  const createEvent = async (form: FormData) => {
    const title = String(form.get("title") || "").trim();
    const description = String(form.get("description") || "").trim();
    if (!title || !description) return;
    setShowCreate(false);
    await run("create", async () => {
      const created = await api.createDisruption({
        event_type: "shipping_delay", title, description,
        severity: String(form.get("severity") || "high"), source_type: "demo",
        source_name: "Control Tower demo", confidence: 1,
        affected_shipment_ids: String(form.get("shipment") || "SHP-102").split(",").map((s) => s.trim()).filter(Boolean),
        evidence: ["Event created from the Control Tower demo workflow"],
      });
      setIncidentId(created.incident_id); setPage("incidents");
    }, "Disruption created and saved to the connected database.");
  };

  const analyze = () => run("analyze", () => api.analyze(incidentId), "Analysis completed. Impact and recovery options are ready.");
  const chooseScenario = (scenario: RecoveryScenario) => run("select", async () => {
    const selected = await api.selectScenario(incidentId, scenario.scenario_id);
    if (selected.policy_status === "BLOCKED") throw new ApiError(`This plan is blocked: ${selected.reason_codes.join(", ") || "policy check failed"}.`, 409);
    if (selected.approval_id) setNotice(`Approval ${selected.approval_id} is awaiting a decision.`);
  }, "Plan selection saved by the server.");
  const decide = (approval: Approval, decision: "approve" | "reject") => run("decision", async () => {
    await api.decideApproval(approval.approval_id, decision);
    setSelectedApproval(null);
    if (decision === "approve") {
      const scenario = scenarioData?.scenarios.find((item) => item.scenario_id === approval.scenario_id);
      if (scenario) setNotice(`Approval recorded. ${scenario.name} is ready for simulated execution.`);
    }
  }, decision === "approve" ? "Approval recorded by the server. Review the incident to execute the simulation." : "Request rejected. No action was executed.", approval.incident_id);
  const execute = (scenario: RecoveryScenario, approvalId?: string | null) => run("execute", () =>
    api.execute(scenario.scenario_id, incidentId, approvalId),
  "Simulated action completed. Confirm the verification event in the audit timeline.");

  const goToIncident = (id: string) => { setIncidentId(id); setPage("incidents"); setSelectedApproval(null); };

  return <div className="shell">
    <aside className="sidebar">
      <div className="brand"><div className="brand-mark">S</div><div><strong>SynchroSC</strong><span>SUPPLY CHAIN CONTROL</span></div></div>
      <div className="workspace-label">WORKSPACE</div>
      <nav className="nav" aria-label="Main navigation">
        <button className={page === "overview" ? "nav-item active" : "nav-item"} onClick={() => setPage("overview")}><span className="nav-icon">◫</span>Control tower</button>
        <button className={page === "incidents" ? "nav-item active" : "nav-item"} onClick={() => setPage("incidents")}><span className="nav-icon">◉</span>Incidents <span className="nav-count">{summary?.active_incidents_count || 0}</span></button>
        <button className={page === "approvals" ? "nav-item active" : "nav-item"} onClick={() => setPage("approvals")}><span className="nav-icon">◷</span>Approvals {approvals.filter((a) => a.status === "pending").length > 0 && <span className="nav-count amber-count">{approvals.filter((a) => a.status === "pending").length}</span>}</button>
      </nav>
      <div className="sidebar-bottom"><div className="connection"><span className={health?.database === "connected" ? "pulse-dot" : "pulse-dot disconnected"}></span><div><strong>{health?.database === "connected" ? "Database connected" : health ? "Database issue" : "Checking connection"}</strong><span>{health?.execution_mode === "simulation" ? "Simulation mode" : health?.execution_mode || "API status"}</span></div></div><div className="user-card"><div className="avatar">DO</div><div><strong>Demo operator</strong><span>Control tower analyst</span></div><span className="user-menu">···</span></div></div>
    </aside>

    <main className="main">
      <header className="topbar"><div className="breadcrumbs"><span>Operations</span><b>/</b><strong>{page === "overview" ? "Control tower" : page === "incidents" ? "Incident details" : "Approval queue"}</strong></div><div className="top-actions"><span className="live-label"><i></i> LIVE DATA</span><button className="icon-button" title="Refresh data" onClick={() => void refresh()}>↻</button><button className="primary-button small" onClick={() => setShowCreate(true)}><span>＋</span> New disruption</button></div></header>

      <div className="content">
        {(error || notice) && <div className={error ? "notice error-notice" : "notice success-notice"} role="status"><span>{error ? "!" : "✓"}</span><div>{error || notice}</div><button onClick={() => { setError(""); setNotice(""); }} aria-label="Dismiss">×</button>{error && <button className="retry" onClick={() => { void refresh(); if (incidentId) void loadIncident(incidentId); }}>Retry</button>}</div>}
        {loading ? <div className="loading-page"><span className="spinner"></span><span>Connecting to your control tower…</span></div> : <>
          {page === "overview" && <Overview summary={summary} events={activeEvents} approvals={approvals} onOpenIncident={goToIncident} onOpenApprovals={() => setPage("approvals")} onCreate={() => setShowCreate(true)} />}
          {page === "incidents" && <IncidentView events={activeEvents} incidentId={incidentId} incident={incident} impact={impact} scenarioData={scenarioData} audit={audit} loading={detailLoading} busy={busy} onSelectIncident={setIncidentId} onAnalyze={analyze} onChooseScenario={chooseScenario} onExecute={execute} />}
          {page === "approvals" && <ApprovalView approvals={approvals} events={events} selected={currentApproval} busy={busy} onSelect={setSelectedApproval} onDecision={decide} onOpenIncident={goToIncident} />}
        </>}
      </div>
    </main>
    {showCreate && <CreateModal onClose={() => setShowCreate(false)} onSubmit={createEvent} busy={busy === "create"} />}
    <footer className="demo-footer"><span>DEMO / SIMULATED DATA</span><span>Recommendations are estimates · All actions require server authorization</span></footer>
  </div>;
}

function Overview({ summary, events, approvals, onOpenIncident, onOpenApprovals, onCreate }: {
  summary: DashboardSummary | null; events: DisruptionEvent[]; approvals: Approval[];
  onOpenIncident: (id: string) => void; onOpenApprovals: () => void; onCreate: () => void;
}) {
  const pending = approvals.filter((item) => item.status === "pending");
  return <>
    <div className="page-heading"><div><div className="eyebrow">{new Intl.DateTimeFormat("en-IN", { weekday: "long", month: "long", day: "numeric", year: "numeric" }).format(new Date()).toUpperCase()} <span className="heading-dot"></span> GLOBAL OPERATIONS</div><h1>Good morning, operator</h1><p>Here’s the latest on your supply chain resilience.</p></div><button className="outline-button" onClick={onCreate}><span>＋</span> Simulate disruption</button></div>
    <div className="metric-grid">
      <Metric label="Active incidents" value={summary?.active_incidents_count ?? 0} icon="◉" tone="blue" note="Require attention" />
      <Metric label="Awaiting approval" value={summary?.pending_approvals_count ?? 0} icon="◷" tone="amber" note="Human decision needed" />
      <Metric label="Monitored components" value={summary?.monitored_components_count ?? 0} icon="▦" tone="teal" note="Across active inventory" />
      <Metric label="Total incidents" value={summary?.total_incidents_count ?? 0} icon="↗" tone="slate" note="Recorded in this workspace" />
    </div>
    <div className="section-row"><div><h2>Operational overview</h2><p>Live status from your connected workspace</p></div><span className="updated"><i></i> Synced with database</span></div>
    <div className="overview-grid">
      <section className="panel incident-panel"><div className="panel-heading"><div><h3>Recent disruptions</h3><p>Events requiring operational review</p></div><button className="text-button" onClick={() => events[0] && onOpenIncident(events[0].incident_id)}>View all <span>→</span></button></div>
        {events.length ? <div className="event-list">{events.slice(0, 5).map((event) => <button className="event-row" key={event.event_id} onClick={() => onOpenIncident(event.incident_id)}><SeverityDot severity={event.severity} /><div className="event-main"><strong>{event.title}</strong><span>{event.affected_shipment_ids?.join(", ") || event.event_id} · {date(event.detected_at)}</span></div><Status status={event.severity} /><span className="chevron">›</span></button>)}</div> : <Empty title="No disruptions yet" detail="Create a demo event to start the recovery workflow." action="Create event" onClick={onCreate} />}
      </section>
      <section className="panel approval-panel"><div className="panel-heading"><div><h3>Approval queue</h3><p>Decisions waiting for a human reviewer</p></div><button className="text-button" onClick={onOpenApprovals}>Open queue <span>→</span></button></div>
        {pending.length ? <div className="approval-list">{pending.slice(0, 4).map((item) => <button className="approval-row" key={item.approval_id} onClick={onOpenApprovals}><div className="approval-icon">↗</div><div className="event-main"><strong>{item.reason || item.scenario_id}</strong><span>{item.incident_id} · Plan {item.plan_version}</span></div><span className="chevron">›</span></button>)}</div> : <div className="empty-approvals"><div className="empty-check">✓</div><strong>You're all caught up</strong><span>No approvals are waiting right now.</span></div>}
      </section>
    </div>
    <div className="footnote-bar"><span className="info-icon">i</span><span><strong>Estimated impact</strong> Metrics and recovery projections use scenario data and deterministic calculations. They are not live procurement or freight commitments.</span><button onClick={() => events[0] && onOpenIncident(events[0].incident_id)}>View methodology <span>→</span></button></div>
  </>;
}

function IncidentView({ events, incidentId, incident, impact, scenarioData, audit, loading, busy, onSelectIncident, onAnalyze, onChooseScenario, onExecute }: {
  events: DisruptionEvent[]; incidentId: string; incident: Incident | null; impact: ImpactAnalysis | null;
  scenarioData: ScenarioList | null; audit: AuditEvent[]; loading: boolean; busy: string;
  onSelectIncident: (id: string) => void; onAnalyze: () => void;
  onChooseScenario: (scenario: RecoveryScenario) => void;
  onExecute: (scenario: RecoveryScenario, approvalId?: string | null) => void;
}) {
  const event = events.find((item) => item.incident_id === incidentId);
  const scenarios = scenarioData?.scenarios || [];
  const selected = scenarios.find((item) => item.scenario_id === incident?.selected_scenario_id);
  const approvalId = incident?.approval_id;
  return <>
    <div className="page-heading incident-heading"><div><div className="eyebrow">OPERATIONS <span className="heading-dot"></span> INCIDENT MANAGEMENT</div><h1>Incident details</h1><p>Review impact, compare recovery options, and track decisions.</p></div><div className="heading-actions"><label className="select-wrap"><span>Incident</span><select value={incidentId} onChange={(e) => onSelectIncident(e.target.value)} aria-label="Select incident">{events.length ? events.map((item) => <option key={item.incident_id} value={item.incident_id}>{item.incident_id} · {item.title}</option>) : <option value="">No incidents found</option>}</select></label>{incident && ["DETECTED", "FAILED"].includes(incident.status) && <button className="primary-button" disabled={busy === "analyze" || loading} onClick={onAnalyze}>{busy === "analyze" ? <><span className="spinner light"></span> Analyzing…</> : <><span>✧</span> Analyze incident</>}</button>}</div></div>
    {loading ? <div className="panel loading-panel"><span className="spinner"></span>Loading incident from database…</div> : !incident ? <div className="panel"><Empty title="Choose an incident" detail="Create a disruption or select one from the list to see its impact and recovery options." /></div> : <>
      <section className="incident-banner"><div className="incident-title"><SeverityDot severity={incident.severity} /><div><div className="incident-id">{incident.incident_id} <span>·</span> {incident.event_id}</div><h2>{incident.title}</h2><p>{event?.description || incident.impact_summary || "Disruption event saved to the shared operations database."}</p></div></div><div className="banner-right"><Status status={incident.status} /><span>Updated {date(incident.updated_at)}</span></div></section>
      <div className="section-row tight"><div><h2>Impact assessment</h2><p>Inventory position and production exposure</p></div>{impact && <span className="quiet-label">Calculated {date(impact.computed_at)}</span>}</div>
      {impact ? <div className="impact-grid">{(impact.component_impacts || []).map((component) => <div className="impact-card" key={component.component_id}><div className="impact-top"><span className="impact-icon">▦</span><span className={component.projected_stockout_before_eta ? "risk-chip critical" : "risk-chip clear"}>{component.projected_stockout_before_eta ? "Stockout risk" : "Covered"}</span></div><span className="impact-label">COMPONENT</span><strong className="component-id">{component.component_id}</strong><div className="impact-stats"><div><span>Available</span><strong>{component.available_qty.toLocaleString()} <small>units</small></strong></div><div><span>Coverage</span><strong>{component.coverage_days ?? "—"} <small>days</small></strong></div><div><span>ETA</span><strong>{component.delayed_shipment_eta_days ?? "—"} <small>days</small></strong></div></div><div className="progress-track"><span style={{ width: `${Math.min(100, ((component.coverage_days || 0) / Math.max(component.delayed_shipment_eta_days || 1, 1)) * 100)}%` }} /></div></div>)}<div className="impact-card order-card"><div className="impact-top"><span className="impact-icon violet">▤</span><span className="quiet-label">AFFECTED</span></div><span className="impact-label">PRODUCTION ORDERS</span><strong className="big-number">{impact.affected_order_ids.length}</strong><span className="muted">{impact.affected_order_ids.join(", ") || "No orders identified"}</span><div className="order-meta"><span>Projected shortage</span><strong>{impact.projected_shortage_units.toLocaleString()} units</strong></div></div></div> : <div className="panel empty-impact"><div className="empty-icon">◎</div><div><strong>Impact analysis is not available yet</strong><p>Run the analysis to calculate stock coverage, affected orders, and shortage exposure.</p></div>{incident.status === "DETECTED" && <button className="primary-button small" onClick={onAnalyze} disabled={busy === "analyze"}>Analyze now <span>→</span></button>}</div>}
      {impact && <div className="evidence-strip"><div className="evidence-head"><span>▤</span><strong>Evidence & assumptions</strong></div><div className="evidence-content"><span><b>Sources</b> {(impact.evidence_refs || []).join(", ") || event?.source_name || "Demo event"}</span><span><b>Assumptions</b> {(impact.assumptions || []).join(" · ") || "Deterministic demo data"}</span></div></div>}
      <div className="section-row scenarios-header"><div><h2>Recovery options</h2><p>Ranked plans from the scenario planner</p></div><span className="option-count">{scenarios.length} OPTIONS</span></div>
      {scenarios.length ? <div className="scenario-table-wrap"><table className="scenario-table"><thead><tr><th>PLAN</th><th>INCREMENTAL COST</th><th>ARRIVAL</th><th>PRODUCTION IMPACT</th><th>FEASIBILITY</th><th>POLICY</th><th></th></tr></thead><tbody>{scenarios.map((scenario) => {
        const isSelected = incident.selected_scenario_id === scenario.scenario_id;
        const isBlocked = scenario.policy_status === "BLOCKED" || !scenario.feasible;
        return <tr key={scenario.scenario_id} className={isSelected ? "selected-row" : ""}><td><div className="plan-name"><span className="rank">{scenario.rank}</span><div><strong>{scenario.name}</strong><span>{scenario.strategy_type.replaceAll("_", " ")} · {scenario.plan_version}</span></div></div>{scenario.reasoning_summary && <div className="plan-reason">{scenario.reasoning_summary}</div>}</td><td className="cost-cell">{money(scenario.incremental_cost, scenario.currency)}</td><td>{scenario.arrival_days} days</td><td>{scenario.estimated_production_delay_days} days delay <span className="table-sub">{scenario.unmet_demand_units_before_recovery} units exposed</span></td><td><Status status={scenario.feasible ? "feasible" : "blocked"} /></td><td><Status status={scenario.policy_status} />{scenario.reason_codes?.length > 0 && <span className="table-sub">{scenario.reason_codes.join(", ")}</span>}</td><td>{isBlocked ? <span className="disabled-action">Unavailable</span> : isSelected ? <span className="selected-tag">Selected ✓</span> : <button className="select-button" onClick={() => onChooseScenario(scenario)} disabled={!!busy}>Select</button>}</td></tr>;
      })}</tbody></table></div> : <div className="panel empty-impact"><div className="empty-icon">↗</div><div><strong>No recovery plans yet</strong><p>Run incident analysis to compare feasible options, cost, lead time, and policy.</p></div>{incident.status === "DETECTED" && <button className="outline-button small" onClick={onAnalyze}>Generate plans <span>→</span></button>}</div>}
      {selected && <div className="selected-plan-bar"><div><span className="selected-check">✓</span><div><strong>{selected.name}</strong><span>{approvalId ? `Approval request ${approvalId}` : `${selected.policy_status} · ${selected.plan_version}`}</span></div></div>{incident.status === "READY_TO_EXECUTE" && <button className="primary-button small" disabled={busy === "execute"} onClick={() => onExecute(selected, approvalId)}>{busy === "execute" ? "Executing…" : "Execute simulation"}<span> →</span></button>}{incident.status === "AWAITING_APPROVAL" && <span className="awaiting-label">Awaiting human approval</span>}{incident.status === "VERIFIED" && <span className="verified-label">✓ Outcome verified</span>}</div>}
      <div className="section-row audit-heading"><div><h2>Audit timeline</h2><p>Traceable history of the incident and its decisions</p></div><span className="quiet-label">{audit.length} EVENTS</span></div>
      <AuditTimeline events={audit} />
      {event && <div className="source-details"><span className="source-icon">i</span><div><strong>Event provenance</strong><span>{event.source_name} · {pretty(event.source_type)} · Confidence {Math.round(event.confidence * 100)}% · {date(event.detected_at)}</span>{event.evidence?.map((item) => <em key={item}>{item}</em>)}</div></div>}
    </>}
  </>;
}

function ApprovalView({ approvals, events, selected, busy, onSelect, onDecision, onOpenIncident }: {
  approvals: Approval[]; events: DisruptionEvent[]; selected: Approval | null; busy: string;
  onSelect: (approval: Approval | null) => void; onDecision: (approval: Approval, decision: "approve" | "reject") => void;
  onOpenIncident: (id: string) => void;
}) {
  const pending = approvals.filter((item) => item.status === "pending");
  const resolved = approvals.filter((item) => item.status !== "pending");
  return <>
    <div className="page-heading"><div><div className="eyebrow">GOVERNANCE <span className="heading-dot"></span> HUMAN REVIEW</div><h1>Approval queue</h1><p>Review recovery plans that need an authorized decision.</p></div><div className="queue-count"><strong>{pending.length.toString().padStart(2, "0")}</strong><span>WAITING</span></div></div>
    {selected && <div className="review-layout"><section className="panel review-card"><div className="review-title"><div className="review-icon">↗</div><div><span className="eyebrow">APPROVAL REQUEST</span><h2>{selected.reason || selected.scenario_id}</h2></div><Status status={selected.status} /></div><p className="review-description">A recovery action for <button className="inline-link" onClick={() => onOpenIncident(selected.incident_id)}>{selected.incident_id}</button> needs your review before it can be simulated.</p><div className="review-facts"><Fact label="INCIDENT" value={selected.incident_id} /><Fact label="SCENARIO" value={selected.scenario_id} /><Fact label="PLAN VERSION" value={selected.plan_version} /><Fact label="REQUESTED" value={date(selected.created_at)} /><Fact label="REQUESTED BY" value={selected.requested_by || "System"} /><Fact label="EVENT" value={events.find((event) => event.incident_id === selected.incident_id)?.title || "Supply disruption"} /></div><div className="policy-note"><span>i</span><div><strong>Policy review</strong><p>{selected.reason || "This plan exceeded an automatic approval threshold. Confirm the scenario and plan version before deciding."}</p></div></div><div className="review-actions"><button className="reject-button" disabled={busy === "decision"} onClick={() => onDecision(selected, "reject")}>Reject request</button><button className="primary-button" disabled={busy === "decision"} onClick={() => onDecision(selected, "approve")}>{busy === "decision" ? "Saving…" : "Approve plan"}<span> ✓</span></button></div></section><aside className="review-aside"><div className="aside-number">01</div><h3>Human in the loop</h3><p>Approval applies only to this incident and this exact plan version. The backend rechecks policy before any simulated execution.</p><div className="aside-divider"></div><div className="aside-check"><span>✓</span> No live procurement or freight booking</div><div className="aside-check"><span>✓</span> Rejection never executes an action</div><div className="aside-check"><span>✓</span> Every decision is recorded in the audit trail</div></aside></div>}
    {!selected && <section className="panel queue-panel"><div className="panel-heading"><div><h3>Pending review</h3><p>Newest requests appear first</p></div><span className="option-count">{pending.length} PENDING</span></div>{pending.length ? <div className="queue-list">{pending.map((item) => <button className="queue-row" key={item.approval_id} onClick={() => onSelect(item)}><span className="approval-icon">↗</span><div className="event-main"><strong>{item.reason || item.scenario_id}</strong><span>{item.incident_id} · {item.scenario_id} · Version {item.plan_version}</span></div><span className="queue-event">{events.find((event) => event.incident_id === item.incident_id)?.title || "Supply disruption"}</span><span className="quiet-label">{date(item.created_at)}</span><span className="chevron">›</span></button>)}</div> : <Empty title="No pending approvals" detail="Approval requests created during analysis will appear here." />}</section>}
    <section className="panel history-panel"><div className="panel-heading"><div><h3>Recent decisions</h3><p>Previously reviewed approval requests</p></div></div>{resolved.length ? <div className="history-list">{resolved.slice(0, 5).map((item) => <div className="history-row" key={item.approval_id}><span className={item.status === "approved" ? "history-mark approved" : "history-mark rejected"}>{item.status === "approved" ? "✓" : "×"}</span><div className="event-main"><strong>{item.scenario_id}</strong><span>{item.incident_id} · Reviewed by {item.reviewed_by || "operator"}</span></div><Status status={item.status} /><span className="quiet-label">{date(item.reviewed_at || item.created_at)}</span></div>)}</div> : <p className="history-empty">Reviewed decisions will appear here.</p>}</section>
  </>;
}

function AuditTimeline({ events }: { events: AuditEvent[] }) {
  if (!events.length) return <div className="panel audit-empty"><span className="audit-empty-icon">◷</span><div><strong>Audit events will appear here</strong><span>Analysis, policy decisions, approvals, execution, and verification are recorded by the backend.</span></div></div>;
  return <div className="panel timeline">{events.map((event, index) => <div className="timeline-row" key={event.audit_id}><div className="timeline-rail"><span className={index === 0 ? "timeline-point current" : "timeline-point"}></span>{index < events.length - 1 && <i />}</div><div className="timeline-copy"><div><strong>{pretty(event.event_type)}</strong><span>{date(event.created_at)}</span></div><p>{event.reason || `${pretty(event.actor_type)} · ${event.actor_id || "system"}`}</p>{event.evidence_refs?.length > 0 && <small>Evidence: {event.evidence_refs.join(", ")}</small>}</div><code>{event.audit_id}</code></div>)}</div>;
}

function CreateModal({ onClose, onSubmit, busy }: { onClose: () => void; onSubmit: (data: FormData) => void; busy: boolean }) {
  return <div className="modal-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}><form className="modal" onSubmit={(e) => { e.preventDefault(); onSubmit(new FormData(e.currentTarget)); }}><div className="modal-header"><div><span className="eyebrow">DEMO EVENT</span><h2>Simulate a disruption</h2><p>Save a sample event to the connected operations database.</p></div><button type="button" className="close-button" onClick={onClose} aria-label="Close">×</button></div><label className="field-label">Event title<input name="title" required defaultValue="Critical component shipment delayed" placeholder="Describe the disruption" /></label><label className="field-label">Description<textarea name="description" required defaultValue="SHP-102 revised ETA is 12 days from today. Current usable stock covers 5 days of demand." rows={3} /></label><div className="form-row"><label className="field-label">Severity<select name="severity" defaultValue="high"><option value="critical">Critical</option><option value="high">High</option><option value="medium">Medium</option><option value="low">Low</option></select></label><label className="field-label">Shipment ID<input name="shipment" defaultValue="SHP-102" /></label></div><div className="modal-note"><span>i</span>Demo event only. No external systems or live orders will be changed.</div><div className="modal-actions"><button className="outline-button" type="button" onClick={onClose}>Cancel</button><button className="primary-button" disabled={busy} type="submit">{busy ? "Saving…" : "Create disruption"}<span> →</span></button></div></form></div>;
}

function Metric({ label, value, icon, tone, note }: { label: string; value: number; icon: string; tone: string; note: string }) {
  return <div className="metric-card"><div className={`metric-icon ${tone}`}>{icon}</div><span className="metric-label">{label}</span><div className="metric-value">{value.toLocaleString("en-IN")}</div><div className="metric-note"><span className={`note-dot ${tone}`}></span>{note}</div></div>;
}
function SeverityDot({ severity }: { severity: string }) { return <span className={`severity-dot ${severity.toLowerCase()}`} aria-label={`${severity} severity`} />; }
function Status({ status }: { status: string }) {
  const key = status.toLowerCase().replaceAll("_", "-");
  const label = status.replaceAll("_", " ").replaceAll("-", " ").toLowerCase();
  return <span className={`status-pill ${key}`}><i />{label}</span>;
}
function Empty({ title, detail, action, onClick }: { title: string; detail: string; action?: string; onClick?: () => void }) {
  return <div className="empty-state"><div className="empty-icon">◌</div><strong>{title}</strong><span>{detail}</span>{action && <button className="text-button" onClick={onClick}>{action} →</button>}</div>;
}
function Fact({ label, value }: { label: string; value: string }) { return <div className="fact"><span>{label}</span><strong>{value}</strong></div>; }

export default App;
