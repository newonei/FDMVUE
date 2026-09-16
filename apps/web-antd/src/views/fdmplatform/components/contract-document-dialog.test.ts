/* eslint-disable vue/one-component-per-file -- Small child adapters exercise the real dialog, request lifecycle and router without Ant Design overlays. */
import type { PropType } from 'vue';

import type { ContractDocumentKind } from './contract-document-launcher';

import type { Contract, DocumentRow, PageResult } from '#/api/fdmplatform';

import { createApp, defineComponent, h, nextTick, reactive } from 'vue';
import { createMemoryHistory, createRouter } from 'vue-router';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import ContractDocumentDialog from './ContractDocumentDialog.vue';

const mocks = vi.hoisted(() => ({
  page: vi.fn(),
  contract: vi.fn(),
  nextContract: undefined as Contract | undefined,
  businessResult: undefined as Record<string, unknown> | undefined,
}));
vi.mock('#/api/fdmplatform', () => ({
  getBusinessPage: mocks.page,
  getContract: mocks.contract,
}));
vi.mock('../documents/DocumentAction.vue', () => ({
  default: defineComponent({
    props: {
      open: Boolean,
      lockContract: Boolean,
      contractId: { type: String, default: undefined },
      kind: { type: String, default: undefined },
      action: { type: String, default: undefined },
      row: { type: Object as PropType<DocumentRow>, default: undefined },
    },
    emits: ['close', 'updated'],
    setup: (props, ctx) => () =>
      props.open
        ? h(
            'section',
            {
              'data-action': props.action,
              'data-action-kind': props.kind,
              'data-contract': props.contractId,
              'data-locked': String(props.lockContract),
              'data-action-row': props.row?.id,
            },
            [
              h('button', { onClick: () => ctx.emit('close') }, '关闭建单'),
              h(
                'button',
                {
                  onClick: () => {
                    ctx.emit('updated', mocks.nextContract);
                    ctx.emit('close');
                  },
                },
                '完成建单',
              ),
            ],
          )
        : null,
  }),
}));
vi.mock('../documents/RecordDetail.vue', () => ({
  default: defineComponent({
    props: {
      open: Boolean,
      embedded: Boolean,
      row: { type: Object as PropType<DocumentRow>, default: undefined },
    },
    emits: ['close', 'updated', 'navigate'],
    setup: (props, ctx) => () =>
      props.open
        ? h(
            'section',
            {
              'data-detail-id': props.row?.id,
              'data-embedded': String(props.embedded),
            },
            [
              h('button', { onClick: () => ctx.emit('close') }, '关闭明细'),
              h('button', { onClick: () => ctx.emit('updated') }, '明细已更新'),
              h(
                'button',
                { onClick: () => ctx.emit('navigate', 'arrivals') },
                '办理关联到货',
              ),
            ],
          )
        : null,
  }),
}));
vi.mock('../documents/BusinessDocumentDetail.vue', () => ({
  default: defineComponent({
    props: {
      open: Boolean,
      embedded: Boolean,
      id: { type: String, default: undefined },
    },
    emits: ['close', 'updated'],
    setup: (props, ctx) => () =>
      props.open
        ? h(
            'section',
            {
              'data-standalone-id': props.id,
              'data-embedded': String(props.embedded),
            },
            [
              h('button', { onClick: () => ctx.emit('close') }, '关闭原生单据'),
              h(
                'button',
                { onClick: () => ctx.emit('updated', mocks.businessResult) },
                '原生单据已更新',
              ),
            ],
          )
        : null,
  }),
}));
vi.mock('./CustomsPanel.vue', () => ({
  default: defineComponent({
    props: {
      embedded: Boolean,
      contractId: { type: String, default: undefined },
      companyId: { type: Number, default: undefined },
    },
    emits: ['busy', 'changed'],
    setup: (props, ctx) => () =>
      h(
        'section',
        {
          'data-customs-contract': props.contractId,
          'data-customs-company': props.companyId,
          'data-embedded': String(props.embedded),
        },
        [
          h('button', { onClick: () => ctx.emit('busy', true) }, '编辑报关'),
          h(
            'button',
            {
              onClick: () => {
                ctx.emit('busy', false);
                ctx.emit('changed');
              },
            },
            '报关已更新',
          ),
        ],
      ),
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
        {
          ...ctx.attrs,
          disabled: props.disabled || props.loading,
        },
        ctx.slots.default?.(),
      ),
  });
  const drawer = defineComponent({
    props: {
      open: Boolean,
      closable: { type: Boolean, default: true },
      title: { type: String, default: '' },
    },
    emits: ['close'],
    setup: (props, ctx) => () =>
      props.open
        ? h(
            'section',
            {
              'data-dialog': true,
              'aria-label': props.title,
            },
            [
              h(
                'button',
                {
                  disabled: !props.closable,
                  'data-close-dialog': true,
                  onClick: () => ctx.emit('close'),
                },
                '关闭单据弹窗',
              ),
              ctx.slots.default?.(),
            ],
          )
        : null,
  });
  const input = defineComponent({
    props: { value: { type: String, default: '' }, disabled: Boolean },
    emits: ['update:value', 'pressEnter'],
    setup: (props, ctx) => () =>
      h('input', {
        ...ctx.attrs,
        value: props.value,
        disabled: props.disabled,
        onInput: (event: Event) =>
          ctx.emit('update:value', (event.target as HTMLInputElement).value),
        onKeydown: (event: KeyboardEvent) => {
          if (event.key === 'Enter') ctx.emit('pressEnter');
        },
      }),
  });
  const select = defineComponent({
    props: {
      value: { type: String, default: '' },
      disabled: Boolean,
      options: {
        type: Array as PropType<{ label: string; value: string }[]>,
        default: () => [],
      },
    },
    emits: ['update:value', 'change'],
    setup: (props, ctx) => () =>
      h(
        'select',
        {
          ...ctx.attrs,
          value: props.value,
          disabled: props.disabled,
          onChange: (event: Event) => {
            const value = (event.target as HTMLSelectElement).value;
            ctx.emit('update:value', value);
            ctx.emit('change', value);
          },
        },
        [
          h('option', { value: '' }, ''),
          ...props.options.map((option) =>
            h('option', { value: option.value }, option.label),
          ),
        ],
      ),
  });
  const tabs = defineComponent({
    props: { activeKey: { type: String, default: '' } },
    emits: ['update:activeKey', 'change'],
    setup: (props, ctx) => () =>
      h(
        'nav',
        { 'data-active-tab': props.activeKey },
        ctx.slots.default?.().map((pane) =>
          h(
            'button',
            {
              disabled: pane.props?.disabled,
              onClick: () => {
                ctx.emit('update:activeKey', pane.key);
                ctx.emit('change', pane.key);
              },
            },
            pane.props?.tab,
          ),
        ),
      ),
  });
  const table = defineComponent({
    props: {
      dataSource: { type: Array as PropType<DocumentRow[]>, default: () => [] },
      columns: {
        type: Array as PropType<{ key: string }[]>,
        default: () => [],
      },
      pagination: {
        type: Object as PropType<{
          current: number;
          pageSize: number;
          total: number;
        }>,
        required: true,
      },
    },
    emits: ['change'],
    setup: (props, ctx) => () =>
      h(
        'div',
        {
          'data-page': props.pagination.current,
          'data-total': props.pagination.total,
        },
        [
          ...props.dataSource.map((record) =>
            h(
              'article',
              { 'data-record-id': record.id },
              props.columns.map((column) =>
                ctx.slots.bodyCell?.({ record, column }),
              ),
            ),
          ),
          props.dataSource.length > 0 ? null : ctx.slots.emptyText?.(),
          h(
            'button',
            { onClick: () => ctx.emit('change', { current: 2, pageSize: 20 }) },
            '第2页，每页20条',
          ),
        ],
      ),
  });
  return {
    Alert: defineComponent({
      props: { message: { type: String, default: '' } },
      setup: (props) => () => h('p', { role: 'alert' }, props.message),
    }),
    Button: button,
    Card: block,
    Descriptions: Object.assign(block, { Item: block }),
    Drawer: drawer,
    Empty: block,
    Input: input,
    Select: select,
    Space: block,
    Table: table,
    TabPane: block,
    Tabs: tabs,
    Tag: block,
  };
});

