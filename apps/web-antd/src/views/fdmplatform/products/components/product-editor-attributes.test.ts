import type {
  Product,
  ProductAttributeOptions,
} from '#/api/fdmplatform/products';

import { createApp, defineComponent, h, nextTick, ref } from 'vue';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import ProductDetailDrawer from './ProductDetailDrawer.vue';
import ProductEditor from './ProductEditor.vue';

const api = vi.hoisted(() => ({ options: vi.fn(), save: vi.fn() }));
vi.mock('#/api/fdmplatform', () => ({
  newIdempotencyKey: () => 'attribute-edit',
}));
vi.mock('#/api/fdmplatform/products', () => ({
  getProductAttributeOptions: api.options,
  getProductCategoryList: vi.fn(async () => [
    { id: 'yoga', name: '瑜伽垫', active: true, sort: 1, version: 1 },
  ]),
  saveProduct: api.save,
}));
vi.mock('#/api/fdmplatform/product-activity', () => ({
  getProductActivity: vi.fn(async () => ({
    list: [],
    total: 0,
    counts: {},
    notes: [],
    summary: { quantities: [] },
  })),
}));
vi.mock('./ProductFiles.vue', () => ({
  default: defineComponent({ render: () => null }),
}));
vi.mock('../../documents/RelatedLink.vue', () => ({
  default: defineComponent({ render: () => null }),
}));
vi.mock('#/components/fdm-resizable-drawer', () => ({
  FdmResizableDrawer: defineComponent({
    props: ['open'],
    setup:
      (props, { attrs, slots }) =>
      () =>
        props.open
          ? h('section', attrs, [slots.default?.(), slots.footer?.()])
          : null,
  }),
}));
vi.mock('ant-design-vue', () => {
  const block = defineComponent({
    setup:
      (_, { slots }) =>
      () =>
        h('div', slots.default?.()),
  });
  const field = defineComponent({
    props: ['label'],
    setup:
      (props, { slots }) =>
      () =>
        h('div', [h('span', props.label), slots.default?.()]),
  });
  const input = defineComponent({
    props: ['value'],
    emits: ['update:value'],
    setup:
      (props, { attrs, emit }) =>
      () =>
        h('input', {
          ...attrs,
          value: props.value ?? '',
          onInput: (event: Event) =>
            emit('update:value', (event.target as HTMLInputElement).value),
        }),
  });
  return {
    Alert: defineComponent({
      props: ['message'],
      setup: (props) => () => h('p', props.message),
    }),
    AutoComplete: input,
    Button: defineComponent({
      setup:
        (_, { attrs, slots }) =>
        () =>
          h('button', attrs, slots.default?.()),
    }),
    Card: block,
    Empty: block,
    Pagination: block,
    Space: block,
    Spin: block,
    Table: block,
    Tag: block,
    Checkbox: block,
    Input: input,
    Form: Object.assign(block, { Item: field }),
    Descriptions: Object.assign(block, { Item: field }),
    Radio: Object.assign(block, { Group: block, Button: block }),
    Tabs: Object.assign(block, { TabPane: block }),
    Select: defineComponent({
      props: ['value', 'options'],
      emits: ['update:value'],
      setup:
        (props, { attrs, emit }) =>
        () =>
          h(
            'select',
            {
              ...attrs,
              value: props.value ?? '',
              onChange: (event: Event) =>
                emit(
                  'update:value',
                  (event.target as HTMLSelectElement).value || undefined,
                ),
            },
            [
              h('option', { value: '' }, '请选择'),
              ...props.options.map((item: { label: string; value: string }) =>
                h('option', { value: item.value }, item.label),
              ),
            ],
          ),
    }),
    Cascader: defineComponent({
      props: ['value', 'options', 'changeOnSelect'],
      emits: ['change'],
      setup:
        (props, { attrs, emit }) =>
        () =>
          h(
            'select',
            {
              ...attrs,
              value: props.value?.[1] ?? '',
              onChange: (event: Event) => {
                const value = (event.target as HTMLSelectElement).value;
                const group = props.options.find(
                  (item: { children: Array<{ value: string }> }) =>
                    item.children.some((leaf) => leaf.value === value),
                );
                emit('change', group ? [group.value, value] : undefined);
              },
            },
            [
              h('option', { value: '' }, '全部生产分类'),
              ...props.options.map(
                (group: {
                  children: Array<{ label: string; value: string }>;
                  label: string;
                  value: string;
                }) =>
                  h('optgroup', { label: group.label }, [
                    ...(props.changeOnSelect
                      ? [h('option', { value: group.value }, group.label)]
                      : []),
                    ...group.children.map((item) =>
                      h('option', { value: item.value }, item.label),
                    ),
                  ]),
              ),
            ],
          ),
    }),
    message: { success: vi.fn() },
  };
});

