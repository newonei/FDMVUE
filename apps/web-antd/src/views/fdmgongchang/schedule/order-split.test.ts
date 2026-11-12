import type { FdmgongchangProductionOrderApi as OrderApi } from '#/api/fdmgongchang/production-order';
import type { FdmgongchangOrderSplitApi as SplitApi } from '#/api/fdmgongchang/schedule';

import { createApp, defineComponent, h, nextTick, ref } from 'vue';

import { Modal } from 'ant-design-vue';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import OrderSplitModal from './modules/order-split-modal.vue';

const api = vi.hoisted(() => ({ orders: vi.fn(), get: vi.fn(), canEdit: true, preview: vi.fn(), release: vi.fn() }));
vi.mock('#/api/fdmgongchang/production-order', () => ({
  getOpenProductionOrders: api.orders,
  getProductionOrder: api.get,
  getTargetOptions: vi.fn().mockResolvedValue({ colors: [{ value: 'ZI', label: '紫色' }, { value: 'LAN', label: '蓝色' }], textures: [{ value: 'SH', label: '贝壳纹' }], materials: [], patterns: [] }),
}));
vi.mock('@vben/access', () => ({ useAccess: () => ({ hasAccessByCodes: () => api.canEdit }) }));
vi.mock('../production-order/modules/item-production-config-modal.vue', () => ({
  default: defineComponent({
    props: ['open', 'orderId', 'itemId'], emits: ['saved', 'update:open'],
    setup: (props, { emit }) => () => props.open ? h('button', { id: 'save-config-test', onClick: () => { emit('update:open', false); emit('saved'); } }, `保存生产参数 ${props.orderId}/${props.itemId}`) : null,
  }),
}));
vi.mock('#/api/fdmgongchang/schedule', () => ({ previewOrderSplit: api.preview, releaseOrderSplit: api.release }));

