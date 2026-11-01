import type { AuthPermissionInfo } from '@vben/types';

export const WORKBENCH_LOGIN_ERROR =
  '工作台登录未完成，请返回飞德慕工作台重新打开首页。';

export interface WorkbenchCredentials {
  ticket: string;
  codeVerifier: string;
}

export interface WorkbenchSession {
  accessToken: string;
  refreshToken: string;
  userId: number;
  tenantId: number;
  expiresTime: number;
}

declare global {
  interface Window {
    __takeWorkbenchLogin?: () => string;
  }
}

let pendingFragment: string | undefined;

/** The HTML bootstrap already removed the fragment before loading scripts. */
export function captureWorkbenchLogin(
  source: Pick<Window, '__takeWorkbenchLogin'>,
) {
  pendingFragment = source.__takeWorkbenchLogin?.();
}

export function parseWorkbenchFragment(fragment: string): WorkbenchCredentials {
  if (fragment.length > 4096 || !fragment.startsWith('#')) throw loginError();
  const params = new URLSearchParams(fragment.slice(1));
  if (
    [...params.keys()].length !== 2 ||
    params.getAll('ticket').length !== 1 ||
    params.getAll('verifier').length !== 1
  )
    throw loginError();
  const ticket = params.get('ticket')!;
  const codeVerifier = params.get('verifier')!;
  if (
    !/^[\w-]{32,256}$/.test(ticket) ||
    !/^[\w.~-]{43,128}$/.test(codeVerifier)
  )
    throw loginError();
  return { ticket, codeVerifier };
}

export function takeWorkbenchCredentials(): WorkbenchCredentials {
  const fragment = pendingFragment;
  pendingFragment = undefined;
  return parseWorkbenchFragment(fragment ?? '');
}

function loginError() {
  return new Error(WORKBENCH_LOGIN_ERROR);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

async function readResult(response: Response): Promise<unknown> {
  if (!response.ok) throw loginError();
  const envelope: unknown = await response.json();
  if (!isRecord(envelope) || envelope.code !== 0) throw loginError();
  return envelope.data;
}

/** No shared client: old credentials, tenant headers and refresh retries are forbidden. */
export async function exchangeWorkbenchTicket(
  credentials: WorkbenchCredentials,
  signal: AbortSignal,
  fetcher: typeof fetch = fetch,
): Promise<WorkbenchSession> {
  try {
    const result = await readResult(
      await fetcher('/admin-api/fdmmcp/portal/exchange', {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(credentials),
        credentials: 'omit',
        cache: 'no-store',
        redirect: 'error',
        referrerPolicy: 'no-referrer',
        signal,
      }),
    );
    if (
      !isRecord(result) ||
      typeof result.accessToken !== 'string' ||
      !result.accessToken ||
      typeof result.refreshToken !== 'string' ||
      !result.refreshToken ||
      !Number.isSafeInteger(result.userId) ||
      Number(result.userId) <= 0 ||
      !Number.isSafeInteger(result.tenantId) ||
      Number(result.tenantId) <= 0 ||
      typeof result.expiresTime !== 'number' ||
      !Number.isFinite(result.expiresTime) ||
      result.expiresTime <= Date.now()
    )
      throw loginError();
    return result as unknown as WorkbenchSession;
  } catch {
    throw loginError();
  }
}

/** Fetch the new identity without the normal client's re-login/refresh side effects. */
export async function getWorkbenchPermissions(
  session: WorkbenchSession,
  signal: AbortSignal,
  fetcher: typeof fetch = fetch,
): Promise<AuthPermissionInfo> {
  try {
    const result = await readResult(
      await fetcher('/admin-api/system/auth/get-permission-info', {
        headers: {
          Accept: 'application/json',
          Authorization: `Bearer ${session.accessToken}`,
          'tenant-id': String(session.tenantId),
        },
        credentials: 'omit',
        cache: 'no-store',
        redirect: 'error',
        referrerPolicy: 'no-referrer',
        signal,
      }),
    );
    if (
      !isRecord(result) ||
      !isRecord(result.user) ||
      result.user.id !== session.userId ||
      !Array.isArray(result.roles) ||
      !Array.isArray(result.permissions) ||
      !Array.isArray(result.menus)
    )
      throw loginError();
    return result as unknown as AuthPermissionInfo;
  } catch {
    throw loginError();
  }
}

export async function completeWorkbenchLogin(options: {
  applySession: (session: WorkbenchSession) => Promise<void>;
  clearIdentity: () => void;
  credentials: () => WorkbenchCredentials;
  exchange: (credentials: WorkbenchCredentials) => Promise<WorkbenchSession>;
  goHome: () => Promise<unknown>;
  signal: AbortSignal;
}) {
  options.clearIdentity();
  try {
    options.signal.throwIfAborted();
    const session = await options.exchange(options.credentials());
    options.signal.throwIfAborted();
    await options.applySession(session);
    options.signal.throwIfAborted();
    await options.goHome();
  } catch {
    options.clearIdentity();
    throw loginError();
  }
}
