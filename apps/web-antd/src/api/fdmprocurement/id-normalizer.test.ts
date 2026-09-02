import { describe, expect, it } from 'vitest';

import { normalizeId, normalizeNullableId } from './id-normalizer';

describe('procurement id normalizer', () => {
  it('normalizes safe JSON numbers and preserves decimal strings exactly', () => {
    expect(normalizeId(164)).toBe('164');
    expect(normalizeId('9223372036854775807')).toBe('9223372036854775807');
    expect(normalizeNullableId(null)).toBeNull();
  });

  it('fails closed instead of accepting an already imprecise JSON number', () => {
    expect(() => normalizeId(Number.MAX_SAFE_INTEGER + 1)).toThrow(
      '超出 JavaScript 安全整数范围',
    );
  });
});
