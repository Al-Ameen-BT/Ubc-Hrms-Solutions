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
  employee: { id: number; empCode: string; name: string; designation?: string; department?: string; branchName?: string } | null;
};

export class ApiError extends Error {
  constructor(message: string, public status: number, public code?: string) { super(message); }
}

export function createApi(baseUrl: string, transport: typeof fetch = fetch, onUnauthorized: () => void = () => {}, renewAccess?: (staleToken: string) => Promise<string>) {
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
      if (!['INVALID_CURRENT_PASSWORD', 'DEVICE_REVOKED'].includes(parsed?.code)) {
        try { response = await send(await renewAccess(token)); parsed = undefined; }
        catch (error) { if ((error as ApiError)?.status !== 0) onUnauthorized(); throw error; }
      }
    }
    return { response, parsed };
  }

  async function request<T>(method: string, path: string, body?: unknown, token?: string): Promise<T> {
    const { response, parsed } = await fetchWithSession(method, path, body, token);
    const json = parsed === undefined ? await response.json().catch(() => null) : parsed;
    if (!response.ok) {
      if (token && accessEnded(response.status, json?.code)) onUnauthorized();
      throw new ApiError(json?.message || `Request failed (${response.status}).`, response.status, json?.code);
    }
    return (json?.data ?? json) as T;
  }

  async function download(path: string, token: string) {
    const { response, parsed } = await fetchWithSession('GET', path, undefined, token);
    if (!response.ok) {
      const json = parsed === undefined ? await response.json().catch(() => null) : parsed;
      if (accessEnded(response.status, json?.code)) onUnauthorized();
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
