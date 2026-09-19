/* eslint-disable vue/one-component-per-file -- Native adapters exercise workboard interactions without Ant Design portals. */
import type { Contract } from '#/api/fdmplatform';

import { createApp, defineComponent, h, nextTick, reactive } from 'vue';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { contractWorkboard, workboardDocumentRow } from './contract-workboard';
import ContractWorkboard from './ContractWorkboard.vue';

vi.mock('ant-design-vue', () => {
  const block = defineComponent({
    setup: (_, ctx) => () => h('div', ctx.attrs, ctx.slots.default?.()),
  });
  return {
    Card: block,
    Tag: block,
    Button: defineComponent({
      props: { disabled: Boolean },
      setup: (props, ctx) => () =>
        h(
          'button',
          { ...ctx.attrs, disabled: props.disabled },
          ctx.slots.default?.(),
        ),
    }),
  };
});

function fixture(): Contract {
  return {
    id: 'contract-a',
    code: 'HT-A',
    name: '客户订单',
    customerId: 'customer',
    customerName: '客户',
    companyId: 1,
    departmentId: 2,
    ownerUserId: 3,
    currency: 'CNY',
    amount: '100',
    status: 'CONFIRMED',
    version: 4,
    businessVersion: 2,
    businessType: 'FOREIGN',
    allowedActions: [
      'ASSIGN_FULFILLMENT',
      'CREATE_QUOTE',
      'SAVE_PLAN',
      'SUBMIT_PLAN',
      'DECIDE_PLAN',
      'GENERATE_ORDERS',
      'RECORD_ARRIVAL',
      'UPDATE_PRODUCTION',
      'CONFIRM_RECEIPT',
    ],
    items: [
      {
        id: 'item',
        skuId: 'sku',
        skuName: '瑜伽垫',
        unit: '件',
        quantity: '100',
        unitPrice: '1',
        specVersion: '1',
        specification: '标准',
      },
    ],
    requests: [
      {
        id: 'request',
        name: '采购申请 A',
        status: 'ACTIVE',
        items: [
          { id: 'request-item', contractItemId: 'item', quantity: '100' },
        ],
      },
    ],
    assignments: [
      {
        id: 'task',
        requestId: 'request',
        requestItemId: 'request-item',
        contractItemId: 'item',
        method: 'BUY',
        quantity: '100',
        status: 'ASSIGNED',
      },
    ],
    quotes: [],
    plans: [],
    purchaseOrders: [],
    arrivals: [],
    productionProgress: [],
    shipments: [],
  };
}
function quoted(): Contract {
  const contract = fixture();
  contract.quotes = [
    {
      id: 'quote',
      assignmentId: 'task',
      supplierId: 'supplier',
      supplierName: '供应商',
      seriesId: 'quote-series',
      version: 1,
      unit: '件',
      currency: 'CNY',
      confirmed: true,
      validUntil: '2099-12-31',
    },
  ];
  return contract;
}
function approved(method = 'BUY'): Contract {
  const contract = quoted();
  contract.assignments![0]!.method = method;
  contract.plans = [
    {
      id: 'plan',
      requestId: 'request',
      name: '批准方案',
      status: 'APPROVED',
      version: 1,
      lines: [
        {
          id: 'plan-line',
          assignmentId: 'task',
          contractItemId: 'item',
          method,
          quantity: '100',
        },
      ],
      approvals: [
        {
          id: 'approval',
          approved: true,
          invalidated: false,
          planVersion: 1,
          scopes: [{ planLineId: 'plan-line', quantity: '100' }],
        },
      ],
    },
  ];
  return contract;
}
const keys = (contract: Contract) =>
  contractWorkboard(contract).map((group) => group.key);

