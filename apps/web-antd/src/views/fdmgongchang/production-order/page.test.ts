import type { FdmgongchangProductionOrderApi as Api } from '#/api/fdmgongchang/production-order';

import { createApp, defineComponent, h, nextTick } from 'vue';

import { afterEach, describe, expect, it, vi } from 'vitest';

import ProductionOrderPage from './index.vue';

const mocks = vi.hoisted(() => ({
  accept: vi.fn(),
  complete: vi.fn(),
  delivery: vi.fn(),
  stockPage: vi.fn(),
  voidDelivery: vi.fn(),
  create: vi.fn(),
  factories: vi.fn(),
  factoryPage: vi.fn(),
  get: vi.fn(),
  lastRoute: vi.fn().mockResolvedValue(null),
  myFactories: vi.fn().mockResolvedValue({
    canSeeAll: false,
    defaultFactoryId: 1,
    factories: [{ code: 'HBFDM', deptId: 118, id: 1, name: '黄石工厂' }],
  }),
  myPage: vi.fn(),
  perms: ['fdmgongchang:production-order:create', 'fdmgongchang:production-order:handle'],
  search: vi.fn(),
  setFactory: vi.fn(),
}));
vi.mock('#/api/fdmgongchang/production-order', () => ({
  acceptProductionOrder: mocks.accept,
  cancelProductionOrder: vi.fn(),
  completeProductionOrder: mocks.complete,
  createDelivery: mocks.delivery,
  getDeliveryWarehouses: vi.fn().mockResolvedValue([
    { id: 'w2', isDefault: false, name: '洛阳仓' },
    { id: 'w1', isDefault: true, name: '武汉仓' },
  ]),
  voidDelivery: mocks.voidDelivery,
  createProductionOrder: mocks.create,
  getFactoryProductionOrders: mocks.factoryPage,
  getMyProductionOrders: mocks.myPage,
  getOrderableFactories: mocks.factories,
  getProductionOrder: mocks.get,
  getLastRoute: mocks.lastRoute,
  searchAuxProducts: vi.fn().mockResolvedValue([]),
  getRouteOptions: vi.fn().mockResolvedValue({
    processes: [
      ['SLICE', '开片', 'SHEET', '片材', ['BOARD']],
      ['PUNCH', '冲裁', 'PUNCHED', '已冲裁成品', ['SHEET']],
      ['ENGRAVE', '雕刻', 'ENGRAVED', '已雕刻成品', ['PUNCHED']],
      ['PACK', '包装', 'PACKED', '已包装成品', ['ENGRAVED', 'PUNCHED']],
    ].map(([code, label, outputStage, outputStageLabel, sources]) => ({
      code,
      label,
      outputStage,
      outputStageLabel,
      sources,
      unit: '件',
    })),
    routes: [{ id: 3, name: '单层散装', status: 0, steps: ['SLICE', 'PUNCH'] }],
  }),
  rejectProductionOrder: vi.fn(),
  searchOrderProducts: mocks.search,
}));
vi.mock('#/api/fdmgongchang/stage-stock', () => ({ getStockPage: mocks.stockPage }));
vi.mock('#/api/fdmgongchang/factory', () => ({
  getMyFactories: mocks.myFactories,
  setCurrentFactoryId: mocks.setFactory,
}));
vi.mock('@vben/access', () => ({
  useAccess: () => ({ hasAccessByCodes: (codes: string[]) => codes.some((c) => mocks.perms.includes(c)) }),
}));
vi.mock('@vben/common-ui', () => ({
  Page: defineComponent({ setup: (_, ctx) => () => h('main', ctx.slots.default?.()) }),
}));

