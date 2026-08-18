import { describe, expect, it } from 'vitest';

import {
  normalizeCreativeLongId,
  requireCreativeLongId,
} from './creative-long-id';

describe('creative long id', () => {
  it('preserves serialized backend Long values as strings', () => {
    expect(normalizeCreativeLongId('2083489455964938241')).toBe(
      '2083489455964938241',
    );
  });

  it('accepts only legacy safe numeric values', () => {
    expect(normalizeCreativeLongId(88)).toBe('88');
    expect(normalizeCreativeLongId(Number.MAX_SAFE_INTEGER + 1)).toBeUndefined();
  });

  it('does not let malformed identifiers reach an API or SSE resource', () => {
    expect(() => requireCreativeLongId('0', 'executionId')).toThrow(
      'executionId',
    );
    expect(() => requireCreativeLongId(' 1.5 ', 'executionId')).toThrow(
      'executionId',
    );
  });
});
