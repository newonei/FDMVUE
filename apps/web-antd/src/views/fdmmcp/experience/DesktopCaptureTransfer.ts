import type {
  ExperienceProfile,
  ExperienceSeed,
} from '#/api/fdmmcp/experience';

import { lengths } from './report';

const localPortal = 'http://127.0.0.1:5666';
const storageKey = 'fdm:desktop-experience:grant';
export const captureEvent = 'fdm:desktop-experience:grant-ready';
export interface DesktopGrant {
  port: number;
  ticket: string;
  expires: number;
}
let pending: DesktopGrant | undefined;

// Strip the one-time grant before the normal login redirect and tab history capture the URL.
export function rememberCapture(path: string, hash: string): boolean {
  if (location.origin !== localPortal || path !== '/dashboard/experience')
    return false;
  const match = /^#fdm-capture=(\d{1,5})\.([A-Za-z0-9_-]{43})$/.exec(hash);
  if (!match || Number(match[1]) < 1 || Number(match[1]) > 65_535) return false;
  pending = {
    port: Number(match[1]),
    ticket: match[2]!,
    expires: Date.now() + 300_000,
  };
  try {
    sessionStorage.setItem(storageKey, JSON.stringify(pending));
  } catch {
    /* active tab memory is sufficient */
  }
  window.dispatchEvent(new Event(captureEvent));
  return true;
}

export function pendingCapture(): DesktopGrant | undefined {
  if (location.origin !== localPortal) return;
  try {
    const grant =
      pending ?? JSON.parse(sessionStorage.getItem(storageKey) || 'null');
    if (
      grant &&
      Number.isInteger(grant.port) &&
      grant.port > 0 &&
      grant.port <= 65_535 &&
      /^[A-Za-z0-9_-]{43}$/.test(grant.ticket) &&
      Number.isFinite(grant.expires)
    )
      return grant;
  } catch {
    /* absent or stale tab storage */
  }
}
export function clearCapture(ticket: string) {
  if (pendingCapture()?.ticket !== ticket) return;
  pending = undefined;
  try {
    sessionStorage.removeItem(storageKey);
  } catch {
    /* no persisted grant */
  }
}

export async function claimCapture(
  grant: DesktopGrant,
  profile: ExperienceProfile,
  signal: AbortSignal,
): Promise<ExperienceSeed> {
  if (location.origin !== localPortal || grant.expires < Date.now())
    throw new Error('草稿链接已过期，请从桌面对话重新打开。');
  if (!profile.tenantId || !profile.id)
    throw new Error('当前经验服务缺少员工身份信息，请更新本机 FDM 服务。');
  const encode = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    encode.encode(grant.ticket),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const proof = await crypto.subtle.sign(
    'HMAC',
    key,
    encode.encode(JSON.stringify([profile.tenantId, profile.id])),
  );
  const hex = Array.from(new Uint8Array(proof), (byte) =>
    byte.toString(16).padStart(2, '0'),
  ).join('');
  const response = await fetch(
    `http://127.0.0.1:${grant.port}/experience/claim`,
    {
      method: 'POST',
      credentials: 'omit',
      redirect: 'error',
      cache: 'no-store',
      referrerPolicy: 'no-referrer',
      signal,
      headers: { 'content-type': 'text/plain' },
      body: `${grant.ticket}.${hex}`,
    },
  );
  if (response.status === 403)
    throw new Error(
      '请使用与桌面端相同的公司和员工账号登录，然后从桌面重新打开草稿。',
    );
  if (!response.ok) throw new Error('此草稿已失效，请从原对话重新打开。');
  const draft = await response.json();
  if (
    !draft ||
    typeof draft.sourceKey !== 'string' ||
    !/^chat:[a-f0-9]{64}$/.test(draft.sourceKey) ||
    !Object.entries(lengths).every(
      ([key, limit]) =>
        typeof draft[key] === 'string' && draft[key].length <= limit,
    )
  )
    throw new Error('桌面草稿格式无效，请重新打开。');
  const { title, scenario, method, exception, source } = draft;
  return {
    title: '从已完成的对话沉淀经验',
    sourceKey: draft.sourceKey,
    fields: { title, scenario, method, exception, source },
  };
}
