/* eslint-disable vue/one-component-per-file -- Child adapters expose real ContractDetail launch events without overlay animations. */
import type { PropType } from 'vue';

import type { DocumentKind } from '../documents/model';
import type { WorkboardLaunch } from './contract-workboard';

import type { Contract, DocumentRow } from '#/api/fdmplatform';

import {
  computed,
  createApp,
  defineComponent,
  h,
  nextTick,
  reactive,
} from 'vue';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { documentDefinitions } from '../documents/model';
import ContractDetail from './ContractDetail.vue';

const mocks = vi.hoisted(() => ({
  activate: vi.fn(),
  attachments: vi.fn(),
  summary: vi.fn(),
  customs: vi.fn(),
  launch: undefined as undefined | WorkboardLaunch,
  saved: undefined as Contract | undefined,
  reviewPrimaryAction: vi.fn(),
  reviewSubmit: vi.fn(),
}));
const reviewState = reactive({
  busy: false,
  loading: false,
  byContract: {} as Record<
    string,
    { primaryLabel: string; status: string; statusLabel: string }
  >,
});
vi.mock('#/api/fdmplatform', () => ({
  contractAction: mocks.activate,
  newIdempotencyKey: () => 'activation-key',
  getAttachments: mocks.attachments,
  getContractAudit: vi.fn().mockResolvedValue([]),
}));
vi.mock('#/api/fdmplatform/contract-progress', () => ({
  getContractRelatedSummary: mocks.summary,
}));
vi.mock('#/api/fdmplatform/customs', () => ({
  getCustomsSummary: mocks.customs,
}));
vi.mock('#/api/fdmplatform/products', () => ({
  downloadContractProductAttachment: vi.fn(),
}));
vi.mock('./contract-progress', () => ({
  contractItemProgress: () => [],
  contractRelatedStages: () => [],
}));
vi.mock('./ContractWorkboard.vue', () => ({
  default: defineComponent({
    props: {
      contract: { type: Object as PropType<Contract>, required: true },
      disabled: Boolean,
      loading: Boolean,
    },
    emits: ['launch'],
    setup: (props, ctx) => () =>
      h(
        'button',
        {
          'data-workboard': props.contract.id,
          disabled: props.disabled || props.loading,
          onClick: () => ctx.emit('launch', mocks.launch),
        },
        '办理工作台事项',
      ),
  }),
}));
vi.mock('../documents/DocumentAction.vue', () => ({
  default: defineComponent({
    props: {
      open: Boolean,
      lockContract: Boolean,
      contractId: { type: String, default: undefined },
      kind: { type: String, default: undefined },
      action: { type: String, default: undefined },
      source: {
        type: Object as PropType<WorkboardLaunch['source']>,
        default: undefined,
      },
      row: { type: Object as PropType<DocumentRow>, default: undefined },
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
              h('button', { onClick: () => ctx.emit('close') }, '取消当前建单'),
              h(
                'button',
                {
                  onClick: () => {
                    ctx.emit('updated', mocks.saved);
                    ctx.emit('close');
                  },
                },
                '保存当前建单',
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
      kind: { type: String, default: undefined },
      row: { type: Object as PropType<DocumentRow>, default: undefined },
    },
    emits: ['close', 'updated'],
    setup: (props, ctx) => () =>
      props.open
        ? h(
            'section',
            {
              'data-record': props.row?.id,
              'data-record-kind': props.kind,
              'data-record-contract': props.row?.contractId,
              'data-embedded': String(props.embedded),
            },
            [
              h(
                'button',
                { onClick: () => ctx.emit('close') },
                '关闭待核对单据',
              ),
              h('button', { onClick: () => ctx.emit('updated') }, '单据已办理'),
            ],
          )
        : null,
  }),
}));
vi.mock('./ContractDocumentDialog.vue', () => ({
  default: defineComponent({
    props: {
      open: Boolean,
      kind: { type: String, default: undefined },
      mode: { type: String, default: undefined },
      contract: { type: Object as PropType<Contract>, default: undefined },
    },
    emits: ['close', 'updated'],
    setup: (props, ctx) => () =>
      props.open
        ? h(
            'section',
            {
              'data-list': props.kind,
              'data-mode': props.mode,
              'data-list-contract': props.contract?.id,
            },
            [h('button', { onClick: () => ctx.emit('close') }, '关闭关联列表')],
          )
        : null,
  }),
}));
vi.mock('../products/components/ContractEditor.vue', () => ({
  default: defineComponent({ render: () => null }),
}));
vi.mock('../documents/ImportedContractCompletion.vue', () => ({
  default: defineComponent({ render: () => null }),
}));
vi.mock('../documents/LinkedRecordTable.vue', () => ({
  default: defineComponent({ render: () => null }),
}));
vi.mock('../documents/MigrationSource.vue', () => ({
  default: defineComponent({ render: () => null }),
}));
vi.mock('../documents/RelatedLink.vue', () => ({
  default: defineComponent({
    setup: (_, ctx) => () => h('span', {}, ctx.slots.default?.()),
  }),
}));
vi.mock('../finance/procurement/components/FinanceDocument.vue', () => ({
  default: defineComponent({ render: () => null }),
}));
vi.mock('./AttachmentPanel.vue', () => ({
  default: defineComponent({ render: () => null }),
}));
vi.mock('./ContractReviewPanel.vue', () => ({
  default: defineComponent({
    props: {
      contract: { type: Object as PropType<Contract>, default: undefined },
    },
    setup(props, { expose }) {
      const current = computed(
        () => reviewState.byContract[props.contract?.id ?? ''],
      );
      expose({
        busy: computed(() => reviewState.busy),
        current,
        loading: computed(() => reviewState.loading),
        primaryLabel: computed(() => current.value?.primaryLabel ?? '提交审核'),
        statusLabel: computed(() => current.value?.statusLabel ?? '草稿'),
        primaryAction: () => mocks.reviewPrimaryAction(props.contract?.id),
        submit: mocks.reviewSubmit,
      });
      return () => null;
    },
  }),
}));
vi.mock('./RecordTable.vue', () => ({
  default: defineComponent({ render: () => null }),
}));
vi.mock('ant-design-vue', () => {
  const block = defineComponent({
    setup: (_, ctx) => () => h('div', ctx.attrs, ctx.slots.default?.()),
  });
  return {
    Alert: block,
    Card: block,
    Descriptions: Object.assign(block, { Item: block }),
    Space: block,
    Tabs: block,
    Tag: defineComponent({
      setup: (_, ctx) => () =>
        h('span', { 'data-status-tag': true }, ctx.slots.default?.()),
    }),
    TabPane: defineComponent({
      props: { tab: { type: String, default: '' } },
      setup: (props, ctx) => () =>
        h('div', { 'data-tab': props.tab }, ctx.slots.default?.()),
    }),
    Button: defineComponent({
      props: { disabled: Boolean, loading: Boolean },
      setup: (props, ctx) => () =>
        h(
          'button',
          { ...ctx.attrs, disabled: props.disabled || props.loading },
          ctx.slots.default?.(),
        ),
    }),
    Drawer: defineComponent({
      props: {
        open: Boolean,
        closable: Boolean,
        keyboard: Boolean,
        maskClosable: Boolean,
        title: { type: String, default: '' },
      },
      emits: ['close'],
      setup: (props, ctx) => () =>
        props.open
          ? h(
              'section',
              {
                'data-order': props.title,
                'data-keyboard': String(props.keyboard),
                'data-mask-closable': String(props.maskClosable),
                onKeydown: (event: KeyboardEvent) => {
                  if (event.key === 'Escape') ctx.emit('close');
                },
              },
              [
                h(
                  'button',
                  {
                    'data-close-order': true,
                    disabled: !props.closable,
                    onClick: () => ctx.emit('close'),
                  },
                  '关闭订单',
                ),
                ctx.slots.extra?.(),
                ctx.slots.default?.(),
              ],
            )
          : null,
    }),
    message: { success: vi.fn(), warning: vi.fn(), error: vi.fn() },
  };
});

function contract(id = 'contract-1'): Contract {
  return {
    id,
    code: `HT-${id}`,
    name: '测试订单',
    companyId: 1,
    departmentId: 1,
    ownerUserId: 7,
    customerId: 'customer',
    customerName: '测试客户',
    businessType: 'FOREIGN',
    currency: 'USD',
    amount: '100',
    status: 'CONFIRMED',
    version: 1,
    businessVersion: 1,
    items: [],
    requests: [],
    assignments: [
      { id: 'task-1', method: 'BUY', status: 'ASSIGNED', quantity: '10' },
    ],
    plans: [{ id: 'plan-1', status: 'SUBMITTED', name: '待审核方案' }],
    finance: {
      receipts: [
        { id: 'receipt-1', status: 'PENDING', kind: 'PAYMENT', amount: '100' },
      ],
    },
    allowedActions: [
      'CREATE_RECEIPT',
      'STOCK_RESERVE',
      'CREATE_REQUEST',
      'STOCK_SHIP',
      'CREATE_INVOICE',
      'CREATE_QUOTE',
      'DECIDE_PLAN',
      'CONFIRM_RECEIPT',
    ],
  };
}
const disposals: (() => void)[] = [];
function button(host: ParentNode, title: string) {
  const result = [...host.querySelectorAll('button')].find(
    (entry) => entry.textContent?.trim() === title,
  );
  expect(result).toBeTruthy();
  return result!;
}
async function mountDetail() {
  const host = document.createElement('div');
  document.body.append(host);
  const updated = vi.fn();
  const close = vi.fn();
  const refresh = vi.fn();
  const props = reactive({
    contract: contract(),
    initialTab: 'overview' as const,
    loading: false,
    master: [],
    open: true,
    pools: [],
    workspace: 'trade-contracts' as const,
  });
  const app = createApp({
    render: () =>
      h(ContractDetail, {
        ...props,
        onUpdated: updated,
        onClose: close,
        onRefresh: refresh,
      }),
  });
  app.mount(host);
  disposals.push(() => {
    app.unmount();
    host.remove();
  });
  await nextTick();
  await nextTick();
  return { host, props, updated, close, refresh };
}
beforeEach(() => {
  vi.clearAllMocks();
  mocks.launch = undefined;
  reviewState.busy = false;
  reviewState.loading = false;
  reviewState.byContract = {};
  mocks.saved = { ...contract(), version: 2 };
  mocks.activate.mockResolvedValue({ ...contract(), version: 2 });
  mocks.attachments.mockResolvedValue({ items: [] });
  mocks.summary.mockResolvedValue({});
  mocks.customs.mockResolvedValue({ completed: 0, total: 0 });
});
afterEach(() => {
  while (disposals.length > 0) disposals.pop()!();
});

describe('contractDetail workboard integration', () => {
  it('activates a saved draft directly and refreshes with the returned contract', async () => {
    const { host, props, updated } = await mountDetail();
    props.contract = {
      ...contract(),
      status: 'DRAFT',
      allowedActions: ['CONFIRM_CONTRACT'],
    };
    await nextTick();
    button(host, '合同生效').click();
    await vi.waitFor(() =>
      expect(updated).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'CONFIRMED', version: 2 }),
      ),
    );
    expect(mocks.activate).toHaveBeenCalledExactlyOnceWith(
      'contract-1',
      'CONFIRM_CONTRACT',
      1,
      expect.any(String),
      {},
    );
    expect(mocks.reviewPrimaryAction).not.toHaveBeenCalled();
    expect(mocks.reviewSubmit).not.toHaveBeenCalled();
    expect(host.textContent).not.toContain('提交审核');
    expect(host.textContent).not.toContain('合同审核');
  });

  it('prevents duplicate activation and drawer dismissal while activation is pending', async () => {
    let finish!: (value: Contract) => void;
    mocks.activate.mockImplementationOnce(
      () =>
        new Promise<Contract>((resolve) => {
          finish = resolve;
        }),
    );
    const { host, props, close } = await mountDetail();
    props.contract = {
      ...contract(),
      status: 'DRAFT',
      allowedActions: ['CONFIRM_CONTRACT', 'UPDATE_CONTRACT'],
    };
    await nextTick();
    button(host, '合同生效').click();
    await nextTick();
    expect(button(host, '合同生效').disabled).toBe(true);
    expect(button(host, '编辑合同与产品').disabled).toBe(true);
    expect(button(host, '刷新合同').disabled).toBe(true);
    const drawer = host.querySelector<HTMLElement>('[data-order]')!;
    expect(drawer.dataset.keyboard).toBe('false');
    drawer.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(close).not.toHaveBeenCalled();
    button(host, '合同生效').click();
    expect(mocks.activate).toHaveBeenCalledOnce();
    finish({ ...contract(), version: 2 });
    await vi.waitFor(() =>
      expect(button(host, '刷新合同').disabled).toBe(false),
    );
  });

  it('retains the draft on activation validation failure and does not use the review API', async () => {
    mocks.activate.mockRejectedValueOnce(new Error('请补齐产品价格'));
    const { host, props, updated } = await mountDetail();
    props.contract = {
      ...contract(),
      status: 'DRAFT',
      allowedActions: ['CONFIRM_CONTRACT'],
    };
    await nextTick();
    button(host, '合同生效').click();
    await vi.waitFor(() =>
      expect(button(host, '合同生效').disabled).toBe(false),
    );
    expect(updated).not.toHaveBeenCalled();
    expect(
      host.querySelector<HTMLElement>('[data-status-tag]')?.textContent,
    ).toBe('草稿');
    expect(mocks.reviewSubmit).not.toHaveBeenCalled();
  });

  it.each([
    ['登记回款', 'receipts', 'CREATE_RECEIPT'],
    ['预留库存', 'shipments', 'STOCK_RESERVE'],
  ])(
    'opens %s directly as a contract-locked action and keeps the order when cancelled',
    async (title, kind, action) => {
      const { host, close } = await mountDetail();
      button(host, title).click();
      await nextTick();
      const dialog = host.querySelector<HTMLElement>('[data-action]')!;
      expect(dialog.dataset.kind).toBe(kind);
      expect(dialog.dataset.action).toBe(action);
      expect(dialog.dataset.contract).toBe('contract-1');
      expect(dialog.dataset.locked).toBe('true');
      expect(host.querySelector<HTMLElement>('[data-list]')).toBeNull();
      expect(
        host.querySelector<HTMLButtonElement>('[data-close-order]')?.disabled,
      ).toBe(true);
      button(host, '取消当前建单').click();
      await nextTick();
      expect(host.querySelector<HTMLElement>('[data-action]')).toBeNull();
      expect(host.querySelector<HTMLElement>('[data-order]')).not.toBeNull();
      expect(
        host.querySelector<HTMLButtonElement>('[data-close-order]')?.disabled,
      ).toBe(false);
      expect(close).not.toHaveBeenCalled();
    },
  );

  it('passes a task source through to the action and updates the order after the child saves', async () => {
    const { host, updated, close } = await mountDetail();
    mocks.launch = {
      kind: 'quotes',
      action: 'CREATE_QUOTE',
      source: { kind: 'tasks', id: 'task-1' },
    };
    button(host, '办理工作台事项').click();
    await nextTick();
    const dialog = host.querySelector<HTMLElement>('[data-action]')!;
    expect(dialog.dataset.kind).toBe('quotes');
    expect(dialog.dataset.source).toBe(JSON.stringify(mocks.launch.source));
    expect(Object.hasOwn(dialog.dataset, 'row')).toBe(false);
    button(host, '保存当前建单').click();
    await nextTick();
    expect(updated).toHaveBeenCalledExactlyOnceWith(mocks.saved);
    expect(mocks.attachments).toHaveBeenCalledTimes(2);
    expect(host.querySelector<HTMLElement>('[data-action]')).toBeNull();
    expect(host.querySelector<HTMLElement>('[data-order]')).not.toBeNull();
    expect(close).not.toHaveBeenCalled();
  });

  it.each([
    ['plans', 'plan-1'],
    ['receipts', 'receipt-1'],
  ] as const)(
    'opens %s for review before an approval action when the workboard supplies only a record',
    async (kind, recordId) => {
      const { host, refresh } = await mountDetail();
      mocks.launch = { kind, recordId };
      button(host, '办理工作台事项').click();
      await nextTick();
      const detail = host.querySelector<HTMLElement>('[data-record]')!;
      expect(detail.dataset.record).toBe(recordId);
      expect(detail.dataset.recordKind).toBe(kind);
      expect(detail.dataset.recordContract).toBe('contract-1');
      expect(detail.dataset.embedded).toBe('true');
      expect(host.querySelector<HTMLElement>('[data-action]')).toBeNull();
      button(host, '单据已办理').click();
      expect(refresh).toHaveBeenCalledOnce();
      button(host, '关闭待核对单据').click();
      await nextTick();
      expect(host.querySelector<HTMLElement>('[data-record]')).toBeNull();
      expect(host.querySelector<HTMLElement>('[data-order]')).not.toBeNull();
    },
  );

  it('opens every progress navigation entry in list mode, including entries that usually launch a create form', async () => {
    const { host } = await mountDetail();
    const progress = host.querySelector<HTMLElement>(
      '[data-tab="流程进度与关联单据"]',
    )!;
    const kinds: DocumentKind[] = [
      'requests',
      'shipments',
      'salesReturns',
      'tasks',
      'quotes',
      'plans',
      'orders',
      'arrivals',
      'purchaseReturns',
      'production',
      'receipts',
      'refunds',
      'invoices',
      'allocations',
      'costs',
    ];
    for (const kind of kinds) {
      button(progress, documentDefinitions[kind].title).click();
      await nextTick();
      const list = host.querySelector<HTMLElement>('[data-list]')!;
      expect(list.dataset.list).toBe(kind);
      expect(list.dataset.mode).toBe('list');
      expect(list.dataset.listContract).toBe('contract-1');
      expect(host.querySelector<HTMLElement>('[data-action]')).toBeNull();
      button(host, '关闭关联列表').click();
      await nextTick();
    }
    button(progress, '报关跟进').click();
    await nextTick();
    expect(
      host.querySelector<HTMLElement>('[data-list="customs"]')?.dataset.mode,
    ).toBe('list');
  });

  it('clears both active forms and related lists when switching contracts', async () => {
    const { host, props } = await mountDetail();
    button(host, '登记回款').click();
    await nextTick();
    props.contract = contract('contract-2');
    await nextTick();
    expect(host.querySelector<HTMLElement>('[data-action]')).toBeNull();
    expect(
      host.querySelector<HTMLElement>('[data-workboard]')?.dataset.workboard,
    ).toBe('contract-2');
    const progress = host.querySelector<HTMLElement>(
      '[data-tab="流程进度与关联单据"]',
    )!;
    button(progress, documentDefinitions.orders.title).click();
    await nextTick();
    expect(
      host.querySelector<HTMLElement>('[data-list]')?.dataset.listContract,
    ).toBe('contract-2');
    props.contract = contract('contract-3');
    await nextTick();
    expect(host.querySelector<HTMLElement>('[data-list]')).toBeNull();
    button(host, '预留库存').click();
    await nextTick();
    expect(
      host.querySelector<HTMLElement>('[data-action]')?.dataset.contract,
    ).toBe('contract-3');
  });
});
