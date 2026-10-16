import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { BadgeCheck, Check, Clock3, RefreshCw, ShieldCheck, X } from "lucide-react";
import { provider } from "../../api/provider";
import type { ApprovalRequest, RecoveryScenario, Incident } from "../../types/api";
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

export function ApprovalQueuePage() {
  const navigate = useNavigate();
  const [approvals, setApprovals] = useState<ApprovalRequest[]>([]);
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [scenarioMap, setScenarioMap] = useState<Record<string, RecoveryScenario>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [pendingDecision, setPendingDecision] = useState<{ approval: ApprovalRequest; decision: "approve" | "reject" } | null>(null);
  const [comment, setComment] = useState("Reviewed in the control tower.");
  const hasMounted = useRef(false);

  const load = useCallback(async () => {
    setError(null);
    try {
      const approvalList = await provider.listApprovals();
      setApprovals(approvalList.items);

      // Load incidents for context
      const incidentIds = [...new Set(approvalList.items.map((a) => a.incident_id))];
      const loadedIncidents = await Promise.allSettled(incidentIds.map((id) => provider.getIncident(id)));
      const validIncidents = loadedIncidents
        .filter((r): r is PromiseFulfilledResult<Incident> => r.status === "fulfilled")
        .map((r) => r.value);
      setIncidents(validIncidents);

      // Load scenarios for context
      const scenarioIds = [...new Set(approvalList.items.map((a) => a.scenario_id))];
      const scenarioResults = await Promise.allSettled(
        validIncidents.map((inc) => provider.getScenarios(inc.incident_id)),
      );
      const map: Record<string, RecoveryScenario> = {};
      scenarioResults.forEach((r) => {
        if (r.status === "fulfilled") {
          r.value.scenarios.forEach((sc) => {
            if (scenarioIds.includes(sc.scenario_id)) map[sc.scenario_id] = sc;
          });
        }
      });
      setScenarioMap(map);
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

  async function handleDecision() {
    if (!pendingDecision) return;
    setBusy(true);
    setError(null);
    setNotice("");
    try {
      await provider.submitDecision(
        pendingDecision.approval.approval_id,
        pendingDecision.decision,
        comment,
        "demo-operator",
      );
      const verb = pendingDecision.decision === "approve" ? "approved" : "rejected";
      setNotice(
        pendingDecision.decision === "approve"
          ? `Approval recorded. The plan is ready for simulated execution.`
          : `Request rejected. No action was executed.`,
      );
      setPendingDecision(null);
      setComment("Reviewed in the control tower.");
      await load();
      // Navigate to incident if approved
      if (pendingDecision.decision === "approve") {
        const inc = incidents.find((i) => i.incident_id === pendingDecision.approval.incident_id);
        if (inc) navigate(`/incidents/${inc.incident_id}`);
      }
      void verb; // suppress unused warning
    } catch (err) {
      setError(err instanceof Error ? err : new Error(String(err)));
      setPendingDecision(null);
    } finally {
      setBusy(false);
    }
  }

  if (loading) return <LoadingState label="Loading approval queue…" />;

  const pending = approvals.filter((a) => a.status === "pending");
  const reviewed = approvals.filter((a) => a.status !== "pending");

  return (
    <>
      {error && <ErrorPanel error={error} onDismiss={() => setError(null)} onRetry={() => { setLoading(true); void load(); }} />}
      {notice && <SuccessNotice message={notice} onDismiss={() => setNotice("")} />}

      <div className="page-heading">
        <div>
          <div className="eyebrow">HUMAN GOVERNANCE</div>
          <h1>Approval queue</h1>
          <p>Review the exact scenario and plan version before authorizing a simulation. Approval does not override hard policy blocks.</p>
        </div>
        <div className="heading-actions">
          <span className="demo-chip"><span /> POLICY CONTROL ACTIVE</span>
          <button className="icon-button" aria-label="Refresh" onClick={() => { setLoading(true); void load(); }} disabled={busy}>
            <RefreshCw size={16} />
          </button>
        </div>
      </div>

      <section className="panel approval-panel" style={{ marginBottom: "15px" }}>
        <div className="panel-heading">
          <div><h2>Pending decisions</h2><p>Approval does not override hard policy blocks</p></div>
          <span className="attention-count">{pending.length}</span>
        </div>
        {pending.length ? (
          <div className="approval-list">
            {pending.map((approval) => {
              const scenario = scenarioMap[approval.scenario_id];
              const incident = incidents.find((i) => i.incident_id === approval.incident_id);
              return (
                <ApprovalCard
                  key={approval.approval_id}
                  approval={approval}
                  scenario={scenario}
                  incident={incident}
                  busy={busy}
                  onApprove={() => { setPendingDecision({ approval, decision: "approve" }); setComment("Approved for this incident and plan version."); }}
                  onReject={() => { setPendingDecision({ approval, decision: "reject" }); setComment("Rejected — alternative action required."); }}
                  onViewIncident={() => incident && navigate(`/incidents/${incident.incident_id}`)}
                />
              );
            })}
          </div>
        ) : (
          <EmptyState
            icon={<Check size={21} />}
            title="No pending approvals"
            detail="Risky plans will appear here with their policy reasons and version."
          />
        )}
      </section>

      {reviewed.length > 0 && (
        <section className="panel approval-panel">
          <div className="panel-heading">
            <div><h2>Recently reviewed</h2><p>Completed approval decisions</p></div>
            <span className="subtle-count">{reviewed.length}</span>
          </div>
          <div className="approval-list">
            {reviewed.map((approval) => {
              const scenario = scenarioMap[approval.scenario_id];
              const incident = incidents.find((i) => i.incident_id === approval.incident_id);
              return (
                <ReviewedCard
                  key={approval.approval_id}
                  approval={approval}
                  scenario={scenario}
                  incident={incident}
                  onViewIncident={() => incident && navigate(`/incidents/${incident.incident_id}`)}
                />
              );
            })}
          </div>
        </section>
      )}

      <footer className="page-footer">
        <span><ShieldCheck size={14} /> Approval decisions are recorded in the audit trail</span>
        <span>SynchroSC Control Tower</span>
      </footer>

      {pendingDecision && (
        <ConfirmDialog
          title={pendingDecision.decision === "approve" ? "Approve recovery plan" : "Reject recovery plan"}
          danger={pendingDecision.decision === "reject"}
          body={
            <div>
              <p style={{ margin: "0 0 10px" }}>
                {pendingDecision.decision === "approve"
                  ? "Approving this plan will allow simulated execution to proceed."
                  : "Rejecting this plan will prevent execution. The incident will return to OPTIONS_READY."}
              </p>
              <div style={{ background: "#f5f7fb", borderRadius: "6px", padding: "10px", fontSize: "10px", color: "#4a5568", marginBottom: "12px" }}>
                <div><strong>Approval:</strong> {pendingDecision.approval.approval_id}</div>
                <div><strong>Scenario:</strong> {pendingDecision.approval.scenario_id}</div>
                <div><strong>Plan version:</strong> {pendingDecision.approval.plan_version}</div>
              </div>
              <label style={{ display: "block", fontSize: "10px", fontWeight: 700, color: "#5a6a7e", marginBottom: "5px" }}>
                Decision comment
              </label>
              <textarea
                className="form-input"
                rows={3}
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                style={{ width: "100%", resize: "vertical" }}
              />
            </div>
          }
          confirmLabel={pendingDecision.decision === "approve" ? "Approve plan" : "Reject plan"}
          onConfirm={() => void handleDecision()}
          onCancel={() => setPendingDecision(null)}
        />
      )}

      {busy && <BusyIndicator />}
    </>
  );
}

function ApprovalCard({
  approval,
  scenario,
  incident,
  busy,
  onApprove,
  onReject,
  onViewIncident,
}: {
  approval: ApprovalRequest;
  scenario?: RecoveryScenario;
  incident?: Incident;
  busy: boolean;
  onApprove: () => void;
  onReject: () => void;
  onViewIncident: () => void;
}) {
  return (
    <div className="approval-card">
      <div className="approval-card-top">
        <span className="attention-icon"><Clock3 size={17} /></span>
        <div className="approval-card-title">
          <strong>{scenario?.name || approval.scenario_id}</strong>
          <small>{incident?.title || approval.incident_id} · Requested {dateTime(approval.created_at)}</small>
        </div>
        <StatusBadge value={approval.status} />
      </div>
      <div className="approval-facts">
        <div><span>Plan version</span><strong>{approval.plan_version}</strong></div>
        <div><span>Estimated cost</span><strong>{scenario ? money(scenario.incremental_cost) : "See scenario"}</strong></div>
        <div><span>Policy reasons</span><strong>{scenario?.reason_codes.join(", ") || approval.reason || "—"}</strong></div>
      </div>
      <p className="approval-reason">{approval.reason || "Cost or operational risk exceeds automatic action limits."}</p>
      {scenario && (
        <div style={{ fontSize: "9px", color: "#7a8798", marginBottom: "10px", lineHeight: 1.5 }}>
          <strong>Scenario:</strong> {scenario.reasoning_summary}
        </div>
      )}
      <div className="approval-actions">
        <button className="button button-secondary" onClick={onViewIncident}>Review incident</button>
        <div className="decision-buttons">
          <button className="button button-danger" onClick={onReject} disabled={busy} aria-label="Reject plan">
            <X size={15} /> Reject
          </button>
          <button className="button button-primary" onClick={onApprove} disabled={busy} aria-label="Approve plan">
            <Check size={15} /> Approve plan
          </button>
        </div>
      </div>
    </div>
  );
}

function ReviewedCard({
  approval,
  scenario,
  incident,
  onViewIncident,
}: {
  approval: ApprovalRequest;
  scenario?: RecoveryScenario;
  incident?: Incident;
  onViewIncident: () => void;
}) {
  return (
    <div className="approval-card" style={{ opacity: 0.8 }}>
      <div className="approval-card-top">
        <span className="attention-icon" style={{ background: approval.status === "approved" ? "#eaf7f0" : "#fff0ed", color: approval.status === "approved" ? "#28815a" : "#a44a43" }}>
          {approval.status === "approved" ? <BadgeCheck size={17} /> : <X size={17} />}
        </span>
        <div className="approval-card-title">
          <strong>{scenario?.name || approval.scenario_id}</strong>
          <small>{incident?.title || approval.incident_id} · Reviewed {dateTime(approval.reviewed_at)}</small>
        </div>
        <StatusBadge value={approval.status} />
      </div>
      <div className="approval-facts">
        <div><span>Plan version</span><strong>{approval.plan_version}</strong></div>
        <div><span>Reviewed by</span><strong>{approval.reviewed_by || "—"}</strong></div>
        <div><span>Comment</span><strong>{approval.decision_comment || "—"}</strong></div>
      </div>
      <div className="approval-actions">
        <button className="button button-secondary" onClick={onViewIncident}>View incident</button>
      </div>
    </div>
  );
}
