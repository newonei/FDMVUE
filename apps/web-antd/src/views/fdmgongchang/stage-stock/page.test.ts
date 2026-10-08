import type { FdmgongchangStageStockApi as Api } from '#/api/fdmgongchang/stage-stock';

import { createApp, defineComponent, h, nextTick } from 'vue';

import { afterEach, describe, expect, it, vi } from 'vitest';

import StageStockPage from './index.vue';

const mocks = vi.hoisted(() => ({
  defect: vi.fn(),
  makeTasks: vi.fn(),
  route: { query: {} as Record<string, string> },
  shipmentPage: vi.fn(),
  shippable: vi.fn(),
  options: vi.fn(),
  orderPage: vi.fn(),
  setting: vi.fn(),
  stockPage: vi.fn(),
  summary: vi.fn(),
  txnPage: vi.fn(),
}));
vi.mock('#/api/fdmgongchang/stage-stock', () => ({
  completeOrder: vi.fn(),
  createOrder: vi.fn(),
  createShipment: vi.fn(),
  getMakeTasks: mocks.makeTasks,
  getShipmentPage: mocks.shipmentPage,
  getShippableItems: mocks.shippable,
  getDefectStats: mocks.defect,
  getOrder: vi.fn(),
  getOrderPage: mocks.orderPage,
  getStageStockOptions: mocks.options,
  getStageStockSetting: mocks.setting,
  getStageStockSummary: mocks.summary,
  getStockPage: mocks.stockPage,
  getTxnPage: mocks.txnPage,
  previewItemCodes: vi.fn().mockResolvedValue([]),
  receiveStock: vi.fn(),
  saveStageStockSetting: vi.fn(),
  stocktake: vi.fn(),
}));
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
    expect(text).toContain('已包装成品');
    expect(text).toContain('在制 40 片');
    expect(text).toContain('板材库存');
    expect(text).toContain('BC-TPE-REC001-PU-190X130X0.3');
    expect(text).toContain('TPE · 紫色 · 190×130×0.3 · 常规款（密度110）');
    expect(text).toContain('生产链');
    expect(text).toContain('1 在制');

    for (const tab of ['工序单', '外贸订单', '库存流水', '基础设置']) {
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
    expect(errors).toEqual([]);
  });
});
