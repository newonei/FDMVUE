/* eslint-disable vue/one-component-per-file -- Small UI adapters verify actual workspace state and routing. */
import type { PropType } from 'vue';

import { createApp, defineComponent, h, nextTick, ref, watch } from 'vue';
import { createMemoryHistory, createRouter } from 'vue-router';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import Workspace from './index.vue';

const mocks = vi.hoisted(() => ({
  overview: vi.fn(),
  list: vi.fn(),
  detail: vi.fn(),
  contract: vi.fn(),
  finance: vi.fn(),
  attachments: vi.fn(),
}));
vi.mock('#/api/fdmplatform', () => ({
  getContract: mocks.contract,
  getAttachments: mocks.attachments,
  newIdempotencyKey: vi.fn(() => 'key'),
}));
vi.mock('#/api/fdmplatform/procurement', () => ({
  getOrderInvoices: vi.fn(async () => ({ invoicedAmount: 0, invoices: [] })),
  getProcurementOrders: mocks.list,
  getProcurementOrdersOverview: mocks.overview,
  getProcurementOrder: mocks.detail,
  downloadProcurementFile: vi.fn(),
  exportProcurementOrder: vi.fn(),
  procurementOrderAction: vi.fn(),
  uploadProcurementSigned: vi.fn(),
}));
vi.mock('#/api/fdmplatform/procurement-finance', () => ({
  getProcurementFinanceSummary: mocks.finance,
}));
vi.mock('#/api/fdmaicheck', () => ({
  getAiReviewStatuses: vi.fn().mockResolvedValue({}),
}));
vi.mock('#/views/fdmaicheck/components/AiCheckPanel.vue', () => ({
  default: defineComponent({ render: () => null }),
}));
vi.mock('@vben/common-ui', () => ({
  Page: defineComponent({
    setup: (_, ctx) => () => h('main', ctx.slots.default?.()),
  }),
}));
vi.mock('@vben/utils', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@vben/utils')>()),
  formatDate: (value: unknown) => value,
}));
vi.mock('../../components/ActionDialog.vue', () => ({
  default: defineComponent({ render: () => null }),
}));
vi.mock('../../components/AttachmentPanel.vue', () => ({
  default: defineComponent({
    props: {
      categories: { type: Array as PropType<string[]>, default: () => [] },
      defaultCategory: { type: String, default: undefined },
      view: { type: Object, default: undefined },
    },
    emits: ['busy'],
    setup(props, { emit }) {
      const category = ref<string>();
      const queued = ref(0);
      watch(
        () => props.categories,
        (categories) => {
          if (category.value && categories.includes(category.value)) return;
          category.value =
            props.defaultCategory && categories.includes(props.defaultCategory)
              ? props.defaultCategory
              : undefined;
        },
        { immediate: true },
      );
      return () =>
        h(
          'section',
          {
            'data-attachment-categories': JSON.stringify(props.categories),
            'data-attachment-view': props.view
              ? JSON.stringify(props.view)
              : '',
            'data-attachment-category': category.value,
            'data-attachment-queue': queued.value,
          },
          [
            h(
              'select',
              {
                'aria-label': '测试补充附件分类',
                value: category.value,
                onChange: (event: Event) => {
                  category.value = (event.target as HTMLSelectElement).value;
                },
              },
              props.categories.map((value) => h('option', { value }, value)),
            ),
            h('button', { onClick: () => queued.value++ }, '选择待上传图纸'),
            h('button', { onClick: () => emit('busy', true) }, '开始附件上传'),
            h('button', { onClick: () => emit('busy', false) }, '结束附件上传'),
          ],
        );
    },
  }),
}));
vi.mock('../../components/ContractDocumentDialog.vue', () => ({
  default: defineComponent({ render: () => null }),
}));
vi.mock('../../components/RecordTable.vue', () => ({
  default: defineComponent({ render: () => null }),
}));
vi.mock('../../documents/MigrationSource.vue', () => ({
  default: defineComponent({ render: () => null }),
}));
vi.mock('../../documents/RecordDetail.vue', () => ({
  default: defineComponent({ render: () => null }),
}));
vi.mock('./components/BatchRequestDialog.vue', () => ({
  default: defineComponent({ render: () => null }),
}));
vi.mock('#/api/fdmplatform/warehouse', () => ({
  getStockIns: vi.fn().mockResolvedValue({ list: [], total: 0 }),
  getPurchaseReturns: vi.fn().mockResolvedValue({ list: [], total: 0 }),
}));
vi.mock('./components/OrderSubDocMenu.vue', () => ({
  default: defineComponent({
    props: {
      items: { type: Array, default: () => [] },
      disabled: Boolean,
    },
    emits: ['pick'],
    setup: (props, ctx) => () =>
      h(
        'div',
        (
          props.items as Array<{
            disabled?: boolean;
            key: string;
            label: string;
          }>
        ).map((item) =>
          h(
            'button',
            {
              disabled: props.disabled || item.disabled,
              onClick: () => ctx.emit('pick', item.key),
            },
            item.label,
          ),
        ),
      ),
  }),
}));
vi.mock('./components/OrderTimeline.vue', () => ({
  default: defineComponent({ render: () => null }),
}));
vi.mock('./components/OrderSummaryCards.vue', () => ({
  default: defineComponent({ render: () => null }),
}));
vi.mock('./components/OrderStockDocs.vue', () => ({
  default: defineComponent({ render: () => null }),
}));
vi.mock('./components/OrderInvoices.vue', () => ({
  default: defineComponent({ render: () => null }),
}));
vi.mock('./components/PurchaseOrderEditor.vue', () => ({
  default: defineComponent({ render: () => null }),
}));
vi.mock('../warehouse/StockInDialog.vue', () => ({
  default: defineComponent({
    props: {
      open: Boolean,
      contractId: { type: String, default: undefined },
      orderId: { type: String, default: undefined },
    },
    emits: ['close', 'saved'],
    setup(props, { emit }) {
      return () =>
        props.open
          ? h(
              'div',
              {
                'data-stock-in': props.orderId,
                'data-contract': props.contractId,
              },
              [
                h(
                  'button',
                  {
                    onClick: () =>
                      emit('saved', { code: 'RK001', directShip: false }),
                  },
                  '确认入库',
                ),
                h('button', { onClick: () => emit('close') }, '取消入库'),
              ],
            )
          : null;
    },
  }),
}));
vi.mock('./components/OrderExportMenu.vue', () => ({
  default: defineComponent({ render: () => null }),
}));
vi.mock('./components/OrderContract.vue', () => ({
  default: defineComponent({ render: () => null }),
}));
vi.mock('./components/StandaloneOrderFiles.vue', () => ({
  default: defineComponent({ render: () => null }),
}));
vi.mock('./components/OrderDetails.vue', () => ({
  default: defineComponent({ render: () => null }),
}));
vi.mock('./components/OrderLines.vue', () => ({
  default: defineComponent({ render: () => null }),
}));
vi.mock('../../finance/procurement/components/PaymentRecordDialog.vue', () => ({
  default: defineComponent({
    props: {
      open: Boolean,
      available: { type: null, default: undefined },
      contractId: { type: String, default: undefined },
      orderId: { type: String, default: undefined },
    },
    emits: ['close', 'saved'],
    setup:
      (props, { emit }) =>
      () =>
        props.open
          ? h(
              'section',
              {
                'data-payment': props.orderId,
                'data-contract': props.contractId,
                'data-available': String(props.available),
              },
              [h('button', { onClick: () => emit('close') }, '关闭登记付款')],
            )
          : null,
  }),
}));
vi.mock('../../finance/procurement/components/OrderFinance.vue', () => ({
  default: defineComponent({
    props: { mode: { type: String, default: undefined } },
    emits: ['busy'],
    setup: (props, ctx) => () =>
      props.mode === 'payments'
        ? h('div', [
            h(
              'button',
              { onClick: () => ctx.emit('busy', true) },
              '付款页打开子表单',
            ),
            h(
              'button',
              { onClick: () => ctx.emit('busy', false) },
              '付款页关闭子表单',
            ),
          ])
        : null,
  }),
}));
vi.mock('../../documents/RelatedLink.vue', () => ({
  default: defineComponent({
    setup: (_, ctx) => () => h('span', ctx.slots.default?.()),
  }),
}));
vi.mock('../../documents/BusinessDocumentDetail.vue', () => ({
  default: defineComponent({
    props: { open: Boolean, id: { type: String, default: undefined } },
    emits: ['close'],
    setup: (props, ctx) => () =>
      props.open
        ? h(
            'section',
            { 'data-standalone': props.id },
            h('button', { onClick: () => ctx.emit('close') }, '关闭历史订单'),
          )
        : null,
  }),
}));
vi.mock('../../documents/DocumentAction.vue', () => ({
  default: defineComponent({
    props: {
      open: Boolean,
      action: { type: String, default: undefined },
      contractId: { type: String, default: undefined },
      source: { type: Object, default: undefined },
      lockContract: Boolean,
    },
    emits: ['close', 'updated'],
    setup: (props, ctx) => () =>
      props.open
        ? h(
            'section',
            {
              'data-action': props.action,
              'data-source': JSON.stringify(props.source),
              'data-contract': props.contractId,
              'data-locked': String(props.lockContract),
            },
            [
              h('button', { onClick: () => ctx.emit('close') }, '取消办理'),
              h(
                'button',
                { onClick: () => ctx.emit('updated', { id: 'contract-a' }) },
                '完成办理',
              ),
            ],
          )
        : null,
  }),
}));
vi.mock('../../finance/procurement/components/FinanceDocument.vue', () => ({
  default: defineComponent({
    props: {
      open: Boolean,
      type: { type: String, default: undefined },
      context: { type: Object, default: undefined },
    },
    emits: ['close', 'updated'],
    setup: (props, ctx) => () =>
      props.open
        ? h(
            'section',
            {
              'data-finance-type': props.type,
              'data-context': JSON.stringify(props.context),
            },
            h('button', { onClick: () => ctx.emit('close') }, '关闭财务单据'),
          )
        : null,
  }),
}));
vi.mock('ant-design-vue', () => {
  const block = defineComponent({
    setup: (_, ctx) => () => h('div', ctx.slots.default?.()),
  });
  const button = defineComponent({
    props: { disabled: Boolean, loading: Boolean },
    setup: (props, ctx) => () =>
      h(
        'button',
        { ...ctx.attrs, disabled: props.disabled || props.loading },
        ctx.slots.default?.(),
      ),
  });
  return {
    Alert: defineComponent({
      props: { message: { type: String, default: undefined } },
      setup: (props) => () => h('p', props.message),
    }),
    Button: button,
    Empty: block,
    Drawer: defineComponent({
      props: { open: Boolean, closable: Boolean },
      emits: ['close'],
      setup: (props, ctx) => () =>
        props.open
          ? h('section', { 'data-drawer': true }, [
              ctx.slots.title?.(),
              ctx.slots.extra?.(),
              ctx.slots.default?.(),
              h(
                'button',
                { disabled: !props.closable, onClick: () => ctx.emit('close') },
                '关闭执行详情',
              ),
            ])
          : null,
    }),
    Input: {
      Search: defineComponent({
        props: { value: { type: String, default: undefined } },
        emits: ['update:value', 'search'],
        setup: (props, ctx) => () =>
          h('input', {
            value: props.value,
            onInput: (event: Event) =>
              ctx.emit(
                'update:value',
                (event.target as HTMLInputElement).value,
              ),
            onKeydown: (event: KeyboardEvent) => {
              if (event.key === 'Enter') ctx.emit('search');
            },
          }),
      }),
    },
    Progress: block,
    Space: block,
    Dropdown: defineComponent({
      setup: (_, ctx) => () =>
        h('div', [ctx.slots.default?.(), ctx.slots.overlay?.()]),
    }),
    Menu: defineComponent({
      props: { items: { type: Array, default: () => [] } },
      emits: ['click'],
      setup: (props, ctx) => () =>
        h(
          'div',
          (
            props.items as Array<{
              children?: Array<{
                disabled?: boolean;
                key: string;
                label: string;
              }>;
              disabled?: boolean;
              key: string;
              label: string;
            }>
          )
            .flatMap((item) => item.children ?? [item])
            .map((item) =>
              h(
                'button',
                {
                  disabled: item.disabled,
                  onClick: () => ctx.emit('click', { key: item.key }),
                },
                item.label,
              ),
            ),
        ),
    }),
    TabPane: block,
    Tabs: defineComponent({
      props: { activeKey: { type: String, default: undefined } },
      emits: ['update:activeKey'],
      setup: (props, ctx) => () =>
        h('div', { 'data-order-tab': props.activeKey }, [
          h(
            'button',
            { onClick: () => ctx.emit('update:activeKey', 'attachments') },
            '切换附件页签',
          ),
          h(
            'button',
            { onClick: () => ctx.emit('update:activeKey', 'details') },
            '切换详情页签',
          ),
          ctx.slots.default?.(),
        ]),
    }),
    Tag: block,
    Modal: { confirm: vi.fn(), warning: vi.fn() },
    message: { success: vi.fn(), warning: vi.fn() },
    Table: defineComponent({
      props: {
        dataSource: {
          type: Array as PropType<Record<string, unknown>[]>,
          default: () => [],
        },
        columns: {
          type: Array as PropType<{ key: string }[]>,
          default: () => [],
        },
        pagination: { type: [Boolean, Object], default: undefined },
      },
      emits: ['change'],
      setup: (props, ctx) => () =>
        h('div', { 'data-table': true }, [
          ...props.dataSource.map((record) =>
            h(
              'article',
              { 'data-record': record.id },
              props.columns.map((column) =>
                ctx.slots.bodyCell?.({ column, record }),
              ),
            ),
          ),
          props.pagination
            ? h(
                'button',
                { onClick: () => ctx.emit('change', { current: 2 }) },
                '第2页',
              )
            : null,
        ]),
    }),
  };
});

