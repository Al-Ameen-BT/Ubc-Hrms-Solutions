import React, { useMemo, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { leaveApi } from '../../api/extended';
import { useAuth } from '../../auth/AuthContext';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { useToast } from '../../components/ui/Toast';
import { filterActions } from './dashboardModel';

const TABS = [['all', 'All'], ['critical', 'Critical'], ['attendance', 'Attendance'], ['payroll', 'Payroll'], ['compliance', 'Compliance'], ['onboarding', 'Onboarding'], ['approvals', 'Approvals']];
const PRIORITIES = ['CRITICAL', 'HIGH', 'MEDIUM', 'ROUTINE'];
const PRIORITY_VARIANT = { CRITICAL: 'danger', HIGH: 'warning', MEDIUM: 'info', ROUTINE: 'default' };

function applicationId(action) {
  const value = String(action.id || '').replace(/^leave-/, '');
  return /^\d+$/.test(value) ? Number(value) : null;
}

function destinationFor(action) {
  const destination = action.destination || '/people';
  if (destination.startsWith('#')) return destination;
  const [path, hash] = destination.split('#');
  const separator = path.includes('?') ? '&' : '?';
  const context = new URLSearchParams();
  if (action.employeeId) context.set('employeeId', action.employeeId);
  if (action.branchId) context.set('branchId', action.branchId);
  if (action.dueDate) context.set('date', action.dueDate);
  const query = context.size ? `${separator}${context}` : '';
  return `${path}${query}${hash ? `#${hash}` : ''}`;
}

function dueMatches(action, due) {
  if (!due) return true;
  if (!action.dueDate) return due === 'unscheduled';
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
  if (due === 'overdue') return action.dueDate < today;
  if (due === 'today') return action.dueDate === today;
  if (due === 'scheduled') return action.dueDate >= today;
  return true;
}

function ActionControls({ action, canApproveLeave, deciding, onDecide, onOpen }) {
  if (action.quickAction === 'LEAVE_DECISION' && canApproveLeave && applicationId(action)) return <div className="command-action-buttons"><Button size="sm" loading={deciding} onClick={() => onDecide(action, 'APPROVED')}>Approve</Button><Button size="sm" variant="secondary" disabled={deciding} onClick={() => onDecide(action, 'REJECTED')}>Reject</Button></div>;
  return <Button size="sm" variant="secondary" onClick={() => onOpen(action)}>{action.actionLabel || 'Open workflow'}</Button>;
}

export function ActionCentre({ actions = [], filters, onFiltersChange, onNavigate, branches = [] }) {
  const { canPermission } = useAuth();
  const toast = useToast();
  const queryClient = useQueryClient();
  const [selected, setSelected] = useState(null);
  const canApproveLeave = canPermission('leave.approve', ['ORG_ADMIN', 'HR_ADMIN', 'HR_OFFICER', 'BRANCH_MANAGER']);
  const owners = useMemo(() => [...new Set(actions.map((row) => row.owner).filter(Boolean))].sort(), [actions]);
  const visible = filterActions(actions, filters).filter((action) => dueMatches(action, filters.due));
  const update = (key, value) => onFiltersChange({ ...filters, [key]: value });
  const decision = useMutation({
    mutationFn: ({ action, value }) => leaveApi.decideApplication(applicationId(action), { decision: value }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['org-command-centre'] }); setSelected(null); toast.add('Leave decision recorded.', 'success'); },
    onError: (error) => toast.add(error.message || 'The leave decision was refused.', 'error'),
  });
  const decide = (action, value) => decision.mutate({ action, value });
  const open = (action) => {
    const dest = destinationFor(action);
    if (dest.startsWith('#')) {
      const el = document.querySelector(dest);
      if (el) el.scrollIntoView({ behavior: 'smooth' });
      return;
    }
    onNavigate(dest);
  };

  return <section id="action-centre" className="command-surface command-action-centre" aria-labelledby="action-centre-title">
    <header className="command-section-header"><div><h2 id="action-centre-title">Action Centre</h2><p>One prioritised queue for attendance, approvals, payroll, compliance and onboarding.</p></div><Badge variant={visible.some((row) => row.priority === 'CRITICAL') ? 'danger' : 'default'}>{visible.length} open</Badge></header>
    <div className="command-action-tabs" role="tablist" aria-label="Action categories">{TABS.map(([key, label]) => <button key={key} type="button" role="tab" aria-selected={filters.tab === key} onClick={() => update('tab', key)}>{label}<span>{key === 'all' ? actions.length : filterActions(actions, { tab: key }).length}</span></button>)}</div>
    <div className="command-action-filters">
      <label><span>Priority</span><select className="input" value={filters.priority || ''} onChange={(event) => update('priority', event.target.value)}><option value="">All priorities</option>{PRIORITIES.map((value) => <option key={value} value={value}>{value[0] + value.slice(1).toLowerCase()}</option>)}</select></label>
      <label><span>Owner</span><select className="input" value={filters.owner || ''} onChange={(event) => update('owner', event.target.value)}><option value="">All owners</option>{owners.map((value) => <option key={value} value={value}>{value}</option>)}</select></label>
      <label><span>Branch</span><select className="input" value={filters.branchId || ''} onChange={(event) => update('branchId', event.target.value)}><option value="">All branches</option>{branches.map((row) => <option key={row.id} value={row.id}>{row.name}</option>)}</select></label>
      <label><span>Due date</span><select className="input" value={filters.due || ''} onChange={(event) => update('due', event.target.value)}><option value="">Any date</option><option value="overdue">Overdue</option><option value="today">Due today</option><option value="scheduled">Upcoming</option><option value="unscheduled">Not scheduled</option></select></label>
    </div>
    {!visible.length ? <div className="command-empty"><strong>All clear for this queue</strong><span>{actions.length ? 'No items match the selected Action Centre filters.' : 'No HR actions need attention in the selected organisational scope.'}</span>{actions.length ? <Button variant="secondary" size="sm" onClick={() => onFiltersChange({ tab: 'all', priority: '', owner: '', branchId: '', due: '' })}>Clear queue filters</Button> : null}</div> : <>
      <div className="command-table-wrap"><table className="command-table command-action-table"><thead><tr><th>Priority</th><th>Employee</th><th>Context</th><th>Category</th><th>Problem</th><th>Due</th><th>Owner</th><th>Action</th></tr></thead><tbody>{visible.map((action) => <tr key={action.id}><td><Badge variant={PRIORITY_VARIANT[action.priority]}>{action.priority}</Badge></td><td><button type="button" className="command-table-link" onClick={() => setSelected(action)}><strong>{action.employeeName}</strong><span>{action.empCode}</span></button></td><td>{action.branchName}<span className="command-cell-subtext">{action.departmentName}</span></td><td>{action.category}</td><td className="command-problem-cell">{action.problem}</td><td>{action.dueDate || 'Not scheduled'}</td><td>{action.owner}</td><td><ActionControls action={action} canApproveLeave={canApproveLeave} deciding={decision.isPending} onDecide={decide} onOpen={open} /></td></tr>)}</tbody></table></div>
      <div className="command-action-cards">{visible.map((action) => <article key={action.id}><header><Badge variant={PRIORITY_VARIANT[action.priority]}>{action.priority}</Badge><span>{action.category}</span></header><button type="button" onClick={() => setSelected(action)}><strong>{action.employeeName}</strong><small>{action.empCode} · {action.branchName}</small></button><p>{action.problem}</p><dl><div><dt>Owner</dt><dd>{action.owner}</dd></div><div><dt>Due</dt><dd>{action.dueDate || 'Not scheduled'}</dd></div></dl><ActionControls action={action} canApproveLeave={canApproveLeave} deciding={decision.isPending} onDecide={decide} onOpen={open} /></article>)}</div>
    </>}
    {selected ? <div className="command-drawer-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setSelected(null); }}><aside className="command-action-drawer" role="dialog" aria-modal="true" aria-labelledby="action-detail-title"><header><div><span>{selected.category}</span><h3 id="action-detail-title">{selected.employeeName}</h3><p>{selected.empCode} · {selected.branchName}</p></div><button type="button" onClick={() => setSelected(null)} aria-label="Close action details">×</button></header><div><Badge variant={PRIORITY_VARIANT[selected.priority]}>{selected.priority}</Badge><h4>What needs attention</h4><p>{selected.problem}</p><dl><div><dt>Owner</dt><dd>{selected.owner}</dd></div><div><dt>Due date</dt><dd>{selected.dueDate || 'Not scheduled'}</dd></div><div><dt>Department</dt><dd>{selected.departmentName || 'Not assigned'}</dd></div></dl><ActionControls action={selected} canApproveLeave={canApproveLeave} deciding={decision.isPending} onDecide={decide} onOpen={open} /></div></aside></div> : null}
  </section>;
}

export default ActionCentre;
