import type { FdmgongchangStageStockApi as Api } from '#/api/fdmgongchang/stage-stock';

import { createApp, defineComponent, h, nextTick } from 'vue';

import { afterEach, describe, expect, it, vi } from 'vitest';

import StageStockPage from './index.vue';

const mocks = vi.hoisted(() => ({
  defect: vi.fn(),
  makeTasks: vi.fn(),
  myFactories: vi.fn().mockResolvedValue({
    canSeeAll: true,
    defaultFactoryId: 2,
    factories: [
      { code: 'HBFDM', deptId: 118, id: 1, name: '湖北飞德慕' },
      { code: 'LYJZ', deptId: 120, id: 2, name: '洛阳京造' },
    ],
  }),
  setFactory: vi.fn(),
  route: { query: {} as Record<string, string> },
  shipmentPage: vi.fn(),
  shippable: vi.fn(),
  options: vi.fn(),
  orderPage: vi.fn(),
  rawLines: vi.fn(),
  receiptPage: vi.fn(),
  receiveRaw: vi.fn(),
  receiveTrade: vi.fn(),
  setting: vi.fn(),
  tradeLines: vi.fn(),
  stockPage: vi.fn(),
  summary: vi.fn(),
  txnPage: vi.fn(),
}));
vi.mock('#/api/fdmgongchang/stage-stock', () => ({
  createOrder: vi.fn(),
  createShipment: vi.fn(),
  getMakeTasks: mocks.makeTasks,
  getShipmentPage: mocks.shipmentPage,
  getShippableItems: mocks.shippable,
  getDefectStats: mocks.defect,
  getOrder: vi.fn(),
  getOrderOperators: vi.fn().mockResolvedValue([]),
  getOrderPage: mocks.orderPage,
  getRawOpenLines: mocks.rawLines,
  getReceiptPage: mocks.receiptPage,
  getTradeOpenLines: mocks.tradeLines,
  getStageStockOptions: mocks.options,
  getStageStockSetting: mocks.setting,
  getStageStockSummary: mocks.summary,
  getStockPage: mocks.stockPage,
  getTxnPage: mocks.txnPage,
  previewItemCodes: vi.fn().mockResolvedValue([]),
  receiveRawPurchase: mocks.receiveRaw,
  receiveStock: vi.fn(),
  receiveTradePurchase: mocks.receiveTrade,
  reportOrder: vi.fn(),
  returnOrderMaterial: vi.fn(),
  saveStageStockSetting: vi.fn(),
  stocktake: vi.fn(),
  voidOrder: vi.fn(),
}));
vi.mock('#/api/fdmgongchang/factory', () => ({
  getMyFactories: mocks.myFactories,
  setCurrentFactoryId: mocks.setFactory,
}));
vi.mock('@vben/stores', () => ({ useUserStore: () => ({ userInfo: { id: 1 } }) }));
vi.mock('vue-router', () => ({ useRoute: () => mocks.route }));
vi.mock('@vben/access', () => ({ useAccess: () => ({ hasAccessByCodes: () => true }) }));
vi.mock('@vben/common-ui', () => ({
  Page: defineComponent({ setup: (_, ctx) => () => h('main', ctx.slots.default?.()) }),
}));

const stages = [
  ['RAW', '原材料', 'kg'],
  ['BOARD', '板材', '张'],
  ['SHEET', '片材', '片'],
  ['LAMINATED', '已贴合片材', '片'],
  ['EMBOSSED', '已压花片材', '片'],
  ['PUNCHED', '已冲裁成品', '件'],
  ['ENGRAVED', '已雕刻成品', '件'],
  ['FOLDED', '已折叠成品', '件'],
  ['PACKED', '已包装成品', '件'],
] as const;
const processes = [
  ['MIX', '密炼挤出发泡', 'BOARD', ['RAW']],
  ['SLICE', '开片', 'SHEET', ['BOARD']],
  ['LAMINATE', '贴合', 'LAMINATED', ['SHEET']],
  ['EMBOSS', '压花', 'EMBOSSED', ['LAMINATED', 'SHEET']],
  ['PUNCH', '冲裁', 'PUNCHED', ['EMBOSSED', 'LAMINATED', 'SHEET']],
  ['ENGRAVE', '雕刻', 'ENGRAVED', ['PUNCHED']],
  ['FOLD', '折叠', 'FOLDED', ['ENGRAVED', 'PUNCHED']],
  ['PACK', '包装', 'PACKED', ['FOLDED', 'ENGRAVED', 'PUNCHED']],
] as const;

