import type { FdmgongchangStageStockApi as StockApi } from '#/api/fdmgongchang/stage-stock';
import type { FdmgongchangWorkbenchApi as Api } from '#/api/fdmgongchang/workbench';

import { createApp, nextTick } from 'vue';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import WorkbenchPage from './index.vue';

const mocks = vi.hoisted(() => ({
  create: vi.fn(),
  my: vi.fn(),
  options: vi.fn(),
  order: vi.fn(),
  plan: vi.fn(),
  stock: vi.fn(),
  supplement: vi.fn(),
}));
vi.mock('#/api/fdmgongchang/factory', () => ({
  getMyFactories: vi.fn().mockResolvedValue({
    canSeeAll: false,
    defaultFactoryId: 1,
    factories: [{ code: 'HBFDM', deptId: 118, id: 1, name: '黄石工厂' }],
  }),
  setCurrentFactoryId: vi.fn(),
}));
vi.mock('#/api/fdmgongchang/workbench', () => ({
  createWorkbenchOrder: mocks.create,
  getWorkbench: mocks.my,
  getWorkbenchMates: vi.fn().mockResolvedValue([]),
  getWorkbenchOptions: mocks.options,
  getWorkbenchOrder: mocks.order,
  getWorkbenchRecipePlan: mocks.plan,
  getWorkbenchStock: mocks.stock,
  matchWorkbenchWage: vi.fn().mockResolvedValue([]),
  reportWorkbenchOrder: vi.fn(),
  returnWorkbenchMaterial: vi.fn(),
  supplementWorkbenchOrder: mocks.supplement,
}));

const options = {
  colors: [{ label: '紫色', value: 'PU' }],
  materials: [{ label: 'TPE', value: 'TPE' }],
  patterns: [],
  processes: [],
  rawMaterials: [],
  recipes: [{ code: 'REC-001', enabled: true, name: '常规款' }],
  stages: [
    { code: 'RAW', defaultLocation: '原料仓', label: '原材料', unit: 'kg' },
    { code: 'BOARD', defaultLocation: '板材区', label: '板材', unit: '张' },
    { code: 'SHEET', defaultLocation: '片材区', label: '片材', unit: '片' },
  ],
  textures: [],
} as StockApi.Options;

const my: Api.My = {
  factoryName: '黄石工厂',
  inProgress: [
    {
      goodQuantity: 0,
      id: 5,
      inputQuantity: 120,
      inputUnit: '张',
      issuedAt: '2026-10-11 08:12:00',
      orderNo: 'GX20261011-001',
      outputStage: 'SHEET',
      process: 'SLICE',
      reportCount: 0,
      sourceStage: 'BOARD',
    },
  ],
  processes: [
    {
      code: 'SLICE',
      label: '开片',
      outputLabel: '片材',
      outputStage: 'SHEET',
      outputUnit: '片',
      sources: ['BOARD'],
    },
  ],
  tasks: [
    {
      actualQuantity: 236,
      contractCode: 'HT-001',
      id: 31,
      orderCount: 1,
      process: 'SLICE',
      product: '紫色瑜伽垫',
      quantity: 400,
      scheduleId: 9,
      sequence: 1,
      unit: '片',
      workDate: '2026-10-11',
    },
  ],
  team: '开片一组',
  today: '2026-10-11',
  todayAmount: 63.72,
  userId: 2,
  userName: '张三',
};

const flush = async () => {
  for (let i = 0; i < 10; i++) {
    await Promise.resolve();
    await nextTick();
  }
};

function clickButton(text: string) {
  const el = [...document.querySelectorAll('button')].find((b) =>
    b.textContent?.replaceAll(/\s/g, '').includes(text),
  );
  if (!el) throw new Error(`找不到按钮：${text}`);
  el.click();
}

