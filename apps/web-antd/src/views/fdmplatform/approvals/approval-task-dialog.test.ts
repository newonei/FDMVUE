/* eslint-disable vue/one-component-per-file -- UI adapters expose source selection without submitting real approvals. */
import type { PropType } from 'vue';

import type { Contract, DocumentRow } from '#/api/fdmplatform';
import type { ApprovalTask } from '#/api/fdmplatform/approval-inbox';

import { createApp, defineComponent, h, nextTick, reactive } from 'vue';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import ApprovalTaskDialog from './ApprovalTaskDialog.vue';

const mocks = vi.hoisted(() => ({ contract: vi.fn(), finance: vi.fn() }));
vi.mock('#/api/fdmplatform', () => ({ getContract: mocks.contract }));
vi.mock('#/api/fdmplatform/procurement-finance', () => ({
  getProcurementFinance: mocks.finance,
}));
vi.mock('../components/ContractDetail.vue', () => ({
  default: defineComponent({
    props: {
      open: Boolean,
      contract: { type: Object as PropType<Contract>, default: undefined },
    },
    emits: ['close', 'updated', 'refresh'],
    setup: (props, ctx) => () =>
      props.open
        ? h('section', { 'data-contract': props.contract?.id }, [
            h('button', { onClick: () => ctx.emit('close') }, '关闭合同'),
            h(
              'button',
              { onClick: () => ctx.emit('updated', props.contract) },
              '完成合同办理',
            ),
          ])
        : null,
  }),
}));
vi.mock('../documents/RecordDetail.vue', () => ({
  default: defineComponent({
    props: {
      open: Boolean,
      row: { type: Object as PropType<DocumentRow>, default: undefined },
    },
    emits: ['close', 'updated'],
    setup: (props, ctx) => () =>
      props.open
        ? h(
            'section',
            {
              'data-plan': props.row?.id,
              'data-contract': props.row?.contractId,
            },
            [
              h('button', { onClick: () => ctx.emit('close') }, '关闭方案'),
              h(
                'button',
                { onClick: () => ctx.emit('updated') },
                '完成方案办理',
              ),
            ],
          )
        : null,
  }),
}));
vi.mock('../finance/procurement/components/FinanceDocument.vue', () => ({
  default: defineComponent({
    props: {
      open: Boolean,
      recordId: { type: String, default: undefined },
      type: { type: String, default: undefined },
    },
    emits: ['close', 'updated'],
    setup: (props, ctx) => () =>
      props.open
        ? h(
            'section',
            { 'data-finance': props.recordId, 'data-type': props.type },
            [
              h('button', { onClick: () => ctx.emit('close') }, '关闭财务单据'),
              h(
                'button',
                { onClick: () => ctx.emit('updated') },
                '完成财务办理',
              ),
            ],
          )
        : null,
  }),
}));
vi.mock('ant-design-vue', () => {
  const block = defineComponent({
    setup: (_, ctx) => () => h('div', ctx.slots.default?.()),
  });
  return {
    Alert: defineComponent({
      props: { message: { type: String, default: '' } },
      setup: (props) => () => h('p', { role: 'alert' }, props.message),
    }),
    Button: defineComponent({
      setup: (_, ctx) => () => h('button', ctx.attrs, ctx.slots.default?.()),
    }),
    Modal: defineComponent({
      props: { open: Boolean },
      setup: (props, ctx) => () =>
        props.open
          ? h('div', { 'data-modal': true }, ctx.slots.default?.())
          : null,
    }),
    Space: block,
    Spin: block,
  };
});

