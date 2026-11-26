import type {
  FdmgongchangMaterialPlanApi as MaterialApi,
  FdmgongchangProductionOrderApi as OrderApi,
} from '#/api/fdmgongchang/production-order';
import type { FdmgongchangOrderSplitApi as SplitApi } from '#/api/fdmgongchang/schedule';

import { createApp, defineComponent, h, nextTick, ref } from 'vue';

import { Modal } from 'ant-design-vue';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import OrderSplitModal from './modules/order-split-modal.vue';

const api = vi.hoisted(() => ({
  advice: vi.fn(), adviceResult: vi.fn(), orders: vi.fn(), get: vi.fn(), canEdit: true,
  materialPlan: vi.fn(), preview: vi.fn(), release: vi.fn(), saveMaterial: vi.fn(),
}));
vi.mock('#/api/fdmgongchang/production-order', () => ({
  getMaterialPlan: api.materialPlan,
  getOpenProductionOrders: api.orders,
  getProductionOrder: api.get,
  getRecipeOptions: vi.fn().mockResolvedValue([
    { recipeCode: 'REC-1', recipeName: '标准配方' },
    { recipeCode: 'REC-2', recipeName: '历史配方' },
    { recipeCode: 'REC-NEW', recipeName: '调整后配方' },
  ]),
  getTargetOptions: vi.fn().mockResolvedValue({ colors: [{ value: 'ZI', label: '紫色' }, { value: 'LAN', label: '蓝色' }], textures: [{ value: 'SH', label: '贝壳纹' }], materials: [], patterns: [] }),
  saveItemMaterial: api.saveMaterial,
}));
vi.mock('@vben/access', () => ({ useAccess: () => ({ hasAccessByCodes: () => api.canEdit }) }));
vi.mock('../production-order/modules/item-production-config-modal.vue', () => ({
  default: defineComponent({
    props: ['open', 'orderId', 'itemId'], emits: ['saved', 'update:open'],
    setup: (props, { emit }) => () => props.open ? h('button', { id: 'save-config-test', onClick: () => { emit('update:open', false); emit('saved'); } }, `保存生产参数 ${props.orderId}/${props.itemId}`) : null,
  }),
}));
vi.mock('#/api/fdmgongchang/schedule', () => ({
  getOrderSplitAdviceResult: api.adviceResult,
  previewOrderSplit: api.preview,
  releaseOrderSplit: api.release,
  requestOrderSplitAdvice: api.advice,
}));

const orders: OrderApi.Order[] = [
  {
    id: 11, orderNo: 'GD-11', factoryId: 1, requesterUserId: 1, status: 'ACCEPTED', statusLabel: '生产中', totalQuantity: 200, completedQuantity: 0,
    customerName: '客户甲', requiredDate: '2026-12-10',
    items: [
      { id: 101, productId: 'p1', productCode: 'SKU-PURPLE', productName: '紫色瑜伽垫', specification: '183×61×0.6cm', quantity: 120, completedQuantity: 20, unit: '条', processes: ['SLICE', 'PUNCH', 'PACK'], routeName: '开片冲裁包装', targetConfirmedAt: '2026-11-12', recipeCode: 'REC-1' },
      { id: 102, productId: 'p2', productCode: 'SKU-BLUE', productName: '蓝色瑜伽垫', quantity: 80, completedQuantity: 0, unit: '条', processes: ['CUT'], routeName: '仅立切' },
    ],
  },
  {
    id: 12, orderNo: 'GD-12', factoryId: 1, requesterUserId: 1, status: 'ACCEPTED', statusLabel: '生产中', totalQuantity: 50, completedQuantity: 0,
    items: [{ id: 103, productId: 'p3', productCode: 'SKU-GREEN', productName: '绿色瑜伽垫', quantity: 50, completedQuantity: 0, unit: '条', processes: ['PUNCH'] }],
  },
];

function row(overrides: Partial<SplitApi.Row> = {}): SplitApi.Row {
  return { rowKey: '101-SLICE', orderId: 11, orderNo: 'GD-11', itemId: 101, productCode: 'SKU-PURPLE', productName: '紫色瑜伽垫',
    orderQuantity: 120, remainingQuantity: 100, orderUnit: '条', finishedMaterial: 'TPE', finishedLength: 183, finishedWidth: 61, finishedThickness: 0.6,
    process: 'SLICE', processLabel: '开片', sequence: 1, quantity: 40, unit: '片', status: 'READY', upstreamProcesses: [],
    inputs: [{ stage: 'BOARD', name: '紫色板材', quantity: 3, unit: '张' }],
    output: { stage: 'SHEET', attrs: { material: 'TPE', length: 183, width: 61, thickness: 0.6 }, quantity: 40, unit: '片' }, ...overrides };
}

function preview(overrides: Partial<SplitApi.Preview> = {}): SplitApi.Preview {
  return { previewKey: 'preview-1', canRelease: true, orderCount: 2, itemCount: 3, taskCount: 3, errors: [],
    warnings: ['板材库存不足，任务仍完整下发；请安排备料'],
    rows: [row(), row({ rowKey: '101-PUNCH', process: 'PUNCH', processLabel: '冲裁', sequence: 2, quantity: 100, unit: '件', upstreamProcesses: ['SLICE'] }),
      row({ rowKey: '101-PACK', process: 'PACK', processLabel: '包装', sequence: 3, quantity: 100, unit: '件', upstreamProcesses: ['PUNCH'],
        inputs: [{ stage: 'PUNCHED', name: '已冲裁垫', quantity: 100, unit: '件' }],
        output: { stage: 'PACKED', name: '已包装成品', quantity: 100, unit: '件' } })], ...overrides };
}

