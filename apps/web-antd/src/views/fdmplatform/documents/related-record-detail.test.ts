/* eslint-disable vue/one-component-per-file -- Minimal UI adapters expose drawer and action lifecycles without Ant Design overlays. */
import type { PropType } from 'vue';

import type { DocumentKind } from './model';

import type { BusinessRecord, Contract, DocumentRow } from '#/api/fdmplatform';

import { createApp, defineComponent, h, nextTick, reactive } from 'vue';
import { createMemoryHistory, createRouter } from 'vue-router';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import RecordDetail from './RecordDetail.vue';

const mocks = vi.hoisted(() => ({
  contract: vi.fn(),
  directory: vi.fn(),
  attachments: vi.fn(),
}));
vi.mock('#/api/fdmplatform', () => ({
  getAiReviews: vi.fn().mockResolvedValue([]),
  getAttachments: mocks.attachments,
  getContract: mocks.contract,
  getDirectory: mocks.directory,
  refreshAiReview: vi.fn(),
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
      source: {
        type: Object as PropType<{ id: string; kind: DocumentKind }>,
        default: undefined,
      },
    },
    emits: ['close', 'updated'],
    setup: (props, ctx) => () =>
      props.open
        ? h(
            'section',
            {
              'data-related-action': props.action,
              'data-kind': props.kind,
              'data-contract': props.contractId,
              'data-locked': String(props.lockContract),
              'data-source': JSON.stringify(props.source),
              'data-row': props.row?.id,
            },
            [
              h('button', { onClick: () => ctx.emit('close') }, '取消关联建单'),
              h(
                'button',
                { onClick: () => ctx.emit('updated') },
                '完成关联建单',
              ),
            ],
          )
        : null,
  }),
}));
vi.mock('../components/AttachmentPanel.vue', () => ({
  default: defineComponent({ render: () => null }),
}));
vi.mock('../components/RecordTable.vue', () => ({
  default: defineComponent({ render: () => null }),
}));
vi.mock('./LinkedRecordTable.vue', () => ({
  default: defineComponent({ render: () => null }),
}));
vi.mock('./MigrationSource.vue', () => ({
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
        {
          ...ctx.attrs,
          disabled: props.disabled || props.loading,
        },
        ctx.slots.default?.(),
      ),
  });
  const drawer = defineComponent({
    props: { open: Boolean, closable: { type: Boolean, default: true } },
    emits: ['close'],
    setup: (props, ctx) => () =>
      props.open
        ? h('section', { 'data-parent-detail': true }, [
            ctx.slots.default?.(),
            h(
              'button',
              {
                disabled: !props.closable,
                onClick: () => ctx.emit('close'),
              },
              '关闭父单据',
            ),
          ])
        : null,
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
    Space: block,
    Spin: block,
    Tag: block,
  };
});

function contractFixture(): Contract {
  const assignments: BusinessRecord[] = ['a', 'b'].map((suffix) => ({
    id: `task-${suffix}`,
    requestId: 'request-a',
    requestItemId: 'request-item-a',
    contractItemId: 'item-a',
    method: suffix === 'a' ? 'BUY' : 'MAKE',
    quantity: '10',
    ownerUserId: 1,
    status: 'ASSIGNED',
  }));
  return {
    id: 'contract-a',
    code: 'HT-001',
    name: '测试订单',
    companyId: 1,
    departmentId: 1,
    ownerUserId: 1,
    customerId: 'customer-a',
    customerName: '测试客户',
    businessType: 'FOREIGN',
    currency: 'CNY',
    status: 'CONFIRMED',
    version: 7,
    businessVersion: 1,
    allowedActions: ['CREATE_QUOTE', 'SAVE_PLAN', 'UPDATE_PRODUCTION'],
    items: [
      {
        id: 'item-a',
        skuId: 'sku-a',
        skuName: '测试产品',
        specification: '标准',
        specVersion: '1',
        unit: '件',
        quantity: '20',
      },
    ],
    requests: [
      {
        id: 'request-a',
        name: '采购申请',
        status: 'ACTIVE',
        items: [
          { id: 'request-item-a', contractItemId: 'item-a', quantity: '20' },
        ],
      },
    ],
    assignments,
    plans: [],
    quotes: [],
    finance: { receipts: [], invoices: [], allocations: [], costs: [] },
  };
}
function rowFixture(id = 'task-a'): DocumentRow {
  const contract = contractFixture();
  return {
    id,
    contractId: contract.id,
    contractCode: contract.code,
    contractName: contract.name,
    contractVersion: contract.version,
    companyId: contract.companyId,
    contractStatus: contract.status,
    allowedActions: contract.allowedActions,
    record: contract.assignments!.find((item) => item.id === id)!,
  };
}
async function settle() {
  for (let i = 0; i < 6; i++) {
    await new Promise((resolve) => setTimeout(resolve, 0));
    await nextTick();
  }
}
const disposals: (() => void)[] = [];
async function mount(id = 'task-a') {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/tasks', component: { render: () => null } }],
  });
  await router.push('/tasks?contractId=contract-a&documentId=task-a');
  await router.isReady();
  const push = vi.spyOn(router, 'push');
  const closed = vi.fn();
  const updated = vi.fn();
  const props = reactive({
    open: true,
    kind: 'tasks' as DocumentKind,
    row: rowFixture(id),
    onClose: closed,
    onUpdated: updated,
  });
  const host = document.createElement('div');
  document.body.append(host);
  const app = createApp({ render: () => h(RecordDetail, props) });
  app.use(router);
  app.mount(host);
  disposals.push(() => {
    app.unmount();
    host.remove();
  });
  await settle();
  return { host, router, push, props, closed, updated };
}
function button(host: HTMLElement, text: string) {
  const result = [...host.querySelectorAll('button')].find(
    (item) => item.textContent?.trim() === text,
  );
  expect(result, `缺少按钮：${text}`).toBeDefined();
  return result!;
}
beforeEach(() => {
  vi.clearAllMocks();
  mocks.contract.mockImplementation(async () => contractFixture());
  mocks.directory.mockResolvedValue({
    companies: [],
    departments: [],
    users: [],
  });
  mocks.attachments.mockResolvedValue({ items: [], uploadCategories: [] });
});
afterEach(() => {
  for (const dispose of disposals.splice(0)) dispose();
});

