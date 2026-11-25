/* eslint-disable vue/one-component-per-file -- UI adapters exercise real workspace routing and modal state. */
import type { PropType } from 'vue';

import type { SalesChannel } from '../sales-channel';
import type { DocumentKind } from './model';

import type { Contract, DocumentRow } from '#/api/fdmplatform';

import { createApp, defineComponent, h, nextTick } from 'vue';
import { createMemoryHistory, createRouter } from 'vue-router';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import ContractPicker from './ContractPicker.vue';
import DocumentWorkspace from './DocumentWorkspace.vue';

const mocks = vi.hoisted(() => ({
  page: vi.fn(),
  contract: vi.fn(),
  directory: vi.fn(),
  reviews: vi.fn(),
}));
vi.mock('#/api/fdmaicheck', () => ({ getAiReviewStatuses: mocks.reviews }));
vi.mock('#/api/fdmplatform', () => ({
  getBusinessPage: mocks.page,
  getContract: mocks.contract,
  getDirectory: mocks.directory,
}));
vi.mock('@vben/common-ui', () => ({
  Page: defineComponent({
    setup: (_, ctx) => () => h('main', ctx.slots.default?.()),
  }),
}));
vi.mock('./DocumentAction.vue', () => ({
  default: defineComponent({
    props: {
      open: Boolean,
      kind: { type: String, default: undefined },
      action: { type: String, default: undefined },
      contractId: { type: String, default: undefined },
      lockContract: Boolean,
      row: { type: Object as PropType<DocumentRow>, default: undefined },
      source: { type: Object, default: undefined },
    },
    emits: ['close', 'updated'],
    setup: (props, ctx) => () =>
      props.open
        ? h(
            'section',
            {
              'data-action': props.action,
              'data-kind': props.kind,
              'data-contract': props.contractId,
              'data-locked': String(props.lockContract),
              'data-source': JSON.stringify(props.source),
              'data-row': props.row?.id,
            },
            [
              h('button', { onClick: () => ctx.emit('close') }, '取消办理'),
              h('button', { onClick: () => ctx.emit('updated') }, '保存办理'),
            ],
          )
        : null,
  }),
}));
vi.mock('./RecordDetail.vue', () => ({
  default: defineComponent({
    props: {
      open: Boolean,
      row: { type: Object as PropType<DocumentRow>, default: undefined },
    },
    emits: ['close', 'updated'],
    setup: (props, ctx) => () =>
      props.open
        ? h('section', { 'data-detail': props.row?.id }, [
            h('button', { onClick: () => ctx.emit('close') }, '关闭详情'),
          ])
        : null,
  }),
}));
vi.mock('./BusinessDocumentDetail.vue', () => ({
  default: defineComponent({
    props: { id: { type: String, default: undefined }, open: Boolean },
    setup: (props) => () =>
      props.open ? h('section', { 'data-standalone': props.id }) : null,
  }),
}));
vi.mock('./RelatedLink.vue', () => ({
  default: defineComponent({
    setup: (_, ctx) => () => h('span', ctx.slots.default?.()),
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
  const search = defineComponent({
    props: { value: { type: String, default: '' } },
    emits: ['update:value', 'search'],
    setup: (props, ctx) => () =>
      h('input', {
        value: props.value,
        'data-search': true,
        onInput: (event: Event) =>
          ctx.emit('update:value', (event.target as HTMLInputElement).value),
        onKeydown: (event: KeyboardEvent) => {
          if (event.key === 'Enter') ctx.emit('search');
        },
      }),
  });
  const table = defineComponent({
    props: {
      columns: {
        type: Array as PropType<{ key: string }[]>,
        default: () => [],
      },
      dataSource: {
        type: Array as PropType<Record<string, unknown>[]>,
        default: () => [],
      },
      pagination: { type: Object, default: undefined },
    },
    emits: ['change'],
    setup: (props, ctx) => () =>
      h('div', { 'data-table': true }, [
        ...(props.dataSource ?? []).map((record) =>
          h(
            'article',
            { 'data-record': record.id },
            props.columns?.map((column) =>
              ctx.slots.bodyCell?.({ column, record }),
            ),
          ),
        ),
        props.dataSource?.length ? null : ctx.slots.emptyText?.(),
        h(
          'button',
          { onClick: () => ctx.emit('change', { current: 2, pageSize: 10 }) },
          '第2页',
        ),
      ]),
  });
  return {
    Alert: block,
    Button: button,
    Card: block,
    Input: { Search: search },
    Modal: block,
    Select: defineComponent({
      props: ['value', 'options', 'placeholder'],
      emits: ['update:value', 'change'],
      setup: (props, ctx) => () =>
        h(
          'select',
          {
            value: props.value ?? '',
            'aria-label': props.placeholder,
            onChange: (event: Event) => {
              const value =
                (event.target as HTMLSelectElement).value || undefined;
              ctx.emit('update:value', value);
              ctx.emit('change', value);
            },
          },
          [
            h('option', { value: '' }, '全部'),
            ...(props.options ?? []).map(
              (entry: { label: string; value: string }) =>
                h('option', { value: entry.value }, entry.label),
            ),
          ],
        ),
    }),
    Space: block,
    Table: table,
    TabPane: block,
    Tabs: block,
    Tag: block,
  };
});

function row(): DocumentRow {
  return {
    id: 'task-a',
    contractId: 'contract-a',
    contractCode: 'HT-001',
    contractName: '订单甲',
    contractVersion: 1,
    companyId: 1,
    contractStatus: 'CONFIRMED',
    allowedActions: ['CREATE_QUOTE'],
    record: { id: 'task-a', method: 'BUY', status: 'ASSIGNED' },
  };
}
async function settle() {
  for (let i = 0; i < 5; i++) {
    await new Promise((resolve) => setTimeout(resolve, 0));
    await nextTick();
  }
}
const disposals: (() => void)[] = [];
async function mountWorkspace(
  kind: DocumentKind = 'tasks',
  query = '?queue=tasks',
  salesChannel?: SalesChannel,
) {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/documents', component: { render: () => null } },
      { path: '/other', component: { render: () => null } },
    ],
  });
  await router.push(`/documents${query}`);
  await router.isReady();
  const host = document.createElement('div');
  document.body.append(host);
  const app = createApp({
    render: () => h(DocumentWorkspace, { kind, salesChannel }),
  });
  app.use(router);
  app.mount(host);
  disposals.push(() => {
    app.unmount();
    host.remove();
  });
  await settle();
  return { host, router };
}
function button(host: HTMLElement, title: string) {
  const result = [...host.querySelectorAll('button')].find(
    (entry) => entry.textContent?.trim() === title,
  );
  expect(result).toBeDefined();
  return result!;
}
async function search(host: HTMLElement, value: string) {
  const input = host.querySelector<HTMLInputElement>('input[data-search]')!;
  input.value = value;
  input.dispatchEvent(new Event('input', { bubbles: true }));
  await nextTick();
  input.dispatchEvent(
    new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }),
  );
  await settle();
}
beforeEach(() => {
  vi.clearAllMocks();
  mocks.reviews.mockResolvedValue({});
  mocks.page.mockResolvedValue({ list: [row()], total: 21 });
  mocks.directory.mockResolvedValue({
    users: [],
    departments: [],
    companies: [],
  });
  mocks.contract.mockResolvedValue({
    id: 'contract-a',
    code: 'HT-001',
    name: '订单甲',
  });
});
afterEach(() => {
  for (const dispose of disposals.splice(0)) dispose();
});

