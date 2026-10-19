/* API client — replicates the incumbent H.api wrapper exactly.
   Same error shape, same 401 session-expiry and 403 org-licence/suspension handling. */

const BASE = '/api/v1';

export class ApiError extends Error {
  constructor(message, status, body) {
    super(message);
    this.status = status;
    this.body = body;
  }
}

/** Clears the session and asks the React layer to sign out with a notice. */
function forceLogout(message, kind = 'warn') {
  sessionStorage.removeItem('token');
  try {
    window.dispatchEvent(new CustomEvent('ucb:logout', { detail: { message, kind } }));
  } catch { /* CustomEvent unavailable — the route guard still redirects. */ }
}

async function request(method, path, body, { raw = false } = {}) {
  const url = `${BASE}${path}`;
  const opts = {
    method,
    headers: { 'Content-Type': 'application/json' },
    credentials: 'same-origin',
  };

  const token = sessionStorage.getItem('token');
  if (token) {
    opts.headers['Authorization'] = `Bearer ${token}`;
  }

  if (body !== undefined) {
    opts.body = JSON.stringify(body);
  }

  let res;
  try {
    res = await fetch(url, opts);
  } catch {
    throw new ApiError('Network error — is the server reachable?', 0, null);
  }

  let data = null;
  const text = await res.text();
  if (text) {
    try { data = JSON.parse(text); } catch { data = { message: text }; }
  }

  // Credential-checking auth endpoints answer 401/403 for a wrong password or
  // code. Those must surface inline (the caller renders them), NOT be treated
  // as an expired session — otherwise a typo would clear the token and eject
  // the user. Mirrors the incumbent's isAuthCall check (core.js:147).
  const isAuthCall = /^\/auth\/(login|mfa\/verify-login|forgot-password|reset-password|change-password|mfa\/disable)/.test(path);

  if (res.status === 401 && !isAuthCall) {
    const msg = 'Your session has ended. Please sign in again.';
    forceLogout(msg, 'warn');
    throw new ApiError(msg, 401, data);
  }

  if (res.status === 403 && !isAuthCall && data && /^ORG_(SUSPENDED|LICENSE_EXPIRED|LICENSE_NOT_STARTED)$/.test(data.code || '')) {
    // The bank was suspended or its licence lapsed mid-session — nothing else
    // on this session will work, so sign out with the reason.
    const msg = data.message || 'Access to this organisation is no longer available.';
    forceLogout(msg, 'error');
    throw new ApiError(msg, 403, data);
  }

  if (!res.ok) {
    throw new ApiError(data?.message || `Request failed (${res.status})`, res.status, data);
  }

  if (raw) return data;

  // The API wraps payloads as { data: <payload> }. Unwrap it, and normalise a
  // bare array into a { rows, total } list shape the UI expects.
  let payload = data;
  if (payload && typeof payload === 'object' && !Array.isArray(payload) && 'data' in payload) {
    payload = payload.data;
  }
  if (Array.isArray(payload)) {
    payload = { rows: payload, total: payload.length };
  }
  return payload;
}

export const api = {
  get: (path) => request('GET', path),
  post: (path, body) => request('POST', path, body),
  put: (path, body) => request('PUT', path, body),
  patch: (path, body) => request('PATCH', path, body),
  delete: (path) => request('DELETE', path),
  /* Returns the response body untouched — for endpoints whose shape collides
     with the { data } unwrap (the audit list is { data, page, pageSize,
     total, totalPages, auditRetentionDays }). */
  getRaw: (path) => request('GET', path, undefined, { raw: true }),
  /* POST that returns the whole body (for endpoints whose payload has
     sibling keys alongside { data }, e.g. bulk-import's summary). */
  postRaw: (path, body) => request('POST', path, body, { raw: true }),
};

/* Authenticated binary downloads (CSV exports, payslip/register PDFs). The
   shared client is JSON-only, so these bypass it but keep the same session
   handling: a 401 signs the user out rather than silently failing. */
