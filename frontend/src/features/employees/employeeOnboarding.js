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
