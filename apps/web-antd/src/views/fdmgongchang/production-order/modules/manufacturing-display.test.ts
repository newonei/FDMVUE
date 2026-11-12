import type { FdmgongchangProductionOrderApi as Api } from '#/api/fdmgongchang/production-order';

import { createApp, nextTick } from 'vue';

import { afterEach, describe, expect, it, vi } from 'vitest';

import SupplyMatch from './supply-match.vue';

vi.mock('#/api/fdmgongchang/production-order', () => ({
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
  it.each([
    { processes: ['EMBOSS', 'ENGRAVE'], expected: ['压纹 正 贝壳纹 / 反 未填写', '图案 未填写'], absent: ['无需压花', '无需雕刻', '不雕刻'] },
    { processes: ['SLICE', 'CUT'], expected: ['无需压花', '无需雕刻'], absent: ['图案 未填写', '压纹 正'] },
    { processes: [], expected: ['压纹 正 贝壳纹 / 反 未填写', '图案 未填写'], absent: ['无需压花', '无需雕刻'] },
  ])('distinguishes missing values from processes that are not in route $processes', async ({ processes, expected, absent }) => {
    const item: Api.Item = { id: 1, productId: 'p1', productName: '测试订单产品', quantity: 10, completedQuantity: 0,
      targetConfirmedAt: '2026-11-12', targetColorMode: 'DUAL', targetConstructionType: 'DOUBLE_LAYER',
      targetFrontColor: 'ZI', targetBackColor: 'LAN', targetThickness: 0.6, targetFrontThickness: 0.3, targetBackThickness: 0.3,
      targetTextureFront: 'SH', targetTextureBack: null, targetPattern: null, processes };
    const host = document.createElement('div'); document.body.append(host);
    const app = createApp(SupplyMatch, { items: [item], orderId: 11, editable: false });
    app.mount(host); unmount = () => app.unmount(); await flush();
    for (const text of expected) expect(host.textContent).toContain(text);
    for (const text of absent) expect(host.textContent).not.toContain(text);
  });
});
