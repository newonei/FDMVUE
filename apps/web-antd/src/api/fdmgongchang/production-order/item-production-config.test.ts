import { describe, expect, it, vi } from 'vitest';

import { saveItemProductionConfig } from './index';

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
});
