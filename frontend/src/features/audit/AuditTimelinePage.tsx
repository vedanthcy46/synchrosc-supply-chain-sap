import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ChevronLeft, FileClock, RefreshCw, ShieldCheck } from "lucide-react";
import { provider } from "../../api/provider";
import type { AuditEvent, Incident } from "../../types/api";
import {
  dateTime,
  EmptyState,
  ErrorPanel,
  LoadingState,
  StatusBadge,
  SuccessNotice,
} from "../../components/shared";

export function AuditTimelinePage() {
  const { incidentId } = useParams<{ incidentId: string }>();
  const navigate = useNavigate();
  const [incident, setIncident] = useState<Incident | null>(null);
  const [events, setEvents] = useState<AuditEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [notice] = useState("");
  const hasMounted = useRef(false);

  const load = useCallback(async () => {
    if (!incidentId) return;
    setError(null);
    try {
      const [inc, audit] = await Promise.all([
        provider.getIncident(incidentId),
        provider.getAudit(incidentId),
      ]);
      setIncident(inc);
      setEvents(audit.items);
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

  if (loading) return <LoadingState label="Loading audit timeline…" />;

  return (
    <>
      {error && <ErrorPanel error={error} onDismiss={() => setError(null)} onRetry={() => { setLoading(true); void load(); }} />}
      {notice && <SuccessNotice message={notice} onDismiss={() => {}} />}

      <div className="page-heading">
        <div>
          <div className="eyebrow" style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <button
              className="icon-button"
              style={{ width: "24px", height: "24px" }}
              onClick={() => incidentId ? navigate(`/incidents/${incidentId}`) : navigate("/dashboard")}
              aria-label="Back to incident"
            >
              <ChevronLeft size={14} />
            </button>
            APPEND-ONLY HISTORY · {incidentId}
          </div>
          <h1>Audit timeline</h1>
          <p>Trace each event, policy check, approval decision, simulated action, and verification result.</p>
        </div>
        <div className="heading-actions">
          {incident && <StatusBadge value={incident.status} />}
          <button className="icon-button" aria-label="Refresh" onClick={() => { setLoading(true); void load(); }}>
            <RefreshCw size={16} />
          </button>
        </div>
      </div>

      {incident ? (
        <section className="panel audit-panel">
          <div className="panel-heading">
            <div>
              <h2>{incident.title}</h2>
              <p>Correlation IDs and state changes are retained from the backend. Read-only.</p>
            </div>
            <span className="source-badge">{incident.incident_id}</span>
          </div>
          {events.length ? (
            <div className="timeline">
              {events.map((event) => (
                <TimelineItem key={event.audit_id} event={event} />
              ))}
            </div>
          ) : (
            <EmptyState
              icon={<FileClock size={21} />}
              title="No audit events yet"
              detail="Select or analyze an incident to build its decision timeline."
            />
          )}
        </section>
      ) : (
        <EmptyState
          icon={<FileClock size={21} />}
          title="Incident not found"
          detail="The requested incident could not be loaded."
          action={<button className="button button-secondary" onClick={() => navigate("/dashboard")}>Back to dashboard</button>}
        />
      )}

      <footer className="page-footer">
        <span><ShieldCheck size={14} /> Audit records are read-only and append-only</span>
        <span>SynchroSC Control Tower</span>
      </footer>
    </>
  );
}

function dotClass(eventType: string): string {
  if (eventType.includes("FAILED") || eventType.includes("DENIED") || eventType.includes("REJECTED") || eventType.includes("BLOCKED")) return "dot-red";
  if (eventType.includes("APPROVAL") || eventType.includes("STALE")) return "dot-amber";
  if (eventType.includes("VERIFIED") || eventType.includes("EXECUTED") || eventType.includes("COMPLETED") || eventType.includes("APPROVED")) return "dot-green";
  return "dot-blue";
}

function TimelineItem({ event }: { event: AuditEvent }) {
  const [expanded, setExpanded] = useState(false);
  const hasStateChange = event.before_state || event.after_state;

  return (
    <div className="timeline-item">
      <div className="timeline-rail">
        <span className={`timeline-dot ${dotClass(event.event_type)}`} />
      </div>
      <div className="timeline-content">
        <div className="timeline-title">
          <strong>{event.event_type.replaceAll("_", " ")}</strong>
          <span>{dateTime(event.created_at)}</span>
        </div>
        <p>{event.reason || "Workflow event recorded."}</p>
        <div className="timeline-meta">
          <span>{event.actor_type}: {event.actor_id}</span>
          <span>{event.entity_type}: {event.entity_id}</span>
          <span>Correlation: {event.correlation_id}</span>
          {event.evidence_refs?.length > 0 && (
            <span>Evidence: {event.evidence_refs.join(", ")}</span>
          )}
        </div>
        {hasStateChange && (
          <details open={expanded} onToggle={(e) => setExpanded((e.target as HTMLDetailsElement).open)}>
            <summary>View state change</summary>
            <pre>{JSON.stringify({ before: event.before_state, after: event.after_state }, null, 2)}</pre>
          </details>
        )}
      </div>
    </div>
  );
}
