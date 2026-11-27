import type { FdmgongchangStageStockApi as StockApi } from '#/api/fdmgongchang/stage-stock';
import type { FdmgongchangWorkbenchApi as Api } from '#/api/fdmgongchang/workbench';

import { createApp, nextTick } from 'vue';

import { Modal } from 'ant-design-vue';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import WorkbenchPage from './index.vue';

const mocks = vi.hoisted(() => ({
  access: vi.fn(),
  reassign: vi.fn(),
  route: { query: {} as Record<string, string> },
  routerPush: vi.fn(),
  factories: vi.fn(),
  setFactory: vi.fn(),
  mates: vi.fn(),
  create: vi.fn(),
  claim: vi.fn(),
  batchReport: vi.fn(),
  batchOptions: vi.fn(),
  myBatchIssue: vi.fn(),
  myBatchPrepare: vi.fn(),
  myBatchReport: vi.fn(),
  issue: vi.fn(),
  prepare: vi.fn(),
  prepareStock: vi.fn(),
  pickList: vi.fn(),
  report: vi.fn(),
  reportOrder: vi.fn(),
  my: vi.fn(),
  options: vi.fn(),
  order: vi.fn(),
  orderPage: vi.fn(),
  plan: vi.fn(),
  productionOrders: vi.fn(),
  stock: vi.fn(),
  supplement: vi.fn(),
  wage: vi.fn(),
  returnMaterial: vi.fn(),
}));
vi.mock('@vben/access', () => ({ useAccess: () => ({ hasAccessByCodes: mocks.access }) }));
vi.mock('#/api/fdmgongchang/schedule', () => ({ reassignScheduleTasks: mocks.reassign }));
vi.mock('#/api/fdmgongchang/stage-stock', async (importOriginal) => ({
  ...await importOriginal<typeof import('#/api/fdmgongchang/stage-stock')>(),
  getOrderPage: mocks.orderPage,
}));
vi.mock('vue-router', () => ({
  useRoute: () => mocks.route,
  useRouter: () => ({ push: mocks.routerPush }),
}));
vi.mock('#/api/fdmgongchang/factory', () => ({
  getMyFactories: mocks.factories,
  setCurrentFactoryId: mocks.setFactory,
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
  batchReportWorkbenchTasks: mocks.batchReport,
  getWorkbenchBatchOptions: mocks.batchOptions,
  claimWorkbenchTask: mocks.claim,
  createWorkbenchOrder: mocks.create,
  issueWorkbenchTask: mocks.issue,
  issueMyWorkbenchBatch: mocks.myBatchIssue,
  prepareMyWorkbenchBatch: mocks.myBatchPrepare,
  reportMyWorkbenchBatch: mocks.myBatchReport,
  getWorkbench: mocks.my,
  getWorkbenchMates: mocks.mates,
  getWorkbenchOptions: mocks.options,
  getWorkbenchOrder: mocks.order,
  getWorkbenchRecipePlan: mocks.plan,
  getWorkbenchStock: mocks.stock,
  getWorkbenchPickList: mocks.pickList,
  getWorkbenchProductionOrders: mocks.productionOrders,
  matchWorkbenchWage: mocks.wage,
  prepareWorkbenchTask: mocks.prepare,
  prepareWorkbenchTaskStock: mocks.prepareStock,
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
      workerIds: '2',
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

function clickButton(text: string, exact = false) {
  const el = [...document.querySelectorAll('button')].find((button) => {
    const label = button.textContent?.replaceAll(/\s/g, '');
    return exact ? label === text : label?.includes(text);
  });
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
  const mount = async (process?: string) => {
    if (process) mocks.mates.mockResolvedValue([{ userId: 2, nickname: '张三', team: '开片一组' }, { userId: 3, nickname: '李四', team: '开片一组' }]);
    const host = document.createElement('div');
    document.body.append(host);
    const app = createApp(WorkbenchPage, { process });
    app.mount(host);
    unmount = () => app.unmount();
    await flush();
  };
  beforeEach(() => {
    mocks.route.query = {};
    mocks.access.mockImplementation((codes: string[]) => !codes.some((code) => code.startsWith('fdmgongchang:stage-stock:')));
    mocks.reassign.mockResolvedValue(1);
    mocks.factories.mockResolvedValue({
      canSeeAll: false,
      defaultFactoryId: 1,
      factories: [{ code: 'HBFDM', deptId: 118, id: 1, name: '黄石工厂' }],
    });
    mocks.my.mockResolvedValue({ ...my, inProgress: [] });
    mocks.options.mockResolvedValue(options);
    mocks.create.mockResolvedValue(7);
    mocks.claim.mockResolvedValue(true);
    mocks.batchReport.mockResolvedValue({ reported: 1, orderIds: [10], warnings: [] });
    mocks.batchOptions.mockResolvedValue({ boards: [{ itemCode: 'BC-1', label: '紫色板材', attrs: board.item }], defaultBoardItemCode: 'BC-1' });
    mocks.issue.mockResolvedValue(5);
    mocks.report.mockResolvedValue(5);
    mocks.pickList.mockResolvedValue([prepare]);
    mocks.prepare.mockResolvedValue(prepare);
    mocks.prepareStock.mockResolvedValue(prepare);
    mocks.productionOrders.mockResolvedValue([]);
    mocks.stock.mockResolvedValue({ list: [board], total: 1 });
    mocks.order.mockResolvedValue(order);
    mocks.orderPage.mockResolvedValue({ list: [], total: 0 });
    mocks.wage.mockResolvedValue([{ itemId: 1, matched: true, name: '开片', price: 27, score: 0, unit: 'm³' }]);
    mocks.mates.mockResolvedValue([]);
  });

  const workshop = (): Api.My => ({
    ...my,
    inProgress: [],
    workshopProcess: my.processes[0],
    workshopTasks: [
      ...my.tasks,
      ...my.hall!,
      { ...my.tasks[0]!, id: 34, contractCode: 'HT-OTHER', workerIds: '3', workerNames: '李四', workDate: '2025-01-01' },
      { ...my.tasks[0]!, id: 35, contractCode: 'HT-DONE', status: 'DONE', actualQuantity: 400, workerIds: '2' },
      { ...my.tasks[0]!, id: 36, contractCode: 'HT-PACK', process: 'PACK' },
      { ...my.tasks[0]!, id: 37, contractCode: 'HT-OTHER-DONE', status: 'DONE', actualQuantity: 400, workerIds: '3' },
    ],
  });

  const openOrderView = async () => {
    if (document.querySelector('.workshop-order-table')) return;
    clickButton('按订单查看', true);
    await flush();
  };
  const expandOrder = async (orderNo: string) => {
    await openOrderView();
    const row = [...document.querySelectorAll<HTMLElement>('[data-order-key]')].find((row) => row.dataset.orderKey === orderNo)!;
    [...row.querySelectorAll<HTMLButtonElement>('button')].find((button) => button.textContent?.includes('展开订单'))!.click();
    await flush();
  };
  const selectTask = async (id: number) => {
    document.querySelector<HTMLInputElement>(`[data-task-id="${id}"] input[type="checkbox"]`)!.click();
    await flush();
  };

  it('opens the workshop on the inventory flow and keeps order progress available separately', async () => {
    const negativeBoard = { ...board, batchNo: 'BOARD-DEBT', quantity: -8 };
    const sheets = { ...board, batchNo: 'SHEET-READY', id: 12, quantity: 24, stage: 'SHEET' };
    mocks.my.mockResolvedValue({ ...workshop(), inProgress: [my.inProgress[0]!] });
    mocks.stock.mockImplementation(async (stage: string) => ({ list: stage === 'BOARD' ? [negativeBoard] : [sheets], total: 1 }));

    await mount('SLICE');
    const inventory = document.body.textContent;
    expect(inventory).toContain('上道可领库存');
    expect(inventory).toContain('本工序在制');
    expect(inventory).toContain('可供下道的库存');
    expect(inventory).toContain('GX20261011-001');
    expect(inventory).toContain('BOARD-DEBT');
    expect(inventory).toMatch(/-8\s*张/);
    expect(inventory).toContain('SHEET-READY');
    expect(inventory).toMatch(/24\s*片/);
    expect(document.querySelector('.workshop-order-table')).toBeNull();
    expect(mocks.orderPage).not.toHaveBeenCalled();

    await openOrderView();
    expect(document.querySelector('.workshop-order-table')).not.toBeNull();
    expect(document.body.textContent).toContain('本车间完成进度');
    expect(document.body.textContent).not.toContain('BOARD-DEBT');
  });

  it('opens an existing in-progress processing order directly for output reporting', async () => {
    mocks.my.mockResolvedValue({ ...workshop(), inProgress: [my.inProgress[0]!] });

    await mount('SLICE');
    clickButton('报产出', true);
    await flush();

    expect(mocks.order).toHaveBeenCalledExactlyOnceWith(5);
    expect(document.querySelector('[id^="total-"]')).not.toBeNull();
    expect(mocks.create).not.toHaveBeenCalled();
    expect(mocks.issue).not.toHaveBeenCalled();
  });

  it('lists another operator’s in-progress orders for workshop stock readers without letting them report', async () => {
    mocks.access.mockImplementation((codes: string[]) => !codes.includes('fdmgongchang:stage-stock:operate'));
    mocks.my.mockResolvedValue(workshop());
    mocks.orderPage.mockResolvedValue({
      list: [{ ...order, id: 13, operatorName: '李四', operatorUserId: 3, orderNo: 'GX-WORKSHOP-002' }],
      total: 1,
    });

    await mount('SLICE');
    expect(mocks.orderPage).toHaveBeenCalledWith(expect.objectContaining({ process: 'SLICE', status: 'IN_PROGRESS' }));
    expect(document.body.textContent).toContain('GX-WORKSHOP-002');
    expect([...document.querySelectorAll('button')].some((button) => button.textContent?.trim() === '报产出')).toBe(false);
    expect(mocks.order).not.toHaveBeenCalled();
  });

  it('records actual material use and output together from the workshop even when the source ledger is negative', async () => {
    const negativeBoard = { ...board, batchNo: 'BOARD-DEBT', quantity: -8 };
    mocks.my.mockResolvedValue(workshop());
    mocks.stock.mockImplementation(async (stage: string) => stage === 'BOARD'
      ? { list: [negativeBoard], total: 1 }
      : { list: [], total: 0 });

    await mount('SLICE');
    clickButton('补录领料并报工', true);
    await flush();
    clickButton('批次BOARD-DEBT');
    await flush();
    fill('actual-pick-11', 3);
    await flush();
    expect(document.body.textContent).toContain('领料后欠账 11 张，需补录上工序产出');
    clickButton('下一步：确认领料');
    await flush();
    clickButton('已经做完了，领料同时报数量');
    await flush();
    fill(document.querySelector<HTMLInputElement>('[id^="wb-"][id$="-thickness"]')!.id, 3);
    fill(document.querySelector<HTMLInputElement>('[id^="total-"]')!.id, 5);
    await flush();
    clickButton('下一步');
    await flush();
    document.querySelector<HTMLInputElement>('input[aria-label="确认本批全部做完"]')!.click();
    await flush();
    clickButton('提交');
    await flush();

    expect(mocks.create).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({
      finish: true,
      process: 'SLICE',
      sourceStage: 'BOARD',
      inputs: [{ laminationSide: undefined, quantity: 3, stockId: 11 }],
      outputs: [expect.objectContaining({ goodQuantity: 5, defectQuantity: 0 })],
    }));
    expect(mocks.reportOrder).not.toHaveBeenCalled();
  });

  it('groups all workshop tasks by order and expands tasks without a claim step', async () => {
    const value = workshop();
    value.workshopTasks!.push({ ...my.tasks[0]!, id: 39 });
    mocks.my.mockResolvedValue(value);
    await mount('SLICE');
    expect(mocks.my).toHaveBeenCalledExactlyOnceWith('SLICE');
    expect(document.querySelector('h1')?.textContent).toBe('开片车间');
    await openOrderView();
    expect(document.querySelectorAll('[data-order-key]')).toHaveLength(4);
    expect(document.querySelectorAll('[data-task-id]')).toHaveLength(0);
    expect(document.querySelector('.workshop-order-table article')).toBeNull();
    await expandOrder('HT-001');
    expect(document.querySelectorAll('[data-task-id]')).toHaveLength(2);
    expect(document.querySelector('[data-task-id="31"]')).not.toBeNull();
    expect(document.querySelector('[data-task-id="39"]')).not.toBeNull();
    expect([...document.querySelectorAll('button')].some((button) => button.textContent?.includes('领取任务'))).toBe(false);
    expect(document.body.textContent).not.toContain('HT-PACK');
    expect(document.body.textContent).not.toContain('HT-DONE');
    await expandOrder('HT-OTHER');
    expect(document.querySelector<HTMLInputElement>('[data-task-id="34"] input[type="checkbox"]')!.disabled).toBe(false);
    fill('workshop-keyword', 'HT-OTHER'); await flush();
    expect(document.querySelectorAll('[data-order-key]')).toHaveLength(1);
  });

  it('submits selected tasks and independent good/defect quantities in one call without claiming or issuing', async () => {
    const task = { ...my.hall![1]!, workerIds: '2', actualQuantity: 10, defectQuantity: 2 };
    mocks.my.mockResolvedValue({ ...workshop(), userId: 9, userName: '车间主任', workshopTasks: [task] });
    await mount('SLICE'); await expandOrder('HT-003');
    expect(document.querySelector<HTMLInputElement>('#good-HT-003-33')!.disabled).toBe(true);
    await selectTask(33);
    fill('good-HT-003-33', 20); fill('defect-HT-003-33', 3); await flush();
    clickButton('批量报工'); await flush();
    expect(mocks.batchReport).toHaveBeenCalledExactlyOnceWith({
      requestId: expect.stringMatching(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/), process: 'SLICE', rows: [{
        taskId: 33, operatorUserId: 2, goodQuantity: 20, defectQuantity: 3, expectedActualQuantity: 10, expectedDefectQuantity: 2,
      }],
    });
    expect(mocks.my).toHaveBeenLastCalledWith('SLICE');
    expect(mocks.claim).not.toHaveBeenCalled(); expect(mocks.issue).not.toHaveBeenCalled();
  });

  it('requires an actual production person rather than silently charging the logged-in director', async () => {
    mocks.my.mockResolvedValue({ ...workshop(), userId: 9, userName: '车间主任', workshopTasks: [{ ...my.tasks[0]!, workerIds: undefined }] });
    await mount('SLICE'); await expandOrder('HT-001'); await selectTask(31);
    fill('good-HT-001-31', 10); await flush(); clickButton('批量报工'); await flush();
    expect(mocks.batchReport).not.toHaveBeenCalled();
    expect(document.body.textContent).toContain('请选择本次实际生产人员');
    expect(document.body.textContent).toContain('录入：车间主任');
  });

  it('blocks batch reporting and dispatch for an already-issued task and names the owner', async () => {
    mocks.my.mockResolvedValue({ ...workshop(), workshopTasks: [{ ...my.tasks[0]!, activeOrderId: 77, activeOperatorUserId: 3, activeOperatorName: '李四' }] });
    await mount('SLICE'); await expandOrder('HT-001');
    const row = document.querySelector<HTMLElement>('[data-task-id="31"]')!;
    expect(row.dataset.progressColor).toBe('gold');
    expect(row.querySelector<HTMLInputElement>('input[type="checkbox"]')!.disabled).toBe(true);
    expect(document.body.textContent).toContain('李四 已领料 · 工序单 #77');
    expect(document.body.textContent).toContain('我的工作台 → 正在做');
    clickButton('批量报工'); await flush();
    expect(mocks.batchReport).not.toHaveBeenCalled();
  });

  it('dispatches selected tasks to a qualified worker without issuing material', async () => {
    mocks.my.mockResolvedValue({ ...workshop(), workshopTasks: [my.tasks[0]!] });
    await mount('SLICE'); await expandOrder('HT-001'); await selectTask(31);
    clickButton('派给员工'); await flush();
    document.querySelector('#workshop-dispatch-workers')!.closest('.ant-select')!.querySelector('.ant-select-selector')!.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    await flush();
    const option = [...document.querySelectorAll<HTMLElement>('.ant-select-item-option')].find((item) => item.textContent?.includes('李四'))!;
    option.click(); await flush();
    expect(document.body.textContent).toContain('不会拆成多人独立领料的任务');
    clickButton('确认派工'); await flush();
    expect(mocks.reassign).toHaveBeenCalledExactlyOnceWith({ taskIds: [31], toWorkerIds: [3] });
    expect(mocks.issue).not.toHaveBeenCalled();
    expect(mocks.batchReport).not.toHaveBeenCalled();
  });

  it('hides dispatch without schedule confirmation permission', async () => {
    mocks.access.mockReturnValue(false);
    mocks.my.mockResolvedValue(workshop()); await mount('SLICE');
    await openOrderView();
    expect([...document.querySelectorAll('button')].some((button) => button.textContent?.includes('派给员工'))).toBe(false);
  });

  it('keeps the confirmed folding requirement read-only and submits that requirement', async () => {
    const process = { code: 'FOLD', label: '折叠', outputLabel: '已折叠', outputStage: 'FOLDED', outputUnit: '片', sources: ['CUT'] };
    const task = { ...my.tasks[0]!, process: 'FOLD', output: { stage: 'FOLDED', foldingType: '八折' } };
    mocks.my.mockResolvedValue({ ...workshop(), processes: [process], workshopProcess: process, workshopTasks: [task] });
    await mount('FOLD'); await expandOrder('HT-001'); await selectTask(31);
    expect(document.body.textContent).toContain('按订单折叠：八折');
    expect(document.querySelector('#fold-HT-001-31')).toBeNull();
    fill('good-HT-001-31', 10); await flush(); clickButton('批量报工'); await flush();
    expect(mocks.batchReport).toHaveBeenCalledWith(expect.objectContaining({ rows: [expect.objectContaining({ foldingType: '八折', operatorUserId: 2 })] }));
  });

  it('refuses zero-quantity batches and allows a defect-only report', async () => {
    mocks.my.mockResolvedValue({ ...workshop(), workshopTasks: [my.tasks[0]!] });
    await mount('SLICE'); await expandOrder('HT-001'); await selectTask(31);
    fill('good-HT-001-31', 0); await flush();
    clickButton('批量报工'); await flush();
    expect(mocks.batchReport).not.toHaveBeenCalled();
    expect(document.body.textContent).toContain('合计必须大于 0');
    fill('defect-HT-001-31', 2); await flush(); clickButton('批量报工'); await flush();
    expect(mocks.batchReport).toHaveBeenCalledWith(expect.objectContaining({ rows: [expect.objectContaining({ goodQuantity: 0, defectQuantity: 2 })] }));
  });

  it('reports all selected rows once and retains wage warnings after refresh', async () => {
    const first = { ...my.tasks[0]! };
    const second = { ...first, id: 39 };
    const value = { ...workshop(), workshopTasks: [first, second] };
    mocks.my.mockResolvedValue(value);
    mocks.batchReport.mockResolvedValue({ reported: 2, orderIds: [10, 11], warnings: ['任务 #39 未匹配计件单价，请补充计件'] });
    await mount('SLICE'); await expandOrder('HT-001'); await selectTask(31); await selectTask(39);
    fill('good-HT-001-31', 12); fill('good-HT-001-39', 20); fill('defect-HT-001-39', 2); await flush();
    mocks.my.mockResolvedValue({ ...value, workshopTasks: [{ ...first, actualQuantity: 12 }, { ...second, actualQuantity: 20, defectQuantity: 2 }] });
    clickButton('批量报工'); await flush();
    expect(mocks.batchReport.mock.calls[0]![0].rows).toEqual([
      expect.objectContaining({ taskId: 31, goodQuantity: 12, defectQuantity: 0 }),
      expect.objectContaining({ taskId: 39, goodQuantity: 20, defectQuantity: 2 }),
    ]);
    expect(document.querySelector('.ant-alert-warning')?.textContent).toContain('任务 #39 未匹配计件单价，请补充计件');
    expect(document.querySelector<HTMLInputElement>('#good-HT-001-31')!.disabled).toBe(true);
  });

  it.each(['CUT', 'LAMINATE', 'EMBOSS', 'PUNCH', 'ENGRAVE', 'FOLD'])('prefills unreported planned output as integers for the %s workshop', async (code) => {
    const process = { code, label: code, outputLabel: '片材', outputStage: 'CUT', outputUnit: '片', sources: ['CUT'] };
    const task = { ...my.tasks[0]!, process: code, actualQuantity: '10.000', defectQuantity: '2.000' };
    mocks.my.mockResolvedValue({ ...workshop(), processes: [process], workshopProcess: process, workshopTasks: [task] });
    await mount(code); await expandOrder('HT-001'); await selectTask(31);
    expect(document.querySelector<HTMLInputElement>('#good-HT-001-31')!.value).toBe('388');
    expect(document.querySelector<HTMLInputElement>('#defect-HT-001-31')!.value).toBe('0');
    fill('good-HT-001-31', 300); await flush();
    await selectTask(31); await selectTask(31);
    expect(document.querySelector<HTMLInputElement>('#good-HT-001-31')!.value).toBe('300');
    const headers = [...document.querySelectorAll('.workshop-task-table thead th')].map((element) => element.textContent);
    expect(headers.indexOf('实际生产 / 计件人员')).toBeLessThan(headers.indexOf('成品要求'));
    expect(headers.indexOf('本次良品')).toBeLessThan(headers.findIndex((value) => value?.startsWith('报工')));
  });

  it('prefills slicing from board yield minus reported output while displaying order demand', async () => {
    const task = { ...my.tasks[0]!, quantity: 250, sliceBoardYield: '252', actualQuantity: 10, defectQuantity: 2,
      inputs: [{ stage: 'BOARD', code: 'BC-2', attrs: { ...board.item, length: 192, width: 132, thickness: 4.5 } }] };
    const withoutBoardYield = { ...task, id: 39, sliceBoardYield: null };
    mocks.my.mockResolvedValue({ ...workshop(), workshopTasks: [task, withoutBoardYield] });
    await mount('SLICE'); await expandOrder('HT-001'); await selectTask(31);
    expect(document.querySelector('[data-task-id="31"]')?.textContent).toContain('计划 250');
    expect(document.querySelector('[data-task-id="31"]')?.textContent).toContain('领用板材 1920×1320×45 mm · BC-2');
    expect(document.querySelector('[data-task-id="31"]')?.textContent).toContain('计划用板可开 252');
    expect(document.querySelector<HTMLInputElement>('#good-HT-001-31')!.value).toBe('240');
    expect(document.querySelector<HTMLInputElement>('#good-HT-001-39')!.value).toBe('');
    clickButton('批量报工'); await flush();
    expect(mocks.batchReport).toHaveBeenCalledWith(expect.objectContaining({ rows: [expect.objectContaining({
      taskId: 31, goodQuantity: 240, defectQuantity: 0, expectedActualQuantity: 10, expectedDefectQuantity: 2,
    })] }));
  });

  it('reports laminated sheets by color and keeps the undamaged opposite sheets in stock', async () => {
    const process = { code: 'LAMINATE', label: '贴合', outputLabel: '已复合片材', outputStage: 'LAMINATED', outputUnit: '片', sources: ['CUT'] };
    const task = { ...my.tasks[0]!, process: 'LAMINATE', quantity: 540, output: { stage: 'LAMINATED', attrs: { frontColor: 'PU', backColor: 'RD' } } };
    mocks.my.mockResolvedValue({ ...workshop(), processes: [process], workshopProcess: process, workshopTasks: [task] });
    await mount('LAMINATE'); await expandOrder('HT-001'); await selectTask(31);
    const headers = [...document.querySelectorAll('.workshop-task-table thead th')].map((element) => element.textContent);
    const outputIndex = headers.findIndex((title) => title?.startsWith('报工产出'));
    expect(outputIndex).toBe(headers.indexOf('本次片材残次') + 1);
    expect(headers[outputIndex + 1]).toBe('计划 / 累计已报');
    expect(document.querySelector<HTMLInputElement>('#good-HT-001-31-FRONT')!.value).toBe('540');
    expect(document.querySelector<HTMLInputElement>('#good-HT-001-31-BACK')!.value).toBe('540');
    fill('defect-HT-001-31-FRONT', 40); await flush();
    expect(document.querySelector<HTMLInputElement>('#good-HT-001-31-FRONT')!.value).toBe('500');
    expect(document.querySelector<HTMLInputElement>('#good-HT-001-31-BACK')!.value).toBe('540');
    expect(document.body.textContent).toContain('本次贴合良品 500');
    clickButton('批量报工'); await flush();
    expect(mocks.batchReport).toHaveBeenCalledWith(expect.objectContaining({ rows: [expect.objectContaining({
      taskId: 31, goodQuantity: 500, defectQuantity: 40,
      laminateDefects: [{ side: 'FRONT', color: 'PU', goodQuantity: 500, quantity: 40 }, { side: 'BACK', color: 'RD', goodQuantity: 540, quantity: 0 }],
    })] }));
  });

  it('shows cumulative lamination progress by side and marks incomplete legacy quantities', async () => {
    const process = { code: 'LAMINATE', label: '贴合', outputLabel: '已复合片材', outputStage: 'LAMINATED', outputUnit: '片', sources: ['CUT'] };
    const task = { ...my.tasks[0]!, process: 'LAMINATE', status: 'DONE', quantity: 100, actualQuantity: 90,
      defectQuantity: 10, output: { stage: 'LAMINATED', attrs: { frontColor: '2113', backColor: '511U' } },
      laminationActuals: { frontGoodQuantity: 96, backGoodQuantity: 90, frontDefectQuantity: 4,
        backDefectQuantity: 10, goodQuantityLowerBound: false } };
    mocks.my.mockResolvedValue({ ...workshop(), processes: [process], workshopProcess: process, workshopTasks: [task,
      { ...task, id: 32, laminationActuals: { ...task.laminationActuals, frontGoodQuantity: 90,
        frontDefectQuantity: null, goodQuantityLowerBound: true } },
      { ...task, id: 33, status: 'OPEN', actualQuantity: 0 },
    ] });
    await mount('LAMINATE'); await expandOrder('HT-001');
    const row = (id: number) => document.querySelector(`[data-task-id="${id}"]`)!;
    const layers = (id: number) => [...row(id).querySelectorAll('[data-lamination-progress]')]
      .map((element) => element.textContent!.replaceAll(/\s+/g, ' '));
    expect(layers(31)).toEqual(['正面 · 2113 正常 96 片 · 瑕疵 4 片', '反面 · 511U 正常 90 片 · 瑕疵 10 片']);
    expect(row(31).textContent).toContain('已贴合良品 90 片');
    expect(row(31).textContent).not.toContain('已报残次');
    expect(layers(32)).toEqual(['正面 · 2113 正常 至少 90 片 · 瑕疵 未分色', '反面 · 511U 正常 至少 90 片 · 瑕疵 10 片']);
  });

  it('distinguishes reported shortages, fulfilled plans and closed tasks in workshop rows, counts and filters', async () => {
    const process = { code: 'LAMINATE', label: '贴合', outputLabel: '已复合片材', outputStage: 'LAMINATED', outputUnit: '片', sources: ['CUT'] };
    const reported = { ...my.tasks[0]!, process: 'LAMINATE', status: 'DONE', quantity: 200,
      orderCount: 1, completedOrderCount: 1, output: { stage: 'LAMINATED', attrs: { frontColor: '5793', backColor: '2463 C' } } };
    const shortOrder = 'GD20261120-002';
    mocks.my.mockResolvedValue({ ...workshop(), processes: [process], workshopProcess: process, workshopTasks: [
      { ...reported, id: 926, contractCode: shortOrder, actualQuantity: 185, defectQuantity: 15,
        laminationActuals: { frontGoodQuantity: 185, backGoodQuantity: 186, frontDefectQuantity: 15, backDefectQuantity: 14, goodQuantityLowerBound: false } },
      { ...reported, id: 927, contractCode: 'HT-FULFILLED', actualQuantity: 200 },
      { ...reported, id: 928, contractCode: 'HT-FULFILLED', actualQuantity: 201 },
      { ...reported, id: 929, contractCode: 'HT-CLOSED', status: 'CLOSED', actualQuantity: 0, orderCount: 0, completedOrderCount: 0 },
      { ...reported, id: 930, contractCode: 'HT-HANDLED', actualQuantity: 190, shortageHandledAt: '2026-11-21 09:00:00', shortageNote: '已补派 10 片' },
      { ...reported, id: 931, contractCode: shortOrder, actualQuantity: 200 },
    ] });
    const visibleOrderKeys = () => [...document.querySelectorAll<HTMLElement>('[data-order-key]')].map((row) => row.dataset.orderKey);
    const expectProgress = (key: string, completed: number, total: number, percent: number) => {
      const bar = document.querySelector(`[data-order-key="${key}"] [role="progressbar"]`)!;
      const cellText = bar.closest('td')!.textContent!;
      expect(bar.getAttribute('aria-valuenow')).toBe(String(percent));
      expect(bar.getAttribute('aria-valuetext')).toBe(`良品达标 ${completed} / ${total} 项任务`);
      expect(cellText).toMatch(new RegExp(`良品达标\\s*${completed} / ${total} 项`));
      expect(cellText).toContain(`${percent}%`);
      return cellText;
    };
    const taskRow = (id: number) => document.querySelector<HTMLElement>(`[data-task-id="${id}"]`)!;
    const reportStatus = (id: number) => taskRow(id).querySelector('.ant-tag')!;
    const outputStatus = (id: number) => taskRow(id).querySelector('.ant-tag-gold, .ant-tag-green')!;
    const changeFilter = async (label: string) => {
      document.querySelector('#workshop-status')!.closest('.ant-select')!.querySelector('.ant-select-selector')!
        .dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
      await flush();
      const option = [...document.querySelectorAll<HTMLElement>('.ant-select-item-option')].find((item) => item.textContent === label)!;
      option.click(); await flush();
    };

    await mount('LAMINATE');
    await openOrderView();
    const orderHeaders = [...document.querySelectorAll('.workshop-order-table thead th')].map((header) => header.textContent);
    expect(orderHeaders[orderHeaders.indexOf('订单 / 客户') + 1]).toBe('本车间完成进度');
    expect(document.body.textContent).toMatch(/待跟进任务\s*1/);
    expect(visibleOrderKeys()).toEqual([shortOrder]);
    expect(expectProgress(shortOrder, 1, 2, 50)).toMatch(/待跟进\s*1/);
    await expandOrder(shortOrder);
    expect(reportStatus(926).textContent).toBe('报工已结束');
    expect(outputStatus(926).textContent).toBe('良品未达计划');
    expect(outputStatus(926).closest('td')).not.toBe(reportStatus(926).closest('td'));
    expect(taskRow(926).dataset.progressColor).toBe('gold');
    expect(outputStatus(926).classList.contains('ant-tag-gold')).toBe(true);
    expect(outputStatus(926).closest('td')?.textContent).toContain('计划 200 片');
    expect(outputStatus(926).closest('td')?.textContent).toContain('已贴合良品 185 片');
    expect(outputStatus(926).closest('td')?.textContent).toContain('良品缺口 15 片');
    expect(taskRow(926).querySelector<HTMLInputElement>('input[type="checkbox"]')!.disabled).toBe(true);

    await changeFilter('有达标任务');
    expect(visibleOrderKeys()).toEqual([shortOrder, 'HT-FULFILLED']);
    await changeFilter('全部任务达标');
    expect(visibleOrderKeys()).toEqual(['HT-FULFILLED']);
    expect(expectProgress('HT-FULFILLED', 2, 2, 100)).not.toMatch(/待跟进|差额已处理|已关闭/);
    await expandOrder('HT-FULFILLED');
    for (const id of [927, 928]) {
      expect(reportStatus(id).textContent).toBe('报工已结束');
      expect(outputStatus(id).textContent).toBe('良品已达计划');
      expect(taskRow(id).dataset.progressColor).toBe('green');
      expect(outputStatus(id).classList.contains('ant-tag-green')).toBe(true);
      expect(taskRow(id).textContent).not.toContain('良品缺口');
    }

    await changeFilter('全部订单');
    const visibleOrders = visibleOrderKeys();
    expect(visibleOrders).toHaveLength(4);
    expect(visibleOrders).toEqual(
      expect.arrayContaining([shortOrder, 'HT-CLOSED', 'HT-FULFILLED', 'HT-HANDLED']),
    );
    expect(expectProgress('HT-CLOSED', 0, 1, 0)).toMatch(/已关闭\s*1/);
    await expandOrder('HT-CLOSED');
    expect(reportStatus(929).textContent).toBe('已关闭');
    expect(taskRow(929).dataset.progressColor).toBeUndefined();
    expect(taskRow(929).querySelector<HTMLInputElement>('input[type="checkbox"]')!.disabled).toBe(true);
    expect(expectProgress('HT-HANDLED', 0, 1, 0)).toMatch(/差额已处理\s*1/);
    await expandOrder('HT-HANDLED');
    expect(reportStatus(930).textContent).toBe('报工已结束');
    expect(outputStatus(930).textContent).toBe('良品未达计划');
    expect(taskRow(930).textContent).toContain('良品缺口 10 片');
  });

  it('shows the original task as completed when its supplemental work fills the good quantity gap', async () => {
    const process = { code: 'PUNCH', label: '冲切', outputLabel: '成品', outputStage: 'FINISHED', outputUnit: '件', sources: ['CUT'] };
    const original = { ...my.tasks[0]!, id: 1128, process: 'PUNCH', contractCode: 'GD20261124-004',
      status: 'CLAIMED', orderCount: 1, quantity: 6891, actualQuantity: 6800, defectQuantity: 91, unit: '件' };
    const supplement = { ...original, id: 1144, status: 'DONE', quantity: 91, actualQuantity: 91,
      defectQuantity: 0, parentTaskId: 1128 };
    const unrelated = { ...original, id: 1139, quantity: 4491, actualQuantity: 4400 };
    const data = { ...workshop(), processes: [process], workshopProcess: process };
    mocks.my.mockResolvedValue({ ...data, workshopTasks: [
      { ...original, supplementGoodQuantity: '90', shortage: 1 }, { ...supplement, actualQuantity: 90 }, unrelated,
    ] });

    await mount('PUNCH'); await expandOrder('GD20261124-004');
    const row = (id: number) => document.querySelector<HTMLElement>(`[data-task-id="${id}"]`)!;
    expect(row(1128).querySelector('.ant-tag')?.textContent).toBe('部分报工');
    expect(row(1128).textContent).toContain('良品缺口 1 件');

    mocks.my.mockResolvedValue({ ...data, workshopTasks: [
      { ...original, completedBySupplement: true, supplementGoodQuantity: '91' }, supplement, unrelated,
    ] });
    clickButton('刷新'); await flush();

    expect(row(1128).querySelector('.ant-tag')?.textContent).toBe('已完成');
    expect(row(1128).dataset.progressColor).toBe('green');
    expect(row(1128).textContent).toContain('已报良品 6,800 件');
    expect(row(1128).textContent).toContain('已报残次 91 件');
    expect(row(1128).textContent).toContain('补派良品 91 件');
    expect(row(1128).textContent).toContain('累计良品 6,891 件');
    expect(row(1128).textContent).toContain('良品已补齐');
    expect(row(1128).querySelector<HTMLInputElement>('input[type="checkbox"]')?.disabled).toBe(true);
    expect(row(1144).textContent).toContain('补派子任务 · 原任务 #1128');
    expect(row(1139).querySelector('.ant-tag')?.textContent).toBe('部分报工');
  });

  it('recalculates the estimate after another report changes the refreshed task progress', async () => {
    const task = { ...my.tasks[0]!, quantity: 100, sliceBoardYield: 108 };
    mocks.my.mockResolvedValue({ ...workshop(), workshopTasks: [task] });
    await mount('SLICE'); await expandOrder('HT-001'); await selectTask(31);
    expect(document.querySelector<HTMLElement>('[data-task-id="31"]')!.dataset.progressColor).toBeUndefined();
    expect(document.querySelector<HTMLInputElement>('#good-HT-001-31')!.value).toBe('108');
    mocks.my.mockResolvedValue({ ...workshop(), workshopTasks: [{ ...task, actualQuantity: 60 }] });
    clickButton('刷新'); await flush(); await selectTask(31);
    expect(document.querySelector<HTMLElement>('[data-task-id="31"]')!.dataset.progressColor).toBe('gold');
    expect(document.querySelector<HTMLInputElement>('#good-HT-001-31')!.value).toBe('48');
    clickButton('批量报工'); await flush();
    expect(mocks.batchReport).toHaveBeenCalledWith(expect.objectContaining({ rows: [expect.objectContaining({ goodQuantity: 48, expectedActualQuantity: 60 })] }));
  });

  it('prefills whole-batch output as good quantity and submits it for foaming', async () => {
    const process = { code: 'MIX', label: '发泡', outputLabel: '板材', outputStage: 'BOARD', outputUnit: '张', sources: ['RAW'] };
    const task = { ...my.tasks[0]!, process: 'MIX', quantity: 34, unit: '张', actualQuantity: 0,
      output: { stage: 'BOARD', mixPlan: { wholeBatchBoards: '35' } } };
    mocks.batchOptions.mockResolvedValueOnce({
      boards: [{ itemCode: 'BC-1', label: '紫色板材', attrs: board.item }],
      defaultBoardItemCode: 'BC-1', boardChangeReason: '开片任务已领料，请使用原板材。',
    });
    mocks.my.mockResolvedValue({ ...workshop(), processes: [process], workshopProcess: process, workshopTasks: [task] });
    await mount('MIX'); await expandOrder('HT-001'); await selectTask(31);
    expect(Number(document.querySelector<HTMLInputElement>('#good-HT-001-31')!.value)).toBe(35);
    expect(document.querySelector('[data-task-id="31"]')?.textContent).toContain('开片任务已领料，请使用原板材。');
    clickButton('批量报工'); await flush();
    expect(mocks.batchReport).toHaveBeenCalledWith(expect.objectContaining({ rows: [expect.objectContaining({ taskId: 31, goodQuantity: 35, defectQuantity: 0, boardItemCode: 'BC-1' })] }));
  });

  it('previews the selected foaming board and linked slicing task while preserving manual good quantity', async () => {
    const process = { code: 'MIX', label: '发泡', outputLabel: '板材', outputStage: 'BOARD', outputUnit: '张', sources: ['RAW'] };
    const task = { ...my.tasks[0]!, process: 'MIX', quantity: 5, unit: '张', actualQuantity: 0,
      output: { stage: 'BOARD', attrs: board.item, mixPlan: { wholeBatchBoards: 6 } } };
    const defaultBoard = { itemCode: 'BC-1', label: '原计划模具', attrs: board.item };
    const customBoard = {
      itemCode: 'BC-2', label: '替代模具', attrs: { ...board.item, length: 192, width: 132, thickness: 4.5 },
      plannedBoards: 8, recipeBatches: 2, mixPlan: { mouldName: '替代模具', wholeBatchBoards: 10 },
      sliceTaskId: 32, sliceQuantity: 100, sliceBoardYield: 120,
    };
    mocks.batchOptions.mockResolvedValue({ boards: [defaultBoard, customBoard], defaultBoardItemCode: 'BC-1' });
    mocks.my.mockResolvedValue({ ...workshop(), processes: [process], workshopProcess: process, workshopTasks: [task] });
    await mount('MIX'); await expandOrder('HT-001'); await selectTask(31);
    const good = document.querySelector<HTMLInputElement>('#good-HT-001-31')!;
    const row = document.querySelector('[data-task-id="31"]')!;
    expect(good.value).toBe('6');

    async function chooseBoard(code: string) {
      document.querySelector('#board-HT-001-31')!.closest('.ant-select')!.querySelector('.ant-select-selector')!
        .dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
      await flush();
      [...document.querySelectorAll<HTMLElement>('.ant-select-item-option')].find((item) => item.textContent?.includes(code))!.click();
      await flush();
    }
    await chooseBoard('BC-2');
    expect(row.textContent).toContain('1920×1320×45 mm');
    expect(row.textContent).toContain('选板后计划 8 张');
    expect(row.textContent).toContain('整锅可出10 张');
    expect(row.textContent).toContain('关联开片任务 #32 · 计划 100 片 · 可开 120 片');
    expect(good.value).toBe('10');

    fill('good-HT-001-31', 9); await flush();
    await chooseBoard('BC-1');
    await chooseBoard('BC-2');
    expect(good.value).toBe('9');
    clickButton('批量报工'); await flush();
    expect(mocks.batchReport).toHaveBeenCalledWith(expect.objectContaining({ rows: [expect.objectContaining({ taskId: 31, goodQuantity: 9, boardItemCode: 'BC-2' })] }));
  });

  it('prefills only unreported whole-batch output and preserves manual edits when reselecting', async () => {
    const process = { code: 'MIX', label: '发泡', outputLabel: '板材', outputStage: 'BOARD', outputUnit: '张', sources: ['RAW'] };
    const task = { ...my.tasks[0]!, process: 'MIX', quantity: 34, unit: '张', actualQuantity: 10, defectQuantity: 2,
      output: { stage: 'BOARD', mixPlan: { wholeBatchBoards: 35 } } };
    mocks.my.mockResolvedValue({ ...workshop(), processes: [process], workshopProcess: process, workshopTasks: [task] });
    await mount('MIX'); await expandOrder('HT-001'); await selectTask(31);
    expect(Number(document.querySelector<HTMLInputElement>('#good-HT-001-31')!.value)).toBe(23);
    fill('good-HT-001-31', 20); await flush();
    await selectTask(31); await selectTask(31);
    expect(Number(document.querySelector<HTMLInputElement>('#good-HT-001-31')!.value)).toBe(20);
    clickButton('批量报工'); await flush();
    expect(mocks.batchReport).toHaveBeenCalledWith(expect.objectContaining({ rows: [expect.objectContaining({ goodQuantity: 20, expectedActualQuantity: 10, expectedDefectQuantity: 2 })] }));
  });

  it('reloads the default foaming board along with changed task progress after a refresh', async () => {
    const process = { code: 'MIX', label: '发泡', outputLabel: '板材', outputStage: 'BOARD', outputUnit: '张', sources: ['RAW'] };
    const task = { ...my.tasks[0]!, process: 'MIX', quantity: 34, unit: '张', output: { stage: 'BOARD', mixPlan: { wholeBatchBoards: 35 } } };
    mocks.my.mockResolvedValue({ ...workshop(), processes: [process], workshopProcess: process, workshopTasks: [task] });
    await mount('MIX'); await expandOrder('HT-001'); await selectTask(31);
    mocks.my.mockResolvedValue({ ...workshop(), processes: [process], workshopProcess: process, workshopTasks: [{ ...task, actualQuantity: 10 }] });
    clickButton('刷新'); await flush(); await selectTask(31);
    expect(document.querySelector<HTMLInputElement>('#good-HT-001-31')!.value).toBe('25');
    expect(mocks.batchOptions).toHaveBeenCalledTimes(2);
    clickButton('批量报工'); await flush();
    expect(mocks.batchReport).toHaveBeenCalledWith(expect.objectContaining({ rows: [expect.objectContaining({ goodQuantity: 25, boardItemCode: 'BC-1' })] }));
  });

  it('shares merged task selection and draft across orders while reporting the task only once', async () => {
    const merged = { ...my.tasks[0]!, id: 38, process: 'MIX', contractCode: null, relatedOrderNos: ['GC-101', 'GC-202'], unit: '张',
      covers: [{ assignmentId: 'GC:1', quantity: 100 }, { assignmentId: 'GC:2', quantity: 100 }] };
    const process = { code: 'MIX', label: '发泡', outputLabel: '板材', outputStage: 'BOARD', outputUnit: '张', sources: ['RAW'] };
    mocks.my.mockResolvedValue({ ...workshop(), processes: [process], workshopProcess: process, workshopTasks: [merged] });
    await mount('MIX'); await expandOrder('GC-101'); await expandOrder('GC-202');
    expect(document.querySelectorAll('[data-order-key]')).toHaveLength(2);
    await selectTask(38);
    expect(document.querySelector<HTMLInputElement>('#good-GC-101-38')!.value).toBe('400');
    expect([...document.querySelectorAll<HTMLInputElement>('[data-task-id="38"] input[type="checkbox"]')].every((input) => input.checked)).toBe(true);
    expect(mocks.batchOptions).toHaveBeenCalledExactlyOnceWith('MIX', 38);
    fill('good-GC-101-38', 5); await flush();
    expect(Number(document.querySelector<HTMLInputElement>('#good-GC-202-38')!.value)).toBe(5);
    clickButton('批量报工'); await flush();
    expect(mocks.batchReport).toHaveBeenCalledWith(expect.objectContaining({ rows: [expect.objectContaining({ taskId: 38, goodQuantity: 5, boardItemCode: 'BC-1' })] }));
  });

  it('keeps the same request identity after a failed batch and preserves draft quantities', async () => {
    mocks.my.mockResolvedValue({ ...workshop(), workshopTasks: [my.tasks[0]!] });
    mocks.batchReport.mockRejectedValueOnce({ msg: '连接中断，请重试' });
    await mount('SLICE'); await expandOrder('HT-001'); await selectTask(31);
    fill('good-HT-001-31', 12); await flush(); clickButton('批量报工'); await flush();
    expect(document.body.textContent).toContain('报工结果待核实');
    expect(document.body.textContent).toContain('沿用同一次报工标识');
    expect(Number(document.querySelector<HTMLInputElement>('#good-HT-001-31')!.value)).toBe(12);
    clickButton('批量报工'); await flush();
    expect(mocks.batchReport.mock.calls[1]![0]).toEqual(mocks.batchReport.mock.calls[0]![0]);
  });

  it('explains a confirmed business rejection and preserves the batch for correction', async () => {
    mocks.my.mockResolvedValue({ ...workshop(), workshopTasks: [my.tasks[0]!] });
    mocks.batchReport.mockRejectedValueOnce({ code: 1_215_024_008, msg: '计价项目未设置单价' });
    await mount('SLICE'); await expandOrder('HT-001'); await selectTask(31);
    fill('good-HT-001-31', 12); await flush(); clickButton('批量报工'); await flush();
    expect(document.body.textContent).toContain('本次提交未新增报工。计价项目未设置单价');
    expect(Number(document.querySelector<HTMLInputElement>('#good-HT-001-31')!.value)).toBe(12);
  });

  it('shows finished dimensions separately from the task output and scopes order details', async () => {
    const item = { orderId: 101, orderNo: 'GC-101', itemId: 1001, productCode: 'SKU-FIRST', productName: '双色垫',
      size: '183×61×0.6cm', quantity: 800, unit: '条', targetColorMode: 'DUAL', targetFrontColor: 'PU', targetBackColor: 'GY' };
    const second = { ...item, itemId: 1002, productCode: 'SKU-SECOND', quantity: 600 };
    const task = { ...my.tasks[0]!, relatedOrderNos: ['GC-101'], relatedOrderItems: [item, second],
      output: { stage: 'SHEET', attrs: { length: 192, width: 132, thickness: 0.3, color: 'PU' } } };
    mocks.my.mockResolvedValue({ ...workshop(), workshopTasks: [task] });
    await mount('SLICE'); await expandOrder('GC-101');
    const row = document.querySelector('[data-task-id="31"]')!;
    expect(row.textContent).toContain('1830×610×6 mm');
    expect(row.textContent).toContain('1920×1320×3 mm');
    expect(row.textContent).toContain('双色');
    expect(document.querySelectorAll('.workshop-related-orders tbody tr[data-row-key]')).toHaveLength(2);
    expect(document.querySelector('.workshop-related-orders')?.textContent).toContain('SKU-SECOND');
  });

  it('requires and submits the explicit folding type without guessing from product names', async () => {
    const task = { ...my.tasks[0]!, process: 'FOLD', product: '八折垫' };
    const process = { code: 'FOLD', label: '折叠', outputLabel: '已折叠成品', outputStage: 'FOLDED', outputUnit: '件', sources: ['ENGRAVED'] };
    mocks.my.mockResolvedValue({ ...workshop(), processes: [process], workshopProcess: process, workshopTasks: [task] });
    await mount('FOLD'); await expandOrder('HT-001'); await selectTask(31);
    fill('good-HT-001-31', 10); await flush(); clickButton('批量报工'); await flush();
    expect(mocks.batchReport).not.toHaveBeenCalled();
    expect(document.body.textContent).toContain('请填写本次折叠类型');
    fill('fold-HT-001-31', '八折'); await flush(); clickButton('批量报工'); await flush();
    expect(mocks.batchReport).toHaveBeenCalledWith(expect.objectContaining({ rows: [expect.objectContaining({ foldingType: '八折' })] }));
  });

  it('paginates orders and resets to page one after filtering', async () => {
    const tasks = Array.from({ length: 25 }, (_, index) => ({ ...my.tasks[0]!, id: 100 + index, contractCode: `HT-BULK-${index}` }));
    mocks.my.mockResolvedValue({ ...workshop(), workshopTasks: tasks });
    await mount('SLICE');
    await openOrderView();
    expect(document.querySelectorAll('[data-order-key]')).toHaveLength(20);
    document.querySelector<HTMLButtonElement>('.workshop-order-table .ant-pagination-next button')!.click(); await flush();
    expect(document.querySelectorAll('[data-order-key]')).toHaveLength(5);
    fill('workshop-keyword', 'HT-BULK-24'); await flush();
    expect(document.querySelectorAll('[data-order-key]')).toHaveLength(1);
    expect(document.querySelector('.workshop-order-table .ant-pagination-item-active')?.textContent).toBe('1');
  });

  it('shows packaging tasks and submits their reports from the packaging workshop', async () => {
    const task = { ...my.tasks[0]!, process: 'PACK' };
    const process = { code: 'PACK', label: '包装', outputLabel: '已包装成品', outputStage: 'PACKED', outputUnit: '件', sources: ['PUNCHED'] };
    mocks.my.mockResolvedValue({ ...workshop(), processes: [process], workshopProcess: process, workshopTasks: [task] });
    await mount('PACK'); await expandOrder('HT-001'); await selectTask(31);
    expect(document.body.textContent).toContain('包装要求');
    fill('good-HT-001-31', 10); await flush(); clickButton('批量报工'); await flush();
    expect(mocks.batchReport).toHaveBeenCalledWith(expect.objectContaining({ process: 'PACK', rows: [expect.objectContaining({ taskId: 31, goodQuantity: 10 })] }));
  });

  it('explains an inaccessible workshop using the backend qualification message', async () => {
    mocks.my.mockRejectedValueOnce({ data: { msg: '当前账号没有开片工序岗位，请联系工厂管理员' } });
    await mount('SLICE');
    expect(document.body.textContent).toContain('当前账号没有开片工序岗位，请联系工厂管理员');
    expect(document.querySelector('[data-task-id]')).toBeNull();
  });

  it('allows switching to another factory when the selected factory has disabled this workshop', async () => {
    mocks.factories.mockResolvedValue({
      canSeeAll: true, defaultFactoryId: 1,
      factories: [{ code: 'HBFDM', deptId: 118, id: 1, name: '黄石工厂' }, { code: 'FDM2', deptId: 119, id: 2, name: '二号工厂' }],
    });
    mocks.my.mockRejectedValueOnce({ data: { msg: '当前工厂未启用开片工序' } });
    await mount('SLICE');
    expect(document.body.textContent).toContain('当前工厂未启用开片工序');
    mocks.my.mockResolvedValue({ ...workshop(), factoryName: '二号工厂' });
    document.querySelector('#factory-switch')!.closest('.ant-select')!.querySelector('.ant-select-selector')!
      .dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    await flush();
    [...document.querySelectorAll<HTMLElement>('.ant-select-item-option')].find((option) => option.getAttribute('title') === '二号工厂')!.click();
    await flush();
    expect(mocks.setFactory).toHaveBeenLastCalledWith(2);
    expect(document.querySelector('h1')?.textContent).toBe('开片车间');
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
  it('keeps same-batch front/back laminate picks separate and submits both while totaling shortages', async () => {
    const sheet = { ...board, stage: 'SHEET', quantity: 15, item: { ...board.item, thickness: 0.3 } };
    const process = { ...my.processes[0]!, code: 'LAMINATE', label: '贴合', outputStage: 'LAMINATED', sources: ['SHEET'] };
    const task = { ...my.tasks[0]!, process: 'LAMINATE', unit: '片' };
    mocks.route.query = { factoryId: '1', taskId: '31' };
    mocks.my.mockResolvedValue({ ...my, tasks: [task], inProgress: [], processes: [process] });
    mocks.prepare.mockResolvedValue({ ...prepare, task, outputStage: 'LAMINATED', sourceStage: 'SHEET', sourceStages: ['SHEET'], picks: [] });
    mocks.stock.mockResolvedValue({ list: [sheet], total: 1 });
    await mount();
    clickButton('选择正面'); await flush(); clickButton('选择反面'); await flush();
    fill('actual-pick-11-FRONT', 11); fill('actual-pick-11-BACK', 12); await flush();
    expect(Number(document.querySelector<HTMLInputElement>('#actual-pick-11-FRONT')!.value)).toBe(11);
    expect(Number(document.querySelector<HTMLInputElement>('#actual-pick-11-BACK')!.value)).toBe(12);
    expect(document.body.textContent).toContain('领料后欠账 8 片');
    clickButton('下一步：确认领料'); await flush();
    clickButton('确认领料'); await flush();
    expect(mocks.issue).toHaveBeenCalledWith(expect.objectContaining({ inputs: [
      { laminationSide: 'FRONT', quantity: 11, stockId: 11 }, { laminationSide: 'BACK', quantity: 12, stockId: 11 },
    ] }));
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

  it('selects personal tasks and issues the reviewed materials in one request', async () => {
    const secondTask = { ...my.tasks[0]!, id: 34, contractCode: 'HT-034' };
    mocks.my.mockResolvedValueOnce({ ...my, inProgress: [], tasks: [...my.tasks, secondTask] });
    mocks.my.mockResolvedValue({ ...my, inProgress: [inProgress] });
    mocks.myBatchPrepare.mockResolvedValue([
      prepare,
      { ...prepare, picks: [{ quantity: 52, stock: { ...board, batchNo: 'MB-SECOND', id: 12 } }], task: secondTask },
    ]);
    mocks.myBatchIssue.mockResolvedValue([5, 6]);
    await mount();
    document.querySelector<HTMLInputElement>('[aria-label="选择任务 #31"]')!.click();
    document.querySelector<HTMLInputElement>('[aria-label="选择任务 #34"]')!.click();
    await flush();
    expect(document.body.textContent).toContain('已选 2 项');
    clickButton('批量领料');
    await flush();
    expect(mocks.myBatchPrepare).toHaveBeenCalledExactlyOnceWith([31, 34]);
    expect(document.body.textContent).toContain('MB-SECOND');
    clickButton('确认批量领料');
    await flush();
    expect(mocks.myBatchIssue).toHaveBeenCalledExactlyOnceWith([
      expect.objectContaining({ taskId: 31, inputs: [expect.objectContaining({ quantity: 50, stockId: 11 })] }),
      expect.objectContaining({ taskId: 34, inputs: [expect.objectContaining({ quantity: 52, stockId: 12 })] }),
    ]);
    expect(mocks.issue).not.toHaveBeenCalled();
    expect(document.querySelector('[aria-label="我的任务分类"] [aria-pressed="true"]')?.textContent).toContain('正在做');
  });

  it('starts multiple foaming tasks together using their planned recipes without showing or issuing raw materials', async () => {
    const mix = { code: 'MIX', label: '发泡', outputLabel: '板材', outputStage: 'BOARD', outputUnit: '张', sources: ['RAW'] };
    const first = { ...my.tasks[0]!, id: 41, process: 'MIX', output: { stage: 'BOARD', recipeBatches: '2.5' } };
    const second = { ...first, id: 42, output: { stage: 'BOARD', attrs: { recipeCode: 'REC-002' }, recipeBatches: 3 } };
    const tpe = { ...board, id: 21, stage: 'RAW', batchNo: 'RAW-TPE', item: { rawMaterialName: '热塑性弹性体' }, quantity: 40 };
    const pigment = { ...tpe, id: 22, batchNo: 'RAW-PIGMENT', item: { rawMaterialName: '色粉' } };
    const mixPlan = { ...prepare, outputStage: 'BOARD', outputLabel: '板材', outputUnit: '张', sourceStage: 'RAW', sourceStages: ['RAW'] };
    mocks.my.mockResolvedValue({ ...my, inProgress: [], processes: [mix], tasks: [first, second] });
    mocks.options.mockResolvedValue({ ...options, recipes: [...options.recipes, { code: 'REC-002', enabled: true, name: '深色款' }] });
    mocks.myBatchPrepare.mockResolvedValue([
      { ...mixPlan, task: first, outputAttrs: { recipeCode: 'REC-001' }, picks: [{ quantity: 50, stock: tpe }, { quantity: 2.5, stock: pigment }] },
      { ...mixPlan, task: second, outputAttrs: null, picks: [{ quantity: 3, stock: pigment }] },
    ]);
    mocks.myBatchIssue.mockResolvedValue([5, 6]);

    await mount();
    for (const id of [41, 42]) document.querySelector<HTMLInputElement>(`[aria-label="选择任务 #${id}"]`)!.click();
    await flush();
    clickButton('批量开工');
    await flush();

    expect(document.body.textContent).toContain('配方 常规款 · 预计 2.5 锅');
    expect(document.body.textContent).toContain('配方 深色款 · 预计 3 锅');
    expect(document.body.textContent).not.toMatch(/RAW-TPE|RAW-PIGMENT|热塑性弹性体|色粉|50 kg|调整领料|领料凭证|合计用量超过账面库存/);
    expect(mocks.myBatchIssue).not.toHaveBeenCalled();

    clickButton('确认批量开工');
    await flush();
    expect(mocks.myBatchPrepare).toHaveBeenCalledExactlyOnceWith([41, 42]);
    expect(mocks.plan).not.toHaveBeenCalled();
    expect(mocks.stock).not.toHaveBeenCalled();
    expect(mocks.myBatchIssue).toHaveBeenCalledExactlyOnceWith([
      expect.objectContaining({ taskId: 41, sourceStage: 'RAW', recipeCode: 'REC-001', recipeBatches: 2.5, inputs: [], auxInputs: [], issueSheetUrls: [] }),
      expect.objectContaining({ taskId: 42, sourceStage: 'RAW', recipeCode: 'REC-002', recipeBatches: 3, inputs: [], auxInputs: [], issueSheetUrls: [] }),
    ]);
  });

  it('starts foaming from an independent recipe and planned batch count without stock inputs', async () => {
    const mix = { code: 'MIX', label: '发泡', outputLabel: '板材', outputStage: 'BOARD', outputUnit: '张', sources: ['RAW'] };
    mocks.my.mockResolvedValue({ ...my, inProgress: [], processes: [mix], tasks: [] });

    await mount();
    clickButton('发泡·独立开单');
    await flush();
    expect(document.body.textContent).toContain('发泡配方');
    expect(document.body.textContent).not.toMatch(/选实际领料批次|本次实际领料|领料凭证/);
    fill('recipe-batches', 2);
    await flush();
    clickButton('确认开工');
    await flush();

    expect(mocks.create).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ process: 'MIX', recipeCode: 'REC-001', recipeBatches: 2, inputs: [], auxInputs: [], finish: false }));
    expect(mocks.stock).not.toHaveBeenCalled();
  });

  it('reports board output and finishes a foaming order from its row without another report', async () => {
    const mix = { code: 'MIX', label: '发泡', outputLabel: '板材', outputStage: 'BOARD', outputUnit: '张', sources: ['RAW'] };
    const attrs = { ...plannedAttrs, recipeCode: 'REC-001' };
    const task = { ...my.tasks[0]!, id: 41, process: 'MIX', quantity: 8, unit: '张', output: { stage: 'BOARD', attrs, recipeBatches: 2 } };
    const issued = { ...inProgress, process: 'MIX', inputQuantity: 0, sourceStage: 'RAW', outputStage: 'BOARD', scheduleTaskId: task.id };
    mocks.my.mockResolvedValue({ ...my, inProgress: [issued], processes: [mix], tasks: [task] });
    mocks.prepare.mockResolvedValue({ ...prepare, task, outputAttrs: attrs, outputStage: 'BOARD', picks: [], sourceStage: 'RAW' });
    mocks.order.mockResolvedValue({ ...order, ...issued, inputs: [], recipeCode: 'REC-001', recipeBatches: 2 });

    await mount();
    const row = document.querySelector('[data-order-id="5"]')!;
    const input = row.querySelector<HTMLInputElement>('[id^="total-"]')!;
    fill(input.id, 0);
    row.querySelector<HTMLButtonElement>('button[type="submit"]')!.click();
    await flush();
    expect(row.textContent).toContain('请填写本次产量');
    expect(mocks.report).not.toHaveBeenCalled();

    fill(input.id, 8);
    clickButton('提交并完工');
    await flush();
    expect(document.body.textContent).toContain('确认本次报工和计件');
    expect(document.body.textContent).not.toMatch(/领料凭证|我已核对/);
    mocks.my.mockResolvedValue({ ...my, inProgress: [], recentDone: [{ ...issued, status: 'COMPLETED' }], processes: [mix], tasks: [] });
    clickButton('报工并完工');
    await flush();
    expect(mocks.report).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({
      taskId: 41, orderId: 5, finish: true, returns: [],
      outputs: [expect.objectContaining({ goodQuantity: 8, attrs: expect.objectContaining({ recipeCode: 'REC-001' }) })],
    }));
    expect(mocks.issue).not.toHaveBeenCalled();
    expect(document.body.textContent).toContain('本批生产已结束');
    clickButton('回任务列表');
    await flush();
    expect(document.querySelector('[data-order-id="5"] form')).toBeNull();
    expect(mocks.report).toHaveBeenCalledTimes(1);
  });

  it('keeps the typed running quantities in the batch review and submits each selected order once', async () => {
    const other = { ...my.inProgress[0]!, id: 6, orderNo: 'GX20261011-002' };
    mocks.my.mockResolvedValue({ ...my, inProgress: [inProgress, other] });
    mocks.order.mockImplementation(async (id) => id === 5
      ? { ...order, scheduleTaskId: 31 }
      : { ...order, id: 6, orderNo: other.orderNo });
    mocks.myBatchReport.mockRejectedValueOnce(new Error('连接中断')).mockResolvedValue([5, 6]);
    await mount();
    const orderTotal = document.querySelector<HTMLInputElement>('[data-order-id="5"] input[id^="total-"]')!;
    fill(orderTotal.id, 15);
    document.querySelector<HTMLInputElement>('[aria-label="选择工序单 GX20261011-001"]')!.click();
    document.querySelector<HTMLInputElement>('[aria-label="选择工序单 GX20261011-002"]')!.click();
    await flush();
    clickButton('批量报工');
    await flush();
    const first = document.querySelector<HTMLInputElement>('input[id^="batch-5-total-"]')!;
    const second = document.querySelector<HTMLInputElement>('input[id^="batch-6-total-"]')!;
    expect(Number(first.value)).toBe(15);
    fill(second.id, 11);
    fill(document.querySelector<HTMLInputElement>('input[id^="batch-6-wb-"][id$="-thickness"]')!.id, 6);
    second.closest('form')!.querySelector<HTMLInputElement>('input[type="checkbox"]')!.click();
    await flush();
    clickButton('确认批量报工');
    await flush();
    expect(mocks.myBatchReport).toHaveBeenCalledExactlyOnceWith([
      expect.objectContaining({ id: 5, expectedReportCount: 0, finish: true, outputs: [expect.objectContaining({ goodQuantity: 15 })] }),
      expect.objectContaining({ id: 6, expectedReportCount: 0, finish: false, outputs: [expect.objectContaining({ goodQuantity: 11 })] }),
    ]);
    clickButton('重试本次提交');
    await flush();
    expect(mocks.myBatchReport).toHaveBeenCalledTimes(2);
    expect(mocks.myBatchReport.mock.calls[1]).toEqual(mocks.myBatchReport.mock.calls[0]);
    expect(mocks.report).not.toHaveBeenCalled();
    expect(mocks.reportOrder).not.toHaveBeenCalled();
    expect(mocks.issue).not.toHaveBeenCalled();
  });

  it('issues material without an optional voucher and reports the planned intermediate output without issuing twice', async () => {
    await mount();
    const taskList = document.querySelector('[aria-label="任务列表"]')!;
    expect(taskList.querySelector<HTMLTableRowElement>('tbody tr')?.cells[5]?.textContent).toBe('400 片');
    expect(taskList.textContent).not.toContain('预计领料');
    expect(taskList.textContent).not.toContain('1900×1300×48 mm');
    expect(taskList.textContent).not.toContain('关联订单产品');
    expect(mocks.pickList).not.toHaveBeenCalled();
    clickButton('领料开工');
    await flush();
    expect(document.body.textContent).toContain('选择实际领料批次');
    expect(document.body.textContent).toContain('1900×1300×48 mm');
    expect(document.body.textContent).toContain('账面 180');
    expect(document.body.textContent).not.toContain('加急');
    fill('pick-11', 52);
    await flush();
    clickButton('下一步：确认领料');
    await flush();
    expect(document.body.textContent).toContain('本次领料凭证（选填）');
    mocks.my.mockResolvedValue({ ...my, inProgress: [inProgress] });
    clickButton('确认领料');
    await flush();
    expect(mocks.issue).toHaveBeenCalledWith(expect.objectContaining({
      taskId: 31, sourceStage: 'BOARD', inputs: [{ laminationSide: undefined, quantity: 52, stockId: 11 }],
      issueSheetUrls: [], requestKey: expect.any(String),
    }));
    expect(mocks.issue.mock.calls[0]?.[0]).not.toHaveProperty('urgent');
    expect(mocks.issue.mock.calls[0]?.[0]).not.toHaveProperty('urgentReason');
    expect(mocks.report).not.toHaveBeenCalled();
    expect(document.body.textContent).toContain('领料开工完成');
    clickButton('回任务列表');
    await flush();
    clickButton('正在做');
    await flush();
    const row = document.querySelector('[data-order-id="5"]')!;
    expect(row.querySelectorAll('form input')).toHaveLength(2);
    expect(row.querySelector('button[type="submit"]')?.textContent).toContain('提交');
    expect(row.querySelector('[data-output-spec]')?.textContent).toContain('紫色');
    expect(row.querySelector('[data-output-spec]')?.classList.contains('factory-report-spec')).toBe(true);
    expect(mocks.order).toHaveBeenCalledWith(5);
    row.querySelector<HTMLButtonElement>('[data-output-spec]')!.click();
    await flush();
    expect(document.querySelector('[id^="wb-"][id$="-width"]')).toBeNull();
    expect(document.querySelector('[id^="wb-"][id$="-thickness"]')).toBeTruthy();
    expect(document.body.textContent).toContain('1900×1300×48 mm');
    expect(document.body.textContent).toContain('厚度填写单层厚度');
    expect(document.body.textContent).toContain('每张开 1 片 × 52 张 = 52 片');
    const goodInput = document.querySelector<HTMLInputElement>('[id^="total-"]')!;
    expect(Number(goodInput.value)).toBe(400);
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
      outputs: [expect.objectContaining({ attrs: expect.objectContaining(board.item), goodQuantity: 374, defectQuantity: 6 })],
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

  it('prepares an absent semi-finished stock for 540 pieces and only issues it after confirmation', async () => {
    const process = { code: 'EMBOSS', label: '压花', outputStage: 'EMBOSSED', outputLabel: '压花片材', outputUnit: '片', sources: ['LAMINATED'] };
    const attrs = { material: 'TPE', color: 'PU', colorBack: 'BL', length: 192, width: 66, thickness: 0.6 };
    const task = { ...my.tasks[0]!, process: 'EMBOSS', quantity: 540, unit: '片', inputs: [
      { stage: 'LAMINATED', attrs, quantity: 540, unit: '片', note: '库存里还没有这个规格，要等上道做出来' },
      { stage: 'AUX', quantity: 1, unit: '张', name: '标签', note: '操作说明：请先核对实物' },
    ] };
    const stock = { ...board, id: 61, stage: 'LAMINATED', item: attrs, itemCode: 'FH-61', quantity: 0, batchNo: 'CENTER-61' };
    const prepared = { ...prepare, task, outputAttrs: attrs, outputStage: 'EMBOSSED', outputLabel: '压花片材', sourceStage: 'LAMINATED', sourceStages: ['LAMINATED'], required: 540, picks: [] };
    mocks.my.mockResolvedValue({ ...my, tasks: [task], processes: [process], inProgress: [] });
    mocks.options.mockResolvedValue({ ...options, stages: [...options.stages, { code: 'LAMINATED', label: '贴合片材', unit: '片' }] });
    mocks.prepare.mockResolvedValue(prepared);
    mocks.stock.mockResolvedValueOnce({ list: [], total: 0 }).mockResolvedValue({ list: [stock], total: 1 });
    mocks.prepareStock.mockResolvedValue({ ...prepared, picks: [{ stock, quantity: 540 }] });
    await mount();
    clickButton('领料开工'); await flush();
    expect(mocks.prepareStock).not.toHaveBeenCalled();
    expect(document.body.textContent).toContain('暂无符合当前任务条件的领料批次');
    expect(document.body.textContent).toContain('账面不足可直接领料并记负库存，上道补报入库后冲抵。');
    expect(document.body.textContent).not.toContain('要等上道做出来');
    expect(document.body.textContent).toContain('操作说明：请先核对实物');
    clickButton('按任务规格准备领料'); await flush();
    expect(mocks.prepareStock).toHaveBeenCalledExactlyOnceWith({ taskId: 31, sourceStage: 'LAMINATED', onBehalfOf: undefined });
    expect(Number(document.querySelector<HTMLInputElement>('#actual-pick-61')!.value)).toBe(540);
    expect(document.body.textContent).toContain('领料后欠账 540 片，需补录上工序产出');
    expect(mocks.issue).not.toHaveBeenCalled();
    expect(mocks.report).not.toHaveBeenCalled();
    fill('actual-pick-61', 530); await flush();
    clickButton('下一步：确认领料'); await flush();
    expect(mocks.issue).not.toHaveBeenCalled();
    clickButton('确认领料'); await flush();
    expect(mocks.issue).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({
      taskId: 31, sourceStage: 'LAMINATED', inputs: [{ stockId: 61, quantity: 530, laminationSide: undefined }],
    }));
  });

  it('keeps separate front and back picks when preparation returns the same laminate input stock', async () => {
    const process = { ...my.processes[0]!, code: 'LAMINATE', label: '贴合', outputStage: 'LAMINATED', sources: ['SHEET'] };
    const task = { ...my.tasks[0]!, process: 'LAMINATE', unit: '片' };
    const stock = { ...board, stage: 'SHEET', quantity: 0, item: { ...board.item, thickness: 0.3 } };
    const prepared = { ...prepare, task, outputAttrs: { ...stock.item, thickness: 0.6 }, outputStage: 'LAMINATED', sourceStage: 'SHEET', sourceStages: ['SHEET'], picks: [] };
    mocks.my.mockResolvedValue({ ...my, tasks: [task], processes: [process], inProgress: [] });
    mocks.prepare.mockResolvedValue(prepared);
    mocks.stock.mockResolvedValue({ list: [stock], total: 1 });
    mocks.prepareStock.mockResolvedValue({ ...prepared, picks: [{ stock, quantity: 400, side: 'FRONT' }, { stock, quantity: 400, side: 'BACK' }] });
    await mount(); clickButton('领料开工'); await flush();
    clickButton('按任务规格准备领料'); await flush();
    expect(Number(document.querySelector<HTMLInputElement>('#actual-pick-11-FRONT')!.value)).toBe(400);
    expect(Number(document.querySelector<HTMLInputElement>('#actual-pick-11-BACK')!.value)).toBe(400);
    expect(document.body.textContent).toContain('领料后欠账 800 片，需补录上工序产出');
    fill('actual-pick-11-FRONT', 390); await flush();
    clickButton('下一步：确认领料'); await flush(); clickButton('确认领料'); await flush();
    expect(mocks.issue).toHaveBeenCalledWith(expect.objectContaining({ inputs: [
      { stockId: 11, quantity: 390, laminationSide: 'FRONT' },
      { stockId: 11, quantity: 400, laminationSide: 'BACK' },
    ] }));
  });

  it('preserves selected quantities if task stock preparation fails and supports retry', async () => {
    mocks.prepareStock.mockRejectedValueOnce(new Error('prepare unavailable')).mockResolvedValue(prepare);
    await mount(); clickButton('领料开工'); await flush();
    fill('actual-pick-11', 52); await flush();
    clickButton('按任务规格准备领料'); await flush();
    expect(document.body.textContent).toContain('按任务规格准备领料失败，已选批次和填写数量已保留，请重试。');
    expect(Number(document.querySelector<HTMLInputElement>('#actual-pick-11')!.value)).toBe(52);
    expect(mocks.issue).not.toHaveBeenCalled();
    clickButton('按任务规格准备领料'); await flush();
    expect(document.body.textContent).not.toContain('按任务规格准备领料失败');
    expect(Number(document.querySelector<HTMLInputElement>('#actual-pick-11')!.value)).toBe(50);
    expect(mocks.prepareStock).toHaveBeenCalledTimes(2);
  });

  it('prevents repeated preparations and advancing while stock preparation is pending', async () => {
    let resolvePrepare!: (value: typeof prepare) => void;
    mocks.prepareStock.mockImplementationOnce(() => new Promise((resolve) => { resolvePrepare = resolve; }));
    await mount(); clickButton('领料开工'); await flush();
    clickButton('按任务规格准备领料'); await flush();
    const pending = [...document.querySelectorAll('button')].find((button) => button.textContent?.includes('正在准备领料'))!;
    expect(pending.disabled).toBe(true);
    expect([...document.querySelectorAll('button')].find((button) => button.textContent?.includes('下一步：确认领料'))!.disabled).toBe(true);
    pending.click(); await flush();
    expect(mocks.prepareStock).toHaveBeenCalledTimes(1);
    resolvePrepare(prepare); await flush();
    expect(document.body.textContent).toContain('按任务规格准备领料');
    expect(mocks.issue).not.toHaveBeenCalled();
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
    expect(document.body.textContent).not.toContain('按任务规格准备领料');
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
    clickButton('回任务列表');
    await flush();
    clickButton('正在做');
    await flush();
    document.querySelector<HTMLButtonElement>('[data-output-spec]')!.click();
    await flush();
    expect(mocks.order).toHaveBeenCalledWith(7);
    expect(document.body.textContent).toContain('蓝色');
    expect(document.body.textContent).toContain('绿色');
    expect(document.body.textContent).toContain('1900×1320×45 mm');
    expect(document.body.textContent).toContain('2000×1400×30 mm');
    expect(document.body.textContent).toContain('颜色沿用板材，厚度填写单层厚度。');
    expect(document.querySelector('[id^="wb-"][id$="-color"]')).toBeNull();
    expect(document.querySelector('[id^="wb-"][id$="-thickness"]')).toBeTruthy();
    for (const thickness of document.querySelectorAll<HTMLInputElement>('[id^="wb-"][id$="-thickness"]')) fill(thickness.id, 3);
    await flush();
    expect(document.body.textContent).toContain('每张开 15 片 × 3 张 = 45 片');
    expect(document.body.textContent).toContain('每张开 10 片 × 5 张 = 50 片');
    const goods = [...document.querySelectorAll<HTMLInputElement>('[id^="total-"]')];
    expect(goods).toHaveLength(2);
    expect(goods.map((input) => Number(input.value))).toEqual([0, 0]);
    fill(goods[0]!.id, 2);
    fill(goods[1]!.id, 4);
    await flush();
    clickButton('下一步');
    await flush();
    expect(document.body.textContent).toContain('良品 0.048648 m³ × ¥27/m³');
    expect(document.body.textContent).toContain('¥1.31');
    expect(document.querySelector('[id^="piece-item-"]')).toBeNull();
    expect(mocks.wage).toHaveBeenCalled();
    clickButton('提交');
    await flush();
    expect(mocks.reportOrder).toHaveBeenCalledWith(expect.objectContaining({
      id: 7,
      finish: true,
      outputs: [
        expect.objectContaining({ attrs: expect.objectContaining({ ...blue.item, thickness: 0.3 }), goodQuantity: 2, defectQuantity: 0, sourceItemIds: [blue.itemId] }),
        expect.objectContaining({ attrs: expect.objectContaining({ ...green.item, thickness: 0.3 }), goodQuantity: 4, defectQuantity: 0, sourceItemIds: [green.itemId] }),
      ],
      pieceworks: [{ itemId: 1, quantity: '0.048648', userId: 2 }],
    }));
    expect(mocks.reportOrder.mock.calls[0]![0]).not.toHaveProperty('inputs');
    expect(mocks.reportOrder).toHaveBeenCalledTimes(1);
    expect(mocks.create).toHaveBeenCalledTimes(1);
    expect(mocks.issue).not.toHaveBeenCalled();
    expect(mocks.report).not.toHaveBeenCalled();
    expect(mocks.returnMaterial).not.toHaveBeenCalled();
  });

  it('opens an independent cutting order with no dispatched task or production order', async () => {
    const cut = { code: 'CUT', label: '立切', outputLabel: '片材', outputStage: 'CUT', outputUnit: '片', sources: ['SHEET'] };
    const sheet = { ...board, stage: 'SHEET', item: { ...board.item, thickness: 0.6 } };
    mocks.my.mockResolvedValue({ ...my, processes: [cut], tasks: [], hall: [], inProgress: [] });
    mocks.stock.mockResolvedValue({ list: [sheet], total: 1 });

    await mount();
    expect(document.querySelector('[aria-label="独立开单"]')?.textContent).toContain('立切 · 独立开单');
    expect(document.body.textContent).not.toContain('开片 · 选择板材');
    clickButton('立切·独立开单');
    await flush();
    expect(mocks.stock).toHaveBeenCalledWith('SHEET', undefined);
    clickButton(`批次${sheet.batchNo}`);
    await flush();
    fill('actual-pick-11', 3);
    await flush();
    clickButton('下一步：确认领料');
    await flush();
    expect(document.body.textContent).toContain('本次为独立立切');
    clickButton('确认领料');
    await flush();

    expect(mocks.create).toHaveBeenCalledWith(expect.objectContaining({
      finish: false, inputs: [{ laminationSide: undefined, quantity: 3, stockId: 11 }],
      process: 'CUT', productionOrderItemId: undefined, scheduleTaskId: undefined, sourceStage: 'SHEET',
    }));
    expect(mocks.prepare).not.toHaveBeenCalled();
    expect(mocks.productionOrders).not.toHaveBeenCalled();
  });

  it('requires an eligible factory order item when manually opening a packaging order from the workshop', async () => {
    const pack = { code: 'PACK', label: '包装', outputLabel: '已包装成品', outputStage: 'PACKED', outputUnit: '件', sources: ['PUNCHED'] };
    const punched = { ...board, stage: 'PUNCHED' };
    mocks.my.mockResolvedValue({ ...workshop(), processes: [pack], workshopProcess: pack, workshopTasks: [] });
    mocks.stock.mockResolvedValue({ list: [punched], total: 1 });
    mocks.productionOrders.mockResolvedValue([{ orderNo: 'FO-001', items: [
      { id: 13, completedQuantity: 0, processes: ['PUNCH'], productName: '散装垫', quantity: 5 },
      { id: 14, completedQuantity: 0, processes: ['PUNCH', 'PACK'], productName: '袋装垫', quantity: 5 },
    ] }]);

    await mount('PACK');
    clickButton('领料', true);
    await flush();
    expect(mocks.stock).toHaveBeenCalledWith('PUNCHED', undefined);
    clickButton(`批次${punched.batchNo}`);
    await flush();
    fill('actual-pick-11', 3);
    await flush();
    clickButton('下一步：确认领料');
    await flush();
    expect(document.body.textContent).toContain('选择包装对应的工厂订单');
    expect(document.body.textContent).not.toContain('散装垫');
    clickButton('确认领料，去干活');
    clickButton('已经做完了，领料同时报数量');
    expect(mocks.create).not.toHaveBeenCalled();
    expect(document.body.textContent).toContain('第 2 步 确认领料');
    clickButton('袋装垫');
    await flush();
    clickButton('确认领料，去干活');
    await flush();

    expect(mocks.create).toHaveBeenCalledWith(expect.objectContaining({
      finish: false, process: 'PACK', productionOrderItemId: 14, scheduleTaskId: undefined, sourceStage: 'PUNCHED',
    }));
    expect(mocks.issue).not.toHaveBeenCalled();
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
    document.querySelector<HTMLButtonElement>('[data-output-spec]')!.click();
    await flush();
    fill(document.querySelector('[id^="wb-"][id$="-thickness"]')!.id, 3);
    fill(document.querySelector('[id^="total-"]')!.id, 40);
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
    document.querySelector<HTMLButtonElement>('[data-output-spec]')!.click();
    await flush();
    expect(mocks.prepare).toHaveBeenCalledWith(31);
    fill(document.querySelector('[id^="total-"]')!.id, 3);
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

  it('accepts row quantities directly, checks defects against the total and submits the selected order', async () => {
    const second = { ...inProgress, id: 6, scheduleTaskId: undefined, orderNo: 'GX-6' };
    mocks.my.mockResolvedValue({ ...my, inProgress: [inProgress, second] });
    mocks.order.mockImplementation(async (id: number) => id === 5
      ? { ...order, reportCount: 2, goodQuantity: 100 }
      : { ...order, id: 6, orderNo: second.orderNo });
    await mount();
    const row = document.querySelector('[data-order-id="5"]')!;
    const other = document.querySelector('[data-order-id="6"]')!;
    const total = row.querySelector<HTMLInputElement>('[id^="total-"]')!;
    const bad = row.querySelector<HTMLInputElement>('[id^="bad-"]')!;
    const otherTotal = other.querySelector<HTMLInputElement>('[id^="total-"]')!;
    expect(total.value).toBe('300');
    fill(otherTotal.id, 42);
    fill(total.id, 80);
    fill(bad.id, 81);
    await flush();
    row.querySelector<HTMLButtonElement>('button[type="submit"]')!.click();
    await flush();
    expect(row.textContent).toContain('瑕疵数量不能超过本次产量');
    expect(mocks.report).not.toHaveBeenCalled();
    fill(bad.id, 3);
    row.querySelector<HTMLButtonElement>('button[type="submit"]')!.click();
    await flush();
    expect(document.body.textContent).toContain('本次良品 77 片');
    document.querySelector<HTMLButtonElement>('button[aria-label="返回"]')!.click();
    await flush();
    expect(total.value).toBe('80');
    expect(otherTotal.value).toBe('42');
    row.querySelector<HTMLButtonElement>('button[type="submit"]')!.click();
    await flush();
    mocks.my.mockResolvedValue({ ...my, inProgress: [second] });
    clickButton('报工');
    await flush();
    expect(mocks.report).toHaveBeenCalledWith(expect.objectContaining({
      orderId: 5, expectedReportCount: 2, finish: true,
      outputs: [expect.objectContaining({ goodQuantity: 77, defectQuantity: 3 })],
    }));
    expect(document.body.textContent).toContain('本批生产已结束');
    expect(mocks.issue).not.toHaveBeenCalled();
    clickButton('回任务列表');
    await flush();
    expect(document.querySelector('[data-order-id="5"]')).toBeNull();
    expect(other.querySelector<HTMLInputElement>('[id^="total-"]')?.value).toBe('42');
  });

  it.each([false, true])('closes an already-reported order without another report confirmation (from details: %s)', async (details) => {
    mocks.my.mockResolvedValue({ ...my, inProgress: [inProgress] });
    mocks.order.mockResolvedValue({ ...order, reportCount: 3, goodQuantity: 400 });
    await mount();
    if (details) {
      document.querySelector<HTMLButtonElement>('[data-output-spec]')!.click();
      await flush();
    }
    expect(mocks.report).not.toHaveBeenCalled();
    clickButton('直接完工');
    await flush();
    expect(mocks.report).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ orderId: 5, expectedReportCount: 3, finish: true, outputs: [], pieceworks: [] }));
    expect(document.querySelector('h1')?.textContent).toBe('工序单已完工');
    expect(document.body.textContent).not.toContain('确认本次报工和计件');
    expect(mocks.wage).not.toHaveBeenCalled();
  });

  it('submits leftover material returns atomically with task output instead of a separate inventory mutation', async () => {
    mocks.my.mockResolvedValue({ ...my, inProgress: [inProgress] });
    await mount();
    document.querySelector<HTMLButtonElement>('[data-output-spec]')!.click();
    await flush();
    fill(document.querySelector('[id^="total-"]')!.id, 100);
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
    document.querySelector<HTMLButtonElement>('[data-output-spec]')!.click();
    await flush();
    fill(document.querySelector('[id^="total-"]')!.id, 80);
    document.querySelector<HTMLInputElement>('[aria-label="报本工序实际产出"] input[type="checkbox"]')!.click();
    await flush();
    clickButton('下一步');
    await flush();
    document.querySelector<HTMLButtonElement>('button[aria-label="返回"]')!.click();
    await flush();
    fill(document.querySelector('[id^="total-"]')!.id, 100);
    await flush();
    clickButton('下一步');
    await flush();
    clickButton('报工');
    await flush();
    expect(document.body.textContent).not.toContain('100 片 × ¥27');
    expect(mocks.report).toHaveBeenCalledWith(expect.objectContaining({ finish: false, pieceworks: [{ itemId: 1, quantity: '11.856', userId: 2 }] }));
    expect(document.body.textContent).toContain('工序单继续在制');
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
    expect(document.querySelector('[id^="wb-"][id$="-thickness"]')).toBeTruthy();
    expect(document.body.textContent).toContain('1900×1300×48 mm');
  });

  it('restores different issued thicknesses as separate output rows with editable single-layer thickness on an independent order', async () => {
    mocks.my.mockResolvedValue({ ...my, tasks: [], inProgress: [my.inProgress[0]] });
    mocks.order.mockResolvedValue({ ...order, inputs: [
      ...order.inputs.map((input) => ({ ...input, itemId: 11 })),
      { ...order.inputs[0], id: 102, stockId: 12, itemId: 12, batchNo: 'THIN', quantity: 7, item: { ...board.item, thickness: 3 } },
      { ...order.inputs[0], id: 103, stockId: 13, batchNo: 'RETURNED', quantity: 5, returnedQuantity: 5, item: { ...board.item, thickness: 1 } },
    ] });
    await mount();
    document.querySelector<HTMLButtonElement>('[data-output-spec]')!.click();
    await flush();
    expect(document.querySelectorAll('[id^="total-"]')).toHaveLength(2);
    expect(document.querySelector('[id^="wb-"][id$="-thickness"]')).toBeTruthy();
    expect(document.body.textContent).toContain('1900×1300×48 mm');
    expect(document.body.textContent).toContain('1900×1300×30 mm');
    for (const thickness of document.querySelectorAll<HTMLInputElement>('[id^="wb-"][id$="-thickness"]')) fill(thickness.id, 3);
    await flush();
    expect(document.body.textContent).toContain('每张开 16 片 × 52 张 = 832 片');
    expect(document.body.textContent).toContain('每张开 10 片 × 7 张 = 70 片');
    const goods = [...document.querySelectorAll<HTMLInputElement>('[id^="total-"]')];
    fill(goods[0]!.id, 40);
    fill(goods[1]!.id, 6);
    await flush();
    clickButton('下一步');
    await flush();
    clickButton('提交');
    await flush();
    expect(mocks.reportOrder).toHaveBeenCalledWith(expect.objectContaining({ outputs: [
      expect.objectContaining({ attrs: expect.objectContaining({ thickness: 0.3 }), goodQuantity: 40 }),
      expect.objectContaining({ attrs: expect.objectContaining({ thickness: 0.3 }), goodQuantity: 6 }),
    ] }));
  });

  it('reports the planned 3 mm layers from a 48 mm board without a false thickness mismatch', async () => {
    mocks.my.mockResolvedValue({ ...my, inProgress: [inProgress] });
    mocks.prepare.mockResolvedValue({ ...prepare, outputAttrs: { ...plannedAttrs, thickness: 0.3 } });
    await mount(); document.querySelector<HTMLButtonElement>('[data-output-spec]')!.click(); await flush();
    expect(document.body.textContent).not.toContain('超过实际领料厚度');
    expect(document.body.textContent).toContain('1900×1300×3 mm');
    expect(document.body.textContent).toContain('每张开 16 片 × 52 张 = 832 片');
    fill(document.querySelector('[id^="total-"]')!.id, 40);
    await flush(); clickButton('下一步'); await flush(); clickButton('报工'); await flush();
    expect(mocks.report).toHaveBeenCalledWith(expect.objectContaining({ outputs: [expect.objectContaining({
      attrs: expect.objectContaining({ thickness: 0.3 }), goodQuantity: 40,
    })] }));
  });

  it('allows issuing a thicker board for a thin-sheet task and blocks a target thicker than the board', async () => {
    mocks.prepare.mockResolvedValue({ ...prepare, outputAttrs: { ...plannedAttrs, thickness: 0.3 } });
    await mount(); clickButton('领料开工'); await flush();
    expect(document.body.textContent).not.toContain('超过实际领料厚度');
    clickButton('下一步：确认领料'); await flush();
    expect(document.body.textContent).toContain('确认领料');
    unmount?.(); document.body.innerHTML = '';
    mocks.prepare.mockResolvedValue({ ...prepare, outputAttrs: { ...plannedAttrs, thickness: 5 } });
    await mount(); clickButton('领料开工'); await flush();
    expect(document.body.textContent).toContain('开片计划厚度（50 mm）超过实际领料厚度');
    clickButton('下一步：确认领料'); await flush();
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

  it('issues a team task for the selected worker instead of the supervisor', async () => {
    const task = { ...my.tasks[0]!, id: 42, workerIds: '7', workerNames: '李四' };
    mocks.my.mockResolvedValue({ ...my, inProgress: [], teamTasks: [task], teamProcesses: my.processes });
    mocks.mates.mockResolvedValue([{ userId: 7, nickname: '李四' }]);
    mocks.prepare.mockResolvedValue({ ...prepare, task });
    mocks.prepareStock.mockResolvedValue({ ...prepare, task });
    await mount();
    document.querySelector<HTMLButtonElement>('[aria-label="展开组员任务"]')!.click();
    await flush();
    document.querySelector<HTMLButtonElement>('[data-team-task-id] button')!.click();
    await flush();
    clickButton('下一步');
    await flush();
    clickButton('按任务规格准备领料');
    await flush();
    expect(mocks.prepareStock).toHaveBeenCalledWith({ taskId: 42, sourceStage: 'BOARD', onBehalfOf: 7 });
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
    document.querySelector<HTMLButtonElement>('[aria-label="展开组员任务"]')!.click();
    await flush();
    document.querySelector<HTMLButtonElement>('[data-team-task-id] button')!.click();
    await flush();
    clickButton('下一步');
    await flush();
    expect(document.body.textContent).toContain('正在替 李四 报工');
    fill(document.querySelector('[id^="total-"]')!.id, 40);
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
    document.querySelector<HTMLButtonElement>('[data-output-spec]')!.click();
    await flush();
    fill(document.querySelector('[id^="total-"]')!.id, 40);
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
    document.querySelector<HTMLButtonElement>('[data-output-spec]')!.click();
    await flush();
    clickButton('补领材料');
    await flush();
    expect(document.body.textContent).not.toContain('按任务规格准备领料');
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

  it.each([undefined, 5])('starts a foaming task with planned batches %s without editing or deducting materials', async (plannedBatches) => {
    const task = { ...my.tasks[0]!, id: 41, process: 'MIX', unit: '张', output: { stage: 'BOARD', recipeBatches: plannedBatches }, inputs: [{ stage: 'RAW', name: '热塑性弹性体', attrs: { rawMaterialCode: 'MAT-TPE' }, quantity: 100, unit: 'kg' }] };
    mocks.my.mockResolvedValue({ ...my, inProgress: [], tasks: [task], processes: [{ code: 'MIX', label: '发泡', outputLabel: '板材', outputStage: 'BOARD', outputUnit: '张', sources: ['RAW'] }] });
    mocks.prepare.mockResolvedValue({ ...prepare, task, picks: [], sourceStage: 'RAW', sourceStages: ['RAW'], outputStage: 'BOARD', outputLabel: '板材', outputUnit: '张', outputAttrs: { ...board.item, recipeCode: 'REC-001' } });
    mocks.pickList.mockResolvedValue([]);
    await mount();
    clickButton('发泡开工');
    await flush();
    expect(document.body.textContent).toContain('发泡 · 确认开工');
    expect(document.body.textContent).toContain('配方 常规款');
    expect(document.body.textContent?.includes('预计 5 锅')).toBe(plannedBatches === 5);
    expect(document.body.textContent).not.toContain('预计 1 锅');
    expect(document.body.textContent).not.toMatch(/热塑性弹性体|100 kg|领用|领料凭证/);
    expect(document.querySelector('#recipe-batches')).toBeNull();
    clickButton('确认开工');
    await flush();
    expect(mocks.issue).toHaveBeenCalledWith(expect.objectContaining({ taskId: 41, sourceStage: 'RAW', recipeCode: 'REC-001', recipeBatches: plannedBatches, inputs: [], auxInputs: [] }));
    expect(mocks.stock).not.toHaveBeenCalled();
    expect(mocks.plan).not.toHaveBeenCalled();
    expect(mocks.report).not.toHaveBeenCalled();
  });

  it('keeps 3 mm thickness while cutting a sheet for a 6 mm mat and preserves the issued material recipe', async () => {
    const task = { ...my.tasks[0]!, id: 51, process: 'CUT' };
    const attrs = { color: 'PU', material: 'TPE', length: 183, width: 61, thickness: 0.6, recipeCode: 'REC-001' };
    mocks.my.mockResolvedValue({ ...my, tasks: [task], inProgress: [{ ...inProgress, scheduleTaskId: 51, process: 'CUT', sourceStage: 'SHEET', outputStage: 'CUT' }], processes: [{ code: 'CUT', label: '立切', outputLabel: '片材', outputStage: 'CUT', outputUnit: '片', sources: ['SHEET'] }] });
    mocks.options.mockResolvedValue({ ...options, stages: [...options.stages, { code: 'CUT', label: '片材', unit: '片', defaultLocation: '片材区' }] });
    mocks.prepare.mockResolvedValue({ ...prepare, task, outputStage: 'CUT', outputLabel: '片材', outputAttrs: attrs });
    mocks.order.mockResolvedValue({ ...order, process: 'CUT', sourceStage: 'SHEET', outputStage: 'CUT', inputs: [{ ...order.inputs[0], stage: 'SHEET', item: { ...plannedAttrs, thickness: 0.3, recipeCode: 'REC-001', recipeName: '常规款' } }] });
    await mount();
    document.querySelector<HTMLButtonElement>('[data-output-spec]')!.click();
    await flush();
    expect(document.body.textContent).toContain('实际产出：片材');
    expect(document.body.textContent).not.toContain('1830×610×6 mm');
    expect(document.body.textContent).toContain('1830×610×3 mm');
    clickButton('修改规格'); await flush();
    const thickness = document.querySelector<HTMLInputElement>('[id^="wb-"][id$="-thickness"]');
    expect(thickness).toBeNull();
    fill(document.querySelector('[id^="total-"]')!.id, 40);
    await flush();
    clickButton('下一步');
    await flush();
    clickButton('报工');
    await flush();
    expect(mocks.report).toHaveBeenCalledWith(expect.objectContaining({ taskId: 51, orderId: 5, outputs: [expect.objectContaining({ attrs: expect.objectContaining({ ...attrs, thickness: 0.3, recipeName: '常规款' }), goodQuantity: 40 })] }));
  });
});
