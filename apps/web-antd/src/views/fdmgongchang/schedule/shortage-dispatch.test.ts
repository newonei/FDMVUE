import type { FdmgongchangOrderSplitApi as Api } from '#/api/fdmgongchang/schedule';

import { createApp, defineComponent, h, nextTick, ref } from 'vue';

import { message } from 'ant-design-vue';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import ShortageDispatchModal from './modules/shortage-dispatch-modal.vue';

const api = vi.hoisted(() => ({ preview: vi.fn(), release: vi.fn() }));
vi.mock('#/api/fdmgongchang/schedule', () => ({
  previewOrderSplit: api.preview,
  releaseOrderSplit: api.release,
}));

const itemId = 20;
const orderId = 30;
const selected = [{ itemId, stockId: 81, quantity: 4 }, { itemId, stockId: 91, quantity: 1 }];
const batches: Api.StockCandidate[] = [
  { itemId, stockId: 91, stage: 'BOARD', stageLabel: '板材', itemCode: 'B-91', batchNo: '板材批次甲', available: 3, unit: '张', deliverable: false, startProcess: 'SLICE' },
  { itemId, stockId: 81, stage: 'CUT', stageLabel: '片材', itemCode: 'C-81', batchNo: '片材批次甲', available: 6, unit: '片', deliverable: false, startProcess: 'LAMINATE' },
];

function plan(overrides: Partial<Api.Preview> = {}): Api.Preview {
  const baseRow = {
    orderId, orderNo: 'GD-30', itemId, productCode: 'TPE-20', productName: '双色瑜伽垫', orderUnit: '条',
    status: 'READY' as const, inputs: [], upstreamProcesses: [],
  };
  return {
    previewKey: 'shortage-plan-key',
    canRelease: true,
    orderCount: 1,
    itemCount: 1,
    taskCount: 4,
    shortage: {
      orderQuantity: 120,
      fulfilledGoodQuantity: 100,
      remainingGoodQuantity: 20,
      pendingGoodQuantity: 8,
      netGoodShortage: 12,
    },
    stockCandidates: batches,
    stockCoverage: [{ itemId, covered: 12, remainingFromStart: 0 }],
    suggestedStockSelections: selected,
    rows: [
      { ...baseRow, rowKey: '20-slice', process: 'SLICE', quantity: 4, unit: '片',
        inputs: [{ stage: 'BOARD', name: '发泡板材', quantity: 1, unit: '张', plannedStockId: 91, plannedBatchNo: '板材批次甲' }] },
      { ...baseRow, rowKey: '20-cut', process: 'CUT', quantity: 20, unit: '片', upstreamProcesses: ['SLICE'] },
      { ...baseRow, rowKey: '20-laminate', process: 'LAMINATE', quantity: 12, unit: '条', upstreamProcesses: ['CUT'],
        inputs: [{ stage: 'CUT', name: '立切片材', quantity: 4, unit: '片', plannedStockId: 81, plannedBatchNo: '片材批次甲' }] },
      { ...baseRow, rowKey: '20-pack', process: 'PACK', quantity: 12, unit: '条', upstreamProcesses: ['LAMINATE'] },
    ],
    errors: [],
    warnings: [],
    ...overrides,
  };
}

let unmount: (() => void) | undefined;
async function flush() {
  for (let i = 0; i < 8; i++) {
    await Promise.resolve();
    await nextTick();
  }
}

function button(text: string) {
  const found = [...document.querySelectorAll('button')].find((element) => element.textContent?.replaceAll(/\s/g, '') === text);
  if (!found) throw new Error(`找不到按钮 ${text}`);
  return found;
}

async function click(text: string) {
  button(text).click();
  await flush();
}

async function replaceQuantity(stockId: number, value: string) {
  const field = document.querySelector<HTMLInputElement>(`#shortage-stock-${stockId}`)!;
  field.value = value;
  field.dispatchEvent(new Event('input', { bubbles: true }));
  await flush();
}

async function mount() {
  const released = vi.fn();
  const host = document.createElement('div');
  document.body.append(host);
  const open = ref(true);
  const app = createApp(defineComponent({ setup: () => () => h(ShortageDispatchModal, {
    factoryId: 1, open: open.value, seed: { itemId, orderId, orderNo: 'GD-30', productName: '双色瑜伽垫', remaining: 50, unit: '条' },
    'onUpdate:open': (value) => { open.value = value; },
    onReleased: released,
  }) }));
  app.mount(host);
  unmount = () => app.unmount();
  await flush();
  return released;
}