export async function downloadFile(path, filename) {
  const res = await fetch(`${BASE}${path}`, {
    headers: { Authorization: `Bearer ${sessionStorage.getItem('token')}` },
    credentials: 'same-origin',
  });
  if (res.status === 401) {
    const msg = 'Your session has ended. Please sign in again.';
    forceLogout(msg, 'warn');
    throw new ApiError(msg, 401, null);
  }
  if (!res.ok) {
    let msg = `Download failed (${res.status})`;
    try { const b = await res.json(); if (b && b.message) msg = b.message; } catch { /* not JSON */ }
    throw new ApiError(msg, res.status, null);
  }
  const cd = res.headers.get('Content-Disposition') || '';
  const m = /filename="?([^";]+)"?/.exec(cd);
  const name = filename || (m ? m[1] : 'download');
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

/* Opens an authenticated binary resource (a stored scan or PDF) in a new tab. */
export async function openFile(path) {
  const res = await fetch(`${BASE}${path}`, {
    headers: { Authorization: `Bearer ${sessionStorage.getItem('token')}` },
    credentials: 'same-origin',
  });
  if (!res.ok) throw new ApiError(`Could not open file (${res.status})`, res.status, null);
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const w = window.open(url, '_blank', 'noopener');
  if (!w) {
    const a = document.createElement('a'); a.href = url; a.download = 'document';
    document.body.appendChild(a); a.click(); a.remove();
  }
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}

/* Auth API */
export const authApi = {
  login: (email, password, orgCode) =>
    api.post('/auth/login', { email, password, orgCode }),
  verifyMfa: (challengeToken, code) =>
    api.post('/auth/mfa/verify-login', { mfaToken: challengeToken, code }),
  me: () => api.get('/auth/me'),
  changePassword: (currentPassword, newPassword) =>
    api.post('/auth/change-password', { currentPassword, newPassword }),
  forgotPassword: (email, orgCode) =>
    api.post('/auth/forgot-password', { email, orgCode }),
  resetPassword: (token, newPassword) =>
    api.post('/auth/reset-password', { token, newPassword }),
  mfaSetup: () => api.get('/auth/mfa/setup'),
  mfaConfirm: (secret, code) => api.post('/auth/mfa/confirm', { secret, code }),
  mfaDisable: (password) => api.post('/auth/mfa/disable', { password }),
};

/* Platform API (Super Admin) */
export const platformApi = {
  dashboard: () => api.get('/admin/dashboard'),
  organizations: (params) => api.get(`/admin/organizations?${new URLSearchParams(params)}`),
  organization: (id) => api.get(`/admin/organizations/${id}`).then((d) => d.organization),
  organizationDomain: (id) => api.get(`/admin/organizations/${id}/domain`),
  verifyOrganizationDomain: (id) => api.post(`/admin/organizations/${id}/verify-domain`),
  createOrganization: (data) => api.post('/admin/organizations', data),
  updateOrganization: (id, data) => api.put(`/admin/organizations/${id}`, data),
  orgAdminUsers: (orgId) => api.get(`/admin/organizations/${orgId}/admin-users`),
  createOrgAdmin: (orgId, data) => api.post(`/admin/organizations/${orgId}/admin-users`, data),
  uploadOrgLogo: (orgId, formData) => {
    return fetch(`${BASE}/admin/organizations/${orgId}/logo`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${sessionStorage.getItem('token')}` },
      body: formData,
    }).then(r => r.json());
  },
  platformUsers: (params) => api.get(`/admin/platform-users?${new URLSearchParams(params)}`),
  createPlatformUser: (data) => api.post('/admin/platform-users', data),
  updatePlatformUser: (id, data) => api.put(`/admin/platform-users/${id}`, data),
  settings: () => api.get('/admin/settings'),
  updateSettings: (data) => api.put('/admin/settings', data),
  smtp: () => api.get('/admin/settings/smtp'),
  updateSmtp: (data) => api.put('/admin/settings/smtp', data),
  uploadPlatformLogo: (type, formData) => {
    return fetch(`${BASE}/admin/settings/${type}`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${sessionStorage.getItem('token')}` },
      body: formData,
    }).then(r => r.json());
  },
  testSmtp: (data) => api.post('/admin/settings/smtp/test', data),
  audit: (params) => api.getRaw(`/admin/audit?${new URLSearchParams(params)}`),
  auditRetention: () => api.get('/admin/audit/retention'),
  purgeAudit: () => api.post('/admin/audit/purge-now', {}),
};

