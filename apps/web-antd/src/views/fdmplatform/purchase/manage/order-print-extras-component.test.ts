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
    Checkbox: Wrap,
    Collapse: Object.assign(Wrap, { Panel: Wrap }),
    Image: Object.assign(Wrap, { PreviewGroup: Wrap }),
    Input,
    InputNumber,
    Modal: Object.assign(
      defineComponent({
        props: { open: Boolean },
        setup: (props, ctx) => () =>
          props.open ? h('section', ctx.slots.default?.()) : null,
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
    Textarea: Input,
    message: { success: vi.fn(), warning: vi.fn(), error: vi.fn() },
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
  return { host, view, extras, saved, dirty, busy, disabled };
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

  it('uploads and removes the supplier color image after model without replacing the product image', async () => {
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
    expect(
      product.querySelector('[data-key="model"]')!.nextElementSibling,
    ).toBe(product.querySelector('[data-key="colorImage"]'));
    const file = product.querySelector<HTMLInputElement>(
      '[data-key="colorImage"] input[type="file"]',
    )!;
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
    const product = host.querySelector<HTMLTableRowElement>(
      '[data-row="product-1"]',
    )!;
    await fill(
      product,
      `[data-key="custom:${textColumn.id}"] input`,
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
