import { describe, expect, it } from 'vitest';

import {
  calculateCnyAmount,
  createLatestRequestGuard,
  sumCnyAmounts,
} from './calculation';
import {
  buildConsumptionSavePayload,
  buildConsumptionUpdatePayload,
  buildReceiptSavePayload,
  buildReceiptUpdatePayload,
  createEmptyConsumptionForm,
  createEmptyReceiptForm,
  hydrateReceiptForm,
  normalizeRecordDate,
  normalizeRecordType,
  queryOrderId,
  validateConsumptionForm,
  validateReceiptForm,
} from './form-model';

describe('receipt and consumption form model', () => {
  it('calculates currency conversion with BigNumber decimal strings', () => {
    expect(calculateCnyAmount('123456789012345.67', '7.123456789012')).toBe(
      '879439101839615.85',
    );
    expect(calculateCnyAmount('999.99', '1')).toBe('999.99');
    expect(sumCnyAmounts(['0.1', '0.2', '100000000000000.01'])).toBe(
      '100000000000000.31',
    );
  });

  it('normalizes Java LocalDate arrays, record type and large query IDs', () => {
    expect(normalizeRecordDate([2026, 8, 28])).toBe('2026-08-28');
    expect(normalizeRecordDate('2026-08-28')).toBe('2026-08-28');
    expect(normalizeRecordDate('2026-02-30')).toBeUndefined();
    expect(normalizeRecordType('consumption')).toBe('consumption');
    expect(normalizeRecordType('unknown')).toBe('receipt');
    expect(queryOrderId(['9223372036854775806'])).toBe('9223372036854775806');
  });

  it('allows hydrated receipt business fields to remain editable', () => {
    const model = hydrateReceiptForm({
      allocatedContractAmount: '100.00',
      arrivalAmount: '100.00',
      companyId: '1',
      companyName: 'FDM',
      contractCurrency: 'USD',
      contractCurrencyToCnyRate: '7.1',
      createTime: '2026-08-28 10:00:00',
      currency: 'USD',
      currencyToCnyRate: '7.1',
      customerId: '2',
      customerName: 'Customer',
      fallback: false,
      id: '9223372036854775806',
      invoiceStatus: 'NOT_INVOICED',
      orderId: '9223372036854775805',
      orderNo: 'DD20260828000001',
      orderSubject: 'Order',
      rateDate: '2026-08-28',
      rateFallbackUsed: false,
      rateRetrievedAt: '2026-08-28 09:00:00',
      rateSource: 'ECB',
      receiptAmountCny: '710.00',
      receiptDate: '2026-08-28',
      receiptMethod: '银行',
      receiptNo: 'WM-RCPT-1',
      requestedDate: '2026-08-28',
      source: 'ECB',
      status: 'ACTIVE',
      updateTime: '2026-08-28 10:00:00',
      version: 0,
    } as never);
    model.arrivalAmount = '120.50';
    model.receiptMethod = 'PayPal';

    expect(buildReceiptSavePayload(model)).toMatchObject({
      arrivalAmount: '120.5',
      confirmPotentialDuplicate: false,
      orderId: '9223372036854775805',
      receiptMethod: 'PayPal',
    });
    expect(buildReceiptSavePayload(model)).not.toHaveProperty('willSettle');
    expect(buildReceiptSavePayload(model)).not.toHaveProperty('auditProcess');
    expect(buildReceiptSavePayload(model, true)).toHaveProperty(
      'confirmPotentialDuplicate',
      true,
    );
  });

  it('validates receipt and consumption without a manual settle field', () => {
    const receipt = createEmptyReceiptForm();
    Object.assign(receipt, {
      arrivalAmount: '10',
      currency: 'EUR',
      orderId: '1',
      receiptDate: '2026-08-28',
      receiptMethod: '银行',
    });
    expect(validateReceiptForm(receipt)).toEqual([]);

    const consumption = createEmptyConsumptionForm();
    Object.assign(consumption, {
      amount: '5',
      consumptionDate: '2026-08-28',
      currency: 'EUR',
      orderId: '1',
      reason: '余额消费',
    });
    expect(validateConsumptionForm(consumption)).toEqual([]);
    expect(buildConsumptionSavePayload(consumption)).not.toHaveProperty(
      'willSettle',
    );
  });

  it('submits attachment IDs only when creating receipt and consumption records', () => {
    const receipt = createEmptyReceiptForm();
    receipt.attachments = [
      {
        businessType: 'RECEIPT_RECORD',
        fileName: 'receipt.pdf',
        id: '9223372036854775804',
        status: 'PENDING',
      },
    ];
    expect(buildReceiptSavePayload(receipt).attachmentIds).toEqual([
      '9223372036854775804',
    ]);
    Object.assign(receipt, { id: '9223372036854775806', version: 1 });
    expect(buildReceiptUpdatePayload(receipt)).not.toHaveProperty(
      'attachmentIds',
    );

    const consumption = createEmptyConsumptionForm();
    consumption.attachments = [
      {
        businessType: 'CONSUMPTION_RECORD',
        fileName: 'consumption.pdf',
        id: '9223372036854775803',
        status: 'PENDING',
      },
    ];
    expect(buildConsumptionSavePayload(consumption).attachmentIds).toEqual([
      '9223372036854775803',
    ]);
    Object.assign(consumption, { id: '9223372036854775805', version: 1 });
    expect(buildConsumptionUpdatePayload(consumption)).not.toHaveProperty(
      'attachmentIds',
    );
  });

  it('keeps only the latest asynchronous preview response eligible', () => {
    const guard = createLatestRequestGuard();
    const first = guard.begin();
    const second = guard.begin();
    expect(guard.isLatest(first)).toBe(false);
    expect(guard.isLatest(second)).toBe(true);
    guard.invalidate();
    expect(guard.isLatest(second)).toBe(false);
  });
});
