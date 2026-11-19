/* eslint-disable vue/one-component-per-file -- UI adapters render the real extras and image components. */
import type { ProcurementOrderView } from '#/api/fdmplatform/procurement';

import { createApp, defineComponent, h, nextTick, ref } from 'vue';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import OrderPrintExtras from './components/OrderPrintExtras.vue';

const mocks = vi.hoisted(() => ({
  upload: vi.fn(),
  image: vi.fn(),
  order: vi.fn(),
  orders: vi.fn(),
  copyImages: vi.fn(),
  confirm: vi.fn(),
  success: vi.fn(),
  warning: vi.fn(),
}));
vi.mock('#/api/fdmplatform/procurement', () => ({
  uploadProcurementImage: mocks.upload,
  getProcurementImage: mocks.image,
  getProcurementOrder: mocks.order,
  getProcurementOrders: mocks.orders,
  copyProcurementImages: mocks.copyImages,
}));
vi.mock('ant-design-vue', () => {
  const Wrap = defineComponent({
    setup: (_, ctx) => () => h('div', ctx.slots.default?.()),
  });
  const Input = defineComponent({
    props: ['value', 'disabled'],
    emits: ['update:value'],
    setup: (props, ctx) => () =>
      h('input', {
        ...ctx.attrs,
        value: props.value ?? '',
        disabled: props.disabled,
        onInput: (event: Event) =>
          ctx.emit('update:value', (event.target as HTMLInputElement).value),
      }),
  });
  const InputNumber = defineComponent({
    props: ['value', 'disabled'],
    emits: ['update:value'],
    setup: (props, ctx) => () =>
      h('input', {
        ...ctx.attrs,
        type: 'number',
        value: props.value ?? '',
        disabled: props.disabled,
        onInput: (event: Event) =>
          ctx.emit(
            'update:value',
            Number((event.target as HTMLInputElement).value),
          ),
      }),
  });
  return {
    Alert: Wrap,
    AutoComplete: Input,
    Button: defineComponent({
      props: { disabled: Boolean, loading: Boolean },
      setup: (props, ctx) => () =>
        h(
          'button',
          {
            ...ctx.attrs,
            disabled: props.disabled || props.loading,
          },
          ctx.slots.default?.(),
        ),
    }),
    Checkbox: defineComponent({
      props: ['checked', 'disabled'],
      emits: ['update:checked', 'change'],
      setup: (props, ctx) => () =>
        h('label', [
          h('input', {
            ...ctx.attrs,
            type: 'checkbox',
            checked: props.checked,
            disabled: props.disabled,
            onChange: (event: Event) => {
              ctx.emit(
                'update:checked',
                (event.target as HTMLInputElement).checked,
              );
              ctx.emit('change', event);
            },
          }),
          ctx.slots.default?.(),
        ]),
    }),
    Collapse: Object.assign(
      defineComponent({
        props: ['activeKey'],
        setup: (props, ctx) => () =>
          h(
            'div',
            { 'data-active-keys': JSON.stringify(props.activeKey) },
            ctx.slots.default?.(),
          ),
      }),
      {
        Panel: defineComponent({
          setup: (_, ctx) => () =>
            h('section', [ctx.slots.header?.(), ctx.slots.default?.()]),
        }),
      },
    ),
    Image: Object.assign(Wrap, { PreviewGroup: Wrap }),
    Input,
    InputNumber,
    Modal: Object.assign(
      defineComponent({
        props: { open: Boolean, title: String },
        emits: ['ok'],
        setup: (props, ctx) => () =>
          props.open
            ? h('section', { role: 'dialog', 'aria-label': props.title }, [
                ctx.slots.default?.(),
                ctx.attrs['ok-text']
                  ? h(
                      'button',
                      { onClick: () => ctx.emit('ok') },
                      ctx.attrs['ok-text'] as string,
                    )
                  : null,
              ])
            : null,
      }),
      { confirm: mocks.confirm },
    ),
    Select: Input,
    Space: Wrap,
    Spin: Wrap,
    Table: defineComponent({
      props: ['dataSource', 'columns'],
      setup: (props, ctx) => () =>
        h(
          'table',
          (props.dataSource ?? []).map((record: Record<string, unknown>) =>
            h(
              'tr',
              { 'data-row': record.id },
              (props.columns ?? []).map((column: { key: string }) =>
                h(
                  'td',
                  { 'data-key': column.key },
                  ctx.slots.bodyCell?.({ record, column }),
                ),
              ),
            ),
          ),
        ),
    }),
    Tag: Wrap,
    Textarea: defineComponent({
      props: ['value', 'disabled'],
      emits: ['update:value'],
      setup: (props, ctx) => () =>
        h('textarea', {
          ...ctx.attrs,
          value: props.value ?? '',
          disabled: props.disabled,
          onInput: (event: Event) =>
            ctx.emit(
              'update:value',
              (event.target as HTMLTextAreaElement).value,
            ),
        }),
    }),
    message: { success: mocks.success, warning: mocks.warning, error: vi.fn() },
  };
});