describe('合同工作台只推荐有依据的下一步', () => {
  it('requires matching permissions and never recommends actions on closed, cancelled or blocked orders', () => {
    const contract = fixture();
    expect(keys(contract)).toContain('quote');
    for (const status of ['CLOSED', 'CANCELLED'])
      expect(contractWorkboard({ ...contract, status })).toEqual([]);
    expect(contractWorkboard({ ...contract, allowedActions: [] })).toEqual([]);
    expect(
      contractWorkboard({ ...contract, blockReasons: ['缺少报价口径'] }),
    ).toEqual([]);
    expect(contractWorkboard({ ...contract, status: 'DRAFT' })).toEqual([]);
  });

  it('moves quoted tasks to planning and preserves the authoritative source ID', () => {
    const contract = quoted();
    expect(keys(contract)).not.toContain('quote');
    expect(
      contractWorkboard(contract).find((group) => group.key === 'quote-plan')
        ?.records[0]?.launch,
    ).toEqual({
      kind: 'plans',
      action: 'SAVE_PLAN',
      source: { kind: 'quotes', id: 'quote' },
    });
    contract.assignments![0]!.status = 'CANCELLED';
    expect(keys(contract)).not.toContain('quote-plan');
  });

  it('keeps planning available for a partially occupied task and a returned plan', () => {
    const contract = quoted();
    contract.plans = [
      {
        id: 'partial-plan',
        status: 'DRAFT',
        lines: [{ id: 'partial-line', assignmentId: 'task', quantity: '30' }],
      },
    ];
    expect(keys(contract)).toContain('quote-plan');
    contract.plans[0]!.lines = [
      { id: 'full-line', assignmentId: 'task', quantity: '100' },
    ];
    expect(keys(contract)).not.toContain('quote-plan');
    contract.plans[0]!.status = 'RETURNED';
    expect(keys(contract)).toContain('quote-plan');
  });

  it('does not confuse different suppliers with an absent quote series', () => {
    const contract = quoted();
    contract.quotes = [
      {
        id: 'supplier-a-quote',
        assignmentId: 'task',
        supplierId: 'a',
        version: 1,
        confirmed: true,
        validUntil: '2099-12-31',
      },
      {
        id: 'supplier-b-quote',
        assignmentId: 'task',
        supplierId: 'b',
        version: 4,
        confirmed: true,
        validUntil: '2099-12-31',
      },
    ];
    expect(
      contractWorkboard(contract)
        .find((group) => group.key === 'quote-plan')
        ?.records.map((record) => record.id),
    ).toEqual(['supplier-a-quote', 'supplier-b-quote']);
    contract.quotes.push({
      id: 'new-b',
      assignmentId: 'task',
      supplierId: 'b',
      seriesId: 'b-series',
      version: 5,
      confirmed: true,
      validUntil: '2099-12-31',
    });
    contract.quotes[1]!.seriesId = 'b-series';
    expect(
      contractWorkboard(contract)
        .find((group) => group.key === 'quote-plan')
        ?.records.map((record) => record.id),
    ).toEqual(['supplier-a-quote', 'new-b']);
  });

  it('opens legacy submitted plans for activation without an approval step', () => {
    const contract = approved();
    contract.plans![0]!.status = 'SUBMITTED';
    const launch = contractWorkboard(contract).find(
      (group) => group.key === 'draft-plan',
    )?.records[0]?.launch;
    expect(launch).toEqual({ kind: 'plans', recordId: 'plan' });
    expect(launch).not.toHaveProperty('action');
  });

  it.each([
    { validUntil: '2000-01-01' },
    { validUntil: undefined },
    { validUntil: '2099/12/31' },
    { confirmed: false },
    { confirmed: undefined },
  ])(
    'opens unavailable quote details instead of starting a plan or a revision: %j',
    (change) => {
      const contract = quoted();
      Object.assign(contract.quotes![0]!, change);
      expect(keys(contract)).not.toContain('quote-plan');
      const group = contractWorkboard(contract).find(
        (item) => item.key === 'quote-review',
      );
      expect(group?.records.map((record) => record.launch)).toEqual([
        { kind: 'quotes', recordId: 'quote' },
      ]);
      expect(group?.records[0]?.launch).not.toHaveProperty('action');
      expect(group?.records[0]?.launch).not.toHaveProperty('source');
      contract.allowedActions = ['SAVE_PLAN'];
      expect(keys(contract)).not.toContain('quote-review');
    },
  );

  it('removes fully executed orders and excludes generation when execution records were not read', () => {
    const contract = approved();
    expect(keys(contract)).toContain('order');
    contract.purchaseOrders = undefined;
    expect(keys(contract)).not.toContain('order');
    contract.purchaseOrders = [
      {
        id: 'order',
        status: 'ORDERED',
        lines: [
          {
            id: 'order-line',
            planLineId: 'plan-line',
            assignmentId: 'task',
            quantity: '100',
            arrivedQuantity: '100',
            returnedQuantity: '0',
            cancelledQuantity: '0',
          },
        ],
      },
    ];
    expect(keys(contract)).not.toContain('order');
    expect(keys(contract)).not.toContain('arrival');
    contract.purchaseOrders[0]!.lines = [
      {
        id: 'order-line',
        planLineId: 'plan-line',
        assignmentId: 'task',
        quantity: '100',
        arrivedQuantity: '100',
        returnedQuantity: '5',
        cancelledQuantity: '0',
      },
    ];
    expect(keys(contract)).toContain('arrival');
  });

  it('does not treat unavailable assignment, quote or order collections as an empty completed stage', () => {
    const contract = quoted();
    contract.assignments = undefined;
    expect(keys(contract)).not.toContain('dispatch');
    contract.assignments = fixture().assignments;
    contract.quotes = undefined;
    expect(keys(contract)).not.toContain('quote');
    contract.quotes = quoted().quotes;
    contract.purchaseOrders = undefined;
    expect(keys(contract)).not.toContain('quote-plan');
  });

  it('does not recommend updating an already completed production record while its assignment stays assigned', () => {
    const contract = approved('MAKE');
    expect(keys(contract)).toContain('production');
    contract.productionProgress = [
      {
        id: 'progress',
        assignmentId: 'task',
        status: 'COMPLETED',
        completedQuantity: '100',
      },
    ];
    expect(keys(contract)).not.toContain('production');
  });

  it('only exposes pending payment confirmation and resolves details using the correct contract and record IDs', () => {
    const contract = fixture();
    contract.finance = {
      receipts: [
        { id: 'pending', kind: 'PAYMENT', status: 'PENDING', amount: '100' },
        { id: 'confirmed', kind: 'PAYMENT', status: 'CONFIRMED', amount: '10' },
        { id: 'refund', kind: 'REFUND', status: 'PENDING', amount: '1' },
      ],
    };
    expect(
      contractWorkboard(contract)
        .find((group) => group.key === 'receipt')
        ?.records.map((record) => record.launch),
    ).toEqual([{ kind: 'receipts', recordId: 'pending' }]);
    expect(workboardDocumentRow(contract, 'receipts', 'pending')).toMatchObject(
      {
        id: 'pending',
        contractId: 'contract-a',
        contractVersion: 4,
        record: { id: 'pending' },
      },
    );
    expect(() => workboardDocumentRow(contract, 'receipts', 'missing')).toThrow(
      '当前单据已变化或不属于此类型，请刷新列表后重新打开',
    );
  });
});

