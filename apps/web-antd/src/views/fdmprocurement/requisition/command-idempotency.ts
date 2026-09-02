interface CommandKeyStorage {
  getItem(key: string): null | string;
  removeItem(key: string): void;
  setItem(key: string, value: string): void;
}

const memoryStorage = new Map<string, string>();

const fallbackStorage: CommandKeyStorage = {
  getItem: (key) => memoryStorage.get(key) ?? null,
  removeItem: (key) => memoryStorage.delete(key),
  setItem: (key, value) => memoryStorage.set(key, value),
};

function activeStorage(): CommandKeyStorage {
  try {
    return typeof window === 'undefined'
      ? fallbackStorage
      : window.sessionStorage;
  } catch {
    return fallbackStorage;
  }
}

function fingerprint(value: string) {
  let left = 2_166_136_261;
  let right = 2_654_435_769;
  for (let index = 0; index < value.length; index += 1) {
    const code = value.codePointAt(index) ?? 0;
    left = Math.imul(left ^ code, 16_777_619);
    right = Math.imul(right ^ code, 2_246_822_507);
  }
  const unsignedLeft = left < 0 ? left + 4_294_967_296 : left;
  const unsignedRight = right < 0 ? right + 4_294_967_296 : right;
  return `${unsignedLeft.toString(16).padStart(8, '0')}${unsignedRight
    .toString(16)
    .padStart(8, '0')}`;
}

function storageKey(operation: string, commandIdentity: string) {
  return `fdmprocurement:idempotency:${operation}:${fingerprint(commandIdentity)}`;
}

function randomSuffix() {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

/**
 * 同一业务命令在响应丢失后重试时复用一个 key。业务版本、选定方案或命令内容
 * 变化会形成新的 commandIdentity，因此不会把新的业务意图误判成旧命令。
 */
export function getStableCommandKey(
  operation: string,
  commandIdentity: string,
  storage: CommandKeyStorage = activeStorage(),
) {
  const key = storageKey(operation, commandIdentity);
  const existing = storage.getItem(key);
  if (existing) return existing;
  const created = `procurement:${operation}:${randomSuffix()}`.slice(0, 128);
  storage.setItem(key, created);
  return created;
}

export function clearStableCommandKey(
  operation: string,
  commandIdentity: string,
  storage: CommandKeyStorage = activeStorage(),
) {
  storage.removeItem(storageKey(operation, commandIdentity));
}

export type { CommandKeyStorage };