function fixture(): ProcurementOrderView {
  return {
    id: 'order-1',
    contractId: 'contract-1',
    details: { version: 1, status: 'DRAFT', clauseIds: [] },
    order: {
      currency: 'CNY',
      lines: [
        {
          id: 'product-1',
          quantity: 10,
          unitPrice: 2,
          specificationSnapshot: { skuCode: 'SKU-1' },
        },
      ],
    },
    accessoryCatalog: [],
  } as unknown as ProcurementOrderView;
}
const cleanup: (() => void)[] = [];
beforeEach(() => {
  vi.clearAllMocks();
  mocks.upload.mockResolvedValue({ id: 'color-image' });
  mocks.image.mockResolvedValue(new Blob(['image'], { type: 'image/png' }));
  mocks.orders.mockResolvedValue({ list: [], total: 0 });
});
afterEach(() => cleanup.splice(0).forEach((dispose) => dispose()));
async function settle() {
  for (let index = 0; index < 4; index++) {
    await Promise.resolve();
    await nextTick();
  }
}
async function mount() {
  const disabled = ref(false);
  const saving = ref(false);
  const view = ref(fixture());
  const extras = ref<InstanceType<typeof OrderPrintExtras>>();
  const saved = vi.fn();
  const dirty = vi.fn();
  const busy = vi.fn();
  const host = document.createElement('div');
  document.body.append(host);
  const app = createApp({
    render: () =>
      h(OrderPrintExtras, {
        ref: extras,
        view: view.value,
        disabled: disabled.value,
        saving: saving.value,
        onSave: saved,
        onDirty: dirty,
        onBusy: busy,
      }),
  });
  app.mount(host);
  cleanup.push(() => {
    app.unmount();
    host.remove();
  });
  await settle();
  return { host, view, extras, saved, dirty, busy, disabled, saving };
}
function buttons(host: HTMLElement, label: string) {
  return [...host.querySelectorAll('button')].filter(
    (button) => button.textContent?.trim() === label,
  );
}
async function click(host: HTMLElement, label: string) {
  const button = buttons(host, label)[0];
  expect(button).toBeDefined();
  expect(button!.disabled).toBe(false);
  button!.click();
  await settle();
}
async function fill(host: ParentNode, selector: string, value: string) {
  const input = host.querySelector<HTMLInputElement>(selector);
  expect(input).not.toBeNull();
  expect(input!.disabled).toBe(false);
  input!.value = value;
  input!.dispatchEvent(new Event('input'));
  await settle();
}

function dragEvent(element: Element, type: string) {
  const event = new Event(type, { bubbles: true, cancelable: true });
  Object.defineProperty(event, 'dataTransfer', {
    value: { effectAllowed: '', dropEffect: '', setData: vi.fn() },
  });
  element.dispatchEvent(event);
  return event;
}

