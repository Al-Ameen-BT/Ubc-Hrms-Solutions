import React, { useState } from 'react';
import { Outlet } from 'react-router-dom';
import { useTheme } from '../auth/ThemeContext';
import { Sidebar } from './Sidebar';
import { TopBar } from './TopBar';
import { SectionLabel } from './SectionLabel';
import { CommandPalette } from './CommandPalette';

export function AppShell() {
  const { theme, toggle } = useTheme();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

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
