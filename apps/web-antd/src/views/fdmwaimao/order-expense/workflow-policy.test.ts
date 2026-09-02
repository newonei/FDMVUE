import { describe, expect, it } from 'vitest';

import {
  expenseActionRequiresReason,
  hasEveryExpensePermission,
  hasExpenseSourcePermission,
  isValidPositiveExpenseAmount,
} from './workflow-policy';

describe('订单费用前端流程策略', () => {
  it('驳回、取消、重开和作废都要求原因', () => {
    expect(expenseActionRequiresReason('REJECT')).toBe(true);
    expect(expenseActionRequiresReason('CANCEL')).toBe(true);
    expect(expenseActionRequiresReason('REOPEN')).toBe(true);
    expect(expenseActionRequiresReason('VOID')).toBe(true);
    expect(expenseActionRequiresReason('APPROVE')).toBe(false);
    expect(expenseActionRequiresReason('SUBMIT')).toBe(false);
  });

  it('复合权限必须全部满足', () => {
    const granted = new Set(['create', 'query']);
    expect(
      hasEveryExpensePermission(['query', 'create'], (code) =>
        granted.has(code),
      ),
    ).toBe(true);
    expect(
      hasEveryExpensePermission(['query', 'create', 'ai'], (code) =>
        granted.has(code),
      ),
    ).toBe(false);
    expect(hasExpenseSourcePermission(false, false)).toBe(false);
    expect(hasExpenseSourcePermission(true, false)).toBe(true);
    expect(hasExpenseSourcePermission(false, true)).toBe(true);
  });

  it('金额必须严格大于零且最多六位小数', () => {
    expect(isValidPositiveExpenseAmount('0')).toBe(false);
    expect(isValidPositiveExpenseAmount('0.000000')).toBe(false);
    expect(isValidPositiveExpenseAmount('0.000001')).toBe(true);
    expect(isValidPositiveExpenseAmount('123456789012345678.123456')).toBe(
      true,
    );
    expect(isValidPositiveExpenseAmount('1.1234567')).toBe(false);
    expect(isValidPositiveExpenseAmount('-1')).toBe(false);
  });
});
