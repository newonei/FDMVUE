import { describe, expect, it } from 'vitest';

import { normalizeModelIdentifier } from './model-identifier';

describe('normalizeModelIdentifier', () => {
  it('preserves backend Long identifiers without precision loss', () => {
    expect(normalizeModelIdentifier('2083489455964938241')).toBe(
      '2083489455964938241',
    );
  });

  it('normalizes legacy safe numeric identifiers', () => {
    expect(normalizeModelIdentifier(88)).toBe('88');
  });

  it('rejects unsafe or malformed identifiers', () => {
    expect(
      normalizeModelIdentifier(Number.MAX_SAFE_INTEGER + 1),
    ).toBeUndefined();
    expect(normalizeModelIdentifier('not-an-id')).toBeUndefined();
    expect(normalizeModelIdentifier(undefined)).toBeUndefined();
  });
});
