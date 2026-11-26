import React from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '../auth/AuthContext';
import { api } from '../api/client';

export function TopBar({ theme, onToggleTheme, onToggleSidebar }) {
  const { user, branding, logout } = useAuth();

  const platformName = branding?.platformName || 'UCB HRMS & Payroll';
  const orgName = user?.organizationName || branding?.name || branding?.organizationName || '';
  const isPlatform = !user?.organizationId;
  const notifications = useQuery({ queryKey: ['notifications', 'topbar'], queryFn: () => api.getRaw('/notifications?limit=20'), enabled: Boolean(user?.organizationId), refetchInterval: 60000 });
  const unread = Number(notifications.data?.unread || 0);

  return (
    <header className="topbar">
      <div className="topbar-left">
        <button className="topbar-menu-btn" onClick={onToggleSidebar} aria-label="Toggle sidebar">
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
            <path d="M2 4h16M2 10h16M2 16h16" stroke="currentColor" strokeWidth="1.5" />
          </svg>
        </button>
        <div className="topbar-brand">
          {isPlatform ? (
            <Link to="/" className="topbar-brand-link" title="Return to Overview">
              <img src={branding?.logoUrl || '/alert.png'} alt="" className={`topbar-logo${!branding?.logoUrl || branding.logoUrl === '/alert.png' ? ' topbar-logo-round' : ''}`} />
              <span className="topbar-platform-name">{platformName}</span>
            </Link>
          ) : (
            <Link to="/" className="topbar-brand-link" title="Return to Overview">
              {branding?.logoUrl ? (
                <img src={branding.logoUrl} alt={`${orgName} logo`} className="topbar-logo" />
              ) : (
                <span className="topbar-logo-badge" aria-hidden="true">
                  {orgName.trim().split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase() || 'UB'}
                </span>
              )}
              {!branding?.logoUrl && (
                <span className="topbar-org-name">{orgName}</span>
              )}
            </Link>
          )}
        </div>
      </div>
      <div className="topbar-right">
        <button
          type="button"
          className="topbar-search-btn"
          onClick={() => window.dispatchEvent(new Event('ucb:open-command-palette'))}
          title="Quick search (Ctrl+K)"
          aria-label="Quick search (Ctrl+K)"
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          <span className="topbar-search-text">Search</span>
          <kbd className="topbar-search-kbd">Ctrl K</kbd>
        </button>
        {!isPlatform && <Link to="/notifications" className="topbar-notification-btn" aria-label={unread ? `${unread} unread notifications` : 'Notifications'} title="Notifications">
          <svg width="19" height="19" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
          {unread > 0 && <span>{unread > 99 ? '99+' : unread}</span>}
        </Link>}
        <button
          className="theme-switch"
          onClick={onToggleTheme}
          role="switch"
          aria-checked={theme === 'dark'}
          aria-label={`Dark mode ${theme === 'dark' ? 'on' : 'off'}`}
          title={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
        >
          <span className="theme-switch-track">
            <span className="theme-switch-sun">
              <svg width="12" height="12" viewBox="0 0 18 18" fill="none">
                <circle cx="9" cy="9" r="4" stroke="currentColor" strokeWidth="1.5" />
                <path d="M9 1v2M9 15v2M1 9h2M15 9h2M3.3 3.3l1.4 1.4M13.3 13.3l1.4 1.4M14.7 3.3l-1.4 1.4M4.7 13.3l-1.4 1.4" stroke="currentColor" strokeWidth="1.5" />
              </svg>
            </span>
            <span className="theme-switch-moon">
              <svg width="12" height="12" viewBox="0 0 18 18" fill="none">
                <path d="M16 10.5A8 8 0 0 1 7.5 2 7 7 0 1 0 16 10.5z" stroke="currentColor" strokeWidth="1.5" />
              </svg>
            </span>
            <span className="theme-switch-thumb" />
          </span>
        </button>
        <Link to={isPlatform ? '/platform-settings' : '/account'} className="topbar-user topbar-user-link" title="My Profile & Account">
          <span className="topbar-user-name">{user?.name}</span>
          <span className="topbar-user-role">{user?.role?.replace(/_/g, ' ')}</span>
        </Link>
        <button className="topbar-logout-btn" onClick={logout} aria-label="Sign out" title="Sign out">
          <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
            <path d="M6 2H3a1 1 0 0 0-1 1v12a1 1 0 0 0 1 1h3M12 12l3-3-3-3M15 9H6" stroke="currentColor" strokeWidth="1.5" />
          </svg>
        </button>
      </div>
    </header>
  );
}
