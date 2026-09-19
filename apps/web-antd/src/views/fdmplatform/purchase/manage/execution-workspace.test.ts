/* eslint-disable vue/one-component-per-file -- Small UI adapters verify actual workspace state and routing. */
import type { PropType } from 'vue';

import { createApp, defineComponent, h, nextTick } from 'vue';
import { createMemoryHistory, createRouter } from 'vue-router';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import Workspace from './index.vue';

const mocks = vi.hoisted(() => ({
  list: vi.fn(),
  detail: vi.fn(),
  contract: vi.fn(),
  finance: vi.fn(),
}));
vi.mock('#/api/fdmplatform', () => ({
  getContract: mocks.contract,
  getAttachments: vi.fn(),
  newIdempotencyKey: vi.fn(() => 'key'),
}));
vi.mock('#/api/fdmplatform/procurement', () => ({
  getProcurementOrders: mocks.list,
  getProcurementOrder: mocks.detail,
  downloadProcurementFile: vi.fn(),
  exportProcurementOrder: vi.fn(),
  procurementOrderAction: vi.fn(),
  uploadProcurementSigned: vi.fn(),
}));
vi.mock('#/api/fdmplatform/procurement-finance', () => ({
  getProcurementFinanceSummary: mocks.finance,
}));
vi.mock('../../documents/procurement-tabs', () => ({}));
vi.mock('@vben/common-ui', () => ({
  Page: defineComponent({
    setup: (_, ctx) => () => h('main', ctx.slots.default?.()),
  }),
}));
vi.mock('@vben/utils', () => ({ formatDate: (value: unknown) => value }));
vi.mock('../../components/ActionDialog.vue', () => ({
  default: defineComponent({ render: () => null }),
}));
vi.mock('../../components/AttachmentPanel.vue', () => ({
  default: defineComponent({ render: () => null }),
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
vi.mock('./components/OrderContract.vue', () => ({
  default: defineComponent({ render: () => null }),
}));
vi.mock('./components/OrderDetails.vue', () => ({
  default: defineComponent({ render: () => null }),
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
    TabPane: block,
    Tabs: block,
    message: { success: vi.fn() },
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
    details: { status: 'DRAFT', version: 0, clauseIds: [] },
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
beforeEach(() => {
  vi.clearAllMocks();
  mocks.list.mockResolvedValue({ list: [row()], total: 21 });
  mocks.contract.mockResolvedValue(contract());
  mocks.detail.mockResolvedValue(detail());
  mocks.finance.mockResolvedValue({
    currency: 'CNY',
    orderAmount: '100',
    paidAmount: '40',
    unpaidAmount: '60',
    availableRequestAmount: '25',
  });
});
afterEach(() => {
  for (const dispose of disposals.splice(0)) dispose();
});

describe('采购订单原页执行', () => {
  it('打开和关闭执行侧栏不改变路由、筛选、分页或重新拉取列表', async () => {
    const { host, router } = await mount('?keyword=工厂&page=2');
    const original = router.currentRoute.value.fullPath;
    const count = mocks.list.mock.calls.length;
    button(host, 'CG-001').click();
    await settle();
    expect(host.querySelector<HTMLElement>('[data-drawer]')).not.toBeNull();
    expect(host.querySelector<HTMLElement>('[data-table]')).not.toBeNull();
    expect(router.currentRoute.value.fullPath).toBe(original);
    button(host, '关闭执行详情').click();
    await settle();
    expect(host.querySelector<HTMLElement>('[data-drawer]')).toBeNull();
    expect(mocks.list).toHaveBeenCalledTimes(count);
    expect(host.querySelector('input')?.value).toBe('工厂');
    expect(mocks.list).toHaveBeenLastCalledWith(
      expect.objectContaining({
        pageNo: 2,
        contractId: undefined,
        keyword: '工厂',
      }),
    );
  });
  it('登记到货继承源订单并锁定合同，保存后更新原页并保留选择', async () => {
    const { host, router } = await mount('?page=2');
    button(host, 'CG-001').click();
    await settle();
    button(host, '登记到货').click();
    await settle();
    const action = host.querySelector<HTMLElement>('[data-action]')!;
    expect(action.dataset.action).toBe('RECORD_ARRIVAL');
    expect(action.dataset.contract).toBe('contract-a');
    expect(action.dataset.source).toBe(
      JSON.stringify({ kind: 'orders', id: 'po-a' }),
    );
    expect(action.dataset.locked).toBe('true');
    expect(button(host, '关闭执行详情').disabled).toBe(true);
    button(host, '完成办理').click();
    await settle();
    expect(host.querySelector<HTMLElement>('[data-action]')).toBeNull();
    expect(host.querySelector<HTMLElement>('[data-drawer]')).not.toBeNull();
    expect(mocks.list).toHaveBeenLastCalledWith(
      expect.objectContaining({ pageNo: 2 }),
    );
    expect(router.currentRoute.value.query.contractId).toBeUndefined();
  });
  it('请款使用服务端可请款余额，报销也直接关联当前订单', async () => {
    const { host } = await mount();
    button(host, 'CG-001').click();
    await settle();
    button(host, '申请付款').click();
    await settle();
    expect(
      JSON.parse(
        host.querySelector<HTMLElement>('[data-finance-type]')!.dataset
          .context!,
      ),
    ).toEqual({
      contractId: 'contract-a',
      orderId: 'po-a',
      currency: 'CNY',
      amount: '25',
    });
    button(host, '关闭财务单据').click();
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
    expect(button(host, 'CG-001')).toBeDefined();
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
    button(host, 'CG-001').click();
    await settle();
    expect(
      host.querySelector<HTMLElement>('[data-standalone]')?.dataset.standalone,
    ).toBe('historical-a');
    button(host, '关闭历史订单').click();
    await settle();
    expect(host.querySelector<HTMLElement>('[data-standalone]')).toBeNull();
  });
  it('不存在未到余额时隐藏登记到货，付款资料未读取时不启用请款', async () => {
    const complete = detail();
    complete.order.lines[0]!.arrivedQuantity = 10;
    complete.order.status = 'RECEIVED';
    mocks.detail.mockResolvedValue(complete);
    mocks.finance.mockResolvedValue({});
    const { host } = await mount();
    button(host, 'CG-001').click();
    await settle();
    expect(
      [...host.querySelectorAll('button')].some(
        (entry) => entry.textContent?.trim() === '登记到货',
      ),
    ).toBe(false);
    expect(button(host, '申请付款').disabled).toBe(true);
    expect(host.textContent).toContain('待核实');
  });
  it('付款页内的关联子表单打开时阻止关闭执行抽屉，关闭子表单后恢复', async () => {
    const { host } = await mount();
    button(host, 'CG-001').click();
    await settle();
    button(host, '付款页打开子表单').click();
    await settle();
    expect(button(host, '关闭执行详情').disabled).toBe(true);
    button(host, '付款页关闭子表单').click();
    await settle();
    expect(button(host, '关闭执行详情').disabled).toBe(false);
  });
});
