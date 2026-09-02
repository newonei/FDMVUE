const STORAGE_PREFIX = 'fdm:waimao:order-expense:command:v1';
const ACTIVE_GENERATION_KEY = 'fdm:waimao:order-expense:active-generation:v1';

interface StoredCommand {
  fingerprintDigest: string;
  idempotencyKey: string;
}

export interface ActiveExpenseGeneration {
  runId: string;
  runVersion: string;
  sourceId: string;
  sourceType: 'FDM_WAIMAO_CONTRACT_ORDER' | 'FDM_WAIMAO_SHIPMENT';
  sourceVersion: number;
}

function randomKey(prefix: string) {
  const uuid = globalThis.crypto?.randomUUID?.();
  return `${prefix}-${uuid ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`}`;
}

function storageKey(identity: string) {
  return `${STORAGE_PREFIX}:${encodeURIComponent(identity)}`;
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
 * Keeps the command identity stable across a timeout/reopen. sessionStorage contains only
 * command metadata; no customer, model output, amount, FX rate, or other business facts.
 */
export async function getOrCreateExpenseCommand(
  identity: string,
  fingerprint: string,
  prefix: string,
) {
  const fingerprintDigest = await sha256(fingerprint);
  if (typeof window !== 'undefined' && fingerprintDigest) {
    try {
      const raw = window.sessionStorage.getItem(storageKey(identity));
      if (raw) {
        const value = JSON.parse(raw) as Partial<StoredCommand>;
        if (
          value.fingerprintDigest === fingerprintDigest &&
          typeof value.idempotencyKey === 'string' &&
          value.idempotencyKey.length > 0
        ) {
          return value.idempotencyKey;
        }
      }
    } catch {
      // An unavailable or corrupt session store must not block the business command.
    }
  }

  const idempotencyKey = randomKey(prefix);
  if (typeof window !== 'undefined' && fingerprintDigest) {
    try {
      window.sessionStorage.setItem(
        storageKey(identity),
        JSON.stringify({
          fingerprintDigest,
          idempotencyKey,
        } satisfies StoredCommand),
      );
    } catch {
      // The server-side unique identity remains the final concurrency guard.
    }
  }
  return idempotencyKey;
}

export function clearExpenseCommand(identity: string) {
  if (typeof window === 'undefined') return;
  try {
    window.sessionStorage.removeItem(storageKey(identity));
  } catch {
    // Ignore unavailable session storage after a confirmed command response.
  }
}

export function saveActiveExpenseGeneration(value: ActiveExpenseGeneration) {
  if (typeof window === 'undefined') return;
  try {
    window.sessionStorage.setItem(ACTIVE_GENERATION_KEY, JSON.stringify(value));
  } catch {
    // Losing resumability must not change the server-side generation command.
  }
}

export function loadActiveExpenseGeneration():
  | ActiveExpenseGeneration
  | undefined {
  if (typeof window === 'undefined') return undefined;
  try {
    const raw = window.sessionStorage.getItem(ACTIVE_GENERATION_KEY);
    if (!raw) return undefined;
    const value = JSON.parse(raw) as Partial<ActiveExpenseGeneration>;
    if (
      typeof value.runId !== 'string' ||
      !/^[1-9]\d{0,18}$/.test(value.runId) ||
      typeof value.runVersion !== 'string' ||
      !/^\d{1,19}$/.test(value.runVersion) ||
      typeof value.sourceId !== 'string' ||
      !/^[1-9]\d{0,18}$/.test(value.sourceId) ||
      !['FDM_WAIMAO_CONTRACT_ORDER', 'FDM_WAIMAO_SHIPMENT'].includes(
        value.sourceType ?? '',
      ) ||
      typeof value.sourceVersion !== 'number' ||
      !Number.isInteger(value.sourceVersion) ||
      value.sourceVersion < 0
    ) {
      window.sessionStorage.removeItem(ACTIVE_GENERATION_KEY);
      return undefined;
    }
    return value as ActiveExpenseGeneration;
  } catch {
    return undefined;
  }
}

export function clearActiveExpenseGeneration() {
  if (typeof window === 'undefined') return;
  try {
    window.sessionStorage.removeItem(ACTIVE_GENERATION_KEY);
  } catch {
    // Ignore an unavailable session store after the run has reached a terminal state.
  }
}