const options: ProductAttributeOptions = {
  stages: [
    { value: 'BOARD', label: '板材', group: '半成品' },
    { value: 'LAMINATED', label: '贴合片材', group: '半成品' },
    { value: 'FINISHED', label: '成品', group: '成品' },
  ],
  colors: [
    { value: 'P', label: '紫色' },
    { value: 'G', label: '灰色' },
  ],
  textures: [
    { value: 'BK', label: '贝壳纹' },
    { value: 'FH', label: '防滑纹' },
  ],
  matTypes: [{ value: 'FLAT', label: '平铺垫' }],
};
const product: Product = {
  id: 'p1',
  code: 'SKU-1',
  name: '测试产品',
  companyId: 0,
  version: 1,
  categoryId: 'yoga',
  unit: '片',
  color: '旧颜色原文',
  active: true,
  selectable: true,
  missingFields: [],
  canManage: true,
  canManagePrice: false,
};
let dispose: (() => void) | undefined;
const flush = async () => {
  for (let i = 0; i < 5; i++) {
    await Promise.resolve();
    await nextTick();
  }
};
beforeEach(() => {
  api.options.mockResolvedValue(options);
  api.save.mockImplementation(async (payload) => ({
    ...product,
    ...payload,
    version: 2,
    productStageLabel: options.stages.find(
      (item) => item.value === payload.productStage,
    )?.label,
    colorCodeLabel: options.colors.find(
      (item) => item.value === payload.colorCode,
    )?.label,
    frontColorLabel: options.colors.find(
      (item) => item.value === payload.frontColor,
    )?.label,
    backColorLabel: options.colors.find(
      (item) => item.value === payload.backColor,
    )?.label,
    textureFrontLabel: options.textures.find(
      (item) => item.value === payload.textureFront,
    )?.label,
    textureBackLabel: options.textures.find(
      (item) => item.value === payload.textureBack,
    )?.label,
    matTypeLabel: options.matTypes.find(
      (item) => item.value === payload.matType,
    )?.label,
  }));
});
afterEach(() => {
  dispose?.();
  document.body.innerHTML = '';
  vi.resetAllMocks();
});
async function mount(initial = product) {
  const open = ref(true);
  const saved = ref<Product>();
  const host = document.createElement('div');
  document.body.append(host);
  const app = createApp({
    render: () =>
      h('div', [
        h(ProductEditor, {
          open: open.value,
          companyId: 0,
          product: initial,
          onSaved: (value: Product) => {
            saved.value = value;
          },
          onClose: () => {
            open.value = false;
          },
        }),
        h(ProductDetailDrawer, {
          open: Boolean(saved.value),
          product: saved.value,
        }),
      ]),
  });
  app.mount(host);
  dispose = () => app.unmount();
  await flush();
}
async function choose(label: string, value: string) {
  const input = document.querySelector<HTMLSelectElement>(
    `select[aria-label="${label}"]`,
  )!;
  expect(input).toBeTruthy();
  input.value = value;
  input.dispatchEvent(new Event('change', { bubbles: true }));
  await flush();
}
async function save() {
  [...document.querySelectorAll('button')]
    .find((button) => button.textContent?.trim() === '保存产品档案')!
    .click();
  await flush();
}

