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
    InputNumber: defineComponent({
      props: ['value'],
      emits: ['update:value'],
      setup:
        (props, { attrs, emit }) =>
        () =>
          h('input', {
            ...attrs,
            value: props.value ?? '',
            onInput: (event: Event) => {
              const text = (event.target as HTMLInputElement).value;
              emit('update:value', text === '' ? null : Number(text));
            },
          }),
    }),
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
              ...props.options.map(
                (item: { disabled?: boolean; label: string; value: string }) =>
                  h(
                    'option',
                    { value: item.value, disabled: item.disabled },
                    item.label,
                  ),
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
    { value: '502C', label: '502 C' },
  ],
  textures: [
    { value: 'NONE', label: '无纹路' },
    { value: 'BK', label: '贝壳纹' },
    { value: 'FH', label: '防滑纹' },
    { value: 'FH09', label: '贝壳纹' },
  ],
  matTypes: [{ value: 'FLAT', label: '平铺垫' }],
  patterns: [{ value: 'FLOWER', label: '花朵' }],
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
async function fill(label: string, value: string) {
  const input = document.querySelector<HTMLInputElement>(
    `input[aria-label="${label}"]`,
  )!;
  expect(input).toBeTruthy();
  input.value = value;
  input.dispatchEvent(new Event('input', { bubbles: true }));
  await flush();
}
async function save() {
  [...document.querySelectorAll('button')]
    .find((button) => button.textContent?.trim() === '保存产品档案')!
    .click();
  await flush();
}

