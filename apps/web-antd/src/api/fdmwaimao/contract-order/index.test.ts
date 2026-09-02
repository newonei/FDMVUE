import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  cancelContractOrder,
  confirmContractOrder,
  getContractOrderContactOptions,
} from './index';

const requestMocks = vi.hoisted(() => ({
  delete: vi.fn(),
  get: vi.fn(),
  post: vi.fn(),
  put: vi.fn(),
}));

vi.mock('#/api/request', () => ({
  requestClient: requestMocks,
}));

describe('fdmwaimao contract order API contract', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requestMocks.get.mockResolvedValue([]);
  });

  it('loads contacts through the contract domain and preserves string IDs', async () => {
    await getContractOrderContactOptions({
      customerId: '9007199254740993',
    });
    await getContractOrderContactOptions({
      customerId: '9007199254740994',
      orderId: '9007199254740995',
    });

    expect(requestMocks.get).toHaveBeenNthCalledWith(
      1,
      '/fdmwaimao/contract-order/contact-options',
      { params: { customerId: '9007199254740993' } },
    );
    expect(requestMocks.get).toHaveBeenNthCalledWith(
      2,
      '/fdmwaimao/contract-order/contact-options',
      {
        params: {
          customerId: '9007199254740994',
          orderId: '9007199254740995',
        },
      },
    );
  });

  it('uses optimistic versions for confirm and cancel state transitions', async () => {
    await confirmContractOrder({
      expectedVersion: 7,
      id: '9223372036854775806',
    });
    await cancelContractOrder({
      expectedVersion: 8,
      id: '9223372036854775805',
      reason: '客户取消采购',
    });

    expect(requestMocks.put).toHaveBeenNthCalledWith(
      1,
      '/fdmwaimao/contract-order/confirm',
      { expectedVersion: 7, id: '9223372036854775806' },
    );
    expect(requestMocks.put).toHaveBeenNthCalledWith(
      2,
      '/fdmwaimao/contract-order/cancel',
      {
        expectedVersion: 8,
        id: '9223372036854775805',
        reason: '客户取消采购',
      },
    );
  });
});
