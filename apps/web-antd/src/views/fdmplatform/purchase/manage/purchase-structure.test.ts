import { createApp, defineComponent, h, nextTick } from 'vue';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import OrderLines from './components/OrderLines.vue';
import PurchaseOrderEditor from './components/PurchaseOrderEditor.vue';

const mocks = vi.hoisted(() => ({
  contract: vi.fn(),
  products: vi.fn(),
  order: vi.fn(),
  create: vi.fn(),
}));
vi.mock('#/api/fdmplatform', () => ({
  getContract: mocks.contract,
  getDirectory: vi.fn().mockResolvedValue({ companies: [] }),
}));
vi.mock('#/api/fdmplatform/contract-board', () => ({
  getContractBoard: vi.fn().mockResolvedValue({ list: [] }),
}));
vi.mock('#/api/fdmplatform/masters', () => ({
  getMasterPage: vi.fn().mockResolvedValue({ list: [] }),
}));
vi.mock('#/api/fdmplatform/products', () => ({ getProducts: mocks.products }));
vi.mock('#/api/fdmplatform/procurement', () => ({
  getProcurementOrder: mocks.order,
  getProcurementSettings: vi.fn().mockResolvedValue([]),
  getReceiveFactories: vi.fn().mockResolvedValue([]),
  createProcurementOrder: mocks.create,
  updateProcurementOrder: vi.fn(),
}));
vi.mock('../../components/RemoteMasterSelect.vue', () => ({
  default: defineComponent({ render: () => null }),
}));
vi.mock('../../components/LineTable.vue', () => ({
  default: defineComponent({
    props: ['dataSource', 'columns'],
    setup: (props) => () =>
      h('div', {
        'data-lines': JSON.stringify(props.dataSource),
        'data-columns': JSON.stringify(props.columns),
      }),
  }),
}));
vi.mock('ant-design-vue', () => {
  const Wrap = defineComponent({
    setup: (_, ctx) => () =>
      h('div', [ctx.slots.default?.(), ctx.slots.footer?.()]),
  });
  const Input = defineComponent({
    props: ['value'],
    emits: ['update:value'],
    setup: (props, ctx) => () =>
      h('input', {
        value: props.value,
        onInput: (event: Event) =>
          ctx.emit('update:value', (event.target as HTMLInputElement).value),
      }),
  });
  return {
    Alert: Wrap,
    Modal: Wrap,
    Input,
    Textarea: Input,
    InputNumber: Input,
    Checkbox: Input,
    Button: defineComponent({
      setup: (_, ctx) => () => h('button', ctx.slots.default?.()),
    }),
    Select: defineComponent({
      props: ['value', 'options'],
      emits: ['update:value', 'change'],
      setup: (props, ctx) => () =>
        h(
          'select',
          {
            value: props.value,
            onChange: (event: Event) => {
              const value = (event.target as HTMLSelectElement).value;
              ctx.emit('update:value', value);
              ctx.emit('change', value);
            },
          },
          [
            h('option', { value: '' }, ''),
            ...(props.options ?? []).map(
              (entry: { label: string; value: string }) =>
                h('option', { value: entry.value }, entry.label),
            ),
          ],
        ),
    }),
  };
});

const cleanup: (() => void)[] = [];
function mount(
  component: typeof OrderLines | typeof PurchaseOrderEditor,
  props: object,
) {
  const host = document.createElement('div');
  document.body.append(host);
  const app = createApp({ render: () => h(component as never, props) });
  app.mount(host);
  cleanup.push(() => {
    app.unmount();
    host.remove();
  });
  return host;
}
const current = {
  id: 'p',
  name: '双色瑜伽垫',
  code: 'MAT',
  unit: '条',
  specification: '6mm',
  material: 'TPE',
  size: '183*61*0.6cm',
  frontColor: 'PK',
  frontColorLabel: '粉色',
  backColor: 'GY',
  backColorLabel: '灰色',
  textureFrontLabel: '贝壳纹',
  textureBackLabel: '波浪纹',
};
beforeEach(() => {
  mocks.create.mockReset().mockResolvedValue({ orders: [] });
  mocks.products.mockResolvedValue({ list: [current] });
  mocks.contract.mockResolvedValue({
    id: 'c',
    companyId: 1,
    code: 'HT',
    items: [
      {
        ...current,
        id: 'ci',
        skuId: 'p',
        skuName: current.name,
        skuCode: 'MAT',
        quantity: 100,
      },
    ],
    assignments: [],
    requests: [
      {
        id: 'req',
        items: [
          {
            id: 'ri',
            contractItemId: 'ci',
            quantity: 20,
            specificationSnapshot: {
              skuName: '请购时的垫子',
              unit: '条',
              frontColor: 'BL',
              frontColorLabel: '蓝色',
              color: '蓝/白',
            },
          },
        ],
      },
    ],
  });
});

afterEach(() => {
  cleanup.splice(0).forEach((fn) => fn());
});

