import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useMutation, useQueries, useQuery, useQueryClient } from '@tanstack/react-query';
import { masterDataApi, usersApi } from '../../api/client';
import { compensationApi } from '../../api/compensation';
import { canDecide, organizationAccessApi, orgProfileLinkAccess, scopeLabel } from '../../api/organizationAccess';
import { eligibleTransferCompensation } from './transferCompensationOptions.js';
import { useAuth } from '../../auth/AuthContext';
import { Card } from '../../components/ui/Card';
import { EmptyState } from '../../components/ui/EmptyState';
import { Input } from '../../components/ui/Input';
import { Button } from '../../components/ui/Button';
import { Badge } from '../../components/ui/Badge';
import { ConfirmationModal } from '../../components/ui/ConfirmationModal';
import './OrganisationStructurePage.css';

const ROW_FIELDS = ['number', 'code', 'name', 'address', 'phone'];
const RESPONSIBILITIES = ['BRANCH_MANAGER', 'SENIOR_MANAGER', 'GENERAL_MANAGER'];
const LEGACY_ACTION_ROLES = {
  'branches.view': ['ORG_ADMIN'], 'branches.manage': ['ORG_ADMIN'],
  'departments.view': ['ORG_ADMIN', 'HR_ADMIN'], 'departments.manage': ['ORG_ADMIN', 'HR_ADMIN'],
  'positions.view': ['ORG_ADMIN'], 'positions.manage': ['ORG_ADMIN'],
  'assignments.view': ['ORG_ADMIN'], 'assignments.manage': ['ORG_ADMIN'],
  'transfers.view': ['ORG_ADMIN'], 'transfers.manage': ['ORG_ADMIN'],
  'people.view': ['ORG_ADMIN', 'HR_ADMIN', 'HR_OFFICER', 'DEPARTMENT_HEAD', 'BRANCH_MANAGER'],
  'roles.manage': ['ORG_ADMIN'], 'users.manage': ['ORG_ADMIN'],
  'compensation.view': ['ORG_ADMIN', 'HR_ADMIN', 'HR_OFFICER', 'PAYROLL_OFFICER', 'APPROVING_AUTHORITY'],
  'compensation.approve': ['APPROVING_AUTHORITY'],
  'chart.view': ['ORG_ADMIN', 'HR_ADMIN', 'HR_OFFICER', 'ACCOUNTS_OFFICER', 'PAYROLL_OFFICER', 'APPROVING_AUTHORITY', 'DEPARTMENT_HEAD', 'BRANCH_MANAGER', 'EMPLOYEE'],
};
const TABS = [
  ['branches', 'Head Office & branches', 'branches.view'],
  ['departments', 'Departments', 'departments.view'],
  ['positions', 'Positions', 'positions.view'],
  ['assignments', 'Staffing', 'assignments.view'],
  ['responsibilities', 'Responsibilities', 'assignments.view'],
  ['import', 'Excel import', 'branches.manage'],
  ['transfers', 'Transfers', 'transfers.view'],
  ['chart', 'Organisation chart', 'chart.view'],
];
const blankBranch = { number: '', code: '', name: '', address: '', phone: '' };
const blankDepartment = { branchId: '', code: '', name: '' };
const blankPosition = { branchId: '', departmentId: '', code: '', name: '', postCadreId: '', reportsToPositionId: '', capacity: '1', leadershipVisible: false };
const blankTransfer = { employeeId: '', branchId: '', departmentId: '', positionId: '', effectiveDate: '', reason: '', compensationMode: 'none', compensationProposalId: '', catalogueId: '', postCode: '', stageNo: '' };

const rows = query => query.data?.rows || [];
const todayInBank = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date());
const isCurrent = (row, at = todayInBank()) => row?.status === 'ACTIVE' && row.effectiveFrom <= at && (!row.effectiveTo || row.effectiveTo >= at);
const active = row => row?.status === 'ACTIVE';
const formatScope = (assignment, branches, departments) => scopeLabel(assignment, branches, departments);

function LoadError({ error, recovery }) {
  if (!error) return null;
  return <div className="org-structure-error" role="alert">{error.message || 'Could not load this section.'}{recovery && <span> {recovery}</span>}</div>;
}

