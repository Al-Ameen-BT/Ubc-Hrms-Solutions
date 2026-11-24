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
import {
  ShieldIcon,
  UsersIcon,
  UserIcon,
  FileTextIcon,
  ZapIcon,
  RefreshCwIcon,
  BuildingIcon,
  SettingsIcon,
  AlertTriangleIcon,
  CheckCircleIcon,
  ClipboardListIcon,
  LockIcon,
  ArrowRightIcon,
  DollarSignIcon,
  BarChartIcon,
  CalendarIcon,
  ClockIcon,
  FolderIcon,
  CreditCardIcon,
  SmartphoneIcon,
} from '../../components/ui/Icons';
import './RolesPermissionsPage.css';

const IMPACT_COPY = 'Browser users must sign in again. QR-only mobile users must relink their phone from the self-service portal: My Account → Linked devices.';
const rows = data => data?.rows || [];
const title = value => (value || '').replace(/_/g, ' ').replace(/([a-z])([A-Z])/g, '$1 $2');
const dateToday = () => new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
const scopeNames = { OWN: 'Own record', DEPARTMENT: 'Department', SELECTED_BRANCHES: 'Selected branches (one or more)', ORGANISATION: 'Entire organisation' };

const FEATURE_GROUPS = [
  {
    id: 'payroll',
    title: 'Payroll Management',
    Icon: DollarSignIcon,
    description: 'Salary register, batch preparation, approvals and payment export advice.',
    permissions: [
      { code: 'payroll.view', name: 'View Payroll', desc: 'Inspect monthly payroll sheets, salary registers and reports', risk: 'READ' },
      { code: 'payroll.prepare', name: 'Prepare Payroll', desc: 'Calculate monthly wages, generate payroll batches and adjustments', risk: 'FINANCIAL' },
      { code: 'payroll.approve', name: 'Approve Payroll', desc: 'Authorize and sanction prepared payroll batches (Checker guard)', risk: 'FINANCIAL' },
      { code: 'payroll.export', name: 'Export Payroll', desc: 'Export payroll register, salary bank advice and CSV summaries', risk: 'WRITE' },
    ]
  },
  {
    id: 'arrears',
    title: 'DA Arrears & Pay Revisions',
    Icon: FileTextIcon,
    description: 'Dearness allowance arrears, installment planning, approvals and disbursement.',
    permissions: [
      { code: 'arrears.view', name: 'View Arrears', desc: 'Inspect arrears calculations and installment schedules', risk: 'READ' },
      { code: 'arrears.prepare', name: 'Prepare Arrears', desc: 'Calculate arrears cases, pay revisions and installment schedules', risk: 'FINANCIAL' },
      { code: 'arrears.approve', name: 'Approve Arrears', desc: 'Approve calculation batches and installment schedules (Checker guard)', risk: 'FINANCIAL' },
      { code: 'arrears.pay', name: 'Disburse Arrears', desc: 'Execute and record disbursement of arrears installments (Payer guard)', risk: 'FINANCIAL' },
    ]
  },
  {
    id: 'compensation',
    title: 'Compensation & Financial Changes',
    Icon: BarChartIcon,
    description: 'Pay scale rules, allowance configurations and individual salary adjustments.',
    permissions: [
      { code: 'compensation.view', name: 'View Compensation', desc: 'View employee compensation packages and pay scales', risk: 'READ' },
      { code: 'compensation.prepare', name: 'Prepare Compensation', desc: 'Draft salary changes, allowances and welfare fund rules', risk: 'FINANCIAL' },
      { code: 'compensation.approve', name: 'Approve Compensation', desc: 'Approve employee compensation revisions (Checker guard)', risk: 'FINANCIAL' },
      { code: 'financialChanges.view', name: 'View Financial Changes', desc: 'View pending and historical financial change requests', risk: 'READ' },
      { code: 'financialChanges.prepare', name: 'Prepare Financial Changes', desc: 'Initiate employee pay scale adjustments and grade increments', risk: 'FINANCIAL' },
      { code: 'financialChanges.approve', name: 'Approve Financial Changes', desc: 'Authorize employee pay scale adjustments (Checker guard)', risk: 'FINANCIAL' },
    ]
  },
  {
    id: 'leave',
    title: 'Leave Management',
    Icon: CalendarIcon,
    description: 'Staff leave applications, balance administration and manager approvals.',
    permissions: [
      { code: 'leave.view', name: 'View Leave Records', desc: 'View staff leave balances, applications and calendars', risk: 'READ' },
      { code: 'leave.manage', name: 'Manage Leave', desc: 'Record leave entries and adjust balances on behalf of staff', risk: 'WRITE' },
      { code: 'leave.approve', name: 'Approve Leave', desc: 'Sanction or reject submitted employee leave applications', risk: 'WRITE' },
    ]
  },
  {
    id: 'attendance',
    title: 'Attendance, Shifts & Geofencing',
    Icon: ClockIcon,
    description: 'Daily biometric/punch logs, shift timings, manual adjustments and geofences.',
    permissions: [
      { code: 'attendance.view', name: 'View Attendance', desc: 'Inspect daily shift logs, punch times and presence records', risk: 'READ' },
      { code: 'attendance.manage', name: 'Manage Attendance', desc: 'Mark manual punches, correct timings and approve overtime', risk: 'WRITE' },
      { code: 'geofence.view', name: 'View Geofences', desc: 'View branch geofencing coordinates and mobile radius', risk: 'READ' },
      { code: 'geofence.manage', name: 'Manage Geofences', desc: 'Configure branch geofence boundary coordinates and tolerances', risk: 'WRITE' },
      { code: 'chart.view', name: 'View Org Chart', desc: 'View bank hierarchy, reporting lines and organizational chart', risk: 'READ' },
    ]
  },
  {
    id: 'people',
    title: 'People & Staff Directory',
    Icon: UsersIcon,
    description: 'Employee onboarding, profile maintenance, cadre definitions and exports.',
    permissions: [
      { code: 'people.view', name: 'View Directory', desc: 'Access employee directory, profiles and contact info', risk: 'READ' },
      { code: 'people.create', name: 'Onboard Staff', desc: 'Create new employee service records and profiles', risk: 'WRITE' },
      { code: 'people.edit', name: 'Edit Employee Records', desc: 'Update staff personal details, qualifications and service history', risk: 'WRITE' },
      { code: 'people.export', name: 'Export Staff Data', desc: 'Export staff rosters, demographics and service registers', risk: 'WRITE' },
      { code: 'hr.view', name: 'View HR Cadres', desc: 'View cadre designations and post classifications', risk: 'READ' },
      { code: 'hr.manage', name: 'Manage HR Policy', desc: 'Configure designations, post cadres and service rule bands', risk: 'WRITE' },
    ]
  },
  {
    id: 'documents',
    title: 'Employee Documents',
    Icon: FolderIcon,
    description: 'KYC documents, appointment letters, service books and certificates.',
    permissions: [
      { code: 'documents.view', name: 'View Documents', desc: 'Inspect uploaded employee identification and service proofs', risk: 'READ' },
      { code: 'documents.manage', name: 'Manage Documents', desc: 'Upload, verify and organize staff compliance documentation', risk: 'WRITE' },
    ]
  },
  {
    id: 'structure',
    title: 'Organisation Structure & Transfers',
    Icon: BuildingIcon,
    description: 'Branches, departments, post cadration, assignments and inter-branch transfers.',
    permissions: [
      { code: 'structure.view', name: 'View Structure', desc: 'Inspect head office, branches, departments and cadres', risk: 'READ' },
      { code: 'structure.manage', name: 'Manage Structure', desc: 'Configure organizational units and head office settings', risk: 'WRITE' },
      { code: 'branches.view', name: 'View Branches', desc: 'View bank branch directory, codes and operational status', risk: 'READ' },
      { code: 'branches.manage', name: 'Manage Branches', desc: 'Add new branches and update branch metadata', risk: 'WRITE' },
      { code: 'departments.view', name: 'View Departments', desc: 'View bank department divisions within branches', risk: 'READ' },
      { code: 'departments.manage', name: 'Manage Departments', desc: 'Create and update bank department structures', risk: 'WRITE' },
      { code: 'positions.view', name: 'View Positions', desc: 'View sanctioned positions and vacancies across units', risk: 'READ' },
      { code: 'positions.manage', name: 'Manage Positions', desc: 'Configure sanctioned position allocations per cadre', risk: 'WRITE' },
      { code: 'assignments.view', name: 'View Staff Postings', desc: 'Inspect employee branch and department postings', risk: 'READ' },
      { code: 'assignments.manage', name: 'Manage Staff Postings', desc: 'Assign employees to designated branch or department posts', risk: 'WRITE' },
      { code: 'transfers.view', name: 'View Transfers', desc: 'Track employee transfer requests and transition orders', risk: 'READ' },
      { code: 'transfers.manage', name: 'Manage Transfers', desc: 'Initiate, approve or execute employee branch transfers', risk: 'WRITE' },
    ]
  },
  {
    id: 'expenses',
    title: 'Expenses & Reimbursements',
    Icon: ClipboardListIcon,
    description: 'Employee travel vouchers, petty cash claims, verification and sign-off.',
    permissions: [
      { code: 'expenses.view', name: 'View Claims', desc: 'Inspect expense submissions and supporting vouchers', risk: 'READ' },
      { code: 'expenses.verify', name: 'Verify Expenses', desc: 'Audit and check claimed receipts and billings (Checker guard)', risk: 'WRITE' },
      { code: 'expenses.approve', name: 'Approve Reimbursements', desc: 'Sanction verified expense reimbursements for payment', risk: 'FINANCIAL' },
    ]
  },
  {
    id: 'payments',
    title: 'Disbursements & Staff Advances',
    Icon: CreditCardIcon,
    description: 'Payment execution, festival advances, staff loan ledgers and banking exports.',
    permissions: [
      { code: 'payments.view', name: 'View Payments', desc: 'View payment queues, disburse history and transaction status', risk: 'READ' },
      { code: 'payments.pay', name: 'Process Payments', desc: 'Execute disbursements to bank accounts (Payer guard)', risk: 'FINANCIAL' },
      { code: 'payments.export', name: 'Export Payment Advice', desc: 'Generate NEFT/RTGS payment files and bank advice sheets', risk: 'WRITE' },
      { code: 'advances.view', name: 'View Advances & Loans', desc: 'Inspect staff festival advances, loan balances and recovery', risk: 'READ' },
      { code: 'advances.prepare', name: 'Prepare Advance Requests', desc: 'Draft loan and festival advance applications for staff', risk: 'FINANCIAL' },
      { code: 'advances.approve', name: 'Approve Advance Requests', desc: 'Authorize staff loan and advance applications (Checker guard)', risk: 'FINANCIAL' },
    ]
  },
  {
    id: 'yearend',
    title: 'Year-End Closing',
    Icon: CalendarIcon,
    description: 'Financial year & calendar year balance carry-forwards and statutory roll-over.',
    permissions: [
      { code: 'yearend.view', name: 'View Year-End', desc: 'Inspect year-end closing checklist, accruals and status', risk: 'READ' },
      { code: 'yearend.close', name: 'Execute Year-End Close', desc: 'Execute statutory financial and calendar year close', risk: 'FINANCIAL' },
    ]
  },
  {
    id: 'audit',
    title: 'Audit & Compliance Inspection',
    Icon: ShieldIcon,
    description: 'Immutable transaction trails, system event logs and regulatory review.',
    permissions: [
      { code: 'audit.view', name: 'View Audit Logs', desc: 'Inspect immutable system audit trails, access and security logs', risk: 'READ' },
    ]
  },
  {
    id: 'dpdp',
    title: 'DPDP Compliance & Data Privacy',
    Icon: LockIcon,
    description: 'Data protection officer workspace, subject access requests and sensitive records.',
    permissions: [
      { code: 'dpdp.view', name: 'View DPDP Governance', desc: 'Inspect DPDP compliance checklist, privacy notice and log', risk: 'READ' },
      { code: 'dpdp.manage', name: 'Manage DPDP Requests', desc: 'Process employee data correction, deletion and grievance requests', risk: 'WRITE' },
      { code: 'dpdp.sensitive.view', name: 'View Sensitive Personal Data', desc: 'View masked Aadhaar, PAN and sensitive biometric data', risk: 'READ' },
    ]
  },
  {
    id: 'self',
    title: 'Employee Self-Service (ESS)',
    Icon: SmartphoneIcon,
    description: 'Personal profile, payslip downloads, leave requests and device linking.',
    permissions: [
      { code: 'self.profile', name: 'My Profile', desc: 'View and update personal address and emergency contacts', risk: 'READ' },
      { code: 'self.payslips', name: 'My Payslips', desc: 'Download monthly payslips and tax deduction summaries', risk: 'READ' },
      { code: 'self.leave', name: 'My Leave', desc: 'Apply for leave and track personal leave balance ledger', risk: 'READ' },
      { code: 'self.attendance', name: 'My Attendance', desc: 'Mobile check-in/out and personal attendance history', risk: 'READ' },
      { code: 'self.policies', name: 'Bank Policies', desc: 'View published service rules, holiday lists and circulars', risk: 'READ' },
      { code: 'self.claims', name: 'My Claims', desc: 'Submit personal reimbursement and travel expense vouchers', risk: 'READ' },
      { code: 'self.documents', name: 'My Documents', desc: 'Upload KYC certificates and access official bank letters', risk: 'READ' },
      { code: 'self.devices', name: 'Linked Devices', desc: 'Pair and revoke registered mobile devices for QR login', risk: 'READ' },
    ]
  },
  {
    id: 'admin',
    title: 'System Administration & Settings',
    Icon: SettingsIcon,
    description: 'Bank general settings, user management and system access configuration.',
    permissions: [
      { code: 'settings.view', name: 'View Settings', desc: 'Inspect bank parameters and operational rules', risk: 'READ' },
      { code: 'settings.configure', name: 'Configure Settings', desc: 'Update bank rules, general options and notification templates', risk: 'WRITE' },
      { code: 'users.manage', name: 'Manage User Accounts', desc: 'Provision bank user logins, passwords and account status', risk: 'WRITE' },
      { code: 'roles.manage', name: 'Manage Roles & Access', desc: 'Root administrative privilege to configure roles and permissions', risk: 'WRITE' },
    ]
  }
];

