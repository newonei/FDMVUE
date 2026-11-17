import type { FdmgongchangProductionOrderApi as Api } from '#/api/fdmgongchang/production-order';

import { createApp, defineComponent, h, nextTick, reactive } from 'vue';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { getProductionOrder, getRouteOptions, getTargetOptions, saveItemProductionConfig } from '#/api/fdmgongchang/production-order';

import { productionConfigDraft, productionConfigProblems, productionConfigTarget, productionRouteProblems, savedProductionConfigProblems, unfinishedProductionParameters } from './item-production-config';
import ConfigModal from './item-production-config-modal.vue';

vi.mock('#/api/fdmgongchang/production-order', () => ({
  getProductionOrder: vi.fn(), getRouteOptions: vi.fn(), getTargetOptions: vi.fn(), saveItemProductionConfig: vi.fn(),
}));

const steps = ['MIX', 'SLICE', 'CUT', 'LAMINATE', 'EMBOSS', 'PUNCH', 'ENGRAVE', 'FOLD', 'PACK'];
const labels = ['发泡', '开片', '立切', '贴合', '压花', '冲裁', '雕刻', '折叠', '包装'];
const options = {
  routes: [],
  processes: steps.map((code, index) => ({ code, label: labels[index]!, outputStage: code, outputStageLabel: labels[index]!, sources: [...steps], unit: '片' })),
};
function product(overrides: Partial<Api.Item> = {}): Api.Item {
  return { id: 10, productId: 'p10', productCode: 'P001', productName: '双色瑜伽垫', quantity: 80, completedQuantity: 0, unit: '条',
    targetColorMode: 'DUAL', targetConstructionType: 'DOUBLE_LAYER', targetMaterial: 'TPE', targetFrontColor: 'ZI', targetBackColor: 'LAN', targetLength: 183, targetWidth: 61,
    targetThickness: 0.6, targetFrontThickness: 0.2, targetBackThickness: 0.4, targetTextureFront: null, targetTextureBack: null,
    targetPattern: null, processes: steps.filter((code) => code !== 'FOLD'), ...overrides };
}
function order(item = product()): Api.Order {
  return { id: 1, orderNo: 'GD-001', factoryId: 2, items: [item], status: 'ACCEPTED', statusLabel: '生产中', requesterUserId: 5, completedQuantity: 0, totalQuantity: 80 };
}
async function flush() { for (let n = 0; n < 12; n++) { await Promise.resolve(); await nextTick(); } }
function deferred<T>() { let resolve!: (value: T) => void; const promise = new Promise<T>((r) => { resolve = r; }); return { promise, resolve }; }
let unmount: (() => void) | undefined;
function mountModal() {
  const state = reactive({ open: true, orderId: 1, itemId: 10 });
  const saved = vi.fn();
  const host = document.createElement('div'); document.body.append(host);
  const app = createApp(defineComponent({ setup: () => () => h(ConfigModal, {
    ...state, 'onUpdate:open': (value: boolean) => { state.open = value; }, onSaved: saved,
  }) }));
  app.mount(host); unmount = () => app.unmount();
  return { state, saved };
}
function button(text: string) {
  const found = [...document.querySelectorAll<HTMLButtonElement>('button')].find((node) => node.textContent?.replaceAll(/\s/g, '') === text);
  expect(found, `button ${text}`).toBeTruthy(); return found!;
}
async function input(id: string, value: string) {
  const node = document.querySelector<HTMLInputElement>(`#${id}`)!;
  node.value = value; node.dispatchEvent(new Event('input', { bubbles: true })); node.dispatchEvent(new Event('change', { bubbles: true }));
  node.dispatchEvent(new Event('blur', { bubbles: true })); await flush();
}
beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getProductionOrder).mockReset().mockResolvedValue(order());
  vi.mocked(getRouteOptions).mockReset().mockResolvedValue(options);
  vi.mocked(getTargetOptions).mockReset().mockResolvedValue({ materials: [{ label: 'TPE', value: 'TPE' }],
    colors: [{ label: '紫色', value: 'ZI' }, { label: '蓝色', value: 'LAN' }], textures: [], patterns: [] });
  vi.mocked(saveItemProductionConfig).mockReset().mockResolvedValue(true);
});
afterEach(() => { unmount?.(); unmount = undefined; document.body.innerHTML = ''; });

