import { describe, expect, it, vi } from 'vitest';

import {
  saveItemProductionConfig,
  saveItemProductionConfigBatch,
} from './index';

const requests = vi.hoisted(() => ({ post: vi.fn() }));
vi.mock('#/api/request', () => ({ requestClient: requests }));
vi.mock('../factory', () => ({
  factoryHeaders: () => ({ 'factory-id': '2' }),
}));

describe('item production configuration API', () => {
  it('saves the entire target and actual processes in one factory-scoped request', async () => {
    const payload = {
      itemId: 10,
      routeId: null,
      target: { material: 'TPE', textureFront: null },
      processes: ['CUT', 'PUNCH', 'FOLD', 'PACK'],
    };
    await saveItemProductionConfig(payload);
    expect(requests.post).toHaveBeenCalledWith(
      '/fdmgongchang/production-order/item-production-config',
      payload,
      { headers: { 'factory-id': '2' } },
    );
  });
  it('saves all selected products in one factory-scoped batch request', async () => {
    const payload = {
      items: [
        {
          itemId: 10,
          target: { frontColor: 'PK' },
          routeId: 2,
          processes: ['PUNCH'],
        },
        {
          itemId: 11,
          target: { frontColor: 'PK' },
          routeId: 3,
          processes: ['SLICE', 'PUNCH'],
        },
      ],
    };
    await saveItemProductionConfigBatch(payload);
    expect(requests.post).toHaveBeenCalledWith(
      '/fdmgongchang/production-order/item-production-config/batch',
      payload,
      { headers: { 'factory-id': '2' } },
    );
  });
});
