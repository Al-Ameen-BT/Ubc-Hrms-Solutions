import React from 'react';
import { useAuth } from '../../auth/AuthContext';

/** "MCUB" -> MC, "Demo UCB" -> DU, "UCB HRMS & Payroll" -> UH */
function initialsOf(name) {
  const words = String(name || '').trim().split(/\s+/).filter(Boolean);
  if (!words.length) return 'HR';
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return words.slice(0, 2).map((w) => w[0]).join('').toUpperCase();
}

/**
 * The shared frame for the sign-in and password-recovery screens.
 *
 * The left pane is the tenant's brand field; the right pane is the working
 * sign-in panel. Both columns sit inside one restrained card so the form never
 * reads as a small card floating in an empty page.
 */
export function AuthShell({ subtitle, children }) {
  const { branding, orgCode } = useAuth();
  const isOrg = Boolean(orgCode);
  const platform = branding?.platform || {};
  const platformName = branding?.platformName || platform?.platformName || 'UCB HRMS & Payroll';
  const orgName = branding?.shortName || branding?.name || branding?.organizationName;
  const brandName = isOrg ? orgName || 'Employee HRMS' : platformName;
  const logoUrl = isOrg ? branding?.logoUrl : branding?.logoUrl || platform?.logoUrl;
  const initials = initialsOf(brandName);

  const resolvedSubtitle =
    subtitle || (isOrg ? 'Employee HRMS sign-in' : 'Platform administration sign-in');

  return (
    <div className="login-page">
      <div className="login-shell">
        <aside className="login-brand" aria-label={`${brandName} brand`}>
          <span className="login-brand-orbit" aria-hidden="true" />

          <div className="login-brand-top">
            <span className="login-brand-mark" aria-hidden="true">{initials}</span>
            <span className="login-brand-label">
              {isOrg ? 'Employee HRMS' : 'Platform console'}
            </span>
          </div>

          <div className="login-brand-copy">
            <p className="login-brand-title">
              {isOrg ? (
                <>Your workday,<br />all in one place.</>
              ) : (
                <>Every bank,<br />one console.</>
              )}
            </p>
            <p className="login-brand-text">
              {isOrg
                ? `Leave, payslips, service records and payroll — one secure sign-in for ${brandName} staff.`
                : 'Organisations, licensing, users and audit — one secure sign-in for Banihal staff.'}
            </p>
          </div>

          <div className="login-brand-foot">
            <span className="login-brand-rule" aria-hidden="true" />
            <span>{isOrg ? 'Kerala service rules · Co-operative banking' : 'Multi-tenant HRMS · Payroll'}</span>
          </div>
        </aside>

        <main className="login-panel">
          <div className="login-panel-inner">
            <header className="login-header">
              <div className="login-logo-slot">
                {logoUrl ? (
                  <img src={logoUrl} alt={`${brandName} logo`} className="login-logo" />
                ) : (
                  <span className="login-logo-mark" aria-hidden="true">{initials}</span>
                )}
              </div>
              <h1 className="login-org-name">{brandName}</h1>
              <p className="login-org-subtitle">{resolvedSubtitle}</p>
            </header>

            {children}

            <p className="login-powered">
              Powered by <span>Banihal</span>
            </p>
          </div>
        </main>
      </div>
    </div>
  );
}