describe('production configuration values', () => {
  it('preserves confirmed folding requirements and flags missing folding instructions before release', () => {
    const draft = productionConfigDraft(product({ targetFoldingType: '八折' }));
    expect(productionConfigTarget(10, draft).foldingType).toBe('八折');
    expect(unfinishedProductionParameters(draft, ['FOLD'])).toEqual([]);
    draft.foldingType = '';
    expect(unfinishedProductionParameters(draft, ['FOLD'])).toEqual(['折叠要求未填写，确认后才能下发折叠任务']);
    expect(unfinishedProductionParameters(draft, ['PUNCH'])).toEqual([]);
  });
  it('keeps saved unconfirmed values ahead of suggestions and keeps confirmed empty values empty', () => {
    const draft = productionConfigDraft(product({ targetSuggested: { material: 'PVC', length: 190, frontColor: 'RED', textureFront: 'WAVE' } }));
    expect(draft).toMatchObject({ material: 'TPE', lengthMm: 1830, frontColor: 'ZI', textureFront: 'WAVE', thicknessMm: 6 });
    expect(productionConfigDraft(product({ targetConfirmedAt: '2026-11-12', targetTextureFront: null, targetSuggested: { textureFront: 'WAVE' } })).textureFront).toBeUndefined();
  });
  it('preserves unequal layer thickness and allows a single color on double layers', () => {
    const draft = productionConfigDraft(product());
    expect(productionConfigTarget(10, draft)).toEqual({ itemId: 10, material: 'TPE', colorMode: 'DUAL', constructionType: 'DOUBLE_LAYER',
      frontColor: 'ZI', backColor: 'LAN', length: 183, width: 61, thickness: 0.6, frontThickness: 0.2, backThickness: 0.4,
      textureFront: null, textureBack: null, pattern: null, foldingType: '' });
    draft.colorMode = 'SINGLE';
    expect(productionConfigProblems(draft)).toEqual([]);
    expect(productionConfigTarget(10, draft)).toMatchObject({ constructionType: 'DOUBLE_LAYER', backColor: 'ZI', frontThickness: 0.2, backThickness: 0.4 });
    draft.constructionType = 'SINGLE_LAYER';
    expect(productionConfigTarget(10, draft)).toMatchObject({ constructionType: 'SINGLE_LAYER', frontThickness: 0.6, backThickness: null });
  });
  it('requires independently confirmed structure and balanced layer thickness', () => {
    const draft = productionConfigDraft(product());
    draft.constructionType = 'UNKNOWN';
    expect(productionConfigProblems(draft)).toContain('请选择单层或双层贴合结构');
    draft.constructionType = 'DOUBLE_LAYER'; draft.frontThicknessMm = 3;
    expect(productionConfigProblems(draft)).toContain('正面层厚度与反面层厚度之和必须等于成品总厚');
    draft.backThicknessMm = undefined;
    expect(productionConfigProblems(draft)).toContain('请填写大于 0 的反面层厚度');
    expect(productionRouteProblems('DOUBLE_LAYER', ['PUNCH'])).toBe('双层贴合产品需要贴合工序');
    expect(productionRouteProblems('SINGLE_LAYER', ['LAMINATE', 'PUNCH'])).toBe('单层产品不需要贴合，请取消贴合工序');
    expect(productionRouteProblems('DOUBLE_LAYER', ['LAMINATE', 'PUNCH'])).toBe('');
  });
  it('does not accept unconfirmed suggested values and requires complete saved values at acceptance', () => {
    expect(savedProductionConfigProblems(product())).toContain('请先人工确认并保存生产参数');
    expect(savedProductionConfigProblems(product({ targetConfirmedAt: '2026-11-17' }))).toEqual([]);
    expect(savedProductionConfigProblems(product({ targetMaterial: null, targetConfirmedAt: '2026-11-17', targetSuggested: { material: 'TPE' } }))).toContain('请选择材质');
  });
  it('allows unfinished texture/pattern values while rejecting invalid basic dimensions and equal dual colors', () => {
    const draft = productionConfigDraft(product());
    expect(productionConfigProblems(draft)).toEqual([]);
    expect(unfinishedProductionParameters(draft, ['EMBOSS', 'ENGRAVE'])).toEqual(['请选择至少一面的压花纹路', '雕刻图案未填写']);
    draft.textureFront = 'WAVE';
    expect(unfinishedProductionParameters(draft, ['EMBOSS'])).toEqual([]);
    expect(unfinishedProductionParameters(draft, ['PUNCH'])).toEqual([]);
    draft.lengthMm = 0; draft.backColor = draft.frontColor;
    expect(productionConfigProblems(draft)).toEqual(expect.arrayContaining(['请填写大于 0 的长', '双色的正反面颜色必须不同；同色请选择单色']));
  });
});

