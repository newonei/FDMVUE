import { describe, expect, it } from 'vitest';

import { validatePurchaseInReverseReason } from './status-policy';

describe('eRP purchase-in posting policy', () => {
  it('trims a valid auditable reverse reason', () => {
    expect(
      validatePurchaseInReverseReason('  质检退回，撤销本次入库  '),
    ).toEqual({
      reason: '质检退回，撤销本次入库',
      valid: true,
    });
    expect(validatePurchaseInReverseReason('a'.repeat(500))).toMatchObject({
      valid: true,
    });
    expect(validatePurchaseInReverseReason('\u2003质检退回重审\u2003')).toEqual(
      {
        reason: '质检退回重审',
        valid: true,
      },
    );
  });

  it('rejects blank, overlong, and control-bearing reverse reasons', () => {
    expect(validatePurchaseInReverseReason('   ')).toMatchObject({
      valid: false,
    });
    expect(validatePurchaseInReverseReason('a'.repeat(501))).toMatchObject({
      valid: false,
    });
    expect(validatePurchaseInReverseReason('第一行\n第二行')).toEqual({
      error: '反过账原因不能包含控制字符',
      valid: false,
    });
    expect(
      validatePurchaseInReverseReason(`原因${String.fromCodePoint(127)}`),
    ).toMatchObject({ valid: false });
  });
});
