import React from 'react';
import { useLocation } from 'react-router-dom';

/**
 * Section eyebrow — names the functional group a screen belongs to, so the
 * page title below it reads in context. One quiet overline; the page header
 * carries the title itself.
 */
const SECTIONS = [
  ['/organisations', 'Platform'],
  ['/platform-users', 'Platform'],
  ['/platform-settings', 'Platform'],
  ['/employees', 'Establishment'],
  ['/posts', 'Establishment'],
  ['/pay-scales', 'Pay Structure'],
  ['/payroll', 'Payroll Cycle'],
  ['/leave', 'Leave'],
  ['/allowances', 'Payroll'],
  ['/arrears', 'Payroll'],
  ['/year-end', 'Finance'],
  ['/government-orders', 'Rules'],
  ['/ksr-rules', 'Rules'],
  ['/org-profile', 'Organisation'],
  ['/settings', 'Configuration'],
  ['/users', 'Access'],
  ['/audit', 'Compliance'],
  ['/account', 'Account'],
];

export function SectionLabel() {
  const { pathname } = useLocation();
  // Dashboards title themselves — an eyebrow there would just repeat the title.
  if (pathname === '/') return null;
  const match = SECTIONS.find(([path]) => pathname.startsWith(path));
  if (!match) return null;
  return <p className="section-label">{match[1]}</p>;
}
