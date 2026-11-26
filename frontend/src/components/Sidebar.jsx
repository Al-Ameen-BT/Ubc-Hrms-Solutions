import React, { useEffect, useMemo, useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { useAuth } from '../auth/AuthContext';
import { canVisitRoute } from '../api/organizationAccess';
import { version } from '../../../package.json';

/* Server permission codes control organisation navigation; the API remains authoritative. */
const NAV = {
  platform: {
    command: [
      { to: '/', label: 'Platform Overview', icon: 'overview' },
      { to: '/organisations', label: 'Organisations', icon: 'structure' },
    ],
    groups: [
      {
        id: 'platform-ops',
        label: 'Platform Operations',
        icon: 'roles',
        items: [
          { to: '/platform-users', label: 'Platform Users', icon: 'directory' },
          { to: '/bank-rules', label: 'Bank Classes & Rules', icon: 'scales' },
          { to: '/dpdp-documents', label: 'DPDP Documents', icon: 'governance' },
          { to: '/audit', label: 'Audit Log', icon: 'history' },
        ],
      },
      {
        id: 'platform-admin',
        label: 'Administration',
        icon: 'settings',
        items: [
          { to: '/platform-settings', label: 'Platform Settings', icon: 'settings' },
        ],
      },
    ],
  },

  org: {
    command: [
      { to: '/', label: 'Organisation Overview', icon: 'overview' },
      { to: '/organisation-explorer', label: 'Organisation Explorer', icon: 'explorer' },
    ],
    groups: [
      {
        id: 'workforce',
        label: 'Workforce',
        icon: 'directory',
        items: [
          { to: '/people', label: 'Employee Directory', icon: 'directory' },
          { to: '/organisation-structure', label: 'Organisation Structure', icon: 'structure' },
          { to: '/posts', label: 'Posts & Cadres', icon: 'cadres' },
        ],
      },
      {
        id: 'time',
        label: 'Time & Attendance',
        icon: 'attendance',
        items: [
          { to: '/employee-services/time', label: 'Attendance', icon: 'attendance' },
          { to: '/leave', label: 'Leave Management', icon: 'leave' },
          { to: '/employee-services/holidays', label: 'Holiday Calendar', icon: 'holidays' },
        ],
      },
      {
        id: 'payroll',
        label: 'Pay & Benefits',
        icon: 'payroll',
        subCategories: [
          {
            label: 'Operations',
            items: [
              { to: '/payroll', label: 'Payroll', icon: 'payroll' },
              { to: '/employee-services/expenses', label: 'Reimbursements', icon: 'reimbursements' },
            ],
          },
          {
            label: 'Salary Configuration',
            items: [
              { to: '/pay-scales', label: 'Pay Scales', icon: 'scales' },
              { to: '/allowances', label: 'Allowances', icon: 'allowances' },
              { to: '/deductions', label: 'Deductions & Slabs', icon: 'deductions' },
            ],
          },
          {
            label: 'Revisions & Adjustments',
            items: [
              { to: '/pay-revisions', label: 'Pay Revisions', icon: 'revisions' },
              { to: '/catalogue-adoption', label: 'Bank Class Adoption', icon: 'adoption' },
              { to: '/arrears', label: 'DA Arrears', icon: 'arrears' },
            ],
          },
          {
            label: 'Annual Operations',
            items: [
              { to: '/year-end', label: 'Year-End', icon: 'yearend' },
            ],
          },
        ],
      },
      {
        id: 'governance',
        label: 'Governance & Compliance',
        icon: 'governance',
        items: [
          { to: '/financial-changes', label: 'Financial Changes', icon: 'revisions' },
          { to: '/employee-services/policy', label: 'Policy Management', icon: 'governance' },
          { to: '/dpdp-compliance', label: 'DPDP Compliance', icon: 'adoption' },
          { to: '/government-orders', label: 'GO Register', icon: 'orders' },
          { to: '/ksr-rules', label: 'KSR Rules', icon: 'scales' },
          { to: '/audit', label: 'Audit Log', icon: 'history' },
        ],
      },
      {
        id: 'reports',
        label: 'Reports & Analytics',
        icon: 'reports',
        items: [
          { to: '/reports', label: 'Reports & Exports', icon: 'reports' },
        ],
      },
      {
        id: 'self-service',
        label: 'My Self-Service',
        icon: 'profile',
        items: [
          { to: '/notifications', label: 'Notifications', icon: 'notifications' },
          { to: '/my/payslips', label: 'My Payslips', icon: 'payroll' },
          { to: '/my/leave', label: 'My Leave', icon: 'leave' },
          { to: '/my/calendar', label: 'My Calendar', icon: 'holidays' },
          { to: '/my/policies', label: 'Policies', icon: 'governance' },
          { to: '/my/expenses', label: 'My Reimbursements', icon: 'reimbursements' },
          { to: '/my/workplace', label: 'My Workplace', icon: 'explorer' },
          { to: '/my/time', label: 'My Attendance', icon: 'attendance' },
          { to: '/my/privacy', label: 'Privacy Requests', icon: 'adoption' },
          { to: '/account', label: 'My Account', icon: 'profile' },
        ],
      },
      {
        id: 'administration',
        label: 'Administration',
        icon: 'settings',
        items: [
          { to: '/settings', label: 'Organisation Settings', icon: 'settings' },
          { to: '/payroll-settings', label: 'Payroll Settings', icon: 'scales' },
          { to: '/mandatory-fields', label: 'Mandatory Fields', icon: 'orders' },
          { to: '/roles-permissions', label: 'Roles & Permissions', icon: 'roles' },
        ],
      },
    ],
  },

  employee: {
    command: [
      { to: '/', label: 'My Dashboard', icon: 'overview' },
      { to: '/notifications', label: 'Notifications', icon: 'notifications' },
    ],
    groups: [
      {
        id: 'self-service',
        label: 'My Self-Service',
        icon: 'profile',
        items: [
          { to: '/my/payslips', label: 'My Payslips', icon: 'payroll' },
          { to: '/my/leave', label: 'My Leave', icon: 'leave' },
          { to: '/my/calendar', label: 'Calendar', icon: 'holidays' },
          { to: '/my/policies', label: 'Policies', icon: 'governance' },
          { to: '/my/expenses', label: 'Reimbursements', icon: 'reimbursements' },
          { to: '/my/workplace', label: 'Workplace', icon: 'explorer' },
          { to: '/my/time', label: 'Check-in & out', icon: 'attendance' },
          { to: '/my/privacy', label: 'Privacy Requests', icon: 'adoption' },
          { to: '/account', label: 'My Account', icon: 'profile' },
        ],
      },
    ],
  },
};

function NavIcon({ name, size = 18 }) {
  const icons = {
    overview: <path d="M3 3h7v7H3zM14 3h7v4h-7zM14 11h7v10h-7zM3 14h7v7H3z" />,
    explorer: (
      <g>
        <circle cx="12" cy="5" r="2.5" />
        <circle cx="6" cy="18" r="2.5" />
        <circle cx="18" cy="18" r="2.5" />
        <path d="M12 7.5V12M12 12L6 15.5M12 12L18 15.5" />
      </g>
    ),
    structure: <path d="M3 21h18M5 21V7l7-4 7 4v14M9 21v-6h6v6" />,
    directory: <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" />,
    cadres: <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20M4 19.5A2.5 2.5 0 0 0 6.5 22H20V2H6.5A2.5 2.5 0 0 0 4 4.5v15z" />,
    attendance: (
      <g>
        <circle cx="12" cy="12" r="9" />
        <polyline points="12 7 12 12 15 14" />
      </g>
    ),
    leave: <path d="M8 2v4M16 2v4M3 9h18M5 4h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z" />,
    holidays: (
      <g>
        <circle cx="12" cy="12" r="4" />
        <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41" />
      </g>
    ),
    payroll: <path d="M6 3h12M6 8h12M6 13l8.5 8M6 13h3M9 13c6.667 0 6.667-10 0-10" />,
    scales: <path d="M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3M1 14h6M9 8h6M17 16h6" />,
    revisions: <polyline points="23 6 13.5 15.5 8.5 10.5 1 18" />,
    adoption: <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />,
    allowances: (
      <g>
        <circle cx="12" cy="12" r="9" />
        <path d="M12 8v8M8 12h8" />
      </g>
    ),
    deductions: (
      <g>
        <circle cx="12" cy="12" r="9" />
        <path d="M8 12h8" />
      </g>
    ),
    reimbursements: <path d="M4 2v20l2-1 2 1 2-1 2 1 2-1 2 1 2-1 2 1V2l-2 1-2-1-2 1-2-1-2 1-2-1-2 1-2-1zM8 8h8M8 12h8M8 16h5" />,
    arrears: <path d="M3 12a9 9 0 1 0 3-6.7L3 8M3 3v5h5M12 7v5l3 2" />,
    yearend: <path d="M21 8v13H3V8M1 3h22v5H1zM10 12h4" />,
    governance: <path d="M9 11l3 3L22 4M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />,
    orders: <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8zM14 2v6h6M16 13H8M16 17H8M10 9H8" />,
    history: (
      <g>
        <path d="M12 8v4l3 3" />
        <path d="M3.05 11a9 9 0 1 1 .5 4m-.5 5v-5h5" />
      </g>
    ),
    reports: <path d="M18 20V10M12 20V4M6 20v-6" />,
    notifications: <path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4" />,
    profile: <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z" />,
    settings: <path d="M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />,
    roles: <path d="M21 2l-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0l3 3L22 7l-3-3m-3.5 3.5L19 4" />,
  };

  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.65" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {icons[name] || icons.overview}
    </svg>
  );
}

