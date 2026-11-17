import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const employeeOnboarding = await import('../src/features/employees/employeeOnboarding.js').catch(() => ({}));

test('permission-mode employee creation sends only non-financial identity and assignment fields', () => {
  assert.equal(typeof employeeOnboarding.buildEmployeeCreatePayload, 'function', 'employee create payload builder is available');
  const payload = employeeOnboarding.buildEmployeeCreatePayload({
    empCode: 'E-100', name: 'Mira K', dob: '1990-01-02', doj: '2026-11-16', gender: 'FEMALE', category: 'GENERAL',
    panNumber: 'AAAAA1234A', aadhaarNumber: '123412341234', personalEmail: 'mira@example.invalid', directPay: true,
    currentBasicPay: '42000', currentPayScaleId: '7', currentStageId: '4', fixedHraAmount: '6000', riskAllowance: '900',
    bankName: 'Private Bank', bankAccountNumber: '123456789012', bankIfsc: 'BANK0001', designation: 'Old title', department: 'Old department',
  }, { permissionMode: true, catalogueBank: false, organizationAssignment: { branchId: '12', departmentId: '', positionId: '34', effectiveFrom: '2026-11-17' } });

  assert.deepEqual(payload, {
    empCode: 'E-100', name: 'Mira K', dob: '1990-01-02', doj: '2026-11-16', gender: 'FEMALE', category: 'GENERAL',
    panNumber: 'AAAAA1234A', aadhaarNumber: '123412341234', personalEmail: 'mira@example.invalid', directPay: true,
    organizationAssignment: { branchId: 12, departmentId: null, positionId: 34, effectiveFrom: '2026-11-17' },
  });
  const page = readFileSync(new URL('../src/features/employees/NewEmployeePage.jsx', import.meta.url), 'utf8');
  assert.match(page, /createMutation\.mutate\(buildEmployeeCreatePayload\(form,/);
});

test('permission-mode onboarding omits the bank step while legacy onboarding keeps it', () => {
  assert.equal(typeof employeeOnboarding.employeeOnboardingSteps, 'function', 'onboarding step policy is available');
  assert.deepEqual(employeeOnboarding.employeeOnboardingSteps(true).map(step => step.key), ['identity', 'service', 'pay', 'review']);
  assert.deepEqual(employeeOnboarding.employeeOnboardingSteps(false).map(step => step.key), ['identity', 'service', 'pay', 'bank', 'review']);
  const page = readFileSync(new URL('../src/features/employees/NewEmployeePage.jsx', import.meta.url), 'utf8');
  assert.match(page, /const steps = employeeOnboardingSteps\(permissionMode\)/);
  assert.match(page, /\{currentStep === 'bank' &&/);
});
