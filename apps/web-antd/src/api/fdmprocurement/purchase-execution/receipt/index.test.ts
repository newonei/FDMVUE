import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  deletePurchaseReceipt,
  postPurchaseReceipt,
  reversePurchaseReceipt,
} from './index';

const requestMocks = vi.hoisted(() => ({
  delete: vi.fn(),
  put: vi.fn(),
}));

vi.mock('#/api/request', () => ({ requestClient: requestMocks }));

describe('fDM procurement purchase receipt API', () => {
  beforeEach(() => vi.clearAllMocks());

  it('posts with both CAS versions through the dedicated POST transition', async () => {
    const request = {
      expectedPostingVersion: 2,
      expectedVersion: 5,
      id: '81',
    };
    requestMocks.put.mockResolvedValueOnce(undefined);

    await postPurchaseReceipt(request);

    expect(requestMocks.put).toHaveBeenCalledWith(
      '/fdmprocurement/purchase-execution/receipt/post',
      request,
    );
  });

  it('reverses with an auditable reason and both CAS versions', async () => {
    const request = {
      expectedPostingVersion: 3,
      expectedVersion: 6,
      id: '81',
      reason: '质检退回，撤销本次入库',
    };
    requestMocks.put.mockResolvedValueOnce(undefined);

    await reversePurchaseReceipt(request);

    expect(requestMocks.put).toHaveBeenCalledWith(
      '/fdmprocurement/purchase-execution/receipt/reverse',
      request,
    );
  });

  it('deletes exactly one draft by id', async () => {
    requestMocks.delete.mockResolvedValueOnce(true);

    await deletePurchaseReceipt('81');

    expect(requestMocks.delete).toHaveBeenCalledWith(
      '/fdmprocurement/purchase-execution/receipt/delete',
      { params: { id: '81' } },
    );
  });
});