const product: Api.Product = {
  code: 'DZ2401968',
  displayName: '单色TPE瑜伽垫-Mishty · 电商米白',
  id: 'p1',
  material: 'TPE',
  name: '单色TPE瑜伽垫-Mishty',
  size: '183*61*0.6cm',
  unit: '条',
};
const order: Api.Order = {
  completedQuantity: 0,
  createTime: 1_760_000_000_000,
  factoryId: 1,
  factoryName: '黄石工厂',
  id: 9,
  items: [
    {
      completedQuantity: 0,
      id: 91,
      processes: ['SLICE', 'PUNCH'],
      productId: 'p1',
      productName: product.displayName!,
      quantity: 500,
      routeId: 3,
      routeName: '单层散装',
      size: product.size,
      steps: [
        { defectQuantity: 0, goodQuantity: 0, inProgressCount: 0, label: '开片', orderCount: 0, outputStage: 'SHEET', planned: true, process: 'SLICE', unit: '片' },
        { defectQuantity: 0, goodQuantity: 0, inProgressCount: 0, label: '冲裁', orderCount: 0, outputStage: 'PUNCHED', planned: true, process: 'PUNCH', unit: '件' },
      ],
      unit: '条',
    },
  ],
  orderNo: 'GD20261010-001',
  purpose: '电商备货',
  requesterDeptName: '运营一组',
  requesterName: '运营小王',
  requesterUserId: 30,
  requiredDate: '2026-10-20',
  status: 'SUBMITTED',
  statusLabel: '待接单',
  totalQuantity: 500,
};

const flush = async () => {
  for (let i = 0; i < 10; i++) {
    await Promise.resolve();
    await nextTick();
  }
};

function button(text: string) {
  const el = [...document.querySelectorAll('button')].find((b) => b.textContent?.replaceAll(/\s/g, '') === text);
  if (!el) throw new Error(`找不到按钮：${text}`);
  return el;
}

function mount() {
  const host = document.createElement('div');
  document.body.append(host);
  const app = createApp(ProductionOrderPage);
  app.mount(host);
  return () => app.unmount();
}

