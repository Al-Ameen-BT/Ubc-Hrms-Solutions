import React from 'react';
import { useAuth } from '../auth/AuthContext';

export function TopBar({ theme, onToggleTheme, onToggleSidebar }) {
  const { user, branding, logout } = useAuth();

  const platformName = branding?.platformName || 'UCB HRMS & Payroll';
  const orgName = user?.organizationName || branding?.name || branding?.organizationName || '';
  const isPlatform = !user?.organizationId;

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
            <span className="topbar-platform-name">{platformName}</span>
          ) : (
            <>
              {branding?.logoUrl && <img src={branding.logoUrl} alt="" className="topbar-logo" />}
              <span className="topbar-org-name">{orgName}</span>
            </>
          )}
        </div>
      </div>
      <div className="topbar-right">
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
        <div className="topbar-user">
          <span className="topbar-user-name">{user?.name}</span>
          <span className="topbar-user-role">{user?.role?.replace(/_/g, ' ')}</span>
        </div>
        <button className="topbar-logout-btn" onClick={logout} aria-label="Sign out">
          <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
            <path d="M6 2H3a1 1 0 0 0-1 1v12a1 1 0 0 0 1 1h3M12 12l3-3-3-3M15 9H6" stroke="currentColor" strokeWidth="1.5" />
          </svg>
        </button>
      </div>
    </header>
  );
}
