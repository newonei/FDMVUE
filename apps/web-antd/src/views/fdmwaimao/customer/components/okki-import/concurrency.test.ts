import { describe, expect, it } from 'vitest';

import {
  CUSTOMER_PROFILE_VERSION_CONFLICT,
  isBusinessCode,
  isValidPreviewHash,
  isValidProfileVersion,
  OKKI_IMPORT_PREVIEW_STALE,
} from './concurrency';

describe('oKKI import optimistic concurrency guards', () => {
  it('recognizes numeric and serialized backend conflict codes', () => {
    expect(
      isBusinessCode(
        CUSTOMER_PROFILE_VERSION_CONFLICT,
        CUSTOMER_PROFILE_VERSION_CONFLICT,
      ),
    ).toBe(true);
    expect(
      isBusinessCode(
        String(OKKI_IMPORT_PREVIEW_STALE),
        OKKI_IMPORT_PREVIEW_STALE,
      ),
    ).toBe(true);
    expect(isBusinessCode(undefined, OKKI_IMPORT_PREVIEW_STALE)).toBe(false);
  });

  it('accepts only a complete SHA-256 preview hash', () => {
    expect(
      isValidPreviewHash(
        '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
      ),
    ).toBe(true);
    expect(isValidPreviewHash('0123456789abcdef')).toBe(false);
    expect(isValidPreviewHash(undefined)).toBe(false);
  });

  it('accepts only non-negative safe integer profile versions', () => {
    expect(isValidProfileVersion(0)).toBe(true);
    expect(isValidProfileVersion(7)).toBe(true);
    expect(isValidProfileVersion(-1)).toBe(false);
    expect(isValidProfileVersion(1.5)).toBe(false);
    expect(isValidProfileVersion(Number.MAX_SAFE_INTEGER + 1)).toBe(false);
    expect(isValidProfileVersion(undefined)).toBe(false);
  });
});
