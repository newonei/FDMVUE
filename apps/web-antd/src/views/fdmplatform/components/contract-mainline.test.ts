import type { WorkboardGroup } from './contract-workboard';

import type { Contract } from '#/api/fdmplatform';

import { describe, expect, it } from 'vitest';

import { contractMainline, contractNextStep } from './contract-mainline';

function contract(overrides: Partial<Contract> = {}): Contract {
  return {
    id: 'contract-1',
    code: 'HT-1',
    name: '瑜伽垫订单',
    companyId: 1,
    departmentId: 1,
    ownerUserId: 7,
    customerId: 'customer',
    customerName: '客户',
    businessType: 'FOREIGN_B2B',
    currency: 'USD',
    amount: '1000',
    status: 'EXECUTING',
    version: 3,
    businessVersion: 1,
    items: [
      {
        id: 'item-1',
        skuId: 'sku-1',
        skuName: '瑜伽垫',
        specVersion: 'v1',
        specification: '6mm',
        unit: '张',
        quantity: '100',
        unitPrice: '10',
      },
    ],
    requests: [
      {
        id: 'request-1',
        status: 'ACTIVE',
        items: [{ id: 'line-1', contractItemId: 'item-1', quantity: '100' }],
      },
    ],
    assignments: [],
    purchaseOrders: [],
    shipments: [],
    financeSummary: {
      confirmedReceipts: '0',
      pendingReceipts: '0',
      unpaidAmount: '1000',
      effectiveInvoices: '0',
      boundAmount: '0',
    },
    allowedActions: [
      'CREATE_REQUEST',
      'CREATE_RECEIPT',
      'CREATE_INVOICE',
      'STOCK_SHIP',
      'CONFIRM_CONTRACT',
      'UPDATE_CONTRACT',
      'COMPLETE_IMPORTED_CONTRACT',
    ],
    ...overrides,
  };
}
const stage = (value: Contract, key: string) =>
  contractMainline(value).find((item) => item.key === key)!;
const next = (value: Contract, groups: WorkboardGroup[] = []) =>
  contractNextStep(value, contractMainline(value), groups);

