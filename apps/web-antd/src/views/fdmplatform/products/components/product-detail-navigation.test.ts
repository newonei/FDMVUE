/* eslint-disable vue/one-component-per-file -- Minimal Ant Design adapters exercise the actual product components with a real router. */
import type { PropType, VNode } from 'vue';

import type { ProductActivityView } from '#/api/fdmplatform/product-activity';
import type { Product, ProductCategoryView } from '#/api/fdmplatform/products';

import { createApp, defineComponent, h, KeepAlive, nextTick } from 'vue';
import { createMemoryHistory, createRouter, RouterView } from 'vue-router';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import ProductCenter from './ProductCenter.vue';

const mocks = vi.hoisted(() => ({
  getProduct: vi.fn(),
  getProducts: vi.fn(),
  getProductActivity: vi.fn(),
  getStockPage: vi.fn(),
  hasAccessByCodes: vi.fn(),
  getProductCategories: vi.fn(
    async (_params: {
      productStage?: string;
    }): Promise<ProductCategoryView> => ({
      total: 0,
      items: [],
      categories: [],
    }),
  ),
}));
vi.mock('@vben/icons', () => ({ IconifyIcon: () => h('span') }));
vi.mock('@vben/access', () => ({
  useAccess: () => ({ hasAccessByCodes: mocks.hasAccessByCodes }),
}));
vi.mock('#/api/fdmplatform', () => ({
  newIdempotencyKey: () => 'test-product-operation',
}));
vi.mock('#/api/fdmplatform/products', () => ({
  getProduct: mocks.getProduct,
  getProducts: mocks.getProducts,
  getProductCategories: mocks.getProductCategories,
  getProductAttributeOptions: vi.fn(async () => ({
    stages: [{ value: 'BOARD', label: '板材', group: '半成品' }],
    colors: [],
    textures: [],
    matTypes: [],
  })),
  getProductPrices: vi.fn(),
  deleteProduct: vi.fn(),
  saveProductPrice: vi.fn(),
}));
vi.mock('#/api/fdmplatform/product-activity', () => ({
  getProductActivity: mocks.getProductActivity,
}));
vi.mock('#/api/fdmplatform/stock', () => ({
  getStockPage: mocks.getStockPage,
}));
vi.mock('#/api/fdmgongchang/stage-stock', () => ({
  getCenterStockPage: vi.fn(async () => ({ list: [], total: 0 })),
}));
vi.mock('@vben/common-ui', () => ({
  Page: defineComponent({
    setup(_, ctx) {
      return () => h('main', ctx.slots.default?.());
    },
  }),
}));
vi.mock('./ProductEditor.vue', () => ({
  default: defineComponent({
    props: {
      open: Boolean,
      product: { type: Object as PropType<Product>, default: undefined },
    },
    emits: ['close', 'saved'],
    setup(props, ctx) {
      return () =>
        props.open
          ? h(
              'section',
              { 'data-product-editor': props.product?.id ?? 'new' },
              [
                h('span', props.product?.name ?? '新建产品'),
                h(
                  'button',
                  {
                    'data-editor-close': true,
                    onClick: () => ctx.emit('close'),
                  },
                  '关闭维护',
                ),
                h(
                  'button',
                  {
                    'data-editor-save': true,
                    onClick: () =>
                      ctx.emit('saved', {
                        ...props.product,
                        version: (props.product?.version ?? 0) + 1,
                        name: '更新后产品',
                      }),
                  },
                  '保存维护',
                ),
                h(
                  'button',
                  {
                    onClick: () =>
                      ctx.emit('saved', {
                        ...props.product,
                        finishedThicknessMm: 5,
                      }),
                  },
                  '保存厚度',
                ),
              ],
            )
          : null;
    },
  }),
}));
vi.mock('./ProductFiles.vue', () => ({
  default: defineComponent({ render: () => h('div', '标准资料') }),
}));
vi.mock('./ProductPicker.vue', () => ({
  default: defineComponent({ render: () => null }),
}));
vi.mock('ant-design-vue', () => {
  const block = defineComponent({
    setup(_, ctx) {
      return () =>
        h('div', ctx.attrs, [ctx.slots.extra?.(), ctx.slots.default?.()]);
    },
  });
  const button = defineComponent({
    props: { disabled: Boolean, loading: Boolean },
    setup(props, ctx) {
      return () =>
        h(
          'button',
          { ...ctx.attrs, disabled: props.disabled || props.loading },
          ctx.slots.default?.(),
        );
    },
  });
  const drawer = defineComponent({
    props: { open: Boolean },
    emits: ['close'],
    setup(props, ctx) {
      return () =>
        props.open
          ? h('section', ctx.attrs, [
              h('header', { 'data-detail-title': true }, ctx.slots.title?.()),
              ctx.slots.extra?.(),
              h(
                'button',
                { 'data-drawer-close': true, onClick: () => ctx.emit('close') },
                '关闭详情',
              ),
              ctx.slots.default?.(),
            ])
          : null;
    },
  });
  const table = defineComponent({
    props: {
      dataSource: {
        type: Array as PropType<Record<string, unknown>[]>,
        default: () => [],
      },
      expandedRowKeys: {
        type: Array as PropType<unknown[]>,
        default: () => [],
      },
      columns: {
        type: Array as PropType<
          {
            dataIndex?: string;
            key?: string;
            sorter?: boolean;
            sortOrder?: 'ascend' | 'descend' | null;
            title?: string;
          }[]
        >,
        default: () => [],
      },
      pagination: {
        type: Object as PropType<{ current: number; pageSize: number }>,
        default: () => ({ current: 1, pageSize: 10 }),
      },
    },
    emits: ['change'],
    setup(props, ctx) {
      return () =>
        h('div', ctx.attrs, [
          h(
            'header',
            props.columns.map((column) =>
              column.sorter
                ? h(
                    'button',
                    {
                      'data-sort-column': column.key,
                      'data-sort-order': column.sortOrder,
                      onClick: () => {
                        const nextOrder =
                          column.sortOrder === 'descend' ? 'ascend' : 'descend';
                        ctx.emit(
                          'change',
                          props.pagination,
                          {},
                          {
                            columnKey: column.key,
                            order:
                              column.sortOrder === 'ascend' ? null : nextOrder,
                          },
                          { action: 'sort' },
                        );
                      },
                    },
                    column.title,
                  )
                : h('span', column.title),
            ),
          ),
          ...props.dataSource.flatMap((record) => [
            h(
              'div',
              { 'data-table-row': record.id },
              props.columns.map((column) =>
                h(
                  'div',
                  { 'data-table-column': column.key },
                  ctx.slots.bodyCell?.({
                    record,
                    column,
                    text: column.dataIndex
                      ? record[column.dataIndex]
                      : undefined,
                  }),
                ),
              ),
            ),
            props.expandedRowKeys.includes(record.id)
              ? ctx.slots.expandedRowRender?.({ record })
              : null,
          ]),
          h(
            'button',
            {
              'data-next-page': true,
              onClick: () =>
                ctx.emit(
                  'change',
                  {
                    ...props.pagination,
                    current: props.pagination.current + 1,
                  },
                  {},
                  {},
                  { action: 'paginate' },
                ),
            },
            '下一页',
          ),
        ]);
    },
  });
  const input = defineComponent({
    props: {
      value: { type: [String, Number], default: undefined },
      options: {
        type: Array as PropType<{ label: string; value: string }[]>,
        default: undefined,
      },
    },
    emits: ['update:value'],
    setup(props, ctx) {
      return () =>
        props.options
          ? h(
              'select',
              {
                ...ctx.attrs,
                value: props.value,
                onChange: (event: Event) =>
                  ctx.emit(
                    'update:value',
                    (event.target as HTMLSelectElement).value,
                  ),
              },
              props.options.map((option) =>
                h('option', { value: option.value }, option.label),
              ),
            )
          : h('input', {
              ...ctx.attrs,
              value: props.value,
              onInput: (event: Event) =>
                ctx.emit(
                  'update:value',
                  (event.target as HTMLInputElement).value,
                ),
            });
    },
  });
  return {
    Alert: defineComponent({
      props: { message: { type: String, default: '' } },
      setup(props) {
        return () => h('p', props.message);
      },
    }),
    Button: button,
    Card: block,
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
              value: props.value?.at(-1) ?? '',
              onChange: (event: Event) => {
                const value = (event.target as HTMLSelectElement).value;
                if (
                  props.changeOnSelect &&
                  props.options.some(
                    (item: { value: string }) => item.value === value,
                  )
                ) {
                  emit('change', [value]);
                  return;
                }
                const group = props.options.find(
                  (item: { children: Array<{ value: string }> }) =>
                    item.children.some((leaf) => leaf.value === value),
                );
                emit('change', group ? [group.value, value] : undefined);
              },
            },
            [
              h('option', { value: '' }, '全部生产分类'),
              ...props.options.flatMap(
                (group: {
                  children: Array<{ label: string; value: string }>;
                  label: string;
                  value: string;
                }) => [
                  ...(props.changeOnSelect
                    ? [h('option', { value: group.value }, group.label)]
                    : []),
                  ...group.children.map((item) =>
                    h('option', { value: item.value }, item.label),
                  ),
                ],
              ),
            ],
          ),
    }),
    Checkbox: input,
    Descriptions: Object.assign(block, { Item: block }),
    Drawer: drawer,
    Dropdown: defineComponent({
      setup(_, { slots }) {
        return () => h('div', [slots.default?.(), slots.overlay?.()]);
      },
    }),
    Empty: block,
    Form: Object.assign(block, { Item: block }),
    Input: input,
    InputNumber: input,
    Menu: Object.assign(block, { Divider: block, Item: button }),
    Modal: defineComponent({
      props: { open: Boolean },
      setup(props, ctx) {
        return () => (props.open ? h('div', ctx.slots.default?.()) : null);
      },
    }),
    Pagination: block,
    Radio: Object.assign(block, { Group: block, Button: block }),
    Select: input,
    Space: block,
    Spin: block,
    Table: table,
    Tabs: Object.assign(block, { TabPane: block }),
    TabPane: block,
    Tag: block,
    message: { success: vi.fn(), info: vi.fn() },
  };
});

