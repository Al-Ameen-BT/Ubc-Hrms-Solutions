import React, { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { usersApi } from '../../api/client';
import { organizationAccessApi as accessApi, canManageCustomRoles, scopeLabel, canVisitRoute } from '../../api/organizationAccess';
import { useAuth } from '../../auth/AuthContext';
import { Card } from '../../components/ui/Card';
import { Table } from '../../components/ui/Table';
import { Input } from '../../components/ui/Input';
import { Button } from '../../components/ui/Button';
import { Badge } from '../../components/ui/Badge';
import { Modal } from '../../components/ui/Modal';
import { ConfirmationModal } from '../../components/ui/ConfirmationModal';
import { useToast } from '../../components/ui/Toast';
import './RolesPermissionsPage.css';

const IMPACT_COPY = 'Browser users must sign in again. QR-only mobile users must relink their phone from the self-service portal: My Account → Linked devices.';
const rows = data => data?.rows || [];
const title = value => (value || '').replace(/_/g, ' ').replace(/([a-z])([A-Z])/g, '$1 $2');
const dateToday = () => new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
const scopeNames = { OWN: 'Own record', DEPARTMENT: 'Department', SELECTED_BRANCHES: 'Selected branches (one or more)', ORGANISATION: 'Entire organisation' };

function categorizeBlockers(blockers = [], bootstrapUserId, users = []) {
  const categories = {
    roles: {
      id: 'roles',
      title: 'Protected System Roles & Baselines',
      icon: '🛡️',
      description: 'System roles, baseline permissions, and administrative access assignments',
      items: [],
      canAutoFix: true,
    },
    identity: {
      id: 'identity',
      title: 'Admin Identity & Employee Profiles',
      icon: '👤',
      description: 'Account mapping to active employee profiles for audit compliance',
      items: [],
      canAutoFix: false,
    },
    branch: {
      id: 'branch',
      title: 'Branch & Organisation Structure',
      icon: '🏢',
      description: 'Branch placement and Head Office structure configuration',
      items: [],
      canAutoFix: false,
    },
    other: {
      id: 'other',
      title: 'Operational Readiness',
      icon: '⚙️',
      description: 'Pending workflow or transaction preconditions',
      items: [],
      canAutoFix: false,
    }
  };

  blockers.forEach((b, idx) => {
    const user = b.userId ? users.find(u => String(u.id) === String(b.userId)) : null;
    const name = user?.name || (b.userId ? `User #${b.userId}` : '');

    if (b.reason === 'BOOTSTRAP_ADMIN_LINK_REQUIRED' || b.reason === 'BOOTSTRAP_ADMIN_UNLINKED') {
      categories.identity.items.push({
        id: `ident-${idx}`,
        title: 'Bootstrap Administrator Unlinked',
        desc: `Administrator account ${name || 'MCUBadmin'} must be linked to an active employee profile for auditability.`,
        actionLabel: 'Link Employee Profile',
        actionLink: '/people?view=access',
      });
    } else if (b.reason === 'UNMAPPED_BRANCH') {
      categories.branch.items.push({
        id: `branch-${idx}`,
        title: `Unmapped Branch · ${b.employeeId ? `Employee #${b.employeeId}` : name || 'Employee'}`,
        desc: 'Employee is missing a designated branch or head-office assignment in organisation structure.',
        actionLabel: 'Assign Branch',
        actionLink: b.employeeId ? `/people?employeeId=${b.employeeId}` : '/people?view=access',
      });
    } else if (b.reason === 'EXACTLY_ONE_HEAD_OFFICE_REQUIRED') {
      categories.branch.items.push({
        id: `ho-${idx}`,
        title: 'Designate Exactly One Head Office',
        desc: 'Your organisation structure must have exactly one branch designated as Head Office.',
        actionLabel: 'Configure Structure',
        actionLink: '/organisation-structure',
      });
    } else if (['PROTECTED_ROLES_REQUIRED', 'PROTECTED_PERMISSIONS_REQUIRED', 'OWN_BASELINE_REQUIRED', 'LEGACY_ROLE_ASSIGNMENT_REQUIRED', 'LEGACY_ROLE_SCOPE_REQUIRED', 'ORG_ADMIN_ASSIGNMENT_REQUIRED'].includes(b.reason)) {
      const friendlyTitle = {
        PROTECTED_ROLES_REQUIRED: 'Missing Protected Role Templates',
        PROTECTED_PERMISSIONS_REQUIRED: 'Missing Protected Permissions',
        OWN_BASELINE_REQUIRED: `Own-Record Baseline Required · ${name || 'All Employees'}`,
        LEGACY_ROLE_ASSIGNMENT_REQUIRED: `Role Assignment Required · ${name || 'User'}`,
        LEGACY_ROLE_SCOPE_REQUIRED: `Role Scope Required · ${name || 'User'}`,
        ORG_ADMIN_ASSIGNMENT_REQUIRED: 'Organisation Admin Assignment Required',
      }[b.reason] || title(b.reason);

      const friendlyDesc = {
        PROTECTED_ROLES_REQUIRED: 'Protected banking roles (Organisation Admin, Branch Manager, etc.) need to be provisioned.',
        PROTECTED_PERMISSIONS_REQUIRED: 'Standard permission baselines for protected templates must be seeded.',
        OWN_BASELINE_REQUIRED: 'Active employee accounts need their standard self-service baseline role.',
        LEGACY_ROLE_ASSIGNMENT_REQUIRED: `User ${name || 'account'} requires their initial role assignment.`,
        LEGACY_ROLE_SCOPE_REQUIRED: `User ${name || 'account'} requires their branch or department scope assigned.`,
        ORG_ADMIN_ASSIGNMENT_REQUIRED: 'At least one active Organisation Admin role assignment is required.',
      }[b.reason] || 'Standard baseline configuration required.';

      categories.roles.items.push({
        id: `role-${idx}`,
        title: friendlyTitle,
        desc: friendlyDesc,
        isAutoFixable: true,
      });
    } else {
      categories.other.items.push({
        id: `other-${idx}`,
        title: title(b.reason) + (name ? ` · ${name}` : '') + (b.employeeId ? ` · Employee #${b.employeeId}` : '') + (b.count ? ` · ${b.count} records` : ''),
        desc: 'Operational precondition must be addressed before permission mode can be activated.',
        actionLabel: b.reason?.includes('LEAVE') ? 'Review Leaves' : b.reason?.includes('ARREARS') ? 'Review Arrears' : null,
        actionLink: b.reason?.includes('LEAVE') ? '/leave' : b.reason?.includes('ARREARS') ? '/arrears' : null,
      });
    }
  });

  return Object.values(categories).filter(c => c.items.length > 0);
}

export function RolesPermissionsPage() {
  const { user, canPermission } = useAuth();
  const client = useQueryClient();
  const toast = useToast();
  const [params, setParams] = useSearchParams();
  const [activeTab, setActiveTab] = useState(params.get('tab') || 'readiness');
  const [selectedRoleId, setSelectedRoleId] = useState('');
  const [copying, setCopying] = useState(false);
  const [search, setSearch] = useState('');
  const [assignment, setAssignment] = useState(null);
  const [confirm, setConfirm] = useState(null);
  const [activationOpen, setActivationOpen] = useState(false);
  const [activationText, setActivationText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const allowed = canPermission('roles.manage');
  const selectedUserId = params.get('userId') || '';
  const readinessQuery = useQuery({ queryKey: ['access-readiness'], queryFn: accessApi.readiness, enabled: allowed });
  const rolesQuery = useQuery({ queryKey: ['organization-roles'], queryFn: accessApi.roles, enabled: allowed });
  const catalogueQuery = useQuery({ queryKey: ['permission-catalogue'], queryFn: accessApi.catalogue, enabled: allowed });
  const usersQuery = useQuery({ queryKey: ['users', user?.organizationId], queryFn: () => usersApi.list(user.organizationId), enabled: allowed });
  const assignmentsQuery = useQuery({ queryKey: ['role-assignments'], queryFn: () => accessApi.assignments(), enabled: allowed });
  const branchesQuery = useQuery({ queryKey: ['access-branches'], queryFn: accessApi.branches, enabled: allowed });
  const departmentsQuery = useQuery({ queryKey: ['access-departments'], queryFn: accessApi.departments, enabled: allowed });

  const readiness = readinessQuery.data;
  const customEnabled = allowed && canManageCustomRoles(readiness);
  const roles = rows(rolesQuery.data);
  const assignments = rows(assignmentsQuery.data);
  const users = rows(usersQuery.data);
  const branches = rows(branchesQuery.data);
  const departments = rows(departmentsQuery.data);
  const selectedRole = roles.find(role => String(role.id) === selectedRoleId) || roles[0];
  const selectedUser = users.find(account => String(account.id) === selectedUserId);

  const previewQuery = useQuery({ queryKey: ['access-preview', selectedUserId], queryFn: () => accessApi.preview(selectedUserId), enabled: allowed && !!selectedUser });
  const previewMenus = [['People', '/people'], ['Payroll', '/payroll'], ['DA Arrears', '/arrears'], ['Financial changes', '/financial-changes'], ['Roles & Permissions', '/roles-permissions'], ['Settings', '/settings'], ['My payslips', '/my/payslips'], ['My leave', '/my/leave'], ['My time', '/my/time'], ['My policies', '/my/policies'], ['My reimbursements', '/my/expenses']].filter(([, path]) => canVisitRoute(path, code => previewQuery.data?.permissionCodes.includes(code)));
  const roleById = id => roles.find(role => String(role.id) === String(id));
  const userName = id => users.find(account => String(account.id) === String(id))?.name || `User #${id}`;
  const coreQueries = [readinessQuery, rolesQuery, catalogueQuery];
  const coreLoadError = coreQueries.find(query => query.error)?.error;

  const refresh = () => Promise.all(['access-readiness', 'organization-roles', 'role-assignments', 'access-preview', 'users'].map(key => client.invalidateQueries({ queryKey: [key] })));

  async function apply(work, message) {
    setBusy(true); setError('');
    try {
      await work();
      setConfirm(null);
      setAssignment(null);
      setCopying(false);
      toast.add(message, 'success');
      await refresh();
    } catch (failure) {
      setError(failure.message);
    } finally {
      setBusy(false);
    }
  }

  async function handleAutoBootstrap() {
    setBusy(true); setError('');
    try {
      const res = await accessApi.bootstrap();
      toast.add(`Protected system roles & baseline assignments provisioned (${res?.rolesCreated || 0} roles, ${res?.assignmentsCreated || 0} assignments).`, 'success');
      await refresh();
    } catch (failure) {
      setError(failure.message || 'Auto-provisioning failed.');
    } finally {
      setBusy(false);
    }
  }

  async function previewRoleChange(role, work, label) {
    setBusy(true); setError('');
    try {
      const impact = await accessApi.impact(role.id);
      setConfirm({ title: label, itemName: role.name, impact, work, details: { 'Affected users': impact.userIds.map(userName).join(', ') || 'None', 'Active assignments': impact.affectedUserCount } });
    } catch (failure) {
      setError(failure.message);
    } finally {
      setBusy(false);
    }
  }

  async function activate() {
    if (activationText !== 'ACTIVATE' || !readiness?.ready || readiness.accessControlMode !== 'LEGACY') return;
    setBusy(true); setError('');
    try {
      await accessApi.activate();
      window.dispatchEvent(new CustomEvent('ucb:logout', { detail: { message: `Permission mode is active. ${IMPACT_COPY}`, kind: 'warn' } }));
    } catch (failure) {
      setError(failure.message);
      await readinessQuery.refetch();
    } finally {
      setBusy(false);
    }
  }

  if (!allowed) return <div className="page"><h1>Access unavailable</h1><Link to="/account">Go to My Account</Link></div>;

  const categorizedBlockers = categorizeBlockers(readiness?.blockers || [], readiness?.bootstrapUserId, users);
  const hasAutoFixableBlockers = categorizedBlockers.some(c => c.canAutoFix && c.items.length > 0) || !roles.length;

  return (
    <div className="page roles-page">
      <header className="page-header">
        <div className="page-header-row">
          <div>
            <h1>Roles &amp; Permissions</h1>
            <p>Manage bank responsibilities, record access boundaries, and role assignments.</p>
          </div>
          <div className="page-header-actions">
            <Link to="/audit" className="btn btn-secondary btn-sm">📋 View Audit Log</Link>
          </div>
        </div>
      </header>

      {/* Navigation Tabs */}
      <nav className="roles-nav-tabs" aria-label="Roles navigation">
        <button
          type="button"
          className={`btn btn-sm ${activeTab === 'readiness' ? 'btn-primary' : 'btn-secondary'}`}
          onClick={() => { setActiveTab('readiness'); setParams({ tab: 'readiness' }); }}
        >
          🛡️ Access Readiness &amp; Migration
          {readiness && !readiness.ready && (
            <Badge variant="warning" style={{ marginLeft: '0.5rem' }}>{readiness.blockers?.length || '!'}</Badge>
          )}
        </button>
        <button
          type="button"
          className={`btn btn-sm ${activeTab === 'assignments' ? 'btn-primary' : 'btn-secondary'}`}
          onClick={() => { setActiveTab('assignments'); setParams({ tab: 'assignments' }); }}
        >
          👥 User Role Assignments
        </button>
        <button
          type="button"
          className={`btn btn-sm ${activeTab === 'roles' ? 'btn-primary' : 'btn-secondary'}`}
          onClick={() => { setActiveTab('roles'); setParams({ tab: 'roles' }); }}
        >
          📑 Role Templates &amp; Matrix
          <Badge variant="secondary" style={{ marginLeft: '0.5rem' }}>{roles.length}</Badge>
        </button>
      </nav>

      {(error || coreLoadError) && (
        <div className="auth-error" role="alert">
          {error || coreLoadError.message}{' '}
          <Button size="sm" variant="secondary" onClick={() => { setError(''); coreQueries.forEach(query => query.refetch()); }}>
            Retry loading
          </Button>
        </div>
      )}

      {coreQueries.some(query => query.isLoading) && <p role="status">Loading access configuration…</p>}

      {/* TAB 1: ACCESS READINESS & MIGRATION */}
      {activeTab === 'readiness' && (
        <div className="roles-tab-readiness">
          <Card>
            <div className="roles-hero-status">
              <div className="roles-hero-header">
                <div>
                  <div className="roles-hero-badges">
                    <Badge variant={readiness?.accessControlMode === 'PERMISSIONS' ? 'success' : 'warning'}>
                      {readiness?.accessControlMode === 'PERMISSIONS' ? 'PERMISSIONS (Active)' : 'LEGACY MODE'}
                    </Badge>
                    {readiness && (
                      <Badge variant={readiness.ready ? 'success' : 'warning'}>
                        {readiness.ready ? 'Ready to Activate' : `${readiness.blockers?.length || 0} Blockers Pending`}
                      </Badge>
                    )}
                  </div>
                  <h2 className="roles-hero-title">
                    {readiness?.accessControlMode === 'PERMISSIONS'
                      ? 'Permission Mode is Active'
                      : readiness?.ready
                      ? 'Access Configuration Ready for Activation'
                      : 'Access Readiness & Migration Blockers'}
                  </h2>
                  <p className="roles-hero-desc">
                    {readiness?.accessControlMode === 'PERMISSIONS'
                      ? 'Granular role-based access control is actively enforced across all bank modules. Activation cannot be reversed through this interface.'
                      : 'Resolve the server-reported prerequisites below to activate permanent role-based permission mode. Server security checks remain authoritative at all times.'}
                  </p>
                </div>
                <div className="roles-hero-actions">
                  {hasAutoFixableBlockers && (
                    <Button variant="primary" size="sm" loading={busy} onClick={handleAutoBootstrap}>
                      ⚡ Auto-Provision Roles &amp; Baselines
                    </Button>
                  )}
                  <Button size="sm" variant="secondary" loading={readinessQuery.isFetching} onClick={() => readinessQuery.refetch()}>
                    🔄 Check Readiness
                  </Button>
                  <Link to="/people?view=access" className="btn btn-secondary btn-sm">
                    👤 Manage Account Links
                  </Link>
                </div>
              </div>

              {/* Categorized Blockers List */}
              {categorizedBlockers.length > 0 ? (
                <div className="roles-blockers-container">
                  {categorizedBlockers.map(category => (
                    <div key={category.id} className="roles-blocker-category">
                      <div className="roles-blocker-category-header">
                        <div className="roles-blocker-category-title">
                          <span>{category.icon}</span>
                          <span>{category.title}</span>
                          <Badge variant="warning">{category.items.length}</Badge>
                        </div>
                        {category.canAutoFix && (
                          <Button size="sm" variant="secondary" loading={busy} onClick={handleAutoBootstrap}>
                            ⚡ Auto-Provision
                          </Button>
                        )}
                      </div>
                      <div className="roles-blocker-items">
                        {category.items.map(item => (
                          <div key={item.id} className="roles-blocker-item">
                            <div className="roles-blocker-item-main">
                              <div className="roles-blocker-item-icon">⚠️</div>
                              <div>
                                <div className="roles-blocker-item-title">{item.title}</div>
                                <div className="roles-blocker-item-desc">{item.desc}</div>
                              </div>
                            </div>
                            <div className="roles-blocker-item-action">
                              {item.actionLink ? (
                                <Link to={item.actionLink} className="btn btn-secondary btn-sm">
                                  {item.actionLabel || 'Resolve'} →
                                </Link>
                              ) : item.isAutoFixable ? (
                                <Button size="sm" variant="secondary" loading={busy} onClick={handleAutoBootstrap}>
                                  Auto-Fix
                                </Button>
                              ) : null}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              ) : readiness?.ready ? (
                <div className="roles-activation-container is-ready">
                  <div className="roles-activation-info">
                    <h3 className="roles-activation-title">✅ All Readiness Requirements Satisfied</h3>
                    <p className="roles-activation-desc">
                      Your organisation structure, protected role templates, baseline assignments, and employee identity links have all passed authoritative verification.
                    </p>
                  </div>
                </div>
              ) : null}

              {/* Activation Trigger Box */}
              {readiness?.accessControlMode === 'LEGACY' && (
                <div className={`roles-activation-container ${readiness.ready ? 'is-ready' : ''}`}>
                  <div className="roles-activation-info">
                    <h3 className="roles-activation-title">
                      {readiness.ready ? 'Activate Permission Mode Permanently' : 'Permission Mode Activation (Locked)'}
                    </h3>
                    <p className="roles-activation-desc">
                      {readiness.ready
                        ? 'This one-way action permanently enables assignment-based permissions for all employees and administrators. Active browser sessions will end and mobile devices must relink.'
                        : 'Resolve all pending blockers listed above before permission mode can be activated.'}
                    </p>
                  </div>
                  <div>
                    <Button
                      variant={readiness.ready ? 'danger' : 'secondary'}
                      disabled={!readiness.ready || busy || !!readinessQuery.error}
                      onClick={() => { setError(''); setActivationText(''); setActivationOpen(true); }}
                    >
                      Activate Permission Mode
                    </Button>
                  </div>
                </div>
              )}
            </div>
          </Card>
        </div>
      )}

      {/* TAB 2: USER ROLE ASSIGNMENTS */}
      {activeTab === 'assignments' && (
        <div className="roles-tab-assignments">
          <Card
            title="User Role Assignments"
            actions={
              <Link className="btn btn-secondary btn-sm" to="/people?view=access">
                👤 Manage Account &amp; Employee Links
              </Link>
            }
          >
            {usersQuery.error && (
              <div className="auth-error" role="alert">
                User lookup is unavailable. Viewing accounts requires users.manage.{' '}
                <Button size="sm" variant="secondary" onClick={() => usersQuery.refetch()}>Retry user lookup</Button>
              </div>
            )}
            {assignmentsQuery.error && (
              <div className="auth-error" role="alert">
                Role assignments are unavailable. Assignment changes are disabled until they can be loaded.{' '}
                <Button size="sm" variant="secondary" onClick={() => assignmentsQuery.refetch()}>Retry assignments</Button>
              </div>
            )}
            {branchesQuery.error && (
              <div className="auth-error" role="alert">
                Branch scopes are unavailable. Branch scoped assignment changes are disabled.{' '}
                <Button size="sm" variant="secondary" onClick={() => branchesQuery.refetch()}>Retry branches</Button>
              </div>
            )}
            {departmentsQuery.error && (
              <div className="auth-error" role="alert">
                Department scopes are unavailable. Department scoped assignment changes are disabled.{' '}
                <Button size="sm" variant="secondary" onClick={() => departmentsQuery.refetch()}>Retry departments</Button>
              </div>
            )}

            <div className="roles-user-picker">
              <Input
                id="roles-user-search"
                label="Find a bank user"
                type="search"
                value={search}
                onChange={event => setSearch(event.target.value)}
                placeholder="Search by name or email"
              />
              <div className="field">
                <label className="field-label" htmlFor="roles-user">Select Account</label>
                <select
                  className="input"
                  id="roles-user"
                  disabled={!!usersQuery.error}
                  value={selectedUserId}
                  onChange={event => {
                    setParams({ tab: 'assignments', ...(event.target.value ? { userId: event.target.value } : {}) });
                    setAssignment(null);
                    setError('');
                  }}
                >
                  <option value="">Choose a bank user</option>
                  {users
                    .filter(account => String(account.id) === selectedUserId || `${account.name} ${account.email}`.toLowerCase().includes(search.toLowerCase()))
                    .map(account => (
                      <option key={account.id} value={account.id}>
                        {account.name} ({account.email})
                      </option>
                    ))}
                </select>
              </div>
            </div>

            {selectedUser ? (
              <>
                <div className="roles-user-hero">
                  <div className="roles-user-avatar">
                    {selectedUser.name ? selectedUser.name.charAt(0).toUpperCase() : 'U'}
                  </div>
                  <div style={{ flex: 1 }}>
                    <div className="roles-user-info-name">{selectedUser.name}</div>
                    <div className="roles-user-info-meta">
                      <span>{selectedUser.email}</span>
                      <span>•</span>
                      {selectedUser.employeeId ? (
                        <Badge variant="success">Linked Employee #{selectedUser.employeeId}</Badge>
                      ) : (
                        <Badge variant="warning">Unlinked Admin Account</Badge>
                      )}
                    </div>
                  </div>
                  <div>
                    <Button
                      variant="primary"
                      size="sm"
                      disabled={busy || !!assignmentsQuery.error || String(selectedUser.id) === String(user.id)}
                      onClick={() => {
                        setError('');
                        setAssignment({
                          roleId: roles.find(r => r.status === 'ACTIVE')?.id || '',
                          scopeType: 'ORGANISATION',
                          branchIds: [],
                          departmentIds: [],
                          effectiveFrom: dateToday(),
                          effectiveTo: '',
                          status: 'ACTIVE'
                        });
                      }}
                    >
                      + Add Role Assignment
                    </Button>
                  </div>
                </div>

                {!selectedUser.employeeId && (
                  <p className="auth-notice">
                    This account has no employee link. Only the protected bootstrap Organisation Admin can remain unlinked. Operational assignments require an active employee in this bank.
                  </p>
                )}

                {String(selectedUser.id) === String(user.id) && (
                  <p className="form-note">
                    Another Organisation Admin must change your assignments. Self-escalation and self-editing are blocked by server security guardrails.
                  </p>
                )}

                <Table
                  keyField="id"
                  data={assignments.filter(row => String(row.userId) === selectedUserId)}
                  emptyMessage="No assignments recorded for this user."
                  columns={[
                    {
                      field: 'roleId',
                      label: 'Role',
                      render: row => {
                        const r = roleById(row.roleId);
                        return (
                          <div>
                            <strong>{r?.name || `Role #${row.roleId}`}</strong>
                            {r?.isProtected && <div className="text-muted" style={{ fontSize: '0.75rem' }}>Protected Template</div>}
                          </div>
                        );
                      }
                    },
                    {
                      field: 'scopeType',
                      label: 'Scope & Data Boundary',
                      render: row => (
                        <>
                          <Badge variant={row.scopeType === 'ORGANISATION' ? 'primary' : row.scopeType === 'OWN' ? 'secondary' : 'warning'}>
                            {title(row.scopeType)}
                          </Badge>
                          <div className="text-muted" style={{ fontSize: '0.8125rem', marginTop: '0.25rem' }}>
                            {scopeLabel(row, branches, departments)}
                          </div>
                        </>
                      )
                    },
                    {
                      field: 'effectiveFrom',
                      label: 'Effective Dates',
                      render: row => `${row.effectiveFrom} — ${row.effectiveTo || 'Open-ended'}`
                    },
                    {
                      field: 'status',
                      label: 'Status',
                      render: row => <Badge variant={row.status === 'ACTIVE' ? 'success' : 'secondary'}>{row.status}</Badge>
                    },
                    {
                      field: 'actions',
                      label: 'Actions',
                      sortable: false,
                      render: row => {
                        const role = roleById(row.roleId);
                        const protectedBaseline = role?.isProtected && role.templateCode === 'EMPLOYEE' && !!selectedUser.employeeId;
                        const scopeUnavailable = (row.scopeType === 'SELECTED_BRANCHES' && branchesQuery.error) || (row.scopeType === 'DEPARTMENT' && departmentsQuery.error);
                        const disabled = busy || !!assignmentsQuery.error || String(selectedUser.id) === String(user.id) || protectedBaseline || !role || (!role.isProtected && !customEnabled);

                        return protectedBaseline ? (
                          <span className="text-muted" style={{ fontSize: '0.8125rem' }}>Protected own-record baseline</span>
                        ) : (
                          <div className="row-actions">
                            <Button variant="secondary" size="sm" disabled={disabled || !!scopeUnavailable} onClick={() => { setAssignment({ ...row }); setError(''); }}>
                              Edit
                            </Button>
                            {row.status === 'ACTIVE' && (
                              <Button
                                variant="secondary"
                                size="sm"
                                disabled={disabled}
                                onClick={() => {
                                  setError('');
                                  setConfirm({
                                    title: 'End role assignment',
                                    itemName: role?.name,
                                    details: { User: selectedUser.name, Scope: scopeLabel(row, branches, departments) },
                                    work: () => accessApi.endAssignment(row.id)
                                  });
                                }}
                              >
                                End assignment
                              </Button>
                            )}
                          </div>
                        );
                      }
                    },
                  ]}
                />

                {assignment && (
                  <AssignmentEditor
                    value={assignment}
                    onChange={setAssignment}
                    roles={roles.filter(role => role.status === 'ACTIVE' && (role.isProtected || customEnabled))}
                    branches={branches.filter(row => row.status === 'ACTIVE')}
                    departments={departments.filter(row => row.status === 'ACTIVE')}
                    branchesError={branchesQuery.error}
                    departmentsError={departmentsQuery.error}
                    busy={busy || !!assignmentsQuery.error}
                    onCancel={() => setAssignment(null)}
                    onSave={body => {
                      setError('');
                      setConfirm({
                        title: assignment.id ? 'Update role assignment' : 'Create role assignment',
                        itemName: selectedUser.name,
                        details: { Role: roleById(body.roleId)?.name, Scope: scopeLabel(body, branches, departments) },
                        work: () => assignment.id ? accessApi.updateAssignment(assignment.id, body) : accessApi.createAssignment({ ...body, userId: selectedUser.id })
                      });
                    }}
                  />
                )}

                {/* Effective Access Preview Box */}
                <Card title={`Effective Access Preview · ${selectedUser.name}`}>
                  {previewQuery.isLoading && <p role="status">Calculating effective access…</p>}
                  {previewQuery.error && (
                    <div className="auth-error" role="alert">
                      {previewQuery.error.message}{' '}
                      <Button variant="secondary" size="sm" onClick={() => previewQuery.refetch()}>Retry preview</Button>
                    </div>
                  )}
                  {previewQuery.data && (
                    <>
                      <p>
                        Server-calculated access in <strong>{previewQuery.data.accessControlMode}</strong> mode. This preview explains current access based on active assignments.
                      </p>
                      <dl className="roles-access-summary">
                        <dt>Own record</dt>
                        <dd>{previewQuery.data.scopeSummary?.own ? 'Included' : 'Unavailable'}</dd>
                        <dt>Organisation scope</dt>
                        <dd>{previewQuery.data.scopeSummary?.organization ? 'Included' : 'Not granted'}</dd>
                        <dt>Branches</dt>
                        <dd>{scopeLabel({ scopeType: 'SELECTED_BRANCHES', branchIds: previewQuery.data.scopeSummary?.branchIds }, branches) || 'None'}</dd>
                        <dt>Departments</dt>
                        <dd>{scopeLabel({ scopeType: 'DEPARTMENT', departmentIds: previewQuery.data.scopeSummary?.departmentIds }, branches, departments) || 'None'}</dd>
                      </dl>
                      {previewQuery.data.accessControlMode === 'PERMISSIONS' && (
                        <p>
                          <strong>Available menus:</strong>{' '}
                          {previewMenus.map(([label]) => label).join(', ') || 'My Account only'}
                        </p>
                      )}
                      <p>Role sources and dates appear in the assignments table above.</p>
                      <div className="roles-permission-codes">
                        {previewQuery.data.permissionCodes.length ? (
                          previewQuery.data.permissionCodes.map(code => <span key={code}>{code}</span>)
                        ) : (
                          <p>No effective permissions.</p>
                        )}
                      </div>
                      <p className="form-note">
                        Protected denials always apply: tenant isolation, template ceilings, maker-checker boundaries, and last-admin protection.
                      </p>
                    </>
                  )}
                </Card>
              </>
            ) : (
              <p className="text-muted" style={{ padding: '1rem 0' }}>
                {usersQuery.error ? 'User assignments cannot be shown without user lookup access.' : 'Select a user account above to review and manage their roles, scopes, and effective access.'}
              </p>
            )}
          </Card>
        </div>
      )}

      {/* TAB 3: ROLE TEMPLATES & MATRIX */}
      {activeTab === 'roles' && (
        <div className={`roles-workspace${selectedRole ? '' : ' roles-workspace-empty'}`}>
          <Card title="Templates & Custom Roles" noPadding>
            <nav className="roles-list" aria-label="Role selection">
              {roles.map(role => (
                <button
                  type="button"
                  key={role.id}
                  className={`roles-list-item ${role.id === selectedRole?.id ? 'is-selected' : ''}`}
                  aria-pressed={role.id === selectedRole?.id}
                  onClick={() => { setSelectedRoleId(String(role.id)); setCopying(false); setError(''); }}
                >
                  <strong>{role.name}</strong>
                  <span>{role.isProtected ? 'Protected template' : `${role.status} · ${role.activeAssigneeCount ?? 0} assignees`}</span>
                </button>
              ))}
              {!roles.length && !rolesQuery.isLoading && (
                <div className="roles-list-empty">
                  <p>No roles are currently configured in this bank.</p>
                  <Button variant="primary" size="sm" loading={busy} onClick={handleAutoBootstrap} style={{ marginTop: '0.5rem' }}>
                    ⚡ Auto-Provision Protected Roles
                  </Button>
                </div>
              )}
            </nav>
          </Card>

          {selectedRole ? (
            <RoleEditor
              key={`${selectedRole.id}-${copying}`}
              role={selectedRole}
              copying={copying}
              permissions={catalogueQuery.data?.permissions || []}
              templates={catalogueQuery.data?.templates || []}
              enabled={customEnabled && !coreLoadError}
              busy={busy}
              onCopy={() => setCopying(true)}
              onCancel={() => setCopying(false)}
              onSave={body => copying
                ? apply(() => accessApi.createRole(body), 'Custom role created.')
                : previewRoleChange(selectedRole, () => accessApi.updateRole(selectedRole.id, body), 'Save role changes')}
              onDeactivate={() => previewRoleChange(selectedRole, () => accessApi.deactivateRole(selectedRole.id), 'Deactivate custom role')}
            />
          ) : (
            <Card title="Role Overview">
              <p className="text-muted">No role is selected. Auto-provision protected templates or choose a role on the left.</p>
            </Card>
          )}
        </div>
      )}

      {/* Confirmation & Impact Modal */}
      <ConfirmationModal
        open={!!confirm}
        onClose={() => { if (!busy) { setConfirm(null); setError(''); } }}
        title={confirm?.title}
        itemName={confirm?.itemName}
        details={confirm?.details}
        warningMessage={`${IMPACT_COPY} ${confirm?.impact?.affectedUserCount ? 'End or replace active assignments before deactivating a role.' : ''}`}
        confirmLabel={confirm?.title?.includes('Deactivate') ? 'Confirm Deactivation' : 'Confirm Access Change'}
        confirmVariant={confirm?.title?.includes('Deactivate') ? 'danger' : 'primary'}
        requireVerification={!!confirm?.title?.includes('Deactivate')}
        verificationText="DEACTIVATE"
        verificationLabel={`Type "DEACTIVATE" to confirm deactivating ${confirm?.itemName || 'this role'}:`}
        loading={busy}
        error={error}
        onConfirm={() => apply(confirm.work, 'Access change saved. Affected users must sign in again and relink their phone.')}
      />

      {/* Activation Confirmation Modal */}
      <Modal
        open={activationOpen}
        onClose={() => { if (!busy) setActivationOpen(false); }}
        title="Activate permission mode permanently"
        footer={
          <>
            <Button variant="secondary" disabled={busy} onClick={() => setActivationOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="danger"
              loading={busy}
              disabled={activationText !== 'ACTIVATE' || !readiness?.ready || !!readinessQuery.error}
              onClick={activate}
            >
              Activate and sign everyone out
            </Button>
          </>
        }
      >
        <p>
          This one-way change switches the entire bank to assignment-based permissions. You cannot return to legacy mode through this interface. All browser sessions end and linked mobile devices are revoked.
        </p>
        <p>{IMPACT_COPY}</p>
        <p>Resolve missing access through another Organisation Admin after signing in again.</p>
        {error && <p className="auth-error" role="alert">{error}</p>}
        <Input
          id="roles-activation-confirm"
          label='Type "ACTIVATE" to confirm'
          value={activationText}
          onChange={event => setActivationText(event.target.value)}
          autoComplete="off"
        />
      </Modal>
    </div>
  );
}

function RoleEditor({ role, copying, permissions, templates, enabled, busy, onCopy, onCancel, onSave, onDeactivate }) {
  const [name, setName] = useState(copying ? `${role.name} copy` : role.name);
  const [code, setCode] = useState('');
  const [codes, setCodes] = useState(role.permissionCodes);
  const source = templates.find(template => template.code === role.templateCode);
  const locked = role.isProtected && !copying;
  const dirty = name !== role.name || codes.length !== role.permissionCodes.length || codes.some(value => !role.permissionCodes.includes(value));
  const actions = [...new Set(permissions.map(permission => permission.action))];
  const modules = [...new Set(permissions.map(permission => permission.module))];

  return (
    <Card
      title={copying ? 'Copy protected template' : role.name}
      actions={locked ? <Button size="sm" variant="secondary" disabled={!enabled || busy} onClick={onCopy}>Copy template</Button> : null}
    >
      <p>{source?.description || role.description}</p>
      <p className="form-note">
        Source: {source?.name || role.templateCode} · Scope ceiling: {(role.allowedScopes || []).map(scope => scopeNames[scope]).join(', ')} · {role.activeAssigneeCount ?? 0} active assignees
      </p>

      {locked ? (
        <p id="protected-role-note" className="form-note">
          Protected template: all cells are locked to maintain statutory banking standards. Click "Copy template" above to select a subset; platform ceilings cannot be increased.
        </p>
      ) : (
        <div className="form-grid">
          <Input id="role-name" label="Role name" maxLength={255} disabled={!enabled || busy} value={name} onChange={event => setName(event.target.value)} />
          {copying && (
            <Input
              id="role-code"
              label="Role code"
              hint="2–32 uppercase letters, digits, hyphens or underscores"
              maxLength={32}
              value={code}
              disabled={!enabled || busy}
              onChange={event => setCode(event.target.value.toUpperCase())}
            />
          )}
        </div>
      )}

      <div className="roles-matrix-scroll">
        <table className="table roles-matrix">
          <caption>Function matrix — cells outside the source template are unavailable</caption>
          <thead>
            <tr>
              <th scope="col">Module</th>
              {actions.map(action => (
                <th scope="col" key={action}>{title(action)}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {modules.map(module => (
              <tr key={module}>
                <th scope="row">{title(module)}</th>
                {actions.map(action => {
                  const permission = permissions.find(item => item.module === module && item.action === action);
                  if (!permission) return <td key={action}>—</td>;
                  const withinCeiling = source?.permissionCodes.includes(permission.code);
                  return (
                    <td key={action}>
                      <input
                        type="checkbox"
                        aria-label={permission.code}
                        aria-describedby={locked ? 'protected-role-note' : undefined}
                        title={!withinCeiling ? 'Outside the source template ceiling' : permission.requiresFeature ? `Requires feature: ${permission.requiresFeature}` : permission.guardrails.map(title).join('; ')}
                        checked={codes.includes(permission.code)}
                        disabled={role.isProtected && !copying || !withinCeiling || !enabled || busy || !!permission.requiresFeature}
                        onChange={event => setCodes(previous => event.target.checked ? [...previous, permission.code] : previous.filter(value => value !== permission.code))}
                      />
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <details style={{ marginBlock: '1rem' }}>
        <summary style={{ cursor: 'pointer', fontWeight: 600, color: 'var(--text-secondary)' }}>
          Security guardrails and feature restrictions
        </summary>
        <ul style={{ marginTop: '0.5rem', fontSize: '0.8125rem' }}>
          {permissions.filter(permission => codes.includes(permission.code) && (permission.guardrails.length > 1 || permission.requiresFeature)).map(permission => (
            <li key={permission.code}>
              <strong>{permission.code}</strong>: {permission.guardrails.map(title).join(', ')}
              {permission.requiresFeature ? `; unavailable until ${permission.requiresFeature} is implemented` : ''}
            </li>
          ))}
        </ul>
        <p className="form-note">
          Combining roles never overrides maker-checker conflicts. A preparer cannot approve or pay the same transaction, and an approver cannot record its payment.
        </p>
      </details>

      {!locked && (
        <div className="row-actions">
          <Button
            disabled={!enabled || busy || !name.trim() || (!copying && !dirty) || (copying && !/^[A-Z0-9][A-Z0-9_-]{1,31}$/.test(code))}
            onClick={() => onSave({ name: name.trim(), permissionCodes: codes, ...(copying ? { sourceRoleId: role.id, code } : {}) })}
          >
            {copying ? 'Create custom role' : 'Preview & save changes'}
          </Button>
          {copying ? (
            <Button variant="secondary" onClick={onCancel}>Cancel copy</Button>
          ) : role.status === 'ACTIVE' && (
            <Button variant="secondary" disabled={!enabled || busy} onClick={onDeactivate}>Preview deactivation</Button>
          )}
          {!copying && dirty && <span role="status" className="text-muted" style={{ fontSize: '0.875rem' }}>Unsaved changes</span>}
        </div>
      )}
    </Card>
  );
}

function AssignmentEditor({ value, onChange, roles, branches, departments, branchesError, departmentsError, busy, onCancel, onSave }) {
  const role = roles.find(item => String(item.id) === String(value.roleId));
  const validScope = role?.allowedScopes.includes(value.scopeType);
  const scopeUnavailable = (value.scopeType === 'SELECTED_BRANCHES' && branchesError) || (value.scopeType === 'DEPARTMENT' && departmentsError);
  const valid = value.roleId && validScope && value.effectiveFrom && (!value.effectiveTo || value.effectiveTo >= value.effectiveFrom) && !scopeUnavailable && (value.scopeType !== 'SELECTED_BRANCHES' || value.branchIds.length) && (value.scopeType !== 'DEPARTMENT' || value.departmentIds.length === 1);

  return (
    <form
      className="roles-assignment-form"
      onSubmit={event => {
        event.preventDefault();
        if (valid) onSave({
          roleId: Number(value.roleId),
          scopeType: value.scopeType,
          branchIds: value.scopeType === 'SELECTED_BRANCHES' ? value.branchIds : [],
          departmentIds: value.scopeType === 'DEPARTMENT' ? value.departmentIds : [],
          effectiveFrom: value.effectiveFrom,
          effectiveTo: value.effectiveTo || null,
          status: value.status
        });
      }}
    >
      <h3>{value.id ? 'Edit assignment' : 'Add role assignment'}</h3>
      <div className="form-grid">
        <div className="field">
          <label className="field-label" htmlFor="assignment-role">Role</label>
          <select
            id="assignment-role"
            className="input"
            required
            value={value.roleId}
            onChange={event => {
              const picked = roles.find(item => String(item.id) === event.target.value);
              onChange({ ...value, roleId: event.target.value, scopeType: picked?.allowedScopes[0] || '', branchIds: [], departmentIds: [] });
            }}
          >
            <option value="">Choose role</option>
            {roles.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
          </select>
        </div>
        <div className="field">
          <label className="field-label" htmlFor="assignment-scope">Data scope</label>
          <select
            id="assignment-scope"
            className="input"
            required
            value={value.scopeType}
            onChange={event => onChange({ ...value, scopeType: event.target.value, branchIds: [], departmentIds: [] })}
          >
            <option value="">Choose scope</option>
            {(role?.allowedScopes || []).map(scope => <option key={scope} value={scope}>{scopeNames[scope]}</option>)}
          </select>
        </div>
        <Input id="assignment-start" label="Effective from" type="date" required value={value.effectiveFrom} onChange={event => onChange({ ...value, effectiveFrom: event.target.value })} />
        <Input id="assignment-end" label="Effective to (optional)" type="date" min={value.effectiveFrom} value={value.effectiveTo || ''} onChange={event => onChange({ ...value, effectiveTo: event.target.value })} />
      </div>

      {value.scopeType === 'SELECTED_BRANCHES' && (
        <fieldset style={{ marginTop: '1rem' }}>
          <legend style={{ fontWeight: 600, fontSize: '0.875rem', marginBottom: '0.5rem' }}>Select one or more active branches</legend>
          {branchesError ? (
            <p className="auth-error" role="alert">Branch list unavailable; retry it before editing this scope.</p>
          ) : (
            <div className="roles-branch-options">
              {branches.map(branch => (
                <label key={branch.id} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.875rem' }}>
                  <input
                    type="checkbox"
                    checked={value.branchIds.some(id => String(id) === String(branch.id))}
                    onChange={event => onChange({
                      ...value,
                      branchIds: event.target.checked ? [...value.branchIds, branch.id] : value.branchIds.filter(id => String(id) !== String(branch.id))
                    })}
                  />
                  {branch.name} ({branch.code})
                </label>
              ))}
            </div>
          )}
          {!branchesError && !branches.length && <p className="text-muted">No active branches. Resolve organisation structure first.</p>}
        </fieldset>
      )}

      {value.scopeType === 'DEPARTMENT' && (
        <div className="field" style={{ marginTop: '1rem' }}>
          <label className="field-label" htmlFor="assignment-department">Department</label>
          {departmentsError ? (
            <p className="auth-error" role="alert">Department list unavailable; retry it before editing this scope.</p>
          ) : (
            <select
              id="assignment-department"
              className="input"
              required
              value={value.departmentIds[0] || ''}
              onChange={event => onChange({ ...value, departmentIds: event.target.value ? [Number(event.target.value)] : [] })}
            >
              <option value="">Choose department</option>
              {departments.map(department => (
                <option key={department.id} value={department.id}>
                  {department.name} · {branches.find(branch => branch.id === department.branchId)?.name}
                </option>
              ))}
            </select>
          )}
        </div>
      )}

      <p className="form-note">
        The server checks active employee links, scope ceilings, overlapping dates, protected baselines, self-escalation, and last-admin protection before saving.
      </p>
      <div className="row-actions">
        <Button type="submit" disabled={!valid || busy}>Preview assignment change</Button>
        <Button variant="secondary" onClick={onCancel} disabled={busy}>Cancel</Button>
      </div>
    </form>
  );
}
