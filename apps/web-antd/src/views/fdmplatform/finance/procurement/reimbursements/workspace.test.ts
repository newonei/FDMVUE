/* eslint-disable vue/one-component-per-file -- Small adapters exercise the real workspace queries and navigation. */
import type { PropType } from 'vue';

import type { ProcurementFinanceRecord } from '#/api/fdmplatform/procurement-finance';

import {
  createApp,
  defineComponent,
  h,
  nextTick,
  reactive,
  renderSlot,
} from 'vue';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import Workspace from './ReimbursementWorkspace.vue';
import { expenseAction, expenseMoney, expensePayment } from './workspace';

const mocks = vi.hoisted(() => ({
  page: vi.fn(),
  directory: vi.fn(),
  route: { path: '/expenses', query: {} as Record<string, string> },
  push: vi.fn(),
  replace: vi.fn(),
}));
// Isolate navigation from the locally linked vue-router runtime; route changes remain reactive.
vi.mock('vue-router', () => ({
  useRoute: () => mocks.route,
  useRouter: () => ({ push: mocks.push, replace: mocks.replace }),
}));
vi.mock('../../../documents/procurement-tabs', () => ({}));
vi.mock('#/api/fdmplatform', () => ({ getDirectory: mocks.directory }));
vi.mock('#/api/fdmplatform/procurement-finance', () => ({
  getProcurementFinancePage: mocks.page,
}));
vi.mock('@vben/common-ui', () => ({
  Page: defineComponent({
    setup: (_, ctx) => () => h('main', renderSlot(ctx.slots, 'default')),
  }),
}));
vi.mock('../../../documents/BusinessDocumentDetail.vue', () => ({
  default: defineComponent({
    props: { open: Boolean, id: { type: String, default: undefined } },
    emits: ['close'],
    setup: (props, ctx) => () =>
      props.open
        ? h(
            'section',
            { 'data-legacy': props.id },
            h('button', { onClick: () => ctx.emit('close') }, '关闭历史'),
          )
        : null,
  }),
}));
vi.mock('../components/FinanceDocument.vue', () => ({
  default: defineComponent({
    props: {
      open: Boolean,
      recordId: { type: String, default: undefined },
      context: { type: Object, default: undefined },
    },
    emits: ['updated', 'close'],
    setup: (props, ctx) => () =>
      props.open
        ? h(
            'section',
            {
              'data-document': props.recordId ?? 'new',
              'data-context': JSON.stringify(props.context),
            },
            [
              h('button', { onClick: () => ctx.emit('updated') }, '保存报销'),
              h('button', { onClick: () => ctx.emit('close') }, '关闭报销'),
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
      props: { message: { type: String, default: undefined } },
      setup: (props, ctx) => () =>
        h('p', [props.message, ctx.slots.action?.()]),
    }),
    Empty: defineComponent({
      props: { description: { type: String, default: undefined } },
      setup: (props) => () => h('p', props.description),
    }),
    Tag: block,
    Button: defineComponent({
      props: { disabled: Boolean, loading: Boolean },
      setup: (props, ctx) => () =>
        h(
          'button',
          { ...ctx.attrs, disabled: props.disabled || props.loading },
          ctx.slots.default?.(),
        ),
    }),
    Input: {
      Search: defineComponent({
        props: { value: { type: String, default: undefined } },
        emits: ['search', 'update:value'],
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
    Table: defineComponent({
      props: {
        dataSource: {
          type: Array as PropType<ProcurementFinanceRecord[]>,
          default: () => [],
        },
        columns: {
          type: Array as PropType<{ key: string }[]>,
          default: () => [],
        },
        pagination: { type: Object, default: undefined },
      },
      emits: ['change'],
      setup: (props, ctx) => () =>
        h('div', [
          props.dataSource.map((record) =>
            h(
              'article',
              { 'data-row': record.id },
              props.columns.map((column) =>
                ctx.slots.bodyCell?.({ column, record }),
              ),
            ),
          ),
          h(
            'button',
            { onClick: () => ctx.emit('change', { current: 2, pageSize: 15 }) },
            '第二页',
          ),
          props.dataSource.length > 0 ? null : ctx.slots.emptyText?.(),
        ]),
    }),
  };
});
function entry(id = 'expense-a'): ProcurementFinanceRecord {
  return {
    id,
    type: 'REIMBURSEMENT',
    code: `BX-${id}`,
    name: `运费-${id}`,
    version: 1,
    status: 'APPROVED',
    allowedActions: [],
    contractId: '',
    orderId: '',
    currency: 'CNY',
    amount: '100',
    createdBy: 1,
    createdAt: '2026-09-18T09:00:00',
    summary: { complete: true, paidAmount: '25', availablePaymentAmount: '75' },
  };
}
const dispose: (() => void)[] = [];
async function settle() {
  for (let index = 0; index < 4; index++) {
    await new Promise((resolve) => setTimeout(resolve, 0));
    await nextTick();
  }
}
async function mount(query = '') {
  mocks.route = reactive({
    path: '/expenses',
    query: Object.fromEntries(new URLSearchParams(query)),
  });
  const navigate = async (target: { query: Record<string, string> }) => {
    mocks.route.query = target.query;
  };
  mocks.push.mockImplementation(navigate);
  mocks.replace.mockImplementation(navigate);
  const router = { push: mocks.push, currentRoute: { value: mocks.route } };
  const host = document.createElement('div');
  document.body.append(host);
  const app = createApp({ render: () => h(Workspace) });
  app.mount(host);
  dispose.push(() => {
    app.unmount();
    host.remove();
  });
  await settle();
  return { host, router };
}
function button(host: HTMLElement, label: string) {
  const found = [...host.querySelectorAll<HTMLButtonElement>('button')].find(
    (node) => node.textContent?.trim() === label,
  );
  expect(found).toBeDefined();
  return found!;
}
beforeEach(() => {
  vi.clearAllMocks();
  mocks.page.mockResolvedValue({ list: [entry()], total: 31 });
  mocks.directory.mockResolvedValue({
    users: [{ id: 1, nickname: '王珊' }],
    companies: [],
    departments: [],
  });
});
afterEach(() => {
  for (const fn of dispose.splice(0)) fn();
});

describe('费用报销真实列表和付款事实', () => {
  it('缺金额或未核实不能变成零和已付清；生效前不显示付款已完成', () => {
    expect(expenseMoney(undefined, 'CNY')).toBe('—');
    expect(expenseMoney('0', 'CNY')).toBe('CNY 0.00');
    expect(expenseMoney('0.1', 'CNY')).toBe('CNY 0.10');
    expect(expenseMoney('2500', 'JPY')).toBe('JPY 2,500');
    expect(expensePayment({ ...entry(), summary: {} }).label).toBe(
      '付款资料待核实',
    );
    expect(
      expensePayment({ ...entry(), status: 'SUBMITTED' }).paid,
    ).toBeUndefined();
    expect(expensePayment(entry()).label).toBe('部分付款');
    expect(
      expensePayment({
        ...entry(),
        summary: {
          complete: true,
          paidAmount: '100',
          availablePaymentAmount: '0',
        },
      }).label,
    ).toBe('已付清');
    expect(expenseAction({ ...entry(), blockReasons: ['资料缺失'] })).toBe(
      '查看详情',
    );
  });
  it('状态视图请求服务端全范围筛选，分页和编辑刷新保留条件', async () => {
    const { host } = await mount('?contractId=contract-1');
    expect(host.textContent).toContain('共 31 笔报销');
    expect(host.textContent).toContain('王珊');
    button(host, '待付款').click();
    await settle();
    button(host, '第二页').click();
    await settle();
    expect(mocks.page).toHaveBeenLastCalledWith(
      expect.objectContaining({
        paymentStatus: 'UNPAID',
        pageNo: 2,
        contractId: 'contract-1',
      }),
    );
    button(host, '运费-expense-a').click();
    await settle();
    button(host, '保存报销').click();
    await settle();
    expect(mocks.page).toHaveBeenLastCalledWith(
      expect.objectContaining({ paymentStatus: 'UNPAID', pageNo: 2 }),
    );
    button(host, '关闭报销').click();
    await settle();
    button(host, '已付清').click();
    await settle();
    expect(mocks.page).toHaveBeenLastCalledWith(
      expect.objectContaining({ paymentStatus: 'PAID', pageNo: 1 }),
    );
    button(host, '待生效').click();
    await settle();
    expect(mocks.page).toHaveBeenLastCalledWith(
      expect.objectContaining({ status: 'SUBMITTED' }),
    );
  });
  it('原地新建保留业务来源，历史和历史待办深链接均能打开并正常关闭', async () => {
    const { host, router } = await mount(
      '?contractId=c&orderId=o&financeId=selected',
    );
    expect(
      host.querySelector<HTMLElement>('[data-document]')?.dataset.document,
    ).toBe('selected');
    button(host, '关闭报销').click();
    await settle();
    expect(router.currentRoute.value.query).toEqual({
      contractId: 'c',
      orderId: 'o',
    });
    button(host, '新建报销').click();
    await settle();
    expect(
      host.querySelector<HTMLElement>('[data-document]')?.dataset.context,
    ).toBe(JSON.stringify({ contractId: 'c', orderId: 'o' }));
    button(host, '关闭报销').click();
    await settle();
    await router.push({ query: { standaloneId: 'legacy-1', contractId: 'c' } });
    await settle();
    expect(
      host.querySelector<HTMLElement>('[data-legacy]')?.dataset.legacy,
    ).toBe('legacy-1');
    button(host, '关闭历史').click();
    await settle();
    expect(router.currentRoute.value.query).toEqual({ contractId: 'c' });
  });
  it('迟到查询不能覆盖新筛选，筛选失败不能显示旧结果或虚假零统计', async () => {
    let release:
      | ((value: { list: ProcurementFinanceRecord[]; total: number }) => void)
      | undefined;
    mocks.page.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          release = resolve;
        }),
    );
    const { host } = await mount();
    button(host, '草稿').click();
    await settle();
    release?.({ list: [entry('old')], total: 999 });
    await settle();
    expect(host.textContent).not.toContain('999');
    mocks.page.mockRejectedValue(new Error('网络失败'));
    button(host, '待补充').click();
    await settle();
    expect(host.querySelector<HTMLElement>('[data-row]')).toBeNull();
    expect(host.textContent).not.toContain('共 0');
    expect(host.textContent).toContain('网络失败');
  });
  it('移除历史待办深链接关闭旧详情，切换历史单据不叠加抽屉，本地新建仍可打开', async () => {
    const { host, router } = await mount('?contractId=c&financeId=selected');
    expect(
      host.querySelector<HTMLElement>('[data-document]')?.dataset.document,
    ).toBe('selected');
    await router.push({ query: { contractId: 'c' } });
    await settle();
    expect(host.querySelector<HTMLElement>('[data-document]')).toBeNull();
    button(host, '新建报销').click();
    await settle();
    expect(
      host.querySelector<HTMLElement>('[data-document]')?.dataset.document,
    ).toBe('new');
    button(host, '关闭报销').click();
    await settle();
    await router.push({ query: { contractId: 'c', financeId: 'selected' } });
    await settle();
    await router.push({ query: { contractId: 'c', standaloneId: 'legacy-1' } });
    await settle();
    expect(host.querySelector<HTMLElement>('[data-document]')).toBeNull();
    expect(
      host.querySelector<HTMLElement>('[data-legacy]')?.dataset.legacy,
    ).toBe('legacy-1');
  });
  it('从带有旧详情参数的页面新建时清除旧单参数并保留来源', async () => {
    const { host, router } = await mount('?contractId=c&financeId=old');
    button(host, '新建报销').click();
    await settle();
    expect(router.currentRoute.value.query).toEqual({ contractId: 'c' });
    expect(
      host.querySelector<HTMLElement>('[data-document]')?.dataset.document,
    ).toBe('new');
    expect(
      host.querySelector<HTMLElement>('[data-document]')?.dataset.context,
    ).toBe(JSON.stringify({ contractId: 'c' }));
  });
  it('删除或提交后末页空了会回到有效页；搜索只提交确定关键字', async () => {
    const { host } = await mount();
    button(host, '第二页').click();
    await settle();
    mocks.page
      .mockResolvedValueOnce({ list: [], total: 2 })
      .mockResolvedValue({ list: [entry()], total: 2 });
    button(host, '刷新').click();
    await settle();
    expect(mocks.page).toHaveBeenLastCalledWith(
      expect.objectContaining({ pageNo: 1 }),
    );
    const input = host.querySelector('input')!;
    input.value = ' 运费 ';
    input.dispatchEvent(new Event('input'));
    await settle();
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
    await settle();
    expect(mocks.page).toHaveBeenLastCalledWith(
      expect.objectContaining({ keyword: '运费', pageNo: 1 }),
    );
  });
});
