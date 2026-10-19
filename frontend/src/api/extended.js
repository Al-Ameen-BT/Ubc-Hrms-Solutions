/*
 * Extended API surface — leave, allowances, DA arrears, year-end, documents,
 * organisation profile. Every path here mirrors the Express routers in
 * src/routes (see the header comments there); the shared client unwraps
 * { data } and normalises bare arrays into { rows }.
 */

import { api } from './client';

/* ---------------------------------------------------------------- Leave */
/* routes/leave.js — leave types, applications, per-employee balances. */
export const leaveApi = {
  types: (params) => api.get(`/leave-types?${new URLSearchParams(params || {})}`),
  createType: (data) => api.post('/leave-types', data),
  updateType: (id, data) => api.put(`/leave-types/${id}`, data),
  setTypeStatus: (id, status) => api.post(`/leave-types/${id}/status`, { status }),
  seedDefaults: () => api.post('/leave-types/seed-defaults', {}),
  accrue: (id, data) => api.post(`/leave-types/${id}/accrue`, data),

  decideApplication: (id, data) => api.post(`/leave-applications/${id}/decide`, data),
  cancelApplication: (id) => api.post(`/leave-applications/${id}/cancel`, {}),

  employeeBalances: (employeeId, year) =>
    api.get(`/employees/${employeeId}/leave-balances${year ? `?year=${year}` : ''}`),
  employeeApplications: (employeeId) => api.get(`/employees/${employeeId}/leave-applications`),
  applyForEmployee: (employeeId, data) => api.post(`/employees/${employeeId}/leave-applications`, data),
};

/* ----------------------------------------------------------- Allowances */
/* routes/allowanceTypes.js */
export const allowanceApi = {
  list: (params) => api.get(`/allowance-types?${new URLSearchParams(params || {})}`),
  get: (id) => api.get(`/allowance-types/${id}`),
  create: (data) => api.post('/allowance-types', data),
  update: (id, data) => api.put(`/allowance-types/${id}`, data),
  setStatus: (id, status) => api.post(`/allowance-types/${id}/status`, { status }),
  setPosts: (id, postCadreIds) => api.put(`/allowance-types/${id}/posts`, { postCadreIds }),
};

/* ------------------------------------------------------------ DA Arrears */
/* routes/arrears.js */
export const arrearsApi = {
  revisions: (params) => api.get(`/da-revisions?${new URLSearchParams(params || {})}`),
  revision: (id) => api.get(`/da-revisions/${id}`),
  createRevision: (data) => api.post('/da-revisions', data),
  updateRevision: (id, data) => api.put(`/da-revisions/${id}`, data),
  setRevisionStatus: (id, status) => api.post(`/da-revisions/${id}/status`, { status }),
  calculate: (id) => api.post(`/da-revisions/${id}/calculate`, {}),
  casesForRevision: (id) => api.get(`/da-revisions/${id}/cases`),

  caseDetail: (id) => api.getRaw(`/arrears-cases/${id}`),
  revisionDetail: (id) => api.get(`/da-revisions/${id}`),

  adjustCase: (id, data) => api.put(`/arrears-cases/${id}/adjust`, data),
  setPaymentPlan: (id, data) => api.post(`/arrears-cases/${id}/payment-plan`, data),
  clearPaymentPlan: (id) => api.delete(`/arrears-cases/${id}/payment-plan`),
  payInstallment: (caseId, installmentId) =>
    api.post(`/arrears-cases/${caseId}/installments/${installmentId}/pay`, {}),
  receiptPdfUrl: (caseId, installmentId) =>
    `/arrears-cases/${caseId}/installments/${installmentId}/receipt.pdf`,

  /* The GO scan attached to a DA revision (same attachment service as the
     GO register). */
  revisionDocument: (id) => api.get(`/da-revisions/${id}/document`),
  uploadRevisionDocument: (id, data) => api.post(`/da-revisions/${id}/document`, data),
  deleteRevisionDocument: (id) => api.delete(`/da-revisions/${id}/document`),
  revisionDocumentFileUrl: (id) => `/da-revisions/${id}/document/file`,
};

/* ------------------------------------------------------------- Year-End */
/* routes/yearEnd.js */
export const yearEndApi = {
  years: (orgId) => api.get(`/organizations/${orgId}/year-end`),
  summary: (orgId, year) => api.get(`/organizations/${orgId}/year-end/${year}`),
  close: (orgId, year, remarks) =>
    api.post(`/organizations/${orgId}/year-end/${year}/close`, { remarks }),
  reopen: (orgId, year) => api.post(`/organizations/${orgId}/year-end/${year}/reopen`, {}),
};

/* ------------------------------------------- Organisation profile (Org Admin) */
/* routes/orgSettings.js — board, branches, statutory documents. */
export const profileApi = {
  get: () => api.get('/org/profile'),
  update: (data) => api.put('/org/profile', data),

  branches: () => api.get('/org/profile/branches'),
  createBranch: (data) => api.post('/org/profile/branches', data),
  updateBranch: (id, data) => api.put(`/org/profile/branches/${id}`, data),
  deleteBranch: (id) => api.delete(`/org/profile/branches/${id}`),

  board: () => api.get('/org/profile/board'),
  createBoardMember: (data) => api.post('/org/profile/board', data),
  updateBoardMember: (id, data) => api.put(`/org/profile/board/${id}`, data),
  deleteBoardMember: (id) => api.delete(`/org/profile/board/${id}`),
};

