import type { FdmgongchangStageStockApi as StockApi } from '#/api/fdmgongchang/stage-stock';
import type { FdmgongchangWorkbenchApi as Api } from '#/api/fdmgongchang/workbench';

import { createApp, nextTick } from 'vue';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import WorkbenchPage from './index.vue';

const mocks = vi.hoisted(() => ({
  create: vi.fn(),
  my: vi.fn(),
  options: vi.fn(),
  stock: vi.fn(),
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
  getWorkbenchOrder: vi.fn(),
  getWorkbenchStock: mocks.stock,
  matchWorkbenchWage: vi.fn().mockResolvedValue([]),
  reportWorkbenchOrder: vi.fn(),
  returnWorkbenchMaterial: vi.fn(),
}));

const options = {
  colors: [{ label: '紫色', value: 'PU' }],
  materials: [{ label: 'TPE', value: 'TPE' }],
  patterns: [],
  processes: [],
  rawMaterials: [],
  recipes: [{ code: 'REC-001', enabled: true, name: '常规款' }],
  stages: [
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
});
