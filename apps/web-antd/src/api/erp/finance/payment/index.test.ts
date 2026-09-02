import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  createAllocatedV2Payment,
  getAllocatedV2Payment,
  postAllocatedV2Payment,
  previewFinancePaymentAllocation,
  reverseAllocatedV2Payment,
  updateAllocatedV2Payment,
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
  paymentDate: '2026-08-29',
  settlementDirection: 'PAYMENT' as const,
  supplierId: '90071992547409921',
  transactionAmount: '1250.50000000',
};

const saveRequest = {
  accountId: '18',
  currency: 'USD',
  direction: 'PAYMENT' as const,
  financeUserId: '164',
  obligationLineId: '90071992547409931',
  paymentTime: '2026-08-29T14:30:00',
  previewHash: 'a'.repeat(64),
  remark: '根据采购入库义务结算',
  supplierId: '90071992547409921',
  transactionAmount: '1250.50000000',
};

describe('erp supplier allocated payment V2 API', () => {
  beforeEach(() => vi.clearAllMocks());

  it('keeps every Long identity as a string in preview', async () => {
    requestMocks.post.mockResolvedValueOnce(undefined);

    await previewFinancePaymentAllocation(previewRequest);

    expect(requestMocks.post).toHaveBeenCalledWith(
      '/erp/finance-payment/allocation-preview',
      previewRequest,
    );
    expect(typeof previewRequest.supplierId).toBe('string');
    expect(typeof previewRequest.obligationLineId).toBe('string');
  });

  it('uses isolated V2 create and update endpoints', async () => {
    requestMocks.post.mockResolvedValueOnce(undefined);
    requestMocks.put.mockResolvedValueOnce(undefined);

    await createAllocatedV2Payment(saveRequest);
    await updateAllocatedV2Payment({
      ...saveRequest,
      expectedVersion: 3,
      id: '90071992547409941',
    });

    expect(requestMocks.post).toHaveBeenCalledWith(
      '/erp/finance-payment/allocated-v2/create',
      saveRequest,
    );
    expect(requestMocks.put).toHaveBeenCalledWith(
      '/erp/finance-payment/allocated-v2/update',
      expect.objectContaining({
        expectedVersion: 3,
        id: '90071992547409941',
      }),
    );
  });

  it('loads the authoritative V2 detail without coercing its Long id to number', async () => {
    requestMocks.get.mockResolvedValueOnce(undefined);

    await getAllocatedV2Payment('90071992547409941');

    expect(requestMocks.get).toHaveBeenCalledWith(
      '/erp/finance-payment/allocated-v2/get',
      { params: { id: '90071992547409941' } },
    );
  });

  it('posts with optimistic version and reverses with the auditable reason', async () => {
    requestMocks.put.mockResolvedValue(undefined);

    await postAllocatedV2Payment({
      expectedVersion: 4,
      id: '90071992547409941',
    });
    await reverseAllocatedV2Payment({
      expectedVersion: 5,
      id: '90071992547409941',
      reason: '银行退票，恢复待结算余额',
    });

    expect(requestMocks.put).toHaveBeenNthCalledWith(
      1,
      '/erp/finance-payment/allocated-v2/post',
      { expectedVersion: 4, id: '90071992547409941' },
    );
    expect(requestMocks.put).toHaveBeenNthCalledWith(
      2,
      '/erp/finance-payment/allocated-v2/reverse',
      {
        expectedVersion: 5,
        id: '90071992547409941',
        reason: '银行退票，恢复待结算余额',
      },
    );
  });
});
