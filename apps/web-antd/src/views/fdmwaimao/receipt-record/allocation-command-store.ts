const STORAGE_PREFIX = 'fdm:waimao:receipt-allocation:command:v1';
const ACTIVE_GENERATION_KEY =
  'fdm:waimao:receipt-allocation:active-generation:v1';

interface StoredCommand {
  fingerprintDigest: string;
  idempotencyKey: string;
}

export interface ActiveAllocationGeneration {
  runId: string;
  runVersion: string;
  sourceId: string;
  sourceVersion: number;
}

function storageKey(identity: string) {
  return `${STORAGE_PREFIX}:${encodeURIComponent(identity)}`;
}

function randomKey(prefix: string) {
  const uuid = globalThis.crypto?.randomUUID?.();
  return `${prefix}-${uuid ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`}`;
}

async function sha256(value: string) {
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) return undefined;
  const bytes = new TextEncoder().encode(value);
  const digest = await subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)]
    .map((item) => item.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * sessionStorage 只保留 SHA-256 指纹与命令键，不落客户、合同、金额、AI
 * 提案或汇率。服务端数据库唯一键仍是并发与精确重放的最终防线。
 */
export async function getOrCreateAllocationCommand(
  identity: string,
  fingerprint: string,
  prefix: string,
) {
  const fingerprintDigest = await sha256(fingerprint);
  if (typeof window !== 'undefined' && fingerprintDigest) {
    try {
      const raw = window.sessionStorage.getItem(storageKey(identity));
      if (raw) {
        const saved = JSON.parse(raw) as Partial<StoredCommand>;
        if (
          saved.fingerprintDigest === fingerprintDigest &&
          typeof saved.idempotencyKey === 'string' &&
          saved.idempotencyKey.length >= 8
        ) {
          return saved.idempotencyKey;
        }
      }
    } catch {
      // Storage availability must never block a server-protected command.
    }
  }

  const idempotencyKey = randomKey(prefix);
  if (typeof window !== 'undefined' && fingerprintDigest) {
    try {
      window.sessionStorage.setItem(
        storageKey(identity),
        JSON.stringify({ fingerprintDigest, idempotencyKey }),
      );
    } catch {
      // Server-side exact replay remains authoritative.
    }
  }
  return idempotencyKey;
}

export function clearAllocationCommand(identity: string) {
  if (typeof window === 'undefined') return;
  try {
    window.sessionStorage.removeItem(storageKey(identity));
  } catch {
    // Ignore unavailable session storage after a confirmed response.
  }
}

export function saveActiveAllocationGeneration(
  value: ActiveAllocationGeneration,
) {
  if (typeof window === 'undefined') return;
  try {
    window.sessionStorage.setItem(ACTIVE_GENERATION_KEY, JSON.stringify(value));
  } catch {
    // 丢失浏览器恢复能力不能改变服务端生成任务本身。
  }
}

export function loadActiveAllocationGeneration():
  | ActiveAllocationGeneration
  | undefined {
  if (typeof window === 'undefined') return undefined;
  try {
    const raw = window.sessionStorage.getItem(ACTIVE_GENERATION_KEY);
    if (!raw) return undefined;
    const value = JSON.parse(raw) as Partial<ActiveAllocationGeneration>;
    if (
      typeof value.runId !== 'string' ||
      !/^[1-9]\d{0,18}$/.test(value.runId) ||
      typeof value.runVersion !== 'string' ||
      !/^\d{1,19}$/.test(value.runVersion) ||
      typeof value.sourceId !== 'string' ||
      !/^[1-9]\d{0,18}$/.test(value.sourceId) ||
      typeof value.sourceVersion !== 'number' ||
      !Number.isInteger(value.sourceVersion) ||
      value.sourceVersion < 0
    ) {
      window.sessionStorage.removeItem(ACTIVE_GENERATION_KEY);
      return undefined;
    }
    return value as ActiveAllocationGeneration;
  } catch {
    return undefined;
  }
}

export function clearActiveAllocationGeneration() {
  if (typeof window === 'undefined') return;
  try {
    window.sessionStorage.removeItem(ACTIVE_GENERATION_KEY);
  } catch {
    // 终态后的本地清理失败不影响服务端事实。
  }
}
