import { describe, expect, it } from 'vitest';

import { normalizeLocalDateForForm } from './local-date';

describe('normalizeLocalDateForForm', () => {
  it('normalizes the LocalDate array returned by the backend', () => {
    expect(normalizeLocalDateForForm([2026, 7, 14])).toBe('2026-07-14');
  });

  it('normalizes supported date strings', () => {
    expect(normalizeLocalDateForForm('2026-7-8')).toBe('2026-07-08');
    expect(normalizeLocalDateForForm('2026-07-14T00:00:00')).toBe('2026-07-14');
    expect(normalizeLocalDateForForm('2026,7,14')).toBe('2026-07-14');
  });

  it('rejects empty and invalid dates', () => {
    expect(normalizeLocalDateForForm(undefined)).toBeUndefined();
    expect(normalizeLocalDateForForm([2026, 2, 30])).toBeUndefined();
    expect(normalizeLocalDateForForm('not-a-date')).toBeUndefined();
  });
});