describe('workbench page', () => {
  let unmount: (() => void) | undefined;
  beforeEach(() => {
    mocks.my.mockResolvedValue(my);
    mocks.options.mockResolvedValue(options);
    mocks.create.mockResolvedValue(7);
    mocks.stock.mockResolvedValue({
      list: [
        {
          batchNo: 'MB261007-01',
          id: 11,
          item: { color: 'PU', length: 190, material: 'TPE', recipeCode: 'REC-001', thickness: 0.3, width: 130 },
          itemCode: 'BC-TPE-REC001-PU-190X130X0.3',
          itemId: 1,
          location: '板材区',
          quantity: 180,
          stage: 'BOARD',
        },
      ],
      total: 1,
    });
  });
  afterEach(() => {
    unmount?.();
    document.body.innerHTML = '';
    vi.clearAllMocks();
  });

  it('shows today for the worker and issues material for an assigned task', async () => {
    const host = document.createElement('div');
    document.body.append(host);
    const app = createApp(WorkbenchPage);
    app.mount(host);
    unmount = () => app.unmount();
    await flush();

    const text = document.body.textContent ?? '';
    expect(text).toContain('张三');
    expect(text).toContain('我的岗位：开片');
    expect(text).toContain('¥63.72');
    expect(text).toContain('订单 HT-001');
    expect(text).toContain('已领 120 张板材');

    clickButton('接着做这个活');
    await flush();
    expect(mocks.stock).toHaveBeenCalledWith('BOARD');
    expect(document.body.textContent).toContain('开片 · 第 1 步 领材料');
    clickButton('紫色');
    await flush();
    clickButton('下一步');
    await flush();
    expect(document.body.textContent).toContain('100 张');
    clickButton('确认领料，去干活');
    await flush();
    expect(mocks.create).toHaveBeenCalledWith(
      expect.objectContaining({
        finish: false,
        inputs: [{ laminationSide: undefined, quantity: 100, stockId: 11 }],
        process: 'SLICE',
        scheduleTaskId: 31,
        sourceStage: 'BOARD',
      }),
    );
    expect(document.body.textContent).toContain('领好了');
  });

  it('lets a worker add the material they ran short of to the order in hand', async () => {
    mocks.order.mockResolvedValue({
      id: 5,
      inputs: [],
      orderNo: 'GX20261011-001',
      process: 'SLICE',
      sourceStage: 'BOARD',
      status: 'IN_PROGRESS',
    });
    mocks.supplement.mockResolvedValue(true);
    const host = document.createElement('div');
    document.body.append(host);
    const app = createApp(WorkbenchPage);
    app.mount(host);
    unmount = () => app.unmount();
    await flush();

    clickButton('料不够，补领');
    await flush();
    expect(mocks.order).toHaveBeenCalledWith(5);
    expect(document.body.textContent).toContain('开片 · 第 1 步 补领');
    clickButton('紫色');
    await flush();
    clickButton('下一步');
    await flush();
    expect(document.body.textContent).toContain('补到 GX20261011-001');
    expect(document.body.textContent).not.toContain('已经做完了，领料同时报数量');
    clickButton('确认补领，接着干活');
    await flush();
    expect(mocks.create).not.toHaveBeenCalled();
    expect(mocks.supplement).toHaveBeenCalledWith({
      id: 5,
      inputs: [{ laminationSide: undefined, quantity: 100, stockId: 11 }],
    });
    expect(document.body.textContent).toContain('补好了');
  });

  it('issues every raw material of a recipe in one go for mixing', async () => {
    const raw = (id: number, code: string, name: string, quantity: number) => ({
      batchNo: `R${id}`,
      id,
      item: { rawMaterialCode: code, rawMaterialName: name },
      itemCode: `YL-${code}`,
      itemId: id,
      location: '原料仓',
      quantity,
      stage: 'RAW',
    });
    mocks.my.mockResolvedValue({
      ...my,
      inProgress: [],
      processes: [
        { code: 'MIX', label: '密炼', outputLabel: '板材', outputStage: 'BOARD', outputUnit: '张', sources: ['RAW'] },
      ],
      tasks: [],
    });
    mocks.stock.mockResolvedValue({
      list: [raw(21, 'MAT-TPE', 'TPE', 500), raw(22, 'MAT-EVA', 'EVA', 3), raw(23, 'MAT-CM', '紫色母', 9)],
      total: 3,
    });
    mocks.plan.mockResolvedValue({
      batches: 2,
      batchWeight: 15.5,
      lines: [
        { available: 500, issued: 0, perBatch: 10, picks: [{ available: 500, batchNo: 'R21', itemCode: 'YL-MAT-TPE', location: '原料仓', quantity: 20, stockId: 21 }], rawMaterialCode: 'MAT-TPE', rawMaterialName: 'TPE', remaining: 20, required: 20, shortage: 0 },
        { available: 3, issued: 0, perBatch: 5, picks: [{ available: 3, batchNo: 'R22', itemCode: 'YL-MAT-EVA', location: '原料仓', quantity: 3, stockId: 22 }], rawMaterialCode: 'MAT-EVA', rawMaterialName: 'EVA', remaining: 10, required: 10, shortage: 7 },
        { available: 9, issued: 0, perBatch: 0.5, picks: [{ available: 9, batchNo: 'R23', itemCode: 'YL-MAT-CM', location: '原料仓', quantity: 1, stockId: 23 }], rawMaterialCode: 'MAT-CM', rawMaterialName: '紫色母', remaining: 1, required: 1, shortage: 0 },
      ],
      recipeCode: 'REC-001',
      recipeEnabled: true,
      recipeName: '常规款',
      requiredTotal: 31,
      shortage: true,
    });
    const host = document.createElement('div');
    document.body.append(host);
    const app = createApp(WorkbenchPage);
    app.mount(host);
    unmount = () => app.unmount();
    await flush();

    clickButton('自己开单');
    await flush();
    expect(mocks.stock).toHaveBeenCalledWith('RAW');
    clickButton('常规款');
    await flush();
    clickButton('按配方带出要领的料');
    await flush();
    expect(mocks.plan).toHaveBeenCalledWith({ batches: 1, recipeCode: 'REC-001' });
    expect(document.body.textContent).toContain('EVA 还缺 7 kg');
    clickButton('下一步');
    await flush();
    clickButton('确认领料，去干活');
    await flush();
    expect(mocks.create).toHaveBeenCalledWith(
      expect.objectContaining({
        inputs: [
          { laminationSide: undefined, quantity: 20, stockId: 21 },
          { laminationSide: undefined, quantity: 3, stockId: 22 },
          { laminationSide: undefined, quantity: 1, stockId: 23 },
        ],
        process: 'MIX',
        recipeBatches: 1,
        recipeCode: 'REC-001',
        sourceStage: 'RAW',
      }),
    );
  });

  it('picks more than one kind of material by tapping several cards', async () => {
    mocks.stock.mockResolvedValue({
      list: [
        { batchNo: 'B1', id: 11, item: { color: 'PU', material: 'TPE' }, itemCode: 'BC-1', itemId: 1, location: '板材区', quantity: 180, stage: 'BOARD' },
        { batchNo: 'B2', id: 12, item: { color: 'PU', material: 'TPE' }, itemCode: 'BC-2', itemId: 2, location: '板材区', quantity: 40, stage: 'BOARD' },
      ],
      total: 2,
    });
    const host = document.createElement('div');
    document.body.append(host);
    const app = createApp(WorkbenchPage);
    app.mount(host);
    unmount = () => app.unmount();
    await flush();

    clickButton('接着做这个活');
    await flush();
    const cards = [...document.querySelectorAll('button')].filter((b) => b.textContent?.includes('批次 B'));
    cards[0]!.click();
    await flush();
    cards[1]!.click();
    await flush();
    clickButton('下一步');
    await flush();
    clickButton('确认领料，去干活');
    await flush();
    expect(mocks.create).toHaveBeenCalledWith(
      expect.objectContaining({
        inputs: [
          { laminationSide: undefined, quantity: 100, stockId: 11 },
          { laminationSide: undefined, quantity: 40, stockId: 12 },
        ],
      }),
    );
  });
});
