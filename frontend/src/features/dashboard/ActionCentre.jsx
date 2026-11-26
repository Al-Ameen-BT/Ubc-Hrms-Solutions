import React, { useMemo, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { leaveApi } from '../../api/extended';
import { useAuth } from '../../auth/AuthContext';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { useToast } from '../../components/ui/Toast';
import { filterActions } from './dashboardModel';

const TABS = [
  ['all', 'All Tasks'],
  ['critical', 'Critical'],
  ['approvals', 'Approvals'],
  ['attendance', 'Attendance'],
  ['payroll', 'Payroll'],
  ['compliance', 'Compliance'],
  ['onboarding', 'Onboarding'],
];

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

function dueStatus(action) {
  if (!action.dueDate) return { label: 'Unscheduled', type: 'none' };
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
  if (action.dueDate < today) return { label: `Overdue (${action.dueDate})`, type: 'overdue' };
  if (action.dueDate === today) return { label: 'Due Today', type: 'today' };
  return { label: `Due ${action.dueDate}`, type: 'scheduled' };
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

function getInitials(name) {
  if (!name) return 'HR';
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function ActionControls({ action, canApproveLeave, deciding, onDecide, onOpen }) {
  if (action.quickAction === 'LEAVE_DECISION' && canApproveLeave && applicationId(action)) {
    return (
      <div className="action-card-decision-buttons">
        <Button size="sm" variant="primary" loading={deciding} onClick={() => onDecide(action, 'APPROVED')}>
          Approve
        </Button>
        <Button size="sm" variant="ghost" disabled={deciding} onClick={() => onDecide(action, 'REJECTED')}>
          Reject
        </Button>
      </div>
    );
  }
  return (
    <button type="button" className="action-card-btn-resolve" onClick={() => onOpen(action)}>
      <span>{action.actionLabel || 'Resolve issue'}</span>
      <span aria-hidden="true">→</span>
    </button>
  );
}

export function ActionCentre({ actions = [], filters = { tab: 'all' }, onFiltersChange, onNavigate, branches = [] }) {
  const { canPermission } = useAuth();
  const toast = useToast();
  const queryClient = useQueryClient();
  const [selected, setSelected] = useState(null);
  const [search, setSearch] = useState('');

  const canApproveLeave = canPermission('leave.approve', ['ORG_ADMIN', 'HR_ADMIN', 'HR_OFFICER', 'BRANCH_MANAGER']);
  const owners = useMemo(() => [...new Set(actions.map((row) => row.owner).filter(Boolean))].sort(), [actions]);

  const activeTab = filters.tab || 'all';
  const update = (key, value) => {
    if (onFiltersChange) {
      onFiltersChange({ ...filters, [key]: value });
    }
  };

  const visible = useMemo(() => {
    let result = filterActions(actions, filters).filter((action) => dueMatches(action, filters.due));
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      result = result.filter(
        (action) =>
          action.employeeName?.toLowerCase().includes(q) ||
          action.empCode?.toLowerCase().includes(q) ||
          action.problem?.toLowerCase().includes(q) ||
          action.departmentName?.toLowerCase().includes(q) ||
          action.owner?.toLowerCase().includes(q)
      );
    }
    return result;
  }, [actions, filters, search]);

  const criticalCount = useMemo(() => actions.filter((a) => a.priority === 'CRITICAL').length, [actions]);

  const decision = useMutation({
    mutationFn: ({ action, value }) => leaveApi.decideApplication(applicationId(action), { decision: value }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['org-command-centre'] });
      queryClient.invalidateQueries({ queryKey: ['branch-dashboard'] });
      setSelected(null);
      toast.add('Leave decision recorded successfully.', 'success');
    },
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
    if (onNavigate) onNavigate(dest);
  };

  return (
    <section id="action-centre" className="command-action-centre" aria-labelledby="action-centre-title">
      {/* Header */}
      <header className="action-centre-header">
        <div>
          <span className="action-centre-eyebrow">Operational Action Queue</span>
          <h2 id="action-centre-title">Action Centre</h2>
          <p>Prioritised tasks, pending approvals, attendance conflicts, and compliance blockers.</p>
        </div>
        <div className="action-centre-header-badges">
          {criticalCount > 0 ? (
            <Badge variant="danger">{criticalCount} Critical</Badge>
          ) : (
            <Badge variant="success">All Critical Clear</Badge>
          )}
          <Badge variant="default">{actions.length} Total in Queue</Badge>
        </div>
      </header>

      {/* Modern Minimal Category Tabs */}
      <div className="action-tabs-bar" role="tablist" aria-label="Action categories">
        {TABS.map(([key, label]) => {
          const tabCount = key === 'all' ? actions.length : filterActions(actions, { tab: key }).length;
          return (
            <button
              key={key}
              type="button"
              role="tab"
              aria-selected={activeTab === key}
              className={`action-tab-pill ${activeTab === key ? 'active' : ''}`}
              onClick={() => update('tab', key)}
            >
              <span>{label}</span>
              <span className="action-tab-count">{tabCount}</span>
            </button>
          );
        })}
      </div>

      {/* Filter and Quick Search Strip */}
      <div className="action-filter-strip">
        <div className="action-filter-group">
          <input
            type="search"
            className="action-search-input"
            placeholder="Search employee, ID, issue…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            aria-label="Filter action queue"
          />

          <select
            className="action-mini-select"
            value={filters.priority || ''}
            onChange={(e) => update('priority', e.target.value)}
            aria-label="Filter by priority"
          >
            <option value="">All Priorities</option>
            {PRIORITIES.map((val) => (
              <option key={val} value={val}>
                {val[0] + val.slice(1).toLowerCase()}
              </option>
            ))}
          </select>

          {owners.length > 1 && (
            <select
              className="action-mini-select"
              value={filters.owner || ''}
              onChange={(e) => update('owner', e.target.value)}
              aria-label="Filter by owner"
            >
              <option value="">All Owners</option>
              {owners.map((owner) => (
                <option key={owner} value={owner}>
                  {owner}
                </option>
              ))}
            </select>
          )}

          {branches.length > 1 && (
            <select
              className="action-mini-select"
              value={filters.branchId || ''}
              onChange={(e) => update('branchId', e.target.value)}
              aria-label="Filter by branch"
            >
              <option value="">All Branches</option>
              {branches.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
          )}
        </div>

        <div className="action-time-chips">
          {[
            ['', 'All Time'],
            ['overdue', 'Overdue'],
            ['today', 'Today'],
            ['scheduled', 'Upcoming'],
          ].map(([val, label]) => (
            <button
              key={val}
              type="button"
              className={`action-time-chip ${(filters.due || '') === val ? 'active' : ''}`}
              onClick={() => update('due', val)}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Cards Queue or Clean Empty State */}
      {!visible.length ? (
        <div className="action-empty-state">
          <div className="action-empty-icon" aria-hidden="true">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="20 6 9 17 4 12" />
            </svg>
          </div>
          <h3>Queue is completely clear</h3>
          <p>
            {actions.length
              ? 'No operational items match your active filters or search keyword.'
              : 'There are no pending approvals, attendance anomalies, or blockers requiring action.'}
          </p>
          {(actions.length > 0 || search) && (
            <Button
              variant="secondary"
              size="sm"
              style={{ marginTop: 12 }}
              onClick={() => {
                setSearch('');
                if (onFiltersChange) {
                  onFiltersChange({ tab: 'all', priority: '', owner: '', branchId: '', due: '' });
                }
              }}
            >
              Reset Queue Filters
            </Button>
          )}
        </div>
      ) : (
        <div className="action-cards-grid">
          {visible.map((action) => {
            const due = dueStatus(action);
            return (
              <article key={action.id} className={`action-minimal-card priority-${action.priority}`}>
                <div>
                  <div className="action-card-top">
                    <div className="action-card-person">
                      <div className="action-card-avatar" aria-hidden="true">
                        {getInitials(action.employeeName)}
                      </div>
                      <div className="action-card-name-group">
                        <h4 className="action-card-empname" title={action.employeeName}>
                          {action.employeeName}
                        </h4>
                        <span className="action-card-empcode">{action.empCode}</span>
                      </div>
                    </div>

                    <div className="action-card-badges">
                      <Badge variant={PRIORITY_VARIANT[action.priority]} size="sm">
                        {action.priority}
                      </Badge>
                      <Badge variant="default" size="sm">
                        {action.category}
                      </Badge>
                    </div>
                  </div>

                  <p className="action-card-problem">{action.problem}</p>

                  <div className="action-card-context-row">
                    <div className="action-card-context-left">
                      {action.departmentName && (
                        <span className="action-card-context-tag">{action.departmentName}</span>
                      )}
                      {action.branchName && (
                        <span className="action-card-context-tag">{action.branchName}</span>
                      )}
                    </div>
                    {due.type !== 'none' && (
                      <span className={`action-due-indicator due-${due.type}`}>{due.label}</span>
                    )}
                  </div>
                </div>

                <div className="action-card-actions">
                  <ActionControls
                    action={action}
                    canApproveLeave={canApproveLeave}
                    deciding={decision.isPending}
                    onDecide={decide}
                    onOpen={open}
                  />
                  <button
                    type="button"
                    className="action-card-btn-detail"
                    onClick={() => setSelected(action)}
                    aria-label={`View full details for ${action.employeeName}`}
                  >
                    Details
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      )}

      {/* Slide-out Action Drawer */}
      {selected && (
        <div
          className="command-drawer-backdrop"
          role="presentation"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setSelected(null);
          }}
        >
          <aside
            className="command-action-drawer"
            role="dialog"
            aria-modal="true"
            aria-labelledby="action-detail-title"
          >
            <header>
              <div>
                <span>{selected.category}</span>
                <h3 id="action-detail-title">{selected.employeeName}</h3>
                <p>
                  {selected.empCode} · {selected.branchName}
                </p>
              </div>
              <button type="button" onClick={() => setSelected(null)} aria-label="Close action details">
                ×
              </button>
            </header>

            <div>
              <div style={{ marginBottom: 16 }}>
                <Badge variant={PRIORITY_VARIANT[selected.priority]}>{selected.priority}</Badge>
              </div>
              <h4>What Needs Attention</h4>
              <p>{selected.problem}</p>

              <dl>
                <div>
                  <dt>Owner</dt>
                  <dd>{selected.owner || 'Branch Manager'}</dd>
                </div>
                <div>
                  <dt>Due Date</dt>
                  <dd>{selected.dueDate || 'Not scheduled'}</dd>
                </div>
                <div>
                  <dt>Department</dt>
                  <dd>{selected.departmentName || 'Not assigned'}</dd>
                </div>
                <div>
                  <dt>Branch Unit</dt>
                  <dd>{selected.branchName || 'Not assigned'}</dd>
                </div>
              </dl>

              <div style={{ marginTop: 24 }}>
                <ActionControls
                  action={selected}
                  canApproveLeave={canApproveLeave}
                  deciding={decision.isPending}
                  onDecide={decide}
                  onOpen={open}
                />
              </div>
            </div>
          </aside>
        </div>
      )}
    </section>
  );
}

export default ActionCentre;