function isRouteMatch(itemTo, pathname) {
  if (itemTo === '/') return pathname === '/';
  if (itemTo === '/people' && pathname.startsWith('/employees/')) return true;
  return pathname === itemTo || pathname.startsWith(`${itemTo}/`);
}

function flattenGroupItems(group) {
  if (group.items) return group.items;
  if (group.subCategories) return group.subCategories.flatMap((sc) => sc.items);
  return [];
}

export function Sidebar({ collapsed }) {
  const { isSuperAdmin, canPermission, permissionCodes, isFeatureEnabled } = useAuth();
  const location = useLocation();
  const operational = permissionCodes.some((code) => !code.startsWith('self.') && code !== 'chart.view');
  const navConfig = isSuperAdmin ? NAV.platform : operational ? NAV.org : NAV.employee;

  // Authorize Command Centre items
  const commandItems = useMemo(
    () => navConfig.command.filter((item) => canVisitRoute(item.to, canPermission, isSuperAdmin, isFeatureEnabled)),
    [navConfig.command, canPermission, isSuperAdmin, isFeatureEnabled]
  );

  // Authorize Accordion Parent Groups & Sub-categories
  const authorizedGroups = useMemo(() => {
    return navConfig.groups
      .map((group) => {
        if (group.subCategories) {
          const filteredSubs = group.subCategories
            .map((sc) => ({
              ...sc,
              items: sc.items.filter((item) => canVisitRoute(item.to, canPermission, isSuperAdmin, isFeatureEnabled)),
            }))
            .filter((sc) => sc.items.length > 0);
          if (!filteredSubs.length) return null;
          return { ...group, subCategories: filteredSubs };
        }
        const filteredItems = group.items.filter((item) => canVisitRoute(item.to, canPermission, isSuperAdmin, isFeatureEnabled));
        if (!filteredItems.length) return null;
        return { ...group, items: filteredItems };
      })
      .filter(Boolean);
  }, [navConfig.groups, canPermission, isSuperAdmin, isFeatureEnabled]);

  // Identify which accordion group contains the active route
  const activeGroupId = useMemo(() => {
    for (const group of authorizedGroups) {
      const all = flattenGroupItems(group);
      if (all.some((item) => isRouteMatch(item.to, location.pathname))) {
        return group.id;
      }
    }
    return null;
  }, [authorizedGroups, location.pathname]);

  // Persisted expansion state: defaults to only activeGroupId (or first group if employee/platform)
  const [expandedMap, setExpandedMap] = useState(() => {
    try {
      const saved = JSON.parse(sessionStorage.getItem('ucb:sidebar-accordion') || '{}');
      return saved && typeof saved === 'object' ? saved : {};
    } catch {
      return {};
    }
  });

  // Automatically ensure the active route's parent module is expanded
  useEffect(() => {
    if (activeGroupId) {
      setExpandedMap((prev) => {
        if (prev[activeGroupId] === true) return prev;
        return { ...prev, [activeGroupId]: true };
      });
    } else if (!operational && authorizedGroups[0]) {
      const firstId = authorizedGroups[0].id;
      setExpandedMap((prev) => (prev[firstId] ? prev : { ...prev, [firstId]: true }));
    }
  }, [activeGroupId, operational, authorizedGroups]);

  useEffect(() => {
    sessionStorage.setItem('ucb:sidebar-accordion', JSON.stringify(expandedMap));
  }, [expandedMap]);

  const toggleGroup = (groupId) => {
    setExpandedMap((prev) => ({
      ...prev,
      [groupId]: !prev[groupId],
    }));
  };

  return (
    <nav className={`sidebar ${collapsed ? 'collapsed' : ''}`} aria-label="Main navigation">
      <div className="sidebar-nav">
        {/* Command Centre (Primary Entry Points) */}
        {commandItems.length > 0 && (
          <div className="sidebar-command-section">
            {!collapsed && <div className="sidebar-section-kicker">Command Centre</div>}
            <div className="sidebar-command-list">
              {commandItems.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  end={item.to === '/'}
                  className={({ isActive }) => `sidebar-item sidebar-command-item ${isActive ? 'active' : ''}`}
                  title={collapsed ? item.label : undefined}
                >
                  <span className="sidebar-item-icon">
                    <NavIcon name={item.icon} />
                  </span>
                  {!collapsed && <span className="sidebar-item-label">{item.label}</span>}
                </NavLink>
              ))}
            </div>
          </div>
        )}

        {/* Consistent Collapsible Accordion Modules */}
        <div className="sidebar-accordion-list">
          {!collapsed && operational && <div className="sidebar-section-kicker">HR Operations &amp; Admin</div>}
          {authorizedGroups.map((group) => {
            const isActiveParent = activeGroupId === group.id;
            const isOpen = Boolean(expandedMap[group.id]);
            const allItems = flattenGroupItems(group);

            return (
              <div
                key={group.id}
                className={`sidebar-group ${isOpen ? 'is-expanded' : ''} ${isActiveParent ? 'has-active-child' : ''}`}
              >
                {!collapsed && (
                  <button
                    type="button"
                    className={`sidebar-parent-btn ${isActiveParent ? 'is-active-parent' : ''}`}
                    onClick={() => toggleGroup(group.id)}
                    aria-expanded={isOpen}
                    aria-controls={`sidebar-group-${group.id}`}
                  >
                    <span className="sidebar-parent-left">
                      <span className="sidebar-parent-icon">
                        <NavIcon name={group.icon} size={17} />
                      </span>
                      <span className="sidebar-parent-label">{group.label}</span>
                    </span>
                    <svg
                      className={`sidebar-parent-chevron ${isOpen ? 'is-open' : ''}`}
                      width="14"
                      height="14"
                      viewBox="0 0 20 20"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      aria-hidden="true"
                    >
                      <path d="M6 8l4 4 4-4" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </button>
                )}

                <div
                  id={`sidebar-group-${group.id}`}
                  className={`sidebar-group-body ${isOpen ? 'is-expanded' : 'is-collapsed'}`}
                  aria-hidden={!collapsed && !isOpen}
                >
                  <div className="sidebar-group-inner sidebar-child-list">
                    {group.subCategories ? (
                      group.subCategories.map((sub) => (
                        <div key={sub.label} className="sidebar-subcat">
                          {!collapsed && <div className="sidebar-subcat-label">{sub.label}</div>}
                          {sub.items.map((item) => (
                            <NavLink
                              key={item.to}
                              to={item.to}
                              className={({ isActive }) => `sidebar-item sidebar-child-item ${isActive ? 'active' : ''}`}
                              title={collapsed ? item.label : undefined}
                            >
                              <span className="sidebar-item-icon">
                                <NavIcon name={item.icon} size={16} />
                              </span>
                              {!collapsed && <span className="sidebar-item-label">{item.label}</span>}
                            </NavLink>
                          ))}
                        </div>
                      ))
                    ) : (
                      allItems.map((item) => (
                        <NavLink
                          key={item.to}
                          to={item.to}
                          end={item.to === '/'}
                          className={({ isActive }) => `sidebar-item sidebar-child-item ${isActive || (item.to === '/people' && location.pathname.startsWith('/employees/')) ? 'active' : ''}`}
                          title={collapsed ? item.label : undefined}
                        >
                          <span className="sidebar-item-icon">
                            <NavIcon name={item.icon} size={16} />
                          </span>
                          {!collapsed && <span className="sidebar-item-label">{item.label}</span>}
                        </NavLink>
                      ))
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Clean Compact Branding Footer */}
      {!collapsed && (
        <div className="sidebar-footer">
          <span className="app-version">Version {version}</span>
          <span className="sidebar-footer-powered">Powered By</span>
          <img src="/banihal-logo.png" alt="Banihal Technologies" className="sidebar-footer-logo" />
        </div>
      )}
    </nav>
  );
}