describe('产品档案编辑与查看', () => {
  it('允许修改已有产品的 SKU 编号，并携带原产品 ID 和版本保存', async () => {
    await mount();
    const input = document.querySelector<HTMLInputElement>(
      'input[aria-label="SKU 编号"]',
    )!;
    expect(input.disabled).toBe(false);
    expect(input.value).toBe('SKU-1');
    input.value = 'SKU-2';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    await save();
    expect(api.save).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'p1', code: 'SKU-2', expectedVersion: 1 }),
    );
    expect(
      document.querySelector('.product-detail-drawer')!.textContent,
    ).toContain('SKU-2');
  });

  it('编辑时不允许将 SKU 编号清空', async () => {
    await mount();
    const input = document.querySelector<HTMLInputElement>(
      'input[aria-label="SKU 编号"]',
    )!;
    input.value = '   ';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    await save();
    expect(api.save).not.toHaveBeenCalled();
    expect(document.body.textContent).toContain('请填写 SKU 编号和产品名称');
  });

  it('编号重复时显示服务端错误并保留编辑内容', async () => {
    api.save.mockRejectedValueOnce(
      new Error('此自建产品编号已经存在，请使用已有产品：SKU-2'),
    );
    await mount();
    const input = document.querySelector<HTMLInputElement>(
      'input[aria-label="SKU 编号"]',
    )!;
    input.value = 'SKU-2';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    await save();
    expect(document.body.textContent).toContain('此自建产品编号已经存在');
    expect(document.contains(input)).toBe(true);
    expect(input.value).toBe('SKU-2');
    expect(document.querySelector('.product-detail-drawer')).toBeNull();
  });

  it('不会把历史物料解析阶段自动保存回产品档案', async () => {
    await mount({
      ...product,
      productStage: null,
      resolvedProductStage: 'BOARD',
      resolvedProductStageLabel: '发泡板材',
    });
    const stage = document.querySelector<HTMLSelectElement>(
      'select[aria-label="生产分类"]',
    )!;
    expect(stage.value).toBe('');
    await save();
    expect(api.save).toHaveBeenCalledWith(
      expect.objectContaining({ productStage: '' }),
    );
    expect(api.save.mock.calls[0]![0]).not.toHaveProperty(
      'resolvedProductStage',
    );
  });
  it('维护档案仍保存具体阶段，不提供仅选择半成品大类的选项', async () => {
    await mount({ ...product, productStage: 'BOARD' });
    const stage = document.querySelector<HTMLSelectElement>(
      'select[aria-label="生产分类"]',
    )!;
    expect(stage.querySelector('option[value="group:半成品"]')).toBeNull();
    expect(stage.value).toBe('BOARD');
    await save();
    expect(api.save).toHaveBeenCalledWith(
      expect.objectContaining({ productStage: 'BOARD' }),
    );
  });

  it('从大类选择具体生产分类，保存字典值并在读回详情中展示正反颜色、压花及垫子类型', async () => {
    await mount();
    const group = document.querySelector(
      'select[aria-label="生产分类"] optgroup[label="半成品"]',
    )!;
    expect(
      [...group.querySelectorAll('option')].map((item) => item.value),
    ).toEqual(['BOARD', 'LAMINATED']);
    await choose('生产分类', 'LAMINATED');
    await choose('垫子类型', 'FLAT');
    await choose('正面颜色', 'P');
    await choose('反面颜色', 'G');
    await choose('正面压花', 'BK');
    await choose('反面压花', 'FH');
    await save();
    expect(api.save).toHaveBeenCalledWith(
      expect.objectContaining({
        productStage: 'LAMINATED',
        matType: 'FLAT',
        colorCode: '',
        frontColor: 'P',
        backColor: 'G',
        textureFront: 'BK',
        textureBack: 'FH',
        color: '旧颜色原文',
        expectedVersion: 1,
      }),
    );
    const detail = document.querySelector(
      '.product-detail-drawer',
    )!.textContent!;
    for (const text of [
      '生产分类：贴合片材',
      '正面颜色：紫色',
      '反面颜色：灰色',
      '正面压花：贝壳纹',
      '反面压花：防滑纹',
      '垫子类型：平铺垫',
    ])
      expect(detail).toContain(text);
  });

  it('保留字典外的已存属性，并允许明确清空而不丢失旧颜色原文', async () => {
    await mount({
      ...product,
      productStage: 'BOARD',
      colorCode: 'OLD',
      colorCodeLabel: '旧单色',
      textureFront: 'OLD-TEXTURE',
      textureFrontLabel: '旧纹路',
    });
    const color = document.querySelector<HTMLSelectElement>(
      'select[aria-label="单色"]',
    )!;
    expect(color.value).toBe('OLD');
    expect(color.textContent).toContain('旧单色');
    await choose('生产分类', '');
    await choose('单色', '');
    await choose('正面压花', '');
    await save();
    expect(api.save).toHaveBeenCalledWith(
      expect.objectContaining({
        productStage: '',
        colorCode: '',
        textureFront: '',
        color: '旧颜色原文',
      }),
    );
    expect(
      document.querySelector('.product-detail-drawer')!.textContent,
    ).toContain('颜色：旧颜色原文');
    expect(
      document.querySelector('.product-detail-drawer')!.textContent,
    ).not.toContain('旧纹路');
  });
});
