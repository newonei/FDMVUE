import { createApp, h, nextTick } from 'vue';

import { afterEach, describe, expect, it, vi } from 'vitest';

import HoldPanel from './hold-panel.vue';

const mocks = vi.hoisted(() => ({ list: vi.fn(), trace: vi.fn() }));
vi.mock('#/api/fdmgongchang/quality', () => ({
  getHolds: mocks.list,
  getHoldTrace: mocks.trace,
  releaseHold: vi.fn(),
  scrapHold: vi.fn(),
}));
vi.mock('@vben/access', () => ({ useAccess: () => ({ hasAccessByCodes: () => true }) }));

const flush = async () => {
  for (let i = 0; i < 10; i++) {
    await Promise.resolve();
    await nextTick();
  }
};

const options = {
  processes: [{ code: 'ENGRAVE', label: '雕刻' }],
  stages: [{ code: 'ENGRAVED', label: '已雕刻', unit: '件' }],
} as any;

describe('quality hold panel', () => {
  afterEach(() => {
    document.body.innerHTML = '';
    vi.clearAllMocks();
  });

  it('lists held output and shows where it may have gone', async () => {
    mocks.list.mockResolvedValue([
      {
        heldBy: '李四',
        id: 5,
        itemCode: 'ENG-DM-01',
        itemId: 3,
        outputId: 8,
        process: 'ENGRAVE',
        processOrderId: 7,
        processOrderNo: 'GX20261104-003',
        quantity: 100,
        reason: '雕刻偏位',
        stage: 'ENGRAVED',
        status: 'HELD',
      },
    ]);
    mocks.trace.mockResolvedValue({
      deliveries: [{ deliveryNo: 'JH20261104-001', id: 1, productName: '粉色瑜伽垫', quantity: 50, unit: '条' }],
      orders: [{ depth: 1, id: 9, orderNo: 'GX20261104-009', processLabel: '包装', usedQuantity: 50 }],
    });
    const host = document.createElement('div');
    document.body.append(host);
    const app = createApp({ render: () => h(HoldPanel, { options, refreshKey: 0 }) });
    app.mount(host);
    await flush();
    expect(mocks.list).toHaveBeenCalledWith({ status: 'HELD' });
    let text = document.body.textContent?.replaceAll(/\s+/g, '') ?? '';
    expect(text).toContain('冻结中');
    expect(text).toContain('100件');
    expect(text).toContain('雕刻偏位');
    [...document.querySelectorAll('button')].find((b) => b.textContent?.includes('追溯'))!.click();
    await flush();
    expect(mocks.trace).toHaveBeenCalledWith(5);
    text = document.body.textContent?.replaceAll(/\s+/g, '') ?? '';
    expect(text).toContain('GX20261104-009');
    expect(text).toContain('JH20261104-001');
    app.unmount();
  });
});
