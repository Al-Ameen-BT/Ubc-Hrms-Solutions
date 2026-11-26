import React, { useEffect, useMemo, useRef, useState } from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '../auth/AuthContext';
import { canVisitRoute } from '../api/organizationAccess';
import { masterDataApi } from '../api/client';
import { version } from '../../../package.json';

/* Server permission codes control organisation navigation; the API remains authoritative. */
const NAV = {
  platform: [
    {
      label: 'Platform',
      items: [
        { to: '/', label: 'Overview', icon: 'dashboard' },
        { to: '/organisations', label: 'Organisations', icon: 'orgs' },
        { to: '/platform-users', label: 'Platform Users', icon: 'users' },
        { to: '/bank-rules', label: 'Bank Classes & Rules', icon: 'scales' },
        { to: '/dpdp-documents', label: 'DPDP Documents', icon: 'rules' },
        { to: '/platform-settings', label: 'Settings', icon: 'settings' },
        { to: '/audit', label: 'Audit Log', icon: 'audit' },
      ],
    },
  ],

  org: [
    { label: 'Overview', items: [{ to: '/', label: 'Overview', icon: 'dashboard' }, { to: '/organisation-explorer', label: 'Organisation Explorer', icon: 'orgs' }] },
    {
      label: 'Workforce',
      items: [
        { to: '/people', label: 'People', icon: 'employees' },
        { to: '/organisation-structure', label: 'Organisation Structure', icon: 'orgs' },
        { to: '/posts', label: 'Posts & Cadres', icon: 'posts' },
      ],
    },
    {
      label: 'Time & Attendance',
      items: [
        { to: '/employee-services/time', label: 'Attendance', icon: 'audit' },
        { to: '/leave', label: 'Leave', icon: 'leave' },
        { to: '/employee-services/holidays', label: 'Holidays', icon: 'leave' },
      ],
    },
    {
      label: 'Pay & Benefits',
      items: [
        { to: '/payroll', label: 'Payroll', icon: 'payroll' },
        { to: '/pay-scales', label: 'Pay Scales', icon: 'scales' },
        { to: '/pay-revisions', label: 'Pay Revisions', icon: 'scales' },
        { to: '/catalogue-adoption', label: 'Bank Class Adoption', icon: 'rules' },
        { to: '/allowances', label: 'Allowances', icon: 'payroll' },
        { to: '/deductions', label: 'Deductions & Slabs', icon: 'payroll' },
        { to: '/employee-services/expenses', label: 'Reimbursements', icon: 'payroll' },
        { to: '/arrears', label: 'DA Arrears', icon: 'scales' },
        { to: '/year-end', label: 'Year-End', icon: 'go' },
      ],
    },
    {
      label: 'Governance',
      items: [
        { to: '/government-orders', label: 'GO Register', icon: 'go' },
        { to: '/ksr-rules', label: 'KSR Rules', icon: 'rules' },
        { to: '/dpdp-compliance', label: 'DPDP Compliance', icon: 'rules' },
        { to: '/employee-services/policy', label: 'Policy Management', icon: 'rules' },
        { to: '/financial-changes', label: 'Financial Changes', icon: 'audit' },
        { to: '/audit', label: 'Audit Log', icon: 'audit' },
      ],
    },
    { label: 'Reports', items: [{ to: '/reports', label: 'Reports', icon: 'audit' }] },
    {
      label: 'My Workspace',
      items: [
        { to: '/notifications', label: 'Notifications', icon: 'notifications' },
        { to: '/my/payslips', label: 'My Payslips', icon: 'payroll' },
        { to: '/my/leave', label: 'My Leave', icon: 'leave' },
        { to: '/my/calendar', label: 'My Calendar', icon: 'leave' },
        { to: '/my/policies', label: 'Policies', icon: 'rules' },
        { to: '/my/expenses', label: 'My Reimbursements', icon: 'payroll' },
        { to: '/my/workplace', label: 'My Workplace', icon: 'employees' },
        { to: '/my/time', label: 'My Attendance', icon: 'audit' },
        { to: '/my/privacy', label: 'Privacy Requests', icon: 'rules' },
        { to: '/account', label: 'My Account', icon: 'users' },
      ],
    },
    {
      label: 'Administration',
      items: [
        { to: '/settings', label: 'Organisation Settings', icon: 'settings' },
        { to: '/payroll-settings', label: 'Payroll Settings', icon: 'payroll' },
        { to: '/mandatory-fields', label: 'Mandatory Fields', icon: 'rules' },
        { to: '/roles-permissions', label: 'Roles & Permissions', icon: 'users' },
      ],
    },
  ],

  employee: [
    {
      label: 'My Workspace',
      items: [
        { to: '/notifications', label: 'Notifications', icon: 'notifications' },
        { to: '/', label: 'My Dashboard', icon: 'dashboard' },
        { to: '/my/payslips', label: 'My Payslips', icon: 'payroll' },
        { to: '/my/leave', label: 'My Leave', icon: 'leave' },
        { to: '/my/calendar', label: 'Calendar', icon: 'leave' },
        { to: '/my/policies', label: 'Policies', icon: 'rules' },
        { to: '/my/expenses', label: 'Reimbursements', icon: 'payroll' },
        { to: '/my/workplace', label: 'Workplace', icon: 'employees' },
        { to: '/my/time', label: 'Check-in & out', icon: 'audit' },
        { to: '/my/privacy', label: 'Privacy Requests', icon: 'rules' },
        { to: '/account', label: 'My Account', icon: 'users' },
      ],
    },
  ],
};

