/* eslint-disable vue/one-component-per-file -- Small UI adapters exercise the actual purchase workspace and its router. */
import type { PropType } from 'vue';

import { createApp, defineComponent, h, nextTick, ref } from 'vue';
import { createMemoryHistory, createRouter, RouterView } from 'vue-router';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import Workspace from './index.vue';
const mocks = vi.hoisted(() => ({
  overview: vi.fn(),
  page: vi.fn(),
  detail: vi.fn(),
  contract: vi.fn(),
  action: vi.fn(),
  confirm: vi.fn(),
  finance: vi.fn(),
  deleteOrder: vi.fn(),
  download: vi.fn(),
  exportOrder: vi.fn(),
}));
vi.mock('#/api/fdmplatform', () => ({
  getAttachments: vi.fn(),
  getContract: mocks.contract,
  newIdempotencyKey: () => 'test-key',
}));
vi.mock('#/api/fdmplatform/procurement', () => ({
  getOrderInvoices: vi.fn(async () => ({ invoicedAmount: 0, invoices: [] })),
  getProcurementOrders: mocks.page,
  getProcurementOrdersOverview: mocks.overview,
  getProcurementOrder: mocks.detail,
  downloadProcurementFile: mocks.download,
  exportProcurementOrder: mocks.exportOrder,
  procurementOrderAction: mocks.action,
  uploadProcurementSigned: vi.fn(),
  deleteProcurementOrder: mocks.deleteOrder,
}));
vi.mock('#/api/fdmplatform/procurement-finance', () => ({
  getProcurementFinanceSummary: mocks.finance,
}));
vi.mock('../../finance/procurement/components/FinanceDocument.vue', () => ({
  default: defineComponent({ render: () => null }),
}));
vi.mock('../../finance/procurement/components/PaymentRecordDialog.vue', () => ({
  default: defineComponent({
    props: ['available'],
    setup: (props) => () =>
      h(
        'span',
        { 'data-payment-available': true },
        String(props.available ?? ''),
      ),
  }),
}));
vi.mock('../../documents/RecordDetail.vue', () => ({
  default: defineComponent({ render: () => null }),
}));
vi.mock('@vben/common-ui', () => ({
  Page: defineComponent({
    setup: (_, ctx) => () => h('main', ctx.slots.default?.()),
  }),
}));
vi.mock('@vben/access', () => ({
  useAccess: () => ({ hasAccessByCodes: () => false }),
}));
vi.mock('@vben/utils', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@vben/utils')>()),
  formatDate: (value: unknown) => String(value ?? ''),
}));
vi.mock('../../components/ActionDialog.vue', () => ({
  default: defineComponent({ render: () => null }),
}));
vi.mock('../../components/AttachmentPanel.vue', () => ({
  default: defineComponent({ render: () => null }),
}));
vi.mock('../../components/RecordTable.vue', () => ({
  default: defineComponent({ render: () => null }),
}));
vi.mock('../../documents/DocumentAction.vue', () => ({
  default: defineComponent({
    props: {
      action: { type: String, default: undefined },
      contractId: { type: String, default: undefined },
      kind: { type: String, default: undefined },
      lockContract: Boolean,
      open: Boolean,
      source: { type: Object, default: undefined },
    },
    emits: ['close', 'updated'],
    setup: (props, ctx) => () =>
      props.open
        ? h(
            'section',
            {
              'data-related-action': props.action,
              'data-kind': props.kind,
              'data-contract-id': props.contractId,
              'data-contract-locked': String(props.lockContract),
              'data-source': JSON.stringify(props.source),
            },
            [
              h('button', { onClick: () => ctx.emit('close') }, '取消关联建单'),
              h(
                'button',
                {
                  onClick: () =>
                    ctx.emit('updated', {
                      id: props.contractId ?? 'contract-1',
                      version: 2,
                    }),
                },
                '保存关联单据',
              ),
            ],
          )
        : null,
  }),
}));
vi.mock('../../components/ContractDocumentDialog.vue', () => ({
  default: defineComponent({
    props: {
      contract: { type: Object, default: undefined },
      kind: { type: String, default: undefined },
      open: Boolean,
    },
    emits: ['close', 'updated'],
    setup: (props, ctx) => () =>
      props.open
        ? h(
            'section',
            {
              'data-related-list': props.kind,
              'data-contract-id': props.contract?.id,
            },
            [
              h(
                'button',
                { onClick: () => ctx.emit('close') },
                '关闭关联单据列表',
              ),
              h(
                'button',
                { onClick: () => ctx.emit('updated', props.contract) },
                '更新关联方案',
              ),
            ],
          )
        : null,
  }),
}));
vi.mock('../../documents/MigrationSource.vue', () => ({
  default: defineComponent({ render: () => null }),
}));
vi.mock('../../finance/procurement/components/OrderFinance.vue', () => ({
  default: defineComponent({ render: () => null }),
}));
vi.mock('./components/StandaloneOrderFiles.vue', () => ({
  default: defineComponent({ render: () => null }),
}));
vi.mock('./components/OrderDetails.vue', () => ({
  default: defineComponent({
    emits: ['dirty', 'saveExtras'],
    setup: (_, ctx) => {
      const dirty = ref(false);
      const payload = {
        lineExtras: [],
        detailColumns: [{ id: 'note', title: '特殊备注', type: 'TEXT' }],
        additionalLines: [
          { id: 'fee', name: '加工费', quantity: 1, unitPrice: 25 },
        ],
        sharedColumns: [],
        accessories: [],
        packagingSteps: [],
      };
      ctx.expose({
        isDirty: () => dirty.value,
        markSaved: () => {
          dirty.value = false;
          ctx.emit('dirty', false);
        },
        pendingSave: () => ({ action: 'SAVE_EXTRAS', payload }),
      });
      return () =>
        h('div', [
          h(
            'button',
            {
              onClick: () => {
                dirty.value = true;
                ctx.emit('dirty', true);
              },
            },
            '修改附加资料',
          ),
          h(
            'button',
            { onClick: () => ctx.emit('saveExtras', payload) },
            '保存附加资料',
          ),
        ]);
    },
  }),
}));
vi.mock('./components/OrderLines.vue', () => ({
  default: defineComponent({ render: () => null }),
}));
vi.mock('#/api/fdmaicheck', () => ({
  getAiReviewStatuses: vi.fn().mockResolvedValue({}),
}));
vi.mock('#/views/fdmaicheck/components/AiCheckPanel.vue', () => ({
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
  default: defineComponent({
    props: ['orderAmount', 'unpaid', 'paid'],
    setup: (props) => () =>
      h('section', { 'data-order-summary': true }, [
        h(
          'span',
          { 'data-order-total': true },
          String(props.orderAmount ?? ''),
        ),
        h('span', { 'data-order-unpaid': true }, String(props.unpaid ?? '')),
        h('span', { 'data-order-paid': true }, String(props.paid ?? '')),
      ]),
  }),
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
vi.mock('./model', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./model')>()),
  downloadBlob: vi.fn(),
}));
vi.mock('./components/OrderContract.vue', () => ({
  default: defineComponent({ render: () => null }),
}));
vi.mock('../../documents/BusinessDocumentDetail.vue', () => ({
  default: defineComponent({
    props: { id: { type: String, default: undefined }, open: Boolean },
    emits: ['close'],
    setup: (props, ctx) => () =>
      props.open
        ? h('section', { 'data-business-id': props.id }, [
            props.id,
            h('button', { onClick: () => ctx.emit('close') }, '关闭单据'),
          ])
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
  const table = defineComponent({
    props: {
      dataSource: {
        type: Array as PropType<Record<string, unknown>[]>,
        default: () => [],
      },
      columns: {
        type: Array as PropType<{ key: string }[]>,
        default: () => [],
      },
    },
    setup: (props, ctx) => () =>
      h(
        'div',
        props.dataSource.map((record) =>
          h(
            'article',
            { 'data-order-id': record.id },
            props.columns.map((column) =>
              ctx.slots.bodyCell?.({ record, column }),
            ),
          ),
        ),
      ),
  });
  return {
    Alert: defineComponent({
      props: { message: { type: String, default: undefined } },
      setup: (props) => () => h('p', { role: 'alert' }, props.message),
    }),
    Button: button,
    Card: block,
    Drawer: defineComponent({
      props: { open: Boolean },
      setup: (props, ctx) => () =>
        props.open
          ? h('section', [ctx.slots.extra?.(), ctx.slots.default?.()])
          : null,
    }),
    Empty: block,
    Progress: block,
    Input: { Search: block },
    Select: block,
    Space: block,
    Table: table,
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
    Tabs: block,
    Tag: block,
    Modal: { confirm: mocks.confirm, warning: vi.fn() },
    message: { error: vi.fn(), success: vi.fn(), warning: vi.fn() },
  };
});
function nativeRows() {
  return Array.from({ length: 6 }, (_, index) => ({
    id: `po-${index + 1}`,
    standaloneId: `po-${index + 1}`,
    recordType: 'PURCHASE_ORDER',
    contractId: 'jz-contract-9676',
    contractCode: 'DD20251008193005',
    supplierName: '温州供应商',
    supplierId: 'supplier-1',
    record: {
      id: `po-${index + 1}`,
      code: `CG-${index + 1}`,
      status: 'NEEDS_COMPLETION',
      lines: [],
    },
    details: {},
    allowedActions: ['SAVE_DETAILS'],
  }));
}
function contractFixture() {
  return {
    id: 'contract-1',
    code: 'HT-1',
    name: '采购合同',
    version: 1,
    status: 'EXECUTING',
    currency: 'CNY',
    companyId: 1,
    items: [],
    allowedActions: ['GENERATE_ORDERS', 'RECORD_ARRIVAL', 'RETURN_ARRIVAL'],
    purchaseOrders: ['order-1', 'order-2'].map((id) => ({
      id,
      code: id,
      status: 'ORDERED',
      currency: 'CNY',
      supplierName: '测试供应商',
      lines: [
        {
          id: 'line-1',
          unit: '件',
          quantity: 10,
          arrivedQuantity: 4,
          cancelledQuantity: 0,
          returnedQuantity: 0,
        },
      ],
    })),
  };
}
function orderFixture(id = 'order-1') {
  return {
    id,
    contractId: 'contract-1',
    version: 1,
    order: contractFixture().purchaseOrders.find((order) => order.id === id),
    details: { version: 1 },
    allowedActions: [],
    history: [],
    exports: [],
  };
}
const dispose: (() => void)[] = [];
beforeEach(() => {
  vi.clearAllMocks();
  mocks.overview.mockResolvedValue({
    orders: 0,
    open: 0,
    overdue: 0,
    maxOverdueDays: 0,
    unsigned: 0,
    unpaid: 0,
    asOf: '2026-10-08',
    openAmount: {},
    unpaidAmount: {},
    arrivedUnpaidAmount: {},
    attention: [],
  });
  mocks.page.mockResolvedValue({ list: nativeRows(), total: 6 });
  mocks.contract.mockImplementation(async () => contractFixture());
  mocks.detail.mockImplementation(async (_contractId, id) => orderFixture(id));
  mocks.action.mockImplementation(async (_contractId, id) => ({
    ...orderFixture(id),
    details: { version: 2, status: 'CONFIRMED' },
  }));
  mocks.confirm.mockReturnValue({ destroy: vi.fn() });
  mocks.finance.mockResolvedValue({});
});
afterEach(() => {
  for (const close of dispose.splice(0)) close();
});
async function settle() {
  for (let i = 0; i < 6; i++) {
    await new Promise((resolve) => setTimeout(resolve, 0));
    await nextTick();
  }
}
async function mount(
  location = '/fdmprocurement/platform-orders?contractId=jz-contract-9676',
) {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/fdmprocurement/platform-orders', component: Workspace },
      {
        path: '/elsewhere',
        component: defineComponent({ render: () => null }),
      },
    ],
  });
  await router.push(location);
  await router.isReady();
  const host = document.createElement('div');
  document.body.append(host);
  const app = createApp({ render: () => h(RouterView) });
  app.use(router);
  app.mount(host);
  dispose.push(() => {
    app.unmount();
    host.remove();
  });
  await settle();
  return { host, router };
}
function click(host: HTMLElement, text: string) {
  const button = [...host.querySelectorAll('button')].find(
    (item) => item.textContent?.trim() === text,
  );
  expect(button).toBeDefined();
  button!.click();
}
describe('unified native purchase workspace', () => {
  it('displays six linked standalone orders and opens their actual identity without looking up contract arrays', async () => {
    const { host, router } = await mount();
    expect(mocks.page).toHaveBeenCalledWith(
      expect.objectContaining({ contractId: 'jz-contract-9676' }),
    );
    expect(host.querySelectorAll('[data-order-id]')).toHaveLength(6);
    expect(host.textContent).toContain('温州供应商');
    const supplierLink = host.querySelector('a[href*="supplierId=supplier-1"]');
    expect(supplierLink?.textContent).toBe('温州供应商');
    expect(
      [...host.querySelectorAll('a')]
        .filter((link) =>
          link.getAttribute('href')?.includes('contractId=jz-contract-9676'),
        )
        .every((link) => link.textContent?.trim()),
    ).toBe(true);
    const button = [...host.querySelectorAll('button')].find((item) =>
      item.textContent?.includes('CG-3'),
    );
    expect(button).toBeDefined();
    button!.click();
    await settle();
    expect(router.currentRoute.value.query).toMatchObject({
      contractId: 'jz-contract-9676',
    });
    expect(router.currentRoute.value.query.documentId).toBeUndefined();
    expect(
      host.querySelector<HTMLElement>('[data-business-id="po-3"]'),
    ).not.toBeNull();
    expect(mocks.detail).not.toHaveBeenCalled();
    expect(mocks.contract).not.toHaveBeenCalled();
    click(host, '关闭单据');
    await settle();
    expect(router.currentRoute.value.query.standaloneId).toBeUndefined();
    expect(router.currentRoute.value.query.contractId).toBe('jz-contract-9676');
  });
  it('preserves a real list error and clears it after a successful retry', async () => {
    mocks.page.mockRejectedValueOnce(new Error('采购单不属于关联合同'));
    const { host } = await mount();
    expect(host.textContent).toContain('采购单不属于关联合同');
    click(host, '刷新');
    await settle();
    expect(host.querySelectorAll('[data-order-id]')).toHaveLength(6);
    expect(host.textContent).not.toContain('采购单不属于关联合同');
  });
  it('does not leave a previous contract order list visible after the next contract request fails', async () => {
    const { host, router } = await mount();
    expect(host.querySelectorAll('[data-order-id]')).toHaveLength(6);
    mocks.page.mockRejectedValueOnce(new Error('新合同读取失败'));
    await router.push({ query: { contractId: 'other-contract' } });
    await settle();
    expect(host.textContent).toContain('新合同读取失败');
    expect(host.querySelectorAll('[data-order-id]')).toHaveLength(0);
  });
});

describe('related creation inside the purchase workspace', () => {
  const detailLocation =
    '/fdmprocurement/platform-orders?contractId=contract-1&documentId=order-1';
  it('shows only the internal order number in the linked contract text', async () => {
    mocks.contract.mockResolvedValueOnce({
      ...contractFixture(),
      name: 'NX-001',
    });
    const { host } = await mount(detailLocation);
    const link = host.querySelector(
      '.order-context a[href="/fdmwaimao/platform-contracts?contractId=contract-1"]',
    );
    expect(link?.textContent?.trim()).toBe('NX-001');
  });
  it('generates orders directly from the filtered list without leaving the page', async () => {
    const { host, router } = await mount();
    const location = router.currentRoute.value.fullPath;
    click(host, '从方案生成');
    await settle();
    const dialog = host.querySelector<HTMLElement>(
      '[data-related-action="GENERATE_ORDERS"]',
    );
    expect(dialog?.dataset.kind).toBe('orders');
    expect(dialog?.dataset.contractId).toBe('jz-contract-9676');
    expect(dialog?.dataset.contractLocked).toBe('true');
    expect(dialog).not.toBeNull();
    expect(dialog?.dataset.source).toBeUndefined();
    expect(router.currentRoute.value.fullPath).toBe(location);
    click(host, '取消关联建单');
    await settle();
    expect(host.querySelector<HTMLElement>('[data-related-action]')).toBeNull();
    expect(router.currentRoute.value.fullPath).toBe(location);
  });
  it('lets the existing action select a contract on the unfiltered list and refreshes after creation', async () => {
    const { host, router } = await mount('/fdmprocurement/platform-orders');
    click(host, '从方案生成');
    await settle();
    const dialog = host.querySelector<HTMLElement>(
      '[data-related-action="GENERATE_ORDERS"]',
    );
    expect(dialog?.dataset.contractLocked).toBe('false');
    expect(dialog).not.toBeNull();
    expect(dialog?.dataset.contractId).toBeUndefined();
    click(host, '保存关联单据');
    await settle();
    // The completion-queue size request is separate from the list refresh.
    expect(
      mocks.page.mock.calls.filter(
        ([params]) => params?.pendingCompletion !== true,
      ),
    ).toHaveLength(2);
    expect(host.querySelector<HTMLElement>('[data-related-action]')).toBeNull();
    expect(router.currentRoute.value.fullPath).toBe(
      '/fdmprocurement/platform-orders',
    );
  });
  it('passes the current order into stock-in and return creation and refreshes the parent after saving', async () => {
    const { host, router } = await mount(detailLocation);
    click(host, '入库单');
    await settle();
    const dialog = host.querySelector<HTMLElement>('[data-stock-in]');
    expect(dialog?.dataset.stockIn).toBe('order-1');
    expect(dialog?.dataset.contract).toBe('contract-1');
    expect(router.currentRoute.value.fullPath).toBe(detailLocation);
    click(host, '取消入库');
    await settle();
    expect(mocks.detail).toHaveBeenCalledTimes(1);
    click(host, '采购退货单');
    await settle();
    const returns = host.querySelector<HTMLElement>(
      '[data-related-action="RETURN_ARRIVAL"]',
    );
    expect(returns?.dataset.kind).toBe('purchaseReturns');
    expect(JSON.parse(returns!.dataset.source!)).toEqual({
      kind: 'orders',
      id: 'order-1',
    });
    click(host, '保存关联单据');
    await settle();
    expect(mocks.detail).toHaveBeenCalledTimes(2);
    expect(mocks.contract).toHaveBeenCalledTimes(2);
    expect(host.querySelector<HTMLElement>('[data-related-action]')).toBeNull();
    expect(router.currentRoute.value.fullPath).toBe(detailLocation);
  });
  it('opens related plans in the current workspace and clears nested dialogs when changing the parent', async () => {
    const { host, router } = await mount(detailLocation);
    click(host, '采购方案变更');
    await settle();
    expect(
      host.querySelector<HTMLElement>('[data-related-list="plans"]')?.dataset
        .contractId,
    ).toBe('contract-1');
    expect(router.currentRoute.value.fullPath).toBe(detailLocation);
    click(host, '更新关联方案');
    await settle();
    expect(mocks.detail).toHaveBeenCalledTimes(2);
    expect(
      host.querySelector<HTMLElement>('[data-related-list="plans"]'),
    ).not.toBeNull();
    await router.push({
      query: { contractId: 'contract-1', documentId: 'order-2' },
    });
    await settle();
    expect(host.querySelector<HTMLElement>('[data-related-list]')).toBeNull();
    click(host, '入库单');
    await settle();
    expect(
      host.querySelector<HTMLElement>('[data-stock-in]')?.dataset.stockIn,
    ).toBe('order-2');
    await router.push({ query: { contractId: 'contract-1' } });
    await settle();
    expect(host.querySelector<HTMLElement>('[data-stock-in]')).toBeNull();
    click(host, '从方案生成');
    await settle();
    const generation = host.querySelector<HTMLElement>('[data-related-action]');
    expect(generation).not.toBeNull();
    expect(generation?.dataset.source).toBeUndefined();
  });
});

describe('purchase extras persistence and unsaved navigation', () => {
  const location =
    '/fdmprocurement/platform-orders?contractId=contract-1&documentId=order-1';

  it('saves draft extras from the visible header without submitting the order', async () => {
    mocks.detail.mockImplementation(async (_contractId, id) => ({
      ...orderFixture(id),
      order: { ...orderFixture(id).order, status: 'DRAFT' },
      allowedActions: ['SAVE_DETAILS', 'SAVE_EXTRAS', 'EDIT_ORDER'],
    }));
    const { host } = await mount(location);
    expect(host.textContent).toContain('草稿可以继续编辑');
    click(host, '修改附加资料');
    await settle();
    click(host, '保存资料');
    await settle();
    expect(mocks.action).toHaveBeenCalledTimes(1);
    expect(mocks.action.mock.calls[0]![2].action).toBe('SAVE_EXTRAS');
  });

  it('saves edited draft details before exporting PDF without confirming the order', async () => {
    const draft = {
      ...orderFixture(),
      order: { ...orderFixture().order, status: 'DRAFT' },
      details: { version: 1, status: 'DRAFT' },
      allowedActions: [
        'SAVE_DETAILS',
        'SAVE_EXTRAS',
        'EDIT_ORDER',
        'EXPORT_CONTRACT',
      ],
    };
    const file = { id: 'file-1', name: '采购单-未确认.pdf' };
    mocks.detail.mockResolvedValue(draft);
    mocks.action.mockResolvedValue({
      ...draft,
      details: { ...draft.details, version: 2 },
    });
    mocks.exportOrder.mockResolvedValue({ ...draft, exports: [file] });
    mocks.download.mockResolvedValue(new Blob());
    const { host } = await mount(location);
    click(host, '修改附加资料');
    await settle();
    click(host, '导出未确认稿（PDF）');
    await settle();
    expect(mocks.action).toHaveBeenCalledExactlyOnceWith(
      'contract-1',
      'order-1',
      expect.objectContaining({ action: 'SAVE_EXTRAS', expectedVersion: 1 }),
    );
    expect(mocks.exportOrder).toHaveBeenCalledExactlyOnceWith(
      'contract-1',
      'order-1',
      expect.objectContaining({ format: 'PDF', expectedVersion: 2 }),
    );
    expect(mocks.download).toHaveBeenCalledExactlyOnceWith(
      'contract-1',
      'order-1',
      file.id,
    );
  });

  it('prompts to save unfinished extras before opening the submit editor', async () => {
    mocks.detail.mockImplementation(async (_contractId, id) => ({
      ...orderFixture(id),
      order: { ...orderFixture(id).order, status: 'DRAFT' },
      allowedActions: ['SAVE_DETAILS', 'SAVE_EXTRAS', 'EDIT_ORDER'],
    }));
    const { host } = await mount(location);
    click(host, '修改附加资料');
    await settle();
    click(host, '编辑 / 提交审核');
    await settle();
    expect(mocks.confirm.mock.calls.at(-1)![0].title).toBe('采购资料尚未保存');
    mocks.confirm.mock.calls.at(-1)![0].onCancel();
    await settle();
    expect(mocks.action).not.toHaveBeenCalled();
  });

  it('deletes an allowed terminated order only after a reason is entered', async () => {
    mocks.detail.mockImplementation(async (_contractId, id) => ({
      ...orderFixture(id),
      order: { ...orderFixture(id).order, status: 'CLOSED' },
      allowedActions: ['DELETE_ORDER'],
    }));
    mocks.deleteOrder.mockResolvedValue(true);
    const { host, router } = await mount(location);
    expect(
      [...host.querySelectorAll('button')].some(
        (button) => button.textContent?.trim() === '采购终止',
      ),
    ).toBe(false);
    click(host, '删除采购单');
    const dialog = mocks.confirm.mock.calls.at(-1)![0];
    await expect(dialog.onOk()).rejects.toThrow('missing reason');
    expect(mocks.deleteOrder).not.toHaveBeenCalled();
    dialog.content().children[1].props['onUpdate:value']('误转采购单');
    await dialog.onOk();
    await settle();
    expect(mocks.deleteOrder).toHaveBeenCalledWith(
      'contract-1',
      'order-1',
      expect.objectContaining({ reason: '误转采购单' }),
    );
    expect(router.currentRoute.value.query.documentId).toBeUndefined();
  });

  it('hides deletion when the server does not allow it', async () => {
    const { host } = await mount(location);
    expect(host.textContent).not.toContain('删除采购单');
  });

  it('explains why a terminated order with business records cannot be deleted', async () => {
    mocks.detail.mockImplementation(async (_contractId, id) => ({
      ...orderFixture(id),
      order: { ...orderFixture(id).order, status: 'CLOSED' },
      deleteOrderBlockReasons: ['已有到货或退货记录，不能删除采购单'],
    }));
    const { host } = await mount(location);
    const button = [...host.querySelectorAll('button')].find(
      (item) => item.textContent?.trim() === '删除采购单',
    );
    expect(button?.disabled).toBe(true);
    expect(button?.title).toBe('已有到货或退货记录，不能删除采购单');
  });

  it('saves extras with their own action and preserves the server confirmation state', async () => {
    const { host } = await mount(location);
    click(host, '修改附加资料');
    await settle();
    click(host, '保存附加资料');
    await settle();
    expect(mocks.action).toHaveBeenCalledWith(
      'contract-1',
      'order-1',
      expect.objectContaining({
        action: 'SAVE_EXTRAS',
        expectedVersion: 1,
        payload: expect.objectContaining({
          detailColumns: [{ id: 'note', title: '特殊备注', type: 'TEXT' }],
          additionalLines: [
            { id: 'fee', name: '加工费', quantity: 1, unitPrice: 25 },
          ],
        }),
      }),
    );
    const request = mocks.action.mock.calls[0]![2];
    expect(request.payload).not.toHaveProperty('status');
    expect(request.payload).not.toHaveProperty('signingEntityId');
    const unload = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(unload);
    expect(unload.defaultPrevented).toBe(false);
  });

  it('keeps edits when navigation is cancelled and saves before continuing', async () => {
    const { host, router } = await mount(location);
    click(host, '修改附加资料');
    await settle();
    const cancelledNavigation = router.push('/elsewhere');
    await settle();
    expect(router.currentRoute.value.path).toBe(
      '/fdmprocurement/platform-orders',
    );
    mocks.confirm.mock.calls.at(-1)![0].onCancel();
    await cancelledNavigation;
    const unload = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(unload);
    expect(unload.defaultPrevented).toBe(true);

    const savedNavigation = router.push('/elsewhere');
    await settle();
    await mocks.confirm.mock.calls.at(-1)![0].onOk();
    await savedNavigation;
    expect(mocks.action).toHaveBeenCalledWith(
      'contract-1',
      'order-1',
      expect.objectContaining({ action: 'SAVE_EXTRAS' }),
    );
    expect(router.currentRoute.value.path).toBe('/elsewhere');
  });

  it('reloads the financial summary immediately after expense rows are saved', async () => {
    mocks.finance
      .mockResolvedValueOnce({
        orderAmount: '100.00',
        unpaidAmount: '80.00',
        paidAmount: '20.00',
        availablePaymentAmount: '80.00',
      })
      .mockResolvedValueOnce({
        orderAmount: '125.00',
        unpaidAmount: '105.00',
        paidAmount: '20.00',
        availablePaymentAmount: '105.00',
      });
    const { host } = await mount(location);
    expect(mocks.finance).toHaveBeenCalledTimes(1);
    expect(host.querySelector('[data-order-total]')?.textContent).toBe(
      '100.00',
    );
    expect(host.querySelector('[data-order-unpaid]')?.textContent).toBe(
      '80.00',
    );
    expect(host.querySelector('[data-payment-available]')?.textContent).toBe(
      '80.00',
    );
    click(host, '修改附加资料');
    await settle();
    click(host, '保存附加资料');
    await settle();
    expect(mocks.finance).toHaveBeenCalledTimes(2);
    expect(mocks.finance).toHaveBeenLastCalledWith('contract-1', 'order-1');
    expect(host.querySelector('[data-order-total]')?.textContent).toBe(
      '125.00',
    );
    expect(host.querySelector('[data-order-unpaid]')?.textContent).toBe(
      '105.00',
    );
    expect(host.querySelector('[data-order-paid]')?.textContent).toBe('20.00');
    expect(host.querySelector('[data-payment-available]')?.textContent).toBe(
      '105.00',
    );
  });

  it('keeps the detail drawer and unsaved edits after save failure', async () => {
    const { host, router } = await mount(location);
    click(host, '修改附加资料');
    await settle();
    mocks.action.mockRejectedValueOnce(new Error('附加资料保存失败'));
    const navigation = router.push('/elsewhere');
    await settle();
    const prompt = mocks.confirm.mock.calls.at(-1)![0];
    await expect(prompt.onOk()).rejects.toThrow('采购资料未保存');
    expect(router.currentRoute.value.query.documentId).toBe('order-1');
    expect(host.textContent).toContain('附加资料保存失败');
    const unload = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(unload);
    expect(unload.defaultPrevented).toBe(true);
    prompt.onCancel();
    await navigation;
  });
});
