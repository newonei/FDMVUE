import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  BANK_RECEIPT_DUPLICATE_CONFIRM_REQUIRED,
  createBankReceipt,
  getBankReceipt,
  getBankReceiptPage,
  isBankReceiptDuplicateConfirmationError,
  updateBankReceipt,
  voidBankReceipt,
} from './index';

const requestMocks = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn(),
  put: vi.fn(),
}));

vi.mock('#/api/request', () => ({ requestClient: requestMocks }));

describe('fdmwaimao bank receipt API contract', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requestMocks.get.mockResolvedValue({ list: [], total: 0 });
    requestMocks.post.mockResolvedValue({
      created: true,
      id: '9223372036854775806',
      potentialDuplicateIds: [],
    });
    requestMocks.put.mockResolvedValue(true);
  });

  it('keeps Long identities and decimal amounts as strings', async () => {
    await getBankReceiptPage({
      companyId: '9223372036854775801',
      pageNo: 1,
      pageSize: 20,
      receiptDate: ['2026-08-01', '2026-08-31'],
    });
    await getBankReceipt('9223372036854775806');

    expect(requestMocks.get).toHaveBeenNthCalledWith(
      1,
      '/fdmwaimao/bank-receipt/page',
      {
        params: {
          companyId: '9223372036854775801',
          pageNo: 1,
          pageSize: 20,
          receiptDate: ['2026-08-01', '2026-08-31'],
        },
      },
    );
    expect(requestMocks.get).toHaveBeenNthCalledWith(
      2,
      '/fdmwaimao/bank-receipt/get',
      { params: { id: '9223372036854775806' } },
    );
  });

  it('never asks the browser for hash, FX, CNY, allocation or owner facts', async () => {
    const create = {
      arrivalAmount: '1000.250000',
      companyId: '9223372036854775801',
      confirmPotentialDuplicate: false,
      currency: 'USD',
      customerId: '9223372036854775802',
      externalReceiptKey: 'BANK-TXN-20260831-001',
      payerAccountMasked: '****1234',
      payerNameMasked: 'O*** Ltd.',
      receiptDate: '2026-08-31',
      remark: '银行流水导入',
      sourceSystem: 'BANK_STATEMENT',
    };
    await createBankReceipt(create);
    await updateBankReceipt({
      ...create,
      expectedVersion: 1,
      id: '9223372036854775806',
    });

    const sentCreate = requestMocks.post.mock.calls[0]?.[1] as Record<
      string,
      unknown
    >;
    for (const forbidden of [
      'allocatedAmount',
      'arrivalAmountCny',
      'currencyToCnyRate',
      'externalPayloadHash',
      'ownerUserId',
      'rateDate',
      'rateSource',
      'remainingAmount',
    ]) {
      expect(sentCreate).not.toHaveProperty(forbidden);
    }
    const sentUpdate = requestMocks.put.mock.calls[0]?.[1] as Record<
      string,
      unknown
    >;
    expect(sentUpdate).not.toHaveProperty('externalPayloadHash');
    expect(sentUpdate).not.toHaveProperty('externalReceiptKey');
    expect(sentUpdate).not.toHaveProperty('sourceSystem');
  });

  it('uses CAS for void and recognizes the duplicate-confirmation code', async () => {
    await voidBankReceipt({
      expectedVersion: 4,
      id: '9223372036854775806',
      reason: '银行冲正',
    });

    expect(requestMocks.put).toHaveBeenLastCalledWith(
      '/fdmwaimao/bank-receipt/void',
      {
        expectedVersion: 4,
        id: '9223372036854775806',
        reason: '银行冲正',
      },
    );
    expect(
      isBankReceiptDuplicateConfirmationError({
        response: {
          data: { code: String(BANK_RECEIPT_DUPLICATE_CONFIRM_REQUIRED) },
        },
      }),
    ).toBe(true);
  });
});