describe('production configuration modal', () => {
  it('loads unequal saved layers and saves user-entered thickness with a sorted folding route', async () => {
    const { state, saved } = mountModal(); await flush();
    expect(getProductionOrder).toHaveBeenCalledWith(1); expect(getRouteOptions).toHaveBeenCalledWith(2);
    expect(document.body.textContent).toContain('GD-001 · P001 · 双色瑜伽垫');
    expect(document.body.textContent).toContain('成品长度 mm（冲裁后）');
    expect(Number(document.querySelector<HTMLInputElement>('#config-length')!.value)).toBe(1830);
    expect(document.querySelector('.config-layer')!.textContent).toContain('正面 2 mm + 反面 4 mm');
    await input('config-thickness', '8');
    expect(document.querySelector('.config-layer')!.textContent).toContain('正面 2 mm + 反面 4 mm');
    await input('config-front-thickness', '3'); await input('config-back-thickness', '5');
    button('折叠').click(); await flush();
    expect(document.querySelector('.config-actual-route')!.textContent).toContain('雕刻 → 折叠 → 包装');
    expect(document.body.textContent).toContain('可以先保存');
    button('保存参数与工艺').click(); await flush();
    expect(saveItemProductionConfig).toHaveBeenCalledWith({ itemId: 10, routeId: null, processes: steps,
      target: expect.objectContaining({ material: 'TPE', length: 183, width: 61, thickness: 0.8, frontThickness: 0.3, backThickness: 0.5, textureFront: null, textureBack: null, pattern: null }) });
    expect(state.open).toBe(false); expect(saved).toHaveBeenCalledTimes(1);
  });
  it('re-fetches fresh item data on every opening', async () => {
    const { state } = mountModal(); await flush(); state.open = false; await flush();
    vi.mocked(getProductionOrder).mockResolvedValue(order(product({ targetThickness: 0.8, targetLength: 185 })));
    state.open = true; await flush();
    expect(getProductionOrder).toHaveBeenCalledTimes(2);
    expect(Number(document.querySelector<HTMLInputElement>('#config-length')!.value)).toBe(1850);
    expect(document.querySelector('.config-layer')!.textContent).toContain('正面 2 mm');
  });
  it('shows load failures with retry and never permits saving stale or missing items', async () => {
    vi.mocked(getProductionOrder).mockRejectedValueOnce(new Error('订单加载失败'));
    mountModal(); await flush();
    expect(document.body.textContent).toContain('订单加载失败'); expect(button('保存参数与工艺').disabled).toBe(true);
    button('重新加载').click(); await flush();
    expect(document.querySelector('#config-length')).toBeTruthy(); expect(button('保存参数与工艺').disabled).toBe(false);
  });
  it('prevents a dual route without lamination', async () => {
    mountModal(); await flush(); button('贴合').click(); await flush(); button('保存参数与工艺').click(); await flush();
    expect(saveItemProductionConfig).not.toHaveBeenCalled(); expect(document.body.textContent).toContain('双层贴合产品需要贴合工序');
  });
  it('retains entered values on save error and retries atomically', async () => {
    vi.mocked(saveItemProductionConfig).mockRejectedValueOnce(new Error('已有下发任务，请刷新订单'));
    const { state, saved } = mountModal(); await flush(); await input('config-thickness', '8'); await input('config-front-thickness', '4');
    button('保存参数与工艺').click(); await flush();
    expect(state.open).toBe(true); expect(saved).not.toHaveBeenCalled();
    expect(document.body.textContent).toContain('已有下发任务，请刷新订单');
    expect(Number(document.querySelector<HTMLInputElement>('#config-thickness')!.value)).toBe(8);
    button('保存参数与工艺').click(); await flush();
    expect(saveItemProductionConfig).toHaveBeenCalledTimes(2); expect(saved).toHaveBeenCalledTimes(1);
  });
  it('blocks repeated saves and closing while an atomic save is pending', async () => {
    const pending = deferred<boolean>(); vi.mocked(saveItemProductionConfig).mockReturnValue(pending.promise);
    const { state, saved } = mountModal(); await flush();
    button('保存参数与工艺').click(); button('保存参数与工艺').click(); await flush();
    expect(saveItemProductionConfig).toHaveBeenCalledTimes(1); expect(button('取消').disabled).toBe(true);
    expect(document.querySelector('fieldset')!.hasAttribute('inert')).toBe(true);
    expect(state.open).toBe(true); expect(saved).not.toHaveBeenCalled();
    pending.resolve(true); await flush(); expect(saved).toHaveBeenCalledTimes(1); expect(state.open).toBe(false);
  });
  it('ignores a stale loading response after another item is opened', async () => {
    const previous = deferred<Api.Order>(); vi.mocked(getProductionOrder).mockReturnValueOnce(previous.promise);
    const { state } = mountModal(); await flush();
    vi.mocked(getProductionOrder).mockResolvedValue(order(product({ id: 11, productCode: 'NEW-PRODUCT', targetLength: 192 })));
    state.itemId = 11; await flush(); previous.resolve(order()); await flush();
    expect(document.body.textContent).toContain('NEW-PRODUCT');
    expect(Number(document.querySelector<HTMLInputElement>('#config-length')!.value)).toBe(1920);
  });
  it('saves a single product with one full-thickness layer and matching back color', async () => {
    vi.mocked(getProductionOrder).mockResolvedValue(order(product({ targetColorMode: 'SINGLE', targetConstructionType: 'SINGLE_LAYER', processes: ['CUT', 'PUNCH', 'PACK'] })));
    mountModal(); await flush();
    expect(document.querySelector('.config-layer')!.textContent).toContain('单层 6 mm');
    button('保存参数与工艺').click(); await flush();
    expect(saveItemProductionConfig).toHaveBeenCalledWith(expect.objectContaining({ processes: ['CUT', 'PUNCH', 'PACK'],
      target: expect.objectContaining({ colorMode: 'SINGLE', constructionType: 'SINGLE_LAYER', backColor: 'ZI', frontThickness: 0.6, backThickness: null }) }));
  });
  it('saves single-color double-layer products without changing their unequal layer thickness', async () => {
    vi.mocked(getProductionOrder).mockResolvedValue(order(product({ targetColorMode: 'SINGLE' })));
    mountModal(); await flush();
    expect(document.querySelector('.config-layer')!.textContent).toContain('正面 2 mm + 反面 4 mm');
    button('保存参数与工艺').click(); await flush();
    expect(saveItemProductionConfig).toHaveBeenCalledWith(expect.objectContaining({
      target: expect.objectContaining({ colorMode: 'SINGLE', constructionType: 'DOUBLE_LAYER', frontColor: 'ZI', backColor: 'ZI', frontThickness: 0.2, backThickness: 0.4 }),
      processes: expect.arrayContaining(['LAMINATE']),
    }));
  });
  it('blocks saving when manually entered layer thickness does not add up', async () => {
    mountModal(); await flush(); await input('config-front-thickness', '3');
    button('保存参数与工艺').click(); await flush();
    expect(saveItemProductionConfig).not.toHaveBeenCalled();
    expect(document.body.textContent).toContain('正面层厚度与反面层厚度之和必须等于成品总厚');
  });
  it('requires explicit cleanup of saved textures when the embossing process is removed', async () => {
    vi.mocked(getProductionOrder).mockResolvedValue(order(product({ targetTextureFront: 'WAVE' })));
    mountModal(); await flush(); button('压花').click(); await flush(); button('保存参数与工艺').click(); await flush();
    expect(saveItemProductionConfig).not.toHaveBeenCalled(); expect(document.body.textContent).toContain('未选择压花工序，请清空正反纹路');
  });
});
