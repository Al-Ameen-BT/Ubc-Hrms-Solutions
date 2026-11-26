import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api/client';
import { canVisitRoute } from '../api/organizationAccess';
import { useAuth } from '../auth/AuthContext';

const SCREENS = [
  { label: 'Organisation Overview', to: '/' },
  { label: 'Organisation Explorer', to: '/organisation-explorer' },
  { label: 'Employee Directory (People)', to: '/people' },
  { label: 'Organisation Structure', to: '/organisation-structure' },
  { label: 'Posts & Cadres', to: '/posts' },
  { label: 'Attendance', to: '/employee-services/time' },
  { label: 'Leave Management', to: '/leave' },
  { label: 'Holiday Calendar', to: '/employee-services/holidays' },
  { label: 'Payroll', to: '/payroll' },
  { label: 'Pay Scales', to: '/pay-scales' },
  { label: 'Pay Revisions', to: '/pay-revisions' },
  { label: 'Bank Class Adoption', to: '/catalogue-adoption' },
  { label: 'Allowances', to: '/allowances' },
  { label: 'Deductions & Slabs', to: '/deductions' },
  { label: 'Reimbursements', to: '/employee-services/expenses' },
  { label: 'DA Arrears', to: '/arrears' },
  { label: 'Year-End', to: '/year-end' },
  { label: 'Reports & Analytics', to: '/reports' },
  { label: 'Financial Changes', to: '/financial-changes' },
  { label: 'Policy Management', to: '/employee-services/policy' },
  { label: 'DPDP Compliance', to: '/dpdp-compliance' },
  { label: 'GO Register', to: '/government-orders' },
  { label: 'KSR Rules', to: '/ksr-rules' },
  { label: 'Audit Log', to: '/audit' },
  { label: 'Organisation Settings', to: '/settings' },
  { label: 'Payroll Settings', to: '/payroll-settings' },
  { label: 'Mandatory Fields', to: '/mandatory-fields' },
  { label: 'Roles & Permissions', to: '/roles-permissions' },
  { label: 'Organisations (Platform)', to: '/organisations' },
  { label: 'Bank Classes & Rules', to: '/bank-rules' },
  { label: 'DPDP Documents', to: '/dpdp-documents' },
  { label: 'Platform Settings', to: '/platform-settings' },
  { label: 'Notifications', to: '/notifications' },
  { label: 'My Payslips', to: '/my/payslips' },
  { label: 'My Leave', to: '/my/leave' },
  { label: 'My Calendar', to: '/my/calendar' },
  { label: 'Policies', to: '/my/policies' },
  { label: 'My Reimbursements', to: '/my/expenses' },
  { label: 'My Workplace', to: '/my/workplace' },
  { label: 'My Attendance', to: '/my/time' },
  { label: 'Privacy Requests', to: '/my/privacy' },
  { label: 'My Account & Profile', to: '/account' },
];

export function CommandPalette() {
  const { canPermission, isSuperAdmin } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const [results, setResults] = useState([]);
  const inputRef = useRef(null);

  useEffect(() => {
    const onKey = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setOpen((o) => !o);
      }
      if (e.key === 'Escape') setOpen(false);
    };
    const onOpenEvent = () => setOpen(true);
    window.addEventListener('keydown', onKey);
    window.addEventListener('ucb:open-command-palette', onOpenEvent);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('ucb:open-command-palette', onOpenEvent);
    };
  }, []);

  useEffect(() => {
    if (open) { setQuery(''); setActive(0); setTimeout(() => inputRef.current?.focus(), 30); }
  }, [open]);

  useEffect(() => {
    const q = query.trim().toLowerCase();
    const screenHits = SCREENS
      .filter(s => canVisitRoute(s.to, canPermission, isSuperAdmin))
      .filter((s) => !q || s.label.toLowerCase().includes(q))
      .map((s) => ({ group: 'Screens', label: s.label, action: () => navigate(s.to) }));

    if (!q || !canVisitRoute('/employees', canPermission, isSuperAdmin)) { setResults(screenHits); return; }

    let cancelled = false;
    api.get(`/employees?search=${encodeURIComponent(q)}&limit=5`)
      .then((data) => {
        if (cancelled) return;
        const people = (data.rows || []).map((e) => ({
          group: 'People', label: `${e.name} · ${e.code}`, action: () => navigate(`/employees/${e.id}`),
        }));
        setResults([...screenHits, ...people]);
      })
      .catch(() => setResults(screenHits));

    return () => { cancelled = true; };
  }, [query, navigate, canPermission, isSuperAdmin]);

  if (!open) return null;

  const grouped = results.reduce((acc, r) => {
    (acc[r.group] = acc[r.group] || []).push(r);
    return acc;
  }, {});

  const flat = results;

  const onKeyDown = (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive((a) => Math.min(a + 1, flat.length - 1)); }
    if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)); }
    if (e.key === 'Enter' && flat[active]) { flat[active].action(); setOpen(false); }
  };

  let idx = -1;

  return (
    <div className="palette-overlay" onClick={() => setOpen(false)}>
      <div className="palette" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Command palette">
        <input
          ref={inputRef}
          className="palette-input"
          placeholder="Search employees, screens…"
          value={query}
          onChange={(e) => { setQuery(e.target.value); setActive(0); }}
          onKeyDown={onKeyDown}
        />
        <div className="palette-results">
          {Object.entries(grouped).map(([group, items]) => (
            <div key={group} className="palette-group">
              <div className="palette-group-label">{group}</div>
              {items.map((item) => {
                idx += 1;
                const myIndex = idx;
                return (
                  <button
                    key={`${group}-${item.label}`}
                    className={`palette-item ${myIndex === active ? 'palette-item-active' : ''}`}
                    onMouseEnter={() => setActive(myIndex)}
                    onClick={() => { item.action(); setOpen(false); }}
                  >
                    {item.label}
                  </button>
                );
              })}
            </div>
          ))}
          {!flat.length && <div className="palette-empty">No results.</div>}
        </div>
        <div className="palette-footer">
          <span><kbd>↑</kbd><kbd>↓</kbd> navigate</span>
          <span><kbd>↵</kbd> open</span>
          <span><kbd>esc</kbd> close</span>
        </div>
      </div>
    </div>
  );
}
