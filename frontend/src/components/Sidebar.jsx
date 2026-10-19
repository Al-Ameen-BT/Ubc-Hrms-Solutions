import React, { useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';

/* Navigation is grouped by section. `roles` gates an item the same way the
   backend route does — see AuthContext.can(). */
const NAV = {
  platform: [
    {
      label: 'Platform',
      items: [
        { to: '/', label: 'Overview', icon: 'dashboard' },
        { to: '/organisations', label: 'Organisations', icon: 'orgs' },
        { to: '/platform-users', label: 'Platform Users', icon: 'users' },
        { to: '/platform-settings', label: 'Settings', icon: 'settings' },
        { to: '/audit', label: 'Audit Log', icon: 'audit' },
      ],
    },
  ],

  org: [
    { label: 'Main', items: [{ to: '/', label: 'Overview', icon: 'dashboard' }] },
    {
      label: 'Establishment',
      items: [
        { to: '/users', label: 'Users', icon: 'users', roles: ['ORG_ADMIN', 'HR_ADMIN'] },
        { to: '/employees', label: 'Employees', icon: 'employees' },
        { to: '/posts', label: 'Posts & Cadres', icon: 'posts', roles: ['ORG_ADMIN', 'HR_ADMIN', 'PAYROLL_OFFICER'] },
        { to: '/pay-scales', label: 'Pay Scales', icon: 'scales', roles: ['ORG_ADMIN', 'HR_ADMIN', 'PAYROLL_OFFICER'] },
        { to: '/pay-revisions', label: 'Pay Revisions', icon: 'scales', roles: ['ORG_ADMIN', 'HR_ADMIN', 'PAYROLL_OFFICER'] },
      ],
    },
    {
      label: 'Payroll',
      items: [
        { to: '/payroll', label: 'Payroll', icon: 'payroll', roles: ['ORG_ADMIN', 'HR_ADMIN', 'PAYROLL_OFFICER'] },
        { to: '/leave', label: 'Leave', icon: 'leave' },
        { to: '/allowances', label: 'Allowances', icon: 'payroll', roles: ['ORG_ADMIN', 'HR_ADMIN'] },
        { to: '/arrears', label: 'DA Arrears', icon: 'scales', roles: ['ORG_ADMIN', 'HR_ADMIN', 'PAYROLL_OFFICER'] },
        { to: '/year-end', label: 'Year-End', icon: 'go', roles: ['ORG_ADMIN', 'HR_ADMIN', 'PAYROLL_OFFICER'] },
      ],
    },
    {
      label: 'Governance',
      items: [
        { to: '/government-orders', label: 'GO Register', icon: 'go' },
        { to: '/ksr-rules', label: 'KSR Rules', icon: 'rules' },
        { to: '/org-profile', label: 'Org Profile', icon: 'orgs', roles: ['ORG_ADMIN'] },
        { to: '/settings', label: 'Settings', icon: 'settings', roles: ['ORG_ADMIN'] },
        { to: '/payroll-settings', label: 'Payroll Settings', icon: 'payroll', roles: ['ORG_ADMIN', 'HR_ADMIN'] },
        { to: '/mandatory-fields', label: 'Mandatory Fields', icon: 'rules', roles: ['ORG_ADMIN'] },
        { to: '/audit', label: 'Audit Log', icon: 'audit', roles: ['ORG_ADMIN'] },
      ],
    },
  ],

  employee: [
    {
      label: 'Workspace',
      items: [
        { to: '/', label: 'My Dashboard', icon: 'dashboard' },
        { to: '/account', label: 'My Account', icon: 'users' },
      ],
    },
  ],
};

function NavIcon({ name }) {
  const icons = {
    dashboard: <path d="M3 3h7v7H3zM14 3h7v4h-7zM14 11h7v10h-7zM3 14h7v7H3z" stroke="currentColor" strokeWidth="1.5" fill="none" />,
    orgs: <path d="M3 21h18M5 21V7l7-4 7 4v14M9 21v-6h6v6" stroke="currentColor" strokeWidth="1.5" fill="none" />,
    users: <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" stroke="currentColor" strokeWidth="1.5" fill="none" />,
    employees: <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z" stroke="currentColor" strokeWidth="1.5" fill="none" />,
    posts: <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20M4 19.5A2.5 2.5 0 0 0 6.5 22H20V2H6.5A2.5 2.5 0 0 0 4 4.5v15z" stroke="currentColor" strokeWidth="1.5" fill="none" />,
    scales: <path d="M6 3h12M6 8h12M6 13l8.5 8M6 13h3M9 13c6.667 0 6.667-10 0-10" stroke="currentColor" strokeWidth="1.5" fill="none" />,
    payroll: <path d="M6 3h12M6 8h12M6 13l8.5 8M6 13h3M9 13c6.667 0 6.667-10 0-10" stroke="currentColor" strokeWidth="1.5" fill="none" />,
    leave: <path d="M8 2v4M16 2v4M3 9h18M5 4h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z" stroke="currentColor" strokeWidth="1.5" fill="none" />,
    go: <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8zM14 2v6h6M16 13H8M16 17H8M10 9H8" stroke="currentColor" strokeWidth="1.5" fill="none" />,
    rules: <path d="M9 11l3 3L22 4M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" stroke="currentColor" strokeWidth="1.5" fill="none" />,
    settings: <path d="M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" stroke="currentColor" strokeWidth="1.5" fill="none" />,
    audit: (
      <g stroke="currentColor" strokeWidth="1.5" fill="none">
        <path d="M12 8v4l3 3" />
        <path d="M3.05 11a9 9 0 1 1 .5 4m-.5 5v-5h5" />
      </g>
    ),
  };

  return (
    <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
      {icons[name] || icons.dashboard}
    </svg>
  );
}

const TOP_LIMIT = 3;

export function Sidebar({ collapsed }) {
  const { isSuperAdmin, user, can } = useAuth();
  const location = useLocation();
  const groups = user?.role === 'EMPLOYEE' ? NAV.employee : isSuperAdmin ? NAV.platform : NAV.org;

  const [expandedGroups, setExpandedGroups] = useState({});
  const [hoveredGroup, setHoveredGroup] = useState(null);

  const toggleGroup = (groupLabel) => {
    setExpandedGroups((prev) => ({
      ...prev,
      [groupLabel]: !prev[groupLabel],
    }));
  };

  return (
    <nav className={`sidebar ${collapsed ? 'collapsed' : ''}`} aria-label="Main navigation">
      <div className="sidebar-nav">
        {groups.map((group) => {
          const authorizedItems = group.items.filter((item) => !item.roles || can(...item.roles));
          const hasMore = authorizedItems.length > TOP_LIMIT;

          // Auto-expand if active route is among the items beyond top 3
          const hasActiveHiddenItem = authorizedItems.slice(TOP_LIMIT).some((item) => {
            return item.to === '/' ? location.pathname === '/' : location.pathname.startsWith(item.to);
          });

          const isExpanded = !!expandedGroups[group.label] || hoveredGroup === group.label || hasActiveHiddenItem;
          const visibleItems = (hasMore && !isExpanded) ? authorizedItems.slice(0, TOP_LIMIT) : authorizedItems;

          return (
            <div
              className={`sidebar-group ${isExpanded ? 'is-expanded' : ''}`}
              key={group.label}
              onMouseEnter={() => setHoveredGroup(group.label)}
              onMouseLeave={() => setHoveredGroup(null)}
            >
              {!collapsed && (
                <div
                  className={`sidebar-group-label ${hasMore ? 'clickable' : ''}`}
                  onClick={() => hasMore && toggleGroup(group.label)}
                  title={hasMore ? (isExpanded ? 'Click to show less' : 'Click to show more') : undefined}
                >
                  <span>{group.label}</span>
                </div>
              )}

              {visibleItems.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  end={item.to === '/'}
                  className={({ isActive }) => `sidebar-item ${isActive ? 'active' : ''}`}
                  title={collapsed ? item.label : undefined}
                >
                  <span className="sidebar-item-icon">
                    <NavIcon name={item.icon} />
                  </span>
                  {!collapsed && <span className="sidebar-item-label">{item.label}</span>}
                </NavLink>
              ))}

              {!collapsed && hasMore && (
                <button
                  type="button"
                  className="sidebar-more-btn"
                  onClick={() => toggleGroup(group.label)}
                >
                  <span>{isExpanded ? 'Show less' : 'More'}</span>
                  <svg
                    width="12"
                    height="12"
                    viewBox="0 0 20 20"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    className={`sidebar-more-arrow ${isExpanded ? 'expanded' : ''}`}
                  >
                    <path d="M5 7.5L10 12.5L15 7.5" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </button>
              )}
            </div>
          );
        })}
      </div>

      {!collapsed && (
        <div className="sidebar-footer">
          <span className="sidebar-footer-powered">Powered By</span>
          <img src="/banihal-logo.png" alt="Banihal Technologies" className="sidebar-footer-logo" />
        </div>
      )}
    </nav>
  );
}
