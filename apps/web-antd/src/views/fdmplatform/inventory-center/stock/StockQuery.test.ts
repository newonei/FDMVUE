import { createApp, h, nextTick } from 'vue';
import { createMemoryHistory, createRouter } from 'vue-router';

import { afterEach, describe, expect, it, vi } from 'vitest';

import StockQuery from './StockQuery.vue';

const mocks = vi.hoisted(() => ({
  stocks: vi.fn(),
  txns: vi.fn(),
  warehouses: vi.fn(),
}));
vi.mock('#/api/fdmplatform/warehouse', () => ({
  getInventoryWarehouses: mocks.warehouses,
  getStocks: mocks.stocks,
  getStockTxns: mocks.txns,
}));

const row = (overrides: Record<string, unknown>) => ({
  id: 's1',
  warehouseId: 'w1',
  warehouseName: '武汉仓',
  skuId: 'sku-a',
  specVersion: '1',
  productName: '杯垫',
  productCode: 'CB-01',
  specification: '10cm',
  unit: '个',
  onHand: '10',
  costAmount: '50',
  costKnown: true,
  lastInDate: '2020-01-01',
  lastOutDate: '2020-01-02',
  ...overrides,
});

async function flush() {
  for (let i = 0; i < 8; i++) {
    await nextTick();
    await Promise.resolve();
  }
  // router.replace 在宏任务里完成
  await new Promise((resolve) => setTimeout(resolve, 0));
  await nextTick();
}

async function mount() {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/fdmstock/inventory-stock', component: StockQuery }],
  });
  await router.push('/fdmstock/inventory-stock');
  const host = document.createElement('div');
  document.body.append(host);
  const app = createApp({ render: () => h(StockQuery) });
  app.use(router);
  app.mount(host);
  await flush();
  return { router, host };
}

const text = (element: Element | null) =>
  (element?.textContent ?? '').replaceAll(/\s+/g, '');

function button(label: string) {
  return [...document.querySelectorAll('button')].find((entry) =>
    text(entry).includes(label),
  )!;
}

describe('库存查询', () => {
  afterEach(() => {
    vi.clearAllMocks();
    document.body.innerHTML = '';
  });

  it('总览、仓库导航和状态卡片筛选', async () => {
    mocks.warehouses.mockResolvedValue([
      { id: 'w1', name: '武汉仓', isDefault: true, writable: true },
      {
        id: 'f1',
        name: '一厂原料仓',
        isDefault: false,
        writable: true,
        factoryId: 3,
        factoryName: '一厂',
      },
    ]);
    mocks.stocks.mockResolvedValue([
      row({}),
      row({
        id: 's2',
        warehouseId: 'f1',
        warehouseName: '一厂原料仓',
        onHand: '-4',
        costAmount: '0',
      }),
      row({ id: 's3', skuId: 'sku-b', productName: '托盘', onHand: '0' }),
    ]);
    const { router, host } = await mount();

    expect(mocks.stocks).toHaveBeenCalledWith({ inStockOnly: false });
    const cards = text(host.querySelector('.cards'));
    expect(cards).toContain('在库品项2');
    expect(cards).toContain('负库存1');
    expect(cards).toContain('呆滞1');
    expect(text(host.querySelector('.nav'))).toContain('一厂');
    // 默认只看有库存：零库存的托盘不在表里
    expect(text(host.querySelector('.ant-table-tbody'))).not.toContain('托盘');

    button('负库存1').click();
    await flush();
    const body = text(host.querySelector('.ant-table-tbody'));
    expect(body).toContain('一厂原料仓');
    expect(body).not.toContain('武汉仓');
    expect(router.currentRoute.value.query.status).toBe('NEGATIVE');

    button('一厂原料仓').click();
    await flush();
    expect(router.currentRoute.value.query.warehouseId).toBe('f1');
  });

  it('按产品汇总合并各仓库同一 SKU', async () => {
    mocks.warehouses.mockResolvedValue([]);
    mocks.stocks.mockResolvedValue([
      row({}),
      row({
        id: 's2',
        warehouseId: 'w2',
        warehouseName: '上海仓',
        onHand: '5',
      }),
    ]);
    const { host } = await mount();
    expect(
      host.querySelectorAll('.ant-table-tbody tr.ant-table-row'),
    ).toHaveLength(2);

    const product = [...host.querySelectorAll('label')].find((entry) =>
      text(entry).includes('按产品汇总'),
    )!;
    product.click();
    await flush();
    const rows = host.querySelectorAll('.ant-table-tbody tr.ant-table-row');
    expect(rows).toHaveLength(1);
    expect(text(rows[0] ?? null)).toContain('15');
    expect(text(rows[0] ?? null)).toContain('上海仓');
  });
});