function product(id: string): Product {
  return {
    id,
    version: 1,
    companyId: 0,
    name: `产品${id}`,
    code: `SKU-${id}`,
    unit: '张',
    active: true,
    missingFields: [],
    selectable: true,
    canManage: true,
    canManagePrice: true,
  };
}
function activity(id: string): ProductActivityView {
  return {
    productId: id,
    list: [
      {
        id: `record-${id}`,
        type: 'CONTRACT',
        documentId: `contract-${id}`,
        contractId: `contract-${id}`,
        name: `关联单据${id}`,
        quantities: [{ unit: '张', quantity: '12' }],
        amounts: [],
        lines: [],
        targetType: 'CONTRACT',
      },
    ],
    total: 1,
    counts: { CONTRACT: 1 },
    summary: {
      quantities: [
        { unit: '张', contractQuantity: '12' },
        { unit: '箱', contractQuantity: '3' },
      ],
    },
    inventoryPools: [],
    pageNo: 1,
    pageSize: 20,
    notes: [],
  };
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((finish) => {
    resolve = finish;
  });
  return { promise, resolve };
}
const dispose: (() => void)[] = [];
beforeEach(() => {
  vi.clearAllMocks();
  mocks.hasAccessByCodes.mockReturnValue(false);
  mocks.getStockPage.mockResolvedValue({ list: [], total: 0 });
  mocks.getProductCategories.mockResolvedValue({
    total: 0,
    items: [],
    categories: [],
  });
  mocks.getProduct.mockImplementation(async (id: string) => product(id));
  mocks.getProducts.mockResolvedValue({
    list: [product('A'), product('B')],
    total: 2,
  });
  mocks.getProductActivity.mockImplementation(async (id: string) =>
    activity(id),
  );
});
afterEach(() => {
  for (const close of dispose.splice(0)) close();
});
async function mountCenter(
  initial = '/fdmproducts/catalog',
  fullPathKey = false,
) {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      {
        path: '/fdmproducts/catalog',
        component: ProductCenter,
        props: { mode: 'catalog' },
      },
      {
        path: '/fdmwaimao/platform-contracts',
        component: defineComponent({ render: () => h('p', '合同页面') }),
      },
    ],
  });
  await router.push(initial);
  const host = document.createElement('div');
  document.body.append(host);
  const app = createApp({
    render: () =>
      h(
        RouterView,
        {},
        {
          default: ({
            Component,
            route,
          }: {
            Component: VNode;
            route: { fullPath: string; path: string };
          }) =>
            h(KeepAlive, {}, () =>
              h(Component, { key: fullPathKey ? route.fullPath : route.path }),
            ),
        },
      ),
  });
  app.use(router);
  app.mount(host);
  dispose.push(() => {
    app.unmount();
    host.remove();
  });
  await nextTick();
  return { host, router };
}
function detail(host: HTMLElement) {
  return host.querySelector<HTMLElement>('.product-detail-drawer');
}
function clickText(host: ParentNode, text: string) {
  const button = [...host.querySelectorAll<HTMLButtonElement>('button')].find(
    (entry) => entry.textContent?.trim() === text,
  );
  expect(button).toBeTruthy();
  button!.click();
}