const upstreamStock: SplitApi.StockCandidate = {
  itemId: 101, stockId: 81, stage: 'PUNCHED', stageLabel: '已冲裁半成品', itemCode: 'CC-A', batchNo: 'CC-01', location: '半成品仓',
  available: 9, unit: '件', deliverable: false, startProcess: 'PACK', startProcessLabel: '包装',
};
const finishedStock: SplitApi.StockCandidate = {
  itemId: 101, stockId: 82, stage: 'PACKED', stageLabel: '已包装成品', itemCode: 'BZ-A', batchNo: 'BZ-A', location: '成品仓',
  available: 5, unit: '件', deliverable: true, aggregated: true,
};
const blueStock: SplitApi.StockCandidate = {
  itemId: 102, stockId: 83, stage: 'SHEET', stageLabel: '已开片板材', itemCode: 'KP-B', batchNo: 'KP-03', location: '片材区',
  available: 8, unit: '片', deliverable: false, startProcess: 'CUT', startProcessLabel: '立切',
};
const adviceCandidates = [upstreamStock, finishedStock, blueStock];

function adviceResult(overrides: Partial<SplitApi.StockAdvice> = {}): SplitApi.StockAdvice {
  return {
    requestId: 'advice-1', source: 'RULE', status: 'PENDING',
    items: [
      { itemId: 101, orderId: 11, orderNo: 'GD-11', remaining: 100, remainingAfterReceipt: 98, covered: 0, remainingFromStart: 98,
        receiptSuggested: 2, unit: '条', recommendations: [{ ...finishedStock, action: 'DELIVER', quantity: 2 }] },
      { itemId: 102, orderId: 11, orderNo: 'GD-11', remaining: 80, covered: 3, remainingFromStart: 77,
        receiptSuggested: 0, unit: '条', recommendations: [{ ...blueStock, action: 'USE', quantity: 3 }] },
    ],
    ...overrides,
  };
}

async function flush() {
  for (let i = 0; i < 10; i++) { await Promise.resolve(); await nextTick(); }
}
function button(text: string) {
  const found = [...document.querySelectorAll<HTMLButtonElement>('button')].find((el) => el.textContent?.replaceAll(/\s/g, '') === text.replaceAll(/\s/g, ''));
  if (!found) throw new Error(`找不到按钮 ${text}`);
  return found;
}
async function input(selector: string, value: string) {
  const element = document.querySelector<HTMLInputElement | HTMLTextAreaElement>(selector)!;
  element.value = value;
  element.dispatchEvent(new Event('input', { bubbles: true }));
  await flush();
}

async function selectOption(selector: string, label: string) {
  document.querySelector(selector)!.closest('.ant-select')!.querySelector('.ant-select-selector')!
    .dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
  await flush();
  const options = document.querySelectorAll<HTMLElement>('.ant-select-dropdown:not(.ant-select-dropdown-hidden) .ant-select-item-option');
  const option = [...options].find((element) => element.title.startsWith(label));
  expect(option).toBeDefined();
  option!.click();
  await flush();
}

