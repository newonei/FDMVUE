import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  previewOrderSplit,
  releaseOrderSplit,
  releaseTaskPackages,
} from './index';

const requests = vi.hoisted(() => ({ post: vi.fn() }));
vi.mock('#/api/request', () => ({ requestClient: requests }));
vi.mock('#/api/fdmgongchang/factory', () => ({
  factoryHeaders: () => ({ 'factory-id': '2' }),
}));

describe('order split API', () => {
  beforeEach(() => vi.clearAllMocks());

  it('previews only selected orders in the current factory', async () => {
    await previewOrderSplit([11, 12]);
    expect(requests.post).toHaveBeenCalledWith(
      '/fdmgongchang/schedule/order-split/preview',
      { productionOrderIds: [11, 12] },
      { headers: { 'factory-id': '2' } },
    );
  });

  it('confirms the exact preview with a stable retry id and keeps the legacy endpoint available', async () => {
    const data = {
      productionOrderIds: [12],
      previewKey: 'hash-12',
      requestId: 'retry-12',
      note: '交期优先',
    };
    await releaseOrderSplit(data);
    expect(requests.post).toHaveBeenNthCalledWith(
      1,
      '/fdmgongchang/schedule/order-split/release',
      data,
      { headers: { 'factory-id': '2' } },
    );
    await releaseTaskPackages({ productionOrderIds: [11] });
    expect(requests.post).toHaveBeenNthCalledWith(
      2,
      '/fdmgongchang/schedule/package/release',
      { productionOrderIds: [11] },
      { headers: { 'factory-id': '2' } },
    );
  });
});
