/* eslint-disable vue/one-component-per-file -- Small UI adapters exercise the actual purchase workspace and its router. */
import type { PropType } from 'vue';

import { createApp, defineComponent, h, nextTick } from 'vue';
import { createMemoryHistory, createRouter, RouterView } from 'vue-router';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import Workspace from './index.vue';
const mocks = vi.hoisted(() => ({
  page: vi.fn(),
  detail: vi.fn(),
  contract: vi.fn(),
}));
vi.mock('../../documents/procurement-tabs', () => ({}));
vi.mock('#/api/fdmplatform', () => ({
  getAttachments: vi.fn(),
  getContract: mocks.contract,
  newIdempotencyKey: () => 'test-key',
}));
vi.mock('#/api/fdmplatform/procurement', () => ({
  getProcurementOrders: mocks.page,
  getProcurementOrder: mocks.detail,
  downloadProcurementFile: vi.fn(),
  exportProcurementOrder: vi.fn(),
  procurementOrderAction: vi.fn(),
  uploadProcurementSigned: vi.fn(),
}));
vi.mock('#/api/fdmplatform/procurement-finance', () => ({
  getProcurementFinanceSummary: vi.fn().mockResolvedValue({}),
}));
vi.mock('../../finance/procurement/components/FinanceDocument.vue', () => ({
  default: defineComponent({ render: () => null }),
}));
vi.mock('../../documents/RecordDetail.vue', () => ({
  default: defineComponent({ render: () => null }),
}));
vi.mock('@vben/common-ui', () => ({
  Page: defineComponent({
    setup: (_, ctx) => () => h('main', ctx.slots.default?.()),
  }),
}));
vi.mock('@vben/utils', () => ({
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
vi.mock('./components/OrderDetails.vue', () => ({
  default: defineComponent({ render: () => null }),
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
        props.open ? h('section', ctx.slots.default?.()) : null,
    }),
    Empty: block,
    Progress: block,
    Input: { Search: block },
    Select: block,
    Space: block,
    Table: table,
    TabPane: block,
    Tabs: block,
    Tag: block,
    message: { success: vi.fn() },
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
    status: 'ACTIVE',
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
  mocks.page.mockResolvedValue({ list: nativeRows(), total: 6 });
  mocks.contract.mockImplementation(async () => contractFixture());
  mocks.detail.mockImplementation(async (_contractId, id) => orderFixture(id));
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
  it('generates orders directly from the filtered list without leaving the page', async () => {
    const { host, router } = await mount();
    const location = router.currentRoute.value.fullPath;
    click(host, '生成采购单');
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
    click(host, '生成采购单');
    await settle();
    const dialog = host.querySelector<HTMLElement>(
      '[data-related-action="GENERATE_ORDERS"]',
    );
    expect(dialog?.dataset.contractLocked).toBe('false');
    expect(dialog).not.toBeNull();
    expect(dialog?.dataset.contractId).toBeUndefined();
    click(host, '保存关联单据');
    await settle();
    expect(mocks.page).toHaveBeenCalledTimes(2);
    expect(host.querySelector<HTMLElement>('[data-related-action]')).toBeNull();
    expect(router.currentRoute.value.fullPath).toBe(
      '/fdmprocurement/platform-orders',
    );
  });
  it('passes the current order into arrival and return creation and refreshes the parent after saving', async () => {
    const { host, router } = await mount(detailLocation);
    click(host, '登记到货');
    await settle();
    const dialog = host.querySelector<HTMLElement>(
      '[data-related-action="RECORD_ARRIVAL"]',
    );
    expect(dialog?.dataset.kind).toBe('arrivals');
    expect(dialog?.dataset.contractId).toBe('contract-1');
    expect(dialog?.dataset.contractLocked).toBe('true');
    expect(JSON.parse(dialog!.dataset.source!)).toEqual({
      kind: 'orders',
      id: 'order-1',
    });
    expect(router.currentRoute.value.fullPath).toBe(detailLocation);
    click(host, '取消关联建单');
    await settle();
    expect(mocks.detail).toHaveBeenCalledTimes(1);
    click(host, '采购退货');
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
    click(host, '登记到货');
    await settle();
    expect(
      JSON.parse(
        host.querySelector<HTMLElement>('[data-related-action]')!.dataset
          .source!,
      ),
    ).toEqual({ kind: 'orders', id: 'order-2' });
    await router.push({ query: { contractId: 'contract-1' } });
    await settle();
    expect(host.querySelector<HTMLElement>('[data-related-action]')).toBeNull();
    click(host, '生成采购单');
    await settle();
    const generation = host.querySelector<HTMLElement>('[data-related-action]');
    expect(generation).not.toBeNull();
    expect(generation?.dataset.source).toBeUndefined();
  });
});
