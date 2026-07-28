import { describe, expect, it } from 'vitest';

import { isInvoiceApplyLocked } from './invoice-lock';

describe('isInvoiceApplyLocked', () => {
  it('locks records whose invoice status is issued', () => {
    expect(isInvoiceApplyLocked({ invoiceStatus: 1 })).toBe(true);
    expect(isInvoiceApplyLocked({ invoiceStatus: '1' })).toBe(true);
  });

  it('locks records that already have an invoice attachment', () => {
    expect(
      isInvoiceApplyLocked({
        invoiceFileUrl: ' https://files.example.com/invoice.pdf ',
        invoiceStatus: 0,
      }),
    ).toBe(true);
  });

  it('does not treat a blank attachment URL as issued', () => {
    expect(
      isInvoiceApplyLocked({ invoiceFileUrl: '   ', invoiceStatus: 0 }),
    ).toBe(false);
  });

  it('leaves new and unissued records editable', () => {
    expect(isInvoiceApplyLocked()).toBe(false);
    expect(isInvoiceApplyLocked({ invoiceStatus: 0 })).toBe(false);
  });
});