/* Org API */
export const orgApi = {
  settings: () => api.get('/org/settings'),
  updateSettings: (data) => api.put('/org/settings', data),
  smtp: () => api.get('/org/settings/smtp'),
  updateSmtp: (data) => api.put('/org/settings/smtp', data),
  payrollSettings: () => api.get('/org/settings/payroll'),
  updatePayrollSettings: (data) => api.put('/org/settings/payroll', data),
  uploadLogo: (dataUrl) => api.put('/org/settings/logo', { dataUrl }),
  deleteLogo: () => api.delete('/org/settings/logo'),
  testSmtp: (data) => api.post('/org/settings/smtp/test', data),
  audit: (params) => api.getRaw(`/org/audit?${new URLSearchParams(params)}`),

  /* Mandatory-field policy for the employee master form. */
  mandatoryFields: () => api.get('/org/mandatory-fields'),
  updateMandatoryFields: (data) => api.put('/org/mandatory-fields', data),

  /* Bank's own statutory documents (registration certificate, RBI licence…). */
  documents: () => api.get('/org/profile/documents'),
  createDocument: (data) => api.post('/org/profile/documents', data),
  deleteDocument: (id) => api.delete(`/org/profile/documents/${id}`),
  documentFileUrl: (id) => `/org/profile/documents/${id}/file`,
};

/* Users API */
export const usersApi = {
  list: (orgId, params) => api.get(`/organizations/${orgId}/users?${new URLSearchParams(params)}`),
  get: (orgId, id) => api.get(`/organizations/${orgId}/users/${id}`),
  create: (orgId, data) => api.post(`/organizations/${orgId}/users`, data),
  update: (orgId, id, data) => api.put(`/organizations/${orgId}/users/${id}`, data),
  resetPassword: (orgId, id, data) => api.post(`/organizations/${orgId}/users/${id}/reset-password`, data),
  resetMfa: (orgId, id) => api.post(`/organizations/${orgId}/users/${id}/reset-mfa`),
};

/* Master data API */
export const masterDataApi = {
  postCadres: (params) => api.get(`/post-cadres?${new URLSearchParams(params)}`),
  createPostCadre: (data) => api.post('/post-cadres', data),
  updatePostCadre: (id, data) => api.put(`/post-cadres/${id}`, data),
  deletePostCadre: (id) => api.delete(`/post-cadres/${id}`),

  governmentOrders: (params) => api.get(`/government-orders?${new URLSearchParams(params)}`),
  governmentOrder: (id) => api.get(`/government-orders/${id}`),
  createGovernmentOrder: (data) => api.post('/government-orders', data),
  updateGovernmentOrder: (id, data) => api.put(`/government-orders/${id}`, data),
  deleteGovernmentOrder: (id) => api.delete(`/government-orders/${id}`),
  goDocument: (id) => api.get(`/government-orders/${id}/document`),
  uploadGoDocument: (id, data) => api.post(`/government-orders/${id}/document`, data),
  deleteGoDocument: (id) => api.delete(`/government-orders/${id}/document`),
  goDocumentFileUrl: (id) => `/government-orders/${id}/document/file`,

  ksrRules: (params) => api.get(`/ksr-rules?${new URLSearchParams(params)}`),
  createKsrRule: (data) => api.post('/ksr-rules', data),
  updateKsrRule: (id, data) => api.put(`/ksr-rules/${id}`, data),
  deleteKsrRule: (id) => api.delete(`/ksr-rules/${id}`),

  payRevisions: (params) => api.get(`/pay-revisions?${new URLSearchParams(params)}`),
  createPayRevision: (data) => api.post('/pay-revisions', data),
  updatePayRevision: (id, data) => api.put(`/pay-revisions/${id}`, data),

  payScales: (params) => api.get(`/pay-scales?${new URLSearchParams(params)}`),
  createPayScale: (data) => api.post('/pay-scales', data),
  updatePayScale: (id, data) => api.put(`/pay-scales/${id}`, data),
  payScaleStages: (scaleId) => api.get(`/pay-scales/${scaleId}/stages`),
  updatePayScaleStages: (scaleId, stages) => api.put(`/pay-scales/${scaleId}/stages`, { stages }),

  employees: (params) => api.get(`/employees?${new URLSearchParams(params)}`),
  employee: (id) => api.get(`/employees/${id}`),
  createEmployee: (data) => api.post('/employees', data),
  updateEmployee: (id, data) => api.put(`/employees/${id}`, data),
  serviceBook: (id) => api.get(`/employees/${id}/service-book`),
  addServiceBookEvent: (id, data) => api.post(`/employees/${id}/service-book/events`, data),

  /* Bulk employee creation from a CSV (see routes/serviceBook.js). */
  bulkImport: (data) => api.postRaw('/employees/bulk-import', data),
  bulkTemplateUrl: '/employees/bulk-template.csv',
};