function task(
  sourceKind: ApprovalTask['sourceKind'] = 'PURCHASE_PLAN',
  sourceId = 'plan-a',
): ApprovalTask {
  return {
    id: `task-${sourceId}`,
    sourceKind,
    sourceId,
    contractId: 'contract-a',
    title: '待办测试',
    requesterUserId: 1,
    handlerUserId: 2,
    status: 'OPEN',
    openedAt: '',
    deadline: '',
    overdue: false,
  };
}
function contract(id = 'contract-a', planId = 'plan-a'): Contract {
  return {
    id,
    code: 'HT-001',
    name: '订单甲',
    companyId: 1,
    version: 2,
    status: 'CONFIRMED',
    allowedActions: ['DECIDE_PLAN'],
    plans: [{ id: planId, status: 'SUBMITTED' }],
  } as Contract;
}
async function settle() {
  for (let i = 0; i < 4; i++) {
    await new Promise((resolve) => setTimeout(resolve, 0));
    await nextTick();
  }
}
const disposals: (() => void)[] = [];
async function mount(selected: ApprovalTask) {
  const updated = vi.fn();
  const closed = vi.fn();
  const props = reactive({
    open: true,
    task: selected,
    onUpdated: updated,
    onClose: closed,
  });
  const host = document.createElement('div');
  document.body.append(host);
  const app = createApp({ render: () => h(ApprovalTaskDialog, props) });
  app.mount(host);
  disposals.push(() => {
    app.unmount();
    host.remove();
  });
  await settle();
  return { host, props, updated, closed };
}
beforeEach(() => {
  vi.clearAllMocks();
  mocks.contract.mockResolvedValue(contract());
  mocks.finance.mockResolvedValue({ id: 'finance-a', type: 'REIMBURSEMENT' });
});
afterEach(() => {
  for (const dispose of disposals.splice(0)) dispose();
});

describe('approval inbox source dialogs', () => {
  it('opens the freshly loaded plan in its existing detail and returns updates without closing it', async () => {
    const view = await mount(task());
    expect(
      view.host.querySelector<HTMLElement>('[data-plan]')?.dataset.plan,
    ).toBe('plan-a');
    expect(view.host.querySelector('[data-modal]')).toBeNull();
    const complete = [...view.host.querySelectorAll('button')].find(
      (button) => button.textContent === '完成方案办理',
    )!;
    complete.click();
    expect(view.updated).toHaveBeenCalledOnce();
    expect(view.closed).not.toHaveBeenCalled();
    expect(view.host.querySelector('[data-plan]')).not.toBeNull();
  });
  it('loads the actual finance document type before opening the existing form', async () => {
    const view = await mount(task('PROC_FINANCE', 'finance-a'));
    expect(
      view.host.querySelector<HTMLElement>('[data-finance]')?.dataset.type,
    ).toBe('REIMBURSEMENT');
    expect(mocks.finance).toHaveBeenCalledWith('finance-a');
    expect(mocks.contract).not.toHaveBeenCalled();
  });
  it('opens the full current contract for contract review instead of a second approval implementation', async () => {
    const view = await mount(task('CONTRACT_REVIEW', 'review-a'));
    expect(
      view.host.querySelector<HTMLElement>('[data-contract]')?.dataset.contract,
    ).toBe('contract-a');
    expect(view.host.querySelector('[data-plan]')).toBeNull();
  });
  it('shows missing sources, permission errors and unsupported task types without opening a blank creation form', async () => {
    mocks.contract.mockRejectedValue(new Error('无权读取此合同'));
    const denied = await mount(task());
    expect(denied.host.textContent).toContain('无权读取此合同');
    expect(denied.host.querySelector('[data-plan]')).toBeNull();
    mocks.contract.mockResolvedValue(contract());
    const missing = await mount(task('PURCHASE_PLAN', 'missing-plan'));
    expect(missing.host.querySelector('[role="alert"]')).not.toBeNull();
    expect(missing.host.querySelector('[data-plan]')).toBeNull();
    const unsupported = await mount({
      ...task(),
      sourceKind: 'UNKNOWN' as ApprovalTask['sourceKind'],
    });
    expect(unsupported.host.textContent).toContain('暂不支持此类待办');
    expect(unsupported.host.querySelector('[data-finance]')).toBeNull();
  });
  it('ignores a late response after switching to another task', async () => {
    let resolveOld!: (value: Contract) => void;
    mocks.contract.mockReturnValueOnce(
      new Promise<Contract>((resolve) => {
        resolveOld = resolve;
      }),
    );
    const view = await mount(task());
    view.props.task = task('PROC_FINANCE', 'finance-a');
    await settle();
    resolveOld(contract());
    await settle();
    expect(view.host.querySelector('[data-finance]')).not.toBeNull();
    expect(view.host.querySelector('[data-plan]')).toBeNull();
  });
  it('ignores a late response after the inbox dialog closes', async () => {
    let resolveOld!: (value: Contract) => void;
    mocks.contract.mockReturnValueOnce(
      new Promise<Contract>((resolve) => {
        resolveOld = resolve;
      }),
    );
    const view = await mount(task());
    view.props.open = false;
    await settle();
    resolveOld(contract());
    await settle();
    expect(view.host.querySelector('[data-plan]')).toBeNull();
    expect(view.host.querySelector('[data-modal]')).toBeNull();
  });
});
