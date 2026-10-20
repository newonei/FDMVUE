import type { FdmgongchangStageStockApi as StockApi } from '#/api/fdmgongchang/stage-stock';
import type { FdmgongchangWorkbenchApi as Api } from '#/api/fdmgongchang/workbench';

import { createApp, nextTick } from 'vue';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import WorkbenchPage from './index.vue';

const mocks = vi.hoisted(() => ({
  claim: vi.fn(),
  create: vi.fn(),
  prepare: vi.fn(),
  pickList: vi.fn(),
  report: vi.fn(),
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
// 领料单照片：点一下就当作上传好了一张
vi.mock('#/components/upload/image-upload.vue', async () => {
  const { defineComponent, h } = await import('vue');
  return {
    default: defineComponent({
      emits: ['update:value'],
      setup(_, { emit }) {
        return () => h('button', { onClick: () => emit('update:value', ['https://f/sheet.jpg']), type: 'button' }, '模拟拍照');
      },
    }),
  };
});
vi.mock('#/api/fdmgongchang/workbench', () => ({
  claimWorkbenchTask: mocks.claim,
  createWorkbenchOrder: mocks.create,
  getWorkbench: mocks.my,
  getWorkbenchMates: vi.fn().mockResolvedValue([]),
  getWorkbenchOptions: mocks.options,
  getWorkbenchOrder: mocks.order,
  getWorkbenchRecipePlan: mocks.plan,
  getWorkbenchStock: mocks.stock,
  getWorkbenchPickList: mocks.pickList,
  matchWorkbenchWage: vi.fn().mockResolvedValue([]),
  prepareWorkbenchTask: mocks.prepare,
  releaseWorkbenchTask: vi.fn(),
  reportWorkbenchOrder: vi.fn(),
  reportWorkbenchTask: mocks.report,
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
  hall: [
    {
      actualQuantity: 0,
      available: 300,
      contractCode: 'HT-002',
      id: 32,
      orderCount: 0,
      process: 'SLICE',
      product: '蓝色瑜伽垫',
      quantity: 400,
      scheduleId: 9,
      sequence: 2,
      status: 'OPEN',
      unit: '片',
      workDate: '2026-10-11',
    },
    {
      actualQuantity: 0,
      contractCode: 'HT-003',
      id: 33,
      lockReason: '等上道「密炼挤出发泡」报工后才能接',
      orderCount: 0,
      process: 'SLICE',
      product: '绿色瑜伽垫',
      quantity: 100,
      scheduleId: 9,
      sequence: 3,
      status: 'OPEN',
      unit: '片',
      workDate: '2026-10-11',
    },
  ],
  tasks: [
    {
      actualQuantity: 0,
      contractCode: 'HT-001',
      id: 31,
      orderCount: 0,
      process: 'SLICE',
      product: '紫色瑜伽垫',
      quantity: 400,
      scheduleId: 9,
      sequence: 1,
      status: 'CLAIMED',
      unit: '片',
      reason: '先做这单，交期近',
      workDate: '2026-10-11',
      workerNames: '张三',
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

/** 在 InputNumber 里输入数字。 */
function fill(id: string, value: number) {
  const input = document.querySelector<HTMLInputElement>(`#${id}`);
  if (!input) throw new Error(`找不到输入框：${id}`);
  input.value = String(value);
  input.dispatchEvent(new Event('input', { bubbles: true }));
  input.dispatchEvent(new Event('change', { bubbles: true }));
}

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
    mocks.pickList.mockResolvedValue([]);
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

  it('reports a task in one go: actual material, output, piecework and the paper issue sheet', async () => {
    mocks.prepare.mockResolvedValue({
      aux: [],
      picks: [{ quantity: 50, stock: { batchNo: 'MB261007-01', id: 11, item: { color: 'PU', length: 190, material: 'TPE', thickness: 4.8, width: 130 }, itemCode: 'BC-1', location: '板材区', quantity: 180, stage: 'BOARD' } }],
      required: 50,
      sourceStage: 'BOARD',
      target: 'TPE · 紫色 · 183×61×0.6cm',
      targetAttrs: { color: 'PU', length: 183, material: 'TPE', thickness: 0.6, width: 61 },
      task: my.tasks[0],
    });
    mocks.report.mockResolvedValue(70);
    mocks.pickList.mockResolvedValue([{
      aux: [],
      picks: [{ quantity: 50, stock: { batchNo: 'MB261007-01', id: 11, item: { color: 'PU', length: 190, material: 'TPE', thickness: 4.8, width: 130 }, itemCode: 'BC-1', location: '板材区', quantity: 180, stage: 'BOARD' } }],
      task: my.tasks[0],
    }]);
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
    // 只有我的任务和任务大厅；任务卡片写清楚做什么、领什么料
    expect(text).toContain('HT-001');
    expect(text).toContain('先做这单，交期近');
    expect(text).toContain('批次 MB261007-01 · 板材区');
    expect(text).not.toContain('自己开单');
    expect(text).not.toContain('我手上在做的');
    expect(text).not.toContain('领料清单');

    clickButton('做完了，报工');
    await flush();
    expect(mocks.prepare).toHaveBeenCalledWith(31);
    expect(document.body.textContent).toContain('开片 · 第 1 步 实际领了多少料');
    expect(document.body.textContent).toContain('系统按任务算好要领 50 张');
    // 对照实际：多领了 2 张
    fill('pick-11', 52);
    await flush();
    clickButton('下一步：报数量');
    await flush();
    expect(mocks.create).not.toHaveBeenCalled();
    // 产出行的编号是自动生成的，取第一行
    fill(document.querySelector('[id^="good-"]')!.id, 380);
    fill(document.querySelector('[id^="bad-"]')!.id, 6);
    await flush();
    clickButton('下一步');
    await flush();
    expect(document.body.textContent).toContain('计件和领料单');
    clickButton('报工');
    await flush();
    expect(mocks.report).not.toHaveBeenCalled();
    clickButton('模拟拍照');
    await flush();
    clickButton('报工');
    await flush();
    expect(mocks.report).toHaveBeenCalledWith(
      expect.objectContaining({
        inputs: [{ laminationSide: undefined, quantity: 52, stockId: 11 }],
        issueSheetUrls: ['https://f/sheet.jpg'],
        // 片材规格按订单带出：长宽同板材，厚度是成品厚
        outputs: [expect.objectContaining({ attrs: expect.objectContaining({ length: 190, thickness: 0.6, width: 130 }), defectQuantity: 6, goodQuantity: 380 })],
        sourceStage: 'BOARD',
        taskId: 31,
      }),
    );
    expect(document.body.textContent).toContain('报工好了');
    expect(document.body.textContent).not.toContain('再领一批料');
  });

  it('claims an open task from the hall; tasks waiting for the upstream cannot be claimed', async () => {
    mocks.claim.mockResolvedValue(true);
    const host = document.createElement('div');
    document.body.append(host);
    const app = createApp(WorkbenchPage);
    app.mount(host);
    unmount = () => app.unmount();
    await flush();

    clickButton('任务大厅1');
    await flush();
    const text = document.body.textContent ?? '';
    expect(text).toContain('订单 HT-002');
    expect(text).toContain('上道已报，现在能做 300');
    expect(text).toContain('等上道「密炼挤出发泡」报工后才能接');
    const buttons = [...document.querySelectorAll('button')].filter((b) => b.textContent?.trim() === '接单');
    expect(buttons).toHaveLength(2);
    expect(buttons[1]!.disabled).toBe(true);
    buttons[0]!.click();
    await flush();
    expect(mocks.claim).toHaveBeenCalledWith(32);
    expect(mocks.my).toHaveBeenCalledTimes(2);
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
    const mixTask = { ...my.tasks[0]!, id: 41, process: 'MIX', product: '紫色板材', unit: '张' };
    mocks.my.mockResolvedValue({
      ...my,
      inProgress: [],
      processes: [
        { code: 'MIX', label: '密炼', outputLabel: '板材', outputStage: 'BOARD', outputUnit: '张', sources: ['RAW'] },
      ],
      tasks: [mixTask],
    });
    mocks.prepare.mockResolvedValue({ aux: [], picks: [], sourceStage: 'RAW', task: mixTask });
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

    clickButton('做完了，报工');
    await flush();
    expect(mocks.stock).toHaveBeenCalledWith('RAW');
    // 只有一个配方时直接选上
    clickButton('按配方带出要领的料');
    await flush();
    expect(mocks.plan).toHaveBeenCalledWith({ batches: 1, recipeCode: 'REC-001' });
    // 配方对照表：每种原料配方要多少、本次领多少、库存缺多少
    const recipeRow = [...document.querySelectorAll('tr')].find((r) => r.textContent?.includes('EVA') && r.textContent.includes('10 kg'));
    expect(recipeRow?.textContent?.replaceAll(/\s/g, '')).toContain('EVA10kg3kg7kg');
    clickButton('下一步：报数量');
    await flush();
    // 领料和报工一起提交：报数量这一步带着按配方领的料
    const text = document.body.textContent?.replaceAll(/\s/g, '') ?? '';
    expect(text).toContain('领了TPE20·EVA3·紫色母1kg');
    expect(text).toContain('TPE·常规款按领的料自动带出');
  });

  it('picks more than one kind of material by tapping several cards', async () => {
    mocks.prepare.mockResolvedValue({ aux: [], picks: [], sourceStage: 'BOARD', task: my.tasks[0] });
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

    clickButton('做完了，报工');
    await flush();
    const cards = [...document.querySelectorAll('button')].filter((b) => b.textContent?.includes('批次 B'));
    cards[0]!.click();
    await flush();
    cards[1]!.click();
    await flush();
    fill('pick-11', 100);
    fill('pick-12', 40);
    await flush();
    clickButton('下一步：报数量');
    await flush();
    expect(document.body.textContent?.replaceAll(/\s/g, '')).toContain('领了TPE·紫色100·TPE·紫色40张');
  });
});