/* Payroll API */
export const payrollApi = {
  runs: (orgId, params) => api.get(`/organizations/${orgId}/payroll-runs${params ? `?${new URLSearchParams(params)}` : ''}`),
  run: (orgId, id) => api.get(`/organizations/${orgId}/payroll-runs/${id}`),
  createRun: (orgId, data) => api.post(`/organizations/${orgId}/payroll-runs`, data),
  updateRun: (orgId, id, data) => api.put(`/organizations/${orgId}/payroll-runs/${id}`, data),
  lines: (orgId, id) => api.get(`/organizations/${orgId}/payroll-runs/${id}/lines`),
  approve: (orgId, id) => api.post(`/organizations/${orgId}/payroll-runs/${id}/approve`, {}),
  reject: (orgId, id, reason) => api.post(`/organizations/${orgId}/payroll-runs/${id}/reject`, { reason }),
  markPaid: (orgId, id) => api.post(`/organizations/${orgId}/payroll-runs/${id}/mark-paid`, {}),
  remove: (orgId, id) => api.delete(`/organizations/${orgId}/payroll-runs/${id}`),
  line: (orgId, id, empId) => api.get(`/organizations/${orgId}/payroll-runs/${id}/lines/${empId}`),
  sendPayslips: (orgId, id, employeeIds) =>
    api.post(`/organizations/${orgId}/payroll-runs/${id}/send-payslips`, employeeIds ? { employeeIds } : {}),

  /* Binary exports — paths resolved by the download helpers above. */
  registerCsvUrl: (orgId, id) => `/organizations/${orgId}/payroll-runs/${id}/register.csv`,
  bankTransferCsvUrl: (orgId, id) => `/organizations/${orgId}/payroll-runs/${id}/bank-transfer.csv`,
  payslipPdfUrl: (orgId, id, empId) => `/organizations/${orgId}/payroll-runs/${id}/lines/${empId}/payslip.pdf`,
};

/* Branding API */
export const brandingApi = {
  platform: () => api.get('/public/branding'),
  org: (code) => api.get(`/public/org/${code}`),
};

/* Formatting helpers */
export const fmt = {
  money(amount) {
    if (amount == null || isNaN(Number(amount))) return '—';
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      minimumFractionDigits: 0,
    }).format(Number(amount));
  },
  date(dateStr) {
    if (!dateStr) return '—';
    const d = new Date(dateStr);
    return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
  },
  dateTime(dateStr) {
    if (!dateStr) return '—';
    const d = new Date(dateStr);
    return d.toLocaleDateString('en-IN', {
      day: '2-digit', month: 'short', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    });
  },
};
