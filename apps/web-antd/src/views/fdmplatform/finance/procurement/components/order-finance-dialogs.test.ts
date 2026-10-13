/* eslint-disable vue/one-component-per-file -- Minimal controls keep the local dialog integration observable. */
import { createApp, defineComponent, h, nextTick } from 'vue';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import OrderFinance from './OrderFinance.vue';

const mocks = vi.hoisted(() => ({ summary: vi.fn(), push: vi.fn() }));
vi.mock('#/api/fdmplatform/procurement-finance', () => ({
  getProcurementFinanceSummary: mocks.summary,
}));
vi.mock('vue-router', () => ({
  useRoute: () => ({ path: '/purchase/orders' }),
  useRouter: () => ({ push: mocks.push }),
}));
vi.mock('./FinanceDocument.vue', () => ({
  default: defineComponent({
    props: {
      open: Boolean,
      type: { type: String, default: '' },
      recordId: { type: String, default: undefined },
      context: { type: Object, default: () => ({}) },
    },
    emits: ['close', 'updated'],
    setup(props, { emit }) {
      return () =>
        props.open
          ? h(
              'section',
              {
                'data-finance-dialog': true,
                'data-record-id': props.recordId,
                'data-type': props.type,
                'data-context': JSON.stringify(props.context),
              },
              [
                h(
                  'button',
                  { onClick: () => emit('updated', { id: props.recordId }) },
                  '更新财务单据',
                ),
                h('button', { onClick: () => emit('close') }, '关闭财务单据'),
              ],
            )
          : null;
    },
  }),
}));
vi.mock('./PaymentRecordDialog.vue', () => ({
  default: defineComponent({
    props: {
      open: Boolean,
      available: { type: null, default: undefined },
      previous: { type: Array, default: () => [] },
      orderCode: { type: String, default: undefined },
    },
    setup(props) {
      return () =>
        props.open
          ? h('section', {
              'data-payment-dialog': true,
              'data-available': String(props.available),
              'data-previous': props.previous.length,
              'data-order-code': props.orderCode,
            })
          : null;
    },
  }),
}));
vi.mock('./PaymentInvoiceDialog.vue', () => ({
  default: defineComponent({ setup: () => () => null }),
}));
vi.mock('./RefundTable.vue', () => ({
  default: defineComponent({ setup: () => () => null }),
}));
vi.mock('../../../documents/BusinessDocumentDetail.vue', () => ({
  default: defineComponent({
    props: {
      open: Boolean,
      id: { type: String, default: undefined },
      embedded: Boolean,
    },
    setup(props) {
      return () =>
        props.open
          ? h('section', {
              'data-imported-id': props.id,
              'data-embedded': props.embedded,
            })
          : null;
    },
  }),
}));
vi.mock('ant-design-vue', () => {
  const block = defineComponent({
    setup(_, { slots, attrs }) {
      return () => h('div', attrs, slots.default?.());
    },
  });
  return {
    Alert: block,
    Button: defineComponent({
      setup(_, { attrs, slots }) {
        return () => h('button', attrs, slots.default?.());
      },
    }),
    Card: block,
    Descriptions: Object.assign(block, { Item: block }),
    Space: block,
    Tag: block,
    message: { success: vi.fn(), error: vi.fn() },
    Table: defineComponent({
      props: { dataSource: { type: Array, default: () => [] } },
      setup(props, { slots }) {
        return () =>
          h(
            'div',
            props.dataSource.map((record) =>
              slots.bodyCell?.({ column: { key: 'name' }, record }),
            ),
          );
      },
    }),
  };
});
let cleanup: (() => void) | undefined;
beforeEach(() => {
  vi.clearAllMocks();
  mocks.summary.mockResolvedValue({
    currency: 'CNY',
    availableRequestAmount: '60',
    availablePaymentAmount: '45',
    payments: [
      {
        id: 'pay-1',
        code: 'CGFK-1',
        type: 'PAYMENT',
        sourceType: 'PURCHASE_ORDER',
      },
    ],
    requests: [
      { id: 'request-1', code: 'QK-1', name: '首期请款', type: 'REQUEST' },
    ],
    expensePayments: [
      { id: 'payment-1', code: 'FK-1', name: '报销付款', type: 'PAYMENT' },
    ],
  });
});
afterEach(() => {
  cleanup?.();
  cleanup = undefined;
});
async function mount() {
  const host = document.createElement('div');
  document.body.append(host);
  const changed = vi.fn();
  const app = createApp(OrderFinance, {
    mode: 'payments',
    contractId: 'contract-1',
    orderId: 'order-1',
    orderCode: 'CG-1',
    onChanged: changed,
  });
  app.mount(host);
  cleanup = () => {
    app.unmount();
    host.remove();
  };
  await vi.waitFor(() => expect(host.textContent).toContain('首期请款'));
  return { host, changed };
}
function click(host: Element, text: string) {
  const button = [...host.querySelectorAll('button')].find(
    (node) => node.textContent?.trim() === text,
  );
  expect(button).toBeTruthy();
  button!.click();
}
describe('采购单财务卡片弹窗办理', () => {
  it('点击关联请款、付款留在采购单内，更新自动刷新摘要，新建不会携带旧记录 ID', async () => {
    const { host, changed } = await mount();
    click(host, 'QK-1 · 首期请款');
    await nextTick();
    expect(
      host.querySelector<HTMLElement>('[data-finance-dialog]')?.dataset
        .recordId,
    ).toBe('request-1');
    expect(mocks.push).not.toHaveBeenCalled();
    click(host, '更新财务单据');
    await vi.waitFor(() => expect(mocks.summary).toHaveBeenCalledTimes(2));
    expect(changed).toHaveBeenCalledOnce();
    click(host, '关闭财务单据');
    await nextTick();
    click(host, 'FK-1 · 报销付款');
    await nextTick();
    expect(
      host.querySelector<HTMLElement>('[data-finance-dialog]')?.dataset.type,
    ).toBe('PAYMENT');
    expect(
      host.querySelector<HTMLElement>('[data-finance-dialog]')?.dataset
        .recordId,
    ).toBe('payment-1');
    click(host, '关闭财务单据');
    await nextTick();
    click(host, '新建关联报销');
    await nextTick();
    const dialog = host.querySelector<HTMLElement>('[data-finance-dialog]')!;
    expect(Object.hasOwn(dialog.dataset, 'recordId')).toBe(false);
    expect(dialog.dataset.type).toBe('REIMBURSEMENT');
    expect(JSON.parse(dialog.dataset.context!)).toEqual({
      contractId: 'contract-1',
      orderId: 'order-1',
      currency: 'CNY',
    });
    expect(mocks.push).not.toHaveBeenCalled();
  });

  it('付款直接登记付款记录，不再提供请款和分期入口；历史请款只读显示', async () => {
    const { host } = await mount();
    expect(host.textContent).not.toContain('发起采购请款');
    expect(host.textContent).not.toContain('安排分期付款');
    expect(host.querySelector('[title="采购请款单（历史）"]')).toBeTruthy();
    expect(host.querySelector('[title="付款计划（历史）"]')).toBeNull();
    click(host, '登记付款');
    await nextTick();
    const dialog = host.querySelector<HTMLElement>('[data-payment-dialog]')!;
    expect(dialog.dataset.available).toBe('45');
    expect(dialog.dataset.previous).toBe('1');
    expect(dialog.dataset.orderCode).toBe('CG-1');
  });

  it('导入的付款记录同样在采购单内打开原单据', async () => {
    mocks.summary.mockResolvedValue({
      requests: [
        {
          id: 'legacy-1',
          standaloneId: 'import-1',
          type: 'REQUEST',
          code: 'OLD-1',
          name: '首期请款',
        },
      ],
    });
    const { host } = await mount();
    click(host, 'OLD-1 · 首期请款');
    await nextTick();
    expect(
      host.querySelector<HTMLElement>('[data-imported-id="import-1"]')?.dataset
        .embedded,
    ).toBe('true');
    expect(mocks.push).not.toHaveBeenCalled();
  });
});