describe('production order page', () => {
  let unmount: (() => void) | undefined;
  afterEach(() => {
    unmount?.();
    document.body.innerHTML = '';
    vi.clearAllMocks();
  });

  it('searches the product catalog and submits an order to the factory', async () => {
    mocks.factories.mockResolvedValue([{ code: 'HBFDM', deptId: 118, id: 1, name: '黄石工厂' }]);
    mocks.myPage.mockResolvedValue({ list: [], total: 0 });
    mocks.factoryPage.mockResolvedValue({ list: [order], total: 1 });
    mocks.search.mockResolvedValue([product]);
    mocks.create.mockResolvedValue(9);
    mocks.get.mockResolvedValue(order);
    unmount = mount();
    await flush();
    expect(document.body.textContent).toContain('还没有下过单');
    expect(document.body.textContent).toContain('1 待接单');

    button('＋向工厂下单').click();
    await flush();
    const input = document.querySelector<HTMLInputElement>('#po-product-keyword')!;
    input.value = 'Mishty';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    await new Promise((r) => setTimeout(r, 350));
    await flush();
    expect(mocks.search).toHaveBeenCalledWith('Mishty');
    [...document.querySelectorAll('button')].find((b) => b.textContent?.includes('＋ 加入'))!.click();
    await flush();
    expect(document.body.textContent).toContain('明细（1）');

    // 产品没下过单、工厂只有一条路线时默认用它；工序按生产链排，跳过后接不上时提示
    expect(mocks.lastRoute).toHaveBeenCalledWith(1, 'p1');
    const chips = () => [...document.querySelectorAll<HTMLButtonElement>('.route-chip')];
    expect(chips().filter((c) => c.getAttribute('aria-pressed') === 'true').map((c) => c.textContent?.trim())).toEqual(['开片', '冲裁']);
    chips().find((c) => c.textContent?.trim() === '冲裁')!.click();
    await flush();
    chips().find((c) => c.textContent?.trim() === '雕刻')!.click();
    await flush();
    expect(document.body.textContent).toContain('「雕刻」不能直接领「片材」');

    // 没填交期和数量时不提交
    button('提交给工厂').click();
    await flush();
    expect(document.body.textContent).toContain('请选择希望交货的日期');
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it('lets the factory accept an order it received', async () => {
    mocks.perms.splice(0, mocks.perms.length, 'fdmgongchang:production-order:handle');
    mocks.factoryPage.mockResolvedValue({ list: [order], total: 1 });
    mocks.get.mockResolvedValue(order);
    mocks.accept.mockResolvedValue(true);
    unmount = mount();
    await flush();
    expect(mocks.setFactory).toHaveBeenCalledWith(1);
    expect(document.body.textContent).toContain('运营小王');
    expect(document.body.textContent).not.toContain('向工厂下单');

    button('去接单').click();
    await flush();
    expect(document.body.textContent).toContain('接单处理');
    expect(document.body.textContent).toContain('工艺 · 单层散装');
    button('接单').click();
    await flush();
    expect(mocks.accept).toHaveBeenCalledWith({ id: 9, promisedDate: '2026-10-20', reply: undefined });
  });

  it('copies a rejected order into a new one so the requester only fixes what was wrong', async () => {
    mocks.perms.splice(0, mocks.perms.length, 'fdmgongchang:production-order:create');
    mocks.factories.mockResolvedValue([{ code: 'HBFDM', deptId: 118, id: 1, name: '黄石工厂' }]);
    mocks.myPage.mockResolvedValue({
      list: [{ ...order, reply: '这个颜色缺料', status: 'REJECTED', statusLabel: '已退回' }],
      total: 1,
    });
    unmount = mount();
    await flush();
    button('改了重下').click();
    await flush();
    const text = document.body.textContent ?? '';
    expect(text).toContain('复制下单（来自 GD20261010-001）');
    expect(text).toContain('明细（1）');
    expect(document.querySelector<HTMLInputElement>('#po-qty-p1')?.value).toBe('500');
    expect(document.querySelector<HTMLInputElement>('#po-purpose')?.value).toBe('电商备货');
    // 原单的工艺一起带过来
    expect(
      [...document.querySelectorAll('.route-chip[aria-pressed="true"]')].map((c) => c.textContent?.trim()),
    ).toEqual(['开片', '冲裁']);
  });

  it('delivers finished goods to the procurement warehouse and ends the order', async () => {
    mocks.perms.splice(0, mocks.perms.length, 'fdmgongchang:production-order:handle');
    const accepted: Api.Order = {
      ...order,
      deliveries: [
        {
          deliveredDate: '2026-10-13',
          deliveryNo: 'JH20261013001',
          id: 1,
          lines: [{ batchNo: 'B1', itemCode: 'CC-1', quantity: 100, stage: 'PUNCHED', stockId: 7 }],
          productName: product.displayName,
          productionOrderItemId: 91,
          quantity: 100,
          status: 'DELIVERED',
          stockInCode: 'RK20261013001',
          unit: '条',
          warehouseName: '武汉仓',
        },
      ],
      items: [{ ...order.items[0]!, completedQuantity: 100, deliveryStage: 'PUNCHED', deliveryStageLabel: '已冲裁成品', deliveryUnit: '件' }],
      status: 'ACCEPTED',
      statusLabel: '生产中',
    };
    mocks.factoryPage.mockResolvedValue({ list: [accepted], total: 1 });
    mocks.get.mockResolvedValue(accepted);
    mocks.stockPage.mockResolvedValue({
      list: [{ batchNo: 'B2', id: 8, itemCode: 'CC-2', itemId: 2, location: '成品区', quantity: 500, stage: 'PUNCHED' }],
      total: 1,
    });
    mocks.delivery.mockResolvedValue(2);
    mocks.complete.mockResolvedValue(true);
    unmount = mount();
    await flush();
    button('查看').click();
    await flush();
    const text = document.body.textContent ?? '';
    expect(text).toContain('JH20261013001');
    expect(text).toContain('入库单 RK20261013001');
    expect(text.replaceAll(/\s/g, '')).toContain('已交货100');

    button('交货').click();
    await flush();
    expect(mocks.stockPage).toHaveBeenCalledWith(expect.objectContaining({ stage: 'PUNCHED' }));
    expect(document.body.textContent).toContain('交货按 1 件 = 1 条 计');
    const input = document.querySelector<HTMLInputElement>('#delivery-qty-8')!;
    input.value = '450';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    await flush();
    button('确认交货').click();
    await flush();
    // 还差 400，不能多交
    expect(document.body.textContent).toContain('最多交这么多');
    expect(mocks.delivery).not.toHaveBeenCalled();
    input.value = '400';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    await flush();
    button('确认交货').click();
    await flush();
    expect(mocks.delivery).toHaveBeenCalledWith(
      expect.objectContaining({ lines: [{ quantity: 400, stockId: 8 }], productionOrderItemId: 91, warehouseId: 'w1' }),
    );
  });
});