async function withColorCards() {
  const mounted = await mount();
  mounted.view.value = {
    ...mounted.view.value,
    details: {
      ...mounted.view.value.details,
      version: 2,
      detailColumns: [
        { id: 'card', type: 'IMAGE', title: '色卡图片' },
        { id: 'other', type: 'IMAGE', title: '其他图片' },
      ],
      lineExtras: {
        'product-1': {
          customCells: {
            card: { imageIds: ['front', 'back', 'detail'] },
            other: { imageIds: ['other-front', 'other-back'] },
          },
        },
      },
    },
  };
  await settle();
  return mounted;
}

function thumbs(host: HTMLElement, column = 'card') {
  return [
    ...host.querySelectorAll<HTMLElement>(
      `[data-key="custom:${column}"] .thumb`,
    ),
  ];
}

describe('actual purchase print extras editor', () => {
  it('hides production fields for signed and legacy SKUs and keeps supplier fields editable', async () => {
    const { host, view, extras } = await mount();
    view.value = {
      ...view.value,
      order: {
        ...view.value.order,
        lines: [
          {
            id: 'product-1',
            specificationSnapshot: {
              skuCode: 'SIGNED',
              finishedSignature: 'SKU-v1',
              colorMode: 'DUAL',
              frontColor: 'RED',
              backColor: 'BLUE',
              textureFront: 'NONE',
              textureBack: 'WAVE',
              weight: '800g',
            },
          },
          {
            id: 'product-2',
            specificationSnapshot: {
              skuCode: 'LEGACY',
              colorMode: 'DUAL',
              colorCode: 'RED',
            },
          },
        ],
      },
      details: { ...view.value.details, version: 2 },
    };
    await settle();
    for (const field of [
      'colorMode',
      'frontColor',
      'backColor',
      'textureFront',
      'textureBack',
    ])
      expect(host.querySelector(`[data-key="${field}"]`)).toBeNull();
    expect(host.textContent).not.toContain('生产属性');
    expect(extras.value!.payload().lineExtras).toEqual({
      'product-1': { weight: '800g' },
    });
    expect(
      host.querySelector<HTMLButtonElement>(
        '[data-row="product-1"] [data-key="colorImage"] button',
      )!.disabled,
    ).toBe(false);
    await fill(host, '#model-product-1', '打样后确认');
    expect(extras.value!.payload().lineExtras['product-1']).toEqual({
      model: '打样后确认',
      weight: '800g',
    });
    expect(
      buttons(host, '保存附加资料').every((button) => !button.disabled),
    ).toBe(true);
  });

  it('places order remarks after the four groups and saves edits and clearing through the existing payload', async () => {
    const { host, view, extras, saved, dirty } = await mount();
    const groups = [...host.querySelectorAll('.extras-collapse > section')];
    expect(groups).toHaveLength(5);
    expect(groups[4]!.textContent).toContain('订单备注');
    expect(
      JSON.parse(
        host.querySelector<HTMLElement>('.extras-collapse')!.dataset
          .activeKeys!,
      ),
    ).not.toContain('remark');
    const input = host.querySelector<HTMLTextAreaElement>(
      'textarea[aria-label="订单备注"]',
    )!;
    expect(input.value).toBe('');
    expect(input.maxLength).toBe(2000);
    expect(extras.value!.isDirty()).toBe(false);
    await fill(
      host,
      'textarea[aria-label="订单备注"]',
      '  第一批优先发货\n第二批另行通知  ',
    );
    expect(extras.value!.isDirty()).toBe(true);
    expect(dirty).toHaveBeenLastCalledWith(true);
    saved.mockImplementation(() => extras.value!.payload());
    await click(host, '保存附加资料');
    expect(saved.mock.results[0]!.value.orderRemark).toBe(
      '第一批优先发货\n第二批另行通知',
    );
    view.value = {
      ...view.value,
      details: {
        ...view.value.details,
        ...extras.value!.payload(),
        remark: '内部备注独立保留',
        version: 2,
      },
    };
    await settle();
    extras.value!.markSaved();
    await settle();
    expect(extras.value!.isDirty()).toBe(false);
    expect(input.value).toBe('第一批优先发货\n第二批另行通知');
    await fill(host, 'textarea[aria-label="订单备注"]', '');
    await click(host, '保存附加资料');
    expect(saved.mock.results[1]!.value.orderRemark).toBe('');
    expect(view.value.details.remark).toBe('内部备注独立保留');
  });

  it('expands saved remarks and disables editing while read-only or saving', async () => {
    const { host, view, extras, disabled, saving } = await mount();
    view.value = {
      ...view.value,
      details: { ...view.value.details, orderRemark: '按合同交付', version: 2 },
    };
    await settle();
    expect(
      JSON.parse(
        host.querySelector<HTMLElement>('.extras-collapse')!.dataset
          .activeKeys!,
      ),
    ).toContain('remark');
    const input = host.querySelector<HTMLTextAreaElement>(
      'textarea[aria-label="订单备注"]',
    )!;
    expect(input.value).toBe('按合同交付');
    expect(extras.value!.isDirty()).toBe(false);
    disabled.value = true;
    await settle();
    expect(input.disabled).toBe(true);
    disabled.value = false;
    saving.value = true;
    await settle();
    expect(input.disabled).toBe(true);
    saving.value = false;
    await settle();
    expect(input.disabled).toBe(false);
  });

  it('recognizes remark-only historical orders and confirms replacing a current remark', async () => {
    const sourceView = {
      ...fixture(),
      id: 'source-order',
      contractId: 'source-contract',
      details: { ...fixture().details, orderRemark: '历史订单备注' },
    };
    mocks.orders.mockResolvedValue({
      list: [
        {
          id: sourceView.id,
          contractId: sourceView.contractId,
          details: sourceView.details,
          record: { code: 'CG-REMARK' },
        },
      ],
      total: 1,
    });
    mocks.order.mockResolvedValue(sourceView);
    const { host, extras } = await mount();
    await fill(host, 'textarea[aria-label="订单备注"]', '本单备注');
    await click(host, '从历史采购单复制');
    expect(host.querySelector('table [data-key="extras"]')!.textContent).toBe(
      '有',
    );
    await click(host, '复制');
    expect(mocks.confirm).toHaveBeenCalledTimes(1);
    expect(mocks.order).not.toHaveBeenCalled();
    expect(mocks.confirm.mock.calls[0]![0].content).toContain('订单备注');
    await mocks.confirm.mock.calls[0]![0].onOk();
    await settle();
    expect(extras.value!.payload().orderRemark).toBe('历史订单备注');
    expect(extras.value!.isDirty()).toBe(true);
    expect(
      JSON.parse(
        host.querySelector<HTMLElement>('.extras-collapse')!.dataset
          .activeKeys!,
      ),
    ).toContain('remark');
    expect(mocks.copyImages).not.toHaveBeenCalled();
  });

  it('opens and closes custom column settings without changing saved data', async () => {
    const { host, extras, dirty } = await mount();
    const original = extras.value!.payload();
    expect(host.querySelector('[role="dialog"]')).toBeNull();
    expect(buttons(host, '+ 新增文字列')).toHaveLength(0);
    await click(host, '自定义列设置（0/8）');
    expect(
      host.querySelector('[role="dialog"][aria-label="自定义列设置"]'),
    ).not.toBeNull();
    expect(extras.value!.payload()).toEqual(original);
    expect(extras.value!.isDirty()).toBe(false);
    await click(host, '完成设置');
    expect(host.querySelector('[role="dialog"]')).toBeNull();
    expect(extras.value!.payload()).toEqual(original);
    expect(dirty).toHaveBeenLastCalledWith(false);
    expect(
      buttons(host, '保存附加资料').every((button) => button.disabled),
    ).toBe(true);
  });

  it('preserves saved legacy requirements when editing other supplemental fields', async () => {
    const { host, view, extras } = await mount();
    const previous = {
      colorMode: 'DUAL' as const,
      frontColor: 'RED',
      backColor: 'BLUE',
      textureFront: '',
      textureBack: 'WAVE',
      weight: '',
    };
    view.value = {
      ...view.value,
      order: {
        ...view.value.order,
        lines: [
          {
            id: 'product-1',
            quantity: 10,
            specificationSnapshot: {
              skuCode: 'SKU-1',
              colorMode: 'SINGLE',
              frontColor: 'GREEN',
              weight: '800g',
            },
          },
        ],
      },
      details: {
        ...view.value.details,
        version: 2,
        lineExtras: { 'product-1': previous },
      },
    };
    await settle();
    expect(extras.value!.isDirty()).toBe(false);
    expect(extras.value!.payload().lineExtras['product-1']).toEqual(previous);
    await fill(host, '#color-product-1', '客户蓝');
    expect(extras.value!.payload().lineExtras['product-1']).toEqual({
      ...previous,
      customerColor: '客户蓝',
    });
  });

  it('batch edits weight for selected product lines and excludes fee rows', async () => {
    const { host, view, extras } = await mount();
    view.value = {
      ...view.value,
      order: {
        ...view.value.order,
        lines: [
          {
            id: 'product-1',
            specificationSnapshot: {
              skuCode: 'SKU-1',
              frontColor: 'RED',
              weight: '800g',
            },
          },
          {
            id: 'product-2',
            specificationSnapshot: {
              skuCode: 'SKU-2',
              frontColor: 'BLUE',
              weight: '900g',
            },
          },
        ],
      },
      details: { ...view.value.details, version: 2 },
    };
    await settle();
    await click(host, '+ 新增费用 / 免费项目行');
    expect(
      host.querySelectorAll('input[aria-label^="选择产品 "]'),
    ).toHaveLength(2);
    host
      .querySelector<HTMLInputElement>('input[aria-label="选择产品 SKU-1"]')!
      .click();
    await settle();
    await click(host, '批量设置产品克重');
    await fill(host, 'input[aria-label="批量产品克重"]', '1000g±50g');
    await click(host, '应用到所选明细');
    expect(extras.value!.payload().lineExtras).toEqual({
      'product-1': { weight: '1000g±50g' },
      'product-2': { weight: '900g' },
    });
    expect(extras.value!.payload().additionalLines[0]).not.toHaveProperty(
      'weight',
    );

    host.querySelector<HTMLInputElement>('.batch-toolbar input')!.click();
    await settle();
    await click(host, '批量设置产品克重');
    await click(host, '清空所选克重');
    expect(extras.value!.payload().lineExtras).toEqual({
      'product-1': { weight: '' },
      'product-2': { weight: '' },
    });

    await fill(host, '#weight-product-2', '900g');
    await click(host, '批量设置产品克重');
    host.querySelector<HTMLInputElement>('.batch-only-empty')!.click();
    await settle();
    await fill(host, 'input[aria-label="批量产品克重"]', '1000g');
    await click(host, '应用到所选明细');
    expect(extras.value!.payload().lineExtras).toEqual({
      'product-1': { weight: '1000g' },
      'product-2': { weight: '900g' },
    });
  });

  it('drags color cards in both directions and saves/reloads their new order', async () => {
    const { host, extras, view, saved } = await withColorCards();
    const [front, back, detail] = thumbs(host);
    expect(front!.getAttribute('draggable')).toBe('true');
    dragEvent(front!, 'dragstart');
    expect(dragEvent(detail!, 'dragover').defaultPrevented).toBe(true);
    await settle();
    expect(detail!.classList.contains('drop-target')).toBe(true);
    dragEvent(detail!, 'drop');
    dragEvent(front!, 'dragend');
    await settle();
    expect(thumbs(host)).toEqual([back, detail, front]);
    expect(
      extras.value!.payload().lineExtras['product-1']!.customCells,
    ).toEqual({
      card: { imageIds: ['back', 'detail', 'front'] },
      other: { imageIds: ['other-front', 'other-back'] },
    });
    expect(extras.value!.isDirty()).toBe(true);
    // The reverse direction moves the last image into the first position.
    dragEvent(front!, 'dragstart');
    dragEvent(back!, 'dragover');
    dragEvent(back!, 'drop');
    await settle();
    expect(thumbs(host)).toEqual([front, back, detail]);
    expect(extras.value!.isDirty()).toBe(false);
    dragEvent(back!, 'dragstart');
    dragEvent(front!, 'drop');
    await settle();
    await click(host, '保存附加资料');
    expect(saved).toHaveBeenCalledOnce();
    const payload = extras.value!.payload();
    expect(
      payload.lineExtras['product-1']!.customCells!.card!.imageIds,
    ).toEqual(['back', 'front', 'detail']);
    view.value = {
      ...view.value,
      details: { ...view.value.details, ...payload, version: 3 },
    };
    await settle();
    extras.value!.markSaved();
    await settle();
    expect(extras.value!.isDirty()).toBe(false);
    expect(extras.value!.payload()).toEqual(payload);
    // Switch away and back to force loading the persisted array afresh.
    const savedView = view.value;
    view.value = { ...fixture(), id: 'order-2' };
    await settle();
    view.value = savedView;
    await settle();
    expect(extras.value!.payload()).toEqual(payload);
  });

  it('rejects cross-group/external drops, cancels without changes and respects readonly', async () => {
    const { host, extras, disabled } = await withColorCards();
    const original = extras.value!.payload();
    const [front, back] = thumbs(host);
    const [other] = thumbs(host, 'other');
    expect(dragEvent(back!, 'dragover').defaultPrevented).toBe(false);
    dragEvent(back!, 'drop');
    dragEvent(front!, 'dragstart');
    expect(dragEvent(other!, 'dragover').defaultPrevented).toBe(false);
    dragEvent(other!, 'drop');
    dragEvent(front!, 'dragend');
    await settle();
    expect(extras.value!.payload()).toEqual(original);
    expect(extras.value!.isDirty()).toBe(false);
    dragEvent(front!, 'dragstart');
    dragEvent(back!, 'dragover');
    dragEvent(front!, 'dragend');
    await settle();
    expect(host.querySelector('.drop-target')).toBeNull();
    disabled.value = true;
    await settle();
    expect(front!.getAttribute('draggable')).toBe('false');
    expect(dragEvent(front!, 'dragstart').defaultPrevented).toBe(true);
    dragEvent(back!, 'drop');
    expect(extras.value!.payload()).toEqual(original);
  });

  it('uploads and removes the labelled supplier color image without replacing the product image', async () => {
    const { host, view, extras, busy } = await mount();
    view.value = {
      ...view.value,
      details: {
        ...view.value.details,
        version: 2,
        lineExtras: { 'product-1': { imageId: 'product-image' } },
      },
    };
    await settle();
    const product = host.querySelector('[data-row="product-1"]')!;
    const supplierImage = product.querySelector(
      '[data-key="colorImage"] [aria-label="供应商实物色号图"]',
    );
    expect(supplierImage).not.toBeNull();
    expect(
      product.querySelector('[data-key="model"]')?.nextElementSibling,
    ).toBe(product.querySelector('[data-key="colorImage"]'));
    const file =
      supplierImage!.querySelector<HTMLInputElement>('input[type="file"]')!;
    Object.defineProperty(file, 'files', {
      configurable: true,
      value: [new File(['png'], 'supplier-color.png', { type: 'image/png' })],
    });
    file.dispatchEvent(new Event('change'));
    await settle();
    expect(busy).toHaveBeenCalledWith(true);
    expect(busy).toHaveBeenLastCalledWith(false);
    const payload = extras.value!.payload();
    expect(payload.lineExtras['product-1']).toMatchObject({
      imageId: 'product-image',
      colorImageId: 'color-image',
    });
    view.value = {
      ...view.value,
      details: { ...view.value.details, ...payload, version: 3 },
    };
    extras.value!.markSaved();
    await settle();
    expect(extras.value!.isDirty()).toBe(false);
    product
      .querySelector<HTMLButtonElement>(
        '[data-key="colorImage"] button[aria-label="删除图片"]',
      )!
      .click();
    await settle();
    expect(extras.value!.payload().lineExtras['product-1']).toEqual({
      imageId: 'product-image',
    });
    expect(extras.value!.isDirty()).toBe(true);
  });

  it('edits free expense rows, text columns and color-card images and exposes both save buttons', async () => {
    const { host, extras, saved, busy } = await mount();
    expect(extras.value?.isDirty()).toBe(false);
    expect(buttons(host, '保存附加资料')).toHaveLength(2);
    expect(
      buttons(host, '保存附加资料').every((button) => button.disabled),
    ).toBe(true);
    await click(host, '+ 新增费用 / 免费项目行');
    await fill(host, 'input[aria-label="费用项目名称"]', '免费打样');
    await fill(host, 'input[aria-label="费用数量"]', '3');
    await fill(host, 'input[aria-label="费用单价（可填0）"]', '0');
    await click(host, '自定义列设置（0/8）');
    await click(host, '+ 新增文字列');
    await click(host, '+ 新增图片列（色卡等）');
    const columns = extras.value!.payload().detailColumns;
    const textColumn = columns.find((column) => column.type === 'TEXT')!;
    const imageColumn = columns.find((column) => column.type === 'IMAGE')!;
    await fill(
      host,
      `input[aria-label="自定义列名称 ${textColumn.id}"]`,
      '特殊备注',
    );
    await click(host, '完成设置');
    const product = host.querySelector<HTMLElement>('[data-row="product-1"]')!;
    await fill(
      product,
      `[data-key="custom:${textColumn.id}"] textarea`,
      '正面按色卡印刷',
    );
    const imageCell = product.querySelector(
      `[data-key="custom:${imageColumn.id}"]`,
    )!;
    const file =
      imageCell.querySelector<HTMLInputElement>('input[type="file"]')!;
    Object.defineProperty(file, 'files', {
      configurable: true,
      value: [new File(['png'], 'card.png', { type: 'image/png' })],
    });
    file.dispatchEvent(new Event('change'));
    await settle();
    expect(mocks.upload).toHaveBeenCalledWith(
      'contract-1',
      'order-1',
      expect.any(File),
    );
    expect(busy).toHaveBeenCalledWith(true);
    expect(busy).toHaveBeenLastCalledWith(false);
    expect(extras.value!.payload()).toMatchObject({
      additionalLines: [{ name: '免费打样', quantity: 3, unitPrice: 0 }],
      lineExtras: {
        'product-1': {
          customCells: {
            [textColumn.id]: { text: '正面按色卡印刷' },
            [imageColumn.id]: { imageIds: ['color-image'] },
          },
        },
      },
    });
    expect(host.textContent).toContain('CNY 0.00');
    expect(extras.value?.isDirty()).toBe(true);
    for (const button of buttons(host, '保存附加资料')) button.click();
    expect(saved).toHaveBeenCalledTimes(2);
  });

  it('retains dirty edits across refreshed versions and accepts saved normalization through markSaved', async () => {
    const { host, view, extras, dirty } = await mount();
    await click(host, '+ 新增费用 / 免费项目行');
    await fill(host, 'input[aria-label="费用项目名称"]', ' 加工费 ');
    const edited = extras.value!.payload();
    view.value = {
      ...view.value,
      details: {
        ...view.value.details,
        version: 2,
        lineExtras: { 'product-1': { remark: '其他操作刷新' } },
      },
    };
    await settle();
    expect(extras.value!.payload()).toEqual(edited);
    expect(extras.value?.isDirty()).toBe(true);
    expect(dirty).toHaveBeenLastCalledWith(true);
    view.value = {
      ...view.value,
      details: { ...view.value.details, ...edited, version: 3 },
    };
    await settle();
    extras.value!.markSaved();
    await settle();
    expect(extras.value!.payload()).toEqual(edited);
    expect(extras.value?.isDirty()).toBe(false);
    expect(dirty).toHaveBeenLastCalledWith(false);
    expect(
      buttons(host, '保存附加资料').every((button) => button.disabled),
    ).toBe(true);
    expect(
      host.querySelector<HTMLInputElement>('input[aria-label="费用项目名称"]')!
        .value,
    ).toBe('加工费');
  });

  it('loads a different order even while the previous order contains dirty edits', async () => {
    const { host, view, extras } = await mount();
    await click(host, '自定义列设置（0/8）');
    await click(host, '+ 新增文字列');
    expect(extras.value?.isDirty()).toBe(true);
    view.value = { ...fixture(), id: 'order-2' };
    await settle();
    expect(extras.value!.payload().detailColumns).toEqual([]);
    expect(extras.value?.isDirty()).toBe(false);
  });

  it('copies historical free rows, typed columns and remapped images into the current order', async () => {
    const sourceView: ProcurementOrderView = {
      ...fixture(),
      id: 'source-order',
      contractId: 'source-contract',
      details: {
        ...fixture().details,
        detailColumns: [{ id: 'card', type: 'IMAGE', title: '色卡' }],
        additionalLines: [
          {
            id: 'free',
            name: '免费打样',
            quantity: 1,
            unitPrice: 0,
            imageIds: ['fee-image'],
          },
        ],
        lineExtras: {
          'product-1': { customCells: { card: { imageIds: ['source-card'] } } },
        },
      },
    };
    mocks.orders.mockResolvedValue({
      list: [
        {
          id: sourceView.id,
          contractId: sourceView.contractId,
          details: sourceView.details,
          record: { code: 'CG-SOURCE' },
        },
      ],
      total: 1,
    });
    mocks.order.mockResolvedValue(sourceView);
    mocks.copyImages.mockResolvedValue({
      'source-card': 'copied-card',
      'fee-image': 'copied-fee',
    });
    const { host, extras, busy } = await mount();
    await click(host, '从历史采购单复制');
    expect(busy).toHaveBeenLastCalledWith(true);
    await click(host, '复制');
    expect(mocks.copyImages).toHaveBeenCalledWith(
      'contract-1',
      'order-1',
      expect.objectContaining({
        sourceContractId: 'source-contract',
        sourceOrderId: 'source-order',
        imageIds: expect.arrayContaining(['source-card', 'fee-image']),
      }),
    );
    expect(extras.value!.payload()).toMatchObject({
      additionalLines: [
        { name: '免费打样', unitPrice: 0, imageIds: ['copied-fee'] },
      ],
      detailColumns: [{ id: 'card', title: '色卡', type: 'IMAGE' }],
      lineExtras: {
        'product-1': { customCells: { card: { imageIds: ['copied-card'] } } },
      },
    });
    expect(extras.value?.isDirty()).toBe(true);
    expect(busy).toHaveBeenLastCalledWith(false);
  });

  it('ignores a historical copy result if the target identity changed while loading', async () => {
    mocks.orders.mockResolvedValue({
      list: [
        {
          id: 'source',
          contractId: 'source-contract',
          details: {},
          record: {},
        },
      ],
      total: 1,
    });
    let finishSource!: (value: ProcurementOrderView) => void;
    mocks.order.mockImplementation(
      () =>
        new Promise<ProcurementOrderView>((resolve) => {
          finishSource = resolve;
        }),
    );
    const { host, view, extras } = await mount();
    await click(host, '从历史采购单复制');
    await click(host, '复制');
    expect(buttons(host, '复制')[0]!.disabled).toBe(true);
    view.value = { ...fixture(), id: 'order-2' };
    await settle();
    finishSource({
      ...fixture(),
      details: {
        ...fixture().details,
        lineExtras: { 'product-1': { imageId: 'stale-image' } },
      },
    });
    await settle();
    expect(mocks.copyImages).not.toHaveBeenCalled();
    expect(extras.value!.payload().lineExtras).toEqual({});
    expect(extras.value?.isDirty()).toBe(false);
  });
});