const options: Api.Options = {
  colors: [{ label: '紫色', value: 'PU' }],
  materials: [{ label: 'TPE', value: 'TPE' }],
  patterns: [],
  processes: processes.map(([code, label, outputStage, sources]) => ({
    allowedSources: [...sources],
    code,
    label,
    outputStage,
    sources: [...sources],
  })),
  rawMaterials: [{ category: 'MAIN', code: 'MAT-TPE', enabled: false, name: 'TPE' }],
  recipes: [{ code: 'REC-001', enabled: true, name: '常规款（密度110）' }],
  stages: stages.map(([code, label, unit]) => ({ code, defaultLocation: `${label}区`, label, unit })),
  textures: [{ label: '贝壳纹', value: 'SH' }],
};

const rawLine: Api.RawOpenLine = {
  expectedDate: [2026, 10, 20],
  lineId: 11,
  orderDate: [2026, 10, 8],
  purchaseId: 7,
  purchaseNo: 'CG20261008-001',
  quantity: 1000,
  rawCategory: 'MAIN',
  rawMaterialCode: 'MAT-TPE',
  rawMaterialName: 'TPE粒子',
  receivedQuantity: 600,
  remainingQuantity: 400,
  supplierName: '东莞原料厂',
};
const tradeLine: Api.TradePurchaseLine = {
  arrivedQuantity: 0,
  color: '紫色',
  contractCode: 'HT-20261008-002',
  contractId: 'c2',
  contractItemId: 'i2',
  customerName: '美国客户',
  material: 'TPE',
  orderCode: 'PO-001',
  orderId: 'o1',
  orderLineId: 'ol1',
  productName: '外采瑜伽垫',
  quantity: 200,
  remainingQuantity: 200,
  size: '183x61x0.6',
  supplierName: '义乌垫子厂',
  unit: '张',
};

function mockEmptyPage() {
  mocks.options.mockResolvedValue(options);
  mocks.summary.mockResolvedValue({ processes: [], stages: [] });
  mocks.stockPage.mockResolvedValue({ list: [], total: 0 });
  mocks.orderPage.mockResolvedValue({ list: [], total: 0 });
  mocks.defect.mockResolvedValue([]);
  mocks.txnPage.mockResolvedValue({ list: [], total: 0 });
  mocks.makeTasks.mockResolvedValue([]);
  mocks.shippable.mockResolvedValue([]);
  mocks.shipmentPage.mockResolvedValue({ list: [], total: 0 });
  mocks.rawLines.mockResolvedValue([rawLine]);
  mocks.tradeLines.mockResolvedValue([tradeLine]);
  mocks.receiptPage.mockResolvedValue({ list: [], total: 0 });
}

function clickButton(text: string, root: ParentNode = document) {
  const el = [...root.querySelectorAll('button')].find((b) => b.textContent?.replaceAll(/\s/g, '') === text);
  if (!el) throw new Error(`找不到按钮：${text}`);
  el.click();
}

const flush = async () => {
  for (let i = 0; i < 8; i++) {
    await Promise.resolve();
    await nextTick();
  }
};

