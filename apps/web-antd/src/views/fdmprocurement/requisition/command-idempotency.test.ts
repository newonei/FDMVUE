import type { CommandKeyStorage } from './command-idempotency';

import { describe, expect, it } from 'vitest';

import {
  clearStableCommandKey,
  getStableCommandKey,
} from './command-idempotency';

function testStorage(): CommandKeyStorage {
  const values = new Map<string, string>();
  return {
    getItem: (key) => values.get(key) ?? null,
    removeItem: (key) => values.delete(key),
    setItem: (key, value) => values.set(key, value),
  };
}

describe('procurement lifecycle idempotency key', () => {
  it('reuses one key for a network retry of the exact same command', () => {
    const storage = testStorage();
    const identity = '101|v4|assessment-201|hash-a|comment-a';

    const first = getStableCommandKey('submit', identity, storage);
    const retry = getStableCommandKey('submit', identity, storage);

    expect(retry).toBe(first);
  });

  it('changes identity when version or frozen selection changes', () => {
    const storage = testStorage();
    const first = getStableCommandKey('submit', '101|v4|201|hash-a', storage);
    const nextVersion = getStableCommandKey(
      'submit',
      '101|v5|202|hash-b',
      storage,
    );

    expect(nextVersion).not.toBe(first);
  });

  it('clears the key only after a confirmed success', () => {
    const storage = testStorage();
    const identity = '101|v4|201|hash-a';
    const first = getStableCommandKey('submit', identity, storage);

    clearStableCommandKey('submit', identity, storage);

    expect(getStableCommandKey('submit', identity, storage)).not.toBe(first);
  });
});