function contract(id = 'contract-a', version = 3): Contract {
  return {
    id,
    version,
    code: `HT-${id}`,
    name: `合同${id}`,
    businessVersion: version,
    companyId: 2,
    departmentId: 4,
    ownerUserId: 1,
    customerId: 'customer-a',
    customerName: '客户甲',
    businessType: 'B2B',
    currency: 'CNY',
    status: 'ACTIVE',
    items: [],
    allowedActions: [],
  };
}
function row(
  id = 'request-a',
  contractId = 'contract-a',
  standaloneId?: string,
): DocumentRow {
  return {
    id,
    contractId,
    standaloneId,
    contractCode: `HT-${contractId}`,
    contractName: `合同${contractId}`,
    contractVersion: 3,
    companyId: 2,
    contractStatus: 'ACTIVE',
    allowedActions: [],
    record: { id, code: `单据-${id}`, name: id, status: 'ACTIVE' },
  };
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((done, fail) => {
    resolve = done;
    reject = fail;
  });
  return { promise, resolve, reject };
}
const dispose: (() => void)[] = [];
beforeEach(() => {
  vi.resetAllMocks();
  mocks.page.mockResolvedValue({ list: [], total: 0 });
  mocks.contract.mockImplementation(async (id: string) => contract(id));
  mocks.nextContract = undefined;
  mocks.businessResult = undefined;
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
async function mount(kind: ContractDocumentKind = 'requests') {
  const props = reactive({ open: true, kind, contract: contract() });
  const updated = vi.fn();
  const closed = vi.fn(() => {
    props.open = false;
  });
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      {
        path: '/fdmwaimao/platform-contracts',
        component: { render: () => null },
      },
    ],
  });
  await router.push(
    '/fdmwaimao/platform-contracts?contractId=contract-a&keyword=existing',
  );
  await router.isReady();
  const route = router.currentRoute.value.fullPath;
  const host = document.createElement('div');
  document.body.append(host);
  const app = createApp({
    render: () =>
      h(ContractDocumentDialog, {
        ...props,
        onClose: closed,
        onUpdated: updated,
      }),
  });
  app.use(router);
  app.mount(host);
  dispose.push(() => {
    app.unmount();
    host.remove();
  });
  await settle();
  return { host, props, updated, closed, router, route };
}
function click(host: HTMLElement, text: string) {
  const button = [...host.querySelectorAll<HTMLButtonElement>('button')].find(
    (item) => item.textContent?.trim() === text,
  );
  expect(button, `Missing button: ${text}`).toBeDefined();
  button!.click();
}
function action(host: HTMLElement) {
  return host.querySelector<HTMLElement>('[data-action]');
}