describe('stage stock page', () => {
  let unmount: (() => void) | undefined;
  afterEach(() => {
    unmount?.();
    document.body.innerHTML = '';
    vi.clearAllMocks();
  });

  it('renders the stage chain, the board stock and the other tabs without errors', async () => {
    const errors: unknown[] = [];
    mocks.options.mockResolvedValue(options);
    mocks.summary.mockResolvedValue({
      processes: [{ inProgressCount: 1, inProgressQuantity: 40, process: 'EMBOSS' }],
      stages: [{ quantity: 300, rowCount: 1, stage: 'BOARD' }],
    });
    mocks.stockPage.mockResolvedValue({
      list: [
        {
          batchNo: 'MB261007-01',
          id: 1,
          item: { color: 'PU', length: 190, material: 'TPE', recipeCode: 'REC-001', recipeName: '常规款（密度110）', thickness: 0.3, width: 130 },
          itemCode: 'BC-TPE-REC001-PU-190X130X0.3',
          itemId: 1,
          location: '板材区',
          quantity: 300,
          stage: 'BOARD',
        },
      ],
      total: 1,
    });
    mocks.orderPage.mockResolvedValue({
      list: [
        {
          defectQuantity: 0,
          goodQuantity: 0,
          id: 5,
          inputQuantity: 40,
          issuedAt: Date.now(),
          orderNo: 'GX20261007-004',
          outputStage: 'EMBOSSED',
          process: 'EMBOSS',
          sourceStage: 'LAMINATED',
          status: 'IN_PROGRESS',
        },
      ],
      total: 1,
    });
    mocks.defect.mockResolvedValue([{ defectQuantity: 3, goodQuantity: 147, orderCount: 1, process: 'EMBOSS' }]);
    mocks.txnPage.mockResolvedValue({ list: [], total: 0 });
    mocks.makeTasks.mockResolvedValue([
      {
        approvedQuantity: 100,
        assignmentId: 'a1',
        assignmentQuantity: 100,
        color: '丁香紫/灰',
        completedQuantity: 30,
        contractCode: 'HT-20261008-001',
        contractId: 'c1',
        contractItemId: 'i1',
        customerName: '美国客户',
        inProgressOrderCount: 1,
        itemQuantity: 100,
        linkedOrderCount: 2,
        productName: '紫灰双色瑜伽垫',
        ready: true,
        requiredDate: [2026, 11, 1],
        shippedQuantity: 0,
        unit: '张',
      },
    ]);
    mocks.shippable.mockResolvedValue([]);
    mocks.shipmentPage.mockResolvedValue({ list: [], total: 0 });
    mocks.rawLines.mockResolvedValue([rawLine]);
    mocks.tradeLines.mockResolvedValue([tradeLine]);
    mocks.receiptPage.mockResolvedValue({ list: [], total: 0 });
    mocks.setting.mockResolvedValue({
      processes: options.processes.map((p) => ({ process: p.code, sources: p.sources })),
      stages: options.stages.map((s) => ({ defaultLocation: s.defaultLocation, stage: s.code })),
    });

    const host = document.createElement('div');
    document.body.append(host);
    const app = createApp(StageStockPage);
    app.config.errorHandler = (err) => errors.push(err);
    app.config.warnHandler = (msg) => {
      if (!msg.includes('Extraneous non-props')) errors.push(msg);
    };
    app.mount(host);
    unmount = () => app.unmount();
    await flush();

    const text = document.body.textContent ?? '';
    expect(text).toContain('工序库存');
    expect(mocks.setFactory).toHaveBeenCalledWith(2);
    expect(document.querySelector('#factory-switch')).not.toBeNull();
    expect(text).toContain('已包装成品');
    expect(text).toContain('在制 40 片');
    expect(text).toContain('板材库存');
    expect(text).toContain('BC-TPE-REC001-PU-190X130X0.3');
    expect(text).toContain('TPE · 紫色 · 190×130×0.3 · 常规款（密度110）');
    expect(text).toContain('生产链');
    expect(text).toContain('1 在制');

    for (const tab of ['工序单', '外贸订单', '到货入库', '库存流水', '基础设置']) {
      const el = [...document.querySelectorAll('.ant-tabs-tab')].find((t) => t.textContent?.includes(tab));
      (el?.querySelector('.ant-tabs-tab-btn') as HTMLElement | null)?.click();
      await flush();
    }
    const after = document.body.textContent ?? '';
    expect(after).toContain('GX20261007-004');
    expect(after).toContain('HT-20261008-001');
    expect(after).toContain('2026-11-01');
    expect(after).toContain('生产中');
    expect(after).toContain('2.0%');
    expect(after).toContain('工序与领料来源');
    expect(after).toContain('2 待到');
    expect(after).toContain('CG20261008-001');
    expect(after).toContain('TPE粒子');
    expect(errors).toEqual([]);
  });

  it('receives a raw purchase line into raw stock and a bought product into packed stock from 到货入库', async () => {
    const errors: unknown[] = [];
    mockEmptyPage();
    mocks.receiveRaw.mockResolvedValue(1);
    mocks.receiveTrade.mockResolvedValue(2);
    mocks.route.query = { tab: 'receiving' };
    const host = document.createElement('div');
    document.body.append(host);
    const app = createApp(StageStockPage);
    app.config.errorHandler = (err) => errors.push(err);
    app.mount(host);
    unmount = () => app.unmount();
    await flush();

    expect(document.body.textContent).toContain('东莞原料厂');
    clickButton('收货', host);
    await flush();
    expect(document.body.textContent).toContain('原材料到货入库');
    clickButton('确认收货');
    await flush();
    expect(mocks.receiveRaw).toHaveBeenCalledWith(
      expect.objectContaining({ purchaseLineId: 11, quantity: 400 }),
    );
    expect(mocks.receiveRaw.mock.calls[0]![0].batchNo).toMatch(/^RM\d{4}$/);

    const trade = [...host.querySelectorAll('.ant-segmented-item')].find((el) => el.textContent?.includes('外采成品待到货'));
    (trade as HTMLElement).click();
    await flush();
    expect(host.textContent).toContain('义乌垫子厂');
    clickButton('收货', host);
    await flush();
    expect(document.body.textContent).toContain('外采成品到货入库');
    clickButton('确认收货');
    await flush();
    expect(mocks.receiveTrade).toHaveBeenCalledWith(
      expect.objectContaining({
        acceptedQuantity: 200,
        attrs: expect.objectContaining({ backColor: 'PU', frontColor: 'PU', length: 183, material: 'TPE', thickness: 0.6, width: 61 }),
        contractId: 'c2',
        orderId: 'o1',
        orderLineId: 'ol1',
        quantity: 200,
      }),
    );
    expect(errors).toEqual([]);
    mocks.route.query = {};
  });
});