describe('order selection → process preview → release', () => {
  let unmount: (() => void) | undefined;
  let setOpen: (value: boolean) => void;
  let recordDelivery: (stock: { itemId: number; revision: number; stockId: number }) => void;
  const released = vi.fn();
  const manualDelivery = vi.fn();
  async function mount(preset: OrderApi.Order[] = orders) {
    const isOpen = ref(false);
    const deliveredStock = ref<{ itemId: number; revision: number; stockId: number }>();
    setOpen = (value) => { isOpen.value = value; };
    recordDelivery = (stock) => { deliveredStock.value = stock; };
    const host = document.createElement('div');
    document.body.append(host);
    const app = createApp(defineComponent({ setup: () => () => h(OrderSplitModal, {
      deliveredStock: deliveredStock.value, open: isOpen.value, orders: preset,
      'onUpdate:open': (value: boolean) => { isOpen.value = value; }, onManualDelivery: manualDelivery, onReleased: released,
    }) }));
    app.mount(host);
    unmount = () => app.unmount();
    setOpen(true);
    await flush();
  }
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    api.orders.mockResolvedValue(orders);
    api.get.mockResolvedValue(orders[0]);
    api.canEdit = true;
    api.materialPlan.mockImplementation(async (orderId: number): Promise<MaterialApi.Plan> => ({ items: [], orderId, orderNo: `GD-${orderId}`, shortage: false, totals: [] }));
    api.preview.mockResolvedValue(preview());
    api.release.mockResolvedValue({ scheduleId: 7, scheduleNo: 'PB-7', tasks: 3, mixTasks: 0, warnings: [], reused: false });
  });
  afterEach(() => {
    unmount?.();
    Modal.destroyAll();
    document.body.innerHTML = '';
    vi.clearAllMocks();
    vi.useRealTimers();
  });

  it('shows all selected products and actual routes, then confirms the exact preview without mixing order and process quantities', async () => {
    await mount();
    expect(document.body.textContent).toContain('紫色瑜伽垫');
    expect(document.body.textContent).toContain('蓝色瑜伽垫');
    expect(document.body.textContent).toContain('绿色瑜伽垫');
    expect(document.body.textContent).toContain('120 条');
    expect(document.body.textContent).toContain('开片 → 冲裁 → 包装');
    expect(document.body.textContent).toContain('仅立切');
    document.querySelector<HTMLButtonElement>('.ant-table-row-expand-icon')!.click();
    await flush();
    expect(document.body.textContent).toContain('已完成 20 条');
    expect(document.body.textContent).toContain('1830×610×6 mm');
    expect(api.release).not.toHaveBeenCalled();

    button('预览工序任务').click();
    await flush();
    expect(api.preview).toHaveBeenCalledWith([11, 12]);
    expect(api.release).not.toHaveBeenCalled();
    expect(document.body.textContent).toContain('开片车间');
    expect(document.body.textContent).toContain('冲裁车间');
    expect(document.body.textContent).toContain('包装车间');
    expect(document.body.textContent).toContain('已冲裁垫');
    expect(document.body.textContent).not.toContain('发泡车间');
    const sliceRow = document.querySelector<HTMLTableRowElement>('.split-process-tasks tr[data-row-key="101-SLICE"]')!;
    expect(sliceRow.cells[0]!.textContent).toContain('订单 120 条');
    expect(sliceRow.cells[0]!.textContent).toContain('待产 100 条');
    expect(sliceRow.cells[0]!.textContent).toContain('TPE · 1830×610×6 mm');
    expect(sliceRow.cells[2]!.textContent).toBe('40 片');
    const summary = document.querySelector('.split-product-specs tr[data-row-key="101"]')!.textContent;
    expect(summary).toContain('订单 120 条');
    expect(summary).toContain('待产 100 条');
    expect(document.body.textContent).toContain('100 件');
    expect(document.body.textContent).toContain('板材库存不足');
    expect(button('确认下发 3 个任务').disabled).toBe(false);
    await input('#split-release-note', '  尽快备料  ');
    button('确认下发 3 个任务').click();
    await flush();
    expect(api.release).toHaveBeenCalledWith({ productionOrderIds: [11, 12], previewKey: 'preview-1', requestId: expect.any(String), note: '尽快备料' });
    expect(api.release.mock.calls[0]![0].requestId).toMatch(/^[\da-f-]{36}$/i);
    expect(released).toHaveBeenCalledWith(7);
  });

  it('filters tasks by order item even when the product code is shared and keeps the batch totals', async () => {
    api.preview.mockResolvedValue(preview({
      rows: [
        row(),
        row({ rowKey: '101-PACK', process: 'PACK' }),
        row({ rowKey: '103-ITEM', orderId: 12, orderNo: 'GD-12', itemId: 103,
          orderQuantity: '50.5', remainingQuantity: 0, process: null, processLabel: null, quantity: null, status: 'DONE' }),
      ],
    }));
    await mount();
    button('预览工序任务').click();
    await flush();
    const picker = document.querySelector('#split-task-product')!.closest('.ant-select')!;
    picker.querySelector('.ant-select-selector')!.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    await flush();
    document.querySelector<HTMLElement>('.ant-select-item-option[title*="GD-12 #103"]')!.click();
    await flush();
    const visibleTasks = document.querySelectorAll('.split-process-tasks tr.ant-table-row');
    expect(visibleTasks).toHaveLength(1);
    expect(visibleTasks[0]!.textContent).toContain('订单 50.5 条');
    expect(visibleTasks[0]!.textContent).toContain('待产 0 条');
    expect(visibleTasks[0]!.textContent).toContain('无需生产');
    expect(button('确认下发 3 个任务').disabled).toBe(false);
  });

  it('keeps missing configuration rows visible and blocks the entire batch', async () => {
    api.preview.mockResolvedValue(preview({ canRelease: false, taskCount: 0, errors: ['GD-11 明细 #101 未配置工艺'], rows: [row({ process: null, processLabel: '未配置工艺', sequence: null, quantity: null, output: null, inputs: [], status: 'BLOCKED', reason: '请确认生产参数和路线' })] }));
    await mount();
    button('预览工序任务').click(); await flush();
    expect(document.body.textContent).toContain('请确认生产参数和路线');
    expect(document.body.textContent).toContain('GD-11 明细 #101 未配置工艺');
    expect(document.body.textContent).toContain('待核算');
    expect(document.body.textContent).not.toContain('. 未配置工艺');
    expect(button('确认下发 0 个任务').disabled).toBe(true);
    button('确认下发 0 个任务').click(); await flush();
    expect(api.release).not.toHaveBeenCalled();
  });

  it('edits the exact preview item and recomputes before allowing confirmation', async () => {
    await mount();
    button('预览工序任务').click(); await flush();
    button('修改参数与工艺').click(); await flush();
    expect(button('确认下发 3 个任务').disabled).toBe(true);
    expect(document.querySelector('#save-config-test')?.textContent).toContain('11/101');
    api.preview.mockResolvedValue(preview({ previewKey: 'after-user-edit' }));
    document.querySelector<HTMLButtonElement>('#save-config-test')!.click(); await flush();
    expect(api.get).toHaveBeenCalledWith(11);
    expect(api.preview).toHaveBeenCalledTimes(2);
    button('确认下发 3 个任务').click(); await flush();
    expect(api.release).toHaveBeenCalledWith(expect.objectContaining({ previewKey: 'after-user-edit' }));
  });

  it('edits foam setup per product before preview and recomputes it after a batch update', async () => {
    const factoryBoard: MaterialApi.Board = {
      boards: 10, layers: 8, name: '本厂发泡出板', perBoard: 8, piecesPerLayer: 1, size: '192×192×4.5', source: 'SETTING',
    };
    const mould: MaterialApi.Board = { ...factoryBoard, mouldProfileId: 9, name: '备用模具', source: 'MOULD' };
    const materialOrder: OrderApi.Order = {
      ...orders[0]!,
      items: [
        { ...orders[0]!.items[0]!, processes: ['MIX', 'SLICE', 'PUNCH', 'PACK'] },
        { ...orders[0]!.items[1]!, processes: ['MIX', 'CUT'] },
        { ...orders[0]!.items[0]!, id: 104, productName: '同规格灰色瑜伽垫', processes: ['MIX', 'SLICE'] },
        orders[1]!.items[0]!,
      ],
    };
    let planItems: MaterialApi.ItemPlan[] = materialOrder.items.map((item) => ({
      board: item.id === 101 ? mould : factoryBoard, candidates: [factoryBoard, mould],
      itemId: item.id, mouldProfileId: item.id === 101 ? 9 : null, productName: item.productName,
      quantity: item.quantity, raws: [], recipeCode: item.id === 101 ? 'REC-1' : 'REC-2',
      recipeSuggested: item.id !== 101, remaining: item.quantity, stock: [], targetSize: '183×61×0.6', unit: '条', warnings: [],
    }));
    api.materialPlan.mockImplementation(async () => ({ items: planItems, orderId: 11, orderNo: 'GD-11', shortage: false, totals: [] }));
    api.get.mockResolvedValue(materialOrder);
    let pendingSave: Promise<void> | undefined;
    api.saveMaterial.mockImplementation(async ({ itemId, mouldProfileId, recipeCode }: MaterialApi.ItemMaterialReq) => {
      await pendingSave;
      planItems = planItems.map((item) => item.itemId === itemId ? {
        ...item, board: mouldProfileId === 9 ? mould : factoryBoard, mouldProfileId, recipeCode, recipeSuggested: false,
      } : item);
      return true;
    });
    const foamPreview = preview({
      orderCount: 1,
      rows: [
        row({ process: 'MIX', processLabel: '发泡', rowKey: '101-MIX' }),
        row({ itemId: 102, process: 'MIX', processLabel: '发泡', rowKey: '102-MIX' }),
        row({ itemId: 104, process: 'MIX', processLabel: '发泡', rowKey: '104-MIX' }),
      ],
      stockCandidates: [upstreamStock],
    });
    api.preview.mockResolvedValue(foamPreview);

    await mount([materialOrder]);
    const panel = document.querySelector('section[aria-label="配方和发泡模具"]')!;
    expect(panel.textContent).toContain('已选');
    expect(panel.textContent).toContain('按上次建议');
    expect(panel.textContent).toContain('工厂默认');
    expect(panel.textContent).not.toContain('绿色瑜伽垫');
    await selectOption('#split-mp-recipe-101', '调整后配方');
    expect(api.saveMaterial.mock.calls).toEqual([[{ itemId: 101, mouldProfileId: 9, recipeCode: 'REC-NEW' }]]);
    expect(api.preview).not.toHaveBeenCalled();

    button('预览工序任务').click();
    await flush();
    document.querySelector<HTMLInputElement>('[data-stock-key="101-81"] input[type="checkbox"]')!.click();
    await flush();
    await input('[data-stock-key="101-81"] input[role="spinbutton"]', '4');
    button('重新计算').click();
    await flush();
    const stockSelections = [{ itemId: 101, quantity: 4, stockId: 81 }];
    expect(api.preview).toHaveBeenLastCalledWith([11], stockSelections);
    expect(button('确认下发 3 个任务').disabled).toBe(false);
    button('批量设置').click();
    await flush();
    document.querySelector<HTMLInputElement>('input[aria-label="勾选 紫色瑜伽垫"]')!.click();
    document.querySelector<HTMLInputElement>('input[aria-label="勾选 蓝色瑜伽垫"]')!.click();
    await flush();
    await selectOption('#split-mp-batch-recipe', '标准配方');
    await selectOption('#split-mp-batch-board', '备用模具');

    api.preview.mockResolvedValue({ ...foamPreview, previewKey: 'after-foam-update' });
    let completeSave: () => void;
    pendingSave = new Promise((resolve) => { completeSave = resolve; });
    button('应用到所选产品').click();
    await flush();
    expect(button('确认下发 3 个任务').disabled).toBe(true);
    expect(api.preview).toHaveBeenCalledTimes(2);
    completeSave!();
    await flush();
    expect(api.saveMaterial.mock.calls.slice(1)).toEqual([
      [{ itemId: 101, mouldProfileId: 9, recipeCode: 'REC-1' }],
      [{ itemId: 102, mouldProfileId: 9, recipeCode: 'REC-1' }],
    ]);
    expect(api.preview).toHaveBeenCalledTimes(3);
    expect(api.preview).toHaveBeenLastCalledWith([11], stockSelections);
    button('确认下发 3 个任务').click();
    await flush();
    expect(api.release).toHaveBeenCalledWith(expect.objectContaining({ previewKey: 'after-foam-update', stockSelections }));
  });

  it('loads material configuration separately for each selected order', async () => {
    const foamOrders = orders.map((order) => ({
      ...order,
      items: order.items.map((item) => ({ ...item, processes: ['MIX'] })),
    }));
    api.materialPlan.mockImplementation(async (orderId: number): Promise<MaterialApi.Plan> => {
      const order = foamOrders.find(({ id }) => id === orderId)!;
      return {
        items: order.items.map((item) => ({
          candidates: [], itemId: item.id, productName: item.productName, quantity: item.quantity,
          raws: [], remaining: item.quantity, stock: [], warnings: [],
        })),
        orderId, orderNo: order.orderNo, shortage: false, totals: [],
      };
    });

    await mount(foamOrders);
    expect(api.materialPlan).toHaveBeenCalledExactlyOnceWith(11);
    expect(document.querySelector('#split-mp-recipe-101')).not.toBeNull();
    await selectOption('#split-material-order', 'GD-12');
    expect(api.materialPlan).toHaveBeenLastCalledWith(12);
    expect(document.querySelector('#split-mp-recipe-101')).toBeNull();
    expect(document.querySelector('#split-mp-recipe-103')).not.toBeNull();
    expect(api.saveMaterial).not.toHaveBeenCalled();
  });

  it('invalidates the old preview even if refreshing a saved item fails', async () => {
    await mount(); button('预览工序任务').click(); await flush();
    button('修改参数与工艺').click(); await flush();
    api.get.mockRejectedValueOnce(new Error('refresh failed'));
    document.querySelector<HTMLButtonElement>('#save-config-test')!.click(); await flush();
    expect(document.body.textContent).toContain('旧预览已作废');
    expect(document.querySelector('.split-process-tasks')).toBeNull();
    expect(api.release).not.toHaveBeenCalled();
  });

  it('does not expose editing to users without order handling permission', async () => {
    api.canEdit = false;
    const order = orders[0]!;
    await mount([{ ...order, items: order.items.map((item) => ({ ...item, processes: ['MIX'] })) }]);
    expect(document.querySelector('section[aria-label="配方与发泡模具"]')).toBeNull();
    expect(api.materialPlan).not.toHaveBeenCalled();
    button('预览工序任务').click(); await flush();
    expect([...document.querySelectorAll('button')].some((element) => element.textContent === '修改参数与工艺')).toBe(false);
  });

  it('requires a new preview after returning to change selected orders', async () => {
    await mount();
    button('预览工序任务').click(); await flush();
    button('返回选择订单').click(); await flush();
    document.querySelector<HTMLInputElement>('input[aria-label="选择订单 GD-11"]')!.click(); await flush();
    api.preview.mockResolvedValue(preview({ previewKey: 'preview-12', orderCount: 1 }));
    expect([...document.querySelectorAll('button')].some((el) => el.textContent?.includes('确认下发 3'))).toBe(false);
    button('预览工序任务').click(); await flush();
    expect(api.preview).toHaveBeenLastCalledWith([12]);
    button('确认下发 3 个任务').click(); await flush();
    expect(api.release).toHaveBeenCalledWith(expect.objectContaining({ productionOrderIds: [12], previewKey: 'preview-12' }));
  });

  it('reuses the request id after a failed confirmation so retry cannot create duplicate tasks', async () => {
    api.release.mockRejectedValueOnce(new Error('网络中断'));
    await mount();
    button('预览工序任务').click(); await flush();
    button('确认下发 3 个任务').click(); await flush();
    const first = api.release.mock.calls[0]![0];
    expect(document.querySelector<HTMLTextAreaElement>('#split-release-note')!.disabled).toBe(true);
    // 即使外部状态发生变化，重试仍复用第一次提交的完整内容。
    await input('#split-release-note', '这次修改不能影响重试');
    button('确认下发 3 个任务').click(); await flush();
    expect(api.release).toHaveBeenNthCalledWith(2, first);
  });

  it('refreshes a stale preview with a new confirmation id', async () => {
    api.release.mockRejectedValueOnce(new Error('预览过期'));
    await mount();
    button('预览工序任务').click(); await flush();
    button('确认下发 3 个任务').click(); await flush();
    const first = api.release.mock.calls[0]![0];
    api.preview.mockResolvedValue(preview({ previewKey: 'preview-current' }));
    expect(button('确认下发 3 个任务').disabled).toBe(true);
    button('重新计算').click(); await flush();
    button('确认下发 3 个任务').click(); await flush();
    const second = api.release.mock.calls[1]![0];
    expect(second.previewKey).toBe('preview-current');
    expect(second.requestId).not.toBe(first.requestId);
  });

  it('starts with no batches selected and only confirms the quantities in the newest reviewed calculation', async () => {
    const sheetStock: SplitApi.StockCandidate = { ...upstreamStock, stockId: 83, stage: 'SHEET', stageLabel: '已开片板材',
      itemCode: 'KP-A', batchNo: 'KP-01', side: 'FRONT', perUnit: 8, unit: '片', startProcess: 'PUNCH', startProcessLabel: '冲裁' };
    api.preview.mockResolvedValue(preview({ stockCandidates: [upstreamStock, finishedStock, sheetStock], stockPlan: [],
      stockCoverage: [{ itemId: 101, covered: 0, remainingFromStart: 100 }] }));
    await mount();
    button('预览工序任务').click(); await flush();

    const checkbox = (stockId: number) => document.querySelector<HTMLInputElement>(`[data-stock-key="101-${stockId}"] input[type="checkbox"]`)!;
    expect(checkbox(81).checked).toBe(false);
    expect(checkbox(82).checked).toBe(false);
    expect(checkbox(83).checked).toBe(false);
    expect(document.body.textContent).toContain('需从头做 100 条');
    expect(document.querySelector('[data-stock-key="101-82"]')?.textContent).toContain('按仓库汇总');
    expect(document.querySelector('[data-stock-key="101-83"]')?.textContent).toContain('面别 正面层');
    expect(document.querySelector('[data-stock-key="101-83"]')?.textContent).toContain('参考：每片折算 8 片正面层');

    checkbox(81).click(); await flush();
    await input('[data-stock-key="101-81"] input[role="spinbutton"]', '4');
    expect(api.preview).toHaveBeenCalledOnce();
    expect(button('确认下发 3 个任务').disabled).toBe(true);
    expect(api.release).not.toHaveBeenCalled();

    api.preview.mockResolvedValue(preview({ previewKey: 'with-stock', stockCandidates: [upstreamStock, finishedStock],
      stockPlan: [{ ...upstreamStock, quantity: 3, covers: 3 }],
      stockCoverage: [{ itemId: 101, covered: 3, remainingFromStart: 97 }] }));
    button('重新计算').click(); await flush();
    const choices = [{ itemId: 101, quantity: 4, stockId: 81 }];
    expect(api.preview).toHaveBeenLastCalledWith([11, 12], choices);
    expect(checkbox(81).checked).toBe(true);
    expect(checkbox(82).checked).toBe(false);
    expect(document.body.textContent).toContain('可覆盖 3 条');
    expect(document.body.textContent).toContain('需从头做 97 条');
    expect(document.body.textContent).toContain('计划领用 3 件');
    expect(document.body.textContent).toContain('从包装接做');
    button('确认下发 3 个任务').click(); await flush();
    expect(api.release).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ previewKey: 'with-stock', stockSelections: choices }));
  });

  it('keeps chosen finished stock out of the plan and refreshes after its manual receipt', async () => {
    api.preview.mockResolvedValue(preview({ stockCandidates: [upstreamStock, finishedStock], stockPlan: [],
      stockCoverage: [{ itemId: 101, covered: 0, remainingFromStart: 100 }] }));
    api.advice.mockResolvedValueOnce(adviceResult({ status: 'READY' }));
    await mount([{ ...orders[0]!, sourceType: 'PURCHASE_ORDER' }]);
    button('预览工序任务').click(); await flush();
    button('生成 AI 建议').click(); await flush();
    for (const stockId of [81, 82]) {
      document.querySelector<HTMLInputElement>(`[data-stock-key="101-${stockId}"] input[type="checkbox"]`)!.click();
      await flush();
      await input(`[data-stock-key="101-${stockId}"] input[role="spinbutton"]`, '2');
    }
    expect(document.body.textContent).toContain('已勾选末道现货');
    expect(button('确认下发 3 个任务').disabled).toBe(true);
    button('先生产入库').click(); await flush();
    expect(manualDelivery).toHaveBeenCalledExactlyOnceWith({ itemId: 101, orderId: 11, quantity: 2, stockId: 82 });
    expect(document.querySelector('#split-stock-heading')).toBeTruthy();
    expect(document.querySelector('[data-stock-advice-item="101"]')).toBeTruthy();
    expect(api.release).not.toHaveBeenCalled();

    api.preview.mockResolvedValue(preview({ previewKey: 'after-inbound', stockCandidates: [upstreamStock],
      stockPlan: [{ ...upstreamStock, quantity: 2, covers: 2 }],
      stockCoverage: [{ itemId: 101, covered: 2, remainingFromStart: 96 }] }));
    recordDelivery({ itemId: 101, revision: 1, stockId: 82 }); await flush();
    expect(api.get).toHaveBeenCalledWith(11);
    expect(api.preview).toHaveBeenLastCalledWith([11], [{ itemId: 101, quantity: 2, stockId: 81 }]);
    expect(document.querySelector<HTMLInputElement>('[data-stock-key="101-81"] input[type="checkbox"]')?.checked).toBe(true);
    expect(document.querySelector('[data-stock-key="101-82"]')).toBeNull();
    expect(document.querySelector('[data-stock-advice-item]')).toBeNull();
    expect(document.body.textContent).toContain('现货已登记');
    expect(document.body.textContent).toContain('需从头做 96 条');
    expect(api.release).not.toHaveBeenCalled();
  });

  it('shows read-only rule facts while AI runs and leaves selection and release independent', async () => {
    api.preview.mockResolvedValue(preview({ stockCandidates: adviceCandidates }));
    api.advice.mockResolvedValueOnce(adviceResult());
    const interpretation = adviceResult({ source: 'AI', status: 'READY' });
    interpretation.items[1]!.summary = '片材规格匹配，从立切接做。';
    api.adviceResult.mockResolvedValueOnce(interpretation);
    await mount([{ ...orders[0]!, sourceType: 'PURCHASE_ORDER' }]);
    button('预览工序任务').click(); await flush();
    expect(api.advice).not.toHaveBeenCalled();

    button('生成 AI 建议').click(); await flush();
    expect(api.advice).toHaveBeenCalledExactlyOnceWith({ productionOrderIds: [11], previewKey: 'preview-1' }, expect.any(AbortSignal));
    expect(document.body.textContent).toContain('系统核算建议');
    expect(document.body.textContent).toContain('建议先生产入库 2 条');
    expect(document.body.textContent).toContain('预计入库后仍待入库 98 条');
    expect(document.body.textContent).toContain('按建议办理入库或交货后预计还需从头做 98 条');
    expect(document.body.textContent).toContain('半成品预计覆盖 3 条');
    expect(button('确认下发 3 个任务').disabled).toBe(false);

    await vi.advanceTimersByTimeAsync(1500); await flush();
    expect(api.adviceResult).toHaveBeenCalledExactlyOnceWith('advice-1', expect.any(AbortSignal));
    expect(document.body.textContent).toContain('AI 解读 · 库存与数量由系统核算');
    expect(document.body.textContent).toContain('片材规格匹配，从立切接做。');
    expect(document.body.textContent).not.toContain('填入建议量');
    expect([...document.querySelectorAll<HTMLInputElement>('[data-stock-key] input[type="checkbox"]')].every((field) => !field.checked)).toBe(true);
    expect([...document.querySelectorAll<HTMLInputElement>('[data-stock-key] input[role="spinbutton"]')].every((field) => !field.value)).toBe(true);
    expect(api.preview).toHaveBeenCalledOnce();
    expect(api.release).not.toHaveBeenCalled();
    expect(manualDelivery).not.toHaveBeenCalled();
  });

  it('fills a suggested quantity only after an explicit click on an already selected candidate', async () => {
    api.preview.mockResolvedValue(preview({ stockCandidates: adviceCandidates }));
    api.advice.mockResolvedValueOnce(adviceResult({ status: 'READY' }));
    await mount();
    button('预览工序任务').click(); await flush();
    const checkbox = document.querySelector<HTMLInputElement>('[data-stock-key="102-83"] input[type="checkbox"]')!;
    const qty = '[data-stock-key="102-83"] input[role="spinbutton"]';
    checkbox.click(); await flush();
    await input(qty, '4');
    button('重新计算').click(); await flush();
    button('生成 AI 建议').click(); await flush();

    expect(api.advice).toHaveBeenCalledExactlyOnceWith({ productionOrderIds: [11, 12], previewKey: 'preview-1', stockSelections: [{ itemId: 102, stockId: 83, quantity: 4 }] }, expect.any(AbortSignal));
    expect(document.querySelector<HTMLInputElement>(qty)?.value).toBe('4');
    expect([...document.querySelectorAll('button')].filter((field) => field.textContent === '填入建议量')).toHaveLength(1);
    button('填入建议量').click(); await flush();
    expect(checkbox.checked).toBe(true);
    expect(document.querySelector<HTMLInputElement>(qty)?.value).toBe('3');
    expect(document.querySelector('[data-stock-advice-item="102"]')).toBeTruthy();
    expect(document.body.textContent).toContain('以下建议基于上次预览');
    expect(button('确认下发 3 个任务').disabled).toBe(true);
    expect(api.preview).toHaveBeenCalledTimes(2);
    expect(api.release).not.toHaveBeenCalled();
  });

  it('keeps advice as reference while multiple batches are checked until recalculation', async () => {
    api.preview.mockResolvedValue(preview({ stockCandidates: adviceCandidates }));
    api.advice.mockResolvedValueOnce(adviceResult({ status: 'READY' }));
    await mount();
    button('预览工序任务').click(); await flush();
    button('生成 AI 建议').click(); await flush();
    const stockField = (key: string) => document.querySelector<HTMLInputElement>(`[data-stock-key="${key}"] input[type="checkbox"]`)!;
    const qty = '[data-stock-key="102-83"] input[role="spinbutton"]';
    expect(document.body.textContent).not.toContain('填入建议量');

    stockField('102-83').click(); await flush();
    expect(document.querySelector<HTMLInputElement>(qty)?.value).toBe('');
    expect(document.body.textContent).toContain('以下建议基于上次预览');
    button('填入建议量').click(); await flush();
    expect(document.querySelector<HTMLInputElement>(qty)?.value).toBe('3');
    stockField('101-81').click(); await flush();
    await input('[data-stock-key="101-81"] input[role="spinbutton"]', '2');
    expect(document.querySelectorAll('[data-stock-advice-item]')).toHaveLength(2);
    expect(button('确认下发 3 个任务').disabled).toBe(true);
    expect(api.preview).toHaveBeenCalledOnce();
    expect(api.advice).toHaveBeenCalledOnce();

    button('重新计算').click(); await flush();
    expect(document.querySelector('[data-stock-advice-item]')).toBeNull();
    expect(document.body.textContent).not.toContain('以下建议基于上次预览');
    expect(stockField('102-83').checked).toBe(true);
    expect(stockField('101-81').checked).toBe(true);
  });

  it('cancels a pending advice response after stock changes and ignores the late result', async () => {
    api.preview.mockResolvedValue(preview({ stockCandidates: adviceCandidates }));
    api.advice.mockResolvedValueOnce(adviceResult());
    let finish!: (result: SplitApi.StockAdvice) => void;
    api.adviceResult.mockImplementationOnce(() => new Promise<SplitApi.StockAdvice>((resolve) => { finish = resolve; }));
    await mount();
    button('预览工序任务').click(); await flush();
    button('生成 AI 建议').click(); await flush();
    await vi.advanceTimersByTimeAsync(1500);
    const signal = api.advice.mock.calls[0]![1] as AbortSignal;

    document.querySelector<HTMLInputElement>('[data-stock-key="101-81"] input[type="checkbox"]')!.click(); await flush();
    expect(signal.aborted).toBe(true);
    finish(adviceResult({ source: 'AI', status: 'READY' }));
    await vi.advanceTimersByTimeAsync(10_000); await flush();
    expect(document.querySelector('[data-stock-advice-item="101"]')).toBeTruthy();
    expect(document.body.textContent).toContain('以下建议基于上次预览');
    expect(document.body.textContent).toContain('系统核算建议');
    expect(document.body.textContent).not.toContain('AI 解读');
    expect(api.adviceResult).toHaveBeenCalledOnce();
    expect(api.release).not.toHaveBeenCalled();
  });

  it('keeps the rule advice and normal release available if AI times out', async () => {
    api.preview.mockResolvedValue(preview({ stockCandidates: adviceCandidates }));
    api.advice.mockResolvedValueOnce(adviceResult());
    api.adviceResult.mockImplementationOnce(() => new Promise(() => {}));
    await mount();
    button('预览工序任务').click(); await flush();
    button('生成 AI 建议').click(); await flush();
    await vi.advanceTimersByTimeAsync(40_000); await flush();

    expect(document.querySelector('[data-stock-advice-item="101"]')).toBeTruthy();
    expect(document.body.textContent).toContain('AI 暂未返回，已保留系统核算建议');
    expect(document.body.textContent).not.toContain('AI 正在生成建议');
    expect(button('确认下发 3 个任务').disabled).toBe(false);
    expect(api.release).not.toHaveBeenCalled();
  });

  it('keeps finished receipt visible for blocked products and discards explicitly stale advice', async () => {
    api.preview.mockResolvedValue(preview({ stockCandidates: adviceCandidates }));
    const pending = adviceResult();
    pending.items[0]!.planningBlocked = true;
    api.advice.mockResolvedValueOnce(pending);
    api.adviceResult.mockResolvedValueOnce(adviceResult({ items: [], notice: '库存已变化，请重新预览。', status: 'STALE' }));
    await mount([{ ...orders[0]!, sourceType: 'PURCHASE_ORDER' }]);
    button('预览工序任务').click(); await flush();
    button('生成 AI 建议').click(); await flush();

    const item = document.querySelector('[data-stock-advice-item="101"]')?.textContent;
    expect(item).toContain('暂不可拆分');
    expect(item).toContain('预计还需从头做 —');
    expect(item).toContain('建议先生产入库 2 条');
    expect(item).toContain('预计入库后仍待入库 98 条');

    await vi.advanceTimersByTimeAsync(1500); await flush();
    expect(document.querySelector('[data-stock-advice-item]')).toBeNull();
    expect(document.body.textContent).toContain('库存已变化，请重新预览。');
    expect(button('确认下发 3 个任务').disabled).toBe(false);
    expect(api.release).not.toHaveBeenCalled();
  });

  it('loads orders when opened without a preset and searches every product code before selecting', async () => {
    await mount([]);
    expect(api.orders).toHaveBeenCalledOnce();
    expect(button('预览工序任务').disabled).toBe(true);
    await input('#split-order-search', 'SKU-BLUE');
    expect(document.body.textContent).toContain('GD-11');
    expect(document.body.textContent).not.toContain('GD-12');
    document.querySelector<HTMLInputElement>('input[aria-label="选择订单 GD-11"]')!.click(); await flush();
    button('预览工序任务').click(); await flush();
    expect(api.preview).toHaveBeenCalledWith([11]);
  });

  it('ignores late preview responses after closing and starts a fresh selection on reopening', async () => {
    let resolve!: (result: SplitApi.Preview) => void;
    api.preview.mockImplementationOnce(() => new Promise<SplitApi.Preview>((done) => { resolve = done; }));
    await mount();
    button('预览工序任务').click(); await flush();
    setOpen(false); await flush();
    resolve(preview()); await flush();
    setOpen(true); await flush();
    expect(button('预览工序任务').disabled).toBe(false);
    expect(document.querySelector('.split-process-tasks')).toBeNull();
    expect(api.release).not.toHaveBeenCalled();
  });

  it('returns to the first preview page when searching products', async () => {
    api.preview.mockResolvedValue(preview({ taskCount: 25, rows: Array.from({ length: 25 }, (_, index) => row({ rowKey: `row-${index}`, productCode: `PRODUCT-${index}`, productName: `测试产品${index}` })) }));
    await mount(); button('预览工序任务').click(); await flush();
    document.querySelector<HTMLLIElement>('.ant-pagination-item-2')!.click(); await flush();
    expect(document.querySelector('.ant-pagination-item-active')?.textContent).toBe('2');
    await input('#split-task-search', 'PRODUCT-1');
    expect(document.querySelector('.ant-pagination-item-active')?.textContent).toBe('1');
    expect(document.querySelector('.split-process-tasks')!.textContent).toContain('测试产品1');
    expect(document.querySelector('.split-process-tasks')!.textContent).not.toContain('测试产品24');
  });

  it('keeps an eighteen-product order compact and exposes every product in its expanded table', async () => {
    const manyItems = Array.from({ length: 18 }, (_, index) => ({ ...orders[0]!.items[0]!, id: 200 + index, productName: `十八条明细产品${index + 1}` }));
    await mount([{ ...orders[0]!, items: manyItems }]);
    expect(document.body.textContent).toContain('共 18 个产品，展开查看完整明细');
    expect(document.body.textContent).not.toContain('十八条明细产品18');
    document.querySelector<HTMLButtonElement>('.ant-table-row-expand-icon')!.click(); await flush();
    expect(document.body.textContent).toContain('十八条明细产品18');
  });

  it('shows saved order colours, total and layer thicknesses, and explicitly missing reverse texture', async () => {
    await mount([{ ...orders[0]!, items: [{ ...orders[0]!.items[0]!, processes: ['EMBOSS', 'PACK'], targetConfirmedAt: null, targetColorMode: 'DUAL', targetConstructionType: 'DOUBLE_LAYER', targetFrontColor: 'ZI', targetBackColor: 'LAN', targetThickness: 0.6, targetFrontThickness: 0.2, targetBackThickness: 0.4, targetTextureFront: 'SH', targetTextureBack: null }] }]);
    document.querySelector<HTMLButtonElement>('.ant-table-row-expand-icon')!.click(); await flush();
    const details = document.querySelector('.ant-table-expanded-row')!.textContent!;
    expect(details).toContain('已保存：单双色 / 总厚');
    expect(details).toContain('双色 · 双层');
    expect(details).toContain('成品总厚 6 mm');
    expect(details).toContain('颜色：紫色 (ZI)');
    expect(details).toContain('颜色：蓝色 (LAN)');
    expect(details).toContain('层厚：2 mm');
    expect(details).toContain('层厚：4 mm');
    expect(details).toContain('压花纹路：贝壳纹 (SH)');
    expect(details).toContain('压花纹路：未填写');
  });

  it('shows two colour rows through mixing, slicing and cutting, then a combined full-thickness laminate without hiding upstream plans for missing texture', async () => {
    const specs = { colorMode: 'DUAL' as const, frontColor: 'ZI', frontColorName: '紫色', backColor: 'LAN', backColorName: '蓝色', finishedThickness: 0.6, frontThickness: 0.3, backThickness: 0.3, textureFront: null, textureBack: null };
    const tasks: SplitApi.Row[] = ['MIX', 'SLICE', 'CUT'].flatMap((process, index) => (['FRONT', 'BACK'] as const).map((side) => row({ ...specs,
      rowKey: `${process}-${side}`, process, processLabel: ({ MIX: '发泡', SLICE: '开片', CUT: '立切' } as Record<string, string>)[process], sequence: index + 1, side,
      stageColor: side === 'FRONT' ? 'ZI' : 'LAN', stageColorName: side === 'FRONT' ? '紫色' : '蓝色',
      stageThickness: process === 'MIX' ? 4.5 : 0.3,
    })));
    tasks.push(row({ ...specs, rowKey: 'LAMINATE', process: 'LAMINATE', processLabel: '贴合', side: null, stageThickness: 0.6,
      output: { stage: 'LAMINATED', attrs: { frontColor: 'ZI', backColor: 'LAN', thickness: 0.6 } } }), row({ ...specs, rowKey: 'EMBOSS', process: 'EMBOSS', processLabel: '压花', side: null, stageThickness: 0.6, status: 'BLOCKED', reason: '正反压花纹路未填写',
      output: { stage: 'EMBOSSED', attrs: { frontColor: 'ZI', backColor: 'LAN', thickness: 0.6 } } }));
    api.preview.mockResolvedValue(preview({ canRelease: false, taskCount: 8, rows: tasks, errors: ['请填写正反面压花纹路'], itemCount: 1, orderCount: 1 }));
    await mount(); button('预览工序任务').click(); await flush();
    const body = (key: string) => document.querySelector(`.split-process-tasks tr[data-row-key="${key}"]`)!.textContent!;
    for (const process of ['MIX', 'SLICE', 'CUT']) {
      expect(body(`${process}-FRONT`)).toContain('正面层');
      expect(body(`${process}-FRONT`)).toContain('颜色：紫色 (ZI)');
      expect(body(`${process}-BACK`)).toContain('反面层');
      expect(body(`${process}-BACK`)).toContain('颜色：蓝色 (LAN)');
      expect(body(`${process}-FRONT`)).toContain(process === 'MIX' ? '板材厚 45 mm' : '单层厚 3 mm');
      expect(body(`${process}-BACK`)).toContain(process === 'MIX' ? '板材厚 45 mm' : '单层厚 3 mm');
      expect(body(`${process}-FRONT`)).toContain('配置通过');
    }
    expect(body('LAMINATE')).toContain('贴合后 · 正反合并');
    expect(body('LAMINATE')).toContain('成品总厚 6 mm');
    expect(body('EMBOSS')).toContain('正反压花纹路未填写');
    expect(button('确认下发 8 个任务').disabled).toBe(true);
    const overview = document.querySelector('.split-product-specs')!.textContent!;
    expect(overview).toContain('双色');
    expect(overview).toContain('正面：未填写');
    expect(overview).toContain('反面：未填写');
    expect(document.querySelectorAll('.split-product-specs tr.ant-table-row')).toHaveLength(1);
    expect(document.body.textContent).toContain('8 个计划任务');
  });

  it('renders a single-colour task as one full-thickness layer and keeps absent colour unknown', async () => {
    api.preview.mockResolvedValue(preview({ taskCount: 1, rows: [row({ colorMode: 'SINGLE', side: 'FRONT', stageThickness: 0.8, finishedThickness: 0.8, frontThickness: 0.8, stageColor: null, stageColorName: null })] }));
    await mount(); button('预览工序任务').click(); await flush();
    const task = document.querySelector('.split-process-tasks tr.ant-table-row')!.textContent!;
    expect(task).toContain('单色单层');
    expect(task).toContain('单层厚 8 mm');
    expect(task).toContain('颜色：未填写');
    expect(task).not.toContain('反面层');
    expect(document.querySelectorAll('.split-process-tasks tr.ant-table-row')).toHaveLength(1);
    api.preview.mockResolvedValue(preview({ taskCount: 1, rows: [row({ colorMode: 'SINGLE', side: 'FRONT', stageThickness: 0.8, stageColor: 'ZI', stageColorName: '紫色' })] }));
    button('重新预览').click(); await flush();
    expect(document.querySelector('.split-process-tasks tr.ant-table-row')!.textContent).toContain('颜色：紫色 (ZI)');
  });
});