function categorizeBlockers(blockers = [], bootstrapUserId, users = []) {
  const categories = {
    roles: {
      id: 'roles',
      title: 'System Roles & Baselines',
      icon: <ShieldIcon size={16} />,
      description: 'System roles, baseline permissions, and administrative access assignments',
      items: [],
      canManualSeed: true,
    },
    identity: {
      id: 'identity',
      title: 'Admin Identity & Employee Profiles',
      icon: <UserIcon size={16} />,
      description: 'Account mapping to active employee profiles for audit compliance',
      items: [],
      canAutoFix: false,
    },
    branch: {
      id: 'branch',
      title: 'Branch & Organisation Structure',
      icon: <BuildingIcon size={16} />,
      description: 'Branch placement and Head Office structure configuration',
      items: [],
      canAutoFix: false,
    },
    other: {
      id: 'other',
      title: 'Operational Readiness',
      icon: <SettingsIcon size={16} />,
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
            <Link to="/audit" className="btn btn-secondary btn-sm">
              <ClipboardListIcon size={14} style={{ marginRight: '0.4rem', verticalAlign: '-2px' }} />
              View Audit Log
            </Link>
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
          <ShieldIcon size={15} style={{ marginRight: '0.4rem', verticalAlign: '-2px' }} />
          Access Readiness &amp; Migration
          {readiness && !readiness.ready && (
            <Badge variant="warning" style={{ marginLeft: '0.5rem' }}>{readiness.blockers?.length || '!'}</Badge>
          )}
        </button>
        <button
          type="button"
          className={`btn btn-sm ${activeTab === 'assignments' ? 'btn-primary' : 'btn-secondary'}`}
          onClick={() => { setActiveTab('assignments'); setParams({ tab: 'assignments' }); }}
        >
          <UsersIcon size={15} style={{ marginRight: '0.4rem', verticalAlign: '-2px' }} />
          User Role Assignments
        </button>
        <button
          type="button"
          className={`btn btn-sm ${activeTab === 'roles' ? 'btn-primary' : 'btn-secondary'}`}
          onClick={() => { setActiveTab('roles'); setParams({ tab: 'roles' }); }}
        >
          <FileTextIcon size={15} style={{ marginRight: '0.4rem', verticalAlign: '-2px' }} />
          Role Templates &amp; Matrix
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
                      <ShieldIcon size={14} style={{ marginRight: '0.35rem', verticalAlign: '-2px' }} />
                      Provision Standard Baseline Roles
                    </Button>
                  )}
                  <Button size="sm" variant="secondary" loading={readinessQuery.isFetching} onClick={() => readinessQuery.refetch()}>
                    <RefreshCwIcon size={14} style={{ marginRight: '0.35rem', verticalAlign: '-2px' }} />
                    Check Readiness
                  </Button>
                  <Link to="/people?view=access" className="btn btn-secondary btn-sm">
                    <UserIcon size={14} style={{ marginRight: '0.35rem', verticalAlign: '-2px' }} />
                    Manage Account Links
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
                          <span style={{ display: 'inline-flex', alignItems: 'center' }}>{category.icon}</span>
                          <span>{category.title}</span>
                          <Badge variant="warning">{category.items.length}</Badge>
                        </div>
                        {category.canManualSeed && (
                          <Button size="sm" variant="secondary" loading={busy} onClick={handleAutoBootstrap}>
                            <ShieldIcon size={13} style={{ marginRight: '0.3rem', verticalAlign: '-1px' }} />
                            Provision Baselines
                          </Button>
                        )}
                      </div>
                      <div className="roles-blocker-items">
                        {category.items.map(item => (
                          <div key={item.id} className="roles-blocker-item">
                            <div className="roles-blocker-item-main">
                              <div className="roles-blocker-item-icon">
                                <AlertTriangleIcon size={15} />
                              </div>
                              <div>
                                <div className="roles-blocker-item-title">{item.title}</div>
                                <div className="roles-blocker-item-desc">{item.desc}</div>
                              </div>
                            </div>
                            <div className="roles-blocker-item-action">
                              {item.actionLink ? (
                                <Link to={item.actionLink} className="btn btn-secondary btn-sm">
                                  {item.actionLabel || 'Resolve'}
                                  <ArrowRightIcon size={13} style={{ marginLeft: '0.3rem', verticalAlign: '-1px' }} />
                                </Link>
                              ) : (
                                <Button size="sm" variant="secondary" loading={busy} onClick={handleAutoBootstrap}>
                                  Provision Baseline
                                </Button>
                              )}
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
                    <h3 className="roles-activation-title" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <CheckCircleIcon size={20} style={{ color: '#16a34a' }} />
                      All Readiness Requirements Satisfied
                    </h3>
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
                    <h3 className="roles-activation-title" style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                      <LockIcon size={17} />
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
                <UserIcon size={14} style={{ marginRight: '0.35rem', verticalAlign: '-2px' }} />
                Manage Account &amp; Employee Links
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
                        <Badge variant="warning">
                          <AlertTriangleIcon size={12} style={{ marginRight: '0.25rem', verticalAlign: '-1px' }} />
                          Unlinked Admin Account
                        </Badge>
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
                  <span>
                    {role.code === 'ORGANISATION_ADMIN'
                      ? 'Protected Root Admin'
                      : `${(role.permissionCodes || []).length} features · ${role.status} · ${role.activeAssigneeCount ?? 0} assignees`}
                  </span>
                </button>
              ))}
              {!roles.length && !rolesQuery.isLoading && (
                <div className="roles-list-empty">
                  <p>No roles are currently configured in this bank.</p>
                  <Button variant="primary" size="sm" loading={busy} onClick={handleAutoBootstrap} style={{ marginTop: '0.5rem' }}>
                    <ShieldIcon size={14} style={{ marginRight: '0.35rem', verticalAlign: '-2px' }} />
                    Provision Baseline Roles (Manual)
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
              <p className="text-muted">No role is selected. Choose a role on the left to configure features, or initialize baseline roles.</p>
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
  const [codes, setCodes] = useState(role.permissionCodes || []);
  const [viewMode, setViewMode] = useState('features'); // 'features' or 'matrix'
  const [searchFilter, setSearchFilter] = useState('');

  const source = templates.find(template => template.code === role.templateCode);
  const isOrgAdmin = role.code === 'ORGANISATION_ADMIN' || (role.templateCode === 'ORGANISATION_ADMIN' && role.isProtected);
  const locked = isOrgAdmin && !copying;
  const dirty = name !== role.name || codes.length !== (role.permissionCodes || []).length || codes.some(value => !(role.permissionCodes || []).includes(value));
  const actions = [...new Set(permissions.map(permission => permission.action))];
  const modules = [...new Set(permissions.map(permission => permission.module))];

  const togglePermission = permCode => {
    if (locked) return;
    setCodes(prev => prev.includes(permCode) ? prev.filter(c => c !== permCode) : [...prev, permCode]);
  };

  const toggleGroup = (groupPerms, select) => {
    if (locked) return;
    const groupCodes = groupPerms
      .map(p => p.code)
      .filter(c => c !== 'roles.manage' || role.templateCode === 'ORGANISATION_ADMIN');
    if (select) {
      setCodes(prev => [...new Set([...prev, ...groupCodes])]);
    } else {
      setCodes(prev => prev.filter(c => !groupCodes.includes(c)));
    }
  };

  const selectAllFeatures = () => {
    if (locked) return;
    const all = permissions
      .map(p => p.code)
      .filter(c => c !== 'roles.manage' || role.templateCode === 'ORGANISATION_ADMIN');
    setCodes(all);
  };

  const clearAllFeatures = () => {
    if (locked) return;
    setCodes([]);
  };

  const query = searchFilter.trim().toLowerCase();
  const filteredGroups = FEATURE_GROUPS.map(group => {
    const matchesGroup = group.title.toLowerCase().includes(query) || group.description.toLowerCase().includes(query);
    const filteredPerms = group.permissions.filter(p =>
      matchesGroup || p.name.toLowerCase().includes(query) || p.code.toLowerCase().includes(query) || p.desc.toLowerCase().includes(query)
    );
    return { ...group, filteredPerms };
  }).filter(group => group.filteredPerms.length > 0);

  return (
    <Card
      title={copying ? 'Create Custom Role' : role.name}
      actions={
        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
          {locked ? (
            <Button size="sm" variant="secondary" disabled={!enabled || busy} onClick={onCopy}>
              Copy Template
            </Button>
          ) : (
            <Badge variant="primary">{codes.length} Features Active</Badge>
          )}
        </div>
      }
    >
      <p>{source?.description || role.description}</p>
      <p className="form-note">
        Base Template: {source?.name || role.templateCode} · Scope ceiling: {(role.allowedScopes || []).map(scope => scopeNames[scope]).join(', ')} · {role.activeAssigneeCount ?? 0} active assignees
      </p>

      {locked ? (
        <div className="roles-protected-banner" id="protected-role-note">
          <LockIcon size={18} style={{ flexShrink: 0 }} />
          <div>
            <strong>Organisation Admin is Protected and Immutable</strong>
            <p style={{ margin: 0, fontSize: '0.8125rem' }}>
              Root administrative access and security invariants cannot be modified. For other staff roles (HR, Payroll, Branch Manager, etc.), you can freely add or remove features by selecting them on the left.
            </p>
          </div>
        </div>
      ) : (
        <div className="roles-editable-banner">
          <ShieldIcon size={18} style={{ flexShrink: 0 }} />
          <div>
            <strong>Configurable Role Features &amp; Permissions</strong>
            <p style={{ margin: 0, fontSize: '0.8125rem' }}>
              Select the specific features and action permissions needed for this role. Only administrative role management (<code>roles.manage</code>) is reserved for Organisation Admins.
            </p>
          </div>
        </div>
      )}

      {!locked && (
        <div className="form-grid" style={{ marginBottom: '1rem' }}>
          <Input
            id="role-name"
            label="Role Name"
            maxLength={255}
            disabled={!enabled || busy}
            value={name}
            onChange={event => setName(event.target.value)}
          />
          {copying && (
            <Input
              id="role-code"
              label="Role Code"
              hint="2–32 uppercase letters, digits, hyphens or underscores"
              maxLength={32}
              value={code}
              disabled={!enabled || busy}
              onChange={event => setCode(event.target.value.toUpperCase())}
            />
          )}
        </div>
      )}

      {/* Feature Selection Toolbar */}
      <div className="roles-feature-controls">
        <div className="roles-feature-toolbar">
          <div className="roles-feature-search">
            <Input
              id="feature-search"
              placeholder="Search features (e.g., payroll, leave, export)..."
              value={searchFilter}
              onChange={e => setSearchFilter(e.target.value)}
            />
          </div>

          <div className="roles-feature-quick-actions">
            {!locked && (
              <>
                <Button size="sm" variant="secondary" disabled={busy} onClick={selectAllFeatures}>
                  Select All Permitted
                </Button>
                <Button size="sm" variant="secondary" disabled={busy} onClick={clearAllFeatures}>
                  Clear All
                </Button>
              </>
            )}

            <div className="roles-feature-view-toggle">
              <button
                type="button"
                className={viewMode === 'features' ? 'active' : ''}
                onClick={() => setViewMode('features')}
              >
                Feature Cards
              </button>
              <button
                type="button"
                className={viewMode === 'matrix' ? 'active' : ''}
                onClick={() => setViewMode('matrix')}
              >
                Matrix Grid
              </button>
            </div>
          </div>
        </div>

        {viewMode === 'features' ? (
          <div className="roles-features-grid">
            {filteredGroups.map(group => {
              const activeCount = group.permissions.filter(p => codes.includes(p.code)).length;
              const allChecked = group.permissions.length > 0 && activeCount === group.permissions.length;

              return (
                <div key={group.id} className="roles-feature-card">
                  <div className="roles-feature-card-header">
                    <div>
                      <div className="roles-feature-card-title-wrap">
                        <span className="roles-feature-card-icon"><group.Icon size={20} /></span>
                        <h4 className="roles-feature-card-title">{group.title}</h4>
                      </div>
                      <p className="roles-feature-card-desc">{group.description}</p>
                    </div>

                    <div className="roles-feature-card-actions">
                      <Badge variant={activeCount > 0 ? 'primary' : 'secondary'} style={{ fontSize: '0.7rem' }}>
                        {activeCount} / {group.permissions.length}
                      </Badge>
                      {!locked && (
                        <button
                          type="button"
                          className="btn btn-secondary btn-sm"
                          style={{ padding: '0.2rem 0.45rem', fontSize: '0.7rem' }}
                          onClick={() => toggleGroup(group.permissions, !allChecked)}
                        >
                          {allChecked ? 'Clear' : 'Select'}
                        </button>
                      )}
                    </div>
                  </div>

                  <div className="roles-feature-items">
                    {group.filteredPerms.map(perm => {
                      const isChecked = codes.includes(perm.code);
                      const isRoleManageRestricted = perm.code === 'roles.manage' && role.templateCode !== 'ORGANISATION_ADMIN';
                      const isDisabled = locked || isRoleManageRestricted || !enabled || busy;

                      return (
                        <label
                          key={perm.code}
                          className={`roles-feature-item ${isChecked ? 'is-checked' : ''} ${isDisabled ? 'is-disabled' : ''}`}
                        >
                          <input
                            type="checkbox"
                            checked={isChecked}
                            disabled={isDisabled}
                            onChange={() => togglePermission(perm.code)}
                          />
                          <div className="roles-feature-item-content">
                            <div className="roles-feature-item-header">
                              <div>
                                <span className="roles-feature-item-name">{perm.name}</span>
                                <span className="roles-feature-item-code">{perm.code}</span>
                              </div>
                              <div className="roles-feature-item-badges">
                                <span className={`roles-risk-badge roles-risk-${perm.risk.toLowerCase()}`}>
                                  {perm.risk}
                                </span>
                                {perm.desc?.includes('Checker') && (
                                  <span className="roles-guardrail-tag">Checker</span>
                                )}
                                {perm.desc?.includes('Payer') && (
                                  <span className="roles-guardrail-tag">Payer</span>
                                )}
                              </div>
                            </div>
                            <p className="roles-feature-item-desc">
                              {isRoleManageRestricted
                                ? 'Reserved for root Organisation Admin; cannot be delegated.'
                                : perm.desc}
                            </p>
                          </div>
                        </label>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="roles-matrix-scroll">
            <table className="table roles-matrix">
              <caption>Function matrix — select granular actions per module</caption>
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
                      const isRoleManageRestricted = permission.code === 'roles.manage' && role.templateCode !== 'ORGANISATION_ADMIN';
                      const isDisabled = locked || isRoleManageRestricted || !enabled || busy || !!permission.requiresFeature;
                      return (
                        <td key={action}>
                          <input
                            type="checkbox"
                            aria-label={permission.code}
                            title={isRoleManageRestricted ? 'Reserved for Organisation Admin' : permission.guardrails.map(title).join('; ')}
                            checked={codes.includes(permission.code)}
                            disabled={isDisabled}
                            onChange={() => togglePermission(permission.code)}
                          />
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
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
            {copying ? 'Create Custom Role' : 'Save Role Features & Permissions'}
          </Button>
          {copying ? (
            <Button variant="secondary" onClick={onCancel}>Cancel Copy</Button>
          ) : role.status === 'ACTIVE' && (
            <Button variant="secondary" disabled={!enabled || busy} onClick={onDeactivate}>Deactivate Role</Button>
          )}
          {!copying && dirty && <span role="status" className="text-muted" style={{ fontSize: '0.875rem' }}>Unsaved changes ({codes.length} features selected)</span>}
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
