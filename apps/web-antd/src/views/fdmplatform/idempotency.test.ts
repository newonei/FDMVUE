import { afterEach, describe, expect, it, vi } from 'vitest';

import { newIdempotencyKey } from '../../api/fdmplatform/idempotency';

const uuidPattern =
  /^[\da-f]{8}-[\da-f]{4}-4[\da-f]{3}-[89ab][\da-f]{3}-[\da-f]{12}$/;

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('business operation identifiers in HTTP browsers', () => {
  it('uses the native UUID when supported', () => {
    const native = vi.fn(() => '5a408ca1-1976-46dc-8670-40b8526a570c');
    vi.stubGlobal('crypto', { randomUUID: native });
    expect(newIdempotencyKey()).toBe('5a408ca1-1976-46dc-8670-40b8526a570c');
    expect(native).toHaveBeenCalledOnce();
  });

  it('supports LAN HTTP without randomUUID and keeps UUID version and variant', () => {
    const getRandomValues = vi.fn((bytes: Uint8Array) => bytes.fill(255));
    vi.stubGlobal('crypto', { getRandomValues });
    expect(newIdempotencyKey()).toBe('ffffffff-ffff-4fff-bfff-ffffffffffff');
    expect(getRandomValues).toHaveBeenCalledOnce();
  });

  it.each([undefined, {}])(
    'supports a browser with no crypto generator: %s',
    (cryptoApi) => {
      vi.stubGlobal('crypto', cryptoApi);
      vi.spyOn(Date, 'now').mockReturnValue(1_788_768_000_000);
      vi.spyOn(Math, 'random').mockReturnValue(0.5);
      const keys = Array.from({ length: 2000 }, () => newIdempotencyKey());
      expect(new Set(keys).size).toBe(keys.length);
      for (const key of keys) expect(key).toMatch(uuidPattern);
    },
  );
});
