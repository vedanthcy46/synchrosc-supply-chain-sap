import { type ReactNode, useState } from "react";
import { AlertTriangle, BadgeCheck, LoaderCircle, X } from "lucide-react";
import type { ApiRequestError } from "../api/client";

// ── Status badge ───────────────────────────────────────────────────────────
export function StatusBadge({ value }: { value: string }) {
  const normalized = value.toLowerCase().replaceAll("_", "-");
  return (
    <span className={`status status-${normalized}`}>
      {value.replaceAll("_", " ")}
    </span>
  );
}

// ── Severity badge ─────────────────────────────────────────────────────────
export function SeverityBadge({ value }: { value: string }) {
  return (
    <span className={`severity severity-${value.toLowerCase()}`}>
      <i />
      {value}
    </span>
  );
}

// ── Metric card ────────────────────────────────────────────────────────────
export function MetricCard({
  label,
  value,
  detail,
  icon,
  tone,
}: {
  label: string;
  value: string | number;
  detail: string;
  icon: ReactNode;
  tone: "blue" | "amber" | "teal" | "slate" | "red";
}) {
  return (
    <div className="metric-card">
      <div className={`metric-icon ${tone}`}>{icon}</div>
      <div className="metric-copy">
        <span>{label}</span>
        <strong>{value}</strong>
        <small>{detail}</small>
      </div>
    </div>
  );
}

// ── Error panel ────────────────────────────────────────────────────────────
export function ErrorPanel({
  error,
  onDismiss,
  onRetry,
}: {
  error: string | Error | ApiRequestError;
  onDismiss?: () => void;
  onRetry?: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const message = error instanceof Error ? error.message : String(error);
  const correlationId =
    error instanceof Error && "correlationId" in error
      ? (error as ApiRequestError).correlationId
      : undefined;

  return (
    <div className="alert alert-error" role="alert">
      <AlertTriangle size={17} />
      <span>
        {message}
        {correlationId && (
          <>
            {" "}
            <button
              style={{ background: "none", border: "none", color: "inherit", textDecoration: "underline", cursor: "pointer", padding: 0, font: "inherit", fontSize: "10px" }}
              onClick={() => setExpanded((v) => !v)}
            >
              {expanded ? "Hide" : "Details"}
            </button>
            {expanded && (
              <span style={{ display: "block", marginTop: 4, fontFamily: "monospace", fontSize: "9px" }}>
                Correlation ID: {correlationId}
              </span>
            )}
          </>
        )}
      </span>
      {onRetry && (
        <button className="button button-secondary" style={{ padding: "4px 8px", fontSize: "10px" }} onClick={onRetry}>
          Retry
        </button>
      )}
      {onDismiss && (
        <button aria-label="Dismiss error" onClick={onDismiss}>
          <X size={16} />
        </button>
      )}
    </div>
  );
}

// ── Success notice ─────────────────────────────────────────────────────────
export function SuccessNotice({ message, onDismiss }: { message: string; onDismiss: () => void }) {
  return (
    <div className="alert alert-success" role="status">
      <BadgeCheck size={17} />
      <span>{message}</span>
      <button aria-label="Dismiss message" onClick={onDismiss}>
        <X size={16} />
      </button>
    </div>
  );
}

// ── Loading state ──────────────────────────────────────────────────────────
export function LoadingState({ label = "Loading…" }: { label?: string }) {
  return (
    <div className="loading-state" role="status" aria-label={label}>
      <LoaderCircle size={22} />
      {label}
    </div>
  );
}

// ── Empty state ────────────────────────────────────────────────────────────
export function EmptyState({
  icon,
  title,
  detail,
  action,
}: {
  icon: ReactNode;
  title: string;
  detail: string;
  action?: ReactNode;
}) {
  return (
    <div className="empty-state">
      <span>{icon}</span>
      <strong>{title}</strong>
      <p>{detail}</p>
      {action}
    </div>
  );
}

// ── Confirm dialog ─────────────────────────────────────────────────────────
export function ConfirmDialog({
  title,
  body,
  confirmLabel,
  cancelLabel = "Cancel",
  danger = false,
  onConfirm,
  onCancel,
}: {
  title: string;
  body: ReactNode;
  confirmLabel: string;
  cancelLabel?: string;
  danger?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirm-title"
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(18,30,50,0.45)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 50,
        padding: "16px",
      }}
    >
      <div
        style={{
          background: "#fff",
          borderRadius: "12px",
          padding: "24px",
          maxWidth: "440px",
          width: "100%",
          boxShadow: "0 8px 32px rgba(18,30,50,0.18)",
        }}
      >
        <h2 id="confirm-title" style={{ margin: "0 0 10px", font: "700 15px Manrope,sans-serif", color: "#1e2d42" }}>
          {title}
        </h2>
        <div style={{ fontSize: "12px", color: "#6a7888", lineHeight: 1.6, marginBottom: "20px" }}>
          {body}
        </div>
        <div style={{ display: "flex", gap: "10px", justifyContent: "flex-end" }}>
          <button className="button button-secondary" onClick={onCancel}>
            {cancelLabel}
          </button>
          <button
            className={`button ${danger ? "button-danger" : "button-primary"}`}
            onClick={onConfirm}
            style={danger ? { background: "#c0392b", color: "#fff", borderColor: "#c0392b" } : undefined}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Busy overlay ───────────────────────────────────────────────────────────
export function BusyIndicator({ label = "Processing securely…" }: { label?: string }) {
  return (
    <div className="busy-indicator" role="status">
      <LoaderCircle size={16} />
      {label}
    </div>
  );
}

// ── Formatting helpers ─────────────────────────────────────────────────────
export function money(value: number, currency = "INR"): string {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(value);
}

export function dateTime(value?: string | null): string {
  if (!value) return "—";
  return new Date(value).toLocaleString();
}
