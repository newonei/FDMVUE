import { describe, expect, it } from 'vitest';

import { formatPerformanceDateTime, formatPerformanceRate } from './format';

describe('formatPerformanceDateTime', () => {
  it('formats the epoch-millisecond values returned by the dashboard API', () => {
    expect(formatPerformanceDateTime(1_786_697_005_000)).toMatch(/^\d{4}-\d{2}-\d{2} /);
    expect(formatPerformanceDateTime('1786697005000')).toMatch(/^\d{4}-\d{2}-\d{2} /);
  });

  it('keeps ISO values supported and uses a placeholder for empty values', () => {
    expect(formatPerformanceDateTime('2026-08-18T12:00:00')).toMatch(/^2026-08-18 /);
    expect(formatPerformanceDateTime(null)).toBe('-');
    expect(formatPerformanceDateTime('')).toBe('-');
  });
});

describe('formatPerformanceRate', () => {
  it('formats decimal API ratios as a percentage exactly once', () => {
    expect(formatPerformanceRate(0.2143)).toBe('21.4%');
    expect(formatPerformanceRate(1)).toBe('100.0%');
    expect(formatPerformanceRate(0)).toBe('0.0%');
  });

  it('uses a placeholder for absent or invalid API values', () => {
    expect(formatPerformanceRate()).toBe('-');
    expect(formatPerformanceRate(null)).toBe('-');
    expect(formatPerformanceRate(Number.NaN)).toBe('-');
  });
});