const orderSubject = '11 月瑜伽垫备货';

function order() {
  return {
    id: 'po-a',
    code: 'CG-001',
    supplierName: '工厂甲',
    currency: 'CNY',
    status: 'PARTIALLY_RECEIVED',
    lines: [
      {
        id: 'line-a',
        contractItemId: 'item-a',
        unit: '件',
        quantity: 10,
        arrivedQuantity: 4,
        cancelledQuantity: 0,
        returnedQuantity: 0,
      },
    ],
  };
}
function contract() {
  return {
    id: 'contract-a',
    code: 'HT-001',
    name: '客户订单',
    status: 'CONFIRMED',
    version: 1,
    companyId: 1,
    allowedActions: ['RECORD_ARRIVAL', 'RETURN_ARRIVAL'],
    items: [{ id: 'item-a', productName: '瑜伽垫' }],
    assignments: [],
    quotes: [],
    plans: [],
    purchaseOrders: [order()],
    arrivals: [],
  };
}
function detail(id = 'po-a') {
  return {
    id,
    contractId: 'contract-a',
    version: 1,
    order: { ...order(), id },
    details: {
      status: 'DRAFT',
      version: 0,
      clauseIds: [],
      subject: orderSubject,
    },
    allowedActions: [],
    blockReasons: [],
    history: [],
    exports: [],
    files: [],
  };
}
function row() {
  return {
    id: 'po-a',
    contractId: 'contract-a',
    contractCode: 'HT-001',
    contractName: '客户订单',
    contractVersion: 1,
    companyId: 1,
    contractStatus: 'CONFIRMED',
    allowedActions: [],
    record: order(),
    details: { subject: orderSubject },
    orderAmount: '100',
    paidAmount: '40',
    unpaidAmount: '60',
  };
}
async function settle() {
  for (let index = 0; index < 5; index++) {
    await new Promise((resolve) => setTimeout(resolve, 0));
    await nextTick();
  }
}
const disposals: (() => void)[] = [];
async function mount(query = '') {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/orders', component: { render: () => null } }],
  });
  await router.push(`/orders${query}`);
  await router.isReady();
  const host = document.createElement('div');
  document.body.append(host);
  const app = createApp({ render: () => h(Workspace) });
  app.use(router);
  app.mount(host);
  disposals.push(() => {
    app.unmount();
    host.remove();
  });
  await settle();
  return { host, router };
}
function button(host: HTMLElement, text: string) {
  const result = [...host.querySelectorAll<HTMLButtonElement>('button')].find(
    (entry) => entry.textContent?.trim() === text,
  );
  expect(result).toBeDefined();
  return result!;
}
const overview = {
  orders: 2,
  open: 1,
  overdue: 1,
  maxOverdueDays: 9,
  unsigned: 1,
  unpaid: 1,
  asOf: '2026-10-08',
  openAmount: { CNY: 246 },
  unpaidAmount: { CNY: 146 },
  arrivedUnpaidAmount: {},
  attention: [
    {
      reason: 'OVERDUE',
      days: 9,
      code: 'CG-OVERDUE',
      subject: orderSubject,
      orderId: 'po-a',
      contractId: 'contract-a',
      contractCode: 'HT-1',
      supplierName: '工厂甲',
      currency: 'CNY',
    },
  ],
};
beforeEach(() => {
  vi.clearAllMocks();
  mocks.overview.mockResolvedValue(overview);
  mocks.list.mockResolvedValue({ list: [row()], total: 21 });
  mocks.contract.mockResolvedValue(contract());
  mocks.detail.mockResolvedValue(detail());
  mocks.attachments.mockResolvedValue({
    enabled: true,
    uploadCategories: ['SALES', 'PROCUREMENT'],
    items: [],
  });
  mocks.finance.mockResolvedValue({
    currency: 'CNY',
    orderAmount: '100',
    paidAmount: '40',
    unpaidAmount: '60',
    availableRequestAmount: '25',
    availablePaymentAmount: '25',
  });
});
afterEach(() => {
  for (const dispose of disposals.splice(0)) dispose();
});

