import { createApp, defineComponent, h } from 'vue';

import { describe, expect, it, vi } from 'vitest';

import PurchaseSheet from './modules/purchase-sheet.vue';

vi.mock('#/api/fdmgongchang/production-order', () => ({
  getPurchaseImage: vi.fn(),
  getPurchaseSheet: vi.fn().mockResolvedValue({
    details: {}, order: { lines: [{ id: 'line', skuName: '双色垫', quantity: 20, unit: '条',
      specification: '6mm', material: 'TPE', size: '183*61*0.6cm',
      frontColor: 'PK', frontColorLabel: '粉色', backColor: 'GY', backColorLabel: '灰色',
      textureFrontLabel: '贝壳纹', textureBackLabel: '波浪纹', printing: '定位线', packaging: '纸袋',
    }] },
  }),
}));
vi.mock('ant-design-vue', () => {
  const Wrap = defineComponent({ setup: (_, ctx) => () => h('div', ctx.slots.default?.()) });
  return { Spin: Wrap, Tag: Wrap, Image: Wrap };
});

describe('工厂采购单生产要求', () => {
  it('展开展示采购快照材质、尺寸、两面颜色与压花，定制包装仍可见', async () => {
    const host = document.createElement('div');
    const app = createApp({ render: () => h(PurchaseSheet, { orderId: 1 }) });
    app.mount(host);
    try {
      await vi.waitFor(() => expect(host.textContent).toContain('正面颜色：粉色'));
      for (const text of ['反面颜色：灰色', '正面压花：贝壳纹', '反面压花：波浪纹',
        '材质：TPE', '尺寸：183*61*0.6cm', '定制说明：定位线', '包装要求：纸袋']) {
        expect(host.textContent).toContain(text);
      }
      expect(host.querySelector('details')?.open).toBe(true);
    } finally { app.unmount(); }
  });
});