/* -------------------------------------------- Employee documents (scans) */
/* routes/serviceBook.js — stored as base64 data URLs in JSON (see
   services/documents.js), so uploads go through the shared client. */
export const documentApi = {
  list: (employeeId) => api.get(`/employees/${employeeId}/documents`),
  upload: (employeeId, data) => api.post(`/employees/${employeeId}/documents`, data),
  remove: (employeeId, docId) => api.delete(`/employees/${employeeId}/documents/${docId}`),
  fileUrl: (employeeId, docId) => `/employees/${employeeId}/documents/${docId}/file`,
};

/* -------------------------------------- Employee service-book sub-resources */
/* routes/serviceBook.js — bank accounts, loan-style records, LIC, attendance,
   and the live payslip preview. Every path is scoped to one employee. */
export const serviceBookApi = {
  payslip: (employeeId, month) =>
    api.get(`/employees/${employeeId}/payslip${month ? `?month=${month}` : ''}`),
  payslipPdfUrl: (employeeId, month) =>
    `/employees/${employeeId}/payslip.pdf${month ? `?month=${month}` : ''}`,

  attendance: (employeeId, year) =>
    api.get(`/employees/${employeeId}/attendance${year ? `?year=${year}` : ''}`),
  markAttendance: (employeeId, data) => api.post(`/employees/${employeeId}/attendance`, data),

  bankAccounts: (employeeId) => api.getRaw(`/employees/${employeeId}/bank-accounts`),
  addBankAccount: (employeeId, data) => api.post(`/employees/${employeeId}/bank-accounts`, data),
  updateBankAccount: (employeeId, accountId, data) => api.put(`/employees/${employeeId}/bank-accounts/${accountId}`, data),
  deleteBankAccount: (employeeId, accountId) => api.delete(`/employees/${employeeId}/bank-accounts/${accountId}`),
  setSalaryCreditAccount: (employeeId, accountId) => api.put(`/employees/${employeeId}/salary-credit-account`, { accountId }),

  festivalAdvances: (employeeId) => api.get(`/employees/${employeeId}/festival-advances`),
  addFestivalAdvance: (employeeId, data) => api.post(`/employees/${employeeId}/festival-advances`, data),
  updateFestivalAdvance: (employeeId, id, data) => api.put(`/employees/${employeeId}/festival-advances/${id}`, data),
  deleteFestivalAdvance: (employeeId, id) => api.delete(`/employees/${employeeId}/festival-advances/${id}`),

  overdrafts: (employeeId) => api.getRaw(`/employees/${employeeId}/overdrafts`),
  addOverdraft: (employeeId, data) => api.post(`/employees/${employeeId}/overdrafts`, data),
  deleteOverdraft: (employeeId, id) => api.delete(`/employees/${employeeId}/overdrafts/${id}`),

  recurringDeposits: (employeeId) => api.get(`/employees/${employeeId}/recurring-deposits`),
  addRecurringDeposit: (employeeId, data) => api.post(`/employees/${employeeId}/recurring-deposits`, data),
  updateRecurringDeposit: (employeeId, id, data) => api.put(`/employees/${employeeId}/recurring-deposits/${id}`, data),
  deleteRecurringDeposit: (employeeId, id) => api.delete(`/employees/${employeeId}/recurring-deposits/${id}`),

  licPolicies: (employeeId) => api.get(`/employees/${employeeId}/lic-policies`),
  addLicPolicy: (employeeId, data) => api.post(`/employees/${employeeId}/lic-policies`, data),
  updateLicPolicy: (employeeId, id, data) => api.put(`/employees/${employeeId}/lic-policies/${id}`, data),
  deleteLicPolicy: (employeeId, id) => api.delete(`/employees/${employeeId}/lic-policies/${id}`),

  housingLoans: (employeeId) => api.get(`/employees/${employeeId}/housing-loans`),
  addHousingLoan: (employeeId, data) => api.post(`/employees/${employeeId}/housing-loans`, data),
  updateHousingLoan: (employeeId, id, data) => api.put(`/employees/${employeeId}/housing-loans/${id}`, data),
  deleteHousingLoan: (employeeId, id) => api.delete(`/employees/${employeeId}/housing-loans/${id}`),

  vehicleLoans: (employeeId) => api.getRaw(`/employees/${employeeId}/vehicle-loans`),
  addVehicleLoan: (employeeId, data) => api.post(`/employees/${employeeId}/vehicle-loans`, data),
  updateVehicleLoan: (employeeId, id, data) => api.put(`/employees/${employeeId}/vehicle-loans/${id}`, data),
  deleteVehicleLoan: (employeeId, id) => api.delete(`/employees/${employeeId}/vehicle-loans/${id}`),
};