describe('document list shortcuts and retained context', () => {
  it('shows the contract creator as the salesperson even with saved column settings', async () => {
    const settingsKey =
      'fdm-list-table:documents:purchase-requests:FOREIGN::anonymous';
    localStorage.setItem(
      settingsKey,
      JSON.stringify({ keys: ['contract', 'ownerUserId'] }),
    );
    disposals.push(() => localStorage.removeItem(settingsKey));
    mocks.directory.mockResolvedValue({
      users: [
        { id: 1, nickname: '合同负责人' },
        { id: 2, nickname: '采购经办人' },
      ],
      departments: [],
      companies: [],
    });
    const request = {
      ...row(),
      contractOwnerUserId: 1,
      record: { id: 'request', createdBy: 1, ownerUserId: 2 },
    };
    mocks.page.mockResolvedValue({
      list: [
        { ...request, id: 'known-creator', contractCreatorName: '合同创建人' },
        { ...request, id: 'missing-creator' },
      ],
      total: 2,
    });

    const { host } = await mountWorkspace('requests', '', 'FOREIGN');
    const known = host.querySelector('[data-record="known-creator"]');
    const missing = host.querySelector('[data-record="missing-creator"]');
    expect(known?.querySelector('[title="合同创建人"]')).not.toBeNull();
    expect(known?.querySelector('[title="采购经办人"]')).not.toBeNull();
    expect(missing?.querySelector('[title="—"]')).not.toBeNull();
    expect(host.textContent).not.toContain('合同负责人');
  });

  it('shows the internal contract number for a legacy purchase request and retains a manual subject', async () => {
    const systemNumber = 'HT-20261125-000004';
    const internalNumber = 'FYY18020261123-1Y';
    const base = {
      ...row(),
      contractCode: systemNumber,
      contractName: internalNumber,
    };
    mocks.page.mockResolvedValue({
      list: [
        {
          ...base,
          id: 'legacy-request',
          standaloneId: 'legacy-request',
          code: systemNumber,
          record: { id: 'legacy-request', name: systemNumber },
        },
        {
          ...base,
          id: 'new-request',
          code: 'request-system-id',
          record: { id: 'new-request', name: '瑜伽砖补货' },
        },
      ],
      total: 2,
    });

    const { host } = await mountWorkspace('requests', '');
    expect(host.innerHTML).not.toContain(systemNumber);
    expect(host.innerHTML).not.toContain('request-system-id');
    button(host, internalNumber).click();
    await settle();
    expect(
      host.querySelector('[data-standalone="legacy-request"]'),
    ).not.toBeNull();
    button(host, '瑜伽砖补货').click();
    await settle();
    expect(host.querySelector('[data-detail="new-request"]')).not.toBeNull();
  });

  it('uses the original standalone stock ID and shows unreviewed and completed results in the list', async () => {
    mocks.page.mockResolvedValue({
      list: [
        {
          ...row(),
          id: 'shipment-1',
          record: { id: 'shipment-1', kind: 'OUTBOUND' },
        },
        {
          ...row(),
          id: 'list-row-id',
          standaloneId: 'legacy-stock-out',
          recordType: 'STOCK_OUT',
          record: { id: 'legacy-record-id' },
        },
      ],
      total: 2,
    });
    mocks.reviews.mockImplementation(async (type: string) =>
      type === 'SHIPMENT'
        ? { 'shipment-1': { state: 'NOT_REVIEWED' } }
        : {
            'legacy-stock-out': {
              state: 'COMPLETED',
              counts: { PASS: 2, UNKNOWN: 1 },
            },
          },
    );

    const { host } = await mountWorkspace('shipments', '');

    expect(mocks.reviews).toHaveBeenCalledWith('SHIPMENT', ['shipment-1']);
    expect(mocks.reviews).toHaveBeenCalledWith('STOCK_OUT', [
      'legacy-stock-out',
    ]);
    expect(
      host.querySelector('[data-record="shipment-1"]')?.textContent,
    ).toContain('未审核');
    const reviewed = host.querySelector(
      '[data-record="list-row-id"]',
    )?.textContent;
    expect(reviewed).toContain('通过 2');
    expect(reviewed).toContain('缺资料 1');
  });
  it('日常申请默认只查待转余额，可切换全部历史和独立转单进度', async () => {
    mocks.page.mockResolvedValue({ list: [], total: 0 });
    const view = await mountWorkspace('requests', '?scope=current');
    expect(mocks.page).toHaveBeenCalledWith(
      'purchase-requests',
      expect.objectContaining({
        pendingTransfer: true,
        transferStatus: undefined,
        contractId: undefined,
      }),
    );
    const progress = view.host.querySelector<HTMLSelectElement>(
      '[aria-label="全部转采购进度"]',
    )!;
    progress.value = 'TRANSFERRED';
    progress.dispatchEvent(new Event('change'));
    await settle();
    expect(mocks.page).toHaveBeenCalledWith(
      'purchase-requests',
      expect.objectContaining({
        pendingTransfer: undefined,
        transferStatus: 'TRANSFERRED',
        contractId: undefined,
      }),
    );
    progress.value = '';
    progress.dispatchEvent(new Event('change'));
    await settle();
    expect(mocks.page).toHaveBeenCalledWith(
      'purchase-requests',
      expect.objectContaining({
        pendingTransfer: undefined,
        transferStatus: undefined,
        contractId: undefined,
      }),
    );
  });
  it('待补齐和全部范围默认不限制转单进度，路由切换后重新采用对应范围默认值', async () => {
    mocks.page.mockResolvedValue({ list: [], total: 0 });
    const view = await mountWorkspace('requests', '?scope=pending');
    const latestList = () =>
      mocks.page.mock.calls.findLast(([, query]) => query.pageSize === 10)?.[1];
    expect(latestList()).toMatchObject({
      pendingCompletion: true,
      pendingTransfer: undefined,
      transferStatus: undefined,
    });
    await view.router.push('/documents?scope=current');
    await settle();
    expect(latestList()).toMatchObject({
      pendingCompletion: false,
      pendingTransfer: true,
    });
    await view.router.push('/documents?scope=all');
    await settle();
    expect(latestList()).toMatchObject({
      pendingCompletion: undefined,
      pendingTransfer: undefined,
      transferStatus: undefined,
    });
  });
  it('合同上下文默认显示全部转单进度，显式筛选仍保持合同范围', async () => {
    mocks.page.mockResolvedValue({ list: [], total: 0 });
    const view = await mountWorkspace('requests', '?contractId=contract-a');
    const latestList = () =>
      mocks.page.mock.calls.findLast(([, query]) => query.pageSize === 10)?.[1];
    expect(latestList()).toMatchObject({
      contractId: 'contract-a',
      pendingCompletion: undefined,
      pendingTransfer: undefined,
      transferStatus: undefined,
    });
    const progress = view.host.querySelector<HTMLSelectElement>(
      '[aria-label="全部转采购进度"]',
    )!;
    progress.value = 'TRANSFERRED';
    progress.dispatchEvent(new Event('change'));
    await settle();
    expect(latestList()).toMatchObject({
      contractId: 'contract-a',
      pendingTransfer: undefined,
      transferStatus: 'TRANSFERRED',
    });
  });
  it('retains pagination, search and the current action when another menu has unrelated query values', async () => {
    const view = await mountWorkspace();
    await search(view.host, '客户甲');
    button(view.host, '第2页').click();
    await settle();
    button(view.host, '新增供应商报价').click();
    await settle();
    const calls = mocks.page.mock.calls.length;
    await view.router.push('/other?contractId=unrelated&documentId=other');
    await settle();
    expect(view.host.querySelector('[data-action]')).toBeNull();
    expect(mocks.page).toHaveBeenCalledTimes(calls);
    await view.router.push('/documents?queue=tasks');
    await settle();
    expect(
      view.host.querySelector<HTMLInputElement>('input[data-search]')?.value,
    ).toBe('客户甲');
    expect(
      view.host.querySelector<HTMLElement>('[data-action]')?.dataset.source,
    ).toBe(JSON.stringify({ kind: 'tasks', id: 'task-a' }));
    expect(mocks.page).toHaveBeenCalledTimes(calls);
    button(view.host, '取消办理').click();
    button(view.host, '刷新').click();
    await settle();
    expect(mocks.page).toHaveBeenLastCalledWith(
      'assignments',
      expect.objectContaining({ pageNo: 2, keyword: '客户甲' }),
    );
  });
  it('opens a source-bound quote form directly without navigating or opening detail', async () => {
    const view = await mountWorkspace();
    button(view.host, '新增供应商报价').click();
    await settle();
    const action = view.host.querySelector<HTMLElement>('[data-action]')!;
    expect(action.dataset.action).toBe('CREATE_QUOTE');
    expect(action.dataset.kind).toBe('quotes');
    expect(action.dataset.source).toBe(
      JSON.stringify({ kind: 'tasks', id: 'task-a' }),
    );
    expect(action.dataset.contract).toBe('contract-a');
    expect(action.dataset.locked).toBe('true');
    expect(action.dataset.row).toBeUndefined();
    expect(view.host.querySelector('[data-detail]')).toBeNull();
    expect(view.router.currentRoute.value.fullPath).toBe(
      '/documents?queue=tasks',
    );
  });
  it('keeps search, page and the original contract scope after saving and viewing detail', async () => {
    const view = await mountWorkspace();
    await search(view.host, '客户甲');
    button(view.host, '第2页').click();
    await settle();
    button(view.host, '新增供应商报价').click();
    await settle();
    button(view.host, '保存办理').click();
    await settle();
    expect(view.host.querySelector('[data-action]')).toBeNull();
    expect(mocks.page).toHaveBeenLastCalledWith(
      'assignments',
      expect.objectContaining({
        pageNo: 2,
        keyword: '客户甲',
        contractId: undefined,
      }),
    );
    const calls = mocks.page.mock.calls.length;
    button(view.host, '查看详情').click();
    await settle();
    expect(
      view.host.querySelector<HTMLElement>('[data-detail]')?.dataset.detail,
    ).toBe('task-a');
    expect(view.router.currentRoute.value.query.contractId).toBeUndefined();
    button(view.host, '关闭详情').click();
    await settle();
    expect(mocks.page).toHaveBeenCalledTimes(calls);
    expect(
      view.host.querySelector<HTMLInputElement>('input[data-search]')?.value,
    ).toBe('客户甲');
  });
  it('uses the existing filtered contract when starting a new document', async () => {
    mocks.page.mockResolvedValue({ list: [], total: 0 });
    const view = await mountWorkspace('quotes', '?contractId=contract-a');
    button(view.host, '新建供应商报价').click();
    await settle();
    const action = view.host.querySelector<HTMLElement>('[data-action]')!;
    expect(action.dataset.contract).toBe('contract-a');
    expect(action.dataset.locked).toBe('true');
    expect(action.dataset.source).toBeUndefined();
  });
  it('still resolves an external document deep link and preserves its explicit contract filter when closed', async () => {
    mocks.contract.mockResolvedValue({
      id: 'contract-a',
      code: 'HT-001',
      name: '订单甲',
      version: 1,
      companyId: 1,
      status: 'CONFIRMED',
      allowedActions: ['CREATE_QUOTE'],
      assignments: [row().record],
    });
    const view = await mountWorkspace(
      'tasks',
      '?queue=tasks&contractId=contract-a&documentId=task-a',
    );
    expect(
      view.host.querySelector<HTMLElement>('[data-detail]')?.dataset.detail,
    ).toBe('task-a');
    button(view.host, '关闭详情').click();
    await settle();
    expect(view.router.currentRoute.value.query).toEqual({
      queue: 'tasks',
      contractId: 'contract-a',
    });
  });
  it('clears only search conditions from an empty result without widening the contract scope', async () => {
    mocks.page.mockResolvedValue({ list: [], total: 0 });
    const view = await mountWorkspace('quotes', '?contractId=contract-a');
    await search(view.host, '无匹配');
    expect(view.host.textContent).toContain('没有符合当前查询条件的单据');
    button(view.host, '清除查询，查看当前范围').click();
    await settle();
    expect(mocks.page).toHaveBeenLastCalledWith(
      'quotes',
      expect.objectContaining({
        keyword: undefined,
        contractId: 'contract-a',
        pageNo: 1,
      }),
    );
    expect(view.router.currentRoute.value.query.contractId).toBe('contract-a');
  });
  it('does not offer list mutations when a source is cancelled or migrated', async () => {
    mocks.page.mockResolvedValue({
      list: [{ ...row(), record: { ...row().record, status: 'CANCELLED' } }],
      total: 1,
    });
    const view = await mountWorkspace();
    expect(view.host.textContent).not.toContain('新增供应商报价');
    expect(view.host.textContent).toContain('单据已结束');
    expect(button(view.host, '查看详情')).toBeDefined();
  });
});

describe('action-aware contract picker', () => {
  it('prevents choosing an inapplicable contract and continues only with the selected eligible one', async () => {
    const contracts = [
      {
        id: 'draft',
        code: 'HT-DRAFT',
        status: 'DRAFT',
        allowedActions: ['CREATE_QUOTE'],
      },
      {
        id: 'active',
        code: 'HT-ACTIVE',
        status: 'CONFIRMED',
        allowedActions: ['CREATE_QUOTE'],
      },
    ] as Contract[];
    mocks.page.mockResolvedValue({ list: contracts, total: 2 });
    const selected = vi.fn();
    const host = document.createElement('div');
    document.body.append(host);
    const app = createApp({
      render: () =>
        h(ContractPicker, {
          open: true,
          action: 'CREATE_QUOTE',
          onSelect: selected,
        }),
    });
    app.mount(host);
    disposals.push(() => {
      app.unmount();
      host.remove();
    });
    await settle();
    expect(button(host, '当前不可办理').disabled).toBe(true);
    button(host, '当前不可办理').click();
    expect(selected).not.toHaveBeenCalled();
    button(host, '选择并继续').click();
    expect(selected).toHaveBeenCalledWith(contracts[1]);
  });
});
