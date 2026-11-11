import React, { useState } from 'react';
import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { useTheme } from '../auth/ThemeContext';
import { Sidebar } from './Sidebar';
import { TopBar } from './TopBar';
import { SectionLabel } from './SectionLabel';
import { CommandPalette } from './CommandPalette';

export function AppShell() {
  const { user } = useAuth();
  const location = useLocation();
  const { theme, toggle } = useTheme();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  if (user?.role === 'EMPLOYEE' && !['/', '/account'].includes(location.pathname) && !location.pathname.startsWith('/my/')) return <Navigate to="/" replace />;

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
          <Outlet />
        </main>
      </div>
      <CommandPalette />
    </div>
  );
}
