import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  createConsumptionRecord,
  createReceiptRecord,
  getConsumptionRecord,
  getConsumptionRecordPage,
  getReceiptRecord,
  getReceiptRecordPage,
  isReceiptRecordDuplicateConfirmationError,
  previewConsumptionAmount,
  previewReceiptAmount,
  updateConsumptionRecord,
  updateReceiptRecord,
  voidConsumptionRecord,
  voidReceiptRecord,
} from './index';

const requestMocks = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn(),
  put: vi.fn(),
}));

vi.mock('#/api/request', () => ({
  requestClient: requestMocks,
}));

describe('fdmwaimao receipt and consumption API contract', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requestMocks.get.mockResolvedValue({ list: [], total: 0 });
    requestMocks.post.mockResolvedValue('9223372036854775806');
    requestMocks.put.mockResolvedValue(true);
  });

  it('keeps IDs and decimal values as strings on receipt calls', async () => {
    const save = {
      arrivalAmount: '1000.25',
      confirmPotentialDuplicate: false,
      currency: 'USD',
      invoiceStatus: 'NOT_INVOICED' as const,
      orderId: '9223372036854775805',
      receiptDate: '2026-08-28',
      receiptMethod: '银行账户',
    };
    await getReceiptRecordPage({
      pageNo: 1,
      pageSize: 20,
      receiptDate: ['2026-08-01', '2026-08-31'],
    });
    await getReceiptRecord('9223372036854775806');
    await previewReceiptAmount({ ...save, id: '9223372036854775806' });
    await createReceiptRecord(save);
    await updateReceiptRecord({
      ...save,
      expectedVersion: 3,
      id: '9223372036854775806',
    });
    await voidReceiptRecord({
      expectedVersion: 4,
      id: '9223372036854775806',
      reason: '重复登记',
    });

    expect(requestMocks.get).toHaveBeenNthCalledWith(
      1,
      '/fdmwaimao/receipt-record/page',
      {
        params: {
          pageNo: 1,
          pageSize: 20,
          receiptDate: ['2026-08-01', '2026-08-31'],
        },
      },
    );
    expect(requestMocks.get).toHaveBeenNthCalledWith(
      2,
      '/fdmwaimao/receipt-record/get',
      { params: { id: '9223372036854775806' } },
    );
    expect(requestMocks.put).toHaveBeenLastCalledWith(
      '/fdmwaimao/receipt-record/void',
      {
        expectedVersion: 4,
        id: '9223372036854775806',
        reason: '重复登记',
      },
    );
    expect(
      isReceiptRecordDuplicateConfirmationError({
        response: { data: { code: '1206004010' } },
      }),
    ).toBe(true);
  });

  it('uses independent consumption endpoints and date filter', async () => {
    const save = {
      amount: '50.00',
      consumptionDate: '2026-08-28',
      consumptionType: 'CUSTOMER_BALANCE' as const,
      currency: 'USD',
      orderId: '9007199254740993',
      reason: '使用客户历史余额',
    };
    await getConsumptionRecordPage({
      consumptionDate: ['2026-08-01', '2026-08-31'],
      pageNo: 1,
      pageSize: 20,
    });
    await getConsumptionRecord('9007199254740994');
    await previewConsumptionAmount(save);
    await createConsumptionRecord(save);
    await updateConsumptionRecord({
      ...save,
      expectedVersion: 1,
      id: '9007199254740994',
    });
    await voidConsumptionRecord({
      expectedVersion: 2,
      id: '9007199254740994',
      reason: '业务撤销',
    });

    expect(requestMocks.get).toHaveBeenNthCalledWith(
      1,
      '/fdmwaimao/consumption-record/page',
      {
        params: {
          consumptionDate: ['2026-08-01', '2026-08-31'],
          pageNo: 1,
          pageSize: 20,
        },
      },
    );
    expect(requestMocks.post).toHaveBeenCalledWith(
      '/fdmwaimao/consumption-record/amount-preview',
      save,
      { silent: true },
    );
    expect(requestMocks.put).toHaveBeenLastCalledWith(
      '/fdmwaimao/consumption-record/void',
      {
        expectedVersion: 2,
        id: '9007199254740994',
        reason: '业务撤销',
      },
    );
  });
});
