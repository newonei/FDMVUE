import { describe, expect, it } from 'vitest';

import {
  aiStatusText,
  listTagVisible,
  needsReason,
  sortFindings,
} from './risk';

describe('aI 风险检查显示', () => {
  it('shows list tags only for levels that need attention', () => {
    expect(listTagVisible('HIGH')).toBe(true);
    expect(listTagVisible('WARNING')).toBe(true);
    expect(listTagVisible('INFO')).toBe(false);
    expect(listTagVisible('NONE')).toBe(false);
    expect(listTagVisible(undefined)).toBe(false);
  });

  it('puts open and severe findings first', () => {
    const finding = (
      id: number,
      severity: 'HIGH' | 'INFO' | 'WARNING',
      status: 'OPEN' | 'RESOLVED',
    ) => ({
      id,
      severity,
      status,
      source: 'AI' as const,
      message: '',
      evidenceIds: [],
    });
    const sorted = sortFindings([
      finding(1, 'INFO', 'OPEN'),
      finding(2, 'HIGH', 'RESOLVED'),
      finding(3, 'HIGH', 'OPEN'),
      finding(4, 'WARNING', 'OPEN'),
    ]);
    expect(sorted.map((f) => f.id)).toEqual([3, 4, 1, 2]);
  });

  it('explains why AI did not check and when a reason is required', () => {
    expect(aiStatusText('SUCCEEDED')).toBe('');
    expect(aiStatusText('NOT_CONFIGURED')).toContain('放行');
    expect(needsReason('FALSE_POSITIVE')).toBe(true);
    expect(needsReason('IGNORED')).toBe(true);
    expect(needsReason('RESOLVED')).toBe(false);
  });
});
