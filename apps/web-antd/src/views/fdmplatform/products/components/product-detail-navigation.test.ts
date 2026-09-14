/* eslint-disable vue/one-component-per-file -- Minimal Ant Design adapters exercise the actual product components with a real router. */
import type { PropType, VNode } from 'vue';

import type { ProductActivityView } from '#/api/fdmplatform/product-activity';
import type { Product } from '#/api/fdmplatform/products';

import { createApp, defineComponent, h, KeepAlive, nextTick } from 'vue';
import { createMemoryHistory, createRouter, RouterView } from 'vue-router';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import ProductCenter from './ProductCenter.vue';

const mocks = vi.hoisted(() => ({
  getProduct: vi.fn(),
  getProducts: vi.fn(),
  getProductActivity: vi.fn(),
}));
vi.mock('#/api/fdmplatform', () => ({
  newIdempotencyKey: () => 'test-product-operation',
}));
vi.mock('#/api/fdmplatform/products', () => ({
  getProduct: mocks.getProduct,
  getProducts: mocks.getProducts,
  getProductPrices: vi.fn(),
  deleteProduct: vi.fn(),
  saveProductPrice: vi.fn(),
}));
vi.mock('#/api/fdmplatform/product-activity', () => ({
  getProductActivity: mocks.getProductActivity,
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
      columns: {
        type: Array as PropType<{ dataIndex?: string; key?: string }[]>,
        default: () => [],
      },
    },
    setup(props, ctx) {
      return () =>
        h(
          'div',
          ctx.attrs,
          props.dataSource.map((record) =>
            h(
              'div',
              { 'data-table-row': record.id },
              props.columns.map((column) =>
                ctx.slots.bodyCell?.({
                  record,
                  column,
                  text: column.dataIndex ? record[column.dataIndex] : undefined,
                }),
              ),
            ),
          ),
        );
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
    Checkbox: input,
    Descriptions: Object.assign(block, { Item: block }),
    Drawer: drawer,
    Empty: block,
    Form: Object.assign(block, { Item: block }),
    Input: input,
    InputNumber: input,
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