describe('产品档案编辑与查看', () => {
  it('选择激光雕刻时可以将图案与生产版本留空并保存', async () => {
    await mount();
    await choose('雕刻方式', 'LASER');
    await save();
    expect(api.save).toHaveBeenCalledWith(
      expect.objectContaining({
        patternMode: 'LASER',
        patternCode: '',
        patternVersion: '',
      }),
    );
  });

  it('保存同一档案的独立长宽厚、明确无纹路与激光生产版本，并在详情中读回', async () => {
    await mount();
    for (const [label, value] of [
      ['成品长度（mm）', '1830.5'],
      ['成品宽度（mm）', '610'],
      ['成品厚度（mm）', '6'],
    ]) {
      const input = document.querySelector<HTMLInputElement>(
        `input[aria-label="${label}"]`,
      )!;
      input.value = value!;
      input.dispatchEvent(new Event('input', { bubbles: true }));
      await flush();
    }
    await choose('颜色方式', 'SINGLE');
    await choose('色号', '502C');
    await choose('正面压花', 'NONE');
    await choose('反面压花', 'NONE');
    await choose('雕刻方式', 'LASER');
    await fill('激光图案', ' 客户山水-A ');
    await fill('图案生产版本', '生产版B');
    await save();
    expect(api.save).toHaveBeenCalledWith(
      expect.objectContaining({
        lengthMm: 1830.5,
        widthMm: 610,
        finishedThicknessMm: 6,
        colorMode: 'SINGLE',
        colorCode: '502C',
        frontColor: '502C',
        backColor: '502C',
        textureFront: 'NONE',
        textureBack: 'NONE',
        patternMode: 'LASER',
        patternCode: '客户山水-A',
        patternVersion: '生产版B',
      }),
    );
    expect(document.body.textContent).toContain('1830.5 × 610 × 6 mm');
    expect(document.body.textContent).toContain('颜色：502 C');
    expect(document.body.textContent).toContain(
      '激光雕刻 · 客户山水-A · 生产版B',
    );
  });
  it('旧记录默认待核实，不能按颜色原文默认单色；可保存未核实草稿', async () => {
    await mount({ ...product, frontColor: 'P', backColor: 'P' });
    expect(
      document.querySelector<HTMLSelectElement>('select[aria-label="颜色方式"]')
        ?.value,
    ).toBe('UNKNOWN');
    expect(document.querySelector('input[aria-label="色号"]')).toBeNull();
    await save();
    expect(api.save.mock.calls[0]![0]).toMatchObject({
      colorMode: 'UNKNOWN',
      frontColor: 'P',
      backColor: 'P',
    });
    expect(api.save.mock.calls[0]![0]).not.toHaveProperty('constructionType');
  });
  it('重新打开无规则无结构草稿，补齐颜色和厚度即可预览，不回传旧制造层字段', async () => {
    await mount({
      ...product,
      constructionType: 'UNKNOWN',
      frontColor: 'P',
      backColor: 'G',
      frontThicknessMm: null,
      backThicknessMm: null,
    });
    await choose('颜色方式', 'DUAL');
    const thickness = document.querySelector<HTMLInputElement>(
      'input[aria-label="成品厚度（mm）"]',
    )!;
    thickness.value = '6';
    thickness.dispatchEvent(new Event('input', { bubbles: true }));
    await flush();
    expect(document.body.textContent).toContain(
      '成品名义层厚：正面 3 mm + 反面 3 mm',
    );
    expect(document.body.textContent).toContain(
      '开片厚度：正面 3.2 mm + 反面 3.2 mm',
    );
    await save();
    for (const field of [
      'constructionType',
      'frontThicknessMm',
      'backThicknessMm',
      'layerRule',
    ])
      expect(api.save.mock.calls[0]![0]).not.toHaveProperty(field);
  });
  it('明确中间物料不套成品层厚开片规则，保留未知结构payload', async () => {
    await mount({
      ...product,
      productStage: 'BOARD',
      constructionType: 'UNKNOWN',
      colorMode: 'DUAL',
      frontColor: 'P',
      backColor: 'G',
      finishedThicknessMm: 6,
    });
    expect(document.body.textContent).not.toContain('开片厚度：');
    expect(document.body.textContent).toContain('不自动套用成品开片规则');
    expect(document.body.textContent).toContain('成品名义层厚：制造结构待核实');
    await save();
    expect(api.save.mock.calls[0]![0]).toMatchObject({
      productStage: 'BOARD',
      constructionType: 'UNKNOWN',
      finishedThicknessMm: 6,
      frontThicknessMm: null,
      backThicknessMm: null,
    });
  });
  it('已有自动成品规则改成中间物料时解释并阻止保存', async () => {
    await mount({
      ...product,
      productStage: 'FINISHED',
      layerRule: 'COLOR_DERIVED_V1',
      colorMode: 'SINGLE',
      colorCode: 'P',
      constructionType: 'SINGLE_LAYER',
      finishedThicknessMm: 6,
      frontThicknessMm: 6,
    });
    await choose('生产分类', 'BOARD');
    expect(document.body.textContent).toContain(
      '中间物料需使用对应的独立物料档案',
    );
    expect(document.body.textContent).not.toContain('开片厚度：');
    await save();
    expect(api.save).not.toHaveBeenCalled();
  });
  it('编辑历史同色双层的正反面层厚，保留双层结构', async () => {
    await mount({
      ...product,
      colorMode: 'SINGLE',
      colorCode: 'P',
      frontColor: 'P',
      backColor: 'P',
      constructionType: 'DOUBLE_LAYER',
      finishedThicknessMm: 6,
      frontThicknessMm: 2,
      backThicknessMm: 4,
    });
    expect(document.querySelector('select[aria-label="正面色号"]')).toBeNull();
    expect(document.querySelector('select[aria-label="反面色号"]')).toBeNull();
    expect(document.querySelector('select[aria-label="制造结构"]')).toBeNull();
    for (const [label, value] of [
      ['成品厚度（mm）', '6'],
      ['正面层厚度（mm）', '2'],
      ['反面层厚度（mm）', '4'],
    ]) {
      const input = document.querySelector<HTMLInputElement>(
        `input[aria-label="${label}"]`,
      )!;
      expect(input.disabled).toBe(false);
      expect(input.value).toBe(value);
    }
    await fill('正面层厚度（mm）', '2.25');
    await fill('反面层厚度（mm）', '3.75');
    await save();
    expect(api.save.mock.calls[0]![0]).toMatchObject({
      id: product.id,
      expectedVersion: product.version,
      colorMode: 'SINGLE',
      colorCode: 'P',
      frontColor: 'P',
      backColor: 'P',
      constructionType: 'DOUBLE_LAYER',
      finishedThicknessMm: 6,
      frontThicknessMm: 2.25,
      backThicknessMm: 3.75,
    });
    expect(document.body.textContent).toContain('双层贴合');
  });
  it('双层厚度校验通过后才提交修改后的总厚和两面层厚', async () => {
    await mount({
      ...product,
      colorMode: 'DUAL',
      frontColor: 'P',
      backColor: 'P',
      constructionType: 'DOUBLE_LAYER',
      finishedThicknessMm: 6,
      frontThicknessMm: 2,
      backThicknessMm: 3,
    });
    await save();
    expect(api.save).not.toHaveBeenCalled();
    expect(document.body.textContent).toContain('必须不同');
    await choose('反面色号', 'G');
    await flush();
    await save();
    expect(api.save).not.toHaveBeenCalled();
    expect(document.body.textContent).toContain('之和必须等于成品厚度');
    await fill('成品厚度（mm）', '7');
    await fill('正面层厚度（mm）', '3');
    await fill('反面层厚度（mm）', '');
    await save();
    expect(api.save).not.toHaveBeenCalled();
    expect(document.body.textContent).toContain('大于 0 的正面层和反面层厚度');
    await fill('反面层厚度（mm）', '4');
    await save();
    expect(api.save).toHaveBeenCalledWith(
      expect.objectContaining({
        constructionType: 'DOUBLE_LAYER',
        finishedThicknessMm: 7,
        frontThicknessMm: 3,
        backThicknessMm: 4,
      }),
    );
  });
  it('历史单层厚度随成品厚度修改并保存', async () => {
    await mount({
      ...product,
      constructionType: 'SINGLE_LAYER',
      finishedThicknessMm: 6,
      frontThicknessMm: 6,
    });
    await fill('成品厚度（mm）', '7');
    expect(document.body.textContent).toContain('成品名义层厚：单层 7 mm');
    await save();
    expect(api.save).toHaveBeenCalledWith(
      expect.objectContaining({
        constructionType: 'SINGLE_LAYER',
        finishedThicknessMm: 7,
        frontThicknessMm: 7,
        backThicknessMm: null,
      }),
    );
  });
  it('匹配其他 SKU 且层厚不一致时提示冲突并保留填写值', async () => {
    const source: Product = {
      ...product,
      constructionType: 'DOUBLE_LAYER',
      finishedThicknessMm: 6,
      frontThicknessMm: 3,
      backThicknessMm: 3,
    };
    api.save.mockResolvedValueOnce({
      ...source,
      id: 'p2',
      code: 'SKU-2',
      finishedThicknessMm: 8,
      frontThicknessMm: 4,
      backThicknessMm: 4,
    });
    await mount(source);
    await fill('成品厚度（mm）', '8');
    await fill('反面层厚度（mm）', '5');
    await save();
    expect(document.body.textContent).toContain(
      '已匹配 SKU SKU-2，其正反面层厚与填写值不同',
    );
    expect(document.querySelector('.product-detail-drawer')).toBeNull();
    expect(
      document.querySelector<HTMLInputElement>(
        'input[aria-label="反面层厚度（mm）"]',
      )?.value,
    ).toBe('5');
  });
  it('带新规则的产品按颜色和成品厚度只读计算，保存不发送手填名义层字段', async () => {
    await mount({
      ...product,
      layerRule: 'COLOR_DERIVED_V1',
      colorMode: 'SINGLE',
      colorCode: 'P',
      frontColor: 'P',
      backColor: 'P',
      constructionType: 'SINGLE_LAYER',
      finishedThicknessMm: 6,
      frontThicknessMm: 6,
      backThicknessMm: null,
    });
    expect(document.body.textContent).toContain('开片厚度：单层 6.2 mm');
    expect(
      document.querySelector('input[aria-label="正面层厚度（mm）"]'),
    ).toBeNull();
    await choose('颜色方式', 'DUAL');
    await choose('反面色号', 'G');
    expect(
      document.querySelector('input[aria-label="正面层厚度（mm）"]'),
    ).toBeNull();
    expect(
      document.querySelector('input[aria-label="反面层厚度（mm）"]'),
    ).toBeNull();
    expect(document.body.textContent).toContain(
      '成品名义层厚：正面 3 mm + 反面 3 mm',
    );
    expect(document.body.textContent).toContain(
      '开片厚度：正面 3.2 mm + 反面 3.2 mm',
    );
    const thickness = document.querySelector<HTMLInputElement>(
      'input[aria-label="成品厚度（mm）"]',
    )!;
    thickness.value = '8';
    thickness.dispatchEvent(new Event('input', { bubbles: true }));
    await flush();
    expect(document.body.textContent).toContain(
      '开片厚度：正面 4.2 mm + 反面 4.2 mm',
    );
    await save();
    const payload = api.save.mock.calls[0]![0];
    expect(payload).toMatchObject({
      colorMode: 'DUAL',
      finishedThicknessMm: 8,
      frontColor: 'P',
      backColor: 'G',
    });
    for (const field of [
      'constructionType',
      'frontThicknessMm',
      'backThicknessMm',
      'layerRule',
    ])
      expect(payload).not.toHaveProperty(field);
  });
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
    await choose('颜色方式', 'DUAL');
    await choose('正面色号', 'P');
    await choose('反面色号', 'G');
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

  it('在正反面压花选项中区分同名编码，并按选择保存对应编码', async () => {
    await mount();
    for (const field of ['正面压花', '反面压花']) {
      const select = document.querySelector<HTMLSelectElement>(
        `select[aria-label="${field}"]`,
      )!;
      expect(select.querySelector('option[value="BK"]')?.textContent).toBe(
        '贝壳纹 · BK',
      );
      expect(select.querySelector('option[value="FH09"]')?.textContent).toBe(
        '贝壳纹 · FH09',
      );
    }
    await choose('正面压花', 'FH09');
    await choose('反面压花', 'BK');
    await save();
    expect(api.save).toHaveBeenCalledWith(
      expect.objectContaining({ textureFront: 'FH09', textureBack: 'BK' }),
    );
  });

  it('保留字典外的已存属性，并允许明确清空而不丢失旧颜色原文', async () => {
    const historicPattern = '客户定制老图案名称'.repeat(5);
    await mount({
      ...product,
      productStage: 'BOARD',
      colorMode: 'SINGLE',
      colorCode: 'OLD',
      colorCodeLabel: '旧单色',
      patternMode: 'LASER',
      patternCode: historicPattern,
      patternVersion: 'V1',
      textureFront: 'OLD-TEXTURE',
      textureFrontLabel: '旧纹路',
    });
    const color = document.querySelector<HTMLSelectElement>(
      'select[aria-label="色号"]',
    )!;
    expect(color.value).toBe('OLD');
    expect(color.selectedOptions[0]?.textContent).toBe('旧单色');
    expect(color.selectedOptions[0]?.disabled).toBe(true);
    const pattern = document.querySelector<HTMLInputElement>(
      'input[aria-label="激光图案"]',
    )!;
    expect(pattern.maxLength).toBe(32);
    expect(pattern.value).toBe(historicPattern);
    await choose('生产分类', '');
    await choose('色号', '');
    await choose('颜色方式', 'UNKNOWN');
    await choose('正面压花', '');
    await save();
    expect(api.save).toHaveBeenCalledWith(
      expect.objectContaining({
        productStage: '',
        colorCode: '',
        patternCode: historicPattern,
        textureFront: '',
        color: '旧颜色原文',
      }),
    );
    expect(
      document.querySelector('.product-detail-drawer')!.textContent,
    ).toContain('颜色原文');
    expect(
      document.querySelector('.product-detail-drawer')!.textContent,
    ).not.toContain('旧纹路');
  });
});
