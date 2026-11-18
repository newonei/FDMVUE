import type { FdmgongchangProductionOrderApi as Api } from '#/api/fdmgongchang/production-order';

import { createApp, h, nextTick, reactive } from 'vue';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { getPurchaseImage, getPurchaseSheet, getTargetOptions } from '#/api/fdmgongchang/production-order';

import PurchaseSheet from './purchase-sheet.vue';

vi.mock('#/api/fdmgongchang/production-order', () => ({ getPurchaseImage: vi.fn(), getPurchaseSheet: vi.fn(), getTargetOptions: vi.fn() }));

const fixture: Api.PurchaseSheet = {
  order: { id: 'po-1', code: 'PO001', lines: [{ id: 'line-1', skuName: '瑜伽垫', quantity: 100, unit: '条', colorMode: 'UNKNOWN', weight: '800g' }] },
  details: { lineExtras: { 'line-1': { colorMode: 'DUAL', frontColor: 'ZI', backColor: 'LAN', textureBack: 'WAVE', weight: '900g±100g', imageId: 'product', colorImageId: 'supplier' } } },
};
async function flush() { for (let i = 0; i < 15; i++) { await Promise.resolve(); await nextTick(); } }
let unmount: (() => void) | undefined;
function mountSheet() {
  const state = reactive({ orderId: 1 });
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
  it('renders per-line manufacturing requirements and downloads the supplier color image independently', async () => {
    mountSheet(); await flush();
    expect(document.body.textContent).toContain('颜色方式：双色');
    expect(document.body.textContent).toContain('正面颜色：紫色');
    expect(document.body.textContent).toContain('反面颜色：蓝色');
    expect(document.body.textContent).toContain('波浪纹');
    expect(document.body.textContent).toContain('900g±100g');
    expect(document.body.textContent).toContain('供应商实物色号图');
    expect(getPurchaseImage).toHaveBeenCalledWith(1, 'product');
    expect(getPurchaseImage).toHaveBeenCalledWith(1, 'supplier');
    expect(document.querySelectorAll('img')).toHaveLength(2);
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
});