describe('contract document dialog entry points', () => {
  const entries: [ContractDocumentKind, string, string?][] = [
    ['requests', 'purchase-requests', 'CREATE_REQUEST'],
    ['tasks', 'purchase-intake'],
    ['quotes', 'quotes', 'CREATE_QUOTE'],
    ['plans', 'purchase-plans'],
    ['orders', 'purchase-orders', 'GENERATE_ORDERS'],
    ['arrivals', 'arrivals', 'RECORD_ARRIVAL'],
    ['purchaseReturns', 'purchase-returns', 'RETURN_ARRIVAL'],
    ['production', 'production-progress', 'UPDATE_PRODUCTION'],
    ['shipments', 'outbound-shipments', 'STOCK_SHIP'],
    ['salesReturns', 'sales-returns', 'STOCK_RETURN'],
    ['receipts', 'receipt-records', 'CREATE_RECEIPT'],
    ['refunds', 'receipt-refunds', 'REVERSE_RECEIPT'],
    ['invoices', 'invoices', 'CREATE_INVOICE'],
    ['allocations', 'allocations', 'BIND_ALLOCATION'],
    ['costs', 'costs'],
  ];
  it.each(entries)(
    'opens %s against the current contract without navigation',
    async (kind, resource, expectedAction) => {
      const view = await mount(kind);
      expect(mocks.page).toHaveBeenCalledWith(resource, {
        companyId: 0,
        contractId: 'contract-a',
        pageNo: 1,
        pageSize: 10,
        keyword: undefined,
        assignmentStatus: undefined,
      });
      const actionElement = action(view.host);
      expect(actionElement === null).toBe(!expectedAction);
      expect(actionElement?.dataset.action).toBe(expectedAction);
      expect(actionElement?.dataset.contract).toBe(
        expectedAction ? 'contract-a' : undefined,
      );
      expect(actionElement?.dataset.locked).toBe(
        expectedAction ? 'true' : undefined,
      );
      expect(view.router.currentRoute.value.fullPath).toBe(view.route);
      expect(view.host.textContent).toContain('HT-contract-a');
    },
  );

  it('opens customs in place, locks closing during editing and refreshes the parent after a change', async () => {
    const view = await mount('customs');
    expect(
      view.host.querySelector<HTMLElement>(
        '[data-customs-contract="contract-a"]',
      )?.dataset.embedded,
    ).toBe('true');
    expect(mocks.page).not.toHaveBeenCalled();
    expect(action(view.host)).toBeNull();
    click(view.host, '编辑报关');
    await settle();
    expect(
      view.host.querySelector<HTMLButtonElement>('[data-close-dialog]')
        ?.disabled,
    ).toBe(true);
    mocks.contract.mockResolvedValueOnce(contract('contract-a', 4));
    click(view.host, '报关已更新');
    await settle();
    expect(view.updated).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'contract-a', version: 4 }),
    );
    expect(view.router.currentRoute.value.fullPath).toBe(view.route);
  });
});