describe('related document creation inside the source detail', () => {
  it('opens a new quote on the current page with the source task and contract fixed', async () => {
    const view = await mount();
    button(view.host, '新增供应商报价').click();
    await settle();
    const action = view.host.querySelector<HTMLElement>(
      '[data-related-action]',
    )!;
    expect(action).not.toBeNull();
    expect(action.dataset.relatedAction).toBe('CREATE_QUOTE');
    expect(action.dataset.kind).toBe('quotes');
    expect(action.dataset.contract).toBe('contract-a');
    expect(action.dataset.locked).toBe('true');
    expect(JSON.parse(action.dataset.source!)).toEqual({
      kind: 'tasks',
      id: 'task-a',
    });
    expect(action.dataset.row).toBeUndefined();
    expect(view.host.querySelector('[data-parent-detail]')).not.toBeNull();
    expect(button(view.host, '关闭父单据').disabled).toBe(true);
    expect(view.host.textContent).not.toContain('登记自产进度');
    expect(view.host.textContent).not.toContain('前往供应商报价');
    expect(view.push).not.toHaveBeenCalled();
    expect(view.router.currentRoute.value.fullPath).toBe(
      '/tasks?contractId=contract-a&documentId=task-a',
    );
  });

  it('cancels only the child action and keeps the source detail available', async () => {
    const view = await mount();
    button(view.host, '新增供应商报价').click();
    await settle();
    button(view.host, '取消关联建单').click();
    await settle();
    expect(view.host.querySelector('[data-related-action]')).toBeNull();
    expect(view.host.querySelector('[data-parent-detail]')).not.toBeNull();
    expect(button(view.host, '关闭父单据').disabled).toBe(false);
    expect(view.closed).not.toHaveBeenCalled();
    expect(view.updated).not.toHaveBeenCalled();
    expect(view.push).not.toHaveBeenCalled();
  });

  it('refreshes the source record and notifies its list after the child saves', async () => {
    const view = await mount();
    button(view.host, '新增供应商报价').click();
    await settle();
    const refreshed = contractFixture();
    refreshed.assignments![0]!.status = 'IN_PROGRESS';
    mocks.contract.mockResolvedValueOnce(refreshed);
    mocks.contract.mockClear();
    button(view.host, '完成关联建单').click();
    await settle();
    expect(mocks.contract).toHaveBeenCalledExactlyOnceWith('contract-a');
    expect(view.updated).toHaveBeenCalledOnce();
    expect(view.closed).not.toHaveBeenCalled();
    expect(view.host.querySelector('[data-related-action]')).toBeNull();
    expect(view.host.querySelector('[data-parent-detail]')).not.toBeNull();
    expect(view.host.textContent).toContain('进行中');
    expect(view.push).not.toHaveBeenCalled();
  });

  it('shows the MAKE task actions and clears the previous action when the source changes', async () => {
    const view = await mount();
    button(view.host, '新增供应商报价').click();
    await settle();
    view.props.row = rowFixture('task-b');
    await settle();
    expect(view.host.querySelector('[data-related-action]')).toBeNull();
    expect(view.host.textContent).not.toContain('新增供应商报价');
    button(view.host, '编制采购方案');
    button(view.host, '登记自产进度').click();
    await settle();
    const action = view.host.querySelector<HTMLElement>(
      '[data-related-action]',
    )!;
    expect(action.dataset.kind).toBe('production');
    expect(action.dataset.relatedAction).toBe('UPDATE_PRODUCTION');
    expect(JSON.parse(action.dataset.source!)).toEqual({
      kind: 'tasks',
      id: 'task-b',
    });
    expect(action.dataset.row).toBeUndefined();
    expect(view.push).not.toHaveBeenCalled();
  });

  it('opens a new MAKE task plan without confusing the task with an existing plan', async () => {
    const view = await mount('task-b');
    button(view.host, '编制采购方案').click();
    await settle();
    const action = view.host.querySelector<HTMLElement>(
      '[data-related-action]',
    )!;
    expect(action.dataset.kind).toBe('plans');
    expect(action.dataset.relatedAction).toBe('SAVE_PLAN');
    expect(JSON.parse(action.dataset.source!)).toEqual({
      kind: 'tasks',
      id: 'task-b',
    });
    expect(action.dataset.row).toBeUndefined();
    expect(view.push).not.toHaveBeenCalled();
  });

  it('does not reopen an abandoned action when the parent opens for another source', async () => {
    const view = await mount();
    button(view.host, '新增供应商报价').click();
    await settle();
    view.props.open = false;
    await settle();
    expect(view.host.querySelector('[data-related-action]')).toBeNull();
    expect(view.host.querySelector('[data-parent-detail]')).toBeNull();
    view.props.row = rowFixture('task-b');
    view.props.open = true;
    await settle();
    expect(view.host.querySelector('[data-related-action]')).toBeNull();
    expect(view.host.querySelector('[data-parent-detail]')).not.toBeNull();
    button(view.host, '登记自产进度');
    expect(button(view.host, '关闭父单据').disabled).toBe(false);
    expect(view.closed).not.toHaveBeenCalled();
    expect(view.push).not.toHaveBeenCalled();
  });
});
