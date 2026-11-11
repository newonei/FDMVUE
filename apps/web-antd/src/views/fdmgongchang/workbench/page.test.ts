import type { FdmgongchangStageStockApi as StockApi } from '#/api/fdmgongchang/stage-stock';
import type { FdmgongchangWorkbenchApi as Api } from '#/api/fdmgongchang/workbench';

import { createApp, nextTick } from 'vue';

import { Modal } from 'ant-design-vue';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import WorkbenchPage from './index.vue';

const mocks = vi.hoisted(() => ({
  route: { query: {} as Record<string, string> },
  mates: vi.fn(),
  create: vi.fn(),
  issue: vi.fn(),
  prepare: vi.fn(),
  pickList: vi.fn(),
  report: vi.fn(),
  reportOrder: vi.fn(),
  my: vi.fn(),
  options: vi.fn(),
  order: vi.fn(),
  plan: vi.fn(),
  stock: vi.fn(),
  supplement: vi.fn(),
  wage: vi.fn(),
  returnMaterial: vi.fn(),
}));
vi.mock('vue-router', () => ({ useRoute: () => mocks.route }));
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
  createWorkbenchOrder: mocks.create,
  issueWorkbenchTask: mocks.issue,
  getWorkbench: mocks.my,
  getWorkbenchMates: mocks.mates,
  getWorkbenchOptions: mocks.options,
  getWorkbenchOrder: mocks.order,
  getWorkbenchRecipePlan: mocks.plan,
  getWorkbenchStock: mocks.stock,
  getWorkbenchPickList: mocks.pickList,
  matchWorkbenchWage: mocks.wage,
  prepareWorkbenchTask: mocks.prepare,
  reportWorkbenchOrder: mocks.reportOrder,
  reportWorkbenchTask: mocks.report,
  TASK_REPORTED_TODAY: 1_215_024_000,
  returnWorkbenchMaterial: mocks.returnMaterial,
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
    { code: 'SHEET', defaultLocation: '片材区', label: '已开片板材', unit: '片' },
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
      outputLabel: '已开片板材',
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
      upstreamNote: '上道「发泡」今天还没报工，照常领料干活，报工时账面可能暂时为负',
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
      inputs: [{ stage: 'BOARD', quantity: 50, unit: '张', attrs: { length: 190, width: 130, thickness: 4.8, color: 'PU', material: 'TPE' } }],
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

