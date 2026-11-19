import type { FdmgongchangProductionOrderApi as Api } from '#/api/fdmgongchang/production-order';

import { createApp, nextTick } from 'vue';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { getOrderAux } from '#/api/fdmgongchang/production-order';

import { textureText } from '../manufacturing';
import AuxPanel from './aux-panel.vue';
import SupplyMatch from './supply-match.vue';

vi.mock('#/api/fdmgongchang/production-order', () => ({
  getOrderAux: vi.fn(),
  getSupplyMatch: vi.fn().mockResolvedValue([]),
  getTargetOptions: vi.fn().mockResolvedValue({ colors: [], textures: [{ value: 'SH', label: '贝壳纹' }], materials: [], patterns: [] }),
  saveItemTarget: vi.fn(),
}));

async function flush() {
  for (let index = 0; index < 8; index++) { await Promise.resolve(); await nextTick(); }
}

let unmount: (() => void) | undefined;
afterEach(() => { unmount?.(); document.body.innerHTML = ''; });

describe('saved manufacturing parameters', () => {
  it('flags the unconfigured packaging supply even when the configured supplies are in stock', async () => {
    vi.mocked(getOrderAux).mockResolvedValue({ ready: true, items: [{
      itemId: 1, productName: '瑜伽垫', ready: true, remaining: 10,
      suggestions: [{ name: '吊牌', perUnit: 1 }, { name: '外箱', perUnit: 1, productId: 'box' }],
      usages: [{ productId: 'box', productName: '外箱', perUnit: 1, need: 10, stock: 10, inbound: 0, shortage: 0 }],
    }] });
    const host = document.createElement('div'); document.body.append(host);
    const app = createApp(AuxPanel, { items: [], editable: false, orderId: 1 });
    app.mount(host); unmount = () => app.unmount(); await flush();
    expect(host.querySelector('.ant-tag')?.textContent).toBe('用量待确认');
    expect(host.textContent).toContain('吊牌的用量待确认');
    expect(host.textContent).not.toContain('齐了');
    expect(host.textContent).not.toContain('AI 排单不排包装');
  });
  it.each([
    { processes: ['EMBOSS', 'ENGRAVE'], expected: ['压纹 正 贝壳纹 (SH) / 反 不压花', '图案 未填写'], absent: ['无需压花', '无需雕刻', '不雕刻'] },
    { processes: ['SLICE', 'CUT'], expected: ['无需压花', '无需雕刻'], absent: ['图案 未填写', '压纹 正'] },
    { processes: [], expected: ['压纹 正 贝壳纹 (SH) / 反 未填写', '图案 未填写'], absent: ['无需压花', '无需雕刻'] },
  ])('distinguishes missing values from processes that are not in route $processes', async ({ processes, expected, absent }) => {
    const item: Api.Item = { id: 1, productId: 'p1', productName: '测试订单产品', quantity: 10, completedQuantity: 0,
      targetConfirmedAt: '2026-11-12', targetColorMode: 'DUAL', targetConstructionType: 'DOUBLE_LAYER',
      targetFrontColor: 'ZI', targetBackColor: 'LAN', targetThickness: 0.6, targetFrontThickness: 0.3, targetBackThickness: 0.3,
      targetTextureFront: 'SH', targetTextureBack: null, targetPattern: null, processes };
    const host = document.createElement('div'); document.body.append(host);
    const app = createApp(SupplyMatch, { items: [item], orderId: 11 });
    app.mount(host); unmount = () => app.unmount(); await flush();
    for (const text of expected) expect(host.textContent).toContain(text);
    for (const text of absent) expect(host.textContent).not.toContain(text);
    expect(host.textContent).not.toContain('（）');
  });
  it('distinguishes an unknown route, missing required embossing, and a confirmed unembossed side', () => {
    const item = { targetConfirmedAt: '2026-11-17', processes: ['EMBOSS'], targetTextureFront: null, targetTextureBack: null };
    expect(textureText(item, 'FRONT')).toBe('未填写');
    expect(textureText({ ...item, processes: [] }, 'FRONT')).toBe('未填写');
    expect(textureText({ ...item, processes: ['PUNCH'] }, 'FRONT')).toBe('不压花');
    expect(textureText({ ...item, targetTextureBack: 'SH' }, 'FRONT')).toBe('不压花');
  });
});