function NavIcon({ name, size = 18 }) {
  const icons = {
    dashboard: <path d="M3 3h7v7H3zM14 3h7v4h-7zM14 11h7v10h-7zM3 14h7v7H3z" stroke="currentColor" strokeWidth="1.5" fill="none" />,
    orgs: <path d="M3 21h18M5 21V7l7-4 7 4v14M9 21v-6h6v6" stroke="currentColor" strokeWidth="1.5" fill="none" />,
    users: <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" stroke="currentColor" strokeWidth="1.5" fill="none" />,
    user: <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z" stroke="currentColor" strokeWidth="1.75" fill="none" strokeLinecap="round" strokeLinejoin="round" />,
    employees: <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z" stroke="currentColor" strokeWidth="1.5" fill="none" />,
    posts: <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20M4 19.5A2.5 2.5 0 0 0 6.5 22H20V2H6.5A2.5 2.5 0 0 0 4 4.5v15z" stroke="currentColor" strokeWidth="1.5" fill="none" />,
    scales: <path d="M6 3h12M6 8h12M6 13l8.5 8M6 13h3M9 13c6.667 0 6.667-10 0-10" stroke="currentColor" strokeWidth="1.5" fill="none" />,
    payroll: <path d="M6 3h12M6 8h12M6 13l8.5 8M6 13h3M9 13c6.667 0 6.667-10 0-10" stroke="currentColor" strokeWidth="1.5" fill="none" />,
    leave: <path d="M8 2v4M16 2v4M3 9h18M5 4h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z" stroke="currentColor" strokeWidth="1.5" fill="none" />,
    go: <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8zM14 2v6h6M16 13H8M16 17H8M10 9H8" stroke="currentColor" strokeWidth="1.5" fill="none" />,
    rules: <path d="M9 11l3 3L22 4M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" stroke="currentColor" strokeWidth="1.5" fill="none" />,
    settings: <path d="M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" stroke="currentColor" strokeWidth="1.6" fill="none" />,
    audit: (
      <g stroke="currentColor" strokeWidth="1.5" fill="none">
        <path d="M12 8v4l3 3" />
        <path d="M3.05 11a9 9 0 1 1 .5 4m-.5 5v-5h5" />
      </g>
    ),
    notifications: <path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />,
    search: <path d="M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16zM21 21l-4.35-4.35" stroke="currentColor" strokeWidth="1.75" fill="none" strokeLinecap="round" strokeLinejoin="round" />,
  };

  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      {icons[name] || icons.dashboard}
    </svg>
  );
}

