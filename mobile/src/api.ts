export type EmployeeUser = {
  id: number;
  name: string;
  email: string;
  role: string;
  employeeId?: number | null;
  organizationName?: string;
  organization?: { code: string; name: string; logoUrl?: string | null };
  mustChangePassword?: boolean;
};

export type EmployeeContext = {
  linked: boolean;
  employee: { id: number; empCode: string; name: string; designation?: string; department?: string; branchName?: string; photoUrl?: string | null } | null;
};

export type ChartUnit = { id: number; code: string; name: string; unitType?: 'HEAD_OFFICE' | 'BRANCH' };
export type ChartPosition = ChartUnit & { reportsToPositionId: number | null };
export type ChartEmployee = { id: number; empCode: string; name: string; photoRef: string | null; branch: ChartUnit; department: ChartUnit | null; position: ChartPosition | null };
export type ChartLeader = { id: number; name: string; role: string; roleOther: string | null; displayOrder: number; photoRef: string | null };
export type EmployeeChart = { at: string; view: 'employee'; context: { assigned: boolean; branch: ChartUnit | null; department: ChartUnit | null; position: ChartPosition | null }; employees: ChartEmployee[]; leadership: ChartLeader[] };
export type ChartPerson = ChartEmployee | ChartLeader;

const object = (value: unknown): Record<string, any> => value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, any> : {};
const id = (value: unknown) => Number.isSafeInteger(Number(value)) && Number(value) > 0 ? Number(value) : 0;
const text = (value: unknown) => typeof value === 'string' ? value : '';
const photo = (value: unknown) => typeof value === 'string' && value.startsWith('/api/v1/') ? value : null;
function unit(value: unknown, branch = false): ChartUnit | null {
  const row = object(value), rowId = id(row.id), code = text(row.code), name = text(row.name);
  if (!rowId || !code || !name) return null;
  return { id: rowId, code, name, ...(branch && ['HEAD_OFFICE', 'BRANCH'].includes(row.unitType) ? { unitType: row.unitType } : {}) };
}
function position(value: unknown): ChartPosition | null {
  const row = object(value), base = unit(row);
  return base ? { ...base, reportsToPositionId: id(row.reportsToPositionId) || null } : null;
}

export function parseEmployeeChart(value: unknown): EmployeeChart {
  const row = object(value), context = object(row.context);
  const employees = Array.isArray(row.employees) ? row.employees.flatMap(value => {
    const person = object(value), branch = unit(person.branch, true), personId = id(person.id), empCode = text(person.empCode), name = text(person.name);
    return personId && empCode && name && branch ? [{ id: personId, empCode, name, photoRef: photo(person.photoRef), branch, department: unit(person.department), position: position(person.position) }] : [];
  }) : [];
  const leadership = Array.isArray(row.leadership) ? row.leadership.flatMap(value => {
    const person = object(value), personId = id(person.id), name = text(person.name), role = text(person.role);
    return personId && name && role ? [{ id: personId, name, role, roleOther: text(person.roleOther) || null, displayOrder: Number.isFinite(Number(person.displayOrder)) ? Number(person.displayOrder) : 0, photoRef: photo(person.photoRef) }] : [];
  }) : [];
  return { at: text(row.at), view: 'employee', context: { assigned: context.assigned === true, branch: unit(context.branch, true), department: unit(context.department), position: position(context.position) }, employees, leadership };
}

export function employeeChartSections(chart: EmployeeChart) {
  const ownBranch = chart.context.branch;
  const ownIsHeadOffice = ownBranch?.unitType === 'HEAD_OFFICE';
  return {
    leadership: [...chart.leadership, ...chart.employees.filter(person => !ownIsHeadOffice && person.branch.unitType === 'HEAD_OFFICE')] as ChartPerson[],
    branch: ownBranch ? { ...ownBranch, employees: chart.employees.filter(person => person.branch.id === ownBranch.id) } : null,
  };
}

export class ApiError extends Error {
  constructor(message: string, public status: number, public code?: string) { super(message); }
}

export const isSessionEndingError = (error: { status?: number; code?: string }) =>
  error.status === 401 || error.status === 403 && !!error.code?.startsWith('ORG_');

export function createApi(baseUrl: string, transport: typeof fetch = fetch, onUnauthorized: (code?: string) => void | Promise<void> = () => {}, renewAccess?: (staleToken: string) => Promise<string>) {
  let origin: URL;
  try { origin = new URL(baseUrl); } catch { throw new Error('Set a valid HTTPS API origin.'); }
  if ((origin.protocol !== 'https:' && !(process.env.NODE_ENV !== 'production' && origin.protocol === 'http:')) || origin.username || origin.password) {
    throw new Error('Set a valid HTTPS API origin.');
  }
  if (origin.pathname !== '/' || origin.search || origin.hash) throw new Error('API URL must be an origin without a path.');
  const root = origin.origin;
  const accessEnded = (status: number, code?: string) => status === 401 && code !== 'INVALID_CURRENT_PASSWORD' || status === 403 && !!code?.startsWith('ORG_');

  async function fetchWithSession(method: string, path: string, body?: unknown, token?: string) {
    const send = (access?: string) => transport(`${root}/api/v1${path}`, {
      method,
      headers: { ...(body === undefined ? {} : { 'Content-Type': 'application/json' }), ...(access ? { Authorization: `Bearer ${access}` } : {}) },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    }).catch(() => { throw new ApiError('Network unavailable. Check your connection and try again.', 0); });
    let response = await send(token);
    let parsed: any;
    if (response.status === 401 && token && renewAccess) {
      parsed = await response.json().catch(() => null);
      if (!['INVALID_CURRENT_PASSWORD', 'ACCESS_CHANGED', 'DEVICE_REVOKED', 'DEVICE_SESSION_INVALID'].includes(parsed?.code)) {
        try { response = await send(await renewAccess(token)); parsed = undefined; }
        catch (error) { if (isSessionEndingError(error as ApiError)) await onUnauthorized((error as ApiError).code); throw error; }
      }
    }
    return { response, parsed };
  }

  async function request<T>(method: string, path: string, body?: unknown, token?: string): Promise<T> {
    const { response, parsed } = await fetchWithSession(method, path, body, token);
    const json = parsed === undefined ? await response.json().catch(() => null) : parsed;
    if (!response.ok) {
      if (token && accessEnded(response.status, json?.code)) await onUnauthorized(json?.code);
      throw new ApiError(json?.message || `Request failed (${response.status}).`, response.status, json?.code);
    }
    return (json?.data ?? json) as T;
  }

  async function download(path: string, token: string) {
    const { response, parsed } = await fetchWithSession('GET', path, undefined, token);
    if (!response.ok) {
      const json = parsed === undefined ? await response.json().catch(() => null) : parsed;
      if (accessEnded(response.status, json?.code)) await onUnauthorized(json?.code);
      throw new ApiError(json?.message || `Download failed (${response.status}).`, response.status, json?.code);
    }
    return { bytes: new Uint8Array(await response.arrayBuffer()), mimeType: response.headers.get('content-type') || 'application/octet-stream' };
  }

  return {
    root,
    get: <T>(path: string, token?: string) => request<T>('GET', path, undefined, token),
    post: <T>(path: string, body?: unknown, token?: string) => request<T>('POST', path, body, token),
    download,
  };
}

export type Api = ReturnType<typeof createApi>;