const orders: OrderApi.Order[] = [
  {
    id: 11, orderNo: 'GD-11', factoryId: 1, requesterUserId: 1, status: 'ACCEPTED', statusLabel: '生产中', totalQuantity: 200, completedQuantity: 0,
    customerName: '客户甲', requiredDate: '2026-12-10',
    items: [
      { id: 101, productId: 'p1', productCode: 'SKU-PURPLE', productName: '紫色瑜伽垫', specification: '183×61×0.6cm', quantity: 120, completedQuantity: 20, unit: '条', processes: ['SLICE', 'PACK'], routeName: '开片包装', targetConfirmedAt: '2026-11-12', recipeCode: 'REC-1' },
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
    process: 'SLICE', processLabel: '开片', sequence: 1, quantity: 40, unit: '片', status: 'READY', upstreamProcesses: [],
    inputs: [{ stage: 'BOARD', name: '紫色板材', quantity: 3, unit: '张' }],
    output: { stage: 'SHEET', attrs: { material: 'TPE', length: 183, width: 61, thickness: 0.6 }, quantity: 40, unit: '片' }, ...overrides };
}

function preview(overrides: Partial<SplitApi.Preview> = {}): SplitApi.Preview {
  return { previewKey: 'preview-1', canRelease: true, orderCount: 2, itemCount: 3, taskCount: 2, errors: [],
    warnings: ['板材库存不足，任务仍完整下发；请安排备料'],
    rows: [row(), row({ rowKey: '101-PACK', process: 'PACK', processLabel: '包装', sequence: 2, quantity: 100, unit: '件', upstreamProcesses: ['SLICE'] })], ...overrides };
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

describe('order selection → process preview → release', () => {
  let unmount: (() => void) | undefined;
  let setOpen: (value: boolean) => void;
  const released = vi.fn();
  async function mount(preset: OrderApi.Order[] = orders) {
    const isOpen = ref(false);
    setOpen = (value) => { isOpen.value = value; };
    const host = document.createElement('div');
    document.body.append(host);
    const app = createApp(defineComponent({ setup: () => () => h(OrderSplitModal, {
      open: isOpen.value, orders: preset, 'onUpdate:open': (value: boolean) => { isOpen.value = value; }, onReleased: released,
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
    api.preview.mockResolvedValue(preview());
    api.release.mockResolvedValue({ scheduleId: 7, scheduleNo: 'PB-7', tasks: 2, mixTasks: 0, warnings: [], reused: false });
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
    expect(document.body.textContent).toContain('开片 → 包装');
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
    expect(document.body.textContent).toContain('包装车间');
    expect(document.body.textContent).not.toContain('发泡车间');
    expect(document.body.textContent).toContain('40 片');
    expect(document.body.textContent).toContain('100 件');
    expect(document.body.textContent).toContain('板材库存不足');
    expect(button('确认下发 2 个任务').disabled).toBe(false);
    await input('#split-release-note', '  尽快备料  ');
    button('确认下发 2 个任务').click();
    await flush();
    expect(api.release).toHaveBeenCalledWith({ productionOrderIds: [11, 12], previewKey: 'preview-1', requestId: expect.any(String), note: '尽快备料' });
    expect(api.release.mock.calls[0]![0].requestId).toMatch(/^[\da-f-]{36}$/i);
    expect(released).toHaveBeenCalledWith(7);
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
    expect(button('确认下发 2 个任务').disabled).toBe(true);
    expect(document.querySelector('#save-config-test')?.textContent).toContain('11/101');
    api.preview.mockResolvedValue(preview({ previewKey: 'after-user-edit' }));
    document.querySelector<HTMLButtonElement>('#save-config-test')!.click(); await flush();
    expect(api.get).toHaveBeenCalledWith(11);
    expect(api.preview).toHaveBeenCalledTimes(2);
    button('确认下发 2 个任务').click(); await flush();
    expect(api.release).toHaveBeenCalledWith(expect.objectContaining({ previewKey: 'after-user-edit' }));
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
    await mount(); button('预览工序任务').click(); await flush();
    expect([...document.querySelectorAll('button')].some((element) => element.textContent === '修改参数与工艺')).toBe(false);
  });

  it('requires a new preview after returning to change selected orders', async () => {
    await mount();
    button('预览工序任务').click(); await flush();
    button('返回选择订单').click(); await flush();
    document.querySelector<HTMLInputElement>('input[aria-label="选择订单 GD-11"]')!.click(); await flush();
    api.preview.mockResolvedValue(preview({ previewKey: 'preview-12', orderCount: 1 }));
    expect([...document.querySelectorAll('button')].some((el) => el.textContent?.includes('确认下发 2'))).toBe(false);
    button('预览工序任务').click(); await flush();
    expect(api.preview).toHaveBeenLastCalledWith([12]);
    button('确认下发 2 个任务').click(); await flush();
    expect(api.release).toHaveBeenCalledWith(expect.objectContaining({ productionOrderIds: [12], previewKey: 'preview-12' }));
  });

  it('reuses the request id after a failed confirmation so retry cannot create duplicate tasks', async () => {
    api.release.mockRejectedValueOnce(new Error('网络中断'));
    await mount();
    button('预览工序任务').click(); await flush();
    button('确认下发 2 个任务').click(); await flush();
    const first = api.release.mock.calls[0]![0];
    expect(document.querySelector<HTMLTextAreaElement>('#split-release-note')!.disabled).toBe(true);
    // 即使外部状态发生变化，重试仍复用第一次提交的完整内容。
    await input('#split-release-note', '这次修改不能影响重试');
    button('确认下发 2 个任务').click(); await flush();
    expect(api.release).toHaveBeenNthCalledWith(2, first);
  });

  it('refreshes a stale preview with a new confirmation id', async () => {
    api.release.mockRejectedValueOnce(new Error('预览过期'));
    await mount();
    button('预览工序任务').click(); await flush();
    button('确认下发 2 个任务').click(); await flush();
    const first = api.release.mock.calls[0]![0];
    api.preview.mockResolvedValue(preview({ previewKey: 'preview-current' }));
    button('重新预览').click(); await flush();
    button('确认下发 2 个任务').click(); await flush();
    const second = api.release.mock.calls[1]![0];
    expect(second.previewKey).toBe('preview-current');
    expect(second.requestId).not.toBe(first.requestId);
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
    await mount([{ ...orders[0]!, items: [{ ...orders[0]!.items[0]!, targetColorMode: 'DUAL', targetConstructionType: 'DOUBLE_LAYER', targetFrontColor: 'ZI', targetBackColor: 'LAN', targetThickness: 0.6, targetFrontThickness: 0.2, targetBackThickness: 0.4, targetTextureFront: 'SH', targetTextureBack: null }] }]);
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
