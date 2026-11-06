import React from 'react';
import { useAuth } from '../../auth/AuthContext';
import { version } from '../../../../package.json';

function initialsOf(name) {
  const words = String(name || '').trim().split(/\s+/).filter(Boolean);
  return words.length > 1 ? words.slice(0, 2).map((word) => word[0]).join('').toUpperCase() : (words[0] || 'HR').slice(0, 2).toUpperCase();
}

export function AuthShell({ subtitle, children }) {
  const { branding, orgCode } = useAuth();
  const isOrg = Boolean(orgCode);
  const platform = branding?.platform || {};
  const platformName = branding?.platformName || platform.platformName || 'UCB HRMS & Payroll';
  const orgName = branding?.shortName || branding?.name || branding?.organizationName;
  const brandName = isOrg ? orgName || 'Employee HRMS' : platformName;
  const logoUrl = isOrg ? branding?.logoUrl : branding?.logoUrl || platform.logoUrl;
  const platformWordmark = logoUrl && !logoUrl.endsWith('/alert.png') ? logoUrl : '/banihal-logo.png';

  return (
    <div className={`login-page login-page--${isOrg ? 'client' : 'platform'}`}>
      <div className="login-shell">
        <aside className="login-brand" aria-label={isOrg ? `${brandName} employee workspace` : 'Platform administration workspace'}>
          <div className="login-brand-top">
            {isOrg ? <span className="login-brand-mark">{logoUrl ? <img src={logoUrl} alt="" className="login-brand-logo-img" /> : initialsOf(brandName)}</span> : <img src="/alert.png" alt="" className="login-brand-platform-mark" />}
            <span className="login-brand-label">{brandName}</span>
          </div>
          <div className="login-brand-copy">
            <p className="login-brand-title">{isOrg ? <>A better day<br />starts here.</> : <>One view.<br />Every bank.</>}</p>
            <p className="login-brand-text">{isOrg ? 'Your payslips, leave and service records, together in your bank’s workspace.' : 'Manage banks, licensing and platform access from one place.'}</p>
          </div>
          <div className="login-illustration" aria-hidden="true" />
          <div className="login-brand-foot">{isOrg ? 'Your bank. Your workday.' : 'Built for the people behind every bank.'}</div>
        </aside>

        <main className="login-panel">
          <div className="login-panel-inner">
            <header className="login-header">
              {isOrg ? <div className="login-logo-slot">{logoUrl ? <img src={logoUrl} alt={`${brandName} logo`} className="login-logo" /> : <span className="login-logo-mark" aria-hidden="true">{initialsOf(brandName)}</span>}</div> : <img src={platformWordmark} alt={platformWordmark === '/banihal-logo.png' ? 'Banihal Technologies' : `${brandName} logo`} className="login-platform-wordmark" />}
              <h1 className="login-org-name">{isOrg ? 'Welcome back.' : 'Platform administration'}</h1>
              <p className="login-org-subtitle">{subtitle || (isOrg ? `Sign in to ${brandName} HRMS` : `Sign in to ${platformName}`)}</p>
            </header>
            {children}
            <div className="login-powered-wrap">
              <span className="app-version">Version {version}</span>
              {isOrg && <p className="login-powered"><span>Powered by</span><img src="/banihal-logo.png" alt="Banihal Technologies" className="login-powered-logo" /></p>}
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
