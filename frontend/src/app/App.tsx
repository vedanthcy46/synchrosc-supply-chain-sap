import { useCallback, useEffect, useMemo, useState } from "react";
import { Activity, AlertTriangle, ArrowUpRight, BadgeCheck, Boxes, Check, ChevronRight, CircleHelp, Clock3, Database, FileClock, Gauge, LoaderCircle, PackageCheck, Play, RefreshCw, ShieldCheck, Truck, X } from "lucide-react";
import { api, type Approval, type AuditEvent, type Dashboard, type Impact, type Incident, type Scenario } from "../api/client";

type View = "overview" | "incident" | "approvals" | "audit";
const money = (value: number) => new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(value);
const dateTime = (value?: string) => value ? new Date(value).toLocaleString() : "—";

export default function App() {
  const [view, setView] = useState<View>("overview");
  const [dashboard, setDashboard] = useState<Dashboard | null>(null);
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [selected, setSelected] = useState<Incident | null>(null);
  const [impact, setImpact] = useState<Impact | null>(null);
  const [scenarios, setScenarios] = useState<Scenario[]>([]);
  const [approvals, setApprovals] = useState<Approval[]>([]);
  const [audit, setAudit] = useState<AuditEvent[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async (restore = true) => {
    setError("");
    try {
      const [summary, events, approvalList] = await Promise.all([api.dashboard(), api.disruptions(), api.approvals()]);
      setDashboard(summary);
      setApprovals(approvalList.items);
      const loaded = await Promise.all(events.items.filter((event) => event.incident_id).map((event) => api.incident(event.incident_id!)));
      setIncidents(loaded.sort((a, b) => b.created_at.localeCompare(a.created_at)));
      const savedId = restore ? localStorage.getItem("synchrosc-selected-incident") : selected?.incident_id;
      const current = loaded.find((item) => item.incident_id === savedId);
      if (current) await openIncident(current);
      else if (selected && loaded.some((item) => item.incident_id === selected.incident_id)) {
        const fresh = loaded.find((item) => item.incident_id === selected.incident_id)!;
        await openIncident(fresh);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not reach the SynchroSC API.");
    } finally {
      setLoading(false);
    }
  }, [selected]);

  const openIncident = useCallback(async (incident: Incident) => {
    setSelected(incident);
    localStorage.setItem("synchrosc-selected-incident", incident.incident_id);
    setError("");
    try {
      const [fresh, impactResult, scenarioResult, auditResult, approvalResult] = await Promise.all([
        api.incident(incident.incident_id), api.impact(incident.incident_id), api.scenarios(incident.incident_id),
        api.audit(incident.incident_id), api.approvals(),
      ]);
      setSelected(fresh);
      setImpact(impactResult);
      setScenarios(scenarioResult.scenarios);
      setAudit(auditResult.items);
      setApprovals(approvalResult.items);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load the incident details.");
    }
  }, []);

  useEffect(() => { void refresh(); }, []); // Load persisted workflow state on entry/refresh.

  const pendingApprovals = useMemo(() => approvals.filter((item) => item.status === "pending"), [approvals]);
  const selectedApproval = approvals.find((item) => item.approval_id === selected?.approval_id);

  async function runAction(action: () => Promise<unknown>, success: string, thenRefresh = true) {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await action();
      setNotice(success);
      if (thenRefresh) await refresh(false);
      if (selected) await openIncident(selected);
    } catch (err) {
      setError(err instanceof Error ? err.message : "The action could not be completed.");
      if (selected) await openIncident(selected);
      await refresh(false);
    } finally {
      setBusy(false);
    }
  }

  async function createDemo() {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const result = await api.createDemoDisruption();
      const analysis = await api.analyze(result.incident_id);
      setScenarios(analysis.scenarios);
      await refresh(false);
      const incident = await api.incident(result.incident_id);
      await openIncident(incident);
      setView("incident");
      setNotice("Demo disruption analyzed. Review impact and recovery options.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create the demo disruption.");
    } finally {
      setBusy(false);
    }
  }

  async function analyzeSelected() {
    if (!selected) return;
    await runAction(async () => {
      const result = await api.analyze(selected.incident_id);
      setScenarios(result.scenarios);
      setView("incident");
    }, "Impact and recovery options are ready.");
  }

  async function chooseScenario(scenario: Scenario) {
    if (!selected) return;
    await runAction(async () => {
      await api.selectScenario(selected.incident_id, scenario.scenario_id);
      setSelected(await api.incident(selected.incident_id));
    }, "Scenario selection saved. Check the approval gate before execution.");
  }

  async function decide(approval: Approval, decision: "approve" | "reject") {
    await runAction(() => api.decide(approval.approval_id, decision), decision === "approve" ? "Approval recorded. The plan is ready for simulated execution." : "Request rejected. No action was executed.");
  }

  async function executeSelected() {
    if (!selected?.selected_scenario_id) return;
    await runAction(() => api.execute(selected.selected_scenario_id!, selected.incident_id, selected.approval_id), "Simulation completed and outcome verification was recorded.");
  }

  const activeScenario = scenarios.find((scenario) => scenario.scenario_id === selected?.selected_scenario_id);

  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="brand"><div className="brand-mark"><Activity size={21} /></div><div><strong>SynchroSC</strong><span>SUPPLY CHAIN CONTROL</span></div></div>
        <div className="workspace-label">WORKSPACE</div>
        <nav className="nav-list" aria-label="Main navigation">
          <NavButton active={view === "overview"} icon={<Gauge size={18} />} label="Control tower" onClick={() => setView("overview")} />
          <NavButton active={view === "incident"} icon={<Truck size={18} />} label="Incident analysis" onClick={() => setView("incident")} />
          <NavButton active={view === "approvals"} icon={<ShieldCheck size={18} />} label="Approval queue" count={pendingApprovals.length} onClick={() => setView("approvals")} />
          <NavButton active={view === "audit"} icon={<FileClock size={18} />} label="Audit timeline" onClick={() => setView("audit")} />
        </nav>
        <div className="sidebar-bottom"><div className="connection"><span className="connection-dot" /><div><strong>API connected</strong><small>Simulation environment</small></div></div><div className="sidebar-version">SynchroSC · Prototype</div></div>
      </aside>

      <main className="main-area">
        <header className="topbar"><div className="breadcrumb">Operations <ChevronRight size={14} /> <strong>{viewTitle(view)}</strong></div><div className="top-actions"><span className="demo-chip"><span /> DEMO · SIMULATED DATA</span><button className="icon-button" aria-label="Refresh dashboard" onClick={() => void refresh(false)} disabled={busy}><RefreshCw size={16} /></button><div className="avatar">DO</div></div></header>
        <div className="page">
          {error && <div className="alert alert-error" role="alert"><AlertTriangle size={17} /><span>{error}</span><button aria-label="Dismiss error" onClick={() => setError("")}><X size={16} /></button></div>}
          {notice && <div className="alert alert-success" role="status"><BadgeCheck size={17} /><span>{notice}</span><button aria-label="Dismiss message" onClick={() => setNotice("")}><X size={16} /></button></div>}
          {loading ? <Loading /> : view === "overview" ? (
            <>
              <div className="page-heading"><div><div className="eyebrow">TUESDAY, OCTOBER 13</div><h1>Good afternoon, operator</h1><p>Monitor disruptions, assess supply risk, and coordinate a controlled recovery.</p></div><button className="button button-primary" onClick={createDemo} disabled={busy}><Play size={16} /> Simulate disruption</button></div>
              <div className="kpi-grid">
                <Metric label="Active incidents" value={dashboard?.active_incidents_count ?? 0} detail="Requiring attention" icon={<Activity size={18} />} tone="blue" />
                <Metric label="Pending approvals" value={dashboard?.pending_approvals_count ?? 0} detail="Human decision needed" icon={<ShieldCheck size={18} />} tone="amber" />
                <Metric label="Monitored components" value={dashboard?.monitored_components_count ?? 0} detail="Across demo inventory" icon={<Boxes size={18} />} tone="teal" />
                <Metric label="Execution mode" value="Simulation" detail="No live SAP writes" icon={<Database size={18} />} tone="slate" />
              </div>
              <div className="content-grid">
                <section className="panel incidents-panel"><div className="panel-heading"><div><h2>Recent incidents</h2><p>Disruption signals and workflow status</p></div><span className="subtle-count">{incidents.length} total</span></div>
                  {incidents.length ? <div className="incident-table-wrap"><table><thead><tr><th>Incident</th><th>Severity</th><th>Status</th><th>Detected</th><th /></tr></thead><tbody>{incidents.map((incident) => <tr key={incident.incident_id} onClick={() => { void openIncident(incident); setView("incident"); }}><td><div className="incident-name"><span className="incident-icon"><Truck size={16} /></span><span><strong>{incident.title}</strong><small>{incident.incident_id} · {incident.event_id}</small></span></div></td><td><Severity value={incident.severity} /></td><td><Status value={incident.status} /></td><td className="date-cell">{dateTime(incident.created_at)}</td><td><ChevronRight size={16} className="row-chevron" /></td></tr>)}</tbody></table></div> : <Empty icon={<PackageCheck size={22} />} title="No incidents yet" detail="Start with the critical shipment delay demo." action={<button className="button button-secondary" onClick={createDemo} disabled={busy}>Run demo scenario</button>} />}
                </section>
                <section className="panel side-panel"><div className="panel-heading"><div><h2>Attention needed</h2><p>Items that need an operator</p></div><span className="attention-count">{pendingApprovals.length}</span></div>
                  {pendingApprovals.length ? <div className="attention-list">{pendingApprovals.slice(0, 4).map((approval) => <button className="attention-item" key={approval.approval_id} onClick={() => { setView("approvals"); if (incidents.find((item) => item.incident_id === approval.incident_id)) void openIncident(incidents.find((item) => item.incident_id === approval.incident_id)!); }}><span className="attention-icon"><Clock3 size={17} /></span><span><strong>{approval.scenario_id.replaceAll("-", " ")}</strong><small>{approval.incident_id} · Plan {approval.plan_version}</small></span><ChevronRight size={16} /></button>)}</div> : <Empty icon={<Check size={21} />} title="Queue is clear" detail="No pending decisions right now." />}
                  <div className="policy-note"><ShieldCheck size={17} /><span>Actions are checked against current policy and require approval when thresholds are exceeded.</span></div>
                </section>
              </div>
              <div className="bottom-grid"><section className="panel process-panel"><div className="panel-heading"><div><h2>Recovery workflow</h2><p>Every action is policy checked and simulated</p></div></div><div className="workflow-steps"><Step icon={<AlertTriangle size={16} />} title="Detect" detail="Evidence captured" /><Step icon={<Activity size={16} />} title="Assess" detail="Inventory & orders" /><Step icon={<ArrowUpRight size={16} />} title="Compare" detail="Recovery options" /><Step icon={<ShieldCheck size={16} />} title="Approve" detail="Human oversight" /><Step icon={<PackageCheck size={16} />} title="Verify" detail="Outcome recorded" last /></div></section><section className="panel provenance-panel"><div className="panel-heading"><div><h2>Data provenance</h2><p>Clear separation from live operations</p></div><CircleHelp size={17} className="muted-icon" /></div><div className="provenance-row"><span className="provenance-dot teal-dot" /><span>Supply chain records</span><strong>Synthetic demo</strong></div><div className="provenance-row"><span className="provenance-dot blue-dot" /><span>Event source</span><strong>Demo fixture</strong></div><div className="provenance-row"><span className="provenance-dot amber-dot" /><span>Execution target</span><strong>Simulation only</strong></div></section></div>
            </>
          ) : view === "incident" ? (
            <>
              <div className="page-heading"><div><div className="eyebrow">INCIDENT DETAIL {selected && `· ${selected.incident_id}`}</div><h1>{selected?.title || "Incident analysis"}</h1><p>Understand the exposure, compare recovery choices, then select a controlled response.</p></div><div className="heading-actions">{selected && <Status value={selected.status} />}{selected && ["DETECTED", "FAILED"].includes(selected.status) && <button className="button button-primary" onClick={analyzeSelected} disabled={busy}><Activity size={16} /> Analyze incident</button>}</div></div>
              {!selected ? <Empty icon={<Truck size={22} />} title="Choose an incident" detail="Select a recent incident from the Control Tower to review its impact." action={<button className="button button-secondary" onClick={() => setView("overview")}>View incidents</button>} /> : <>
                {impact && <div className="impact-banner"><div className="impact-title"><span className="impact-alert"><AlertTriangle size={18} /></span><div><strong>Production continuity at risk</strong><small>SHP-102 delay threatens component supply before its revised arrival.</small></div></div><div className="impact-quick"><ImpactStat label="Usable stock" value={`${impact.component_impacts[0]?.available_qty ?? 0} units`} /><ImpactStat label="Coverage" value={`${impact.component_impacts[0]?.coverage_days ?? "—"} days`} /><ImpactStat label="Revised ETA" value={`${impact.component_impacts[0]?.delayed_shipment_eta_days ?? "—"} days`} /></div></div>}
                <div className="analysis-grid"><section className="panel impact-panel"><div className="panel-heading"><div><h2>Impact assessment</h2><p>Calculated from current demo inventory and demand</p></div><span className="source-badge">DEMO FIXTURE</span></div>{impact ? <><div className="impact-metrics"><div><span>Component</span><strong>{impact.component_impacts[0]?.component_id ?? "—"}</strong></div><div><span>Daily demand</span><strong>{impact.component_impacts[0]?.daily_demand ?? 0} <small>units/day</small></strong></div><div><span>Estimated shortage</span><strong className="risk-text">{impact.projected_shortage_units} <small>units</small></strong></div><div><span>Orders affected</span><strong>{impact.affected_order_ids.length}</strong></div></div><div className="evidence-block"><div className="detail-label">AFFECTED ORDERS</div><div className="tag-list">{impact.affected_order_ids.map((id) => <span className="order-tag" key={id}>{id}</span>)}</div></div><div className="evidence-block"><div className="detail-label">EVIDENCE REFERENCES</div><div className="tag-list">{impact.evidence_refs.map((ref) => <span className="evidence-tag" key={ref}>{ref}</span>)}</div></div><div className="assumptions"><strong>Assumptions</strong><ul>{impact.assumptions.map((item) => <li key={item}>{item}</li>)}</ul></div></> : <Empty icon={<Activity size={20} />} title="Analysis not run" detail="Run analysis to calculate stock coverage and affected orders." />}</section>
                  <section className="panel decision-panel"><div className="panel-heading"><div><h2>Decision status</h2><p>Server verified workflow state</p></div><ShieldCheck size={18} className="muted-icon" /></div><div className="decision-line"><span>Selected option</span><strong>{activeScenario?.name || "No option selected"}</strong></div>{activeScenario && <><div className="decision-line"><span>Plan version</span><strong>{activeScenario.plan_version}</strong></div><div className="decision-line"><span>Policy disposition</span><Status value={activeScenario.policy_status} /></div>{selectedApproval && <div className="approval-callout"><Clock3 size={16} /><span>Approval {selectedApproval.approval_id} · {selectedApproval.status}</span></div>}</>}{selected?.status === "READY_TO_EXECUTE" && <button className="button button-success full-button" onClick={executeSelected} disabled={busy}><Play size={16} /> Execute simulation</button>}{selected?.status === "VERIFIED" && <div className="verified-callout"><BadgeCheck size={18} /><span>Outcome verified in simulation</span></div>}</section></div>
                <section className="panel scenario-panel"><div className="panel-heading"><div><h2>Recovery options</h2><p>Ranked alternatives · estimated costs in INR</p></div>{scenarios.length > 0 && <span className="subtle-count">{scenarios.length} options</span>}</div>{scenarios.length ? <div className="scenario-grid">{scenarios.map((scenario) => <ScenarioCard key={scenario.scenario_id} scenario={scenario} selected={selected.selected_scenario_id === scenario.scenario_id} disabled={busy || !scenario.feasible || scenario.policy_status === "BLOCKED" || !["OPTIONS_READY", "AWAITING_APPROVAL"].includes(selected.status)} onSelect={() => void chooseScenario(scenario)} />)}</div> : <Empty icon={<Boxes size={22} />} title="No recovery options yet" detail="Analyze this incident to compare expedited freight, alternate supply, and inventory transfer." action={selected && ["DETECTED", "FAILED"].includes(selected.status) ? <button className="button button-secondary" onClick={analyzeSelected} disabled={busy}>Analyze incident</button> : undefined} />}</section>
                <section className="panel evidence-panel"><div className="panel-heading"><div><h2>Source evidence</h2><p>Original disruption information retained for review</p></div></div><div className="evidence-summary"><span className="source-badge">DEMO · demo_seed.json</span><span className="severity-high"><span /> HIGH SEVERITY</span><p>Critical component shipment SHP-102 revised arrival is 12 days from now. The scenario fixture records an ETA change that threatens the current five-day stock coverage.</p></div></section>
              </>}
            </>
          ) : view === "approvals" ? (
            <><div className="page-heading"><div><div className="eyebrow">HUMAN GOVERNANCE</div><h1>Approval queue</h1><p>Review the exact scenario and plan version before authorizing a simulation.</p></div><span className="demo-chip"><span /> POLICY CONTROL ACTIVE</span></div><section className="panel approval-panel"><div className="panel-heading"><div><h2>Pending decisions</h2><p>Approval does not override hard policy blocks</p></div><span className="attention-count">{pendingApprovals.length}</span></div>{pendingApprovals.length ? <div className="approval-list">{pendingApprovals.map((approval) => { const scenario = scenarios.find((item) => item.scenario_id === approval.scenario_id); const incident = incidents.find((item) => item.incident_id === approval.incident_id); return <div className="approval-card" key={approval.approval_id}><div className="approval-card-top"><span className="attention-icon"><Clock3 size={17} /></span><div className="approval-card-title"><strong>{scenario?.name || approval.scenario_id}</strong><small>{incident?.title || approval.incident_id} · Requested {dateTime(approval.created_at)}</small></div><Status value={approval.status} /></div><div className="approval-facts"><div><span>Plan version</span><strong>{approval.plan_version}</strong></div><div><span>Estimated cost</span><strong>{scenario ? money(scenario.incremental_cost) : "See scenario"}</strong></div><div><span>Policy reasons</span><strong>{scenario?.reason_codes.join(", ") || approval.reason}</strong></div></div><p className="approval-reason">{approval.reason || "Cost or operational risk exceeds automatic action limits."}</p><div className="approval-actions"><button className="button button-secondary" onClick={() => { const item = incidents.find((x) => x.incident_id === approval.incident_id); if (item) { void openIncident(item); setView("incident"); } }}>Review incident</button><div className="decision-buttons"><button className="button button-danger" onClick={() => void decide(approval, "reject")} disabled={busy}><X size={15} /> Reject</button><button className="button button-primary" onClick={() => void decide(approval, "approve")} disabled={busy}><Check size={15} /> Approve plan</button></div></div></div>; })}</div> : <Empty icon={<Check size={21} />} title="No pending approvals" detail="Risky plans will appear here with their policy reasons and version." />}</section></>
          ) : (
            <><div className="page-heading"><div><div className="eyebrow">APPEND-ONLY HISTORY</div><h1>Audit timeline</h1><p>Trace each event, policy check, approval decision, simulated action, and verification result.</p></div>{selected && <span className="source-badge">{selected.incident_id}</span>}</div>{selected ? <section className="panel audit-panel"><div className="panel-heading"><div><h2>{selected.title}</h2><p>Correlation IDs and state changes are retained from the backend.</p></div><Status value={selected.status} /></div>{audit.length ? <div className="timeline">{audit.map((event) => <div className="timeline-item" key={event.audit_id}><div className="timeline-rail"><span className={`timeline-dot ${event.event_type.includes("FAILED") || event.event_type.includes("DENIED") ? "dot-red" : event.event_type.includes("APPROVAL") ? "dot-amber" : event.event_type.includes("VERIFIED") || event.event_type.includes("EXECUTED") ? "dot-green" : "dot-blue"}`} /></div><div className="timeline-content"><div className="timeline-title"><strong>{event.event_type.replaceAll("_", " ")}</strong><span>{dateTime(event.created_at)}</span></div><p>{event.reason || "Workflow event recorded."}</p><div className="timeline-meta"><span>{event.actor_type}: {event.actor_id}</span><span>Correlation {event.correlation_id}</span>{event.evidence_refs?.length > 0 && <span>Evidence {event.evidence_refs.join(", ")}</span>}</div>{event.after_state && <details><summary>View state change</summary><pre>{JSON.stringify({ before: event.before_state, after: event.after_state }, null, 2)}</pre></details>}</div></div>)}</div> : <Empty icon={<FileClock size={21} />} title="No audit events yet" detail="Select or analyze an incident to build its decision timeline." />}</section> : <Empty icon={<FileClock size={21} />} title="Select an incident to inspect its audit" detail="Audit history is read-only and tied to one incident." action={<button className="button button-secondary" onClick={() => setView("overview")}>View incidents</button>} />}</>
          )}
          <footer className="page-footer"><span><ShieldCheck size={14} /> Demo environment · all actions are simulated</span><span>SynchroSC Control Tower</span></footer>
        </div>
      </main>
      {busy && <div className="busy-indicator" role="status"><LoaderCircle size={16} /> Processing securely…</div>}
    </div>
  );
}