describe('采购订单原页执行', () => {
  it('输入采购主题查单并回到第一页', async () => {
    const { host } = await mount('?page=2');
    const search = host.querySelector<HTMLInputElement>('input')!;
    expect(search.placeholder).toBe('搜索采购主题、内部单号、客户或供应商');
    search.value = '瑜伽垫备货';
    search.dispatchEvent(new Event('input'));
    await nextTick();
    search.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
    await settle();
    expect(mocks.list).toHaveBeenLastCalledWith(
      expect.objectContaining({ keyword: '瑜伽垫备货', pageNo: 1 }),
    );
  });
  it('没有采购主题时仍可打开采购单，列表和详情显示未填写提示', async () => {
    mocks.list.mockResolvedValue({
      list: [{ ...row(), details: { subject: ' ' } }],
      total: 1,
    });
    const value = detail();
    mocks.detail.mockResolvedValue({
      ...value,
      details: { ...value.details, subject: ' ' },
    });
    const { host } = await mount();
    button(host, '未填写采购主题').click();
    await settle();
    const drawer = host.querySelector('[data-drawer]')!;
    expect(drawer.textContent).toContain('未填写采购主题');
    expect(host.textContent).not.toContain('CG-001');
  });
  it('打开和关闭执行侧栏不改变路由、筛选、分页或重新拉取列表', async () => {
    const { host, router } = await mount('?keyword=工厂&page=2');
    const original = router.currentRoute.value.fullPath;
    const count = mocks.list.mock.calls.length;
    const record = host.querySelector<HTMLElement>('[data-record="po-a"]')!;
    expect(record.textContent).not.toContain('CG-001');
    button(record, orderSubject).click();
    await settle();
    const drawer = host.querySelector<HTMLElement>('[data-drawer]')!;
    expect(drawer.querySelector('.order-title-text')?.textContent?.trim()).toBe(
      orderSubject,
    );
    expect(drawer.textContent).not.toContain('采购单号');
    expect(drawer.textContent).not.toContain('CG-001');
    expect(host.querySelector<HTMLElement>('[data-table]')).not.toBeNull();
    expect(router.currentRoute.value.fullPath).toBe(original);
    button(host, '关闭执行详情').click();
    await settle();
    expect(host.querySelector<HTMLElement>('[data-drawer]')).toBeNull();
    expect(mocks.list).toHaveBeenCalledTimes(count);
    expect(host.querySelector('input')?.value).toBe('工厂');
    // The completion-queue size request is separate from the list request.
    expect(
      mocks.list.mock.calls
        .map(([params]) => params)
        .findLast((params) => params?.pendingCompletion !== true),
    ).toEqual(
      expect.objectContaining({
        pageNo: 2,
        contractId: undefined,
        keyword: '工厂',
      }),
    );
  });
  it('登记入库打开采购入库并带出当前采购单，保存后刷新原页并保留选择', async () => {
    const { host, router } = await mount('?page=2');
    button(host, orderSubject).click();
    await settle();
    button(host, '入库单').click();
    await settle();
    const dialog = host.querySelector<HTMLElement>('[data-stock-in]')!;
    expect(dialog.dataset.stockIn).toBe('po-a');
    expect(dialog.dataset.contract).toBe('contract-a');
    expect(button(host, '关闭执行详情').disabled).toBe(true);
    button(host, '确认入库').click();
    await settle();
    expect(host.querySelector<HTMLElement>('[data-stock-in]')).toBeNull();
    expect(host.querySelector<HTMLElement>('[data-drawer]')).not.toBeNull();
    expect(mocks.list).toHaveBeenLastCalledWith(
      expect.objectContaining({ pageNo: 2 }),
    );
    expect(router.currentRoute.value.query.contractId).toBeUndefined();
  });
  it('嵌入合同订单时只弹出同一个采购单执行抽屉，不读列表，关闭通知调用方', async () => {
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [{ path: '/contracts', component: { render: () => null } }],
    });
    await router.push('/contracts?contractId=contract-a');
    await router.isReady();
    const host = document.createElement('div');
    document.body.append(host);
    const closed = vi.fn();
    const app = createApp({
      render: () =>
        h(Workspace, {
          embeddedOrder: { contractId: 'contract-a', orderId: 'po-a' },
          onClose: closed,
        }),
    });
    app.use(router);
    app.mount(host);
    disposals.push(() => {
      app.unmount();
      host.remove();
    });
    await settle();
    expect(mocks.list).not.toHaveBeenCalled();
    expect(mocks.overview).not.toHaveBeenCalled();
    expect(mocks.detail).toHaveBeenCalledWith('contract-a', 'po-a');
    expect(host.querySelector('[data-drawer]')).not.toBeNull();
    expect(button(host, '付款记录')).toBeDefined();
    button(host, '关闭执行详情').click();
    await settle();
    expect(closed).toHaveBeenCalledOnce();
    expect(router.currentRoute.value.fullPath).toBe(
      '/contracts?contractId=contract-a',
    );
  });
  it('登记付款带出服务端可付余额，报销也直接关联当前订单', async () => {
    const { host } = await mount();
    button(host, orderSubject).click();
    await settle();
    button(host, '付款记录').click();
    await settle();
    const payment = host.querySelector<HTMLElement>('[data-payment]')!;
    expect(payment.dataset.payment).toBe('po-a');
    expect(payment.dataset.contract).toBe('contract-a');
    expect(payment.dataset.available).toBe('25');
    expect(button(host, '关闭执行详情').disabled).toBe(true);
    button(host, '关闭登记付款').click();
    await settle();
    button(host, '费用报销').click();
    await settle();
    expect(
      host.querySelector<HTMLElement>('[data-finance-type]')?.dataset
        .financeType,
    ).toBe('REIMBURSEMENT');
    expect(
      JSON.parse(
        host.querySelector<HTMLElement>('[data-finance-type]')!.dataset
          .context!,
      ),
    ).not.toHaveProperty('amount');
  });
  it('负责人筛选发送服务端条件并回第一页，刷新失败保留已有结果', async () => {
    const { host } = await mount('?page=2');
    button(host, '我负责的').click();
    await settle();
    expect(mocks.list).toHaveBeenLastCalledWith(
      expect.objectContaining({ mine: true, pageNo: 1 }),
    );
    mocks.list.mockRejectedValue(new Error('网络暂不可用'));
    button(host, '刷新').click();
    await settle();
    expect(button(host, orderSubject)).toBeDefined();
    expect(host.textContent).toContain('网络暂不可用');
  });
  it('保留原外部深链接和独立历史订单，关闭只移除详情标记', async () => {
    const { host, router } = await mount(
      '?contractId=contract-a&documentId=po-a&tab=payments&page=2',
    );
    expect(mocks.detail).toHaveBeenCalledWith('contract-a', 'po-a');
    expect(host.querySelector<HTMLElement>('[data-drawer]')).not.toBeNull();
    button(host, '关闭执行详情').click();
    await settle();
    expect(router.currentRoute.value.query).toEqual({
      contractId: 'contract-a',
      page: '2',
    });
    mocks.list.mockResolvedValue({
      list: [{ ...row(), standaloneId: 'historical-a' }],
      total: 1,
    });
    button(host, '刷新').click();
    await settle();
    button(host, orderSubject).click();
    await settle();
    expect(
      host.querySelector<HTMLElement>('[data-standalone]')?.dataset.standalone,
    ).toBe('historical-a');
    button(host, '关闭历史订单').click();
    await settle();
    expect(host.querySelector<HTMLElement>('[data-standalone]')).toBeNull();
  });
  it('不存在未到余额时隐藏登记入库，付款资料未读取时不启用登记付款', async () => {
    const complete = detail();
    complete.order.lines[0]!.arrivedQuantity = 10;
    complete.order.status = 'RECEIVED';
    mocks.detail.mockResolvedValue(complete);
    mocks.finance.mockResolvedValue({});
    const { host } = await mount();
    button(host, orderSubject).click();
    await settle();
    expect(button(host, '入库单').disabled).toBe(true);
    expect(button(host, '付款记录').disabled).toBe(true);
    expect(host.textContent).toContain('待核实');
  });
  it('付款页内的关联子表单打开时阻止关闭执行抽屉，关闭子表单后恢复', async () => {
    const { host } = await mount();
    button(host, orderSubject).click();
    await settle();
    button(host, '付款页打开子表单').click();
    await settle();
    expect(button(host, '关闭执行详情').disabled).toBe(true);
    button(host, '付款页关闭子表单').click();
    await settle();
    expect(button(host, '关闭执行详情').disabled).toBe(false);
  });
  it('统计卡跟随我负责的筛选，进行中卡按操作状态筛选，需要处理的采购单可直接打开', async () => {
    const { host } = await mount();
    expect(mocks.overview).toHaveBeenLastCalledWith({});
    expect(host.textContent).toContain('最长超期 9 天');
    expect(host.textContent).toContain('CNY 146.00');
    button(host, '我负责的').click();
    await settle();
    expect(mocks.overview).toHaveBeenLastCalledWith({ mine: true });
    const open = [...host.querySelectorAll('button')].find(
      (entry) =>
        entry.textContent?.includes('进行中') &&
        entry.classList.contains('order-kpi'),
    )!;
    open.click();
    await settle();
    expect(mocks.list).toHaveBeenLastCalledWith(
      expect.objectContaining({ operation: 'IN_PROGRESS', pageNo: 1 }),
    );
    const attention = host.querySelector<HTMLButtonElement>(
      'section[aria-label="需要处理的采购单"] button',
    )!;
    expect(attention.textContent).toContain(orderSubject);
    expect(attention.textContent).not.toContain('CG-OVERDUE');
    expect(attention.textContent).toContain('超期 9 天');
    attention.click();
    await settle();
    expect(mocks.detail).toHaveBeenLastCalledWith('contract-a', 'po-a');
  });

  it('从我负责的切到我提交的，直接找到未关联合同的辅料采购单', async () => {
    const { host, router } = await mount('?mine=true&page=2');
    expect(button(host, '我负责的').getAttribute('aria-pressed')).toBe('true');
    expect(mocks.overview).toHaveBeenLastCalledWith({ mine: true });
    const accessorySubject = '外贸辅料采购';
    mocks.list.mockResolvedValue({
      list: [
        {
          ...row(),
          id: 'accessory-order',
          contractId: '',
          contractCode: '',
          standaloneId: 'accessory-order',
          nativeStandalone: true,
          record: { ...order(), id: 'accessory-order' },
          details: { subject: accessorySubject },
        },
      ],
      total: 1,
    });
    mocks.overview.mockResolvedValue({
      ...overview,
      attention: [
        {
          ...overview.attention[0],
          contractId: 'standalone',
          contractCode: '',
          orderId: 'accessory-order',
          subject: accessorySubject,
        },
      ],
      unpaidAmount: { CNY: 20 },
    });
    mocks.detail.mockResolvedValue({
      ...detail('accessory-order'),
      contractId: 'standalone',
    });

    button(host, '我提交的').click();
    await settle();
    expect(button(host, '我负责的').getAttribute('aria-pressed')).toBe('false');
    expect(button(host, '我提交的').getAttribute('aria-pressed')).toBe('true');
    expect(mocks.list).toHaveBeenLastCalledWith(
      expect.objectContaining({
        keyword: undefined,
        mine: undefined,
        pageNo: 1,
        submittedByMe: true,
      }),
    );
    expect(mocks.overview).toHaveBeenLastCalledWith({ submittedByMe: true });
    expect(button(host, accessorySubject)).toBeDefined();
    expect(host.textContent).toContain('未关联合同');
    expect(host.textContent).toContain('当前筛选共 1 单');
    expect(host.textContent).toContain('CNY 20.00');
    host
      .querySelector<HTMLButtonElement>(
        'section[aria-label="需要处理的采购单"] button',
      )!
      .click();
    await settle();
    expect(mocks.detail).toHaveBeenLastCalledWith(
      'standalone',
      'accessory-order',
    );
    expect(mocks.contract).not.toHaveBeenCalled();
    button(host, '关闭执行详情').click();
    await settle();

    const search = host.querySelector<HTMLInputElement>('input.order-search')!;
    search.value = '辅料';
    search.dispatchEvent(new Event('input', { bubbles: true }));
    button(host, '已结束').click();
    await settle();
    expect(mocks.list).toHaveBeenLastCalledWith(
      expect.objectContaining({
        keyword: '辅料',
        operation: 'ENDED',
        submittedByMe: true,
      }),
    );
    button(host, '清除筛选').click();
    await settle();
    expect(button(host, '全部可见').getAttribute('aria-pressed')).toBe('true');
    expect(mocks.list).toHaveBeenLastCalledWith(
      expect.objectContaining({
        keyword: undefined,
        mine: undefined,
        operation: undefined,
        submittedByMe: undefined,
      }),
    );
    expect(mocks.overview).toHaveBeenLastCalledWith({});
    await router.push('/orders?mine=true');
    await settle();
    expect(button(host, '我负责的').getAttribute('aria-pressed')).toBe('true');
    expect(mocks.overview).toHaveBeenLastCalledWith({ mine: true });
  });

  it('附件上传忙碌时不能切走页签、关闭抽屉或换单，完成后恢复操作', async () => {
    const secondOrder = { ...order(), id: 'po-b', code: 'CG-002' };
    const secondSubject = '12 月瑜伽垫备货';
    mocks.list.mockResolvedValue({
      list: [
        row(),
        {
          ...row(),
          id: secondOrder.id,
          record: secondOrder,
          details: { subject: secondSubject },
        },
      ],
      total: 2,
    });
    mocks.contract.mockResolvedValue({
      ...contract(),
      purchaseOrders: [order(), secondOrder],
    });
    mocks.detail.mockImplementation(
      async (_contractId: string, orderId: string) => detail(orderId),
    );
    const { host } = await mount();
    button(host, orderSubject).click();
    await settle();
    button(host, '切换附件页签').click();
    await settle();
    expect(
      host.querySelector<HTMLElement>('[data-order-tab]')!.dataset.orderTab,
    ).toBe('attachments');
    button(host, '开始附件上传').click();
    await settle();
    expect(button(host, '关闭执行详情').disabled).toBe(true);
    expect(button(host, '下一单').disabled).toBe(true);
    const detailRequests = mocks.detail.mock.calls.length;
    button(host, '切换详情页签').click();
    button(host, '关闭执行详情').click();
    button(host, secondSubject).click();
    await settle();
    expect(
      host.querySelector<HTMLElement>('[data-order-tab]')!.dataset.orderTab,
    ).toBe('attachments');
    expect(host.querySelector('[data-drawer]')).not.toBeNull();
    expect(mocks.detail).toHaveBeenCalledTimes(detailRequests);
    button(host, '结束附件上传').click();
    await settle();
    expect(button(host, '关闭执行详情').disabled).toBe(false);
    expect(button(host, '下一单').disabled).toBe(false);
    button(host, '切换详情页签').click();
    await settle();
    expect(
      host.querySelector<HTMLElement>('[data-order-tab]')!.dataset.orderTab,
    ).toBe('details');
    button(host, '下一单').click();
    await settle();
    expect(mocks.detail).toHaveBeenLastCalledWith('contract-a', 'po-b');
  });

  it('非默认分类和待上传队列在页签切换及附件刷新期间保留原列表上下文', async () => {
    const attachments = {
      enabled: true,
      uploadCategories: ['SALES', 'PROCUREMENT'],
      items: [
        { id: 'existing-file', name: '已上传报价.pdf', category: 'SALES' },
      ],
    };
    mocks.attachments.mockResolvedValue(attachments);
    const { host } = await mount();
    button(host, orderSubject).click();
    await settle();
    button(host, '切换附件页签').click();
    await settle();
    expect(mocks.attachments).toHaveBeenCalledWith('contract-a', {
      targetKind: 'purchaseOrders',
      targetId: 'po-a',
    });
    const category = host.querySelector<HTMLSelectElement>(
      'select[aria-label="测试补充附件分类"]',
    )!;
    category.value = 'SALES';
    category.dispatchEvent(new Event('change'));
    button(host, '选择待上传图纸').click();
    await settle();
    const assertContext = () => {
      const panel = host.querySelector<HTMLElement>(
        '[data-attachment-categories]',
      )!;
      expect(JSON.parse(panel.dataset.attachmentCategories!)).toEqual(
        attachments.uploadCategories,
      );
      expect(JSON.parse(panel.dataset.attachmentView!)).toEqual(attachments);
      expect(panel.dataset.attachmentCategory).toBe('SALES');
      expect(panel.dataset.attachmentQueue).toBe('1');
    };
    assertContext();
    button(host, '切换详情页签').click();
    await settle();
    assertContext();
    // An in-flight reload must preserve the existing view until its replacement arrives.
    mocks.attachments.mockImplementationOnce(() => new Promise(() => {}));
    button(host, '切换附件页签').click();
    await settle();
    expect(mocks.attachments).toHaveBeenCalledTimes(2);
    assertContext();
  });
});
