import React, { useState } from 'react';
import { Link, Outlet, useLocation } from 'react-router-dom';
import { canVisitRoute } from '../api/organizationAccess';
import { useAuth } from '../auth/AuthContext';
import { useTheme } from '../auth/ThemeContext';
import { Sidebar } from './Sidebar';
import { TopBar } from './TopBar';
import { SectionLabel } from './SectionLabel';
import { CommandPalette } from './CommandPalette';

export function AppShell() {
  const { canPermission, isSuperAdmin, isFeatureEnabled } = useAuth();
  const location = useLocation();
  const { theme, toggle } = useTheme();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  const authorized = canVisitRoute(location.pathname, canPermission, isSuperAdmin, isFeatureEnabled);

  return (
    <div className={`app-shell ${sidebarCollapsed ? 'sidebar-collapsed' : ''}`}>
      <TopBar
        theme={theme}
        onToggleTheme={toggle}
        onToggleSidebar={() => setSidebarCollapsed((c) => !c)}
      />
      <div className="app-body">
        <Sidebar collapsed={sidebarCollapsed} />
        <main className="app-main" id="main-content">
          <SectionLabel />
          {authorized ? <Outlet /> : <section className="page"><h1>Access unavailable</h1><p>Your current assignments do not allow this page. Ask your Organisation Admin to review your access.</p><Link to="/account" className="btn btn-secondary">Go to My Account</Link></section>}
        </main>
      </div>
      <CommandPalette />
    </div>
  );
}