describe('contract main line', () => {
  it('measures ordered, arrived and produced quantities per product, excluding cancelled and returned amounts', () => {
    const value = contract({
      purchaseOrders: [
        {
          id: 'po-1',
          status: 'PARTIALLY_RECEIVED',
          lines: [
            {
              id: 'po-line',
              contractItemId: 'item-1',
              quantity: '60',
              cancelledQuantity: '10',
              arrivedQuantity: '30',
              returnedQuantity: '5',
            },
          ],
        },
        {
          id: 'po-cancelled',
          status: 'CANCELLED',
          lines: [{ id: 'x', contractItemId: 'item-1', quantity: '100' }],
        },
      ],
      assignments: [
        {
          id: 'make',
          method: 'MAKE',
          status: 'ASSIGNED',
          contractItemId: 'item-1',
          quantity: '20',
        },
      ],
      productionProgress: [
        { assignmentId: 'make', completedQuantity: '4' },
        { assignmentId: 'make', completedQuantity: '10' },
      ],
    });
    expect(stage(value, 'purchase')).toMatchObject({
      state: 'active',
      percent: 70,
      summary: '0 / 1 项完成',
    });
    expect(stage(value, 'arrival')).toMatchObject({
      state: 'active',
      percent: 35,
    });
    expect(stage(value, 'arrival').details[0]).toBe('瑜伽垫：35 / 100 张');
  });

  it('marks a stage in progress once its upstream work has started', () => {
    expect(stage(contract(), 'purchase')).toMatchObject({
      state: 'active',
      percent: 0,
    });
    expect(stage(contract({ requests: [] }), 'purchase').state).toBe('waiting');
    const pending = contract({
      financeSummary: {
        confirmedReceipts: '0',
        pendingReceipts: '10',
        unpaidAmount: '1000',
      },
    });
    expect(stage(pending, 'receipt')).toMatchObject({
      state: 'active',
      percent: 0,
    });
    expect(stage(contract(), 'receipt').state).toBe('waiting');
  });

  it('keeps invalid quantities and unread finance as 待核对 instead of zero', () => {
    const value = contract({
      items: [{ ...contract().items[0]!, quantity: '' }],
      financeSummary: undefined,
    });
    expect(stage(value, 'purchase')).toMatchObject({
      state: 'unknown',
      summary: '数量待核对',
    });
    expect(stage(value, 'purchase').percent).toBeUndefined();
    expect(stage(value, 'receipt')).toMatchObject({
      state: 'unknown',
      summary: '未读取',
    });
    expect(
      stage(
        contract({
          financeSummary: {
            confirmedReceipts: '1',
            unpaidAmount: '1',
            complete: false,
          },
        }),
        'receipt',
      ).summary,
    ).toBe('金额待核对');
  });

  it('counts only confirmed receipts as received and measures invoices against the receivable', () => {
    const value = contract({
      financeSummary: {
        confirmedReceipts: '250',
        pendingReceipts: '500',
        unpaidAmount: '750',
        effectiveInvoices: '1000',
        boundAmount: '250',
      },
    });
    expect(stage(value, 'receipt')).toMatchObject({
      state: 'active',
      percent: 25,
      summary: 'USD 250.00',
    });
    expect(stage(value, 'receipt').details).toContain('待确认：USD 500.00');
    expect(stage(value, 'invoice')).toMatchObject({
      state: 'done',
      percent: 100,
    });
  });

  it('suggests activation for a priced draft and price completion otherwise', () => {
    expect(next(contract({ status: 'DRAFT' }))).toMatchObject({
      button: '合同生效',
      action: { type: 'activate' },
    });
    expect(stage(contract({ status: 'DRAFT' }), 'contract').state).toBe(
      'active',
    );
    const unpriced = contract({
      status: 'DRAFT',
      items: [{ ...contract().items[0]!, unitPrice: null }],
    });
    expect(next(unpriced)).toMatchObject({
      button: '编辑合同与产品',
      action: { type: 'edit' },
    });
  });

  it('puts the first pending workboard item ahead of stage suggestions', () => {
    const launch = {
      kind: 'requests' as const,
      action: 'ASSIGN_FULFILLMENT',
      recordId: 'request-1',
    };
    const groups: WorkboardGroup[] = [
      {
        key: 'dispatch',
        title: '采购申请待分派',
        description: '',
        button: '分派任务',
        kind: 'requests',
        records: [
          { id: 'request-1', title: 'HT-1', launch },
          { id: 'request-2', title: 'HT-2', launch },
        ],
      },
      {
        key: 'receipt',
        title: '回款待确认到账',
        description: '',
        button: '核对回款',
        kind: 'receipts',
        records: [
          { id: 'r', title: 'r', launch: { kind: 'receipts', recordId: 'r' } },
        ],
      },
    ];
    expect(next(contract(), groups)).toMatchObject({
      title: '采购申请待分派',
      department: '采购部门',
      button: '分派任务',
      action: { type: 'launch', launch },
    });
    expect(next(contract(), groups).description).toContain('另有 2 项');
  });

  it('walks the main line: request, shipping, receipt, invoice, then completion', () => {
    const unrequested = contract({ requests: [] });
    expect(next(unrequested)).toMatchObject({
      button: '新建采购申请',
      action: { type: 'quick', kind: 'requests', action: 'CREATE_REQUEST' },
    });
    expect(next(contract()).title).toBe('等待采购部门安排');
    const stocked = contract({
      assignments: [
        {
          id: 'stock',
          method: 'STOCK',
          status: 'ASSIGNED',
          contractItemId: 'item-1',
          quantity: '100',
        },
      ],
    });
    expect(next(stocked)).toMatchObject({
      button: '办理发货',
      action: { type: 'documents', kind: 'shipments' },
    });
    const shipped = {
      ...stocked,
      items: [{ ...stocked.items[0]!, openingShippedQuantity: '100' }],
    };
    expect(next(shipped)).toMatchObject({
      action: { type: 'quick', kind: 'receipts', action: 'CREATE_RECEIPT' },
    });
    const paid = {
      ...shipped,
      financeSummary: {
        confirmedReceipts: '1000',
        unpaidAmount: '0',
        effectiveInvoices: '0',
      },
    };
    expect(next(paid)).toMatchObject({
      action: { type: 'quick', kind: 'invoices', action: 'CREATE_INVOICE' },
    });
    expect(
      next({
        ...paid,
        financeSummary: { ...paid.financeSummary, effectiveInvoices: '1000' },
      }).title,
    ).toBe('各环节已完成');
  });

  it('routes blocked, terminal and unauthorized contracts without offering actions they cannot run', () => {
    expect(
      next(contract({ blockReasons: ['请指定合同负责人'] })),
    ).toMatchObject({
      button: '补齐办理资料',
      action: { type: 'complete' },
    });
    expect(next(contract({ status: 'CLOSED' })).action).toBeUndefined();
    expect(stage(contract({ status: 'CANCELLED' }), 'contract').state).toBe(
      'closed',
    );
    const withoutRequest = contract({ requests: [], allowedActions: [] });
    expect(next(withoutRequest).action).toBeUndefined();
    expect(next(withoutRequest).description).toContain('不支持此操作');
  });
});
