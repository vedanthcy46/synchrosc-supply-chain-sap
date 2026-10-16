import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AppShell } from "../components/AppShell";
import { DashboardPage } from "../features/dashboard/DashboardPage";
import { IncidentPage } from "../features/incidents/IncidentPage";
import { ApprovalQueuePage } from "../features/approvals/ApprovalQueuePage";
import { AuditTimelinePage } from "../features/audit/AuditTimelinePage";

export default function App() {
  return (
    <BrowserRouter>
      <AppShell>
        <Routes>
          <Route path="/" element={<Navigate to="/dashboard" replace />} />
          <Route path="/dashboard" element={<DashboardPage />} />
          <Route path="/incidents/:incidentId" element={<IncidentPage />} />
          <Route path="/approvals" element={<ApprovalQueuePage />} />
          <Route path="/incidents/:incidentId/audit" element={<AuditTimelinePage />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </AppShell>
    </BrowserRouter>
  );
}

function NotFound() {
  return (
    <div style={{ padding: "40px", textAlign: "center", color: "#7a8798" }}>
      <strong>Page not found</strong>
      <p>Use the navigation to return to the Control Tower.</p>
    </div>
  );
}
