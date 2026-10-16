import { type ReactNode } from "react";
import { NavLink, useLocation } from "react-router-dom";
import { Activity, FileClock, Gauge, ShieldCheck, Truck } from "lucide-react";
import { IS_DEMO_MODE } from "../api/provider";

export function AppShell({ children }: { children: ReactNode }) {
  const location = useLocation();

  // Extract incidentId from path for contextual links
  const incidentMatch = location.pathname.match(/\/incidents\/([^/]+)/);
  const activeIncidentId = incidentMatch ? incidentMatch[1] : null;

  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark"><Activity size={21} /></div>
          <div>
            <strong>SynchroSC</strong>
            <span>SUPPLY CHAIN CONTROL</span>
          </div>
        </div>
        <div className="workspace-label">WORKSPACE</div>
        <nav className="nav-list" aria-label="Main navigation">
          <SideNavLink to="/dashboard" icon={<Gauge size={18} />} label="Control tower" />
          <SideNavLink
            to={activeIncidentId ? `/incidents/${activeIncidentId}` : "/dashboard"}
            icon={<Truck size={18} />}
            label="Incident analysis"
            matchPrefix="/incidents"
            excludeSuffix="/audit"
          />
          <SideNavLink to="/approvals" icon={<ShieldCheck size={18} />} label="Approval queue" />
          <SideNavLink
            to={activeIncidentId ? `/incidents/${activeIncidentId}/audit` : "/dashboard"}
            icon={<FileClock size={18} />}
            label="Audit timeline"
            matchPrefix="/audit"
          />
        </nav>
        <div className="sidebar-bottom">
          <div className="connection">
            <span className="connection-dot" />
            <div>
              <strong>{IS_DEMO_MODE ? "Demo mode" : "API connected"}</strong>
              <small>{IS_DEMO_MODE ? "Mock data · localStorage" : "Simulation environment"}</small>
            </div>
          </div>
          <div className="sidebar-version">SynchroSC · Prototype</div>
        </div>
      </aside>

      <main className="main-area">
        <header className="topbar">
          <div className="breadcrumb">
            <span>Operations</span>
          </div>
          <div className="top-actions">
            <span className="demo-chip">
              <span />
              {IS_DEMO_MODE ? "DEMO · SIMULATED DATA" : "LIVE API · SIMULATED EXECUTION"}
            </span>
            <div className="avatar">DO</div>
          </div>
        </header>
        <div className="page">{children}</div>
      </main>
    </div>
  );
}

function SideNavLink({
  to,
  icon,
  label,
  matchPrefix,
  excludeSuffix,
}: {
  to: string;
  icon: ReactNode;
  label: string;
  matchPrefix?: string;
  excludeSuffix?: string;
}) {
  const location = useLocation();
  const path = location.pathname;

  let active = false;
  if (matchPrefix) {
    active = path.startsWith(matchPrefix) && (!excludeSuffix || !path.endsWith(excludeSuffix));
  } else {
    active = path === to || path.startsWith(to + "/");
  }

  return (
    <NavLink
      to={to}
      className={`nav-button${active ? " active" : ""}`}
      aria-current={active ? "page" : undefined}
    >
      {icon}
      <span>{label}</span>
    </NavLink>
  );
}
