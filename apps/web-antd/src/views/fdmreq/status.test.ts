import { describe, expect, it } from 'vitest';

import { displayValue, getFdmReqStatusMeta } from './status';

describe('fdmreq status helpers', () => {
  it('uses v1.3.1 labels for confirm / live-test / completed', () => {
    expect(getFdmReqStatusMeta('PENDING_CONFIRM').label).toBe('方案待确认');
    expect(getFdmReqStatusMeta('APPROVED_PENDING_DEV').label).toBe('已授权待开发');
    expect(getFdmReqStatusMeta('PENDING_ACCEPTANCE').label).toBe('待活测');
    expect(getFdmReqStatusMeta('COMPLETED').label).toBe('已完结');
    expect(getFdmReqStatusMeta('ACCEPTED').label).toBe('已完结');
  });

  it('keeps pushed/tested labels distinct from live-test', () => {
    expect(getFdmReqStatusMeta('PUSHED_CHECKING').label).toBe('已推送检查中');
    expect(getFdmReqStatusMeta('TESTING').label).toBe('测试中');
  });

  it('shows 无 instead of blank for missing delivery fields', () => {
    expect(displayValue(undefined)).toBe('无');
    expect(displayValue('')).toBe('无');
    expect(displayValue('abc')).toBe('abc');
  });
});