describe('order-line shortage dispatch', () => {
  beforeEach(() => {
    api.preview.mockReset();
    api.release.mockReset();
    vi.spyOn(message, 'success').mockImplementation(vi.fn());
  });
  afterEach(() => {
    unmount?.();
    document.body.innerHTML = '';
    vi.restoreAllMocks();
  });

  it('loads the recommended sheets and boards, previews the order route, and releases the same plan once', async () => {
    api.preview.mockResolvedValueOnce(plan({ canRelease: false, rows: [], taskCount: 0 })).mockResolvedValueOnce(plan());
    api.release.mockRejectedValueOnce(new Error('network')).mockResolvedValueOnce({ scheduleId: 9, tasks: 4, warnings: [] });
    const released = await mount();

    expect(api.preview).toHaveBeenCalledExactlyOnceWith([orderId], [], itemId);
    const summary = document.querySelector('[aria-label="订单良品缺口"]')!;
    expect(summary.textContent).toContain('双色瑜伽垫');
    expect(summary.textContent).toContain('本次良品缺口12 条');
    const stock = document.querySelector('[aria-labelledby="shortage-stock-heading"]')!;
    expect(stock.textContent!.indexOf('优先选用匹配片材')).toBeLessThan(stock.textContent!.indexOf('片材不足时选用板材'));
    expect(document.querySelector<HTMLInputElement>('#shortage-stock-81')?.value).toBe('4');
    expect(document.querySelector<HTMLInputElement>('#shortage-stock-91')?.value).toBe('1');
    expect(button('确认下发').disabled).toBe(true);
    expect(api.release).not.toHaveBeenCalled();

    await click('预览工序');
    expect(api.preview).toHaveBeenLastCalledWith([orderId], selected, itemId);
    const sequence = [...document.querySelectorAll('[aria-label="补产工序清单"] > li')].map((row) => row.textContent);
    expect(sequence).toEqual([
      expect.stringContaining('开片'),
      expect.stringContaining('等待开片报出合格批次后领料'),
      expect.stringContaining('等待立切报出合格批次后领料'),
      expect.stringContaining('等待贴合报出合格批次后领料'),
    ]);
    expect(sequence[0]).toContain('计划产出4 片');
    expect(sequence[0]).toContain('批次 板材批次甲');
    expect(sequence[2]).toContain('计划产出12 条');
    const confirm = button('确认下发');
    confirm.click();
    confirm.click();
    await flush();
    expect(api.release).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({
      productionOrderIds: [orderId], shortageItemId: itemId, stockSelections: selected, previewKey: 'shortage-plan-key',
      requestId: expect.any(String),
    }));
    expect(document.body.textContent).toContain('沿用本次提交编号');
    expect(released).not.toHaveBeenCalled();

    await click('确认下发');
    expect(api.release.mock.calls[1]?.[0]).toEqual(api.release.mock.calls[0]?.[0]);
    expect(released).toHaveBeenCalledExactlyOnceWith(9);
  });

  it('requires a new preview after changing selected batches and blocks an uncovered shortage', async () => {
    api.preview
      .mockResolvedValueOnce(plan({ canRelease: false }))
      .mockResolvedValueOnce(plan())
      .mockResolvedValueOnce(plan({
        canRelease: false, errors: ['所选批次不足以覆盖良品缺口'],
        stockCoverage: [{ itemId, covered: 4, remainingFromStart: 8 }],
      }));
    await mount();
    await click('预览工序');
    expect(button('确认下发').disabled).toBe(false);
    await replaceQuantity(91, '0');
    expect(document.querySelector('#shortage-preview-heading')).toBeNull();
    expect(button('确认下发').disabled).toBe(true);
    await click('预览工序');
    expect(api.preview).toHaveBeenLastCalledWith([orderId], [selected[0]], itemId);
    expect(document.body.textContent).toContain('尚缺 8 条');
    expect(button('确认下发').disabled).toBe(true);
    await click('确认下发');
    expect(api.release).not.toHaveBeenCalled();
  });

  it('shows a completed shortage using the latest server quantity', async () => {
    const current = plan();
    api.preview.mockResolvedValue(plan({
      canRelease: false,
      taskCount: 0,
      shortage: { ...current.shortage!, netGoodShortage: 0 },
    }));
    await mount();
    expect(document.body.textContent).toContain('这条明细已无需要补派工的良品缺口');
    expect(document.querySelector('#shortage-stock-heading')).toBeNull();
    expect(api.release).not.toHaveBeenCalled();
  });
});
