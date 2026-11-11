import { isSessionEndingError, type Api, type ApiError, type EmployeeContext, type EmployeeUser } from './api';

const SESSION_KEY = 'employeeDeviceSession';
const LEGACY_KEY = 'employeeToken';
export type TokenStore = Pick<typeof import('expo-secure-store'), 'getItemAsync' | 'setItemAsync' | 'deleteItemAsync'>;
export type EmployeeSession = { token: string; user: EmployeeUser; context: EmployeeContext };
type Tokens = { accessToken: string; refreshToken: string };
type LinkResult = Tokens & { user: EmployeeUser };

async function readTokens(store: TokenStore): Promise<Tokens | null> {
  const raw = await store.getItemAsync(SESSION_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    return typeof parsed.accessToken === 'string' && typeof parsed.refreshToken === 'string' ? parsed : null;
  } catch { return null; }
}

export async function acceptEmployeeLink(result: LinkResult, api: Pick<Api, 'get'>, store: TokenStore): Promise<EmployeeSession> {
  if (!result.accessToken || !result.refreshToken || result.user?.role !== 'EMPLOYEE') throw new Error('This app is for linked employee accounts only.');
  const context = await api.get<EmployeeContext>('/me/context', result.accessToken);
  if (!context.linked || !context.employee) throw new Error('Your account is not linked to an active employee. Ask HR to link it.');
  await store.setItemAsync(SESSION_KEY, JSON.stringify({ accessToken: result.accessToken, refreshToken: result.refreshToken }));
  await store.deleteItemAsync(LEGACY_KEY);
  return { token: result.accessToken, user: result.user, context };
}

export async function refreshEmployeeSession(api: Pick<Api, 'post'>, store: TokenStore, staleToken?: string): Promise<Tokens & { user?: EmployeeUser }> {
  const tokens = await readTokens(store);
  if (!tokens) throw new Error('Link this phone from your self-service portal.');
  if (staleToken && tokens.accessToken !== staleToken) return tokens;
  const result = await api.post<LinkResult>('/mobile/session/refresh', { refreshToken: tokens.refreshToken });
  if (!result.accessToken || !result.refreshToken || result.user?.role !== 'EMPLOYEE') throw new Error('Employee device session is invalid.');
  await store.setItemAsync(SESSION_KEY, JSON.stringify({ accessToken: result.accessToken, refreshToken: result.refreshToken }));
  return result;
}

export async function restoreEmployeeSession(api: Pick<Api, 'get' | 'post'>, store: TokenStore): Promise<EmployeeSession | null> {
  if (!(await readTokens(store))) { await store.deleteItemAsync(LEGACY_KEY); return null; }
  try {
    const renewed = await refreshEmployeeSession(api, store);
    const user = await api.get<EmployeeUser>('/auth/me', renewed.accessToken);
    if (user.role !== 'EMPLOYEE') throw new Error('Employee access required.');
    const context = await api.get<EmployeeContext>('/me/context', renewed.accessToken);
    if (!context.linked || !context.employee) throw new Error('Employee link unavailable.');
    return { token: renewed.accessToken, user, context };
  } catch (error) {
    if (!isSessionEndingError(error as ApiError)) throw error;
    await clearEmployeeSession(store);
    return null;
  }
}

export async function getRefreshToken(store: TokenStore) { return (await readTokens(store))?.refreshToken || null; }
export async function revokeEmployeeSession(api: Pick<Api, 'post'>, store: TokenStore) {
  const refreshToken = await getRefreshToken(store);
  try { if (refreshToken) await api.post('/mobile/session/revoke', { refreshToken }); }
  catch (error) { if ((error as ApiError)?.status !== 401) throw error; }
  await clearEmployeeSession(store);
}
export async function clearEmployeeSession(store: TokenStore) { await Promise.all([store.deleteItemAsync(SESSION_KEY), store.deleteItemAsync(LEGACY_KEY)]); }