describe('采购产品结构入口', () => {
  it('产品中心选品带入全部结构，换产品清除上一产品的正反面', async () => {
    mocks.products.mockResolvedValue({
      list: [current, { id: 'raw', name: '原料', code: 'RAW', color: '粉/灰' }],
    });
    const host = mount(PurchaseOrderEditor, { open: true });
    await vi.waitFor(() =>
      expect(
        host.querySelector('.product-pick select option[value="p"]'),
      ).not.toBeNull(),
    );
    const select = host.querySelector<HTMLSelectElement>(
      '.product-pick select',
    )!;
    select.value = 'p';
    select.dispatchEvent(new Event('change'));
    await nextTick();
    expect(host.textContent).toContain('正面颜色：粉色');
    expect(host.textContent).toContain('反面颜色：灰色');
    expect(host.textContent).toContain('正面压花：贝壳纹');
    select.value = 'raw';
    select.dispatchEvent(new Event('change'));
    await nextTick();
    expect(host.textContent).toContain('正面颜色：未维护');
    expect(host.textContent).toContain('反面颜色：未维护');
    expect(host.textContent).not.toContain('正面压花：贝壳纹');
  });

  it('合同选品同样携带结构资料', async () => {
    const host = mount(PurchaseOrderEditor, { open: true, contractId: 'c' });
    await vi.waitFor(() =>
      expect(
        host.querySelector('.product-pick select option[value="item:ci"]'),
      ).not.toBeNull(),
    );
    const select = host.querySelector<HTMLSelectElement>(
      '.product-pick select',
    )!;
    select.value = 'item:ci';
    select.dispatchEvent(new Event('change'));
    await nextTick();
    expect(host.textContent).toContain('反面颜色：灰色');
    expect(host.textContent).toContain('材质：TPE');
    expect(host.textContent).toContain('反面压花：波浪纹');
  });

  it('请购转采购保持请购快照，缺失反面不从新合同或颜色文本推测', async () => {
    const host = mount(PurchaseOrderEditor, {
      open: true,
      contractId: 'c',
      requestId: 'req',
    });
    await vi.waitFor(() =>
      expect(host.textContent).toContain('正面颜色：蓝色'),
    );
    expect(host.textContent).toContain('反面颜色：未维护');
    expect(host.textContent).toContain('正面压花：未维护');
    expect(host.textContent).not.toContain('反面颜色：灰色');
  });

  it('复制订单和原订单详情读取同一快照，不被当前产品搜索结果覆盖', async () => {
    const view = {
      contractId: '',
      companyId: 1,
      order: {
        id: 'o',
        supplierId: 's',
        lines: [
          {
            id: 'l',
            skuId: 'p',
            quantity: 5,
            unitPrice: 2,
            frontColorLabel: '新主档颜色',
            specificationSnapshot: {
              skuName: '旧垫子',
              unit: '条',
              frontColor: 'BL',
              frontColorLabel: '旧蓝色',
              textureFrontLabel: '旧压花',
            },
          },
        ],
      },
      details: {},
    };
    mocks.order.mockResolvedValue(view);
    const host = mount(PurchaseOrderEditor, {
      open: true,
      copyFrom: { contractId: '', orderId: 'o' },
    });
    await vi.waitFor(() =>
      expect(host.textContent).toContain('正面颜色：旧蓝色'),
    );
    expect(host.textContent).toContain('反面颜色：未维护');
    const detail = mount(OrderLines, { view });
    const lines = JSON.parse(
      detail.querySelector<HTMLDivElement>('[data-lines]')!.dataset.lines!,
    );
    expect(lines[0]).toMatchObject({
      frontColor: '旧蓝色',
      backColor: '未维护',
      textureFront: '旧压花',
    });
    const columns = JSON.parse(
      detail.querySelector<HTMLDivElement>('[data-columns]')!.dataset.columns!,
    );
    expect(
      columns.find((col: { key: string }) => col.key === 'frontColor').optional,
    ).not.toBe(true);
    const select = host.querySelector<HTMLSelectElement>(
      '.product-pick select',
    )!;
    select.value = 'p';
    select.dispatchEvent(new Event('change'));
    await nextTick();
    expect(host.textContent).toContain('正面颜色：旧蓝色');
    [...host.querySelectorAll('button')]
      .find((button) => button.textContent?.trim() === '保存')!
      .click();
    await vi.waitFor(() => expect(mocks.create).toHaveBeenCalled());
    expect(mocks.create.mock.calls[0]![0]).toMatchObject({
      sourceContractId: 'standalone',
      sourceOrderId: 'o',
      lines: [{ sourceLineId: 'l' }],
    });
  });

  it('复制后换产品清除旧行来源，改为保存新产品 ID', async () => {
    mocks.order.mockResolvedValue({
      contractId: '',
      companyId: 1,
      order: {
        id: 'o',
        supplierId: 's',
        lines: [
          {
            id: 'l',
            skuId: 'old',
            quantity: 5,
            unitPrice: 2,
            specificationSnapshot: {
              skuName: '旧产品',
              frontColorLabel: '旧蓝色',
            },
          },
        ],
      },
      details: {},
    });
    const host = mount(PurchaseOrderEditor, {
      open: true,
      copyFrom: { contractId: '', orderId: 'o' },
    });
    await vi.waitFor(() =>
      expect(host.textContent).toContain('正面颜色：旧蓝色'),
    );
    const select = host.querySelector<HTMLSelectElement>(
      '.product-pick select',
    )!;
    select.value = 'p';
    select.dispatchEvent(new Event('change'));
    await nextTick();
    expect(host.textContent).toContain('正面颜色：粉色');
    [...host.querySelectorAll('button')]
      .find((button) => button.textContent?.trim() === '保存')!
      .click();
    await vi.waitFor(() => expect(mocks.create).toHaveBeenCalled());
    expect(mocks.create.mock.calls[0]![0].lines[0]).toMatchObject({
      productId: 'p',
      sourceLineId: undefined,
    });
  });
});