const cleanups: (() => void)[] = [];
function mount(contract: Contract, options = {}) {
  const launch = vi.fn();
  const props = reactive({
    contract,
    disabled: false,
    loading: false,
    ...options,
  });
  const host = document.createElement('div');
  document.body.append(host);
  const app = createApp({
    render: () => h(ContractWorkboard, { ...props, onLaunch: launch }),
  });
  app.mount(host);
  cleanups.push(() => {
    app.unmount();
    host.remove();
  });
  return { props, host, launch };
}
function click(host: HTMLElement, text: string) {
  const button = [...host.querySelectorAll('button')].find(
    (button) => button.textContent === text,
  );
  expect(button).toBeTruthy();
  button!.click();
}
afterEach(() => cleanups.splice(0).forEach((cleanup) => cleanup()));

describe('合同工作台原处选择及金额展示', () => {
  it('launches a single matched document immediately without navigating away', () => {
    const view = mount(fixture());
    click(view.host, '新增报价');
    expect(view.launch).toHaveBeenCalledWith({
      kind: 'quotes',
      action: 'CREATE_QUOTE',
      source: { kind: 'tasks', id: 'task' },
    });
  });

  it('expands multiple matched records in place, passes the chosen source and resets on contract switching', async () => {
    const contract = fixture();
    contract.assignments![0]!.quantity = '50';
    contract.assignments!.push({
      ...contract.assignments![0]!,
      id: 'other-task',
    });
    const view = mount(contract);
    click(view.host, '选择单据办理');
    await nextTick();
    expect(view.launch).not.toHaveBeenCalled();
    expect(view.host.querySelectorAll('.workboard-records li')).toHaveLength(2);
    view.host
      .querySelectorAll<HTMLButtonElement>('.workboard-records button')[1]!
      .click();
    expect(view.launch).toHaveBeenLastCalledWith({
      kind: 'quotes',
      action: 'CREATE_QUOTE',
      source: { kind: 'tasks', id: 'other-task' },
    });
    view.props.contract = { ...contract, id: 'contract-b' };
    await nextTick();
    expect(view.host.querySelector('.workboard-records')).toBeNull();
  });

  it('does not launch while a child operation disables the workboard or while refreshing', async () => {
    const view = mount(fixture(), { disabled: true });
    click(view.host, '新增报价');
    expect(view.launch).not.toHaveBeenCalled();
    view.props.disabled = false;
    view.props.loading = true;
    await nextTick();
    expect(view.host.textContent).toContain('正在刷新办理事项');
    expect(view.host.querySelectorAll('button')).toHaveLength(0);
    expect(view.launch).not.toHaveBeenCalled();
  });

  it('takes received money from the confirmed ledger rather than pending records and never displays unread amounts as zero', async () => {
    const contract = fixture();
    contract.finance = {
      receipts: [
        { id: 'pending', status: 'PENDING', kind: 'PAYMENT', amount: '100' },
      ],
    };
    contract.financeSummary = {
      confirmedReceipts: '0',
      unpaidAmount: '100',
      pendingReceipts: '100',
    };
    const view = mount(contract);
    const received = () =>
      [...view.host.querySelectorAll('.workboard-metric')].find((metric) =>
        metric.textContent?.includes('已回款'),
      )!;
    expect(received().textContent).toContain('0.00');
    expect(received().textContent).not.toContain('100');
    expect(view.host.textContent).toContain('确认前不计入已回款');
    view.props.contract = {
      ...contract,
      financeSummary: undefined,
      shipments: undefined,
      allowedActions: [],
    };
    await nextTick();
    expect(received().textContent).toContain('未读取或当前不可见');
    expect(view.host.textContent).toContain('当前已读取的资料中没有');
    expect(view.host.textContent).not.toContain('全部完成');
    expect(view.host.textContent).toContain('待核对');
  });
});
