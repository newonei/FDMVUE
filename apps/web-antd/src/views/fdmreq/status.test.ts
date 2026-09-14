import { describe, expect, it } from 'vitest';

import { displayValue, getFdmReqStatusMeta } from './status';

describe('fdmreq status helpers', () => {
  it('keeps pushed/tested/accepted labels distinct', () => {
    expect(getFdmReqStatusMeta('PUSHED_CHECKING').label).toBe('已推送检查中');
    expect(getFdmReqStatusMeta('PENDING_ACCEPTANCE').label).toBe('待我验收');
    expect(getFdmReqStatusMeta('ACCEPTED').label).toBe('已验收');
  });

  it('shows 无 instead of blank for missing delivery fields', () => {
    expect(displayValue(undefined)).toBe('无');
    expect(displayValue('')).toBe('无');
    expect(displayValue('abc')).toBe('abc');
  });
});