function viewTitle(view: View) { return ({ overview: "Control tower", incident: "Incident analysis", approvals: "Approval queue", audit: "Audit timeline" })[view]; }
function NavButton({ active, icon, label, count, onClick }: { active: boolean; icon: React.ReactNode; label: string; count?: number; onClick: () => void }) { return <button className={`nav-button ${active ? "active" : ""}`} onClick={onClick}>{icon}<span>{label}</span>{count ? <b>{count}</b> : null}</button>; }
function Metric({ label, value, detail, icon, tone }: { label: string; value: string | number; detail: string; icon: React.ReactNode; tone: string }) { return <div className="metric-card"><div className={`metric-icon ${tone}`}>{icon}</div><div className="metric-copy"><span>{label}</span><strong>{value}</strong><small>{detail}</small></div></div>; }
function Status({ value }: { value: string }) { const normalized = value.toLowerCase().replaceAll("_", "-"); return <span className={`status status-${normalized}`}>{value.replaceAll("_", " ")}</span>; }
function Severity({ value }: { value: string }) { return <span className={`severity severity-${value.toLowerCase()}`}><i />{value}</span>; }
function ImpactStat({ label, value }: { label: string; value: string }) { return <div className="impact-stat"><span>{label}</span><strong>{value}</strong></div>; }
function Step({ icon, title, detail, last }: { icon: React.ReactNode; title: string; detail: string; last?: boolean }) { return <div className={`step ${last ? "last" : ""}`}><span className="step-icon">{icon}</span><div><strong>{title}</strong><small>{detail}</small></div><span className="step-line" /></div>; }
function ScenarioCard({ scenario, selected, disabled, onSelect }: { scenario: Scenario; selected: boolean; disabled: boolean; onSelect: () => void }) { return <article className={`scenario-card ${selected ? "scenario-selected" : ""}`}><div className="scenario-top"><span className="rank-badge">#{scenario.rank}</span><Status value={scenario.policy_status} /></div><h3>{scenario.name}</h3><p className="scenario-summary">{scenario.reasoning_summary}</p><div className="scenario-numbers"><div><span>Incremental cost</span><strong>{money(scenario.incremental_cost)}</strong></div><div><span>Arrival</span><strong>{scenario.arrival_days} days</strong></div><div><span>Residual exposure</span><strong className={scenario.unmet_demand_units_before_recovery ? "risk-text" : "good-text"}>{scenario.unmet_demand_units_before_recovery.toLocaleString()} units</strong></div></div><div className="scenario-reasons">{scenario.reason_codes.map((reason) => <span key={reason}>{reason.replaceAll("_", " ")}</span>)}{scenario.reason_codes.length === 0 && <span>Within configured policy</span>}</div><button className={`button ${selected ? "button-selected" : "button-secondary"} full-button`} onClick={onSelect} disabled={disabled}>{selected ? <><Check size={15} /> Selected plan</> : "Select this plan"}</button></article>; }
function Empty({ icon, title, detail, action }: { icon: React.ReactNode; title: string; detail: string; action?: React.ReactNode }) { return <div className="empty-state"><span>{icon}</span><strong>{title}</strong><p>{detail}</p>{action}</div>; }
function Loading() { return <div className="loading-state"><LoaderCircle size={22} /> Loading persisted control tower state…</div>; }
