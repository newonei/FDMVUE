import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  deletePurchaseReturn,
  postPurchaseReturn,
  reversePurchaseReturn,
} from './index';

const requestMocks = vi.hoisted(() => ({
  delete: vi.fn(),
  put: vi.fn(),
}));

vi.mock('#/api/request', () => ({ requestClient: requestMocks }));

describe('fDM procurement purchase return API', () => {
  beforeEach(() => vi.clearAllMocks());

  it('posts with both CAS versions through the dedicated POST transition', async () => {
    const request = {
      expectedPostingVersion: 1,
      expectedVersion: 4,
      id: '91',
    };
    requestMocks.put.mockResolvedValueOnce(undefined);

    await postPurchaseReturn(request);

    expect(requestMocks.put).toHaveBeenCalledWith(
      '/fdmprocurement/purchase-execution/return/post',
      request,
    );
  });

  it('reverses with an auditable reason and both CAS versions', async () => {
    const request = {
      expectedPostingVersion: 2,
      expectedVersion: 5,
      id: '91',
      reason: '供应商撤回退货，恢复库存',
    };
    requestMocks.put.mockResolvedValueOnce(undefined);

    await reversePurchaseReturn(request);

    expect(requestMocks.put).toHaveBeenCalledWith(
      '/fdmprocurement/purchase-execution/return/reverse',
      request,
    );
  });

  it('deletes exactly one draft by id', async () => {
    requestMocks.delete.mockResolvedValueOnce(true);

    await deletePurchaseReturn('91');

    expect(requestMocks.delete).toHaveBeenCalledWith(
      '/fdmprocurement/purchase-execution/return/delete',
      { params: { id: '91' } },
    );
  });
});