describe('contract document dialog interactions and request lifecycle', () => {
  it('shows unassigned requests in intake, passes the chosen request to dispatch and switches to fulfillment tasks', async () => {
    mocks.page.mockImplementation(async (resource: string) => ({
      list: [
        row(
          resource === 'purchase-intake'
            ? 'unassigned-request'
            : 'fulfillment-task',
        ),
      ],
      total: 1,
    }));
    const view = await mount('tasks');
    expect(
      view.host.querySelector('[data-record-id="unassigned-request"]'),
    ).not.toBeNull();
    expect(
      view.host.querySelector<HTMLElement>('[data-active-tab]')?.dataset
        .activeTab,
    ).toBe('intake');
    click(view.host, '接单 / 分派');
    await settle();
    expect(action(view.host)?.dataset.action).toBe('ASSIGN_FULFILLMENT');
    expect(action(view.host)?.dataset.actionKind).toBe('requests');
    expect(action(view.host)?.dataset.actionRow).toBe('unassigned-request');
    expect(action(view.host)?.dataset.contract).toBe('contract-a');
    expect(action(view.host)?.dataset.locked).toBe('true');
    click(view.host, '关闭建单');
    await settle();
    click(view.host, '第2页，每页20条');
    await settle();
    const select = view.host.querySelector<HTMLSelectElement>(
      'select[placeholder="全部待分派状态"]',
    )!;
    select.value = 'UNASSIGNED';
    select.dispatchEvent(new Event('change', { bubbles: true }));
    await settle();
    expect(mocks.page).toHaveBeenLastCalledWith(
      'purchase-intake',
      expect.objectContaining({
        contractId: 'contract-a',
        pageNo: 1,
        pageSize: 20,
        assignmentStatus: 'UNASSIGNED',
      }),
    );
    click(view.host, '履约任务');
    await settle();
    expect(mocks.page).toHaveBeenLastCalledWith(
      'assignments',
      expect.objectContaining({
        contractId: 'contract-a',
        pageNo: 1,
        pageSize: 20,
        assignmentStatus: undefined,
      }),
    );
    expect(
      view.host.querySelector('[data-record-id="fulfillment-task"]'),
    ).not.toBeNull();
    expect(
      view.host.querySelector('[data-record-id="unassigned-request"]'),
    ).toBeNull();
    expect(
      view.host.querySelector('select[placeholder="全部待分派状态"]'),
    ).toBeNull();
    click(view.host, '待接单申请');
    await settle();
    expect(mocks.page).toHaveBeenLastCalledWith(
      'purchase-intake',
      expect.objectContaining({
        contractId: 'contract-a',
        pageNo: 1,
        assignmentStatus: undefined,
      }),
    );
    expect(view.router.currentRoute.value.fullPath).toBe(view.route);
  });

  it('uses the native request detail when dispatching an imported unassigned request', async () => {
    mocks.page.mockResolvedValueOnce({
      list: [row('imported-request', 'contract-a', 'native-request-id')],
      total: 1,
    });
    const view = await mount('tasks');
    click(view.host, '接单 / 分派');
    await settle();
    expect(
      view.host.querySelector<HTMLElement>(
        '[data-standalone-id="native-request-id"]',
      )?.dataset.embedded,
    ).toBe('true');
    expect(action(view.host)).toBeNull();
    expect(view.host.querySelector('[data-detail-id]')).toBeNull();
    expect(view.router.currentRoute.value.fullPath).toBe(view.route);
  });

  it('does not replace fulfillment tasks with a delayed intake response after switching tabs', async () => {
    const pending = deferred<PageResult<DocumentRow>>();
    mocks.page
      .mockReturnValueOnce(pending.promise)
      .mockResolvedValueOnce({ list: [row('current-task')], total: 1 });
    const view = await mount('tasks');
    click(view.host, '履约任务');
    await settle();
    pending.resolve({ list: [row('stale-intake-request')], total: 30 });
    await settle();
    expect(
      view.host.querySelector('[data-record-id="current-task"]'),
    ).not.toBeNull();
    expect(
      view.host.querySelector('[data-record-id="stale-intake-request"]'),
    ).toBeNull();
    expect(
      view.host.querySelector<HTMLElement>('[data-total]')?.dataset.total,
    ).toBe('1');
  });

  it('keeps filtering and pagination scoped to this contract and resets the page when searching', async () => {
    const view = await mount('tasks');
    click(view.host, '第2页，每页20条');
    await settle();
    expect(mocks.page).toHaveBeenLastCalledWith(
      'purchase-intake',
      expect.objectContaining({
        contractId: 'contract-a',
        pageNo: 2,
        pageSize: 20,
      }),
    );
    const input = view.host.querySelector<HTMLInputElement>(
      'input[placeholder="搜索本合同单据"]',
    )!;
    input.value = '  分批申请  ';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    await nextTick();
    input.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }),
    );
    await settle();
    expect(mocks.page).toHaveBeenLastCalledWith(
      'purchase-intake',
      expect.objectContaining({
        contractId: 'contract-a',
        pageNo: 1,
        pageSize: 20,
        keyword: '分批申请',
      }),
    );
    expect(view.router.currentRoute.value.fullPath).toBe(view.route);
  });

  it('allows another operation after closing the default editor and prevents closing its parent in between', async () => {
    const view = await mount('production');
    expect(
      view.host.querySelector<HTMLButtonElement>('[data-close-dialog]')
        ?.disabled,
    ).toBe(true);
    click(view.host, '关闭单据弹窗');
    expect(view.closed).not.toHaveBeenCalled();
    click(view.host, '关闭建单');
    await settle();
    click(view.host, '自产入库');
    await settle();
    expect(action(view.host)?.dataset.action).toBe('STOCK_RECEIVE');
    expect(action(view.host)?.dataset.contract).toBe('contract-a');
    click(view.host, '关闭建单');
    await settle();
    click(view.host, '关闭单据弹窗');
    await settle();
    expect(view.closed).toHaveBeenCalledOnce();
    expect(view.router.currentRoute.value.fullPath).toBe(view.route);
  });

  it('refreshes this contract list and emits the created result without losing the contract route', async () => {
    const view = await mount();
    mocks.nextContract = contract('contract-a', 4);
    mocks.page.mockResolvedValueOnce({
      list: [row('created-request')],
      total: 1,
    });
    click(view.host, '完成建单');
    await settle();
    expect(view.updated).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ id: 'contract-a', version: 4 }),
    );
    expect(
      view.host.querySelector('[data-record-id="created-request"]'),
    ).not.toBeNull();
    expect(action(view.host)).toBeNull();
    expect(mocks.page).toHaveBeenCalledTimes(2);
    expect(view.router.currentRoute.value.fullPath).toBe(view.route);
  });

  it('discards a former contract response when switching contracts before it resolves', async () => {
    const pending = deferred<PageResult<DocumentRow>>();
    mocks.page.mockReturnValueOnce(pending.promise).mockResolvedValueOnce({
      list: [row('new-row', 'contract-b')],
      total: 1,
    });
    const view = await mount('tasks');
    view.props.contract = contract('contract-b');
    await settle();
    expect(
      view.host.querySelector('[data-record-id="new-row"]'),
    ).not.toBeNull();
    pending.resolve({ list: [row('stale-row')], total: 99 });
    await settle();
    expect(view.host.querySelector('[data-record-id="stale-row"]')).toBeNull();
    expect(
      view.host.querySelector<HTMLElement>('[data-total]')?.dataset.total,
    ).toBe('1');
    expect(view.host.textContent).toContain('HT-contract-b');
    expect(view.updated).not.toHaveBeenCalled();
  });

  it('does not populate a reopened dialog from the previous session response', async () => {
    const pending = deferred<PageResult<DocumentRow>>();
    mocks.page
      .mockReturnValueOnce(pending.promise)
      .mockResolvedValueOnce({ list: [row('reopened')], total: 1 });
    const view = await mount('tasks');
    click(view.host, '关闭单据弹窗');
    await settle();
    view.props.open = true;
    await settle();
    pending.resolve({ list: [row('closed-session')], total: 25 });
    await settle();
    expect(
      view.host.querySelector('[data-record-id="reopened"]'),
    ).not.toBeNull();
    expect(
      view.host.querySelector('[data-record-id="closed-session"]'),
    ).toBeNull();
    expect(view.updated).not.toHaveBeenCalled();
  });

  it('shows a read error and allows retry without displaying records from another contract', async () => {
    mocks.page
      .mockResolvedValueOnce({ list: [row('old-row')], total: 1 })
      .mockRejectedValueOnce(new Error('关联单据读取失败'));
    const view = await mount('tasks');
    view.props.contract = contract('contract-b');
    await settle();
    expect(view.host.textContent).toContain('关联单据读取失败');
    expect(view.host.querySelector('[data-record-id="old-row"]')).toBeNull();
    mocks.page.mockResolvedValueOnce({
      list: [row('retried-row', 'contract-b')],
      total: 1,
    });
    click(view.host, '刷新本合同单据');
    await settle();
    expect(view.host.textContent).not.toContain('关联单据读取失败');
    expect(
      view.host.querySelector('[data-record-id="retried-row"]'),
    ).not.toBeNull();
  });

  it('opens imported standalone identities separately and rejects a document belonging to another contract', async () => {
    mocks.page.mockResolvedValueOnce({
      list: [
        row('native-row', 'contract-a', 'native-id'),
        row('wrong-row', 'contract-b', 'wrong-id'),
      ],
      total: 2,
    });
    const view = await mount('plans');
    click(view.host, '单据-native-row');
    await settle();
    expect(
      view.host.querySelector<HTMLElement>('[data-standalone-id="native-id"]')
        ?.dataset.embedded,
    ).toBe('true');
    expect(view.host.querySelector('[data-detail-id]')).toBeNull();
    click(view.host, '关闭原生单据');
    await settle();
    click(view.host, '单据-wrong-row');
    await settle();
    expect(view.host.textContent).toContain('此单据不属于当前合同');
    expect(view.host.querySelector('[data-standalone-id]')).toBeNull();
    expect(view.router.currentRoute.value.fullPath).toBe(view.route);
  });

  it('continues a related action in another dialog section without replacing the current route', async () => {
    mocks.page.mockResolvedValueOnce({
      list: [row('existing-order')],
      total: 1,
    });
    const view = await mount('orders');
    click(view.host, '关闭建单');
    await settle();
    click(view.host, '单据-existing-order');
    await settle();
    expect(
      view.host.querySelector<HTMLElement>('[data-detail-id="existing-order"]')
        ?.dataset.embedded,
    ).toBe('true');
    click(view.host, '办理关联到货');
    await settle();
    expect(action(view.host)?.dataset.action).toBe('RECORD_ARRIVAL');
    expect(action(view.host)?.dataset.contract).toBe('contract-a');
    expect(mocks.page).toHaveBeenLastCalledWith(
      'arrivals',
      expect.objectContaining({ contractId: 'contract-a', pageNo: 1 }),
    );
    expect(view.host.querySelector('[data-detail-id]')).toBeNull();
    expect(view.router.currentRoute.value.fullPath).toBe(view.route);
  });

  it('does not refresh or emit updates returned for a different contract', async () => {
    const view = await mount();
    mocks.nextContract = contract('contract-b', 10);
    click(view.host, '完成建单');
    await settle();
    expect(view.updated).not.toHaveBeenCalled();
    expect(mocks.page).toHaveBeenCalledOnce();
  });

  it('refreshes parent summaries after a standalone document is linked and then closes its editor', async () => {
    mocks.page.mockResolvedValueOnce({
      list: [row('native-row', 'contract-a', 'native-id')],
      total: 1,
    });
    const view = await mount('tasks');
    click(view.host, '单据-native-row');
    await settle();
    mocks.businessResult = {
      contractId: 'contract-a',
      status: 'LINKED',
      record: { status: 'LINKED' },
    };
    mocks.contract.mockResolvedValueOnce(contract('contract-a', 7));
    click(view.host, '原生单据已更新');
    await settle();
    expect(view.updated).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'contract-a', version: 7 }),
    );
    expect(view.host.querySelector('[data-standalone-id]')).toBeNull();
    expect(mocks.page).toHaveBeenCalledTimes(2);
  });
});
