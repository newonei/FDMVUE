import type { FdmgongchangProductionOrderApi as Api } from '#/api/fdmgongchang/production-order';

import { createApp, defineComponent, h, nextTick } from 'vue';

import { afterEach, describe, expect, it, vi } from 'vitest';

import ProductionOrderPage from './index.vue';

const routeOptions = vi.hoisted(() => ({
  processes: [
    ['SLICE', '开片', 'SHEET', '片材', ['BOARD']],
    ['PUNCH', '冲裁', 'PUNCHED', '已冲裁成品', ['SHEET']],
    ['ENGRAVE', '雕刻', 'ENGRAVED', '已雕刻成品', ['PUNCHED']],
    ['FOLD', '折叠', 'FOLDED', '已折叠成品', ['ENGRAVED', 'PUNCHED']],
    ['PACK', '包装', 'PACKED', '已包装成品', ['ENGRAVED', 'PUNCHED', 'FOLDED']],
  ].map(([code, label, outputStage, outputStageLabel, sources]) => ({
    code,
    label,
    outputStage,
    outputStageLabel,
    sources,
    unit: '件',
  })),
  routes: [{ id: 3, name: '单层散装', status: 0, steps: ['SLICE', 'PUNCH'] }],
}));

const mocks = vi.hoisted(() => ({
  accept: vi.fn(),
  confirmSchedule: vi.fn(),
  createManualSchedule: vi.fn(),
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
  getPurchaseSheet: vi.fn().mockResolvedValue({ order: { lines: [] }, details: {} }),
  getRouteOptions: vi.fn().mockResolvedValue(routeOptions),
  lastRoute: vi.fn().mockResolvedValue(null),
  materialPlan: vi.fn(),
  previewSupplement: vi.fn(),
  releaseSupplement: vi.fn(),
  saveScheduleTask: vi.fn(),
  saveMaterial: vi.fn(),
  saveTarget: vi.fn(),
  showShortageDispatch: vi.fn(),
  supplyMatch: vi.fn().mockResolvedValue([]),
  myFactories: vi.fn().mockResolvedValue({
    canSeeAll: false,
    defaultFactoryId: 1,
    factories: [{ code: 'HBFDM', deptId: 118, id: 1, name: '黄石工厂' }],
  }),
  myPage: vi.fn(),
  perms: ['fdmgongchang:production-order:create', 'fdmgongchang:production-order:handle'],
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
  getPurchaseSheet: mocks.getPurchaseSheet,
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
  getRouteOptions: mocks.getRouteOptions,
  rejectProductionOrder: vi.fn(),
}));
vi.mock('#/api/fdmgongchang/stage-stock', () => ({ getStockPage: mocks.stockPage }));
vi.mock('#/api/fdmgongchang/factory', () => ({
  getMyFactories: mocks.myFactories,
  getWorkerList: vi.fn().mockResolvedValue([]),
  setCurrentFactoryId: mocks.setFactory,
}));
vi.mock('#/api/fdmgongchang/schedule', () => ({
  confirmSchedule: mocks.confirmSchedule,
  createManualSchedule: mocks.createManualSchedule,
  generateSchedule: mocks.generate,
  getSchedule: mocks.getSchedule,
  getSchedules: mocks.getSchedules,
  getMixQueue: vi.fn().mockResolvedValue([]),
  moveMixPackage: vi.fn(),
  releaseTaskPackages: vi.fn(),
  previewOrderSplit: vi.fn(),
  releaseOrderSplit: vi.fn(),
  previewRouteSupplement: mocks.previewSupplement,
  releaseRouteSupplement: mocks.releaseSupplement,
  saveScheduleTask: mocks.saveScheduleTask,
}));
vi.mock('vue-router', () => ({
  useRoute: () => ({ query: {} }),
  useRouter: () => ({ push: mocks.push }),
}));
vi.mock('./modules/item-production-config-modal.vue', () => ({
  default: defineComponent({
    props: ['open', 'orderId', 'itemId'], emits: ['saved', 'update:open'],
    setup: (props, { emit }) => () => props.open ? h('button', { id: 'save-order-config-test', onClick: () => { emit('update:open', false); emit('saved'); } }, `保存生产参数 ${props.orderId}/${props.itemId}`) : null,
  }),
}));
vi.mock('../schedule/modules/product-picker-modal.vue', () => ({
  default: defineComponent({
    props: ['open', 'orderSelection'], emits: ['selectedMany'],
    setup: (props, { emit }) => () => props.open ? h('button', {
      onClick: () => emit('selectedMany', [product, { ...product, id: 'p2' }, product]),
    }, '批量加入选中的产品') : null,
  }),
}));
vi.mock('../schedule/modules/shortage-dispatch-modal.vue', () => ({
  default: defineComponent({
    props: ['open', 'seed', 'factoryId'],
    emits: ['dispatched', 'update:open'],
    setup: (props) => () => {
      if (!props.open) return null;
      mocks.showShortageDispatch(props.seed, props.factoryId);
      return h('div', { role: 'dialog', 'aria-label': '补派工表单' });
    },
  }),
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

const confirmedParameters: Partial<Api.Item> = {
  targetConfirmedAt: '2026-11-17', targetMaterial: 'TPE', targetColorMode: 'SINGLE', targetConstructionType: 'SINGLE_LAYER',
  targetFrontColor: 'PK', targetBackColor: 'PK', targetLength: 183, targetWidth: 61, targetThickness: 0.6, targetFrontThickness: 0.6,
};

const flush = async () => {
  for (let i = 0; i < 10; i++) {
    await Promise.resolve();
    await nextTick();
  }
};

function button(text: string, scope: ParentNode = document) {
  const el = [...scope.querySelectorAll('button')].find((b) => b.textContent?.replaceAll(/\s/g, '') === text);
  if (!el) throw new Error(`找不到按钮：${text}`);
  return el;
}

function demandRoute(id: string) {
  return document.querySelector<HTMLElement>(`[aria-label="${id} 要走的工序"]`)!;
}

function demandDrafts() {
  const remarks = document.querySelectorAll<HTMLInputElement>('input[placeholder="备注（选填）"]');
  return ['p1', 'p2'].map((id, index) => ({
    quantity: document.querySelector<HTMLInputElement>(`#po-qty-${id}`)?.value,
    remark: remarks[index]?.value,
    steps: [...demandRoute(`po-route-${id}`).querySelectorAll('button[aria-pressed="true"]')]
      .map((chip) => chip.textContent?.trim()),
  }));
}

function fillInput(input: HTMLInputElement | HTMLTextAreaElement, value: string) {
  input.value = value;
  input.dispatchEvent(new Event('input', { bubbles: true }));
}

function batchDialog() {
  const dialog = document.querySelector('#po-batch-quantity')?.closest('[role="dialog"]');
  expect(dialog?.textContent).toContain('批量设置明细');
  return dialog!;
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

  async function openDemandWithProducts() {
    mocks.perms.splice(0, mocks.perms.length, 'fdmgongchang:production-order:create');
    mocks.factories.mockResolvedValue([{ code: 'HBFDM', deptId: 118, id: 1, name: '黄石工厂' }]);
    mocks.myPage.mockResolvedValue({ list: [], total: 0 });
    mocks.factoryPage.mockResolvedValue({ list: [], total: 0 });
    mocks.getRouteOptions.mockResolvedValueOnce({ ...routeOptions, routes: [] });
    unmount = mount();
    await flush();
    button('＋提生产需求').click();
    await flush();
    button('＋从产品中心选择').click();
    await vi.dynamicImportSettled();
    await flush();
    button('批量加入选中的产品').click();
    await flush();
  }

  it('shows all orders initially and filters pending orders without changing the overview totals', async () => {
    mocks.perms.splice(0, mocks.perms.length, 'fdmgongchang:production-order:create', 'fdmgongchang:production-order:handle');
    mocks.factories.mockResolvedValue([]);
    const statusTotals: Record<string, number> = { SUBMITTED: 3, ACCEPTED: 4, COMPLETED: 5 };
    mocks.factoryPage.mockImplementation(async (params) => ({
      list: params.pageSize === 1 || params.keyword ? [] : [order],
      total: params.keyword ? 0 : (statusTotals[params.status] ?? 12),
    }));
    unmount = mount();
    await flush();
    expect(mocks.factoryPage).toHaveBeenCalledWith(expect.objectContaining({ pageSize: 20, status: undefined }));
    const pendingCard = document.querySelector<HTMLButtonElement>('.overview-card--pending')!;
    expect(pendingCard.textContent).toContain('3');
    pendingCard.click();
    await new Promise((resolve) => setTimeout(resolve, 350));
    await flush();
    expect(pendingCard.getAttribute('aria-pressed')).toBe('true');
    expect(mocks.factoryPage).toHaveBeenCalledWith(expect.objectContaining({ pageSize: 20, status: 'SUBMITTED' }));
    const input = document.querySelector<HTMLInputElement>('#po-filter-keyword')!;
    input.value = '找不到的订单';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    await new Promise((resolve) => setTimeout(resolve, 350));
    await flush();
    expect(document.body.textContent).toContain('没有符合条件的订单');
    expect(pendingCard.querySelector('.overview-card__value')?.textContent).toBe('3');
    button('重置筛选').click();
    await new Promise((resolve) => setTimeout(resolve, 350));
    await flush();
    expect(input.value).toBe('');
    expect(document.querySelector('.overview-card--all')?.getAttribute('aria-pressed')).toBe('true');
    expect(document.body.textContent).toContain(order.orderNo);
  });

  it('adds products from the catalog in bulk and keeps per-line route and order validation', async () => {
    mocks.factories.mockResolvedValue([{ code: 'HBFDM', deptId: 118, id: 1, name: '黄石工厂' }]);
    mocks.myPage.mockResolvedValue({ list: [], total: 0 });
    mocks.factoryPage.mockResolvedValue({ list: [order], total: 1 });
    mocks.create.mockResolvedValue(9);
    mocks.get.mockResolvedValue(order);
    unmount = mount();
    await flush();
    // 工厂默认打开本厂订单，也能从「我提的需求」查看自己提交的需求。
    expect(document.querySelector('h1')?.textContent).toBe('生产订单');
    expect(document.body.textContent).toContain('1 待接单');
    expect(document.body.textContent).toContain('我提的需求');

    button('＋提生产需求').click();
    await flush();
    button('＋从产品中心选择').click();
    await vi.dynamicImportSettled();
    await flush();
    button('批量加入选中的产品').click();
    await flush();
    expect(document.body.textContent).toContain('明细（2）');

    // 产品没下过单、工厂只有一条路线时默认用它；工序按生产链排，跳过后接不上时提示
    expect(mocks.lastRoute).toHaveBeenCalledWith(1, 'p1');
    expect(mocks.lastRoute).toHaveBeenCalledWith(1, 'p2');
    const chips = () => [...document.querySelectorAll<HTMLButtonElement>('[aria-label="po-route-p1 要走的工序"] .route-chip')];
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

  it('cancels batch edits and fills only blank fields on the selected demand line without a route template', async () => {
    let resolveHistory!: (route: Api.LastRoute) => void;
    mocks.lastRoute.mockReturnValueOnce(new Promise<Api.LastRoute>((resolve) => {
      resolveHistory = resolve;
    }));
    await openDemandWithProducts();
    expect(mocks.lastRoute).toHaveBeenNthCalledWith(1, 1, 'p1');
    const blank = { quantity: '', remark: '', steps: [] };
    expect(button('批量设置').disabled).toBe(true);
    document.querySelector<HTMLInputElement>('#po-select-line-p1')!.click();
    await flush();
    button('批量设置').click();
    await flush();

    const dialog = batchDialog();
    fillInput(dialog.querySelector<HTMLInputElement>('#po-batch-quantity')!, '40');
    await flush();
    expect(dialog.textContent).toMatch(/将修改\s*1\s*行/);
    expect(demandDrafts()).toEqual([blank, blank]);
    button('取消', dialog).click();
    await flush();
    expect(demandDrafts()).toEqual([blank, blank]);

    fillInput(document.querySelector<HTMLInputElement>('#po-qty-p1')!, '12');
    fillInput(document.querySelector<HTMLInputElement>('input[placeholder="备注（选填）"]')!, '保留明细备注');
    const selected = document.querySelector<HTMLInputElement>('#po-select-line-p1')!;
    if (!selected.checked) selected.click();
    await flush();
    button('批量设置').click();
    await flush();
    const reopened = batchDialog();
    fillInput(reopened.querySelector<HTMLInputElement>('#po-batch-quantity')!, '40');
    button('开片', demandRoute('po-batch-route')).click();
    await flush();
    button('冲裁', demandRoute('po-batch-route')).click();
    await flush();
    expect(reopened.textContent).toMatch(/将修改\s*1\s*行/);
    expect(reopened.textContent).not.toMatch(/将覆盖\s*\d+\s*行的已有值/);
    button('应用到明细', reopened).click();
    await flush();

    const expected = [{ quantity: '12', remark: '保留明细备注', steps: ['开片', '冲裁'] }, blank];
    expect(demandDrafts()).toEqual(expected);
    resolveHistory({ orderNo: order.orderNo, steps: ['PACK'] });
    await flush();
    expect(demandDrafts()).toEqual(expected);
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it('previews how many selected demand lines would be overwritten before applying to all lines', async () => {
    await openDemandWithProducts();
    fillInput(document.querySelector<HTMLInputElement>('#po-qty-p1')!, '12');
    fillInput(document.querySelector<HTMLInputElement>('input[placeholder="备注（选填）"]')!, '原备注');
    button('冲裁', demandRoute('po-route-p1')).click();
    document.querySelector<HTMLInputElement>('#po-select-all-lines')!.click();
    await flush();
    expect(document.querySelector<HTMLInputElement>('#po-select-line-p1')?.checked).toBe(true);
    expect(document.querySelector<HTMLInputElement>('#po-select-line-p2')?.checked).toBe(true);
    button('批量设置').click();
    await flush();

    const dialog = batchDialog();
    fillInput(dialog.querySelector<HTMLInputElement>('#po-batch-quantity')!, '40');
    fillInput(dialog.querySelector<HTMLInputElement | HTMLTextAreaElement>('#po-batch-remark')!, '统一备注');
    button('开片', demandRoute('po-batch-route')).click();
    await flush();
    const overwrite = dialog.querySelector<HTMLInputElement>('#po-batch-overwrite')!;
    expect(overwrite.checked).toBe(false);
    expect(dialog.textContent).toMatch(/将修改\s*1\s*行/);
    expect(dialog.textContent).not.toMatch(/将覆盖\s*\d+\s*行的已有值/);

    overwrite.click();
    await flush();
    expect(dialog.textContent).toMatch(/将修改\s*2\s*行/);
    expect(dialog.textContent).toMatch(/将覆盖\s*1\s*行的已有值/);
    expect(demandDrafts()).toEqual([
      { quantity: '12', remark: '原备注', steps: ['冲裁'] },
      { quantity: '', remark: '', steps: [] },
    ]);

    button('应用到明细', dialog).click();
    await flush();
    expect(demandDrafts()).toEqual([
      { quantity: '40', remark: '统一备注', steps: ['开片'] },
      { quantity: '40', remark: '统一备注', steps: ['开片'] },
    ]);
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
    const uploadArea = document.querySelector<HTMLElement>(
      '[aria-label="AI 识别附件"]',
    )!;
    const screenshot = new File(['screenshot'], '截图.png', { type: 'image/png' });
    const paste = new Event('paste', { bubbles: true, cancelable: true });
    Object.defineProperty(paste, 'clipboardData', {
      value: { files: [screenshot] },
    });
    uploadArea.focus();
    uploadArea.dispatchEvent(paste);
    expect(paste.defaultPrevented).toBe(true);
    const text = document.querySelector<HTMLTextAreaElement>('#po-ai-text')!;
    text.value = '183*61*0.6 米白 500 条';
    text.dispatchEvent(new Event('input', { bubbles: true }));
    await flush();
    button('AI识别并回填').click();
    await flush();
    expect(mocks.fillSubmit).toHaveBeenCalledWith({
      factoryId: 1,
      files: [screenshot],
      prompt: undefined,
      text: '183*61*0.6 米白 500 条',
    });
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

  it.each([
    ['contract-id', 'contract-id'],
    [null, 'standalone'],
  ])('opens the exact source purchase order with its contract context %s', async (sourceContractId, contractId) => {
    const purchase = { ...order, sourceContractId, sourceOrderId: 'po-id', sourceOrderCode: 'CG-20261118-1F17C9', sourceType: 'PURCHASE_ORDER' };
    mocks.perms.splice(0, mocks.perms.length, 'fdmgongchang:production-order:handle', 'fdmplatform:orders:query');
    mocks.factoryPage.mockResolvedValue({ list: [purchase], total: 1 });
    unmount = mount();
    await flush();
    button('采购单CG-20261118-1F17C9').click();
    expect(mocks.push).toHaveBeenCalledWith({
      path: '/fdmprocurement/platform-orders',
      query: { contractId, documentId: 'po-id' },
    });
  });

  it('shows the purchase subject and separately labeled contract numbers in the list and order details', async () => {
    const purchase: Api.Order = {
      ...order,
      customerName: '测试客户',
      sourceContractCode: 'HT-202611-26',
      sourceContractId: 'contract-id',
      sourceContractName: 'NB-202611-18',
      sourceOrderCode: 'CG-202611-14',
      sourceOrderId: 'purchase-id',
      sourceOrderSubject: '瑜伽垫冬季补货',
      sourceType: 'PURCHASE_ORDER',
    };
    const manual: Api.Order = { ...order, id: 10, orderNo: 'GD20261010-002' };
    mocks.perms.splice(0, mocks.perms.length, 'fdmgongchang:production-order:handle');
    mocks.factoryPage.mockResolvedValue({ list: [purchase, manual], total: 2 });
    mocks.get.mockResolvedValue(purchase);
    mocks.materialPlan.mockResolvedValue({ items: [], orderId: 9, orderNo: order.orderNo, shortage: false, totals: [] });
    unmount = mount();
    await flush();

    const purchaseRow = document.querySelector('tr[data-row-key="9"]')!;
    const manualRow = document.querySelector('tr[data-row-key="10"]')!;
    const source = (root: ParentNode) => Object.fromEntries([...root.querySelectorAll('dl > div')].map((line) => [
      line.querySelector('dt')?.textContent,
      line.querySelector('dd')?.textContent,
    ]));
    expect(source(purchaseRow)).toMatchObject({ 合同内部单号: 'NB-202611-18', 合同编号: 'HT-202611-26', 客户: '测试客户' });
    expect(purchaseRow.textContent).toContain('瑜伽垫冬季补货');
    expect(purchaseRow.textContent).toContain('CG-202611-14');
    expect(manualRow.textContent).toContain('电商备货');
    expect(manualRow.textContent).not.toContain('合同内部单号');

    button(purchase.orderNo, purchaseRow).click();
    await flush();
    expect(source(document.querySelector('[aria-labelledby="po-purchase-source"]')!)).toMatchObject({
      合同内部单号: 'NB-202611-18',
      合同编号: 'HT-202611-26',
      客户: '测试客户',
      采购主题: '瑜伽垫冬季补货',
      采购单号: 'CG-202611-14',
    });
  });

  it('lets the factory accept an order it received', async () => {
    mocks.perms.splice(0, mocks.perms.length, 'fdmgongchang:production-order:handle');
    mocks.factoryPage.mockResolvedValue({ list: [order], total: 1 });
    mocks.get.mockResolvedValue({ ...order, items: order.items.map((item) => ({ ...item, ...confirmedParameters })) });
    mocks.accept.mockResolvedValue(true);
    const board = {
      boards: 32,
      kg: 576,
      kgPerBoard: 18,
      layers: 8,
      name: '本厂发泡出板',
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
    const modal = document.querySelector<HTMLElement>('.factory-dialog.ant-modal-centered[role="dialog"]')!;
    expect(modal).toBeTruthy();
    expect(modal.textContent).toContain('接单处理');
    expect(modal.textContent).toContain('工艺 · 单层散装');
    const planSection = modal.querySelector<HTMLElement>('section[aria-label="用料逆推"]')!;
    expect(planSection.style.display).toBe('none');
    button('用料逆推', modal).click();
    await flush();
    expect(button('用料逆推', modal).getAttribute('aria-pressed')).toBe('true');
    expect(planSection.style.display).not.toBe('none');
    expect(modal.querySelector<HTMLElement>('section[aria-label="产品明细"]')?.style.display).toBe('none');
    expect(mocks.materialPlan).toHaveBeenCalledWith(9);
    const plan = planSection.textContent?.replaceAll(/\s+/g, '') ?? '';
    expect(plan).toContain('用料逆推');
    expect(plan).toContain('按上次建议');
    expect(plan).toContain('成品理论换算：板材2100×1360×48mm');
    expect(plan).toContain('每张理论16条→预计需32张');
    expect(plan).toContain('开片按各制造层的实际厚度计算');
    expect(plan).toContain('原料576kg（每张18kg）≈发泡4锅');
    expect(plan).toContain('240kg');
    button('接单', modal).click();
    await flush();
    expect(mocks.accept).toHaveBeenCalledWith({ id: 9, promisedDate: '2026-10-20', reply: undefined });
  });

  it('sets the same processes for several products at once when accepting a purchase order', async () => {
    mocks.perms.splice(0, mocks.perms.length, 'fdmgongchang:production-order:handle');
    const item = { ...order.items[0]!, ...confirmedParameters, processes: [], routeId: null, routeName: null, steps: [] };
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

  it('shows two-colour material coverage as separate layers and pairs the finished mats', async () => {
    mocks.perms.splice(0, mocks.perms.length, 'fdmgongchang:production-order:handle');
    const accepted = { ...order, status: 'ACCEPTED', statusLabel: '生产中',
      items: [{ ...order.items[0]!, targetConstructionType: 'DOUBLE_LAYER', targetFrontColor: 'PK', targetBackColor: 'GY', targetThickness: 0.6 }] };
    mocks.factoryPage.mockResolvedValue({ list: [accepted], total: 1 }); mocks.get.mockResolvedValue(accepted);
    const board = { boards: 10, boardsByColor: { PK: 4, GY: 6 }, layersPerProduct: 2,
      layers: 16, piecesPerLayer: 2, perBoard: 32, name: '发泡板', size: '210×136×4.8', source: 'SETTING' };
    mocks.materialPlan.mockResolvedValue({ orderId: 9, orderNo: order.orderNo, shortage: false, totals: [], items: [{
      itemId: 91, productName: product.displayName, remaining: 300, quantity: 500, unit: '条', board, candidates: [board],
      raws: [], warnings: [], stock: [{ stage: 'CUT', stageLabel: '立切片材', itemCode: 'CUT-PK', color: 'PK', quantity: 100, unit: '片', pieces: 100 }],
    }] });
    mocks.supplyMatch.mockResolvedValue([{ itemId: 91, remaining: 500, covered: 200, newProduction: 300,
      newProductionByColor: { PK: 200, GY: 300 }, productName: product.displayName, targetConfirmed: true, notes: [],
      lines: [{ code: 'CUT-PK', color: 'PK', covers: 300, used: 300, perUnit: 1, stage: 'CUT', stageLabel: '立切片材', source: 'STOCK', unit: '片', nextProcesses: ['贴合'] }],
      processes: [{ label: '开片', process: 'SLICE', quantity: 500 }, { label: '贴合', process: 'LAMINATE', quantity: 500 }],
    }]);
    unmount = mount(); await flush(); button('查看').click(); await flush();
    const text = document.body.textContent?.replaceAll(/\s+/g, '') ?? '';
    expect(text).toContain('单层片材理论换算');
    expect(text).toContain('每张理论32片单层片材');
    expect(text).toContain('分色备板：PK4张；GY6张');
    expect(text).toContain('PK单层100片');
    expect(text).toContain('正反两层配齐后才计入整垫覆盖');
    expect(text).toContain('300粉单层片材');
    expect(text).toContain('单层缺口：粉200片；GY300片');
    expect(text).toContain('开片500片单层');
    expect(text).toContain('贴合500条成品');
  });

  it('lets the factory confirm the structured spec and shows how stock covers the order', async () => {
    mocks.perms.splice(0, mocks.perms.length, 'fdmgongchang:production-order:handle');
    const suggested = { colorMode: 'SINGLE', constructionType: 'SINGLE_LAYER', frontColor: 'PK', length: 183, material: 'TPE', thickness: 0.6, width: 61 };
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

    expect([...document.querySelectorAll('button')].some((el) => el.textContent === '确认规格')).toBe(false);
    button('修改参数与工艺').click();
    await flush();
    expect(document.querySelector('#save-order-config-test')?.textContent).toContain('9/91');
    const previousReads = mocks.get.mock.calls.length;
    document.querySelector<HTMLButtonElement>('#save-order-config-test')!.click();
    await flush();
    // 详情与主表共用完整参数编辑器，保存后重新读取明细和库存匹配。
    expect(mocks.get.mock.calls.length).toBeGreaterThan(previousReads);
    expect(mocks.supplyMatch.mock.calls.length).toBeGreaterThan(1);
    expect(mocks.saveTarget).not.toHaveBeenCalled();
  });

  it('opens the shared editor for legacy unequal layers without silently saving old manufacturing rules', async () => {
    mocks.perms.splice(0, mocks.perms.length, 'fdmgongchang:production-order:handle');
    const suggested = { colorMode: 'SINGLE', constructionType: 'DOUBLE_LAYER', frontColor: 'PK', backColor: 'PK', length: 183, width: 61, material: 'TPE', thickness: 0.6, frontThickness: 0.2, backThickness: 0.4 };
    const accepted = { ...order, status: 'ACCEPTED', statusLabel: '生产中', items: [{ ...order.items[0]!, targetSuggested: suggested }] };
    mocks.factoryPage.mockResolvedValue({ list: [accepted], total: 1 }); mocks.get.mockResolvedValue(accepted);
    mocks.supplyMatch.mockResolvedValue([]);
    mocks.materialPlan.mockResolvedValue({ items: [], orderId: 9, orderNo: order.orderNo, shortage: false, totals: [] });
    mocks.saveTarget.mockResolvedValue(true);
    unmount = mount(); await flush(); button('查看').click(); await flush();
    button('修改参数与工艺').click(); await flush();
    expect(document.querySelector('#save-order-config-test')?.textContent).toContain('9/91');
    expect(document.querySelector('#target-front-thickness')).toBeNull();
    expect(mocks.saveTarget).not.toHaveBeenCalled();
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

    const guide = document.querySelector<HTMLElement>('#factory-order-fulfillment-panel')!;
    expect(guide?.textContent).toContain('已交货');
    button('交货', guide).click();
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

  it('shows which purchase lines still need production and opens actions for the selected line', async () => {
    mocks.perms.splice(0, mocks.perms.length, 'fdmgongchang:production-order:handle');
    const accepted: Api.Order = {
      ...order,
      completedQuantity: 488,
      items: [
        { ...order.items[0]!, completedQuantity: 199, deliveryStage: 'PACKED', productCode: 'DZ2400010', quantity: 200 },
        { ...order.items[0]!, completedQuantity: 100, id: 92, productCode: 'DZ2400008', quantity: 100 },
        { ...order.items[0]!, completedQuantity: 99, id: 93, productCode: 'DZ2400009', quantity: 100 },
        { ...order.items[0]!, completedQuantity: 90, deliveryStage: 'PUNCHED', id: 94, productCode: 'DZ2400011', productName: '需补产的十条瑜伽垫', quantity: 100 },
      ],
      sourceType: 'PURCHASE_ORDER',
      status: 'ACCEPTED',
      statusLabel: '生产中',
    };
    mocks.factoryPage.mockResolvedValue({ list: [accepted], total: 1 });
    mocks.get.mockResolvedValue(accepted);
    mocks.materialPlan.mockResolvedValue({ items: [], orderId: 9, orderNo: order.orderNo, shortage: false, totals: [] });
    mocks.stockPage.mockResolvedValue({ list: [], total: 0 });
    mocks.supplyMatch.mockResolvedValue([
      {
        covered: 1, itemId: 91, newProduction: 0, notes: [], processes: [], productName: '任务预计覆盖', remaining: 1, targetConfirmed: true,
        lines: [{ code: 'TASK-1', covers: 1, nextProcesses: [], perUnit: 1, source: 'TASK', stage: 'PACKED', stageLabel: '包装成品', unit: '条', used: 1 }],
      },
      {
        covered: 1, itemId: 93, newProduction: 0, notes: [], processes: [], productName: '物料库存覆盖', remaining: 1, targetConfirmed: true,
        lines: [{ code: 'YH-1', covers: 1, nextProcesses: ['冲裁', '包装'], perUnit: 1, source: 'STOCK', stage: 'EMBOSSED', stageLabel: '压花半成品', unit: '片', used: 1 }],
      },
    ]);
    unmount = mount();
    await flush();
    button('补产指引·待补3款', document.querySelector('tr[data-row-key="9"]')!).click();
    await flush();

    const panel = document.querySelector<HTMLElement>('#factory-order-fulfillment-panel')!;
    const dialog = panel.closest('.factory-dialog.ant-modal-centered[role="dialog"]')!;
    expect(dialog).toBeTruthy();
    expect(button('关闭', dialog.querySelector('.ant-modal-footer')!)).toBeDefined();
    expect(panel?.textContent).toContain('补产指引');
    expect(panel.textContent).toContain('应做');
    expect(panel.textContent).toContain('已入库');
    expect(panel.textContent).toContain('还差');
    expect(panel.textContent).not.toContain('DZ2400008');
    const rows = [...panel.querySelectorAll('ul[aria-label="待补产品"] > li')];
    expect(rows).toHaveLength(3);
    for (const [code, expected] of [
      ['DZ2400010', [200, 199, 1]],
      ['DZ2400009', [100, 99, 1]],
      ['DZ2400011', [100, 90, 10]],
    ] as const) {
      const row = rows.find((element) => element.textContent?.includes(code))!;
      expect(row).toBeDefined();
      const values = [...row.querySelectorAll('dd')].map((cell) => cell.textContent?.replaceAll(/\s/g, ''));
      expect(values).toEqual(expected.map((quantity) => `${quantity}条`));
    }

    const taskOnlyRow = rows.find((row) => row.textContent?.includes('DZ2400010'))!;
    expect(taskOnlyRow.textContent).toContain('暂未匹配到可用现货');
    button('核对库存', taskOnlyRow).click();
    await flush();
    expect(taskOnlyRow.textContent).not.toContain('TASK-1');

    const stockRow = rows.find((row) => row.textContent?.includes('DZ2400009'))!;
    expect(stockRow.textContent).toContain('选定批次，再预览需要接续的工序');
    button('核对库存', stockRow).click();
    await flush();
    expect(stockRow.textContent).toContain('YH-1');
    expect(stockRow.textContent).toContain('冲裁 → 包装');

    const lastRow = rows.find((element) => element.textContent?.includes('DZ2400011'))!;
    expect(button('核对库存', lastRow)).toBeDefined();
    button('生产入库', lastRow).click();
    await flush();
    expect(mocks.stockPage).toHaveBeenCalledWith(expect.objectContaining({ stage: 'PUNCHED' }));
    expect(document.body.textContent).toContain('生产入库 · 需补产的十条瑜伽垫');
  });

  it('shows that an accepted order can be closed when all of its lines are filled', async () => {
    mocks.perms.splice(0, mocks.perms.length, 'fdmgongchang:production-order:handle');
    const accepted: Api.Order = {
      ...order,
      completedQuantity: 500,
      items: [{ ...order.items[0]!, completedQuantity: 500, productCode: 'DZ2400010' }],
      status: 'ACCEPTED',
      statusLabel: '生产中',
    };
    mocks.factoryPage.mockResolvedValue({ list: [accepted], total: 1 });
    mocks.get.mockResolvedValue(accepted);
    mocks.materialPlan.mockResolvedValue({ items: [], orderId: 9, orderNo: order.orderNo, shortage: false, totals: [] });
    mocks.supplyMatch.mockResolvedValue([]);
    unmount = mount();
    await flush();
    expect(document.querySelector('tr[data-row-key="9"]')?.textContent).not.toContain('补产指引');
    button('查看').click();
    await flush();

    const panel = document.querySelector<HTMLElement>('#factory-order-fulfillment-panel')!;
    expect(panel?.textContent).toContain('全部明细已达量，可以结束这张单。');
    expect(panel.textContent).not.toContain('DZ2400010');
    expect(button('结束这张单')).toBeDefined();
  });

  it('opens the batch and route preview for the selected order item', async () => {
    mocks.perms.splice(0, mocks.perms.length, 'fdmgongchang:production-order:handle', 'fdmgongchang:schedule:query', 'fdmgongchang:schedule:confirm');
    const accepted: Api.Order = {
      ...order,
      completedQuantity: 16,
      items: [
        { ...order.items[0]!, completedQuantity: 10, productCode: 'SHORT-A', quantity: 20 },
        { ...order.items[0]!, completedQuantity: 6, id: 93, processes: ['PUNCH', 'PACK'], productCode: 'SHORT-B', productName: '按本行补派工的产品', quantity: 10 },
      ],
      orderNo: 'GD-SHORTFALL',
      sourceType: 'PURCHASE_ORDER',
      status: 'ACCEPTED',
      statusLabel: '生产中',
      totalQuantity: 30,
    };
    mocks.factoryPage.mockResolvedValue({ list: [accepted], total: 1 });
    mocks.get.mockResolvedValue(accepted);
    mocks.materialPlan.mockResolvedValue({ items: [], orderId: accepted.id, orderNo: accepted.orderNo, shortage: false, totals: [] });
    mocks.supplyMatch.mockResolvedValue([{
      covered: 3, itemId: 93, newProduction: 1, notes: [], productName: '按本行补派工的产品', remaining: 4, targetConfirmed: true,
      lines: [{ code: 'EMB-STOCK', covers: 3, nextProcesses: ['冲裁', '包装'], perUnit: 1, source: 'STOCK', stage: 'EMBOSSED', stageLabel: '压花半成品', unit: '片', used: 3 }],
      processes: [{ label: '包装', process: 'PACK', quantity: 4 }, { label: '冲裁', process: 'PUNCH', quantity: 4 }],
    }]);

    unmount = mount();
    await flush();
    button('查看').click();
    await flush();
    const panel = document.querySelector<HTMLElement>('#factory-order-fulfillment-panel')!;
    const row = [...panel.querySelectorAll('ul[aria-label="待补产品"] > li')].find((element) => element.textContent?.includes('SHORT-B'))!;
    button('补派工', row).click();
    await flush();
    expect(document.querySelector('[aria-label="补派工表单"]')).not.toBeNull();
    expect(mocks.showShortageDispatch).toHaveBeenLastCalledWith({
      orderId: 9,
      orderNo: 'GD-SHORTFALL',
      itemId: 93,
      productCode: 'SHORT-B',
      productName: '按本行补派工的产品',
      remaining: 4,
      unit: accepted.items[1]?.unit,
    }, 1);
    expect(document.querySelector('.ant-tabs-tab-active')?.textContent).toContain('本厂订单');
    expect(mocks.createManualSchedule).not.toHaveBeenCalled();
    expect(mocks.confirmSchedule).not.toHaveBeenCalled();
    expect(mocks.saveScheduleTask).not.toHaveBeenCalled();
  });

  it('lets the factory pick accepted orders and hand only those to AI scheduling', async () => {
    mocks.perms.splice(0, mocks.perms.length, 'fdmgongchang:production-order:handle', 'fdmgongchang:schedule:generate',
      'fdmgongchang:schedule:query');
    const accepted: Api.Order = { ...order, id: 11, orderNo: 'GD20261011-002', status: 'ACCEPTED', statusLabel: '生产中' };
    const completed: Api.Order = { ...order, id: 12, orderNo: 'GD20261011-003', status: 'COMPLETED', statusLabel: '已完成' };
    mocks.factoryPage.mockResolvedValue({ list: [order, accepted, completed], total: 3 });
    mocks.generate.mockResolvedValue(77);
    mocks.getSchedules.mockResolvedValue([
      { days: 3, id: 77, revision: 1, scheduleNo: 'PB20261011-001', scopeOrderNos: ['GD20261011-002'], startDate: '2026-10-11', status: 'GENERATING' },
    ]);
    mocks.getSchedule.mockResolvedValue({ days: 3, id: 77, revision: 1, scheduleNo: 'PB20261011-001', startDate: '2026-10-11', status: 'GENERATING' });
    unmount = mount();
    await flush();

    const boxes = [...document.querySelectorAll<HTMLInputElement>('tbody input[type="checkbox"]')];
    expect(boxes).toHaveLength(3);
    expect(boxes[0]!.disabled).toBe(true);
    expect(boxes[2]!.disabled).toBe(true);
    expect(document.querySelector('tr.order-row--pending')?.textContent).toContain(order.orderNo);
    expect([...document.querySelectorAll<HTMLTableRowElement>('tr.order-row--completed')].map((row) => row.dataset.rowKey)).toEqual(['12']);
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
    expect(document.querySelector('.ant-tabs-tab-active')?.textContent).toContain('辅助排单 / 历史方案');
  });

  it('opens production configuration from the order table and refreshes saved product parameters', async () => {
    mocks.perms.splice(0, mocks.perms.length, 'fdmgongchang:production-order:handle');
    const accepted: Api.Order = { ...order, status: 'ACCEPTED', items: [{ ...order.items[0]!, targetColorMode: 'DUAL', targetThickness: 0.6, targetFrontThickness: 0.3, targetBackThickness: 0.3 }] };
    mocks.factoryPage.mockResolvedValue({ list: [accepted], total: 1 });
    mocks.get.mockResolvedValue({ ...accepted, items: [{ ...accepted.items[0]!, targetThickness: 0.8, targetFrontThickness: 0.4, targetBackThickness: 0.4, processes: ['SLICE', 'PUNCH', 'FOLD', 'PACK'] }] });
    unmount = mount(); await flush();
    button('产品参数').click(); await flush();
    expect(document.querySelector('.ant-table-expanded-row')?.textContent).toContain('成品总厚 6 mm');
    button('修改参数与工艺').click(); await flush();
    expect(document.querySelector('#save-order-config-test')?.textContent).toContain('9/91');
    document.querySelector<HTMLButtonElement>('#save-order-config-test')!.click(); await flush();
    expect(mocks.get).toHaveBeenCalledWith(9);
    expect(document.querySelector('.ant-table-expanded-row')?.textContent).toContain('成品总厚 8 mm');
    expect(document.querySelector('.ant-table-expanded-row')?.textContent).toContain('折叠 → 包装');
  });

  it('keeps the newly saved route when accepting an order and preserves other unsaved route drafts', async () => {
    mocks.perms.splice(0, mocks.perms.length, 'fdmgongchang:production-order:handle');
    const purchase: Api.Order = { ...order, sourceType: 'PURCHASE_ORDER', items: [{ ...order.items[0]! }, { ...order.items[0]!, id: 92 }] };
    mocks.factoryPage.mockResolvedValue({ list: [purchase], total: 1 });
    mocks.get.mockResolvedValue(purchase);
    mocks.supplyMatch.mockResolvedValue([]);
    mocks.materialPlan.mockResolvedValue({ items: [], orderId: 9, orderNo: order.orderNo, shortage: false, totals: [] });
    mocks.accept.mockResolvedValue(true);
    unmount = mount(); await flush(); button('去接单').click(); await flush();
    const otherChips = [...document.querySelectorAll<HTMLButtonElement>('[aria-label="po-item-92 要走的工序"] .route-chip')];
    otherChips.find((chip) => chip.textContent?.trim() === '雕刻')!.click(); await flush();
    button('修改参数与工艺').click(); await flush();
    const changed: Api.Order = { ...purchase, items: [{ ...purchase.items[0]!, ...confirmedParameters, processes: ['SLICE', 'PUNCH', 'FOLD', 'PACK'] }, { ...purchase.items[1]!, ...confirmedParameters }] };
    mocks.get.mockResolvedValue(changed);
    document.querySelector<HTMLButtonElement>('#save-order-config-test')!.click(); await flush();
    button('接单').click(); await flush();
    expect(mocks.accept).toHaveBeenCalledWith(expect.objectContaining({ routes: [
      { itemId: 91, routeId: 3, steps: ['SLICE', 'PUNCH', 'FOLD', 'PACK'] },
      { itemId: 92, routeId: 3, steps: ['SLICE', 'PUNCH', 'ENGRAVE'] },
    ] }));
  });

  it('shows each purchase line engraving requirement beside its independently selected route', async () => {
    mocks.perms.splice(0, mocks.perms.length, 'fdmgongchang:production-order:handle');
    const purchase: Api.Order = {
      ...order,
      sourceType: 'PURCHASE_ORDER',
      items: [
        { ...order.items[0]!, productCode: 'LASER-SKU', sourceLineId: 'laser' },
        { ...order.items[0]!, id: 92, productCode: 'PLAIN-SKU', sourceLineId: 'plain' },
      ],
    };
    mocks.factoryPage.mockResolvedValue({ list: [purchase], total: 1 });
    mocks.get.mockResolvedValue(purchase);
    mocks.getPurchaseSheet.mockResolvedValueOnce({
      order: { lines: [
        { id: 'plain', patternMode: 'NONE', frontColor: 'BLUE' },
        { id: 'laser', patternMode: 'LASER', frontColor: 'RED' },
      ] },
      details: {},
    });
    unmount = mount();
    await flush();
    button('去接单').click();
    await flush();

    const laserRoute = document.querySelector('[aria-label="po-item-91 要走的工序"]')!;
    const plainRoute = document.querySelector('[aria-label="po-item-92 要走的工序"]')!;
    expect(laserRoute.closest('article')?.textContent).toContain('激光雕刻');
    expect(laserRoute.closest('article')?.textContent).toContain('RED');
    expect(plainRoute.closest('article')?.textContent).toContain('无雕刻');
    expect(plainRoute.closest('article')?.textContent).toContain('BLUE');
    expect([...laserRoute.querySelectorAll('button')].find((chip) => chip.textContent?.trim() === '雕刻')?.getAttribute('aria-pressed')).toBe('false');
    expect(mocks.getPurchaseSheet).toHaveBeenCalledOnce();
  });

  it('blocks accepting stale route drafts after a saved configuration fails to refresh and allows retry', async () => {
    mocks.perms.splice(0, mocks.perms.length, 'fdmgongchang:production-order:handle');
    const purchase: Api.Order = { ...order, sourceType: 'PURCHASE_ORDER' };
    mocks.factoryPage.mockResolvedValue({ list: [purchase], total: 1 });
    mocks.get.mockResolvedValue(purchase);
    mocks.supplyMatch.mockResolvedValue([]);
    mocks.materialPlan.mockResolvedValue({ items: [], orderId: 9, orderNo: order.orderNo, shortage: false, totals: [] });
    unmount = mount(); await flush(); button('去接单').click(); await flush();
    button('修改参数与工艺').click(); await flush();
    mocks.get.mockRejectedValueOnce(new Error('网络暂不可用'));
    document.querySelector<HTMLButtonElement>('#save-order-config-test')!.click(); await flush();
    expect(document.body.textContent).toContain('参数已保存，订单刷新失败');
    expect(button('接单').disabled).toBe(true);
    button('接单').click(); await flush();
    expect(mocks.accept).not.toHaveBeenCalled();
    mocks.get.mockResolvedValue({ ...purchase, items: [{ ...purchase.items[0]!, ...confirmedParameters, processes: ['SLICE', 'PUNCH', 'FOLD', 'PACK'] }] });
    button('重新加载已保存参数').click(); await flush();
    expect(button('接单').disabled).toBe(false);
    button('接单').click(); await flush();
    expect(mocks.accept).toHaveBeenCalledWith(expect.objectContaining({ routes: [
      { itemId: 91, routeId: 3, steps: ['SLICE', 'PUNCH', 'FOLD', 'PACK'] },
    ] }));
  });

  it('blocks acceptance with unconfirmed parameters and opens the editor, then accepts after saved parameters refresh', async () => {
    mocks.perms.splice(0, mocks.perms.length, 'fdmgongchang:production-order:handle');
    mocks.factoryPage.mockResolvedValue({ list: [order], total: 1 }); mocks.get.mockResolvedValue(order);
    mocks.supplyMatch.mockResolvedValue([]);
    mocks.materialPlan.mockResolvedValue({ items: [], orderId: 9, orderNo: order.orderNo, shortage: false, totals: [] });
    unmount = mount(); await flush(); button('去接单').click(); await flush();
    expect(document.body.textContent).toContain('1 个产品尚未完整确认生产参数');
    button('接单').click(); await flush();
    expect(mocks.accept).not.toHaveBeenCalled();
    expect(document.querySelector('#save-order-config-test')?.textContent).toContain('9/91');
    mocks.get.mockResolvedValue({ ...order, items: order.items.map((item) => ({ ...item, ...confirmedParameters })) });
    document.querySelector<HTMLButtonElement>('#save-order-config-test')!.click(); await flush();
    expect(document.querySelector<HTMLInputElement>('#po-promised input')?.value || document.querySelector<HTMLInputElement>('#po-promised')?.value).toBe('2026-10-20');
    button('接单').click(); await flush();
    expect(mocks.accept).toHaveBeenCalledWith(expect.objectContaining({ id: 9, promisedDate: '2026-10-20' }));
  });

  it('checks the impact of a missed process before release and refreshes the order route', async () => {
    mocks.perms.splice(0, mocks.perms.length, 'fdmgongchang:production-order:handle', 'fdmgongchang:schedule:confirm');
    const existingRoute = ['SLICE', 'PUNCH', 'FOLD'];
    const proposedRoute = ['SLICE', 'PUNCH', 'ENGRAVE', 'FOLD'];
    const accepted: Api.Order = { ...order, status: 'ACCEPTED', statusLabel: '生产中', items: [
      { ...order.items[0]!, ...confirmedParameters, processes: existingRoute },
    ] };
    mocks.factoryPage.mockResolvedValue({ list: [accepted], total: 1 });
    mocks.get.mockResolvedValue(accepted);
    mocks.materialPlan.mockResolvedValue({ items: [], orderId: 9, orderNo: order.orderNo, shortage: false, totals: [] });
    const preview = { adjustedTaskIds: [61], canRelease: true, errors: [], existingRoute, previewKey: 'current', proposedRoute, quantity: 500 };
    mocks.previewSupplement.mockResolvedValueOnce({ ...preview, canRelease: false, errors: ['后道任务 #61 已领料开工，请先核对'] }).mockResolvedValue(preview);
    mocks.releaseSupplement.mockRejectedValueOnce(new Error('网络暂不可用')).mockResolvedValue({ scheduleId: 18, taskId: 72, taskIds: [72] });
    unmount = mount(); await flush(); button('查看').click(); await flush(); button('补工序').click(); await flush();

    const select = async (id: string, label: string) => {
      document.querySelector(`#${id}`)!.closest('.ant-select')!.querySelector('.ant-select-selector')!
        .dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
      await flush();
      [...document.querySelectorAll<HTMLElement>('.ant-select-item-option')].find((option) => option.getAttribute('title') === label)!.click();
      await flush();
    };
    await select('route-supplement-process', '雕刻');
    const fill = (selector: string, value: string) => {
      const input = document.querySelector<HTMLInputElement | HTMLTextAreaElement>(selector)!;
      input.value = value;
      input.dispatchEvent(new Event('input', { bubbles: true }));
    };
    fill('#route-supplement-reason', '拆分时漏选雕刻'); await flush();
    expect(button('预览影响').disabled).toBe(true);
    fill('#route-supplement-folding', '八折'); await flush();
    expect(button('预览影响').disabled).toBe(false);
    expect(document.querySelector('#route-supplement-pattern')).toBeNull();
    button('预览影响').click(); await flush();
    expect(document.body.textContent).toContain('后道任务 #61 已领料开工');
    expect(button('确认补发').disabled).toBe(true);
    expect(mocks.releaseSupplement).not.toHaveBeenCalled();

    button('预览影响').click(); await flush();
    expect(document.body.textContent).toContain('开片 → 冲裁 → 雕刻 → 折叠');
    expect(document.body.textContent).toContain('会更新的原任务 #61');
    expect(button('确认补发').disabled).toBe(false);
    fill('#route-supplement-reason', '车间核对后道尚未加工'); await flush();
    expect(button('确认补发').disabled).toBe(true);
    button('预览影响').click(); await flush();
    const item = accepted.items[0]!;
    mocks.get.mockResolvedValue({ ...accepted, items: [{
      ...item, processes: proposedRoute, targetFoldingType: '八折', steps: [
        ...item.steps!,
        { defectQuantity: 0, goodQuantity: 0, inProgressCount: 0, label: '雕刻', orderCount: 0, outputStage: 'ENGRAVED', planned: true, process: 'ENGRAVE', unit: '件' },
      ],
    }] });
    button('确认补发').click(); await flush();
    expect(document.body.textContent).toContain('可再次点「确认补发」核对本次提交结果');
    button('确认补发').click(); await flush();
    expect(mocks.releaseSupplement).toHaveBeenCalledTimes(2);
    expect(mocks.releaseSupplement.mock.calls[0]).toEqual(mocks.releaseSupplement.mock.calls[1]);
    expect(mocks.releaseSupplement).toHaveBeenLastCalledWith(1, {
      foldingType: '八折', itemId: 91, previewKey: 'current', process: 'ENGRAVE', quantity: 500, reason: '车间核对后道尚未加工',
    });
    expect(mocks.get).toHaveBeenCalledTimes(2);
    expect(document.querySelector('.factory-dialog-panel .ant-modal-body')?.textContent).toContain('雕刻');
  });
});
