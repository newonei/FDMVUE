import type { ContractItem } from '#/api/fdmplatform';

import { createApp, h, nextTick } from 'vue';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  previewProductConfigurations,
  resolveProductConfigurations,
  resolveProducts,
} from '#/api/fdmplatform/products';

import ConfigurationModal from './ContractProductConfigurationModal.vue';

vi.mock('#/api/fdmplatform', () => ({ newIdempotencyKey: () => 'config-key' }));
vi.mock('#/api/fdmplatform/products', () => ({
  getProductAttributeOptions: vi.fn().mockResolvedValue({
    colors: [],
    textures: [],
    matTypes: [],
    stages: [],
    patterns: [],
  }),
  getProduct: vi
    .fn()
    .mockResolvedValue({ id: 'old', name: '瑜伽垫', version: 3 }),
  previewProductConfigurations: vi.fn(),
  resolveProductConfigurations: vi.fn(),
  resolveProducts: vi.fn(),
}));
const source: ContractItem = {
  id: 'line1',
  skuId: 'old',
  skuName: '瑜伽垫',
  productVersion: 3,
  specVersion: 'old',
  specification: '',
  unit: '条',
  quantity: 100,
  unitPrice: 12,
  lengthMm: 1830,
  widthMm: 610,
  finishedThicknessMm: 6,
  colorMode: 'SINGLE',
  frontColor: 'BK',
  backColor: 'BK',
  textureFront: 'NONE',
  textureBack: 'WAVE',
  patternMode: 'NONE',
};
const result = {
  items: [
    {
      lineId: 'line1',
      outcome: 'CREATE' as const,
      product: { id: 'new', version: 4, code: 'SKU-NEW' },
      configuration: {
        name: '瑜伽垫',
        lengthMm: 1830,
        widthMm: 610,
        finishedThicknessMm: 6,
      },
      errors: [],
    },
  ],
};
let unmount: (() => void) | undefined;
async function flush() {
  for (let i = 0; i < 15; i++) {
    await Promise.resolve();
    await nextTick();
  }
}
function button(title: string) {
  return [...document.querySelectorAll<HTMLButtonElement>('button')].find(
    (node) => node.textContent?.trim() === title,
  )!;
}
function mount(bulk = false) {
  const resolved = vi.fn();
  const host = document.createElement('div');
  document.body.append(host);
  const app = createApp({
    render: () =>
      h(ConfigurationModal, {
        open: true,
        items: [source],
        companyId: 0,
        currency: 'CNY',
        taxBasis: 'TAX_INCLUDED',
        bulk,
        onResolved: resolved,
      }),
  });
  app.mount(host);
  unmount = () => app.unmount();
  return resolved;
}
beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(previewProductConfigurations).mockResolvedValue(result as never);
  vi.mocked(resolveProductConfigurations).mockResolvedValue(result as never);
  vi.mocked(resolveProducts).mockResolvedValue([
    { ...source, skuId: 'new', productVersion: 4, specVersion: 'new-spec' },
  ]);
});
afterEach(() => {
  unmount?.();
  unmount = undefined;
  document.body.innerHTML = '';
});
describe('contract configuration preview and adoption', () => {
  it('requires server preview, then resolves atomically and reads authoritative snapshots before emitting', async () => {
    const resolved = mount();
    await flush();
    expect(button('确认采用 SKU').disabled).toBe(true);
    button('预览 SKU').click();
    await flush();
    expect(previewProductConfigurations).toHaveBeenCalledWith(
      expect.objectContaining({
        companyId: 0,
        items: [
          expect.objectContaining({
            lineId: 'line1',
            sourceProductId: 'old',
            expectedVersion: 3,
          }),
        ],
      }),
    );
    expect(document.body.textContent).toContain('新增成品 SKU');
    button('确认采用 SKU').click();
    await flush();
    expect(resolveProductConfigurations).toHaveBeenCalledWith(
      expect.objectContaining({ idempotencyKey: 'config-key' }),
    );
    expect(resolveProducts).toHaveBeenCalledWith({
      companyId: 0,
      currency: 'CNY',
      taxBasis: 'TAX_INCLUDED',
      items: [{ productId: 'new', productVersion: 4 }],
    });
    expect(resolved).toHaveBeenCalledWith([
      {
        lineId: 'line1',
        snapshot: expect.objectContaining({
          skuId: 'new',
          specVersion: 'new-spec',
        }),
      },
    ]);
  });
  it('invalidates previews after an input changes and blocks invalid results', async () => {
    mount();
    await flush();
    button('预览 SKU').click();
    await flush();
    const input = document.querySelector<HTMLInputElement>(
      '#contract-config-name',
    )!;
    input.value = '新名称';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    await flush();
    expect(button('确认采用 SKU').disabled).toBe(true);
    vi.mocked(previewProductConfigurations).mockResolvedValue({
      items: [
        { ...result.items[0]!, outcome: 'INVALID', errors: ['请选择颜色'] },
      ],
    } as never);
    button('预览 SKU').click();
    await flush();
    expect(button('确认采用 SKU').disabled).toBe(true);
    expect(document.body.textContent).toContain('请选择颜色');
    expect(resolveProductConfigurations).not.toHaveBeenCalled();
  });
  it('keeps all local lines untouched on snapshot failure and reuses the resolution key on retry', async () => {
    vi.mocked(resolveProducts).mockRejectedValueOnce(new Error('快照读取失败'));
    const resolved = mount();
    await flush();
    button('预览 SKU').click();
    await flush();
    button('确认采用 SKU').click();
    await flush();
    expect(resolved).not.toHaveBeenCalled();
    expect(source.skuId).toBe('old');
    expect(document.body.textContent).toContain('快照读取失败');
    button('确认采用 SKU').click();
    await flush();
    expect(
      vi
        .mocked(resolveProductConfigurations)
        .mock.calls.map(([request]) => request.idempotencyKey),
    ).toEqual(['config-key', 'config-key']);
    expect(resolved).toHaveBeenCalledTimes(1);
  });
  it('does not preview a batch until fields are explicitly selected', async () => {
    mount(true);
    await flush();
    expect(button('预览 SKU').disabled).toBe(true);
    expect(previewProductConfigurations).not.toHaveBeenCalled();
  });
  it('renders stale-source errors safely when the invalid result has no configuration', async () => {
    vi.mocked(previewProductConfigurations).mockResolvedValue({
      items: [
        {
          lineId: 'line1',
          outcome: 'INVALID',
          configuration: null,
          errors: ['产品档案已变化，请重新选品'],
        },
      ],
    } as never);
    mount();
    await flush();
    button('预览 SKU').click();
    await flush();
    expect(document.body.textContent).toContain('产品档案已变化，请重新选品');
    expect(button('确认采用 SKU').disabled).toBe(true);
  });
});
