import { describe, expect, it } from 'vitest';

import {
  canEditSupplierPayment,
  canPostSupplierPayment,
  canReverseSupplierPayment,
  isSupplierPayment,
  validateSupplierPaymentReverseReason,
} from './policy';

describe('fDM procurement supplier payment UI policy', () => {
  it('rejects an absent payment head', () => {
    expect(isSupplierPayment(undefined)).toBe(false);
    expect(canEditSupplierPayment(undefined)).toBe(false);
    expect(canPostSupplierPayment(undefined)).toBe(false);
    expect(canReverseSupplierPayment(undefined)).toBe(false);
  });

  it('allows draft/reversed heads to edit and post only on an even posting version', () => {
    expect(
      canEditSupplierPayment({
        postingVersion: 0,
        status: 'DRAFT',
        version: 0,
      }),
    ).toBe(true);
    expect(
      canPostSupplierPayment({
        postingVersion: 2,
        status: 'DRAFT',
        version: 7,
      }),
    ).toBe(true);
    expect(
      canPostSupplierPayment({
        postingVersion: 1,
        status: 'DRAFT',
        version: 7,
      }),
    ).toBe(false);
  });

  it('allows reverse only for an approved odd posting version', () => {
    expect(
      canReverseSupplierPayment({
        postingVersion: 1,
        status: 'POSTED',
        version: 1,
      }),
    ).toBe(true);
    expect(
      canReverseSupplierPayment({
        postingVersion: 2,
        status: 'POSTED',
        version: 2,
      }),
    ).toBe(false);
  });

  it('requires a canonical auditable reverse reason', () => {
    expect(validateSupplierPaymentReverseReason('  银行退票  ')).toEqual({
      reason: '银行退票',
      valid: true,
    });
    expect(validateSupplierPaymentReverseReason('   ')).toMatchObject({
      valid: false,
    });
    expect(validateSupplierPaymentReverseReason('a'.repeat(501))).toMatchObject(
      {
        valid: false,
      },
    );
    expect(
      validateSupplierPaymentReverseReason('第一行\n第二行'),
    ).toMatchObject({
      valid: false,
    });
  });
});
