/* eslint-disable vue/one-component-per-file -- UI adapters exercise real workspace routing and modal state. */
import type { PropType } from 'vue';

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
}));
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
  default: defineComponent({ render: () => null }),
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
    Select: block,
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
) {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/documents', component: { render: () => null } }],
  });
  await router.push(`/documents${query}`);
  await router.isReady();
  const host = document.createElement('div');
  document.body.append(host);
  const app = createApp({ render: () => h(DocumentWorkspace, { kind }) });
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
