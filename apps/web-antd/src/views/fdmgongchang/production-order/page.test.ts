import type { FdmgongchangProductionOrderApi as Api } from '#/api/fdmgongchang/production-order';

import { createApp, defineComponent, h, nextTick } from 'vue';

import { afterEach, describe, expect, it, vi } from 'vitest';

import ProductionOrderPage from './index.vue';

const mocks = vi.hoisted(() => ({
  accept: vi.fn(),
  create: vi.fn(),
  factories: vi.fn(),
  factoryPage: vi.fn(),
  get: vi.fn(),
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
  createProductionOrder: mocks.create,
  getFactoryProductionOrders: mocks.factoryPage,
  getMyProductionOrders: mocks.myPage,
  getOrderableFactories: mocks.factories,
  getProductionOrder: mocks.get,
  progressProductionOrder: vi.fn(),
  rejectProductionOrder: vi.fn(),
  searchOrderProducts: mocks.search,
}));
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
    { completedQuantity: 0, id: 91, productId: 'p1', productName: product.displayName!, quantity: 500, size: product.size, unit: '条' },
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
    button('接单').click();
    await flush();
    expect(mocks.accept).toHaveBeenCalledWith({ id: 9, promisedDate: '2026-10-20', reply: undefined });
  });
});