function AuthenticatedPhoto({ path, name }) {
  const [url, setUrl] = useState('');
  useEffect(() => {
    let mounted = true, objectUrl = '';
    setUrl('');
    if (!path) return undefined;
    organizationAccessApi.loadPhoto(path).then(value => {
      objectUrl = value;
      if (mounted) setUrl(value);
      else URL.revokeObjectURL(value);
    }).catch(() => {});
    return () => { mounted = false; if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [path]);
  return url ? <img className="org-chart-photo" src={url} alt={name ? `${name} photo` : ''} /> : <span className="org-chart-initial" aria-hidden="true">{name?.trim()?.[0]?.toUpperCase() || ''}</span>;
}

export function OrganisationStructurePage() {
  const { user, canPermission } = useAuth();
  const [params] = useSearchParams();
  const queryClient = useQueryClient();
  const initialEmployeeId = params.get('employee') || '';
  const [tab, setTab] = useState(initialEmployeeId ? 'transfers' : 'branches');
  const [pageError, setPageError] = useState('');
  const [branchForm, setBranchForm] = useState(blankBranch);
  const [branchEditing, setBranchEditing] = useState(null);
  const [headOfficeForm, setHeadOfficeForm] = useState(blankBranch);
  const [headOfficeConfirm, setHeadOfficeConfirm] = useState('');
  const [departmentForm, setDepartmentForm] = useState(blankDepartment);
  const [departmentEditing, setDepartmentEditing] = useState(null);
  const [positionForm, setPositionForm] = useState(blankPosition);
  const [positionEditing, setPositionEditing] = useState(null);
  const [assignmentForm, setAssignmentForm] = useState({ employeeId: '', branchId: '', departmentId: '', positionId: '', effectiveFrom: '', effectiveTo: '' });
  const [responsibilityForm, setResponsibilityForm] = useState({ employeeId: '', responsibility: 'BRANCH_MANAGER', scopeType: 'BRANCH', branchId: '', effectiveFrom: '', effectiveTo: '' });
  const [importEntity, setImportEntity] = useState('branches');
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState(null);
  const fileInput = useRef(null);
  const [chartLayout, setChartLayout] = useState('tree');
  const [transferForm, setTransferForm] = useState({ ...blankTransfer, employeeId: initialEmployeeId });
  const [roleStart, setRoleStart] = useState({ roleId: '', scopeType: '', branchId: '', departmentId: '' });
  const [roleStarts, setRoleStarts] = useState([]);
  const [closeRoleIds, setCloseRoleIds] = useState([]);
  const [retainRoleIds, setRetainRoleIds] = useState([]);
  const [deactivateTarget, setDeactivateTarget] = useState(null);
  const [branchLifecycle, setBranchLifecycle] = useState({ sourceBranchId: '', destinationBranchId: '', operation: 'MERGE', effectiveDate: todayInBank(), useStandalone: false, geofenceAction: 'ARCHIVE' });
  const [branchMergePreview, setBranchMergePreview] = useState(null);
  const [departmentMappings, setDepartmentMappings] = useState({});
  const [positionMappings, setPositionMappings] = useState({});

  const can = code => canPermission(code, LEGACY_ACTION_ROLES[code] || []);
  const profileLinks = orgProfileLinkAccess(canPermission);
  const branchQuery = useQuery({ queryKey: ['org-structure', 'branches'], queryFn: organizationAccessApi.branches, enabled: can('branches.view') });
  const departmentQuery = useQuery({ queryKey: ['org-structure', 'departments'], queryFn: organizationAccessApi.departments, enabled: can('departments.view') });
  const positionQuery = useQuery({ queryKey: ['org-structure', 'positions'], queryFn: organizationAccessApi.positions, enabled: can('positions.view') });
  const assignmentQuery = useQuery({ queryKey: ['org-structure', 'assignments'], queryFn: organizationAccessApi.organizationAssignments, enabled: can('assignments.view') });
  const responsibilityQuery = useQuery({ queryKey: ['org-structure', 'responsibilities'], queryFn: organizationAccessApi.responsibilities, enabled: can('assignments.view') });
  const chartQuery = useQuery({ queryKey: ['org-structure', 'chart'], queryFn: () => organizationAccessApi.chart(), enabled: can('chart.view') });
  const transferQuery = useQuery({ queryKey: ['org-structure', 'transfers'], queryFn: organizationAccessApi.transfers, enabled: can('transfers.view') });
  const employeeQuery = useQuery({ queryKey: ['org-structure', 'employees'], queryFn: () => masterDataApi.employees(), enabled: can('people.view') });
  const roleQuery = useQuery({ queryKey: ['org-structure', 'roles'], queryFn: organizationAccessApi.roles, enabled: can('roles.manage') });
  const orgUsersQuery = useQuery({ queryKey: ['org-structure', 'users', user?.organizationId], queryFn: () => usersApi.list(user.organizationId), enabled: can('roles.manage') && can('users.manage') && !!user?.organizationId });
  const postCadresQuery = useQuery({ queryKey: ['org-structure', 'post-cadres'], queryFn: () => masterDataApi.postCadres(), enabled: can('compensation.view') });

  const branches = rows(branchQuery);
  const departments = rows(departmentQuery);
  const positions = rows(positionQuery);
  const assignments = rows(assignmentQuery);
  const responsibilities = rows(responsibilityQuery);
  const employees = rows(employeeQuery).filter(employee => employee.status === 'ACTIVE');
  const roles = rows(roleQuery).filter(active);
  const postCadres = rows(postCadresQuery);
  const organizationUsers = rows(orgUsersQuery).filter(active);
  const currentAssignments = assignments.filter(row => isCurrent(row));
  const activeBranches = branches.filter(active);
  const activeDepartments = departments.filter(active);
  const activePositions = positions.filter(active);
  const headOffices = activeBranches.filter(branch => branch.unitType === 'HEAD_OFFICE' || branch.isHeadOffice);
  const employeeById = id => employees.find(employee => String(employee.id) === String(id));
  const branchById = id => branches.find(branch => String(branch.id) === String(id));
  const departmentById = id => departments.find(department => String(department.id) === String(id));
  const positionById = id => positions.find(position => String(position.id) === String(id));

  useEffect(() => {
    if (initialEmployeeId && employeeById(initialEmployeeId)) setTransferForm(form => ({ ...form, employeeId: initialEmployeeId }));
  }, [initialEmployeeId, employeeQuery.data]);

  const invalidateStructure = () => queryClient.invalidateQueries({ queryKey: ['org-structure'] });
  const structureWrite = useMutation({
    mutationFn: ({ action, input }) => action(input),
    onSuccess: (_, variables) => {
      invalidateStructure();
      setPageError('');
      if (variables.form === 'branch') { setBranchEditing(null); setBranchForm(blankBranch); }
      if (variables.form === 'department') { setDepartmentEditing(null); setDepartmentForm(blankDepartment); }
      if (variables.form === 'position') { setPositionEditing(null); setPositionForm(blankPosition); }
      if (variables.form === 'assignment') setAssignmentForm({ employeeId: '', branchId: '', departmentId: '', positionId: '', effectiveFrom: '', effectiveTo: '' });
      if (variables.form === 'responsibility') setResponsibilityForm({ employeeId: '', responsibility: 'BRANCH_MANAGER', scopeType: 'BRANCH', branchId: '', effectiveFrom: '', effectiveTo: '' });
      if (variables.form === 'head-office') { setHeadOfficeConfirm(''); setHeadOfficeForm(blankBranch); }
    },
    onError: error => setPageError(error.message || 'Could not save the organisation structure.'),
  });
  const previewMutation = useMutation({
    mutationFn: ({ entity, workbookFile }) => entity === 'branches'
      ? organizationAccessApi.previewBranchImport(workbookFile)
      : organizationAccessApi.previewStructureImport(entity, workbookFile),
    onSuccess: data => { setPreview(data); setPageError(''); },
    onError: error => { setPreview(null); setPageError(error.message || 'Could not preview this workbook.'); },
  });
  const applyImport = useMutation({
    mutationFn: ({ entity, payload }) => entity === 'branches'
      ? organizationAccessApi.applyBranchImport(payload)
      : organizationAccessApi.applyStructureImport(entity, payload),
    onSuccess: () => {
      invalidateStructure(); setPreview(null); setFile(null); setPageError('');
      if (fileInput.current) fileInput.current.value = '';
    },
    onError: error => setPageError(`${error.message || 'Could not apply this import.'} Resolve the reported conflict and preview the workbook again.`),
  });
  const transferMutation = useMutation({
    mutationFn: ({ action, input }) => action(input),
    onSuccess: () => { invalidateStructure(); setPageError(''); setRoleStarts([]); setCloseRoleIds([]); setRetainRoleIds([]); },
    onError: error => setPageError(error.message || 'Could not update the transfer.'),
  });
  const branchLifecycleMutation = useMutation({
    mutationFn: ({ action, input }) => action(input),
    onSuccess: data => { invalidateStructure(); setPageError(''); setBranchMergePreview(data?.counts ? data : null); },
    onError: error => setPageError(error.message || 'Could not complete the branch lifecycle action.'),
  });

  const previewMerge = () => branchLifecycleMutation.mutate({ action: organizationAccessApi.previewBranchMerge, input: { sourceBranchId: Number(branchLifecycle.sourceBranchId), destinationBranchId: Number(branchLifecycle.destinationBranchId) } });
  const prepareBranchLifecycle = () => {
    const source = branchById(branchLifecycle.sourceBranchId);
    const destination = branchLifecycle.useStandalone ? { name: 'Unassigned / Standalone' } : branchById(branchLifecycle.destinationBranchId);
    const isMerge = branchLifecycle.operation === 'MERGE';
    setDeactivateTarget({
      type: isMerge ? 'Branch merge' : 'Branch retirement', name: source?.name,
      details: { 'Source branch': source?.name, 'Destination': destination?.name, 'Effective date': branchLifecycle.effectiveDate, 'Current employees': branchMergePreview?.counts?.employees ?? currentAssignments.filter(row => String(row.branchId) === String(source?.id)).length },
      warning: isMerge ? `All current employees and mapped structure from ${source?.name} will move to ${destination?.name}. Historical records remain linked to their original branch.` : `${source?.name} will be archived and current employees will move to ${destination?.name} without a department or position. Payroll and geofenced attendance are blocked in the standalone holding branch.`,
      confirmLabel: isMerge ? 'Confirm Merge' : 'Confirm Retirement',
      action: () => branchLifecycleMutation.mutate({
        action: isMerge ? organizationAccessApi.applyBranchMerge : input => organizationAccessApi.retireBranch(Number(input.sourceBranchId), input),
        input: { ...branchLifecycle, sourceBranchId: Number(branchLifecycle.sourceBranchId), destinationBranchId: branchLifecycle.destinationBranchId ? Number(branchLifecycle.destinationBranchId) : null, departmentMappings, positionMappings },
      }),
    });
  };

  const canAnyImport = can('branches.manage') || can('departments.manage') || can('positions.manage') || can('assignments.manage');
  const visibleTabs = TABS.filter(([id, , permission]) => can(permission) || id === 'branches' && can('branches.manage') || id === 'departments' && can('departments.manage') || id === 'positions' && can('positions.manage') || id === 'assignments' && can('assignments.manage') || id === 'responsibilities' && can('assignments.manage') || id === 'import' && canAnyImport || id === 'transfers' && can('transfers.manage'));
  useEffect(() => { if (!visibleTabs.some(([id]) => id === tab)) setTab(visibleTabs[0]?.[0] || 'branches'); }, [visibleTabs, tab]);

  const allowedBranches = branches.filter(branch => active(branch) && branch.code !== '__STANDALONE__');
  const selectedTransferEmployee = employeeById(transferForm.employeeId);
  const linkedUsers = organizationUsers.filter(row => String(row.employeeId) === String(transferForm.employeeId));
  const linkedUser = linkedUsers.length === 1 ? linkedUsers[0] : null;
  const ambiguousUserLink = linkedUsers.length > 1;
  const roleAssignmentsQuery = useQuery({
    queryKey: ['org-structure', 'transfer-role-assignments', linkedUser?.id],
    queryFn: () => organizationAccessApi.assignments(linkedUser.id),
    enabled: can('roles.manage') && !!linkedUser?.id,
  });
  const userRoleAssignments = rows(roleAssignmentsQuery);
  const transferRows = rows(transferQuery);
  const compensationEmployeeIds = [...new Set([...transferRows.map(row => row.employeeId), transferForm.employeeId].filter(Boolean).map(String))];
  const transferCompensationQueries = useQueries({ queries: compensationEmployeeIds.map(employeeId => ({
    queryKey: ['org-structure', 'transfer-compensation', employeeId],
    queryFn: () => compensationApi.assignments(employeeId),
    enabled: can('compensation.view'),
  })) });
  const adoptionsQuery = useQuery({
    queryKey: ['org-structure', 'transfer-adoptions'],
    queryFn: compensationApi.adoptions,
    enabled: can('compensation.view'),
  });
  const compensationForEmployee = employeeId => {
    const index = compensationEmployeeIds.indexOf(String(employeeId));
    return index < 0 ? [] : rows(transferCompensationQueries[index]);
  };
  const employeeCompensation = compensationForEmployee(transferForm.employeeId);
  const transferDepartments = activeDepartments.filter(row => String(row.branchId) === String(transferForm.branchId));
  const transferPositions = activePositions.filter(row => String(row.branchId) === String(transferForm.branchId) && (!transferForm.departmentId || String(row.departmentId) === String(transferForm.departmentId)));
  const currentCompensation = eligibleTransferCompensation(employeeCompensation, selectedTransferEmployee?.directPay, transferForm.effectiveDate);
  const adoptedRevision = (adoptionsQuery.data?.history || []).filter(row => row.status === 'APPROVED' && row.effectiveDate <= transferForm.effectiveDate).sort((a, b) => b.effectiveDate.localeCompare(a.effectiveDate))[0];
  const adoptedCatalogue = adoptedRevision?.BankRuleCatalogue;
  const selectedCataloguePost = adoptedCatalogue?.posts?.find(row => row.code === transferForm.postCode);
  const currentRoleAssignments = userRoleAssignments.filter(row => row.status === 'ACTIVE' && row.effectiveFrom <= transferForm.effectiveDate && (!row.effectiveTo || row.effectiveTo >= transferForm.effectiveDate));
  const selectedRole = roles.find(role => String(role.id) === String(roleStart.roleId));
  const roleStartScopes = selectedRole?.allowedScopes || [];

  const saveBranch = event => {
    event.preventDefault(); setPageError('');
    structureWrite.mutate({ action: branchEditing ? value => { const { id, ...fields } = value; return organizationAccessApi.updateBranch(id, fields); } : organizationAccessApi.createBranch, input: branchEditing ? { id: branchEditing, ...branchForm } : branchForm, form: 'branch' });
  };
  const saveDepartment = event => {
    event.preventDefault(); setPageError('');
    const body = { ...departmentForm, branchId: Number(departmentForm.branchId) };
    structureWrite.mutate({ action: departmentEditing ? value => { const { id, ...fields } = value; return organizationAccessApi.updateDepartment(id, fields); } : organizationAccessApi.createDepartment, input: departmentEditing ? { id: departmentEditing, ...body } : body, form: 'department' });
  };
  const savePosition = event => {
    event.preventDefault(); setPageError('');
    const body = { ...positionForm, branchId: Number(positionForm.branchId), departmentId: Number(positionForm.departmentId), postCadreId: positionForm.postCadreId ? Number(positionForm.postCadreId) : null, reportsToPositionId: positionForm.reportsToPositionId ? Number(positionForm.reportsToPositionId) : null, capacity: Number(positionForm.capacity), leadershipVisible: !!positionForm.leadershipVisible };
    structureWrite.mutate({ action: positionEditing ? value => { const { id, ...fields } = value; return organizationAccessApi.updatePosition(id, fields); } : organizationAccessApi.createPosition, input: positionEditing ? { id: positionEditing, ...body } : body, form: 'position' });
  };
  const saveAssignment = event => {
    event.preventDefault(); setPageError('');
    structureWrite.mutate({ action: organizationAccessApi.assignEmployee, input: { ...assignmentForm, employeeId: Number(assignmentForm.employeeId), branchId: Number(assignmentForm.branchId), departmentId: assignmentForm.departmentId ? Number(assignmentForm.departmentId) : null, positionId: assignmentForm.positionId ? Number(assignmentForm.positionId) : null, effectiveTo: assignmentForm.effectiveTo || null }, form: 'assignment' });
  };
  const saveResponsibility = event => {
    event.preventDefault(); setPageError('');
    const body = { ...responsibilityForm, employeeId: Number(responsibilityForm.employeeId), branchId: responsibilityForm.scopeType === 'BRANCH' ? Number(responsibilityForm.branchId) : null, effectiveTo: responsibilityForm.effectiveTo || null };
    structureWrite.mutate({ action: organizationAccessApi.assignResponsibility, input: body, form: 'responsibility' });
  };
  const configureHeadOffice = event => {
    event.preventDefault(); setPageError('');
    structureWrite.mutate({ action: organizationAccessApi.configureHeadOffice, input: headOfficeForm, form: 'head-office' });
  };

  const updateTransferForm = patch => setTransferForm(form => ({ ...form, ...patch }));
  const resetTransferForEmployee = employeeId => {
    updateTransferForm({ ...blankTransfer, employeeId });
    setRoleStarts([]); setCloseRoleIds([]); setRetainRoleIds([]); setRoleStart({ roleId: '', scopeType: '', branchId: '', departmentId: '' });
  };
  const addRoleStart = () => {
    const scopeType = roleStart.scopeType || roleStartScopes[0];
    const row = { roleId: Number(roleStart.roleId), scopeType, branchIds: scopeType === 'SELECTED_BRANCHES' ? [Number(roleStart.branchId)] : [], departmentIds: scopeType === 'DEPARTMENT' ? [Number(roleStart.departmentId)] : [] };
    if (!row.roleId || !scopeType || scopeType === 'SELECTED_BRANCHES' && !row.branchIds[0] || scopeType === 'DEPARTMENT' && !row.departmentIds[0]) return;
    setRoleStarts(current => [...current, row]);
    setRoleStart({ roleId: '', scopeType: '', branchId: '', departmentId: '' });
  };
  const saveTransfer = event => {
    event.preventDefault(); setPageError('');
    const hasCurrentAssignment = currentAssignments.some(row => String(row.employeeId) === String(transferForm.employeeId));
    if (!hasCurrentAssignment) { setPageError('This employee has no current organisation assignment. Resolve the legacy assignment through Staffing before scheduling a transfer.'); return; }
    const input = {
      employeeId: Number(transferForm.employeeId), branchId: Number(transferForm.branchId),
      departmentId: transferForm.departmentId ? Number(transferForm.departmentId) : null,
      positionId: transferForm.positionId ? Number(transferForm.positionId) : null,
      effectiveDate: transferForm.effectiveDate, reason: transferForm.reason,
      ...(transferForm.compensationMode === 'reference' && transferForm.compensationProposalId ? { compensationProposalId: Number(transferForm.compensationProposalId) } : {}),
      ...(transferForm.compensationMode === 'catalogue' && adoptedRevision && transferForm.postCode && transferForm.stageNo ? { compensation: { catalogueId: Number(adoptedRevision.catalogueId), postCode: transferForm.postCode, stageNo: Number(transferForm.stageNo) } } : {}),
      ...(can('roles.manage') ? { roleChanges: { closeAssignmentIds: closeRoleIds, retainAssignmentIds: retainRoleIds, start: roleStarts } } : {}),
    };
    transferMutation.mutate({ action: organizationAccessApi.createTransfer, input });
  };
  const decideTransfer = (id, decision) => {
    const action = decision === 'APPROVED' ? organizationAccessApi.approveTransfer : organizationAccessApi.rejectTransfer;
    transferMutation.mutate({ action: value => action(value.id), input: { id } });
  };

  const chart = chartQuery.data || {};
  const chartEmployees = chart.employees || [];
  const chartUnits = [...new Map(chartEmployees.map(row => [String(row.branch.id), row.branch])).values()];
  const currentOccupants = (positionId, branchId) => currentAssignments.filter(row => String(row.positionId) === String(positionId) && String(row.branchId) === String(branchId)).length;
  const roleName = id => roles.find(role => String(role.id) === String(id))?.name || `Role #${id}`;

  return <div className="page org-structure-page">
    <header className="page-header">
      <div className="org-structure-heading">
        <div><h1>Organisation structure</h1><p>Manage units, reporting positions, employee assignments, and transfers from one authoritative workspace.</p></div>
        {profileLinks.canView && <Link className="org-profile-link" to="/org-profile">Organisation profile and board records</Link>}
      </div>
    </header>
    {pageError && <div className="org-structure-error" role="alert">{pageError}{/deactiv|dependent|capacity/i.test(pageError) && <span> Reassign affected employees or dependent positions and responsibilities, then retry.</span>}</div>}
    <nav className="org-structure-tabs" aria-label="Organisation structure sections">
      {visibleTabs.map(([id, label]) => <button key={id} type="button" className={tab === id ? 'is-active' : ''} aria-current={tab === id ? 'page' : undefined} onClick={() => setTab(id)}>{label}</button>)}
    </nav>

    {tab === 'branches' && <section aria-labelledby="org-units-heading">
      <div className="org-section-heading"><h2 id="org-units-heading">Head Office and branches</h2><p>Branch identity and status are owned by Organisation Admins.</p></div>
      <LoadError error={branchQuery.error} recovery="Refresh the page or ask an Organisation Admin to check branch access." />
      {can('branches.manage') && !can('branches.view') && <p className="org-structure-error" role="status">Viewing existing units requires branches.view. Ask an organisation administrator to grant it before changing Head Office or branch configuration.</p>}
      {can('branches.manage') && can('branches.view') && !branchQuery.error && !branchQuery.isLoading && headOffices.length === 0 && <Card title="Configure the Head Office">
        <p className="form-note">This creates the organisation’s single Head Office. Ordinary branch creation and import cannot create or replace it.</p>
        <form className="org-structure-form" onSubmit={configureHeadOffice}>
          <div className="form-grid">
            <Input id="head-office-number" label="Unit number" required value={headOfficeForm.number} onChange={event => setHeadOfficeForm({ ...headOfficeForm, number: event.target.value })} />
            <Input id="head-office-code" label="Unit code" required value={headOfficeForm.code} onChange={event => setHeadOfficeForm({ ...headOfficeForm, code: event.target.value })} />
            <Input id="head-office-name" label="Head Office name" required value={headOfficeForm.name} onChange={event => setHeadOfficeForm({ ...headOfficeForm, name: event.target.value })} />
            <Input id="head-office-phone" label="Phone" value={headOfficeForm.phone} onChange={event => setHeadOfficeForm({ ...headOfficeForm, phone: event.target.value })} />
            <Input id="head-office-address" label="Address" value={headOfficeForm.address} onChange={event => setHeadOfficeForm({ ...headOfficeForm, address: event.target.value })} />
            <Input id="head-office-confirm" label="Type HEAD OFFICE to confirm" required value={headOfficeConfirm} onChange={event => setHeadOfficeConfirm(event.target.value)} />
          </div>
          <Button type="submit" disabled={headOfficeConfirm !== 'HEAD OFFICE' || structureWrite.isPending} loading={structureWrite.isPending}>Configure the only Head Office</Button>
        </form>
      </Card>}
      {headOffices.length > 1 && <div className="org-structure-error" role="alert">Multiple active Head Office records are visible. Branch creation and import stay disabled until an organisation administrator resolves the configuration.</div>}
      {can('branches.manage') && activeBranches.some(branch => branch.unitType !== 'HEAD_OFFICE' && !branch.isHeadOffice && branch.code !== '__STANDALONE__') && <Card title="Branch lifecycle">
        <p className="form-note">Merge a branch into another working branch, or retire it after moving employees to a working or protected standalone destination. Audit and payroll history are never deleted.</p>
        <div className="form-grid">
          <div className="field"><label className="field-label" htmlFor="branch-lifecycle-source">Source branch</label><select id="branch-lifecycle-source" className="input" value={branchLifecycle.sourceBranchId} onChange={event => { setBranchLifecycle({ ...branchLifecycle, sourceBranchId: event.target.value }); setBranchMergePreview(null); }}><option value="">Select source</option>{activeBranches.filter(branch => branch.unitType !== 'HEAD_OFFICE' && !branch.isHeadOffice && branch.code !== '__STANDALONE__').map(branch => <option key={branch.id} value={branch.id}>{branch.name}</option>)}</select></div>
          <div className="field"><label className="field-label" htmlFor="branch-lifecycle-operation">Action</label><select id="branch-lifecycle-operation" className="input" value={branchLifecycle.operation} onChange={event => { setBranchLifecycle({ ...branchLifecycle, operation: event.target.value, useStandalone: false }); setBranchMergePreview(null); }}><option value="MERGE">Merge branch</option><option value="RETIRE">Retire branch</option></select></div>
          <div className="field"><label className="field-label" htmlFor="branch-lifecycle-destination">Destination branch</label><select id="branch-lifecycle-destination" className="input" disabled={branchLifecycle.useStandalone} value={branchLifecycle.destinationBranchId} onChange={event => { setBranchLifecycle({ ...branchLifecycle, destinationBranchId: event.target.value }); setBranchMergePreview(null); }}><option value="">Select destination</option>{activeBranches.filter(branch => String(branch.id) !== String(branchLifecycle.sourceBranchId) && branch.code !== '__STANDALONE__').map(branch => <option key={branch.id} value={branch.id}>{branch.name}</option>)}</select></div>
          <Input id="branch-lifecycle-date" label="Effective date" type="date" value={branchLifecycle.effectiveDate} onChange={event => setBranchLifecycle({ ...branchLifecycle, effectiveDate: event.target.value })} />
          {branchLifecycle.operation === 'MERGE' && <div className="field"><label className="field-label" htmlFor="branch-geofence-action">Source work location</label><select id="branch-geofence-action" className="input" value={branchLifecycle.geofenceAction} onChange={event => setBranchLifecycle({ ...branchLifecycle, geofenceAction: event.target.value })}><option value="ARCHIVE">Archive source location</option><option value="RETAIN_AS_ADDITIONAL">Retain as additional location</option></select></div>}
        </div>
        {branchLifecycle.operation === 'RETIRE' && <label className="org-check-row"><input type="checkbox" checked={branchLifecycle.useStandalone} onChange={event => setBranchLifecycle({ ...branchLifecycle, useStandalone: event.target.checked, destinationBranchId: event.target.checked ? '' : branchLifecycle.destinationBranchId })} /> Move employees to protected Unassigned / Standalone branch</label>}
        {branchMergePreview?.conflicts?.departments?.length > 0 && <div className="org-transfer-section"><h3>Map duplicate departments</h3>{branchMergePreview.conflicts.departments.map(conflict => <div className="field" key={conflict.id}><label className="field-label" htmlFor={`department-map-${conflict.id}`}>{conflict.name} ({conflict.code})</label><select id={`department-map-${conflict.id}`} className="input" value={departmentMappings[conflict.id] || ''} onChange={event => setDepartmentMappings({ ...departmentMappings, [conflict.id]: event.target.value })}><option value="">Select destination department</option>{activeDepartments.filter(row => String(row.branchId) === String(branchLifecycle.destinationBranchId)).map(row => <option key={row.id} value={row.id}>{row.name}</option>)}</select></div>)}</div>}
        {branchMergePreview?.conflicts?.positions?.length > 0 && <div className="org-transfer-section"><h3>Map duplicate positions</h3>{branchMergePreview.conflicts.positions.map(conflict => <div className="field" key={conflict.id}><label className="field-label" htmlFor={`position-map-${conflict.id}`}>{conflict.name} ({conflict.code})</label><select id={`position-map-${conflict.id}`} className="input" value={positionMappings[conflict.id] || ''} onChange={event => setPositionMappings({ ...positionMappings, [conflict.id]: event.target.value })}><option value="">Select destination position</option>{activePositions.filter(row => String(row.branchId) === String(branchLifecycle.destinationBranchId)).map(row => <option key={row.id} value={row.id}>{row.name}</option>)}</select></div>)}</div>}
        <div className="row-actions">{branchLifecycle.operation === 'MERGE' && <Button variant="secondary" onClick={previewMerge} disabled={!branchLifecycle.sourceBranchId || !branchLifecycle.destinationBranchId} loading={branchLifecycleMutation.isPending}>Preview merge</Button>}<Button variant="danger" onClick={prepareBranchLifecycle} disabled={!branchLifecycle.sourceBranchId || (!branchLifecycle.useStandalone && !branchLifecycle.destinationBranchId) || (branchLifecycle.operation === 'MERGE' && !branchMergePreview) || branchMergePreview?.conflicts?.departments?.some(row => !departmentMappings[row.id]) || branchMergePreview?.conflicts?.positions?.some(row => !positionMappings[row.id])}>Review and confirm</Button></div>
      </Card>}
      {can('branches.manage') && can('branches.view') && <Card title={branchEditing ? 'Edit unit' : 'Add branch'}>
        <form className="org-structure-form" onSubmit={saveBranch}>
          <div className="form-grid">
            <Input id="branch-number" label="Branch number" required value={branchForm.number} onChange={event => setBranchForm({ ...branchForm, number: event.target.value })} />
            <Input id="branch-code" label="Branch code" required value={branchForm.code} onChange={event => setBranchForm({ ...branchForm, code: event.target.value })} />
            <Input id="branch-name" label="Branch name" required value={branchForm.name} onChange={event => setBranchForm({ ...branchForm, name: event.target.value })} />
            <Input id="branch-phone" label="Phone" value={branchForm.phone} onChange={event => setBranchForm({ ...branchForm, phone: event.target.value })} />
            <Input id="branch-address" label="Address" value={branchForm.address} onChange={event => setBranchForm({ ...branchForm, address: event.target.value })} />
          </div>
          <div className="row-actions"><Button type="submit" loading={structureWrite.isPending} disabled={!branchEditing && headOffices.length !== 1}>{branchEditing ? 'Save unit' : 'Create branch'}</Button>{branchEditing && <Button type="button" variant="secondary" onClick={() => { setBranchEditing(null); setBranchForm(blankBranch); }}>Cancel</Button>}</div>
        </form>
      </Card>}
      <Card title="Organisation units" noPadding>
        {!can('branches.view') ? <EmptyState title="Unit records are not available" description="Ask an organisation administrator for branches.view access." /> : branchQuery.isLoading ? <p className="org-section-state">Loading organisation units…</p> : branches.length ? <div className="org-table-scroll"><table className="table"><thead><tr><th>Unit</th><th>Number</th><th>Code</th><th>Address</th><th>Status</th><th>Visible current occupants</th>{can('branches.manage') && <th>Actions</th>}</tr></thead><tbody>
          {branches.map(branch => { const isHeadOffice = branch.unitType === 'HEAD_OFFICE' || branch.isHeadOffice; return <tr key={branch.id}><td>{branch.name} {isHeadOffice ? <Badge variant="info">Head Office</Badge> : <Badge>Branch</Badge>}</td><td className="mono">{branch.number || '—'}</td><td className="mono">{branch.code || '—'}</td><td>{branch.address || '—'}</td><td><Badge variant={active(branch) ? 'success' : 'default'}>{branch.status}</Badge></td><td>{!can('assignments.view') || assignmentQuery.error ? '—' : assignmentQuery.isLoading ? 'Loading…' : currentAssignments.filter(row => String(row.branchId) === String(branch.id)).length}</td>{can('branches.manage') && <td><div className="row-actions"><Button size="sm" variant="secondary" onClick={() => { setBranchEditing(branch.id); setBranchForm({ number: branch.number || '', code: branch.code || '', name: branch.name || '', address: branch.address || '', phone: branch.phone || '' }); }}>Edit</Button>{active(branch) && !isHeadOffice && branch.code !== '__STANDALONE__' && <Button size="sm" variant="secondary" onClick={() => { setBranchLifecycle({ ...branchLifecycle, sourceBranchId: String(branch.id) }); setBranchMergePreview(null); }}>Manage lifecycle</Button>}</div></td>}</tr>; })}
        </tbody></table></div> : <EmptyState title="No organisation units available" description={can('branches.manage') ? 'Configure the Head Office before adding branches.' : 'Ask an Organisation Admin to configure the organisation units.'} />}
      </Card>
    </section>}

    {tab === 'departments' && <section aria-labelledby="org-departments-heading">
      <div className="org-section-heading"><h2 id="org-departments-heading">Departments</h2><p>Each department belongs to Head Office or one active branch.</p></div>
      <LoadError error={departmentQuery.error} recovery="Department access requires the matching organisation permission." />
      {can('departments.manage') && (!can('branches.view') || !can('departments.view')) && <p className="org-structure-error" role="status">Department changes require branches.view and departments.view to select a real unit and check existing records.</p>}
      {can('departments.manage') && can('branches.view') && can('departments.view') && <Card title={departmentEditing ? 'Edit department' : 'Add department'}>
        <form className="org-structure-form" onSubmit={saveDepartment}><div className="form-grid">
          <div className="field"><label className="field-label" htmlFor="department-branch">Head Office or branch</label><select id="department-branch" className="input" required value={departmentForm.branchId} onChange={event => setDepartmentForm({ ...departmentForm, branchId: event.target.value })}><option value="">Select a unit</option>{allowedBranches.map(branch => <option key={branch.id} value={branch.id}>{branch.name}</option>)}</select></div>
          <Input id="department-code" label="Department code" required value={departmentForm.code} onChange={event => setDepartmentForm({ ...departmentForm, code: event.target.value })} />
          <Input id="department-name" label="Department name" required value={departmentForm.name} onChange={event => setDepartmentForm({ ...departmentForm, name: event.target.value })} />
        </div><div className="row-actions"><Button type="submit" loading={structureWrite.isPending}>{departmentEditing ? 'Save department' : 'Create department'}</Button>{departmentEditing && <Button type="button" variant="secondary" onClick={() => { setDepartmentEditing(null); setDepartmentForm(blankDepartment); }}>Cancel</Button>}</div></form>
      </Card>}
      <Card title="Department records" noPadding>{departmentQuery.isLoading ? <p className="org-section-state">Loading departments…</p> : departments.length ? <div className="org-table-scroll"><table className="table"><thead><tr><th>Department</th><th>Code</th><th>Unit</th><th>Status</th>{can('departments.manage') && <th>Actions</th>}</tr></thead><tbody>{departments.map(row => <tr key={row.id}><td>{row.name}</td><td className="mono">{row.code}</td><td>{branchById(row.branchId)?.name || `Unit #${row.branchId}`}</td><td><Badge variant={active(row) ? 'success' : 'default'}>{row.status}</Badge></td>{can('departments.manage') && <td><div className="row-actions"><Button size="sm" variant="secondary" onClick={() => { setDepartmentEditing(row.id); setDepartmentForm({ branchId: String(row.branchId), code: row.code, name: row.name }); }}>Edit</Button>{active(row) && <Button size="sm" variant="secondary" onClick={() => setDeactivateTarget({ type: 'Department', item: row, name: row.name, details: { 'Department Code': row.code, 'Unit': branchById(row.branchId)?.name, 'Current employees': currentAssignments.filter(assignment => String(assignment.departmentId) === String(row.id)).length }, warning: `Archiving ${row.name} will keep employees in ${branchById(row.branchId)?.name || 'their current branch'} while clearing their department and position. Historical assignments remain available.`, confirmLabel: 'Confirm Archive', action: () => structureWrite.mutate({ action: input => organizationAccessApi.archiveDepartment(input, { effectiveDate: todayInBank() }), input: row.id }) })}>Archive</Button>}</div></td>}</tr>)}</tbody></table></div> : <EmptyState title="No departments recorded" description="Create a department under Head Office or an active branch." />}</Card>
    </section>}

    {tab === 'positions' && <section aria-labelledby="org-positions-heading">
      <div className="org-section-heading"><h2 id="org-positions-heading">Positions and reporting lines</h2><p>Reporting is position-based. Capacity is enforced when assignments overlap.</p></div>
      <LoadError error={positionQuery.error} recovery="Check position access and active department assignments." />
      {can('positions.manage') && (!can('branches.view') || !can('departments.view') || !can('positions.view')) && <p className="org-structure-error" role="status">Position changes require branch, department, and position view permissions to choose reporting parents and check existing records.</p>}
      {can('positions.manage') && can('branches.view') && can('departments.view') && can('positions.view') && <Card title={positionEditing ? 'Edit position' : 'Add position'}>
        <form className="org-structure-form" onSubmit={savePosition}><div className="form-grid">
          <div className="field"><label className="field-label" htmlFor="position-branch">Unit</label><select id="position-branch" className="input" required value={positionForm.branchId} onChange={event => setPositionForm({ ...positionForm, branchId: event.target.value, departmentId: '', reportsToPositionId: '', leadershipVisible: false })}><option value="">Select a unit</option>{allowedBranches.map(branch => <option key={branch.id} value={branch.id}>{branch.name}</option>)}</select></div>
          <div className="field"><label className="field-label" htmlFor="position-department">Department</label><select id="position-department" className="input" required value={positionForm.departmentId} onChange={event => setPositionForm({ ...positionForm, departmentId: event.target.value })}><option value="">Select a department</option>{activeDepartments.filter(row => String(row.branchId) === String(positionForm.branchId)).map(row => <option key={row.id} value={row.id}>{row.name}</option>)}</select></div>
          <Input id="position-code" label="Position code" required value={positionForm.code} onChange={event => setPositionForm({ ...positionForm, code: event.target.value })} />
          <Input id="position-name" label="Position name" required value={positionForm.name} onChange={event => setPositionForm({ ...positionForm, name: event.target.value })} />
          <Input id="position-capacity" label="Capacity" type="number" min="1" step="1" required value={positionForm.capacity} onChange={event => setPositionForm({ ...positionForm, capacity: event.target.value })} />
          <div className="field"><label className="field-label" htmlFor="position-parent">Reports to position</label><select id="position-parent" className="input" value={positionForm.reportsToPositionId} onChange={event => setPositionForm({ ...positionForm, reportsToPositionId: event.target.value })}><option value="">No reporting parent</option>{activePositions.filter(position => position.status === 'ACTIVE' && String(position.id) !== String(positionEditing) && (String(position.branchId) === String(positionForm.branchId) || (branchById(position.branchId)?.unitType === 'HEAD_OFFICE' && position.leadershipVisible))).map(position => <option key={position.id} value={position.id}>{position.name} · {branchById(position.branchId)?.name || 'Unit'}</option>)}</select></div>
          <div className="field"><label className="field-label" htmlFor="position-cadre">Linked post cadre (optional)</label><select id="position-cadre" className="input" value={positionForm.postCadreId} onChange={event => setPositionForm({ ...positionForm, postCadreId: event.target.value })}><option value="">No linked post</option>{postCadres.map(row => <option key={row.id} value={row.id}>{row.name}</option>)}</select></div>
        </div>
        {branchById(positionForm.branchId)?.unitType === 'HEAD_OFFICE' && <label className="org-check-row"><input type="checkbox" checked={positionForm.leadershipVisible} onChange={event => setPositionForm({ ...positionForm, leadershipVisible: event.target.checked })} /> Include current occupants in employee-facing Head Office leadership</label>}
        <div className="row-actions"><Button type="submit" loading={structureWrite.isPending}>{positionEditing ? 'Save position' : 'Create position'}</Button>{positionEditing && <Button type="button" variant="secondary" onClick={() => { setPositionEditing(null); setPositionForm(blankPosition); }}>Cancel</Button>}</div></form>
      </Card>}
      <Card title="Position records" noPadding>{positionQuery.isLoading ? <p className="org-section-state">Loading positions…</p> : positions.length ? <div className="org-table-scroll"><table className="table"><thead><tr><th>Position</th><th>Code</th><th>Department / unit</th><th>Reports to</th><th>Visible occupants / capacity</th><th>Leadership</th><th>Status</th>{can('positions.manage') && <th>Actions</th>}</tr></thead><tbody>{positions.map(row => <tr key={row.id}><td>{row.name}</td><td className="mono">{row.code}</td><td>{departmentById(row.departmentId)?.name || '—'} · {branchById(row.branchId)?.name || '—'}</td><td>{positionById(row.reportsToPositionId)?.name || '—'}</td><td>{!can('assignments.view') || assignmentQuery.error ? '—' : assignmentQuery.isLoading ? 'Loading…' : `${currentOccupants(row.id, row.branchId)} / ${row.capacity}`}</td><td>{row.leadershipVisible ? 'Head Office leadership' : '—'}</td><td><Badge variant={active(row) ? 'success' : 'default'}>{row.status}</Badge></td>{can('positions.manage') && <td><div className="row-actions"><Button size="sm" variant="secondary" onClick={() => { setPositionEditing(row.id); setPositionForm({ branchId: String(row.branchId), departmentId: String(row.departmentId), code: row.code, name: row.name, postCadreId: row.postCadreId ? String(row.postCadreId) : '', reportsToPositionId: row.reportsToPositionId ? String(row.reportsToPositionId) : '', capacity: String(row.capacity), leadershipVisible: !!row.leadershipVisible }); }}>Edit</Button>{active(row) && <Button size="sm" variant="secondary" onClick={() => setDeactivateTarget({ type: 'Position', item: row, name: row.name, details: { 'Position Code': row.code, 'Department': departmentById(row.departmentId)?.name, 'Unit': branchById(row.branchId)?.name, 'Capacity': row.capacity }, warning: `Deactivating ${row.name} will prevent new assignments. Reassign occupants and reporting positions first.`, action: () => structureWrite.mutate({ action: organizationAccessApi.deactivatePosition, input: row.id }) })}>Deactivate</Button>}</div></td>}</tr>)}</tbody></table></div> : <EmptyState title="No positions recorded" description="Add positions after their branch and department are configured." />}</Card>
    </section>}

    {tab === 'assignments' && <section aria-labelledby="org-staffing-heading">
      <div className="org-section-heading"><h2 id="org-staffing-heading">Employee assignments</h2><p>One primary organisation assignment applies on an effective date. Use Transfers for employees who already have a current assignment.</p></div>
      <LoadError error={assignmentQuery.error || employeeQuery.error} recovery="Check employee and assignment permissions, then retry." />
      {can('assignments.manage') && (!can('assignments.view') || !can('branches.view')) && <p className="org-structure-error" role="status">Safe assignment requires assignments.view and branches.view so current assignments and destination units can be checked.</p>}
      {can('assignments.manage') && can('assignments.view') && can('branches.view') && <Card title="Assign an unassigned employee">
        <form className="org-structure-form" onSubmit={saveAssignment}><div className="form-grid">
          <div className="field"><label className="field-label" htmlFor="assignment-employee">Employee</label><select id="assignment-employee" className="input" required value={assignmentForm.employeeId} onChange={event => setAssignmentForm({ ...assignmentForm, employeeId: event.target.value })}><option value="">Select an employee</option>{employees.filter(employee => !currentAssignments.some(row => String(row.employeeId) === String(employee.id))).map(employee => <option key={employee.id} value={employee.id}>{employee.name} · {employee.empCode}</option>)}</select></div>
          <div className="field"><label className="field-label" htmlFor="assignment-branch">Branch or Head Office</label><select id="assignment-branch" className="input" required value={assignmentForm.branchId} onChange={event => setAssignmentForm({ ...assignmentForm, branchId: event.target.value, departmentId: '', positionId: '' })}><option value="">Select a unit</option>{allowedBranches.map(branch => <option key={branch.id} value={branch.id}>{branch.name}</option>)}</select></div>
          <div className="field"><label className="field-label" htmlFor="assignment-department">Department (optional)</label><select id="assignment-department" className="input" value={assignmentForm.departmentId} onChange={event => setAssignmentForm({ ...assignmentForm, departmentId: event.target.value, positionId: '' })}><option value="">No department</option>{activeDepartments.filter(row => String(row.branchId) === String(assignmentForm.branchId)).map(row => <option key={row.id} value={row.id}>{row.name}</option>)}</select></div>
          <div className="field"><label className="field-label" htmlFor="assignment-position">Position (optional)</label><select id="assignment-position" className="input" value={assignmentForm.positionId} onChange={event => { const position = activePositions.find(row => String(row.id) === event.target.value); setAssignmentForm(value => ({ ...value, positionId: event.target.value, ...(position?.departmentId ? { departmentId: String(position.departmentId) } : {}) })); }}><option value="">No position</option>{activePositions.filter(row => String(row.branchId) === String(assignmentForm.branchId) && String(row.departmentId) === String(assignmentForm.departmentId)).map(row => <option key={row.id} value={row.id}>{row.name}</option>)}</select></div>
          <Input id="assignment-effective-from" label="Effective from" type="date" required value={assignmentForm.effectiveFrom} onChange={event => setAssignmentForm({ ...assignmentForm, effectiveFrom: event.target.value })} />
          <Input id="assignment-effective-to" label="Effective to (optional)" type="date" value={assignmentForm.effectiveTo} onChange={event => setAssignmentForm({ ...assignmentForm, effectiveTo: event.target.value })} />
        </div><Button type="submit" loading={structureWrite.isPending} disabled={!employees.length}>Create assignment</Button></form>
      </Card>}
      <Card title="Assignment history" noPadding>{assignmentQuery.isLoading ? <p className="org-section-state">Loading assignments…</p> : assignments.length ? <div className="org-table-scroll"><table className="table"><thead><tr><th>Employee</th><th>Branch</th><th>Department</th><th>Position</th><th>Effective from</th><th>Effective to</th><th>Status</th></tr></thead><tbody>{assignments.map(row => <tr key={row.id}><td>{employeeById(row.employeeId)?.name || `Employee #${row.employeeId}`}</td><td>{branchById(row.branchId)?.name || `Unit #${row.branchId}`}</td><td>{departmentById(row.departmentId)?.name || '—'}</td><td>{positionById(row.positionId)?.name || '—'}</td><td className="mono">{row.effectiveFrom}</td><td className="mono">{row.effectiveTo || 'Current'}</td><td><Badge variant={isCurrent(row) ? 'success' : 'default'}>{isCurrent(row) ? 'Current' : row.status}</Badge></td></tr>)}</tbody></table></div> : <EmptyState title="No assignments recorded" description="Assign legacy employees here or create new employees with a branch and effective date." />}</Card>
    </section>}

    {tab === 'responsibilities' && <section aria-labelledby="org-responsibilities-heading">
      <div className="org-section-heading"><h2 id="org-responsibilities-heading">Controlled responsibilities</h2><p>Authority comes from these dated assignments, never from a title, position, or pay grade.</p></div>
      <LoadError error={responsibilityQuery.error || employeeQuery.error} recovery="Check assignment and employee permissions, then retry." />
      {can('assignments.manage') && (!can('branches.view') || !can('assignments.view')) && <p className="org-structure-error" role="status">Responsibility assignment requires branches.view and assignments.view to choose a real scope and check existing records.</p>}
      {can('assignments.manage') && can('branches.view') && can('assignments.view') && <Card title="Assign responsibility">
        <form className="org-structure-form" onSubmit={saveResponsibility}><div className="form-grid">
          <div className="field"><label className="field-label" htmlFor="responsibility-employee">Employee</label><select id="responsibility-employee" className="input" required value={responsibilityForm.employeeId} onChange={event => setResponsibilityForm({ ...responsibilityForm, employeeId: event.target.value })}><option value="">Select an employee</option>{employees.map(employee => <option key={employee.id} value={employee.id}>{employee.name} · {employee.empCode}</option>)}</select></div>
          <div className="field"><label className="field-label" htmlFor="responsibility-type">Responsibility</label><select id="responsibility-type" className="input" value={responsibilityForm.responsibility} onChange={event => setResponsibilityForm({ ...responsibilityForm, responsibility: event.target.value, scopeType: event.target.value === 'GENERAL_MANAGER' ? 'ORGANISATION' : 'BRANCH', branchId: '' })}>{RESPONSIBILITIES.map(value => <option key={value} value={value}>{value.replaceAll('_', ' ').toLowerCase().replace(/\b\w/g, letter => letter.toUpperCase())}</option>)}</select></div>
          {responsibilityForm.responsibility === 'SENIOR_MANAGER' && <div className="field"><label className="field-label" htmlFor="responsibility-scope">Scope</label><select id="responsibility-scope" className="input" value={responsibilityForm.scopeType} onChange={event => setResponsibilityForm({ ...responsibilityForm, scopeType: event.target.value, branchId: '' })}><option value="BRANCH">Branch</option><option value="ORGANISATION">Organisation</option></select></div>}
          {responsibilityForm.scopeType === 'BRANCH' && <div className="field"><label className="field-label" htmlFor="responsibility-branch">Branch</label><select id="responsibility-branch" className="input" required value={responsibilityForm.branchId} onChange={event => setResponsibilityForm({ ...responsibilityForm, branchId: event.target.value })}><option value="">Select a branch</option>{allowedBranches.filter(branch => branch.unitType !== 'HEAD_OFFICE').map(branch => <option key={branch.id} value={branch.id}>{branch.name}</option>)}</select></div>}
          <Input id="responsibility-effective-from" label="Effective from" type="date" required value={responsibilityForm.effectiveFrom} onChange={event => setResponsibilityForm({ ...responsibilityForm, effectiveFrom: event.target.value })} />
          <Input id="responsibility-effective-to" label="Effective to (optional)" type="date" value={responsibilityForm.effectiveTo} onChange={event => setResponsibilityForm({ ...responsibilityForm, effectiveTo: event.target.value })} />
        </div><Button type="submit" loading={structureWrite.isPending} disabled={!employees.length}>Save responsibility</Button></form>
      </Card>}
      <Card title="Responsibility history" noPadding>{responsibilityQuery.isLoading ? <p className="org-section-state">Loading responsibilities…</p> : responsibilities.length ? <div className="org-table-scroll"><table className="table"><thead><tr><th>Employee</th><th>Responsibility</th><th>Scope</th><th>Effective from</th><th>Effective to</th><th>Status</th></tr></thead><tbody>{responsibilities.map(row => <tr key={row.id}><td>{employeeById(row.employeeId)?.name || `Employee #${row.employeeId}`}</td><td>{row.responsibility.replaceAll('_', ' ').toLowerCase().replace(/\b\w/g, letter => letter.toUpperCase())}</td><td>{row.scopeType === 'ORGANISATION' ? 'Organisation' : branchById(row.branchId)?.name || `Branch #${row.branchId}`}</td><td className="mono">{row.effectiveFrom}</td><td className="mono">{row.effectiveTo || 'Current'}</td><td><Badge variant={isCurrent(row) ? 'success' : 'default'}>{isCurrent(row) ? 'Current' : row.status}</Badge></td></tr>)}</tbody></table></div> : <EmptyState title="No responsibilities assigned" description="Assign branch, senior, or general manager responsibility with an explicit scope and date." />}</Card>
    </section>}

    {tab === 'import' && (() => {
      const IMPORT_CONFIG = {
        branches: { label: 'Head Office & Branches', perm: 'branches.manage', cols: ROW_FIELDS },
        departments: { label: 'Departments', perm: 'departments.manage', cols: ['branchCode', 'code', 'name', 'displayOrder'] },
        positions: { label: 'Positions', perm: 'positions.manage', cols: ['branchCode', 'departmentCode', 'code', 'name', 'postCadreCode', 'capacity', 'reportsToCode', 'leadershipVisible'] },
        staffing: { label: 'Staffing (Assignments)', perm: 'assignments.manage', cols: ['empCode', 'branchCode', 'departmentCode', 'positionCode', 'effectiveFrom', 'effectiveTo'] },
        responsibilities: { label: 'Responsibilities', perm: 'assignments.manage', cols: ['empCode', 'responsibility', 'scopeType', 'branchCode', 'effectiveFrom', 'effectiveTo'] },
      };
      const cfg = IMPORT_CONFIG[importEntity] || IMPORT_CONFIG.branches;
      const canImportEntity = can(cfg.perm);
      const isSigned = Boolean(preview?.previewSignature);
      const needsHo = importEntity === 'branches' && headOffices.length !== 1;
      const downloadTemplate = () => (importEntity === 'branches'
        ? organizationAccessApi.downloadBranchTemplate()
        : organizationAccessApi.downloadStructureTemplate(importEntity)
      ).catch(error => setPageError(error.message));
      const applyPayload = importEntity === 'branches'
        ? { rows: preview?.rows, errors: preview?.errors, previewSignature: preview?.previewSignature }
        : preview;

      return <section aria-labelledby="org-import-heading">
        <div className="org-section-heading"><h2 id="org-import-heading">Organisation structure workbook import</h2><p>Bulk import branches, departments, positions, staffing assignments, and responsibilities from `.xlsx` templates.</p></div>
        <LoadError error={previewMutation.error} recovery="Correct the workbook and preview it again." />
        <Card title="Select structure type & preview workbook">
          <div className="field" style={{ maxWidth: '320px', marginBottom: '1rem' }}>
            <label className="field-label" htmlFor="structure-import-entity">Structure type</label>
            <select id="structure-import-entity" className="input" value={importEntity} onChange={event => { setImportEntity(event.target.value); setFile(null); setPreview(null); setPageError(''); if (fileInput.current) fileInput.current.value = ''; }}>
              {Object.entries(IMPORT_CONFIG).map(([key, item]) => (
                <option key={key} value={key} disabled={!can(item.perm)}>{item.label}</option>
              ))}
            </select>
          </div>
          <p className="form-note">Use one `.xlsx` sheet with 1–1,000 rows and no more than 2 MiB. The workbook is processed for preview and is not stored.</p>
          <div className="org-import-actions">
            <Button variant="secondary" onClick={downloadTemplate} disabled={!canImportEntity}>Download .xlsx template</Button>
            <Button variant="secondary" onClick={() => organizationAccessApi.exportStructureData(importEntity).catch(error => setPageError(error.message))} disabled={!canImportEntity}>Export current data (.xlsx)</Button>
            <Input ref={fileInput} id="branch-workbook" className="org-file-picker" label="Select .xlsx workbook" type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" disabled={!canImportEntity} onChange={event => { const next = event.target.files?.[0] || null; setFile(next); setPreview(null); setPageError(''); }} />
            <Button variant="secondary" onClick={() => file && previewMutation.mutate({ entity: importEntity, workbookFile: file })} loading={previewMutation.isPending} disabled={!canImportEntity || !file || needsHo}>Preview workbook</Button>
          </div>
          {needsHo && <p className="field-hint">Configure exactly one active Head Office before importing branches.</p>}
          {file && <p className="field-hint">Selected: {file.name} · {(file.size / (1024 * 1024)).toFixed(2)} MiB. Limits: 2 MiB and 1,000 rows.</p>}
          {preview && <div className="org-import-preview" aria-live="polite">
            <div className="org-preview-heading"><strong>{preview.errors?.length ? 'Preview needs corrections' : 'Server preview is ready'}</strong><span>{preview.rows?.length || 0} rows · {preview.errors?.length || 0} errors</span>{isSigned && <Badge variant="success">Signed preview</Badge>}</div>
            {preview.errors?.length > 0 && <div className="org-import-errors"><h3>Row errors</h3><ul>{preview.errors.map((row, index) => <li key={`${row.row}-${row.field}-${index}`}>Row {row.row} · {row.field}: {row.message}</li>)}</ul></div>}
            {preview.rows?.length > 0 && <div className="org-table-scroll"><table className="table"><thead><tr>{cfg.cols.map(field => <th key={field}>{field === 'code' ? 'Code' : field.replace(/([A-Z])/g, ' $1').replace(/^./, s => s.toUpperCase())}</th>)}</tr></thead><tbody>{preview.rows.map((row, index) => <tr key={index}>{cfg.cols.map(field => <td key={field}>{String(row[field] ?? '') || '—'}</td>)}</tr>)}</tbody></table></div>}
            <Button onClick={() => applyImport.mutate({ entity: importEntity, payload: applyPayload })} loading={applyImport.isPending} disabled={!canImportEntity || !isSigned || !!preview.errors?.length}>Apply import</Button>
          </div>}
        </Card>
      </section>;
    })()}

    {tab === 'transfers' && <section aria-labelledby="org-transfers-heading">
      <div className="org-section-heading"><h2 id="org-transfers-heading">Employee transfers</h2><p>Branch, department, position, pay reference, and role scopes move together on the effective date.</p></div>
      <LoadError error={transferQuery.error || roleAssignmentsQuery.error || adoptionsQuery.error || transferCompensationQueries.find(query => query.error)?.error} recovery="Check transfer, role, and compensation permissions, then retry." />
      {can('transfers.manage') && (!can('assignments.view') || !can('branches.view')) && <p className="org-structure-error" role="status">Transfer scheduling requires assignments.view and branches.view to verify the employee’s current structure and destination before preparing the bundle.</p>}
      {can('transfers.manage') && can('assignments.view') && can('branches.view') && <Card title="Schedule transfer">
        <form className="org-structure-form" onSubmit={saveTransfer}>
          <div className="form-grid">
            <div className="field"><label className="field-label" htmlFor="transfer-employee">Employee</label><select id="transfer-employee" className="input" required value={transferForm.employeeId} onChange={event => resetTransferForEmployee(event.target.value)}><option value="">Select an employee</option>{employees.map(employee => <option key={employee.id} value={employee.id}>{employee.name} · {employee.empCode}</option>)}</select></div>
            <Input id="transfer-effective-date" label="Effective date" type="date" required value={transferForm.effectiveDate} onChange={event => updateTransferForm({ effectiveDate: event.target.value, compensationProposalId: '', catalogueId: '', postCode: '', stageNo: '' })} />
            <div className="field"><label className="field-label" htmlFor="transfer-branch">Destination branch or Head Office</label><select id="transfer-branch" className="input" required value={transferForm.branchId} onChange={event => updateTransferForm({ branchId: event.target.value, departmentId: '', positionId: '' })}><option value="">Select destination</option>{allowedBranches.map(branch => <option key={branch.id} value={branch.id}>{branch.name}</option>)}</select></div>
            <div className="field"><label className="field-label" htmlFor="transfer-department">Destination department (optional)</label><select id="transfer-department" className="input" value={transferForm.departmentId} onChange={event => updateTransferForm({ departmentId: event.target.value, positionId: '' })}><option value="">No department</option>{transferDepartments.map(row => <option key={row.id} value={row.id}>{row.name}</option>)}</select></div>
            <div className="field"><label className="field-label" htmlFor="transfer-position">Destination position (optional)</label><select id="transfer-position" className="input" value={transferForm.positionId} onChange={event => { const position = transferPositions.find(row => String(row.id) === event.target.value); updateTransferForm({ positionId: event.target.value, ...(position?.departmentId ? { departmentId: String(position.departmentId) } : {}) }); }}><option value="">No position</option>{transferPositions.map(row => <option key={row.id} value={row.id}>{row.name}</option>)}</select></div>
            <Input id="transfer-reason" label="Transfer reason" required value={transferForm.reason} onChange={event => updateTransferForm({ reason: event.target.value })} />
          </div>
          <fieldset className="org-transfer-section"><legend>Compensation selection</legend><p className="form-note">Select an existing assignment reference or a government catalogue post and stage. Government amounts are calculated by the catalogue.</p>
            <div className="field"><label className="field-label" htmlFor="transfer-compensation-mode">Compensation change</label><select id="transfer-compensation-mode" className="input" value={transferForm.compensationMode} onChange={event => updateTransferForm({ compensationMode: event.target.value, compensationProposalId: '', catalogueId: '', postCode: '', stageNo: '' })}><option value="none">No compensation change</option><option value="reference" disabled={!can('compensation.view')}>Use an existing compensation reference</option>{!selectedTransferEmployee?.directPay && <option value="catalogue" disabled={!can('compensation.view')}>Select a government catalogue stage</option>}</select></div>
            {!can('compensation.view') && <p className="field-hint">Compensation references and catalogue selections require compensation.view access.</p>}
            {transferForm.compensationMode === 'reference' && <div className="field"><label className="field-label" htmlFor="transfer-compensation-reference">Compensation assignment reference</label><select id="transfer-compensation-reference" className="input" required value={transferForm.compensationProposalId} onChange={event => updateTransferForm({ compensationProposalId: event.target.value })}><option value="">Select an eligible reference</option>{currentCompensation.map(row => <option key={row.id} value={row.id}>Proposal #{row.id} · {row.status} · {row.postCode ? `${row.postCode}, stage ${row.stageNo}` : 'Direct pay'} · {row.effectiveDate}</option>)}</select>{!can('compensation.view') && <p className="field-hint">Compensation reference selection requires compensation view permission.</p>}</div>}
            {transferForm.compensationMode === 'catalogue' && <div className="form-grid">
              <p className="field-hint">{adoptedCatalogue ? `Adopted revision: ${adoptedCatalogue.name} · ${adoptedCatalogue.orderNumber || 'No order'} · effective ${adoptedRevision.effectiveDate}` : 'No approved catalogue revision is effective on this transfer date.'}</p>
              <div className="field"><label className="field-label" htmlFor="transfer-post">Government post</label><select id="transfer-post" className="input" required value={transferForm.postCode} onChange={event => updateTransferForm({ postCode: event.target.value, stageNo: '' })}><option value="">Select post</option>{(adoptedCatalogue?.posts || []).map(row => <option key={row.code} value={row.code}>{row.name}</option>)}</select></div>
              <div className="field"><label className="field-label" htmlFor="transfer-stage">Government pay stage</label><select id="transfer-stage" className="input" required value={transferForm.stageNo} onChange={event => updateTransferForm({ stageNo: event.target.value })}><option value="">Select stage</option>{(selectedCataloguePost?.stages || []).map((stage, index) => { const stageNo = stage.stageNo ?? index; return <option key={stageNo} value={stageNo}>Stage {stageNo}</option>; })}</select></div>
            </div>}
          </fieldset>
          <fieldset className="org-transfer-section"><legend>Role-scope plan</legend><p className="form-note">System roles remain separate from position and pay. A different authorised approver must decide the transfer; Financial approval pending keeps the full bundle together.</p>
            {!can('roles.manage') && <p className="field-hint">Role scope changes require Roles &amp; Permissions access. Existing branch or department scopes that no longer apply end with the transfer.</p>}
            {can('roles.manage') && <>
              {ambiguousUserLink && <p className="field-hint">Multiple active user links exist for this employee. Resolve the account link before adding role scopes to the transfer.</p>}
              {!linkedUser && !ambiguousUserLink && transferForm.employeeId && <p className="field-hint">No unique linked user is available for this employee, so role changes cannot be added.</p>}
              {linkedUser && <>
                <div className="org-role-assignment-list">{roleAssignmentsQuery.isLoading ? <p>Loading current role scopes…</p> : currentRoleAssignments.length ? currentRoleAssignments.map(row => {
                  const scoped = ['SELECTED_BRANCHES', 'DEPARTMENT'].includes(row.scopeType);
                  return <div className="org-role-assignment" key={row.id}><span>{roleName(row.roleId)} · {formatScope(row, branches, departments)}</span><label><input type="checkbox" checked={closeRoleIds.includes(row.id)} onChange={event => { setCloseRoleIds(ids => event.target.checked ? [...ids, row.id] : ids.filter(id => id !== row.id)); setRetainRoleIds(ids => ids.filter(id => id !== row.id)); }} /> End at transfer</label>{scoped && <label><input type="checkbox" checked={retainRoleIds.includes(row.id)} onChange={event => { setRetainRoleIds(ids => event.target.checked ? [...ids, row.id] : ids.filter(id => id !== row.id)); setCloseRoleIds(ids => ids.filter(id => id !== row.id)); }} /> Keep this scope</label>}</div>;
                }) : <p>No current role assignments.</p>}</div>
                <div className="form-grid org-role-start-form">
                  <div className="field"><label className="field-label" htmlFor="transfer-role">Add role at transfer</label><select id="transfer-role" className="input" value={roleStart.roleId} onChange={event => { const role = roles.find(row => String(row.id) === event.target.value); setRoleStart({ roleId: event.target.value, scopeType: role?.allowedScopes?.[0] || '', branchId: '', departmentId: '' }); }}><option value="">Select active role</option>{roles.map(role => <option key={role.id} value={role.id}>{role.name}</option>)}</select></div>
                  <div className="field"><label className="field-label" htmlFor="transfer-role-scope">Role scope</label><select id="transfer-role-scope" className="input" value={roleStart.scopeType} onChange={event => setRoleStart({ ...roleStart, scopeType: event.target.value, branchId: '', departmentId: '' })}><option value="">Select scope</option>{roleStartScopes.map(scope => <option key={scope} value={scope}>{scope.replaceAll('_', ' ')}</option>)}</select></div>
                  {roleStart.scopeType === 'SELECTED_BRANCHES' && <div className="field"><label className="field-label" htmlFor="transfer-role-branch">Role branch scope</label><select id="transfer-role-branch" className="input" value={roleStart.branchId} onChange={event => setRoleStart({ ...roleStart, branchId: event.target.value })}><option value="">Select branch</option>{allowedBranches.map(branch => <option key={branch.id} value={branch.id}>{branch.name}</option>)}</select></div>}
                  {roleStart.scopeType === 'DEPARTMENT' && <div className="field"><label className="field-label" htmlFor="transfer-role-department">Role department scope</label><select id="transfer-role-department" className="input" value={roleStart.departmentId} onChange={event => setRoleStart({ ...roleStart, departmentId: event.target.value })}><option value="">Select department</option>{activeDepartments.map(row => <option key={row.id} value={row.id}>{row.name} · {branchById(row.branchId)?.name}</option>)}</select></div>}
                  <Button type="button" variant="secondary" onClick={addRoleStart} disabled={!linkedUser || !roleStart.roleId}>Add role scope</Button>
                </div>
                {roleStarts.length > 0 && <ul className="org-role-starts">{roleStarts.map((row, index) => <li key={`${row.roleId}-${index}`}>{roleName(row.roleId)} · {formatScope(row, branches, departments)} · starts {transferForm.effectiveDate || 'on transfer date'} <button type="button" onClick={() => setRoleStarts(list => list.filter((_, rowIndex) => rowIndex !== index))}>Remove</button></li>)}</ul>}
              </>}
            </>}
          </fieldset>
          <p className="org-transfer-consequence">Transfer and compensation decisions remain one bundle. A pending financial proposal keeps branch, department, position, pay reference, and access pending together. The proposer cannot approve their own transfer.</p>
          <Button type="submit" loading={transferMutation.isPending} disabled={!employees.length || !transferForm.effectiveDate || !transferForm.branchId || transferForm.compensationMode === 'reference' && !transferForm.compensationProposalId || transferForm.compensationMode === 'catalogue' && (!adoptedRevision || !transferForm.postCode || !transferForm.stageNo)}>Schedule transfer</Button>
        </form>
      </Card>}
      <Card title="Transfer history" noPadding>{transferQuery.isLoading ? <p className="org-section-state">Loading transfers…</p> : transferRows.length ? <div className="org-table-scroll"><table className="table"><thead><tr><th>Employee</th><th>Destination bundle</th><th>Compensation</th><th>Role-scope plan</th><th>Effective date</th><th>Status</th><th>Maker / approver</th><th>Decision</th></tr></thead><tbody>{transferRows.map(row => {
        const start = row.roleChanges?.start || [];
        const closeIds = row.roleChanges?.closeAssignmentIds || [];
        const retainIds = row.roleChanges?.retainAssignmentIds || [];
        const hasExplicitRoleChanges = start.length || closeIds.length || retainIds.length;
        const comp = compensationForEmployee(row.employeeId).find(value => String(value.id) === String(row.compensationProposalId));
        const compensationPending = row.compensationProposalId && comp?.status === 'PENDING';
        const decisionAllowed = row.status === 'PENDING' && (row.compensationProposalId ? !!comp && (compensationPending ? can('compensation.approve') : can('transfers.manage')) : can('transfers.manage')) && canDecide(user, row, ['preparedBy']) && (!comp || canDecide(user, comp, ['preparedBy']));
        return <tr key={row.id}><td>{employeeById(row.employeeId)?.name || `Employee #${row.employeeId}`}</td><td>{branchById(row.branchId)?.name || `Unit #${row.branchId}`}<small>{departmentById(row.departmentId)?.name || 'No department'} · {positionById(row.positionId)?.name || 'No position'}</small></td><td>{row.compensationProposalId ? `Proposal #${row.compensationProposalId}${comp?.status ? ` · ${comp.status}` : ' · financial decision may be required'}` : 'No pay change'}</td><td>{start.map((entry, index) => <span className="org-role-history-line" key={`${entry.roleId}-${index}`}>{roleName(entry.roleId)} · {formatScope(entry, branches, departments)} · starts {row.effectiveDate}</span>)}{closeIds.length > 0 && <span className="org-role-history-line">End role assignments #{closeIds.join(', #')}</span>}{retainIds.length > 0 && <span className="org-role-history-line">Retain role assignments #{retainIds.join(', #')}</span>}{!hasExplicitRoleChanges && <span className="org-role-history-line">No explicit role-scope changes recorded; existing scoped roles follow transfer rules.</span>}</td><td className="mono">{row.effectiveDate}</td><td><Badge variant={row.status === 'ACTIVATED' || row.status === 'APPROVED' ? 'success' : row.status === 'REJECTED' ? 'danger' : 'default'}>{row.status}</Badge></td><td><small>{row.status === 'PENDING' ? 'A different authorised approver must decide.' : row.decidedBy ? 'Independent decision recorded.' : 'No decision recorded.'}</small></td><td>{decisionAllowed && <div className="org-transfer-decision"><Button size="sm" loading={transferMutation.isPending} onClick={() => decideTransfer(row.id, 'APPROVED')}>Approve</Button><Button size="sm" variant="secondary" onClick={() => decideTransfer(row.id, 'REJECTED')}>Reject</Button></div>}</td></tr>;
      })}</tbody></table></div> : <EmptyState title="No transfers recorded" description="Scheduled transfers and their approval state will appear here." />}</Card>
    </section>}

    {tab === 'chart' && <section aria-labelledby="org-chart-heading">
      <div className="org-section-heading org-chart-heading"><div><h2 id="org-chart-heading">Organisation chart</h2><p>Current occupants only. Personal, payroll, bank, and statutory details are not shown.</p></div><div className="org-chart-layout" aria-label="Chart view"><button type="button" aria-pressed={chartLayout === 'tree'} className={chartLayout === 'tree' ? 'is-active' : ''} onClick={() => setChartLayout('tree')}>Tree</button><button type="button" aria-pressed={chartLayout === 'list'} className={chartLayout === 'list' ? 'is-active' : ''} onClick={() => setChartLayout('list')}>List</button></div></div>
      <LoadError error={chartQuery.error} recovery="Ask an administrator for chart.view access if this chart should be available." />
      {chartQuery.isLoading ? <p className="org-section-state">Loading organisation chart…</p> : <>
        <Card title="Head Office leadership">
          {chart.leadership?.length ? <ul className="org-leadership-list">{chart.leadership.map(row => <li key={row.id}><AuthenticatedPhoto path={row.photoRef} name={row.name} /><span><strong>{row.name}</strong><small>{row.roleOther || row.role}</small></span></li>)}</ul> : <EmptyState title="No manual leadership profiles" description="Board and external leadership profiles are maintained in Organisation Profile." />}
          {profileLinks.canManage && <Link to="/org-profile">Manage board and external leadership profiles</Link>}
        </Card>
        <Card title="Current employees">
          {!chartEmployees.length ? <EmptyState title="No current occupants in this chart" description="Only active employees with current organisation assignments appear here." /> : chartLayout === 'tree' ? <ul className="org-chart-tree" aria-label="Current organisation chart">{chartUnits.map(branch => {
            const branchEmployees = chartEmployees.filter(row => String(row.branch.id) === String(branch.id));
            const deptIds = [...new Set(branchEmployees.map(row => row.department?.id || 'none'))];
            return <li key={branch.id}><details open><summary>{branch.name} <span>{branch.unitType === 'HEAD_OFFICE' ? 'Head Office' : 'Branch'}</span></summary><ul>{deptIds.map(departmentId => {
              const deptRows = branchEmployees.filter(row => String(row.department?.id || 'none') === String(departmentId));
              const departmentName = deptRows[0]?.department?.name || 'Unassigned department';
              const positionIds = [...new Set(deptRows.map(row => row.position?.id || 'none'))];
              return <li key={`${branch.id}-${departmentId}`}><details open><summary>{departmentName}</summary><ul>{positionIds.map(positionId => {
                const occupants = deptRows.filter(row => String(row.position?.id || 'none') === String(positionId));
                const position = occupants[0]?.position;
                return <li key={`${departmentId}-${positionId}`}><details open><summary>{position?.name || 'Unassigned position'}{position?.reportsToPositionId && <small>Reports to {positionById(position.reportsToPositionId)?.name || `Position #${position.reportsToPositionId}`}</small>}</summary><ul>{occupants.map(person => <li key={person.id} className="org-chart-person"><AuthenticatedPhoto path={person.photoRef} name={person.name} /><span><strong>{person.name}</strong><small>{person.empCode} · {branch.name} · {departmentName}</small></span></li>)}</ul></details></li>;
              })}</ul></details></li>;
            })}</ul></details></li>;
          })}</ul> : <div className="org-table-scroll"><table className="table"><thead><tr><th>Employee</th><th>Code</th><th>Position</th><th>Department</th><th>Branch</th><th>Reports to</th></tr></thead><tbody>{chartEmployees.map(person => <tr key={person.id}><td><span className="org-chart-list-person"><AuthenticatedPhoto path={person.photoRef} name={person.name} />{person.name}</span></td><td className="mono">{person.empCode}</td><td>{person.position?.name || 'Unassigned position'}</td><td>{person.department?.name || 'Unassigned department'}</td><td>{person.branch.name}</td><td>{positionById(person.position?.reportsToPositionId)?.name || '—'}</td></tr>)}</tbody></table></div>}
        </Card>
      </>}
    </section>}

    <ConfirmationModal
      open={deactivateTarget != null}
      onClose={() => setDeactivateTarget(null)}
      onConfirm={() => {
        const target = deactivateTarget;
        setDeactivateTarget(null);
        target?.action();
      }}
      title={deactivateTarget?.type || 'Confirm change'}
      itemName={deactivateTarget?.name}
      details={deactivateTarget?.details || {}}
      warningMessage={deactivateTarget?.warning || 'Deactivating this record cannot be automatically undone.'}
      confirmLabel={deactivateTarget?.confirmLabel || 'Confirm'}
      confirmVariant="danger"
      requireVerification={false}
      loading={structureWrite.isPending}
    />
  </div>;
}
