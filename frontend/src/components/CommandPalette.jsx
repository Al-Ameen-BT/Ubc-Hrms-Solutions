import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api/client';

const SCREENS = [
  { label: 'Overview', to: '/' },
  { label: 'Employees', to: '/employees' },
  { label: 'Payroll', to: '/payroll' },
  { label: 'Users', to: '/users' },
  { label: 'Organisations', to: '/organisations' },
  { label: 'Government Orders', to: '/government-orders' },
  { label: 'KSR Rules', to: '/ksr-rules' },
  { label: 'Pay Scales', to: '/pay-scales' },
  { label: 'Posts & Cadres', to: '/posts' },
  { label: 'Leave', to: '/leave' },
  { label: 'Audit Log', to: '/audit' },
  { label: 'Settings', to: '/settings' },
  { label: 'My Account', to: '/account' },
];

export function CommandPalette() {
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
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  useEffect(() => {
    if (open) { setQuery(''); setActive(0); setTimeout(() => inputRef.current?.focus(), 30); }
  }, [open]);

  useEffect(() => {
    const q = query.trim().toLowerCase();
    const screenHits = SCREENS
      .filter((s) => !q || s.label.toLowerCase().includes(q))
      .map((s) => ({ group: 'Screens', label: s.label, action: () => navigate(s.to) }));

    if (!q) { setResults(screenHits); return; }

    let cancelled = false;
    api.get(`/employees?search=${encodeURIComponent(q)}&limit=5`)
      .then((data) => {
        if (cancelled) return;
        const people = (data.rows || []).map((e) => ({
          group: 'Employees', label: `${e.name} · ${e.code}`, action: () => navigate(`/employees/${e.id}`),
        }));
        setResults([...screenHits, ...people]);
      })
      .catch(() => setResults(screenHits));

    return () => { cancelled = true; };
  }, [query, navigate]);

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
