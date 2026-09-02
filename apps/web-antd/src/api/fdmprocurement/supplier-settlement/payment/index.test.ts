import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  createSupplierPayment,
  getSupplierPayment,
  getSupplierPaymentAccountList,
  postSupplierPayment,
  previewSupplierPayment,
  reverseSupplierPayment,
  updateSupplierPayment,
} from './index';

const requestMocks = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn(),
  put: vi.fn(),
}));

vi.mock('#/api/request', () => ({ requestClient: requestMocks }));

const previewRequest = {
  currencyCode: 'USD',
  obligationLineId: '90071992547409931',
  paymentTime: '2026-08-29T14:30:00',
  settlementDirection: 'PAYMENT' as const,
  supplierId: '90071992547409921',
  transactionAmount: '1250.50000000',
};

const saveRequest = {
  accountId: '18',
  currencyCode: 'USD',
  financeUserId: '164',
  obligationLineId: '90071992547409931',
  paymentTime: '2026-08-29T14:30:00',
  previewHash: 'a'.repeat(64),
  remark: '根据采购入库义务结算',
  settlementDirection: 'PAYMENT' as const,
  supplierId: '90071992547409921',
  transactionAmount: '1250.50000000',
};

function rawPreview() {
  return {
    allocationKind: 'PURCHASE_RECEIPT',
    balanceVersion: 3,
    companyId: 12,
    currencyCode: 'USD',
    obligationId: 21,
    obligationLineId: '90071992547409931',
    obligationNetCny: '9000.00',
    obligationType: 'PAYABLE',
    openBalanceCny: '9000.00',
    previewHash: 'a'.repeat(64),
    purchaseOrderId: 31,
    rate: {
      effectiveDate: '2026-08-29',
      exchangeRateToCny: '7.20',
      fallbackUsed: false,
      provider: 'TEST',
      requestedDate: '2026-08-29',
      retrievedAt: '2026-08-29T14:30:00',
    },
    settledCny: '0.00',
    sourceDocumentId: 41,
    sourceDocumentType: 'PURCHASE_RECEIPT',
    supplierId: '90071992547409921',
    transactionAmount: '1250.50000000',
    transactionAmountCny: '9003.60',
  };
}

function rawPayment() {
  return {
    accountId: 18,
    allocation: {
      allocationKind: 'PURCHASE_RECEIPT',
      allocationRef: 'ALLOC-1',
      amountCny: '9003.60',
      balanceVersionAfter: 4,
      expectedBalanceVersion: 3,
      id: 61,
      obligationId: 21,
      obligationLineId: '90071992547409931',
      purchaseOrderId: 31,
      purchaseOrderLineId: 32,
      settlementAmountCny: '9003.60',
      status: 'ACTIVE',
      transactionAmount: '1250.50000000',
      version: 0,
    },
    allocationHash: 'b'.repeat(64),
    allocationRevision: 1,
    companyId: 12,
    currencyCode: 'USD',
    financeUserId: 164,
    id: '90071992547409941',
    lastActorUserId: 179,
    lastReverseReason: undefined,
    no: 'PAY-20260829-1',
    paymentTime: '2026-08-29T14:30:00',
    postingVersion: 0,
    rate: rawPreview().rate,
    remark: '根据采购入库义务结算',
    settlementDirection: 'PAYMENT' as const,
    status: 'DRAFT' as const,
    statusChangedAt: '2026-08-29T14:30:00',
    supplierId: '90071992547409921',
    transactionAmount: '1250.50000000',
    transactionAmountCny: '9003.60',
    version: 0,
  };
}

describe('fDM procurement supplier payment API', () => {
  beforeEach(() => vi.clearAllMocks());

  it('uses paymentTime and normalizes every Long identity in preview', async () => {
    requestMocks.post.mockResolvedValueOnce(rawPreview());

    const result = await previewSupplierPayment(previewRequest);

    expect(requestMocks.post).toHaveBeenCalledWith(
      '/fdmprocurement/supplier-settlement/payment/preview',
      previewRequest,
    );
    expect(result).toMatchObject({
      companyId: '12',
      obligationId: '21',
      obligationLineId: '90071992547409931',
      purchaseOrderId: '31',
      sourceDocumentId: '41',
      supplierId: '90071992547409921',
    });
  });

  it('uses FDM-owned create and update endpoints with provider-neutral fields', async () => {
    requestMocks.post.mockResolvedValueOnce(rawPayment());
    requestMocks.put.mockResolvedValueOnce(rawPayment());

    const created = await createSupplierPayment(saveRequest);
    await updateSupplierPayment({
      ...saveRequest,
      expectedVersion: 3,
      id: '90071992547409941',
    });

    expect(requestMocks.post).toHaveBeenCalledWith(
      '/fdmprocurement/supplier-settlement/payment/create',
      saveRequest,
    );
    expect(requestMocks.put).toHaveBeenCalledWith(
      '/fdmprocurement/supplier-settlement/payment/update',
      expect.objectContaining({
        currencyCode: 'USD',
        expectedVersion: 3,
        id: '90071992547409941',
        settlementDirection: 'PAYMENT',
      }),
    );
    expect(created).toMatchObject({
      accountId: '18',
      companyId: '12',
      id: '90071992547409941',
      lastActorUserId: '179',
    });
    expect(created.allocation).toMatchObject({
      id: '61',
      purchaseOrderLineId: '32',
    });
  });

  it('loads the authoritative FDM detail without coercing its Long id to number', async () => {
    requestMocks.get.mockResolvedValueOnce(rawPayment());

    const result = await getSupplierPayment('90071992547409941');

    expect(requestMocks.get).toHaveBeenCalledWith(
      '/fdmprocurement/supplier-settlement/payment/get',
      { params: { id: '90071992547409941' } },
    );
    expect(result.id).toBe('90071992547409941');
  });

  it('loads payment accounts only from the FDM-owned account directory', async () => {
    requestMocks.get.mockResolvedValueOnce([
      {
        accountCode: 'BANK-USD',
        accountName: '美元采购账户',
        currencyCode: 'USD',
        defaultStatus: true,
        id: '9007199254740992',
        sort: 1,
        status: 'ENABLED',
        version: 0,
      },
    ]);

    const result = await getSupplierPaymentAccountList(true);

    expect(requestMocks.get).toHaveBeenCalledWith(
      '/fdmprocurement/supplier-settlement/payment-account/list',
      { params: { enabledOnly: true } },
    );
    expect(result[0]?.id).toBe('9007199254740992');
  });

  it('posts and reverses with both optimistic versions and an auditable reason', async () => {
    requestMocks.put.mockResolvedValue(rawPayment());

    await postSupplierPayment({
      expectedPostingVersion: 0,
      expectedVersion: 4,
      id: '90071992547409941',
    });
    await reverseSupplierPayment({
      expectedPostingVersion: 1,
      expectedVersion: 5,
      id: '90071992547409941',
      reason: '银行退票，恢复待结算余额',
    });

    expect(requestMocks.put).toHaveBeenNthCalledWith(
      1,
      '/fdmprocurement/supplier-settlement/payment/post',
      {
        expectedPostingVersion: 0,
        expectedVersion: 4,
        id: '90071992547409941',
      },
    );
    expect(requestMocks.put).toHaveBeenNthCalledWith(
      2,
      '/fdmprocurement/supplier-settlement/payment/reverse',
      {
        expectedPostingVersion: 1,
        expectedVersion: 5,
        id: '90071992547409941',
        reason: '银行退票，恢复待结算余额',
      },
    );
  });
});
