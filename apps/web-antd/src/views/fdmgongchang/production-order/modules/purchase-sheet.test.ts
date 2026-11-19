import type { FdmgongchangProductionOrderApi as Api } from '#/api/fdmgongchang/production-order';

import { createApp, h, nextTick, reactive } from 'vue';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { getPurchaseImage, getPurchaseSheet, getTargetOptions } from '#/api/fdmgongchang/production-order';

import PurchaseSheet from './purchase-sheet.vue';

vi.mock('#/api/fdmgongchang/production-order', () => ({ getPurchaseImage: vi.fn(), getPurchaseSheet: vi.fn(), getTargetOptions: vi.fn() }));

const fixture: Api.PurchaseSheet = {
  order: { id: 'po-1', code: 'PO001', lines: [{ id: 'line-1', skuName: '瑜伽垫', quantity: 100, unit: '条', colorMode: 'UNKNOWN', weight: '800g' }] },
  details: { lineExtras: { 'line-1': { colorMode: 'DUAL', frontColor: 'ZI', backColor: 'LAN', textureBack: 'WAVE', weight: '900g±100g', imageId: 'product', colorImageId: 'supplier-front', backColorImageId: 'supplier-back' } } },
};
async function flush() { for (let i = 0; i < 15; i++) { await Promise.resolve(); await nextTick(); } }
let unmount: (() => void) | undefined;
function mountSheet(items?: Api.Item[]) {
  const state = reactive({ orderId: 1, items });
  const host = document.createElement('div'); document.body.append(host);
  const app = createApp({ setup: () => () => h(PurchaseSheet, state) }); app.mount(host);
  unmount = () => app.unmount();
  return state;
}
beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(URL, 'createObjectURL').mockImplementation(() => 'blob:purchase-image');
  vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
  vi.mocked(getPurchaseSheet).mockResolvedValue(fixture);
  vi.mocked(getPurchaseImage).mockResolvedValue(new Blob());
  vi.mocked(getTargetOptions).mockResolvedValue({ colors: [{ label: '紫色', value: 'ZI' }, { label: '蓝色', value: 'LAN' }], textures: [{ label: '波浪纹', value: 'WAVE' }], materials: [], patterns: [] });
});
afterEach(() => { unmount?.(); unmount = undefined; document.body.innerHTML = ''; vi.restoreAllMocks(); });

describe('factory purchase sheet display', () => {
  it('renders per-line manufacturing requirements and downloads both supplier color images independently', async () => {
    mountSheet(); await flush();
    expect(document.body.textContent).toContain('颜色方式：双色');
    expect(document.body.textContent).toContain('正面颜色：紫色');
    expect(document.body.textContent).toContain('反面颜色：蓝色');
    expect(document.body.textContent).toContain('波浪纹');
    expect(document.body.textContent).toContain('900g±100g');
    expect(document.body.textContent).toContain('供应商实物色号图（正面）');
    expect(document.body.textContent).toContain('供应商实物色号图（反面）');
    expect(getPurchaseImage).toHaveBeenCalledWith(1, 'product');
    expect(getPurchaseImage).toHaveBeenCalledWith(1, 'supplier-front');
    expect(getPurchaseImage).toHaveBeenCalledWith(1, 'supplier-back');
    expect(document.querySelectorAll('img')).toHaveLength(3);
  });
  it('does not replace the new order with a stale purchase-sheet response', async () => {
    let resolveOld!: (value: Api.PurchaseSheet) => void;
    vi.mocked(getPurchaseSheet).mockReturnValueOnce(new Promise((resolve) => { resolveOld = resolve; }));
    const state = mountSheet(); await flush();
    vi.mocked(getPurchaseSheet).mockResolvedValue({ ...fixture, order: { ...fixture.order, lines: [{ id: 'line-2', skuName: '新订单产品', quantity: 1 }] }, details: {} });
    state.orderId = 2; await flush();
    resolveOld(fixture); await flush();
    expect(document.body.textContent).toContain('新订单产品');
    expect(document.body.textContent).not.toContain('供应商实物色号图');
    expect(getPurchaseImage).not.toHaveBeenCalled();
  });

  it('matches the confirmed factory spec by purchase row, compares units and retains missing historical values', async () => {
    const item: Api.Item = {
      id: 8, productId: 'p', productName: '瑜伽垫', quantity: 100, completedQuantity: 0, sourceLineId: 'line-1',
      targetConfirmedAt: '2026-11-18', targetLength: 183, targetWidth: 61, targetThickness: 0.6, targetColorMode: 'DUAL',
      targetFrontColor: 'ZI', targetBackColor: 'LAN', targetTextureBack: 'WAVE', processes: ['EMBOSS', 'ENGRAVE'], targetPattern: 'TPE-01',
    };
    mountSheet([{ ...item, id: 9, sourceLineId: 'line-2', targetLength: 999 }, item]); await flush();
    const differences = [...document.querySelectorAll('tbody tr')].map((row) => [...row.querySelectorAll('td')].map((cell) => cell.textContent));
    expect(differences).toContainEqual(['成品长宽厚', '未记录', '1830 × 610 × 6 mm']);
    expect(differences).toContainEqual(['雕刻', '未记录', '激光雕刻 · TPE-01']);
    expect(differences).not.toContainEqual(['反面纹路', '波浪纹', '波浪纹']);
    expect(document.body.textContent).not.toContain('9990');
  });

  it('shows pending confirmation for draft factory parameters', async () => {
    mountSheet([{ id: 8, productId: 'p', productName: '瑜伽垫', quantity: 100, completedQuantity: 0, sourceLineId: 'line-1' }]); await flush();
    expect(document.body.textContent).toContain('工厂执行规格待确认');
    expect(document.body.textContent).not.toContain('工厂已确认');
  });
});
