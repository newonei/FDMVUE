import { createApp, h, nextTick } from 'vue';

import { afterEach, describe, expect, it, vi } from 'vitest';

import RestockLedger from './restock-ledger.vue';

const mocks = vi.hoisted(() => ({ ledger: vi.fn() }));
vi.mock('#/api/fdmgongchang/restock', () => ({ getRestockLedger: mocks.ledger }));

const flush = async () => {
  for (let i = 0; i < 10; i++) {
    await Promise.resolve();
    await nextTick();
  }
};

describe('restock ledger', () => {
  afterEach(() => {
    document.body.innerHTML = '';
    vi.clearAllMocks();
  });

  it('shows what was used up, what is restocked and the restock order', async () => {
    mocks.ledger.mockResolvedValue([
      {
        confirmedQuantity: 300,
        consumedProductName: '空白冲裁件 粉色',
        forecastQuantity: 300,
        id: 1,
        orderedQuantity: 300,
        restockCompletedQuantity: 0,
        restockOrderId: 9,
        restockOrderNo: 'GD20261104-001',
        restockRequiredDate: '2026-11-11',
        sourceOrderNo: 'GD20261103-002',
        status: 'ORDERED',
        targetProductId: 'p-blank',
        targetProductName: '空白冲裁件 粉色',
      },
      {
        confirmedQuantity: 0,
        consumedProductName: '已雕刻 凯蒂猫',
        forecastQuantity: 50,
        id: 2,
        orderedQuantity: 0,
        sourceOrderNo: 'GD20261103-003',
        status: 'PENDING_MAP',
      },
    ]);
    const opened = vi.fn();
    const host = document.createElement('div');
    document.body.append(host);
    const app = createApp({ render: () => h(RestockLedger, { factoryId: 1, onOpenOrder: opened }) });
    app.mount(host);
    await flush();
    const text = document.body.textContent?.replaceAll(/\s+/g, '') ?? '';
    expect(mocks.ledger).toHaveBeenCalledWith(undefined);
    expect(text).toContain('已下补库单');
    expect(text).toContain('300/300/300');
    expect(text).toContain('待配置');
    [...document.querySelectorAll('button')].find((b) => b.textContent?.includes('GD20261104-001'))!.click();
    expect(opened).toHaveBeenCalledWith(9);
    app.unmount();
  });
});
