import { describe, expect, it } from 'vitest';

import { validatePurchaseReturnReverseReason } from './status-policy';

describe('fDM purchase-return posting policy', () => {
  it('trims a valid auditable reverse reason', () => {
    expect(
      validatePurchaseReturnReverseReason('  供应商撤回退货，恢复库存  '),
    ).toEqual({
      reason: '供应商撤回退货，恢复库存',
      valid: true,
    });
    expect(validatePurchaseReturnReverseReason('a'.repeat(500))).toMatchObject({
      valid: true,
    });
    expect(
      validatePurchaseReturnReverseReason('\u2003供应商撤回退货\u2003'),
    ).toEqual({
      reason: '供应商撤回退货',
      valid: true,
    });
  });

  it('rejects blank, overlong, and control-bearing reverse reasons', () => {
    expect(validatePurchaseReturnReverseReason('   ')).toMatchObject({
      valid: false,
    });
    expect(validatePurchaseReturnReverseReason('a'.repeat(501))).toMatchObject({
      valid: false,
    });
    expect(validatePurchaseReturnReverseReason('第一行\n第二行')).toEqual({
      error: '反过账原因不能包含控制字符',
      valid: false,
    });
    expect(
      validatePurchaseReturnReverseReason(`原因${String.fromCodePoint(127)}`),
    ).toMatchObject({ valid: false });
  });
});
