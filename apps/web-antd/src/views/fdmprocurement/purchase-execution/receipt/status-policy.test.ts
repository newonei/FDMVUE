import { describe, expect, it } from 'vitest';

import { validatePurchaseReceiptReverseReason } from './status-policy';

describe('fDM purchase-receipt posting policy', () => {
  it('trims a valid auditable reverse reason', () => {
    expect(
      validatePurchaseReceiptReverseReason('  质检退回，撤销本次入库  '),
    ).toEqual({
      reason: '质检退回，撤销本次入库',
      valid: true,
    });
    expect(validatePurchaseReceiptReverseReason('a'.repeat(500))).toMatchObject(
      {
        valid: true,
      },
    );
    expect(
      validatePurchaseReceiptReverseReason('\u2003质检退回重审\u2003'),
    ).toEqual({
      reason: '质检退回重审',
      valid: true,
    });
  });

  it('rejects blank, overlong, and control-bearing reverse reasons', () => {
    expect(validatePurchaseReceiptReverseReason('   ')).toMatchObject({
      valid: false,
    });
    expect(validatePurchaseReceiptReverseReason('a'.repeat(501))).toMatchObject(
      {
        valid: false,
      },
    );
    expect(validatePurchaseReceiptReverseReason('第一行\n第二行')).toEqual({
      error: '反过账原因不能包含控制字符',
      valid: false,
    });
    expect(
      validatePurchaseReceiptReverseReason(`原因${String.fromCodePoint(127)}`),
    ).toMatchObject({ valid: false });
  });
});
