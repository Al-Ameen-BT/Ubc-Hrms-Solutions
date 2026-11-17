const STEPS = [
  { key: 'identity', label: 'Identity' },
  { key: 'service', label: 'Service' },
  { key: 'pay', label: 'Pay' },
  { key: 'bank', label: 'Bank' },
  { key: 'review', label: 'Review' },
];

const PERMISSION_EMPLOYEE_FIELDS = [
  'empCode', 'name', 'dob', 'doj', 'gender', 'category',
  'panNumber', 'aadhaarNumber', 'personalEmail', 'directPay',
];

export function employeeOnboardingSteps(permissionMode) {
  return permissionMode ? STEPS.filter(step => step.key !== 'bank') : STEPS;
}

export function isPermissionAssignmentReady(assignment, branches, positions) {
  const branch = branches.find(row => String(row.id) === String(assignment.branchId) && row.status === 'ACTIVE');
  const position = positions.find(row => String(row.id) === String(assignment.positionId) && row.status === 'ACTIVE' && row.postCadreId != null);
  return !!assignment.effectiveFrom && !!branch && !!position
    && String(position.branchId) === String(branch.id)
    && (!assignment.departmentId || String(position.departmentId) === String(assignment.departmentId));
}

export function buildPermissionEmployeePayload(form, assignment) {
  const employee = Object.fromEntries(PERMISSION_EMPLOYEE_FIELDS
    .filter(key => Object.hasOwn(form, key))
    .map(key => [key, form[key]]));

  return {
    ...employee,
    organizationAssignment: {
      branchId: Number(assignment.branchId),
      departmentId: assignment.departmentId ? Number(assignment.departmentId) : null,
      positionId: assignment.positionId ? Number(assignment.positionId) : null,
      effectiveFrom: assignment.effectiveFrom,
    },
  };
}

export function buildEmployeeCreatePayload(form, { permissionMode, catalogueBank, organizationAssignment }) {
  if (permissionMode) return buildPermissionEmployeePayload(form, organizationAssignment);
  if (catalogueBank) return {
    ...form,
    currentPayScaleId: null,
    currentStageId: null,
    currentBasicPay: null,
    fixedHraAmount: null,
    riskAllowance: null,
    otherAllowance: null,
  };
  return { ...form };
}
