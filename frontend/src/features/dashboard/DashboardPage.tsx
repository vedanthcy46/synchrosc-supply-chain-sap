import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  Boxes,
  Check,
  ChevronRight,
  Clock3,
  Database,
  PackageCheck,
  Play,
  RefreshCw,
  ShieldCheck,
  Truck,
  X,
} from "lucide-react";
import { provider, DEMO_DISRUPTION_PAYLOAD, IS_DEMO_MODE } from "../../api/provider";
import type { Dashboard, Incident, ApprovalRequest, DisruptionCreateRequest } from "../../types/api";
import {
  BusyIndicator,
  ConfirmDialog,
  dateTime,
  EmptyState,
  ErrorPanel,
  LoadingState,
  MetricCard,
  SeverityBadge,
  StatusBadge,
  SuccessNotice,
} from "../../components/shared";

export function DashboardPage() {
  const navigate = useNavigate();
  const [dashboard, setDashboard] = useState<Dashboard | null>(null);
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [approvals, setApprovals] = useState<ApprovalRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [pendingPayload, setPendingPayload] = useState<DisruptionCreateRequest>(DEMO_DISRUPTION_PAYLOAD);
  const hasMounted = useRef(false);

  const load = useCallback(async () => {
    setError(null);
    try {
      const [summary, disruptions, approvalList] = await Promise.all([
        provider.getDashboard(),
        provider.listDisruptions(),
        provider.listApprovals(),
      ]);
      setDashboard(summary);
      setApprovals(approvalList.items);

      // Load incident details for each disruption that has an incident_id
      const incidentIds = [
        ...new Set(
          disruptions.items
            .filter((d) => d.incident_id)
            .map((d) => d.incident_id as string),
        ),
      ];
      const loaded = await Promise.all(incidentIds.map((id) => provider.getIncident(id)));
      setIncidents(loaded.sort((a, b) => b.created_at.localeCompare(a.created_at)));
    } catch (err) {
      setError(err instanceof Error ? err : new Error(String(err)));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!hasMounted.current) {
      hasMounted.current = true;
      void load();
    }
  }, [load]);

  const pendingApprovals = approvals.filter((a) => a.status === "pending");

  async function handleCreateDisruption() {
    setBusy(true);
    setError(null);
    setNotice("");
    try {
      const result = await provider.createDisruption(pendingPayload);
      setShowConfirm(false);
      setShowCreateModal(false);
      setNotice(`Incident ${result.incident_id} created. Running analysis…`);
      await provider.analyzeIncident(result.incident_id);
      await load();
      setNotice(`Incident ${result.incident_id} analyzed. Review impact and recovery options.`);
      navigate(`/incidents/${result.incident_id}`);
    } catch (err) {
      setError(err instanceof Error ? err : new Error(String(err)));
      setShowConfirm(false);
    } finally {
      setBusy(false);
    }
  }

  if (loading) return <LoadingState label="Loading control tower…" />;

  return (
    <>
      {error && <ErrorPanel error={error} onDismiss={() => setError(null)} onRetry={() => { setLoading(true); void load(); }} />}
      {notice && <SuccessNotice message={notice} onDismiss={() => setNotice("")} />}

      <div className="page-heading">
        <div>
          <div className="eyebrow">CONTROL TOWER</div>
          <h1>Supply Chain Overview</h1>
          <p>Monitor disruptions, assess supply risk, and coordinate a controlled recovery.</p>
        </div>
        <div className="heading-actions">
          <button className="icon-button" aria-label="Refresh dashboard" onClick={() => { setLoading(true); void load(); }} disabled={busy}>
            <RefreshCw size={16} />
          </button>
          <button className="button button-primary" onClick={() => { setPendingPayload(DEMO_DISRUPTION_PAYLOAD); setShowCreateModal(true); }} disabled={busy}>
            <Play size={16} /> Simulate disruption
          </button>
        </div>
      </div>

      <div className="kpi-grid">
        <MetricCard label="Active incidents" value={dashboard?.active_incidents_count ?? 0} detail="Requiring attention" icon={<Activity size={18} />} tone="blue" />
        <MetricCard label="Pending approvals" value={dashboard?.pending_approvals_count ?? 0} detail="Human decision needed" icon={<ShieldCheck size={18} />} tone="amber" />
        <MetricCard label="Monitored components" value={dashboard?.monitored_components_count ?? 0} detail="Across demo inventory" icon={<Boxes size={18} />} tone="teal" />
        <MetricCard label="Execution mode" value="Simulation" detail="No live SAP writes" icon={<Database size={18} />} tone="slate" />
      </div>

      <div className="content-grid">
        <section className="panel incidents-panel">
          <div className="panel-heading">
            <div>
              <h2>Recent incidents</h2>
              <p>Disruption signals and workflow status</p>
            </div>
            <span className="subtle-count">{incidents.length} total</span>
          </div>
          {incidents.length ? (
            <div className="incident-table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Incident</th>
                    <th>Severity</th>
                    <th>Status</th>
                    <th>Detected</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {incidents.map((inc) => (
                    <tr key={inc.incident_id} onClick={() => navigate(`/incidents/${inc.incident_id}`)} style={{ cursor: "pointer" }}>
                      <td>
                        <div className="incident-name">
                          <span className="incident-icon"><Truck size={16} /></span>
                          <span>
                            <strong>{inc.title}</strong>
                            <small>{inc.incident_id} · {inc.event_id}</small>
                          </span>
                        </div>
                      </td>
                      <td><SeverityBadge value={inc.severity} /></td>
                      <td><StatusBadge value={inc.status} /></td>
                      <td className="date-cell">{dateTime(inc.created_at)}</td>
                      <td><ChevronRight size={16} className="row-chevron" /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <EmptyState
              icon={<PackageCheck size={22} />}
              title="No incidents yet"
              detail="Start with the critical shipment delay demo."
              action={
                <button className="button button-secondary" onClick={() => { setPendingPayload(DEMO_DISRUPTION_PAYLOAD); setShowCreateModal(true); }} disabled={busy}>
                  Run demo scenario
                </button>
              }
            />
          )}
        </section>

        <section className="panel side-panel">
          <div className="panel-heading">
            <div>
              <h2>Attention needed</h2>
              <p>Items that need an operator</p>
            </div>
            <span className="attention-count">{pendingApprovals.length}</span>
          </div>
          {pendingApprovals.length ? (
            <div className="attention-list">
              {pendingApprovals.slice(0, 4).map((a) => (
                <button
                  key={a.approval_id}
                  className="attention-item"
                  onClick={() => navigate("/approvals")}
                >
                  <span className="attention-icon"><Clock3 size={17} /></span>
                  <span>
                    <strong>{a.scenario_id.replaceAll("-", " ")}</strong>
                    <small>{a.incident_id} · Plan {a.plan_version}</small>
                  </span>
                  <ChevronRight size={16} />
                </button>
              ))}
            </div>
          ) : (
            <EmptyState icon={<Check size={21} />} title="Queue is clear" detail="No pending decisions right now." />
          )}
          <div className="policy-note">
            <ShieldCheck size={17} />
            <span>Actions are checked against current policy and require approval when thresholds are exceeded.</span>
          </div>
        </section>
      </div>

      <div className="bottom-grid">
        <section className="panel process-panel">
          <div className="panel-heading">
            <div><h2>Recovery workflow</h2><p>Every action is policy checked and simulated</p></div>
          </div>
          <div className="workflow-steps">
            <WorkflowStep icon={<AlertTriangle size={16} />} title="Detect" detail="Evidence captured" />
            <WorkflowStep icon={<Activity size={16} />} title="Assess" detail="Inventory & orders" />
            <WorkflowStep icon={<ArrowRight size={16} />} title="Compare" detail="Recovery options" />
            <WorkflowStep icon={<ShieldCheck size={16} />} title="Approve" detail="Human oversight" />
            <WorkflowStep icon={<PackageCheck size={16} />} title="Verify" detail="Outcome recorded" last />
          </div>
        </section>
        <section className="panel provenance-panel">
          <div className="panel-heading">
            <div><h2>Data provenance</h2><p>Clear separation from live operations</p></div>
          </div>
          <div className="provenance-row"><span className="provenance-dot teal-dot" /><span>Supply chain records</span><strong>Synthetic demo</strong></div>
          <div className="provenance-row"><span className="provenance-dot blue-dot" /><span>Event source</span><strong>Demo fixture</strong></div>
          <div className="provenance-row"><span className="provenance-dot amber-dot" /><span>Execution target</span><strong>Simulation only</strong></div>
        </section>
      </div>

      <footer className="page-footer">
        <span><ShieldCheck size={14} /> Demo environment · all actions are simulated</span>
        <span>SynchroSC Control Tower</span>
      </footer>

      {/* Create disruption modal */}
      {showCreateModal && (
        <CreateDisruptionModal
          payload={pendingPayload}
          onChange={setPendingPayload}
          onSubmit={() => setShowConfirm(true)}
          onClose={() => setShowCreateModal(false)}
          busy={busy}
          isDemoMode={IS_DEMO_MODE}
        />
      )}

      {showConfirm && (
        <ConfirmDialog
          title="Simulate disruption event"
          body={
            <div>
              <p style={{ margin: "0 0 8px" }}>You are about to submit a <strong>simulated</strong> disruption event:</p>
              <div style={{ background: "#f5f7fb", borderRadius: "6px", padding: "10px", fontFamily: "monospace", fontSize: "10px", color: "#4a5568" }}>
                <div><strong>Title:</strong> {pendingPayload.title}</div>
                <div><strong>Severity:</strong> {pendingPayload.severity}</div>
                <div><strong>Shipment:</strong> {pendingPayload.affected_shipment_ids.join(", ")}</div>
              </div>
              <p style={{ margin: "8px 0 0", color: "#a0522d", fontSize: "10px" }}>
                ⚠ This is a synthetic demo event. No real shipment, supplier, or SAP system will be affected.
              </p>
            </div>
          }
          confirmLabel="Submit simulation"
          onConfirm={() => void handleCreateDisruption()}
          onCancel={() => setShowConfirm(false)}
        />
      )}

      {busy && <BusyIndicator />}
    </>
  );
}

function CreateDisruptionModal({
  payload,
  onChange,
  onSubmit,
  onClose,
  busy,
  isDemoMode,
}: {
  payload: DisruptionCreateRequest;
  onChange: (p: DisruptionCreateRequest) => void;
  onSubmit: () => void;
  onClose: () => void;
  busy: boolean;
  isDemoMode: boolean;
}) {
  const [errors, setErrors] = useState<Record<string, string>>({});

  function validate(): boolean {
    const e: Record<string, string> = {};
    if (!payload.title.trim()) e.title = "Title is required.";
    if (!payload.description.trim()) e.description = "Description is required.";
    if (payload.confidence < 0 || payload.confidence > 1) e.confidence = "Confidence must be between 0 and 1.";
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  function handleSubmit(ev: React.FormEvent) {
    ev.preventDefault();
    if (validate()) onSubmit();
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="create-modal-title"
      style={{ position: "fixed", inset: 0, background: "rgba(18,30,50,0.45)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 50, padding: "16px" }}
    >
      <div style={{ background: "#fff", borderRadius: "12px", padding: "24px", maxWidth: "520px", width: "100%", boxShadow: "0 8px 32px rgba(18,30,50,0.18)", maxHeight: "90vh", overflowY: "auto" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
          <h2 id="create-modal-title" style={{ margin: 0, font: "700 15px Manrope,sans-serif", color: "#1e2d42" }}>
            Simulate disruption event
          </h2>
          <button className="icon-button" onClick={onClose} aria-label="Close modal"><X size={16} /></button>
        </div>

        {isDemoMode && (
          <div style={{ background: "#f0faf5", border: "1px solid #d3efdf", borderRadius: "7px", padding: "9px 12px", marginBottom: "14px", fontSize: "10px", color: "#28805e" }}>
            Pre-filled with the SHP-102 demo fixture. Review and submit to start the golden-path workflow.
          </div>
        )}

        <form onSubmit={handleSubmit}>
          <Field label="Title" error={errors.title}>
            <input
              className="form-input"
              value={payload.title}
              onChange={(e) => onChange({ ...payload, title: e.target.value })}
              required
            />
          </Field>
          <Field label="Description" error={errors.description}>
            <textarea
              className="form-input"
              rows={3}
              value={payload.description}
              onChange={(e) => onChange({ ...payload, description: e.target.value })}
              required
              style={{ resize: "vertical" }}
            />
          </Field>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
            <Field label="Severity">
              <select className="form-input" value={payload.severity} onChange={(e) => onChange({ ...payload, severity: e.target.value })}>
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
                <option value="critical">Critical</option>
              </select>
            </Field>
            <Field label="Confidence (0–1)" error={errors.confidence}>
              <input
                className="form-input"
                type="number"
                min={0}
                max={1}
                step={0.1}
                value={payload.confidence}
                onChange={(e) => onChange({ ...payload, confidence: parseFloat(e.target.value) })}
              />
            </Field>
          </div>
          <Field label="Affected shipment IDs (comma-separated)">
            <input
              className="form-input"
              value={payload.affected_shipment_ids.join(", ")}
              onChange={(e) => onChange({ ...payload, affected_shipment_ids: e.target.value.split(",").map((s) => s.trim()).filter(Boolean) })}
            />
          </Field>
          <Field label="Evidence (comma-separated)">
            <input
              className="form-input"
              value={payload.evidence.join(", ")}
              onChange={(e) => onChange({ ...payload, evidence: e.target.value.split(",").map((s) => s.trim()).filter(Boolean) })}
            />
          </Field>
          <div style={{ display: "flex", gap: "10px", justifyContent: "flex-end", marginTop: "18px" }}>
            <button type="button" className="button button-secondary" onClick={onClose}>Cancel</button>
            <button type="submit" className="button button-primary" disabled={busy}>
              <Play size={14} /> Review & submit
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function Field({ label, error, children }: { label: string; error?: string; children: ReactNode }) {
  return (
    <div style={{ marginBottom: "12px" }}>
      <label style={{ display: "block", fontSize: "10px", fontWeight: 700, color: "#5a6a7e", marginBottom: "5px", letterSpacing: "0.3px" }}>
        {label}
      </label>
      {children}
      {error && <span style={{ display: "block", fontSize: "9px", color: "#c0392b", marginTop: "3px" }}>{error}</span>}
    </div>
  );
}

function WorkflowStep({ icon, title, detail, last }: { icon: ReactNode; title: string; detail: string; last?: boolean }) {
  return (
    <div className={`step ${last ? "last" : ""}`}>
      <span className="step-icon">{icon}</span>
      <div>
        <strong>{title}</strong>
        <small>{detail}</small>
      </div>
      <span className="step-line" />
    </div>
  );
}

// Allow ReactNode import
import type { ReactNode } from "react";
