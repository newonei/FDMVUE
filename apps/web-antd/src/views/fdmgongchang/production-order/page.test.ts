import type { FdmgongchangProductionOrderApi as Api } from '#/api/fdmgongchang/production-order';

import { createApp, defineComponent, h, nextTick } from 'vue';

import { afterEach, describe, expect, it, vi } from 'vitest';

import ProductionOrderPage from './index.vue';

const mocks = vi.hoisted(() => ({
  accept: vi.fn(),
  generate: vi.fn(),
  getSchedule: vi.fn(),
  getSchedules: vi.fn().mockResolvedValue([]),
  push: vi.fn(),
  complete: vi.fn(),
  delivery: vi.fn(),
  stockPage: vi.fn(),
  voidDelivery: vi.fn(),
  create: vi.fn(),
  factories: vi.fn(),
  fillGet: vi.fn(),
  fillSubmit: vi.fn(),
  factoryPage: vi.fn(),
  get: vi.fn(),
  lastRoute: vi.fn().mockResolvedValue(null),
  materialPlan: vi.fn(),
  saveMaterial: vi.fn(),
  saveTarget: vi.fn(),
  supplyMatch: vi.fn().mockResolvedValue([]),
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
  getDefaultFillPrompt: vi.fn().mockResolvedValue('默认提示词'),
  getDemandFill: mocks.fillGet,
  getProductCategories: vi.fn().mockResolvedValue(['TPE瑜伽垫', '辅料']),
  submitDemandFill: mocks.fillSubmit,
  getFactoryProductionOrders: mocks.factoryPage,
  getMyProductionOrders: mocks.myPage,
  getOrderableFactories: mocks.factories,
  getProductionOrder: mocks.get,
  getLastRoute: mocks.lastRoute,
  getMaterialPlan: mocks.materialPlan,
  getRecipeOptions: vi.fn().mockResolvedValue([{ recipeCode: 'REC-001', recipeName: '常规款（密度110）' }]),
  saveItemMaterial: mocks.saveMaterial,
  getSupplyMatch: mocks.supplyMatch,
  getTargetOptions: vi.fn().mockResolvedValue({
    colors: [{ label: '粉', value: 'PK' }],
    materials: [{ label: 'TPE', value: 'TPE' }],
    patterns: [{ label: '哆啦A梦', value: 'DM' }],
    textures: [{ label: '贝壳纹', value: 'SH' }],
  }),
  saveItemTarget: mocks.saveTarget,
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
  getWorkerList: vi.fn().mockResolvedValue([]),
  setCurrentFactoryId: mocks.setFactory,
}));
vi.mock('#/api/fdmgongchang/schedule', () => ({
  generateSchedule: mocks.generate,
  getSchedule: mocks.getSchedule,
  getSchedules: mocks.getSchedules,
}));
vi.mock('vue-router', () => ({
  useRoute: () => ({ query: {} }),
  useRouter: () => ({ push: mocks.push }),
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
    // 工厂排单页给工厂的人用，先看本厂收到的单；其他部门提需求在「我提的需求」
    expect(document.body.textContent).toContain('工厂排单');
    expect(document.body.textContent).toContain('1 待接单');
    expect(document.body.textContent).toContain('我提的需求');

    button('＋提生产需求').click();
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

  it('fills the demand from AI and creates new specifications when submitting', async () => {
    mocks.factories.mockResolvedValue([{ code: 'HBFDM', deptId: 118, id: 1, name: '黄石工厂' }]);
    mocks.myPage.mockResolvedValue({ list: [], total: 0 });
    mocks.factoryPage.mockResolvedValue({ list: [], total: 0 });
    mocks.create.mockResolvedValue(10);
    mocks.fillSubmit.mockResolvedValue(5);
    const other: Api.Product = { code: 'DZ2401970', id: 'p2', name: 'TPE单色瑜伽垫-Jack', size: '183*61*0.6cm', unit: '条' };
    mocks.fillGet.mockResolvedValue({
      files: [{ name: '截图.png', note: '图片太多，有 2 张没看', status: 'PARTIAL' }],
      id: 5,
      result: {
        lines: [
          { candidates: [], product, quantity: 500 },
          {
            candidates: [],
            category: 'TPE瑜伽垫',
            material: 'TPE',
            model: '灰',
            name: 'TPE瑜伽垫',
            quantity: 30,
            specification: '120*60*0.8cm',
            unit: '条',
          },
          { candidates: [other], category: '不存在的分类', name: 'TPE单色瑜伽垫', quantity: 20, specification: '183*61*0.6cm', unit: '条' },
        ],
        notes: ['第 3 行颜色看不清'],
        purpose: '客户订单',
        requiredDate: '2099-01-15',
      },
      status: 'DONE',
    });
    unmount = mount();
    await flush();
    button('＋提生产需求').click();
    await flush();
    const text = document.querySelector<HTMLTextAreaElement>('#po-ai-text')!;
    text.value = '183*61*0.6 米白 500 条';
    text.dispatchEvent(new Event('input', { bubbles: true }));
    await flush();
    button('AI识别并回填').click();
    await flush();
    expect(mocks.fillSubmit).toHaveBeenCalledWith({ factoryId: 1, files: [], prompt: undefined, text: '183*61*0.6 米白 500 条' });
    expect(mocks.fillGet).toHaveBeenCalledWith(5);
    const body = () => document.body.textContent ?? '';
    expect(body()).toContain('AI 回填了 3 行：1 行对上产品中心，2 行是新规格');
    expect(body()).toContain('第 3 行颜色看不清');
    expect(body()).toContain('「截图.png」图片太多，有 2 张没看');
    expect(body()).toContain('其中 2 个是新规格，提交时在产品中心新建');
    expect(document.querySelector<HTMLInputElement>('#po-purpose')!.value).toBe('客户订单');

    // 第三行其实是产品中心已有的，点「改用这个」就不新建
    [...document.querySelectorAll('button')].find((b) => b.textContent?.includes('改用这个'))!.click();
    await flush();
    expect(body()).toContain('其中 1 个是新规格');

    button('提交给工厂').click();
    await flush();
    expect(mocks.create).toHaveBeenCalledTimes(1);
    const req = mocks.create.mock.calls[0]![0] as Api.CreateReq;
    expect(req.requiredDate).toBe('2099-01-15');
    expect(req.items.map((i) => [i.productId, i.newProduct?.name, i.quantity])).toEqual([
      ['p1', undefined, 500],
      [undefined, 'TPE瑜伽垫', 30],
      ['p2', undefined, 20],
    ]);
    expect(req.items[1]!.newProduct).toEqual({
      category: 'TPE瑜伽垫',
      color: undefined,
      material: 'TPE',
      model: '灰',
      name: 'TPE瑜伽垫',
      packaging: undefined,
      printing: undefined,
      specification: '120*60*0.8cm',
      unit: '条',
    });
    expect(req.items[1]!.steps).toEqual(['SLICE', 'PUNCH']);
  });

  it('lets the factory accept an order it received', async () => {
    mocks.perms.splice(0, mocks.perms.length, 'fdmgongchang:production-order:handle');
    mocks.factoryPage.mockResolvedValue({ list: [order], total: 1 });
    mocks.get.mockResolvedValue(order);
    mocks.accept.mockResolvedValue(true);
    const board = {
      boards: 32,
      kg: 576,
      kgPerBoard: 18,
      layers: 8,
      name: '本厂密炼出板',
      perBoard: 16,
      piecesPerLayer: 2,
      size: '210×136×4.8',
      source: 'SETTING' as const,
      utilization: 93.8,
    };
    mocks.materialPlan.mockResolvedValue({
      items: [
        {
          batchKg: 144,
          batches: 4,
          board,
          candidates: [board],
          itemId: 91,
          productName: product.displayName,
          quantity: 500,
          raws: [{ available: 300, rawMaterialCode: 'MAT-TPE', rawMaterialName: 'TPE', required: 540, shortage: 240 }],
          rawKg: 576,
          recipeCode: 'REC-001',
          recipeName: '常规款（密度110）',
          recipeSuggested: true,
          remaining: 500,
          stock: [],
          targetSize: '183×61×0.6',
          unit: '条',
          warnings: [],
        },
      ],
      orderId: 9,
      orderNo: order.orderNo,
      shortage: true,
      totals: [],
    });
    unmount = mount();
    await flush();
    expect(mocks.setFactory).toHaveBeenCalledWith(1);
    expect(document.body.textContent).toContain('运营小王');
    expect(document.body.textContent).not.toContain('＋ 提生产需求');

    button('去接单').click();
    await flush();
    expect(document.body.textContent).toContain('接单处理');
    expect(document.body.textContent).toContain('工艺 · 单层散装');
    // 接单前就能看用料逆推：板材张数、原料 kg、锅数，缺的原料标出来
    expect(mocks.materialPlan).toHaveBeenCalledWith(9);
    const plan = document.body.textContent?.replaceAll(/\s+/g, '') ?? '';
    expect(plan).toContain('用料逆推');
    expect(plan).toContain('按上次建议');
    expect(plan).toContain('一张出16条→要32张');
    expect(plan).toContain('原料576kg（每张18kg）≈密炼4锅');
    expect(plan).toContain('240kg');
    button('接单').click();
    await flush();
    expect(mocks.accept).toHaveBeenCalledWith({ id: 9, promisedDate: '2026-10-20', reply: undefined });
  });

  it('sets the same processes for several products at once when accepting a purchase order', async () => {
    mocks.perms.splice(0, mocks.perms.length, 'fdmgongchang:production-order:handle');
    const item = { ...order.items[0]!, processes: [], routeId: null, routeName: null, steps: [] };
    const purchase = {
      ...order,
      items: [item, { ...item, id: 92, productName: '双色TPE瑜伽垫' }, { ...item, id: 93, productName: '加厚瑜伽垫' }],
      sourceOrderCode: 'CG-001',
      sourceType: 'PURCHASE_ORDER',
    };
    mocks.factoryPage.mockResolvedValue({ list: [purchase], total: 1 });
    mocks.get.mockResolvedValue(purchase);
    mocks.materialPlan.mockResolvedValue({ items: [], orderId: 9, orderNo: order.orderNo, shortage: false, totals: [] });
    mocks.accept.mockResolvedValue(true);
    unmount = mount();
    await flush();
    button('去接单').click();
    await flush();
    expect(document.body.textContent).toContain('批量设置工序');

    const batchChips = [...document.querySelectorAll<HTMLButtonElement>('[aria-label="po-batch 要走的工序"] .route-chip')];
    batchChips[0]!.click();
    await flush();
    batchChips[1]!.click();
    await flush();
    // 第三个产品不套用，单独定
    const third = [...document.querySelectorAll<HTMLInputElement>('[aria-label="套用到哪些产品"] input[type="checkbox"]')].at(-1)!;
    third.click();
    await flush();
    button('套用到勾选的2个产品').click();
    await flush();
    const thirdChips = [...document.querySelectorAll<HTMLButtonElement>('[aria-label="po-item-93 要走的工序"] .route-chip')];
    thirdChips[0]!.click();
    await flush();

    button('接单').click();
    await flush();
    expect(mocks.accept).toHaveBeenCalledWith(
      expect.objectContaining({
        routes: [
          { itemId: 91, routeId: undefined, steps: ['SLICE', 'PUNCH'] },
          { itemId: 92, routeId: undefined, steps: ['SLICE', 'PUNCH'] },
          { itemId: 93, routeId: undefined, steps: ['SLICE'] },
        ],
      }),
    );
  });

  it('lets the factory confirm the structured spec and shows how stock covers the order', async () => {
    mocks.perms.splice(0, mocks.perms.length, 'fdmgongchang:production-order:handle');
    const suggested = { frontColor: 'PK', length: 183, material: 'TPE', thickness: 0.6, width: 61 };
    const accepted = {
      ...order,
      items: [{ ...order.items[0]!, targetSuggested: suggested }],
      status: 'ACCEPTED',
      statusLabel: '生产中',
    };
    mocks.factoryPage.mockResolvedValue({ list: [accepted], total: 1 });
    mocks.get.mockResolvedValue(accepted);
    mocks.materialPlan.mockResolvedValue({ items: [], orderId: 9, orderNo: order.orderNo, shortage: false, totals: [] });
    mocks.supplyMatch.mockResolvedValue([
      {
        covered: 200,
        itemId: 91,
        lines: [
          { code: 'CC-1', covers: 200, nextProcesses: [], perUnit: 1, source: 'STOCK', stage: 'PUNCHED', stageLabel: '已冲裁半成品', unit: '件', used: 200 },
        ],
        newProduction: 300,
        notes: ['已冲裁半成品 CC-2：颜色不同'],
        pending: null,
        processes: [
          { label: '开片', process: 'SLICE', quantity: 300 },
          { label: '冲裁', process: 'PUNCH', quantity: 300 },
        ],
        productName: product.displayName,
        remaining: 500,
        targetConfirmed: false,
      },
    ]);
    mocks.saveTarget.mockResolvedValue(true);
    unmount = mount();
    await flush();
    button('查看').click();
    await flush();
    const text = document.body.textContent?.replaceAll(/\s+/g, '') ?? '';
    expect(mocks.supplyMatch).toHaveBeenCalledWith(9);
    expect(text).toContain('规格与库存匹配');
    expect(text).toContain('未确认');
    expect(text).toContain('还要交500：现成料覆盖200，缺料300');
    expect(text).toContain('开片300·冲裁300');
    expect(text).toContain('CC-2：颜色不同');

    button('确认规格').click();
    await flush();
    const ok = [...document.querySelectorAll('.ant-modal button')].find(
      (b) => b.textContent?.replaceAll(/\s/g, '') === '确认规格',
    ) as HTMLButtonElement;
    ok.click();
    await flush();
    // 没压花、没雕刻的工艺不带压纹和图案；预填的是从规格文本解析的值
    expect(mocks.saveTarget).toHaveBeenCalledWith(
      expect.objectContaining({ frontColor: 'PK', itemId: 91, length: 183, material: 'TPE', pattern: undefined, thickness: 0.6, width: 61 }),
    );
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
    expect(text).toContain('复制需求（来自 GD20261010-001）');
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

  it('lets the factory pick accepted orders and hand only those to AI scheduling', async () => {
    mocks.perms.splice(0, mocks.perms.length, 'fdmgongchang:production-order:handle', 'fdmgongchang:schedule:generate',
      'fdmgongchang:schedule:query');
    const accepted: Api.Order = { ...order, id: 11, orderNo: 'GD20261011-002', status: 'ACCEPTED', statusLabel: '生产中' };
    mocks.factoryPage.mockResolvedValue({ list: [order, accepted], total: 2 });
    mocks.generate.mockResolvedValue(77);
    mocks.getSchedules.mockResolvedValue([
      { days: 3, id: 77, revision: 1, scheduleNo: 'PB20261011-001', scopeOrderNos: ['GD20261011-002'], startDate: '2026-10-11', status: 'GENERATING' },
    ]);
    mocks.getSchedule.mockResolvedValue({ days: 3, id: 77, revision: 1, scheduleNo: 'PB20261011-001', startDate: '2026-10-11', status: 'GENERATING' });
    unmount = mount();
    await flush();

    const boxes = [...document.querySelectorAll<HTMLInputElement>('tbody input[type="checkbox"]')];
    expect(boxes).toHaveLength(2);
    expect(boxes[0]!.disabled).toBe(true);
    boxes[1]!.click();
    await flush();
    button('AI排单（已选1张）').click();
    await flush();
    expect(document.body.textContent).toContain('GD20261011-002');
    button('交给AI排单').click();
    await flush();
    expect(mocks.generate).toHaveBeenCalledWith(expect.objectContaining({ days: 3, productionOrderIds: [11] }));
    // 生成后不跳页，切到「排单方案」标签并打开这一份
    expect(mocks.push).not.toHaveBeenCalled();
    expect(mocks.getSchedule).toHaveBeenCalledWith(77);
    expect(document.querySelector('.ant-tabs-tab-active')?.textContent).toContain('排单方案');
  });
});