describe('actual product detail and edit route integration', () => {
  it('keeps expanded fields on demand and makes destructive actions available only for manageable products', async () => {
    mocks.getProducts.mockResolvedValue({
      list: [
        { ...product('A'), model: '对照型号', printing: '定制说明样例' },
        { ...product('B'), canManage: false },
      ],
      total: 2,
    });
    const { host } = await mountCenter();
    await vi.waitFor(() =>
      expect(host.querySelectorAll('.product-detail-link')).toHaveLength(2),
    );
    const row = host.querySelector('[data-table-row="A"]')!;
    expect(row.querySelector('[data-table-column="model"]')?.textContent).toBe(
      '对照型号',
    );
    expect(row.textContent).not.toContain('定制说明样例');
    const requestCount = mocks.getProducts.mock.calls.length;
    clickText(host, '展开扩展列');
    await nextTick();
    expect(row.textContent).toContain('对照型号');
    expect(row.textContent).toContain('定制说明样例');
    expect(mocks.getProducts).toHaveBeenCalledTimes(requestCount);
    const readOnly = host.querySelector('[data-table-row="B"]')!;
    expect(readOnly.textContent).toContain('标准资料');
    expect(readOnly.textContent).not.toContain('删除档案');
    clickText(row, '删除档案');
    await nextTick();
    expect(host.textContent).toContain('产品A');
    expect(host.textContent).toContain('删除后');
  });

  it('expands maintained product fields below one SKU without opening the full archive', async () => {
    mocks.getProducts.mockResolvedValue({
      list: [
        {
          ...product('A'),
          name: '同名产品',
          model: '板材型号 A',
          specification: '型号：板材型号 A\n规格：183 × 61 × 0.6 cm',
          lengthMm: 1830,
          widthMm: 610,
          finishedThicknessMm: 6,
          colorMode: 'DUAL',
          frontColorLabel: '7528 U 灰',
          backColorLabel: '2312 U 蓝',
          textureFront: 'NONE',
          patternMode: 'LASER',
          patternCode: 'PAT-01',
          patternVersion: 'V2',
          packaging: '卷装',
        },
        { ...product('B'), name: '同名产品', model: '板材型号 B' },
      ],
      total: 2,
    });
    mocks.hasAccessByCodes.mockImplementation((codes: string[]) =>
      codes.includes('fdmplatform:inventory:query'),
    );
    const { host, router } = await mountCenter();
    await vi.waitFor(() =>
      expect(host.querySelectorAll('[data-table-row]')).toHaveLength(2),
    );
    const first = host.querySelector('[data-table-row="A"]')!;
    const second = host.querySelector('[data-table-row="B"]')!;
    clickText(first, '详情');
    await nextTick();
    const details = host.querySelector('.catalog-details')!;
    expect(first.querySelector('[aria-expanded="true"]')).not.toBeNull();
    expect(details.textContent).toContain('1830 × 610 × 6 mm');
    expect(details.textContent).toContain('183 × 61 × 0.6 cm');
    expect(details.textContent).toContain('7528 U 灰');
    expect(details.textContent).toContain('2312 U 蓝');
    expect(details.textContent).toContain('无纹路');
    expect(details.textContent).toContain('激光雕刻 · PAT-01 · V2');
    expect(details.textContent).toContain('卷装');
    expect(router.currentRoute.value.query.productId).toBeUndefined();
    expect(mocks.getProduct).not.toHaveBeenCalled();
    expect(mocks.getStockPage).not.toHaveBeenCalled();
    clickText(details, '库存');
    await vi.waitFor(() =>
      expect(mocks.getStockPage).toHaveBeenCalledWith({
        skuId: 'A',
        pageNo: 1,
        pageSize: 10,
      }),
    );
    clickText(second, '详情');
    await nextTick();
    expect(host.querySelectorAll('.catalog-details')).toHaveLength(1);
    expect(host.querySelector('.catalog-details')?.textContent).toContain(
      '板材型号 B',
    );
    expect(first.querySelector('[aria-expanded="true"]')).toBeNull();
    clickText(second, '收起');
    await nextTick();
    expect(host.querySelector('.catalog-details')).toBeNull();
  });

  it('filters by each catalog level and preserves the selected group when navigating to a product', async () => {
    mocks.getProductCategories.mockResolvedValue({
      total: 11,
      items: [
        { categoryId: 'regular', count: 6 },
        { categoryId: 'legacy', count: 3 },
        { categoryId: '', count: 1 },
        { categoryId: 'missing-id', count: 1 },
      ],
      categories: [
        {
          id: 'regular',
          name: '常规款',
          sort: 10,
          version: 0,
          active: true,
          categoryGroup: 'SELF_PRODUCED',
        },
        {
          id: 'folding',
          name: '折叠款',
          sort: 20,
          version: 0,
          active: true,
          categoryGroup: 'SELF_PRODUCED',
        },
        { id: 'legacy', name: '旧分类', sort: 30, version: 0, active: true },
      ],
    });
    const { host, router } = await mountCenter(
      '/fdmproducts/catalog?catalogCategoryGroup=SELF_PRODUCED&catalogPage=2',
      true,
    );
    await vi.waitFor(() => {
      expect(mocks.getProducts).toHaveBeenLastCalledWith(
        expect.objectContaining({
          categoryGroup: 'SELF_PRODUCED',
          categoryId: undefined,
          pageNo: 2,
        }),
      );
      expect(
        [...host.querySelectorAll('.group-node')].map((button) =>
          button.textContent?.trim(),
        ),
      ).toEqual(['自主生产6', '外采产品0', '原材料0', '设备耗材0', '待归类5']);
    });
    const categoryRequests = mocks.getProductCategories.mock.calls.length;
    clickText(host, '折叠款0');
    await vi.waitFor(() =>
      expect(mocks.getProducts).toHaveBeenLastCalledWith(
        expect.objectContaining({
          categoryGroup: undefined,
          categoryId: 'folding',
          pageNo: 1,
        }),
      ),
    );
    clickText(host, '待归类5');
    await vi.waitFor(() =>
      expect(mocks.getProducts).toHaveBeenLastCalledWith(
        expect.objectContaining({
          categoryGroup: 'UNASSIGNED',
          categoryId: undefined,
          pageNo: 1,
        }),
      ),
    );
    expect(mocks.getProductCategories).toHaveBeenCalledTimes(categoryRequests);
    expect(host.querySelector('.category-list')?.textContent).toContain(
      '旧分类',
    );
    expect(host.querySelector('.category-list')?.textContent).toContain(
      '未分类',
    );
    host.querySelector<HTMLButtonElement>('.product-detail-link')!.click();
    await vi.waitFor(() =>
      expect(router.currentRoute.value.query.catalogCategoryGroup).toBe(
        'UNASSIGNED',
      ),
    );
    await vi.waitFor(() =>
      expect(detail(host)?.textContent).toContain('产品A'),
    );
    detail(host)!
      .querySelector<HTMLButtonElement>('[data-drawer-close]')!
      .click();
    await vi.waitFor(() => expect(detail(host)).toBeNull());
    expect(host.querySelector('.catalog-list-title h2')?.textContent).toBe(
      '待归类',
    );

    await router.push('/fdmwaimao/platform-contracts');
    const callsBeforeReturn = mocks.getProductCategories.mock.calls.length;
    mocks.getProductCategories.mockResolvedValue({
      total: 2,
      items: [{ categoryId: 'legacy', count: 2 }],
      categories: [
        {
          id: 'legacy',
          name: '旧分类',
          sort: 30,
          version: 1,
          active: true,
          categoryGroup: 'RAW_MATERIAL',
        },
      ],
    });
    router.back();
    await vi.waitFor(() => {
      expect(mocks.getProductCategories.mock.calls.length).toBeGreaterThan(
        callsBeforeReturn,
      );
      expect(host.querySelector('.category-list')?.textContent).toContain(
        '原材料2',
      );
    });

    clickText(host, '重置');
    await vi.waitFor(() =>
      expect(mocks.getProducts).toHaveBeenLastCalledWith(
        expect.objectContaining({
          categoryGroup: undefined,
          categoryId: undefined,
          pageNo: 1,
        }),
      ),
    );
  });

  it('shows product codes in a separate sortable column and requests sorting before pagination', async () => {
    const { host, router } = await mountCenter(
      '/fdmproducts/catalog?catalogPage=3&catalogKeyword=MAT',
    );
    await vi.waitFor(() =>
      expect(host.querySelectorAll('.product-detail-link')).toHaveLength(2),
    );
    const row = host.querySelector('[data-table-row="A"]')!;
    expect(
      row.querySelector('[data-table-column="product"]')?.textContent,
    ).not.toContain(product('A').code);
    expect(row.querySelector('[data-table-column="code"]')?.textContent).toBe(
      product('A').code,
    );
    const sort = host.querySelector<HTMLButtonElement>(
      '[data-sort-column="code"]',
    )!;
    expect(sort.textContent).toBe('产品编号');
    sort.click();
    await vi.waitFor(() =>
      expect(mocks.getProducts).toHaveBeenLastCalledWith(
        expect.objectContaining({
          codeOrder: 'desc',
          pageNo: 1,
          keyword: 'MAT',
        }),
      ),
    );
    expect(sort.dataset.sortOrder).toBe('descend');
    host.querySelector<HTMLButtonElement>('[data-next-page]')!.click();
    await vi.waitFor(() =>
      expect(mocks.getProducts).toHaveBeenLastCalledWith(
        expect.objectContaining({ codeOrder: 'desc', pageNo: 2 }),
      ),
    );
    host.querySelector<HTMLButtonElement>('.product-detail-link')!.click();
    await vi.waitFor(() =>
      expect(router.currentRoute.value.query.catalogCodeOrder).toBe('desc'),
    );
    sort.click();
    await vi.waitFor(() =>
      expect(mocks.getProducts).toHaveBeenLastCalledWith(
        expect.objectContaining({ codeOrder: 'asc', pageNo: 1 }),
      ),
    );
    sort.click();
    await vi.waitFor(() =>
      expect(mocks.getProducts).toHaveBeenLastCalledWith(
        expect.objectContaining({ codeOrder: undefined, pageNo: 1 }),
      ),
    );
  });
  it('restores product code sorting with the catalog page from a detail URL', async () => {
    const { host } = await mountCenter(
      '/fdmproducts/catalog?catalogCodeOrder=asc&catalogPage=2&productId=A',
    );
    await vi.waitFor(() =>
      expect(mocks.getProducts).toHaveBeenLastCalledWith(
        expect.objectContaining({ codeOrder: 'asc', pageNo: 2 }),
      ),
    );
    expect(
      host.querySelector<HTMLElement>('[data-sort-column="code"]')?.dataset
        .sortOrder,
    ).toBe('ascend');
  });
  it.each(['BOARD', 'group:半成品'])(
    'filters by production stage %s, keeps the same category-count scope and preserves it in detail navigation',
    async (stage) => {
      const { host, router } = await mountCenter();
      await vi.waitFor(() =>
        expect(host.querySelectorAll('.product-detail-link')).toHaveLength(2),
      );
      const select = host.querySelector<HTMLSelectElement>(
        '[aria-label="筛选生产分类"]',
      )!;
      select.value = stage;
      select.dispatchEvent(new Event('change', { bubbles: true }));
      await vi.waitFor(() =>
        expect(mocks.getProducts).toHaveBeenLastCalledWith(
          expect.objectContaining({ productStage: stage, pageNo: 1 }),
        ),
      );
      expect(mocks.getProductCategories).toHaveBeenLastCalledWith(
        expect.objectContaining({ productStage: stage }),
      );
      host.querySelector<HTMLButtonElement>('.product-detail-link')!.click();
      await vi.waitFor(() =>
        expect(router.currentRoute.value.query.catalogProductStage).toBe(stage),
      );
      select.value = '';
      select.dispatchEvent(new Event('change', { bubbles: true }));
      await vi.waitFor(() =>
        expect(mocks.getProducts).toHaveBeenLastCalledWith(
          expect.objectContaining({ productStage: undefined }),
        ),
      );
      expect(mocks.getProductCategories.mock.lastCall?.[0]).not.toHaveProperty(
        'productStage',
      );
    },
  );
  it('restores a parent filter from the detail URL without turning it into a child stage', async () => {
    const { host } = await mountCenter(
      '/fdmproducts/catalog?catalogProductStage=group%3A%E5%8D%8A%E6%88%90%E5%93%81&productId=A',
    );
    await vi.waitFor(() =>
      expect(detail(host)?.textContent).toContain('产品A'),
    );
    await vi.waitFor(() =>
      expect(
        host.querySelector<HTMLSelectElement>('[aria-label="筛选生产分类"]')
          ?.value,
      ).toBe('group:半成品'),
    );
    expect(mocks.getProducts).toHaveBeenLastCalledWith(
      expect.objectContaining({ productStage: 'group:半成品' }),
    );
    expect(mocks.getProductCategories).toHaveBeenLastCalledWith(
      expect.objectContaining({ productStage: 'group:半成品' }),
    );
    detail(host)!
      .querySelector<HTMLButtonElement>('[data-drawer-close]')!
      .click();
    await vi.waitFor(() => expect(detail(host)).toBeNull());
    expect(
      host.querySelector<HTMLSelectElement>('[aria-label="筛选生产分类"]')
        ?.value,
    ).toBe('group:半成品');
  });
  it('opens names as details and maintenance as an editor, preserving the detail when editing closes', async () => {
    const { host, router } = await mountCenter();
    await vi.waitFor(() =>
      expect(host.querySelectorAll('.product-detail-link')).toHaveLength(2),
    );
    host.querySelector<HTMLButtonElement>('.product-detail-link')!.click();
    await vi.waitFor(() =>
      expect(detail(host)?.textContent).toContain('产品A'),
    );
    expect(router.currentRoute.value.query.productId).toBe('A');
    expect(host.querySelector('[data-product-editor]')).toBeNull();
    clickText(detail(host)!, '维护档案');
    await nextTick();
    expect(
      host.querySelector<HTMLElement>('[data-product-editor]')?.dataset
        .productEditor,
    ).toBe('A');
    host.querySelector<HTMLButtonElement>('[data-editor-close]')!.click();
    await nextTick();
    expect(detail(host)).not.toBeNull();
    expect(host.querySelector('[data-product-editor]')).toBeNull();
    detail(host)!
      .querySelector<HTMLButtonElement>('[data-drawer-close]')!
      .click();
    await vi.waitFor(() =>
      expect(router.currentRoute.value.query.productId).toBeUndefined(),
    );
    expect(detail(host)).toBeNull();
    clickText(host.querySelector('[data-table-row="A"]')!, '维护档案');
    await nextTick();
    expect(
      host.querySelector<HTMLElement>('[data-product-editor]')?.dataset
        .productEditor,
    ).toBe('A');
    expect(detail(host)).toBeNull();
  });
  it('does not let an old product lookup replace a newly selected product', async () => {
    const old = deferred<Product>();
    mocks.getProduct.mockImplementation((id: string) =>
      id === 'A' ? old.promise : Promise.resolve(product(id)),
    );
    const { host, router } = await mountCenter(
      '/fdmproducts/catalog?productId=A',
    );
    await router.push('/fdmproducts/catalog?productId=B');
    await vi.waitFor(() =>
      expect(detail(host)?.textContent).toContain('产品B'),
    );
    old.resolve(product('A'));
    await nextTick();
    await nextTick();
    expect(
      detail(host)?.querySelector('[data-detail-title]')?.textContent,
    ).toContain('产品B');
    expect(mocks.getProductActivity).not.toHaveBeenCalledWith(
      'A',
      expect.anything(),
    );
  });
  it('discards a slow previous product activity response and a response after closing', async () => {
    const old = deferred<ProductActivityView>();
    mocks.getProductActivity.mockImplementation((id: string) =>
      id === 'A' ? old.promise : Promise.resolve(activity(id)),
    );
    const { host, router } = await mountCenter(
      '/fdmproducts/catalog?productId=A',
    );
    await vi.waitFor(() =>
      expect(mocks.getProductActivity).toHaveBeenCalledWith(
        'A',
        expect.anything(),
      ),
    );
    await router.push('/fdmproducts/catalog?productId=B');
    await vi.waitFor(() =>
      expect(detail(host)?.textContent).toContain('关联单据B'),
    );
    old.resolve(activity('A'));
    await nextTick();
    await nextTick();
    expect(detail(host)?.textContent).not.toContain('关联单据A');
    const pending = deferred<ProductActivityView>();
    mocks.getProductActivity.mockReturnValueOnce(pending.promise);
    clickText(detail(host)!, '刷新');
    await nextTick();
    detail(host)!
      .querySelector<HTMLButtonElement>('[data-drawer-close]')!
      .click();
    await vi.waitFor(() =>
      expect(router.currentRoute.value.query.productId).toBeUndefined(),
    );
    pending.resolve(activity('B'));
    await nextTick();
    await nextTick();
    expect(detail(host)).toBeNull();
    expect(host.querySelector('[data-product-editor]')).toBeNull();
  });
  it('reopens the same product detail after a related document navigation and back', async () => {
    const { host, router } = await mountCenter(
      '/fdmproducts/catalog?productId=A',
    );
    await vi.waitFor(() =>
      expect(detail(host)?.textContent).toContain('关联单据A'),
    );
    const link = [
      ...detail(host)!.querySelectorAll<HTMLAnchorElement>('a'),
    ].find((entry) => entry.textContent === '关联单据A')!;
    link.click();
    await vi.waitFor(() =>
      expect(router.currentRoute.value.path).toBe(
        '/fdmwaimao/platform-contracts',
      ),
    );
    expect(detail(host)).toBeNull();
    router.back();
    await vi.waitFor(() =>
      expect(detail(host)?.textContent).toContain('关联单据A'),
    );
    expect(router.currentRoute.value.query.productId).toBe('A');
    expect(host.querySelector('[data-product-editor]')).toBeNull();
  });
  it('preserves a saved product version when an earlier refresh completes later', async () => {
    const { host } = await mountCenter('/fdmproducts/catalog?productId=A');
    await vi.waitFor(() =>
      expect(detail(host)?.textContent).toContain('关联单据A'),
    );
    const old = deferred<Product>();
    mocks.getProduct.mockReturnValueOnce(old.promise);
    clickText(detail(host)!, '刷新');
    await nextTick();
    clickText(detail(host)!, '维护档案');
    await nextTick();
    host.querySelector<HTMLButtonElement>('[data-editor-save]')!.click();
    await vi.waitFor(() =>
      expect(
        detail(host)?.querySelector('[data-detail-title]')?.textContent,
      ).toContain('更新后产品'),
    );
    old.resolve(product('A'));
    await nextTick();
    await nextTick();
    expect(
      detail(host)?.querySelector('[data-detail-title]')?.textContent,
    ).toContain('更新后产品');
  });
  it.each([
    { order: undefined, pageNo: 1 },
    { order: 'asc', pageNo: 2 },
  ])(
    'reloads the saved thickness at page $pageNo for sort $order',
    async ({ order, pageNo }) => {
      const source = {
        ...product('A'),
        lengthMm: 1830,
        widthMm: 610,
        finishedThicknessMm: 6,
      };
      mocks.getProducts.mockResolvedValue({ list: [source], total: 12 });
      const { host } = await mountCenter(
        `/fdmproducts/catalog?catalogPage=2${order ? `&catalogCodeOrder=${order}` : ''}`,
      );
      await vi.waitFor(() =>
        expect(
          host.querySelector('[data-table-row="A"]')?.textContent,
        ).toContain('1830 × 610 × 6 mm'),
      );
      clickText(host.querySelector('[data-table-row="A"]')!, '维护档案');
      await nextTick();
      mocks.getProducts.mockResolvedValue({
        list: [{ ...source, finishedThicknessMm: 5 }],
        total: 12,
      });
      const previousRequests = mocks.getProducts.mock.calls.length;
      clickText(host.querySelector('[data-product-editor]')!, '保存厚度');
      await vi.waitFor(() =>
        expect(
          host.querySelector('[data-table-row="A"]')?.textContent,
        ).toContain('1830 × 610 × 5 mm'),
      );
      expect(mocks.getProducts).toHaveBeenCalledTimes(previousRequests + 1);
      expect(mocks.getProducts).toHaveBeenLastCalledWith(
        expect.objectContaining({ codeOrder: order, pageNo }),
      );
    },
  );
  it('shows the actual selected summary unit and never adds quantities of different units', async () => {
    const { host } = await mountCenter('/fdmproducts/catalog?productId=A');
    await vi.waitFor(() =>
      expect(detail(host)?.textContent).toContain('关联单据A'),
    );
    const select = detail(host)!.querySelector<HTMLSelectElement>(
      '[aria-label="数量统计单位"]',
    )!;
    expect(select.value).toBe('张');
    expect(
      detail(host)?.querySelector('.quantity-summary-row')?.textContent,
    ).toContain('12 张');
    select.value = '箱';
    select.dispatchEvent(new Event('change', { bubbles: true }));
    await nextTick();
    expect(
      detail(host)?.querySelector('.quantity-summary-row')?.textContent,
    ).toContain('3 箱');
    expect(
      detail(host)?.querySelector('.quantity-summary-row')?.textContent,
    ).not.toContain('15');
  });
  it('keeps a manually chosen editor open when an earlier deep-link lookup resolves', async () => {
    const old = deferred<Product>();
    mocks.getProduct.mockReturnValueOnce(old.promise);
    const { host } = await mountCenter('/fdmproducts/catalog?productId=A');
    await vi.waitFor(() =>
      expect(host.querySelector('[data-table-row="B"]')).not.toBeNull(),
    );
    clickText(host.querySelector('[data-table-row="B"]')!, '维护档案');
    await nextTick();
    expect(
      host.querySelector<HTMLElement>('[data-product-editor]')?.dataset
        .productEditor,
    ).toBe('B');
    old.resolve(product('A'));
    await nextTick();
    await nextTick();
    expect(
      host.querySelector<HTMLElement>('[data-product-editor]')?.dataset
        .productEditor,
    ).toBe('B');
    expect(detail(host)).toBeNull();
  });
  it('clears the previous document type when loading another type fails, retaining the full-product summary', async () => {
    const initial = activity('A');
    initial.summary.quantities[0]!.arrivedQuantity = '4';
    mocks.getProductActivity.mockResolvedValueOnce(initial);
    const { host } = await mountCenter('/fdmproducts/catalog?productId=A');
    await vi.waitFor(() =>
      expect(detail(host)?.textContent).toContain('关联单据A'),
    );
    mocks.getProductActivity.mockRejectedValueOnce(
      new Error('到货记录暂时读取失败'),
    );
    const arrivalSummary = [
      ...detail(host)!.querySelectorAll<HTMLElement>('.quantity-summary-row'),
    ].find((row) => row.textContent?.includes('累计到货'))!;
    arrivalSummary.querySelector<HTMLButtonElement>('button')!.click();
    await vi.waitFor(() =>
      expect(detail(host)?.textContent).toContain('到货记录暂时读取失败'),
    );
    expect(mocks.getProductActivity).toHaveBeenLastCalledWith(
      'A',
      expect.objectContaining({ type: 'ARRIVAL', pageNo: 1 }),
    );
    expect(detail(host)?.textContent).not.toContain('关联单据A');
    expect(
      detail(host)?.querySelector('.quantity-summary-row')?.textContent,
    ).toContain('12 张');
    expect(detail(host)?.querySelector('.activity-pagination')).toBeNull();
  });
  it('preserves the catalog search when opening and closing a detail rebuilds the page by full URL', async () => {
    const { host, router } = await mountCenter('/fdmproducts/catalog', true);
    await vi.waitFor(() =>
      expect(host.querySelectorAll('.product-detail-link')).toHaveLength(2),
    );
    const searchInput = () =>
      host.querySelector<HTMLInputElement>('[placeholder="名称 / SKU 编号"]')!;
    searchInput().value = 'SIM';
    searchInput().dispatchEvent(new Event('input', { bubbles: true }));
    await nextTick();
    clickText(host, '查询');
    await vi.waitFor(() =>
      expect(mocks.getProducts).toHaveBeenLastCalledWith(
        expect.objectContaining({ keyword: 'SIM' }),
      ),
    );
    const callsBeforeOpen = mocks.getProducts.mock.calls.length;
    host.querySelector<HTMLButtonElement>('.product-detail-link')!.click();
    await vi.waitFor(() =>
      expect(detail(host)?.textContent).toContain('关联单据A'),
    );
    expect(router.currentRoute.value.query.catalogKeyword).toBe('SIM');
    expect(mocks.getProducts.mock.calls.length).toBeGreaterThan(
      callsBeforeOpen,
    );
    expect(mocks.getProducts).toHaveBeenLastCalledWith(
      expect.objectContaining({ keyword: 'SIM' }),
    );
    expect(searchInput().value).toBe('SIM');
    const callsBeforeClose = mocks.getProducts.mock.calls.length;
    detail(host)!
      .querySelector<HTMLButtonElement>('[data-drawer-close]')!
      .click();
    await vi.waitFor(() =>
      expect(router.currentRoute.value.query.productId).toBeUndefined(),
    );
    await vi.waitFor(() =>
      expect(mocks.getProducts.mock.calls.length).toBeGreaterThan(
        callsBeforeClose,
      ),
    );
    expect(router.currentRoute.value.query.catalogKeyword).toBe('SIM');
    expect(mocks.getProducts).toHaveBeenLastCalledWith(
      expect.objectContaining({ keyword: 'SIM' }),
    );
    expect(searchInput().value).toBe('SIM');
    expect(detail(host)).toBeNull();
    expect(host.querySelector('[data-product-editor]')).toBeNull();
  });
});