const SEARCH_LEGACY_ROLES = ['ORG_ADMIN', 'HR_ADMIN', 'HR_OFFICER', 'ACCOUNTS_OFFICER', 'PAYROLL_OFFICER', 'APPROVING_AUTHORITY', 'DEPARTMENT_HEAD'];
const TOP_FOUR_GROUPS = ['Overview', 'Workforce', 'Time & Attendance', 'Pay & Benefits'];

function workIdentity(employee) {
  const branch = typeof employee.branch === 'string' ? employee.branch : employee.branch?.name || employee.branchName || 'Branch not assigned';
  const department = typeof employee.department === 'string' ? employee.department : employee.department?.name || employee.departmentName || 'Department not assigned';
  const position = typeof employee.position === 'string' ? employee.position : employee.position?.name || employee.postName || 'Position not assigned';
  return { id: employee.id, name: employee.name || 'Unnamed employee', empCode: employee.empCode || 'No employee ID', branch, department, position, status: employee.status || 'UNKNOWN' };
}

export function Sidebar({ collapsed }) {
  const { isSuperAdmin, canPermission, permissionCodes, isFeatureEnabled } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const operational = permissionCodes.some(code => !code.startsWith('self.') && code !== 'chart.view');
  const groups = isSuperAdmin ? NAV.platform : operational ? NAV.org : NAV.employee;

  // Hover & click-pin state for hidden (non-top-4) sections
  const [hoveredGroup, setHoveredGroup] = useState(null);
  const [pinnedGroup, setPinnedGroup] = useState(null);

  // Bottom quick search popover state
  const [searchOpen, setSearchOpen] = useState(false);
  const [employeeSearch, setEmployeeSearch] = useState('');
  const [activeResult, setActiveResult] = useState(0);
  const searchRef = useRef(null);
  const searchWrapRef = useRef(null);

  const canSearch = !isSuperAdmin && canPermission('people.view', SEARCH_LEGACY_ROLES);
  const settingsPath = isSuperAdmin ? '/platform-settings' : '/settings';
  const canSettings = isSuperAdmin || canVisitRoute('/settings', canPermission, isSuperAdmin, isFeatureEnabled);
  const canProfile = !isSuperAdmin && canVisitRoute('/account', canPermission, isSuperAdmin, isFeatureEnabled);

  const trimmedSearch = employeeSearch.trim();
  const employeeQuery = useQuery({
    queryKey: ['sidebar-employee-search', trimmedSearch],
    queryFn: () => masterDataApi.employees({ search: trimmedSearch, limit: 20 }),
    enabled: canSearch && searchOpen && trimmedSearch.length >= 2,
    staleTime: 30000,
  });

  const employeeResults = useMemo(() => {
    if (trimmedSearch.length < 2) return [];
    const query = trimmedSearch.toLowerCase();
    return (employeeQuery.data?.rows || []).map(workIdentity).filter((employee) => `${employee.name} ${employee.empCode} ${employee.branch} ${employee.department} ${employee.position} ${employee.status}`.toLowerCase().includes(query)).slice(0, 8);
  }, [employeeQuery.data, trimmedSearch]);

  useEffect(() => { setActiveResult(0); }, [employeeSearch]);

  useEffect(() => {
    if (searchOpen) {
      setTimeout(() => searchRef.current?.focus(), 30);
    } else {
      setEmployeeSearch('');
    }
  }, [searchOpen]);

  // Close search popover on outside click
  useEffect(() => {
    if (!searchOpen) return undefined;
    const handleClickOutside = (event) => {
      if (searchWrapRef.current && !searchWrapRef.current.contains(event.target)) {
        setSearchOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [searchOpen]);

  const openEmployee = (employee) => {
    navigate(`/employees/${employee.id}`);
    setSearchOpen(false);
    setEmployeeSearch('');
  };

  const handleSearchKey = (event) => {
    if (event.key === 'Escape') {
      setSearchOpen(false);
      return;
    }
    if (!employeeResults.length) return;
    if (event.key === 'ArrowDown') { event.preventDefault(); setActiveResult((value) => (value + 1) % employeeResults.length); }
    if (event.key === 'ArrowUp') { event.preventDefault(); setActiveResult((value) => (value - 1 + employeeResults.length) % employeeResults.length); }
    if (event.key === 'Enter') { event.preventDefault(); openEmployee(employeeResults[activeResult]); }
  };

  return (
    <nav className={`sidebar ${collapsed ? 'collapsed' : ''}`} aria-label="Main navigation">
      <div className="sidebar-nav">
        {groups.map((group) => {
          const authorizedItems = group.items.filter((item) => canVisitRoute(item.to, canPermission, isSuperAdmin, isFeatureEnabled));
          if (!authorizedItems.length) return null;

          const isStatic = isSuperAdmin || !operational || TOP_FOUR_GROUPS.includes(group.label);
          const hasActiveItem = authorizedItems.some((item) =>
            item.to === '/'
              ? location.pathname === '/'
              : location.pathname.startsWith(item.to) || (item.to === '/people' && location.pathname.startsWith('/employees/'))
          );
          const isOpen = isStatic || hoveredGroup === group.label || pinnedGroup === group.label;

          return (
            <div
              className={`sidebar-group ${isOpen ? 'is-expanded' : ''} ${!isStatic ? 'is-hover-group' : ''}`}
              key={group.label}
              onMouseEnter={() => { if (!isStatic) setHoveredGroup(group.label); }}
              onMouseLeave={() => { if (!isStatic && hoveredGroup === group.label) setHoveredGroup(null); }}
            >
              {!collapsed && (
                isStatic ? (
                  <div className="sidebar-group-label">{group.label}</div>
                ) : (
                  <button
                    type="button"
                    className={`sidebar-group-label sidebar-group-toggle ${hasActiveItem ? 'has-active-route' : ''}`}
                    onClick={() => setPinnedGroup((prev) => (prev === group.label ? null : group.label))}
                    aria-expanded={isOpen}
                    aria-controls={`sidebar-group-${group.label.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`}
                  >
                    <span className="sidebar-group-title-wrap">
                      <span>{group.label}</span>
                      {hasActiveItem && !isOpen && <span className="sidebar-group-active-dot" aria-hidden="true" />}
                    </span>
                    <svg width="12" height="12" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                      <path d="M5 7.5L10 12.5L15 7.5" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </button>
                )
              )}

              <div
                id={`sidebar-group-${group.label.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`}
                className={`sidebar-group-body ${isOpen ? 'is-expanded' : 'is-collapsed'}`}
                aria-hidden={!collapsed && !isOpen}
              >
                <div className="sidebar-group-inner">
                  {authorizedItems.map((item) => (
                    <NavLink
                      key={item.to}
                      to={item.to}
                      end={item.to === '/'}
                      className={({ isActive }) => `sidebar-item ${isActive || (item.to === '/people' && location.pathname.startsWith('/employees/')) ? 'active' : ''}`}
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
            </div>
          );
        })}
      </div>

      {/* Bottom Footer: Branding + Standout Action Icons */}
      <div className="sidebar-footer-wrap" ref={searchWrapRef}>
        {!collapsed && canSearch && searchOpen && (
          <div className="sidebar-search-popover" role="dialog" aria-label="Find employee">
            <div className="sidebar-search-popover-header">
              <label htmlFor="sidebar-employee-search">Find employee</label>
              <button type="button" className="sidebar-search-close" onClick={() => setSearchOpen(false)} aria-label="Close search">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              </button>
            </div>
            <input
              ref={searchRef}
              id="sidebar-employee-search"
              type="search"
              value={employeeSearch}
              onChange={(event) => setEmployeeSearch(event.target.value)}
              onKeyDown={handleSearchKey}
              placeholder="Name or employee ID…"
              role="combobox"
              aria-expanded={employeeResults.length > 0}
              aria-controls="sidebar-search-results"
              aria-activedescendant={employeeResults[activeResult] ? `sidebar-employee-${employeeResults[activeResult].id}` : undefined}
              autoComplete="off"
            />
            {trimmedSearch.length >= 2 && (
              <div id="sidebar-search-results" className="sidebar-search-results" role="listbox" aria-label="Employee search results">
                {employeeQuery.isLoading ? (
                  <p role="status">Searching employees…</p>
                ) : employeeQuery.isError ? (
                  <p role="alert">Employee search is unavailable.</p>
                ) : employeeResults.length ? (
                  employeeResults.map((employee, index) => (
                    <button
                      id={`sidebar-employee-${employee.id}`}
                      key={employee.id}
                      type="button"
                      role="option"
                      aria-selected={index === activeResult}
                      onMouseEnter={() => setActiveResult(index)}
                      onClick={() => openEmployee(employee)}
                    >
                      <span><strong>{employee.name}</strong><small>{employee.empCode} · {employee.status}</small></span>
                      <small>{employee.branch} · {employee.department} · {employee.position}</small>
                    </button>
                  ))
                ) : (
                  <p>No matching employees.</p>
                )}
              </div>
            )}
          </div>
        )}

        <div className="sidebar-footer">
          {!collapsed ? (
            <div className="sidebar-footer-row">
              <div className="sidebar-footer-brand">
                <span className="app-version">Version {version}</span>
                <span className="sidebar-footer-powered">Powered By</span>
                <img src="/banihal-logo.png" alt="Banihal Technologies" className="sidebar-footer-logo" />
              </div>

              <div className="sidebar-footer-actions" aria-label="Quick navigation actions">
                {canSearch && (
                  <button
                    type="button"
                    className={`sidebar-footer-icon-btn ${searchOpen ? 'is-active' : ''}`}
                    onClick={() => setSearchOpen((prev) => !prev)}
                    title="Search Employee"
                    aria-label="Search Employee"
                    aria-expanded={searchOpen}
                  >
                    <NavIcon name="search" size={16} />
                  </button>
                )}
                {canSettings && (
                  <NavLink
                    to={settingsPath}
                    className={({ isActive }) => `sidebar-footer-icon-btn ${isActive ? 'is-active' : ''}`}
                    title={isSuperAdmin ? 'Platform Settings' : 'Organisation Settings'}
                    aria-label={isSuperAdmin ? 'Platform Settings' : 'Organisation Settings'}
                  >
                    <NavIcon name="settings" size={16} />
                  </NavLink>
                )}
                {canProfile && (
                  <NavLink
                    to="/account"
                    className={({ isActive }) => `sidebar-footer-icon-btn ${isActive ? 'is-active' : ''}`}
                    title="My Profile"
                    aria-label="My Profile"
                  >
                    <NavIcon name="user" size={16} />
                  </NavLink>
                )}
              </div>
            </div>
          ) : (
            <div className="sidebar-footer-collapsed-icons">
              {canSettings && (
                <NavLink
                  to={settingsPath}
                  className={({ isActive }) => `sidebar-footer-icon-btn ${isActive ? 'is-active' : ''}`}
                  title={isSuperAdmin ? 'Platform Settings' : 'Organisation Settings'}
                  aria-label={isSuperAdmin ? 'Platform Settings' : 'Organisation Settings'}
                >
                  <NavIcon name="settings" size={16} />
                </NavLink>
              )}
              {canProfile && (
                <NavLink
                  to="/account"
                  className={({ isActive }) => `sidebar-footer-icon-btn ${isActive ? 'is-active' : ''}`}
                  title="My Profile"
                  aria-label="My Profile"
                >
                  <NavIcon name="user" size={16} />
                </NavLink>
              )}
            </div>
          )}
        </div>
      </div>
    </nav>
  );
}