/** 在输入框里输入文字或数字。 */
function fill(id: string, value: number | string) {
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
  const board = { batchNo: 'MB261007-01', id: 11, item: { color: 'PU', length: 190, material: 'TPE', thickness: 4.8, width: 130 }, itemCode: 'BC-1', itemId: 1, location: '板材区', quantity: 180, stage: 'BOARD' };
  const plannedAttrs = { color: 'PU', length: 190, material: 'TPE', thickness: 4.8, width: 130 };
  const prepare = {
    aux: [], outputAttrs: plannedAttrs, outputLabel: '已开片板材', outputStage: 'SHEET', outputUnit: '片',
    picks: [{ quantity: 50, stock: board }], required: 50, sourceStage: 'BOARD', sourceStages: ['BOARD'],
    target: 'TPE · 紫色 · 183×61×0.6cm',
    targetAttrs: { color: 'PU', length: 183, material: 'TPE', thickness: 0.6, width: 61 },
    task: my.tasks[0],
  };
  const inProgress = { ...my.inProgress[0]!, scheduleTaskId: 31 };
  const order = {
    id: 5, orderNo: 'GX20261011-001', process: 'SLICE', sourceStage: 'BOARD', outputStage: 'SHEET',
    status: 'IN_PROGRESS', reportCount: 0, goodQuantity: 0, defectQuantity: 0, inputQuantity: 52,
    inputs: [{ id: 101, stockId: 11, itemId: board.itemId, batchNo: board.batchNo, item: board.item, itemCode: board.itemCode, location: board.location, quantity: 52, returnedQuantity: 0, stage: 'BOARD' }],
  };
  const mount = async () => {
    const host = document.createElement('div');
    document.body.append(host);
    const app = createApp(WorkbenchPage);
    app.mount(host);
    unmount = () => app.unmount();
    await flush();
  };
  beforeEach(() => {
    mocks.route.query = {};
    mocks.my.mockResolvedValue({ ...my, inProgress: [] });
    mocks.options.mockResolvedValue(options);
    mocks.create.mockResolvedValue(7);
    mocks.issue.mockResolvedValue(5);
    mocks.report.mockResolvedValue(5);
    mocks.pickList.mockResolvedValue([prepare]);
    mocks.prepare.mockResolvedValue(prepare);
    mocks.stock.mockResolvedValue({ list: [board], total: 1 });
    mocks.order.mockResolvedValue(order);
    mocks.wage.mockResolvedValue([{ itemId: 1, matched: true, name: '开片', price: 27, score: 0, unit: 'm³' }]);
    mocks.mates.mockResolvedValue([]);
  });

  it('opens the linked slicing task directly in the full material workflow', async () => {
    mocks.route.query = { factoryId: '1', taskId: '31' };
    mocks.my.mockResolvedValue({ ...my, inProgress: [], tasks: [] });
    await mount();
    expect(mocks.prepare).toHaveBeenCalledExactlyOnceWith(31);
    expect(document.body.textContent).toContain('选择实际领料批次');
    expect(document.body.textContent).toContain('1900×1300×48 mm');
    expect(mocks.issue).not.toHaveBeenCalled();
    expect(mocks.report).not.toHaveBeenCalled();
  });

  it('resumes the linked issued task on its original order without issuing material again', async () => {
    mocks.route.query = { factoryId: '1', taskId: '31' };
    const process = { ...my.processes[0]!, code: 'CUT', outputStage: 'CUT' };
    const task = { ...my.tasks[0]!, process: 'CUT' };
    mocks.my.mockResolvedValue({ ...my, inProgress: [], tasks: [], processes: [process] });
    mocks.prepare.mockResolvedValue({ ...prepare, task, inProgressOrderId: 5 });
    mocks.order.mockResolvedValue({ ...order, process: 'CUT', outputStage: 'CUT', scheduleTaskId: 31 });
    await mount();
    expect(mocks.prepare).toHaveBeenCalledExactlyOnceWith(31);
    expect(mocks.order).toHaveBeenCalledExactlyOnceWith(5);
    expect(document.body.textContent).toContain('报本工序实际产出');
    expect(mocks.issue).not.toHaveBeenCalled();
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it('does not prepare a linked task in an inaccessible factory', async () => {
    mocks.route.query = { factoryId: '999', taskId: '31' };
    await mount();
    expect(mocks.prepare).not.toHaveBeenCalled();
    expect(mocks.my).not.toHaveBeenCalled();
    expect(document.body.textContent).toContain('没有加载出来');
  });
  afterEach(() => {
    unmount?.();
    document.body.innerHTML = '';
    Modal.destroyAll();
    vi.restoreAllMocks();
    vi.clearAllMocks();
  });

  it('issues material before production and reports the planned intermediate output without issuing twice', async () => {
    await mount();
    expect(document.body.textContent).toContain('计划产出');
    expect(document.body.textContent).toContain('预计领料');
    expect(document.body.textContent).toContain('预计领料不扣库存');
    expect(document.body.textContent).toContain('1900×1300×48 mm');
    expect(document.body.textContent).toContain('关联订单产品：紫色瑜伽垫');
    clickButton('领料开工');
    await flush();
    expect(document.body.textContent).toContain('选择实际领料批次');
    expect(document.body.textContent).toContain('1900×1300×48 mm');
    expect(document.body.textContent).toContain('账面 180');
    fill('pick-11', 52);
    await flush();
    clickButton('下一步：确认领料');
    await flush();
    clickButton('确认领料');
    await flush();
    expect(mocks.issue).not.toHaveBeenCalled();
    clickButton('模拟拍照');
    await flush();
    mocks.my.mockResolvedValue({ ...my, inProgress: [inProgress] });
    clickButton('确认领料');
    await flush();
    expect(mocks.issue).toHaveBeenCalledWith(expect.objectContaining({
      taskId: 31, sourceStage: 'BOARD', inputs: [{ laminationSide: undefined, quantity: 52, stockId: 11 }],
      issueSheetUrls: ['https://f/sheet.jpg'], requestKey: expect.any(String),
    }));
    expect(mocks.report).not.toHaveBeenCalled();
    expect(document.body.textContent).toContain('领料开工完成');
    clickButton('看下一个活');
    await flush();
    expect(document.body.textContent).toContain('在制工序单 · 已领料');
    clickButton('报本工序产出');
    await flush();
    expect(mocks.order).toHaveBeenCalledWith(5);
    expect(document.body.textContent).toContain('报本工序实际产出');
    expect(document.querySelector('[id^="wb-"][id$="-width"]')).toBeNull();
    expect(document.querySelector('[id^="wb-"][id$="-thickness"]')).toBeNull();
    expect(document.body.textContent).toContain('1900×1300×48 mm');
    expect(document.body.textContent).toContain('厚度不可修改');
    expect(document.body.textContent).toContain('每张开 1 片 × 52 张 = 52 片');
    const goodInput = document.querySelector<HTMLInputElement>('[id^="good-"]')!;
    expect(Number(goodInput.value)).toBe(0);
    fill(goodInput.id, 380);
    fill(document.querySelector('[id^="bad-"]')!.id, 6);
    await flush();
    clickButton('下一步');
    await flush();
    expect(document.body.textContent).toContain('确认本次报工和计件');
    expect(document.body.textContent).not.toContain('模拟拍照');
    clickButton('报工');
    await flush();
    expect(mocks.report).toHaveBeenCalledWith(expect.objectContaining({
      taskId: 31, orderId: 5, expectedReportCount: 0, finish: true, requestKey: expect.any(String),
      outputs: [expect.objectContaining({ attrs: expect.objectContaining(board.item), goodQuantity: 380, defectQuantity: 6 })],
    }));
    const payload = mocks.report.mock.calls[0]![0];
    expect(payload).not.toHaveProperty('inputs');
    expect(payload).not.toHaveProperty('sourceStage');
    expect(payload).not.toHaveProperty('issueSheetUrls');
    expect(mocks.issue).toHaveBeenCalledTimes(1);
    expect(mocks.create).not.toHaveBeenCalled();
    expect(document.body.textContent).toContain('报工好了');
  });

  it('edits recommended actual picks even when the task stock list omits their batches', async () => {
    mocks.stock.mockResolvedValue({ list: [], total: 0 });
    await mount();
    clickButton('领料开工');
    await flush();
    expect(document.body.textContent).toContain('暂无符合当前任务条件的领料批次');
    expect(document.body.textContent).not.toContain('板材现在没有库存');
    expect(document.querySelector('#pick-11')).toBeNull();
    const actualInput = document.querySelector<HTMLInputElement>('#actual-pick-11')!;
    expect(Number(actualInput.value)).toBe(50);
    expect(actualInput.getAttribute('aria-label')).toContain('批次 MB261007-01 实际领用数量');
    fill('actual-pick-11', 52.125);
    await flush();
    expect(document.body.textContent).toContain('1 批次 · 共 52.125 张');
    clickButton('下一步：确认领料');
    await flush();
    clickButton('模拟拍照');
    await flush();
    clickButton('确认领料');
    await flush();
    expect(mocks.issue).toHaveBeenCalledWith(expect.objectContaining({
      taskId: 31,
      sourceStage: 'BOARD',
      inputs: [{ laminationSide: undefined, quantity: 52.125, stockId: 11 }],
      issueSheetUrls: ['https://f/sheet.jpg'],
    }));
    expect(mocks.issue).toHaveBeenCalledTimes(1);
    expect(mocks.report).not.toHaveBeenCalled();
  });

  it('keeps selected batches and actual quantities while searching other batches', async () => {
    const second = { ...board, id: 12, batchNo: 'MB261007-02', itemCode: 'BC-2', location: '板材B区', item: { ...board.item, productName: '备用开片板材' } };
    mocks.prepare.mockResolvedValue({ ...prepare, picks: [] });
    mocks.stock.mockResolvedValue({ list: [board, second], total: 2 });
    await mount();
    clickButton('领料开工');
    await flush();
    const batchButton = (batchNo: string) => [...document.querySelectorAll('button')].find((button) => button.textContent?.includes(`批次 ${batchNo}`));
    fill('stock-keyword', '紫色');
    await flush();
    expect(batchButton(board.batchNo)).toBeDefined();
    expect(batchButton(second.batchNo)).toBeDefined();
    batchButton(board.batchNo)!.click();
    await flush();
    fill('actual-pick-11', 2);
    fill('stock-keyword', second.batchNo);
    await flush();
    expect(batchButton(board.batchNo)).toBeUndefined();
    expect(Number(document.querySelector<HTMLInputElement>('#actual-pick-11')!.value)).toBe(2);
    batchButton(second.batchNo)!.click();
    await flush();
    fill('actual-pick-12', 3);
    for (const keyword of ['备用开片板材', 'BC-2', '板材B区']) {
      fill('stock-keyword', keyword);
      await flush();
      expect(batchButton(board.batchNo)).toBeUndefined();
      expect(batchButton(second.batchNo)).toBeDefined();
    }
    fill('stock-keyword', '1900x1300x48 mm');
    await flush();
    expect(batchButton(board.batchNo)).toBeDefined();
    expect(batchButton(second.batchNo)).toBeDefined();
    expect(document.body.textContent).toContain('2 批次 · 共 5 张');
    clickButton('下一步：确认领料');
    await flush();
    clickButton('模拟拍照');
    await flush();
    clickButton('确认领料');
    await flush();
    expect(mocks.issue).toHaveBeenCalledWith(expect.objectContaining({ inputs: [
      { laminationSide: undefined, quantity: 2, stockId: 11 },
      { laminationSide: undefined, quantity: 3, stockId: 12 },
    ] }));
  });

  it('offers retry on stock loading failure and preserves actual quantities through reload', async () => {
    mocks.stock.mockRejectedValueOnce(new Error('stock unavailable')).mockResolvedValue({ list: [board], total: 1 });
    await mount();
    clickButton('领料开工');
    await flush();
    expect(document.body.textContent).toContain('库存批次加载失败，已选批次和填写数量已保留，请重试。');
    expect(document.body.textContent).not.toContain('暂无符合当前任务条件的领料批次');
    expect(document.body.textContent).not.toContain('板材现在没有库存');
    expect([...document.querySelectorAll('button')].find((button) => button.textContent?.includes('下一步：确认领料'))!.disabled).toBe(true);
    fill('actual-pick-11', 52);
    await flush();
    clickButton('重新加载领料批次');
    await flush();
    expect(mocks.stock).toHaveBeenCalledTimes(2);
    expect(document.body.textContent).not.toContain('库存批次加载失败');
    expect(Number(document.querySelector<HTMLInputElement>('#actual-pick-11')!.value)).toBe(52);
    expect(Number(document.querySelector<HTMLInputElement>('#pick-11')!.value)).toBe(52);
  });

  it('issues multiple actual board specifications independently and reports each output without issuing again', async () => {
    const blue = { ...board, item: { material: 'TPE', color: 'BL', length: 190, width: 132, thickness: 4.5 } };
    const green = { ...board, id: 12, itemId: 2, itemCode: 'BC-2', batchNo: 'MB261007-02', item: { material: 'TPE', color: 'GR', length: 200, width: 140, thickness: 3 } };
    const independent = { ...my.inProgress[0]!, id: 7, orderNo: 'GX20261110-007', inputQuantity: 8 };
    mocks.options.mockResolvedValue({ ...options, colors: [...options.colors, { label: '蓝色', value: 'BL' }, { label: '绿色', value: 'GR' }] });
    mocks.stock.mockResolvedValue({ list: [blue, green], total: 2 });
    mocks.order.mockResolvedValue({
      ...order,
      id: 7,
      orderNo: independent.orderNo,
      inputQuantity: 8,
      inputs: [blue, green].map((stock, index) => ({
        id: 201 + index,
        stockId: stock.id,
        itemId: stock.itemId,
        stage: stock.stage,
        batchNo: stock.batchNo,
        item: stock.item,
        itemCode: stock.itemCode,
        location: stock.location,
        quantity: index === 0 ? 3 : 5,
        returnedQuantity: 0,
      })),
    });
    mocks.wage.mockResolvedValue([{ itemId: 1, matched: true, name: '开片', price: 27, unit: 'm³' }]);
    await mount();
    clickButton('开片·选择板材');
    await flush();
    expect(document.body.textContent).toContain('独立开片 · 多种板材分别报工');
    expect(mocks.stock).toHaveBeenCalledWith('BOARD', undefined);
    for (const stock of [blue, green]) {
      [...document.querySelectorAll('button')].find((button) => button.textContent?.includes(`批次 ${stock.batchNo}`))!.click();
      await flush();
    }
    fill('actual-pick-11', 3);
    fill('actual-pick-12', 5);
    await flush();
    expect(document.body.textContent).toContain('2 批次 · 共 8 张');
    clickButton('下一步：确认领料');
    await flush();
    expect(document.body.textContent).toContain('不计入已下发任务或订单进度');
    mocks.my.mockResolvedValue({ ...my, inProgress: [independent] });
    clickButton('确认领料');
    await flush();
    expect(mocks.create).toHaveBeenCalledWith(expect.objectContaining({
      process: 'SLICE',
      sourceStage: 'BOARD',
      finish: false,
      inputs: [
        { laminationSide: undefined, quantity: 3, stockId: 11 },
        { laminationSide: undefined, quantity: 5, stockId: 12 },
      ],
      outputs: [],
      pieceworks: [],
    }));
    const sentCreate = JSON.parse(JSON.stringify(mocks.create.mock.calls[0]![0]));
    expect(sentCreate).not.toHaveProperty('scheduleTaskId');
    expect(sentCreate).not.toHaveProperty('productionOrderItemId');
    expect(mocks.issue).not.toHaveBeenCalled();
    expect(mocks.prepare).not.toHaveBeenCalled();
    expect(document.body.textContent).toContain('领料开工完成');
    clickButton('看下一个活');
    await flush();
    clickButton('报本工序产出');
    await flush();
    expect(mocks.order).toHaveBeenCalledWith(7);
    expect(document.body.textContent).toContain('蓝色');
    expect(document.body.textContent).toContain('绿色');
    expect(document.body.textContent).toContain('1900×1320×45 mm');
    expect(document.body.textContent).toContain('2000×1400×30 mm');
    expect(document.body.textContent).toContain('开片不会改变颜色，颜色固定沿用对应领料，不可修改。');
    expect(document.querySelector('[id^="wb-"][id$="-color"]')).toBeNull();
    expect(document.querySelector('[id^="wb-"][id$="-thickness"]')).toBeNull();
    const goods = [...document.querySelectorAll<HTMLInputElement>('[id^="good-"]')];
    expect(goods).toHaveLength(2);
    expect(goods.map((input) => Number(input.value))).toEqual([0, 0]);
    fill(goods[0]!.id, 2);
    fill(goods[1]!.id, 4);
    await flush();
    clickButton('下一步');
    await flush();
    expect(document.body.textContent).toContain('良品 0.56172 m³ × ¥27/m³');
    expect(document.body.textContent).toContain('¥15.17');
    expect(document.querySelector('[id^="piece-item-"]')).toBeNull();
    expect(mocks.wage).toHaveBeenCalled();
    clickButton('提交');
    await flush();
    expect(mocks.reportOrder).toHaveBeenCalledWith(expect.objectContaining({
      id: 7,
      finish: true,
      outputs: [
        expect.objectContaining({ attrs: expect.objectContaining(blue.item), goodQuantity: 2, defectQuantity: 0, sourceItemIds: [blue.itemId] }),
        expect.objectContaining({ attrs: expect.objectContaining(green.item), goodQuantity: 4, defectQuantity: 0, sourceItemIds: [green.itemId] }),
      ],
      pieceworks: [{ itemId: 1, quantity: '0.56172', userId: 2 }],
    }));
    expect(mocks.reportOrder.mock.calls[0]![0]).not.toHaveProperty('inputs');
    expect(mocks.reportOrder).toHaveBeenCalledTimes(1);
    expect(mocks.create).toHaveBeenCalledTimes(1);
    expect(mocks.issue).not.toHaveBeenCalled();
    expect(mocks.report).not.toHaveBeenCalled();
    expect(mocks.returnMaterial).not.toHaveBeenCalled();
  });

  it('stays on the completed page when independent issuing succeeds but refreshing the workbench fails', async () => {
    await mount();
    clickButton('开片·选择板材');
    await flush();
    [...document.querySelectorAll('button')].find((button) => button.textContent?.includes(`批次 ${board.batchNo}`))!.click();
    await flush();
    fill('actual-pick-11', 3);
    await flush();
    clickButton('下一步：确认领料');
    await flush();
    mocks.my.mockRejectedValueOnce(new Error('workbench refresh unavailable'));
    clickButton('确认领料');
    await flush();
    expect(mocks.create).toHaveBeenCalledTimes(1);
    expect(mocks.create).toHaveBeenCalledWith(expect.objectContaining({ finish: false, inputs: [{ laminationSide: undefined, quantity: 3, stockId: 11 }] }));
    expect(document.querySelector('h1')?.textContent).toBe('领料开工完成');
    expect(document.body.textContent).not.toContain('第 2 步 确认领料');
    expect([...document.querySelectorAll('button')].some((button) => button.textContent?.includes('确认领料'))).toBe(false);
    expect(mocks.issue).not.toHaveBeenCalled();
    expect(mocks.reportOrder).not.toHaveBeenCalled();
  });

  it('stays on the completed page when independent reporting succeeds but refreshing the workbench fails', async () => {
    mocks.my.mockResolvedValue({ ...my, tasks: [], inProgress: [my.inProgress[0]] });
    mocks.reportOrder.mockResolvedValue(true);
    await mount();
    clickButton('报本工序产出');
    await flush();
    fill(document.querySelector('[id^="good-"]')!.id, 40);
    await flush();
    clickButton('下一步');
    await flush();
    mocks.my.mockRejectedValueOnce(new Error('workbench refresh unavailable'));
    clickButton('提交');
    await flush();
    expect(mocks.reportOrder).toHaveBeenCalledTimes(1);
    expect(mocks.reportOrder).toHaveBeenCalledWith(expect.objectContaining({ id: 5, finish: true, outputs: [expect.objectContaining({ goodQuantity: 40 })] }));
    expect(document.querySelector('h1')?.textContent).toBe('报工好了');
    expect(document.body.textContent).toContain('40 片已开片板材已入库');
    expect(document.body.textContent).not.toContain('确认本次报工和计件');
    expect([...document.querySelectorAll('button')].some((button) => button.textContent?.includes('提交'))).toBe(false);
    expect(mocks.report).not.toHaveBeenCalled();
    expect(mocks.create).not.toHaveBeenCalled();
    expect(mocks.issue).not.toHaveBeenCalled();
  });

  it.each(['SLICE', 'CUT'])('issues %s with authoritative task sources and keeps the inherited recipe out of MIX-only fields', async (process) => {
    const task = { ...my.tasks[0]!, process };
    const outputStage = process === 'SLICE' ? 'SHEET' : 'CUT';
    mocks.my.mockResolvedValue({ ...my, tasks: [task], inProgress: [], processes: [{
      code: process, label: process === 'SLICE' ? '开片' : '立切', outputLabel: '本工序产出',
      outputStage, outputUnit: '片', sources: process === 'SLICE' ? ['BOARD'] : ['SHEET'],
    }] });
    mocks.prepare.mockResolvedValue({ ...prepare, task, sourceStage: 'BOARD', sourceStages: ['BOARD'],
      outputStage, outputAttrs: { ...plannedAttrs, recipeCode: 'REC-001' } });
    await mount();
    clickButton('领料开工');
    await flush();
    expect(mocks.stock).toHaveBeenCalledWith('BOARD', task.id);
    clickButton('下一步：确认领料');
    await flush();
    clickButton('模拟拍照');
    await flush();
    clickButton('确认领料');
    await flush();
    expect(mocks.issue).toHaveBeenCalledWith(expect.objectContaining({ taskId: task.id, sourceStage: 'BOARD' }));
    const payload = JSON.parse(JSON.stringify(mocks.issue.mock.calls[0]![0]));
    expect(payload).not.toHaveProperty('recipeCode');
    expect(payload).not.toHaveProperty('recipeBatches');
  });

  it('restores the linked task from an older issued order even when it is missing from the recent task list', async () => {
    mocks.my.mockResolvedValue({ ...my, tasks: [], inProgress: [my.inProgress[0]] });
    mocks.order.mockResolvedValue({ ...order, scheduleTaskId: 31, reportCount: 2 });
    await mount();
    clickButton('报本工序产出');
    await flush();
    expect(mocks.prepare).toHaveBeenCalledWith(31);
    fill(document.querySelector('[id^="good-"]')!.id, 3);
    fill('return-101', 2);
    await flush();
    clickButton('下一步');
    await flush();
    clickButton('报工');
    await flush();
    expect(mocks.report).toHaveBeenCalledWith(expect.objectContaining({ taskId: 31, orderId: 5,
      expectedReportCount: 2, returns: [{ inputId: 101, quantity: 2 }],
      outputs: [expect.objectContaining({ goodQuantity: 3, sourceItemIds: [board.itemId] })],
    }));
    expect(mocks.reportOrder).not.toHaveBeenCalled();
    expect(mocks.returnMaterial).not.toHaveBeenCalled();
    expect(mocks.issue).not.toHaveBeenCalled();
  });

  it('supports partial reports of an issued order with the current report count', async () => {
    mocks.my.mockResolvedValue({ ...my, inProgress: [inProgress] });
    mocks.order.mockResolvedValue({ ...order, reportCount: 2, goodQuantity: 100 });
    await mount();
    clickButton('报本工序产出');
    await flush();
    expect(document.body.textContent).toContain('已经报过 2 次');
    fill(document.querySelector('[id^="good-"]')!.id, 80);
    clickButton('先报这些，还没做完');
    await flush();
    clickButton('下一步');
    await flush();
    clickButton('报工');
    await flush();
    expect(mocks.report).toHaveBeenCalledWith(expect.objectContaining({ orderId: 5, expectedReportCount: 2, finish: false }));
    expect(document.body.textContent).toContain('工序单继续在制');
    expect(mocks.issue).not.toHaveBeenCalled();
  });

  it('closes an order with earlier reports without requiring another output batch', async () => {
    mocks.my.mockResolvedValue({ ...my, inProgress: [inProgress] });
    mocks.order.mockResolvedValue({ ...order, reportCount: 3, goodQuantity: 400 });
    await mount();
    clickButton('报本工序产出');
    await flush();
    clickButton('提交');
    await flush();
    clickButton('报工');
    await flush();
    expect(mocks.report).toHaveBeenCalledWith(expect.objectContaining({ orderId: 5, expectedReportCount: 3, finish: true, outputs: [], pieceworks: [] }));
  });

  it('submits leftover material returns atomically with task output instead of a separate inventory mutation', async () => {
    mocks.my.mockResolvedValue({ ...my, inProgress: [inProgress] });
    await mount();
    clickButton('报本工序产出');
    await flush();
    fill(document.querySelector('[id^="good-"]')!.id, 100);
    fill('return-101', 2);
    await flush();
    clickButton('下一步');
    await flush();
    clickButton('报工');
    await flush();
    expect(mocks.report).toHaveBeenCalledWith(expect.objectContaining({ orderId: 5, finish: true, returns: [{ inputId: 101, quantity: 2 }], requestKey: expect.any(String) }));
    expect(mocks.returnMaterial).not.toHaveBeenCalled();
  });

  it('updates piecework when actual output changes after returning from confirmation', async () => {
    mocks.my.mockResolvedValue({ ...my, inProgress: [inProgress] });
    mocks.wage.mockResolvedValue([{ itemId: 1, matched: true, name: '开片', price: 27, unit: 'm³' }]);
    await mount();
    clickButton('报本工序产出');
    await flush();
    fill(document.querySelector('[id^="good-"]')!.id, 80);
    await flush();
    clickButton('下一步');
    await flush();
    document.querySelector<HTMLButtonElement>('button[aria-label="返回"]')!.click();
    await flush();
    fill(document.querySelector('[id^="good-"]')!.id, 100);
    await flush();
    clickButton('下一步');
    await flush();
    clickButton('报工');
    await flush();
    expect(document.body.textContent).not.toContain('100 片 × ¥27');
    expect(mocks.report).toHaveBeenCalledWith(expect.objectContaining({ pieceworks: [{ itemId: 1, quantity: '11.856', userId: 2 }] }));
  });

  it('resumes an existing issued order returned by task preparation instead of issuing again', async () => {
    mocks.prepare.mockResolvedValue({ ...prepare, inProgressOrderId: 5 });
    await mount();
    clickButton('领料开工');
    await flush();
    expect(document.body.textContent).toContain('报本工序实际产出');
    expect(mocks.order).toHaveBeenCalledWith(5);
    expect(mocks.stock).not.toHaveBeenCalled();
    expect(mocks.issue).not.toHaveBeenCalled();
    expect(document.querySelector('[id^="wb-"][id$="-thickness"]')).toBeNull();
    expect(document.body.textContent).toContain('1900×1300×48 mm');
  });

  it('restores different issued thicknesses as separate immutable output rows on an independent order', async () => {
    mocks.my.mockResolvedValue({ ...my, tasks: [], inProgress: [my.inProgress[0]] });
    mocks.order.mockResolvedValue({ ...order, inputs: [
      ...order.inputs,
      { ...order.inputs[0], id: 102, stockId: 12, batchNo: 'THIN', quantity: 7, item: { ...board.item, thickness: 3 } },
      { ...order.inputs[0], id: 103, stockId: 13, batchNo: 'RETURNED', quantity: 5, returnedQuantity: 5, item: { ...board.item, thickness: 1 } },
    ] });
    await mount();
    clickButton('报本工序产出');
    await flush();
    expect(document.querySelectorAll('[id^="good-"]')).toHaveLength(2);
    expect(document.querySelector('[id^="wb-"][id$="-thickness"]')).toBeNull();
    expect(document.body.textContent).toContain('1900×1300×48 mm');
    expect(document.body.textContent).toContain('1900×1300×30 mm');
    expect(document.body.textContent).toContain('每张开 1 片 × 52 张 = 52 片');
    expect(document.body.textContent).toContain('每张开 1 片 × 7 张 = 7 片');
    const goods = [...document.querySelectorAll<HTMLInputElement>('[id^="good-"]')];
    fill(goods[0]!.id, 40);
    fill(goods[1]!.id, 6);
    await flush();
    clickButton('下一步');
    await flush();
    clickButton('提交');
    await flush();
    expect(mocks.reportOrder).toHaveBeenCalledWith(expect.objectContaining({ outputs: [
      expect.objectContaining({ attrs: expect.objectContaining({ thickness: 4.8 }), goodQuantity: 40 }),
      expect.objectContaining({ attrs: expect.objectContaining({ thickness: 3 }), goodQuantity: 6 }),
    ] }));
  });

  it('shows the actual board thickness and blocks reporting an incompatible historical task plan', async () => {
    mocks.my.mockResolvedValue({ ...my, inProgress: [inProgress] });
    mocks.prepare.mockResolvedValue({ ...prepare, outputAttrs: { ...plannedAttrs, thickness: 0.3 } });
    await mount();
    clickButton('报本工序产出');
    await flush();
    expect(document.body.textContent).toContain('开片计划厚度（3 mm）与实际领料（48 mm）不一致');
    expect(document.body.textContent).toContain('请联系排单人员核对并处理原任务');
    expect(document.body.textContent).toContain('1900×1300×48 mm');
    expect(document.querySelector('[id^="wb-"][id$="-thickness"]')).toBeNull();
    fill(document.querySelector('[id^="good-"]')!.id, 40);
    await flush();
    clickButton('下一步');
    await flush();
    expect(document.body.textContent).not.toContain('确认本次报工和计件');
    expect(mocks.report).not.toHaveBeenCalled();
  });

  it('blocks issuing a board that has a different thickness from the task plan', async () => {
    mocks.prepare.mockResolvedValue({ ...prepare, outputAttrs: { ...plannedAttrs, thickness: 0.3 } });
    await mount();
    clickButton('领料开工');
    await flush();
    expect(document.body.textContent).toContain('开片计划厚度（3 mm）与实际领料（48 mm）不一致');
    clickButton('下一步：确认领料');
    await flush();
    expect(document.body.textContent).toContain('选择实际领料批次');
    expect(mocks.issue).not.toHaveBeenCalled();
  });

  it('has no task hall: only assigned tasks, without claiming or giving back', async () => {
    await mount();
    const text = document.body.textContent ?? '';
    expect(text).not.toContain('任务大厅');
    expect(text).not.toContain('HT-002');
    const labels = [...document.querySelectorAll('button')].map((button) => button.textContent?.trim());
    expect(labels).not.toContain('接单');
    expect(labels).not.toContain('退单');
  });

  it('requires an urgent reason and sends it when issuing resting boards', async () => {
    await mount();
    clickButton('领料开工');
    await flush();
    document.querySelector<HTMLInputElement>('input[type="checkbox"]')!.click();
    await flush();
    clickButton('下一步：确认领料');
    await flush();
    expect(document.querySelector('#urgent-reason')).not.toBeNull();
    expect(document.body.textContent).not.toContain('第 2 步 确认领料');
    fill('urgent-reason', '客户加急，下午出货');
    await flush();
    clickButton('下一步：确认领料');
    await flush();
    clickButton('模拟拍照');
    await flush();
    clickButton('确认领料');
    await flush();
    expect(mocks.issue).toHaveBeenCalledWith(expect.objectContaining({
      urgent: true, urgentReason: '客户加急，下午出货', taskId: 31,
    }));
    expect(mocks.report).not.toHaveBeenCalled();
  });

  it('issues a team task for the selected worker instead of the supervisor', async () => {
    const task = { ...my.tasks[0]!, id: 42, workerIds: '7', workerNames: '李四' };
    mocks.my.mockResolvedValue({ ...my, inProgress: [], teamTasks: [task], teamProcesses: my.processes });
    mocks.mates.mockResolvedValue([{ userId: 7, nickname: '李四' }]);
    mocks.prepare.mockResolvedValue({ ...prepare, task });
    await mount();
    clickButton('代报');
    await flush();
    clickButton('下一步');
    await flush();
    clickButton('下一步：确认领料');
    await flush();
    clickButton('模拟拍照');
    await flush();
    clickButton('确认领料');
    await flush();
    expect(mocks.issue).toHaveBeenCalledWith(expect.objectContaining({ taskId: 42, onBehalfOf: 7 }));
  });

  it('preserves the selected worker when resuming a team order and assigning piecework', async () => {
    const task = { ...my.tasks[0]!, id: 42, workerIds: '7', workerNames: '李四' };
    mocks.my.mockResolvedValue({ ...my, inProgress: [], teamTasks: [task], teamProcesses: my.processes });
    mocks.mates.mockResolvedValue([{ userId: 7, nickname: '李四' }]);
    mocks.prepare.mockResolvedValue({ ...prepare, task, inProgressOrderId: 5 });
    mocks.wage.mockResolvedValue([{ itemId: 1, matched: true, name: '开片', price: 27, unit: 'm³' }]);
    await mount();
    clickButton('代报');
    await flush();
    clickButton('下一步');
    await flush();
    expect(document.body.textContent).toContain('正在替 李四 报工');
    fill(document.querySelector('[id^="good-"]')!.id, 40);
    await flush();
    clickButton('下一步');
    await flush();
    clickButton('报工');
    await flush();
    expect(mocks.report).toHaveBeenCalledWith(expect.objectContaining({
      taskId: 42, orderId: 5, onBehalfOf: 7, expectedReportCount: 0,
      pieceworks: [{ itemId: 1, quantity: '4.7424', userId: 7 }],
    }));
    expect(mocks.report.mock.calls[0]![0]).not.toHaveProperty('inputs');
    expect(mocks.issue).not.toHaveBeenCalled();
  });

  it('keeps the report identity and returns when confirming an additional report', async () => {
    mocks.my.mockResolvedValue({ ...my, inProgress: [inProgress] });
    mocks.report.mockRejectedValueOnce({ code: 1_215_024_000, msg: '这个任务今天已报过' });
    const confirmation = vi.spyOn(Modal, 'confirm').mockImplementation((config) => {
      void config.onOk?.();
      return { destroy: () => {}, update: () => {} };
    });
    await mount();
    clickButton('报本工序产出');
    await flush();
    fill(document.querySelector('[id^="good-"]')!.id, 40);
    fill('return-101', 2);
    await flush();
    clickButton('下一步');
    await flush();
    clickButton('报工');
    await flush();
    expect(confirmation).toHaveBeenCalledWith(expect.objectContaining({ title: '这个任务今天已经报过' }));
    expect(mocks.report).toHaveBeenCalledTimes(2);
    const first = mocks.report.mock.calls[0]![0];
    expect(mocks.report.mock.calls[1]![0]).toEqual({ ...first, duplicateAction: 'APPEND' });
    expect(first).toEqual(expect.objectContaining({ orderId: 5, expectedReportCount: 0, returns: [{ inputId: 101, quantity: 2 }] }));
    expect(mocks.returnMaterial).not.toHaveBeenCalled();
  });

  it('shows zero and negative balances and allows actual picks with a backfill warning', async () => {
    mocks.prepare.mockResolvedValue({ ...prepare, picks: [] });
    mocks.stock.mockResolvedValue({ list: [board, { ...board, id: 12, batchNo: 'EMPTY', quantity: 0 }, { ...board, id: 13, batchNo: 'NEGATIVE', quantity: -8 }], total: 3 });
    await mount();
    clickButton('领料开工');
    await flush();
    expect(document.body.textContent).toContain('EMPTY');
    expect(document.body.textContent).toContain('NEGATIVE');
    const negative = [...document.querySelectorAll('button')].find((b) => b.textContent?.includes('批次 NEGATIVE'))!;
    negative.click();
    await flush();
    expect(document.querySelector<HTMLInputElement>('#pick-13')!.value).toBe('');
    fill('pick-13', 7);
    await flush();
    expect(document.body.textContent).toContain('领料后欠账 15 张，需补录上工序产出');
    const card = [...document.querySelectorAll('button')].find((b) => b.textContent?.includes('账面 180'))!;
    card.click();
    await flush();
    fill('pick-11', 200);
    await flush();
    expect(document.body.textContent).toContain('领料后欠账 20 张，需补录上工序产出');
    clickButton('下一步：确认领料');
    await flush();
    expect(document.body.textContent).toContain('共 207 张');
    expect(document.body.textContent).toContain('领料后欠账 15 张，需补录上工序产出');
  });

  it('supplements the same issued order without creating or reporting another order', async () => {
    mocks.my.mockResolvedValue({ ...my, inProgress: [inProgress] });
    await mount();
    clickButton('补领材料');
    await flush();
    const card = [...document.querySelectorAll('button')].find((b) => b.textContent?.includes('账面 180'))!;
    card.click();
    await flush();
    fill('pick-11', 200);
    await flush();
    expect(document.body.textContent).toContain('领料后欠账 20 张，需补录上工序产出');
    clickButton('下一步：确认领料');
    await flush();
    clickButton('确认补领');
    await flush();
    expect(mocks.supplement).toHaveBeenCalledWith(expect.objectContaining({ id: 5, inputs: [{ laminationSide: undefined, quantity: 200, stockId: 11 }] }));
    expect(mocks.issue).not.toHaveBeenCalled();
    expect(mocks.report).not.toHaveBeenCalled();
  });

  it('keeps suggested and auxiliary actual quantities even when their ledger balances are insufficient', async () => {
    const aux = { ...board, id: 91, stage: 'AUX', item: { productName: '标签', unit: '张' }, itemCode: 'AUX-LABEL', batchNo: 'AUX-NEGATIVE', quantity: -3 };
    const lowBoard = { ...board, quantity: 5 };
    mocks.prepare.mockResolvedValue({ ...prepare, picks: [{ quantity: 50, stock: lowBoard }], aux: [{ productName: '标签', productId: 'LABEL', perUnit: 0.1, unit: '张', issuedQuantity: 0, stocks: [aux] }] });
    mocks.stock.mockResolvedValue({ list: [lowBoard], total: 1 });
    await mount();
    clickButton('领料开工');
    await flush();
    expect(Number(document.querySelector<HTMLInputElement>('#pick-11')!.value)).toBe(50);
    expect(Number(document.querySelector<HTMLInputElement>('#aux-91')!.value)).toBe(40);
    expect(document.body.textContent).toContain('领料后欠账 45 张，需补录上工序产出');
    fill('aux-91', 60);
    await flush();
    expect(document.body.textContent).toContain('领料后欠账 63 张，需补录辅料入库');
    clickButton('下一步：确认领料');
    await flush();
    expect(document.body.textContent).toContain('领料后欠账 63 张，需补录辅料入库');
    clickButton('模拟拍照');
    await flush();
    clickButton('确认领料');
    await flush();
    expect(mocks.issue).toHaveBeenCalledWith(expect.objectContaining({
      inputs: [{ laminationSide: undefined, quantity: 50, stockId: 11 }],
      auxInputs: [{ quantity: 60, stockId: 91 }],
    }));
  });

  it.each([undefined, 5])('issues raw ingredients using the planned foaming batches %s with editable actual batches', async (plannedBatches) => {
    const batches = plannedBatches ?? 1;
    const task = { ...my.tasks[0]!, id: 41, process: 'MIX', unit: '张', output: { stage: 'BOARD', recipeBatches: plannedBatches }, inputs: [{ stage: 'RAW', name: '热塑性弹性体', attrs: { rawMaterialCode: 'MAT-TPE' }, quantity: 20 * batches, unit: 'kg' }] };
    const raw = { ...board, id: 21, stage: 'RAW', batchNo: 'RAW-01', item: { rawMaterialCode: 'MAT-TPE', rawMaterialName: 'TPE' }, itemCode: 'YL-TPE', quantity: 5 };
    mocks.my.mockResolvedValue({ ...my, inProgress: [], tasks: [task], processes: [{ code: 'MIX', label: '发泡', outputLabel: '板材', outputStage: 'BOARD', outputUnit: '张', sources: ['RAW'] }] });
    mocks.prepare.mockResolvedValue({ ...prepare, task, picks: [], sourceStage: 'RAW', sourceStages: ['RAW'], outputStage: 'BOARD', outputLabel: '板材', outputUnit: '张', outputAttrs: { ...board.item, recipeCode: 'REC-001' } });
    mocks.pickList.mockResolvedValue([]);
    mocks.stock.mockResolvedValue({ list: [raw], total: 1 });
    mocks.plan.mockResolvedValue({ recipeCode: 'REC-001', batches, lines: [{ rawMaterialCode: 'MAT-TPE', rawMaterialName: 'TPE', required: 20 * batches, remaining: 20 * batches, shortage: 0, picks: [{ stockId: 21, itemCode: 'YL-TPE', batchNo: 'RAW-01', location: '原料仓', available: 5, quantity: 20 * batches }] }] });
    await mount();
    clickButton('领料开工');
    await flush();
    expect(document.body.textContent).toContain('本次领取：原材料 → 报工产出：板材');
    expect(document.body.textContent).toContain('原材料 · 热塑性弹性体');
    expect(document.body.textContent).toContain('1900×1300×48 mm');
    expect(document.body.textContent).toContain('本次实际锅数');
    expect(Number(document.querySelector<HTMLInputElement>('#recipe-batches')!.value)).toBe(batches);
    expect(document.body.textContent).toContain(plannedBatches ? '任务预计 5 锅，已按计划预填' : '任务未填写预计锅数，暂按 1 锅预填');
    clickButton('按配方带出要领的料');
    await flush();
    expect(mocks.plan).toHaveBeenCalledWith({ recipeCode: 'REC-001', batches });
    expect(document.body.textContent).toContain(`领料后欠账 ${20 * batches - 5} kg，需补录原材料入库`);
    clickButton('下一步：确认领料');
    await flush();
    clickButton('模拟拍照');
    await flush();
    clickButton('确认领料');
    await flush();
    expect(mocks.issue).toHaveBeenCalledWith(expect.objectContaining({ taskId: 41, sourceStage: 'RAW', recipeCode: 'REC-001', recipeBatches: batches, inputs: [{ laminationSide: undefined, quantity: 20 * batches, stockId: 21 }] }));
    expect(mocks.report).not.toHaveBeenCalled();
  });

  it('reports a 6 mm cut sheet from a 45 mm opened board and preserves the issued material recipe', async () => {
    const task = { ...my.tasks[0]!, id: 51, process: 'CUT' };
    const attrs = { color: 'PU', material: 'TPE', length: 183, width: 61, thickness: 0.6, recipeCode: 'REC-001' };
    mocks.my.mockResolvedValue({ ...my, tasks: [task], inProgress: [{ ...inProgress, scheduleTaskId: 51, process: 'CUT', sourceStage: 'SHEET', outputStage: 'CUT' }], processes: [{ code: 'CUT', label: '立切', outputLabel: '片材', outputStage: 'CUT', outputUnit: '片', sources: ['SHEET'] }] });
    mocks.options.mockResolvedValue({ ...options, stages: [...options.stages, { code: 'CUT', label: '片材', unit: '片', defaultLocation: '片材区' }] });
    mocks.prepare.mockResolvedValue({ ...prepare, task, outputStage: 'CUT', outputLabel: '片材', outputAttrs: attrs });
    mocks.order.mockResolvedValue({ ...order, process: 'CUT', sourceStage: 'SHEET', outputStage: 'CUT', inputs: [{ ...order.inputs[0], stage: 'SHEET', item: { ...plannedAttrs, thickness: 4.5, recipeCode: 'REC-001', recipeName: '常规款' } }] });
    await mount();
    clickButton('报本工序产出');
    await flush();
    expect(document.body.textContent).toContain('实际产出：片材');
    expect(document.body.textContent).toContain('1830×610×6 mm');
    expect(document.body.textContent).toContain('1900×1300×45 mm');
    clickButton('不对？改一下'); await flush();
    const thickness = document.querySelector<HTMLInputElement>('[id^="wb-"][id$="-thickness"]');
    expect(thickness).toBeTruthy();
    expect(Number(thickness!.value)).toBe(6);
    fill(thickness!.id, 7); await flush();
    expect(document.body.textContent).toContain('1830×610×7 mm');
    fill(thickness!.id, 6); await flush();
    fill(document.querySelector('[id^="good-"]')!.id, 40);
    await flush();
    clickButton('下一步');
    await flush();
    clickButton('报工');
    await flush();
    expect(mocks.report).toHaveBeenCalledWith(expect.objectContaining({ taskId: 51, orderId: 5, outputs: [expect.objectContaining({ attrs: expect.objectContaining({ ...attrs, recipeName: '常规款' }), goodQuantity: 40 })] }));
  });
});
