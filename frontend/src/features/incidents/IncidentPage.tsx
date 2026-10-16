import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  Activity,
  AlertTriangle,
  BadgeCheck,
  Boxes,
  Check,
  ChevronLeft,
  FileClock,
  Play,
  RefreshCw,
  ShieldCheck,
} from "lucide-react";
import { provider } from "../../api/provider";
import type {
  Incident,
  ImpactAnalysis,
  RecoveryScenario,
  ApprovalRequest,
} from "../../types/api";
import {
  BusyIndicator,
  ConfirmDialog,
  dateTime,
  EmptyState,
  ErrorPanel,
  LoadingState,
  money,
  StatusBadge,
  SuccessNotice,
} from "../../components/shared";

export function IncidentPage() {
  const { incidentId } = useParams<{ incidentId: string }>();
  const navigate = useNavigate();

  const [incident, setIncident] = useState<Incident | null>(null);
  const [impact, setImpact] = useState<ImpactAnalysis | null>(null);
  const [scenarios, setScenarios] = useState<RecoveryScenario[]>([]);
  const [approvals, setApprovals] = useState<ApprovalRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [confirmExecute, setConfirmExecute] = useState(false);
  const hasMounted = useRef(false);

  const load = useCallback(async () => {
    if (!incidentId) return;
    setError(null);
    try {
      const [inc, approvalList] = await Promise.all([
        provider.getIncident(incidentId),
        provider.listApprovals(),
      ]);
      setIncident(inc);
      setApprovals(approvalList.items);

      const [impactResult, scenarioResult] = await Promise.allSettled([
        provider.getImpact(incidentId),
        provider.getScenarios(incidentId),
      ]);
      if (impactResult.status === "fulfilled") setImpact(impactResult.value);
      if (scenarioResult.status === "fulfilled") setScenarios(scenarioResult.value.scenarios);
    } catch (err) {
      setError(err instanceof Error ? err : new Error(String(err)));
    } finally {
      setLoading(false);
    }
  }, [incidentId]);

  useEffect(() => {
    if (!hasMounted.current) {
      hasMounted.current = true;
      void load();
    }
  }, [load]);

  async function runAnalysis() {
    if (!incidentId) return;
    setBusy(true);
    setError(null);
    setNotice("");
    try {
      const result = await provider.analyzeIncident(incidentId);
      setScenarios(result.scenarios);
      setNotice("Impact and recovery options are ready.");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err : new Error(String(err)));
    } finally {
      setBusy(false);
    }
  }

  async function handleSelectScenario(scenario: RecoveryScenario) {
    if (!incidentId) return;
    setBusy(true);
    setError(null);
    setNotice("");
    try {
      const result = await provider.selectScenario(incidentId, scenario.scenario_id);
      setNotice(
        result.approval_id
          ? `Scenario selected. Approval ${result.approval_id} created — human decision required before execution.`
          : "Scenario selected and auto-allowed. Ready to execute.",
      );
      await load();
      if (result.approval_id) navigate("/approvals");
    } catch (err) {
      setError(err instanceof Error ? err : new Error(String(err)));
    } finally {
      setBusy(false);
    }
  }

  async function handleExecute() {
    if (!incident?.selected_scenario_id) return;
    setBusy(true);
    setError(null);
    setNotice("");
    setConfirmExecute(false);
    try {
      const result = await provider.executeAction(
        incident.selected_scenario_id,
        incident.incident_id,
        incident.approval_id,
      );
      setNotice(`Simulation completed. Action ${result.action_id} recorded. Audit ID: ${result.audit_id}`);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err : new Error(String(err)));
    } finally {
      setBusy(false);
    }
  }

  if (loading) return <LoadingState label="Loading incident details…" />;
  if (!incident) {
    return (
      <EmptyState
        icon={<AlertTriangle size={22} />}
        title="Incident not found"
        detail={`No incident with ID '${incidentId ?? ""}' exists.`}
        action={<button className="button button-secondary" onClick={() => navigate("/dashboard")}>Back to dashboard</button>}
      />
    );
  }

  const activeScenario = scenarios.find((s) => s.scenario_id === incident.selected_scenario_id);
  const selectedApproval = approvals.find((a) => a.approval_id === incident.approval_id);
  const canAnalyze = ["DETECTED", "FAILED"].includes(incident.status);
  const canExecute = incident.status === "READY_TO_EXECUTE";
  const comp = impact?.component_impacts[0];

  return (
    <>
      {error && <ErrorPanel error={error} onDismiss={() => setError(null)} onRetry={() => { setLoading(true); void load(); }} />}
      {notice && <SuccessNotice message={notice} onDismiss={() => setNotice("")} />}

      <div className="page-heading">
        <div>
          <div className="eyebrow" style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <button className="icon-button" style={{ width: "24px", height: "24px" }} onClick={() => navigate("/dashboard")} aria-label="Back to dashboard">
              <ChevronLeft size={14} />
            </button>
            INCIDENT DETAIL · {incident.incident_id}
          </div>
          <h1>{incident.title}</h1>
          <p>Understand the exposure, compare recovery choices, then select a controlled response.</p>
        </div>
        <div className="heading-actions">
          <StatusBadge value={incident.status} />
          <button className="icon-button" aria-label="Refresh" onClick={() => { setLoading(true); void load(); }} disabled={busy}>
            <RefreshCw size={16} />
          </button>
          <button className="button button-secondary" onClick={() => navigate(`/incidents/${incident.incident_id}/audit`)}>
            <FileClock size={15} /> Audit
          </button>
          {canAnalyze && (
            <button className="button button-primary" onClick={() => void runAnalysis()} disabled={busy}>
              <Activity size={15} /> Analyze incident
            </button>
          )}
        </div>
      </div>

      {/* Impact banner */}
      {comp && (
        <div className="impact-banner">
          <div className="impact-title">
            <span className="impact-alert"><AlertTriangle size={18} /></span>
            <div>
              <strong>Production continuity at risk</strong>
              <small>SHP-102 delay threatens component supply before its revised arrival.</small>
            </div>
          </div>
          <div className="impact-quick">
            <ImpactStat label="Usable stock" value={`${comp.available_qty} units`} />
            <ImpactStat label="Coverage" value={`${comp.coverage_days ?? "—"} days`} />
            <ImpactStat label="Revised ETA" value={`${comp.delayed_shipment_eta_days ?? "—"} days`} />
          </div>
        </div>
      )}

      <div className="analysis-grid">
        {/* Impact panel */}
        <section className="panel impact-panel">
          <div className="panel-heading">
            <div><h2>Impact assessment</h2><p>Calculated from current demo inventory and demand</p></div>
            <span className="source-badge">DEMO FIXTURE</span>
          </div>
          {impact ? (
            <>
              <div className="impact-metrics">
                <div><span>Component</span><strong>{comp?.component_id ?? "—"}</strong></div>
                <div><span>Daily demand</span><strong>{comp?.daily_demand ?? 0} <small>units/day</small></strong></div>
                <div><span>Estimated shortage</span><strong className="risk-text">{impact.projected_shortage_units} <small>units</small></strong></div>
                <div><span>Orders affected</span><strong>{impact.affected_order_ids.length}</strong></div>
              </div>

              {impact.affected_orders && impact.affected_orders.length > 0 && (
                <div className="evidence-block">
                  <div className="detail-label">AFFECTED PRODUCTION ORDERS</div>
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "9px" }}>
                    <thead>
                      <tr style={{ background: "#fbfcfd" }}>
                        <th style={{ padding: "6px 10px", textAlign: "left", color: "#939dad", fontWeight: 600, letterSpacing: "0.5px" }}>Order</th>
                        <th style={{ padding: "6px 10px", textAlign: "left", color: "#939dad", fontWeight: 600 }}>Product</th>
                        <th style={{ padding: "6px 10px", textAlign: "left", color: "#939dad", fontWeight: 600 }}>Priority</th>
                        <th style={{ padding: "6px 10px", textAlign: "left", color: "#939dad", fontWeight: 600 }}>Due (days)</th>
                        <th style={{ padding: "6px 10px", textAlign: "left", color: "#939dad", fontWeight: 600 }}>Qty needed</th>
                      </tr>
                    </thead>
                    <tbody>
                      {impact.affected_orders.map((o) => (
                        <tr key={o.order_id} style={{ borderTop: "1px solid #f1f3f6" }}>
                          <td style={{ padding: "7px 10px", color: "#334156", fontWeight: 600 }}>{o.order_id}</td>
                          <td style={{ padding: "7px 10px", color: "#687487" }}>{o.product_id ?? "—"}</td>
                          <td style={{ padding: "7px 10px" }}>
                            <span style={{ fontSize: "8px", fontWeight: 700, padding: "3px 6px", borderRadius: "4px", background: o.priority === "critical" ? "#fff0ed" : o.priority === "high" ? "#fff5e4" : "#f3f6fa", color: o.priority === "critical" ? "#a44a43" : o.priority === "high" ? "#a66a11" : "#566b88" }}>
                              {o.priority ?? "—"}
                            </span>
                          </td>
                          <td style={{ padding: "7px 10px", color: "#687487" }}>{o.due_in_days ?? "—"}</td>
                          <td style={{ padding: "7px 10px", color: "#687487" }}>{o.required_qty ?? "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              <div className="evidence-block">
                <div className="detail-label">EVIDENCE REFERENCES</div>
                <div className="tag-list">
                  {impact.evidence_refs.map((ref) => <span className="evidence-tag" key={ref}>{ref}</span>)}
                </div>
              </div>

              {impact.warnings && impact.warnings.length > 0 && (
                <div className="evidence-block">
                  <div className="detail-label">WARNINGS</div>
                  <div className="tag-list">
                    {impact.warnings.map((w) => <span key={w} style={{ padding: "5px 7px", borderRadius: "5px", fontSize: "9px", color: "#a66a11", background: "#fff5e4" }}>{w}</span>)}
                  </div>
                </div>
              )}

              <div className="assumptions">
                <strong>Assumptions & data provenance</strong>
                <ul>{impact.assumptions.map((a) => <li key={a}>{a}</li>)}</ul>
                {impact.data_provenance && <li style={{ listStyle: "none", marginTop: "4px", color: "#5877a2", fontSize: "8px" }}>Source: {impact.data_provenance}</li>}
              </div>
            </>
          ) : (
            <EmptyState
              icon={<Activity size={20} />}
              title="Analysis not run"
              detail="Run analysis to calculate stock coverage and affected orders."
              action={canAnalyze ? <button className="button button-secondary" onClick={() => void runAnalysis()} disabled={busy}>Analyze incident</button> : undefined}
            />
          )}
        </section>

        {/* Decision panel */}
        <section className="panel decision-panel">
          <div className="panel-heading">
            <div><h2>Decision status</h2><p>Server verified workflow state</p></div>
            <ShieldCheck size={18} className="muted-icon" />
          </div>
          <div className="decision-line"><span>Selected option</span><strong>{activeScenario?.name || "No option selected"}</strong></div>
          {activeScenario && (
            <>
              <div className="decision-line"><span>Plan version</span><strong>{activeScenario.plan_version}</strong></div>
              <div className="decision-line"><span>Incremental cost</span><strong>{money(activeScenario.incremental_cost)}</strong></div>
              <div className="decision-line"><span>Policy disposition</span><StatusBadge value={activeScenario.policy_status} /></div>
              {selectedApproval && (
                <div className="approval-callout">
                  <ShieldCheck size={16} />
                  <span>Approval {selectedApproval.approval_id} · {selectedApproval.status}</span>
                </div>
              )}
            </>
          )}
          {canExecute && (
            <button className="button button-success full-button" onClick={() => setConfirmExecute(true)} disabled={busy}>
              <Play size={16} /> Execute simulation
            </button>
          )}
          {incident.status === "VERIFIED" && (
            <div className="verified-callout">
              <BadgeCheck size={18} />
              <span>Outcome verified in simulation</span>
            </div>
          )}
          {incident.status === "AWAITING_APPROVAL" && (
            <div className="approval-callout">
              <ShieldCheck size={16} />
              <span>Awaiting human approval before execution is permitted.</span>
            </div>
          )}
          <div style={{ marginTop: "auto", padding: "12px 17px 0" }}>
            <button className="button button-secondary full-button" onClick={() => navigate("/approvals")}>
              <ShieldCheck size={14} /> View approval queue
            </button>
          </div>
        </section>
      </div>

      {/* Scenarios */}
      <section className="panel scenario-panel">
        <div className="panel-heading">
          <div><h2>Recovery options</h2><p>Ranked alternatives · estimated costs in INR · auto-approval threshold ₹50,000</p></div>
          {scenarios.length > 0 && <span className="subtle-count">{scenarios.length} options</span>}
        </div>
        {scenarios.length ? (
          <div className="scenario-grid">
            {scenarios.map((sc) => (
              <ScenarioCard
                key={sc.scenario_id}
                scenario={sc}
                isSelected={incident.selected_scenario_id === sc.scenario_id}
                disabled={
                  busy ||
                  !sc.feasible ||
                  sc.policy_status === "BLOCKED" ||
                  !["OPTIONS_READY", "AWAITING_APPROVAL", "READY_TO_EXECUTE"].includes(incident.status)
                }
                onSelect={() => void handleSelectScenario(sc)}
              />
            ))}
          </div>
        ) : (
          <EmptyState
            icon={<Boxes size={22} />}
            title="No recovery options yet"
            detail="Analyze this incident to compare expedited freight, alternate supply, and inventory transfer."
            action={canAnalyze ? <button className="button button-secondary" onClick={() => void runAnalysis()} disabled={busy}>Analyze incident</button> : undefined}
          />
        )}
      </section>

      {/* Source evidence */}
      <section className="panel evidence-panel">
        <div className="panel-heading">
          <div><h2>Source evidence</h2><p>Original disruption information retained for review</p></div>
        </div>
        <div className="evidence-summary">
          <span className="source-badge">DEMO · demo_seed.json</span>
          <span className="severity-high"><span /> HIGH SEVERITY</span>
          <p>Critical component shipment SHP-102 revised arrival is 12 days from now. The scenario fixture records an ETA change that threatens the current five-day stock coverage. Available stock = max(0, 700 − 200) = 500 units. Coverage = 500 / 100 = 5 days.</p>
        </div>
      </section>

      <footer className="page-footer">
        <span><ShieldCheck size={14} /> Demo environment · all actions are simulated</span>
        <span>{incident.incident_id} · {dateTime(incident.created_at)}</span>
      </footer>

      {confirmExecute && activeScenario && (
        <ConfirmDialog
          title="Execute simulated recovery action"
          body={
            <div>
              <p style={{ margin: "0 0 8px" }}>You are about to execute a <strong>simulated</strong> recovery action:</p>
              <div style={{ background: "#f5f7fb", borderRadius: "6px", padding: "10px", fontSize: "10px", color: "#4a5568", marginBottom: "8px" }}>
                <div><strong>Scenario:</strong> {activeScenario.name}</div>
                <div><strong>Incremental cost:</strong> {money(activeScenario.incremental_cost)}</div>
                <div><strong>Policy:</strong> {activeScenario.policy_status}</div>
                {incident.approval_id && <div><strong>Approval:</strong> {incident.approval_id}</div>}
              </div>
              <p style={{ margin: 0, color: "#a0522d", fontSize: "10px" }}>
                ⚠ This is a simulation only. No real supplier, shipment, or SAP system will be modified.
              </p>
            </div>
          }
          confirmLabel="Execute simulation"
          onConfirm={() => void handleExecute()}
          onCancel={() => setConfirmExecute(false)}
        />
      )}

      {busy && <BusyIndicator />}
    </>
  );
}

function ScenarioCard({
  scenario,
  isSelected,
  disabled,
  onSelect,
}: {
  scenario: RecoveryScenario;
  isSelected: boolean;
  disabled: boolean;
  onSelect: () => void;
}) {
  const isBlocked = scenario.policy_status === "BLOCKED";
  return (
    <article className={`scenario-card ${isSelected ? "scenario-selected" : ""}`}>
      <div className="scenario-top">
        <span className="rank-badge">#{scenario.rank}</span>
        <StatusBadge value={scenario.policy_status} />
      </div>
      <h3>{scenario.name}</h3>
      <p className="scenario-summary">{scenario.reasoning_summary}</p>
      <div className="scenario-numbers">
        <div><span>Incremental cost</span><strong>{money(scenario.incremental_cost, scenario.currency)}</strong></div>
        <div><span>Arrival</span><strong>{scenario.arrival_days} days</strong></div>
        <div><span>Prod. delay</span><strong>{scenario.estimated_production_delay_days} days</strong></div>
        <div>
          <span>Residual exposure</span>
          <strong className={scenario.unmet_demand_units_before_recovery > 0 ? "risk-text" : "good-text"}>
            {scenario.unmet_demand_units_before_recovery.toLocaleString()} units
          </strong>
        </div>
      </div>
      <div className="scenario-reasons">
        {scenario.reason_codes.map((r) => <span key={r}>{r.replaceAll("_", " ")}</span>)}
        {scenario.reason_codes.length === 0 && <span>Within configured policy</span>}
      </div>
      {scenario.feasibility_reasons.length > 0 && (
        <div style={{ fontSize: "8px", color: "#7a8798", marginTop: "6px", lineHeight: 1.5 }}>
          {scenario.feasibility_reasons.join(" · ")}
        </div>
      )}
      <button
        className={`button ${isSelected ? "button-selected" : isBlocked ? "button-secondary" : "button-secondary"} full-button`}
        onClick={onSelect}
        disabled={disabled || isBlocked}
        title={isBlocked ? "This scenario is blocked by current policy and cannot be selected." : undefined}
      >
        {isSelected ? <><Check size={15} /> Selected plan</> : isBlocked ? "Blocked by policy" : "Select this plan"}
      </button>
    </article>
  );
}

function ImpactStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="impact-stat">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}
