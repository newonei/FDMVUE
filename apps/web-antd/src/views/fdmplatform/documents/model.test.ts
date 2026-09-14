import type { ActionDefinition, Field } from '../data';
import type { DocumentKind } from './model';

import type { BusinessRecord, Contract } from '#/api/fdmplatform';

import { describe, expect, it } from 'vitest';

import {
  actionTitle,
  allocationKind,
  availableOptions,
  currentDocument,
  documentActionDefinition,
  documentDefinitions,
  documentRecords,
  queryContractId,
  receiptKind,
  shipmentKind,
} from './model';

function contractFixture(): Contract {
  return {
    id: 'contract-a',
    code: 'HT-20260907-000001',
    name: '测试合同',
    companyId: 2,
    departmentId: 3,
    ownerUserId: 10,
    customerId: 'customer-a',
    customerName: '客户甲',
    businessType: 'FOREIGN',
    currency: 'USD',
    status: 'CONFIRMED',
    version: 42,
    businessVersion: 4,
    allowedActions: [],
    items: ['a', 'b'].map((suffix) => ({
      id: `item-${suffix}`,
      skuId: `product-${suffix}`,
      skuName: `产品 ${suffix}`,
      specification: '标准规格',
      specVersion: 'spec-1',
      unit: '件',
      quantity: 10,
      unitPrice: '5.25',
    })),
    requests: [
      {
        id: 'request-a',
        name: '申请甲',
        status: 'ACTIVE',
        items: [
          { id: 'request-item-a', contractItemId: 'item-a', quantity: 10 },
        ],
      },
      {
        id: 'request-b',
        name: '申请乙',
        status: 'ACTIVE',
        items: [
          { id: 'request-item-b', contractItemId: 'item-b', quantity: 10 },
        ],
      },
      {
        id: 'request-cancelled',
        name: '已取消申请',
        status: 'CANCELLED',
        items: [],
      },
    ],
    assignments: [
      {
        id: 'buy-a',
        requestId: 'request-a',
        contractItemId: 'item-a',
        method: 'BUY',
        quantity: 6,
      },
      {
        id: 'make-a',
        requestId: 'request-a',
        contractItemId: 'item-a',
        method: 'MAKE',
        quantity: 4,
      },
      {
        id: 'buy-b',
        requestId: 'request-b',
        contractItemId: 'item-b',
        method: 'BUY',
        quantity: 8,
      },
      {
        id: 'stock-b',
        requestId: 'request-b',
        contractItemId: 'item-b',
        method: 'STOCK',
        quantity: 2,
      },
    ],
    quotes: [
      {
        id: 'quote-a',
        assignmentId: 'buy-a',
        supplierId: 'supplier-a',
        supplierName: '供应商甲',
        version: 4,
        previousQuoteId: 'quote-a-old',
        currency: 'USD',
        unitPrice: '2.50',
        unit: '件',
        evidenceIds: ['proof-a'],
      },
      {
        id: 'quote-b',
        assignmentId: 'buy-b',
        supplierId: 'supplier-b',
        supplierName: '供应商乙',
        version: 1,
        currency: 'USD',
        unitPrice: '3.00',
        unit: '件',
      },
    ],
    plans: [
      {
        id: 'plan-a',
        name: '方案甲',
        requestId: 'request-a',
        version: 7,
        status: 'APPROVED',
        risks: ['交期紧', '运费待确认'],
        lines: [
          {
            id: 'plan-line-a',
            assignmentId: 'buy-a',
            contractItemId: 'item-a',
            method: 'BUY',
            quantity: 6,
            quoteId: 'quote-a',
          },
        ],
      },
      {
        id: 'plan-b',
        name: '方案乙',
        requestId: 'request-b',
        version: 3,
        status: 'DRAFT',
        lines: [
          {
            id: 'plan-line-b',
            assignmentId: 'buy-b',
            contractItemId: 'item-b',
            method: 'BUY',
            quantity: 8,
            quoteId: 'quote-b',
          },
        ],
      },
    ],
    purchaseOrders: [
      {
        id: 'order-a',
        planId: 'plan-a',
        supplierName: '供应商甲',
        status: 'ORDERED',
        lines: [
          {
            id: 'order-line-a',
            contractItemId: 'item-a',
            quantity: 6,
            arrivedQuantity: 2,
          },
        ],
      },
      {
        id: 'order-b',
        planId: 'plan-b',
        supplierName: '供应商乙',
        status: 'ORDERED',
        lines: [
          {
            id: 'order-line-b',
            contractItemId: 'item-b',
            quantity: 8,
            arrivedQuantity: 0,
          },
        ],
      },
    ],
    productionProgress: [
      {
        id: 'production-a',
        assignmentId: 'make-a',
        contractItemId: 'item-a',
        completedQuantity: 3,
        status: 'IN_PROGRESS',
        remark: '已完成三件',
      },
    ],
    finance: {
      receipts: [
        {
          id: 'payment',
          kind: 'PAYMENT',
          amount: '10.00',
          status: 'CONFIRMED',
        },
        { id: 'pending', kind: 'PAYMENT', amount: 5, status: 'PENDING' },
        {
          id: 'refund',
          kind: 'REFUND',
          amount: -2,
          originalReceiptId: 'payment',
          status: 'CONFIRMED',
        },
        {
          id: 'reversal',
          kind: 'REVERSAL',
          amount: '-1',
          originalReceiptId: 'payment',
          status: 'CONFIRMED',
        },
        {
          id: 'legacy-payment',
          kind: null,
          amount: '4.50',
          status: 'CONFIRMED',
        },
        { id: 'legacy-refund', amount: '-0.50', status: 'CONFIRMED' },
        {
          id: 'legacy-linked-refund',
          kind: '',
          amount: '0.25',
          originalReceiptId: 'payment',
          status: 'CONFIRMED',
        },
        {
          id: 'invalid-payment',
          kind: 'PAYMENT',
          amount: -1,
          status: 'CONFIRMED',
        },
        { id: 'zero', amount: 0 },
      ],
      invoices: [{ id: 'invoice-a', amount: 10, status: 'VALID' }],
      allocations: [
        {
          id: 'allocation-a',
          amount: 5,
          receiptId: 'payment',
          invoiceId: 'invoice-a',
        },
        {
          id: 'unallocation-a',
          amount: -2,
          originalAllocationId: 'allocation-a',
        },
      ],
      costs: [{ id: 'cost-a', amount: 3, stage: 'COLLECTED' }],
    },
    shipments: [
      {
        id: 'outbound',
        kind: 'OUTBOUND',
        eventId: 'ship-event',
        poolId: 'pool-a',
        contractItemId: 'item-a',
        quantity: 3,
      },
      {
        id: 'return',
        kind: 'RETURN',
        originalShipmentId: 'outbound',
        eventId: 'return-event',
        poolId: 'pool-a',
        contractItemId: 'item-a',
        quantity: 1,
      },
      {
        id: 'legacy-outbound',
        kind: null,
        eventId: 'legacy-ship-event',
        poolId: 'pool-b',
        contractItemId: 'item-b',
        quantity: 2,
      },
      {
        id: 'legacy-return',
        kind: '',
        originalShipmentId: 'legacy-outbound',
        eventId: 'legacy-return-event',
        poolId: 'pool-b',
        contractItemId: 'item-b',
        quantity: 1,
      },
    ],
  };
}

function actionField(
  definition: ActionDefinition,
  key: string,
  line = false,
): Field {
  const result = (line ? definition.lineFields : definition.fields)?.find(
    (item) => item.key === key,
  );
  if (!result) throw new Error(`Missing action field: ${key}`);
  return result;
}

function action(
  contract: Contract,
  kind: DocumentKind,
  name: string,
  recordId?: string,
) {
  return documentActionDefinition(
    contract,
    kind,
    name,
    [],
    [],
    recordId ? currentDocument(contract, kind, recordId) : undefined,
  );
}

function optionIds(
  item: Field,
  values: Record<string, unknown> = {},
  header: Record<string, unknown> = {},
) {
  return availableOptions(item, values, header).map((option) => option.value);
}

describe('typed document records and current identity', () => {
  it('separates positive payments from refunds and reversals, including legacy records', () => {
    const contract = contractFixture();
    const original = structuredClone(contract.finance);
    expect(
      documentRecords(contract, 'receipts').map((record) => record.id),
    ).toEqual(['payment', 'pending', 'legacy-payment']);
    expect(
      documentRecords(contract, 'refunds').map((record) => record.id),
    ).toEqual(['refund', 'reversal', 'legacy-refund', 'legacy-linked-refund']);
    expect(receiptKind({ id: 'legacy', amount: '-0.01' })).toBe('REFUND');
    expect(receiptKind({ id: 'zero', amount: 0 })).toBe('');
    expect(receiptKind({ id: 'reverse', kind: 'REVERSAL', amount: -1 })).toBe(
      'REVERSAL',
    );
    expect(contract.finance).toEqual(original);
  });

  it('classifies historical shipments by their original shipment relation without mutating them', () => {
    const contract = contractFixture();
    const original = structuredClone(contract.shipments);
    expect(
      documentRecords(contract, 'shipments').map((record) => record.id),
    ).toEqual(['outbound', 'legacy-outbound']);
    expect(
      documentRecords(contract, 'salesReturns').map((record) => record.id),
    ).toEqual(['return', 'legacy-return']);
    expect(shipmentKind({ id: 'old' })).toBe('OUTBOUND');
    expect(shipmentKind({ id: 'old-return', originalShipmentId: 'old' })).toBe(
      'RETURN',
    );
    expect(contract.shipments).toEqual(original);
  });

  it('resolves the latest detail record and rejects a record from another type or contract', () => {
    const contract = contractFixture();
    const staleRow = { id: 'plan-a', version: 2 };
    expect(currentDocument(contract, 'plans', staleRow.id)).toBe(
      contract.plans?.[0],
    );
    expect(currentDocument(contract, 'plans', staleRow.id).version).toBe(7);
    expect(() => currentDocument(contract, 'receipts', 'refund')).toThrow(
      '不属于此类型',
    );
    expect(() => currentDocument(contract, 'shipments', 'return')).toThrow(
      '不属于此类型',
    );
    expect(() => currentDocument(contract, 'plans', 'foreign-plan')).toThrow(
      '请刷新列表',
    );
    expect(
      documentRecords(
        { ...contract, finance: undefined, shipments: undefined },
        'receipts',
      ),
    ).toEqual([]);
  });

  it('keeps allocation reversals in their own ledger while labeling their relation', () => {
    const allocations = documentRecords(contractFixture(), 'allocations');
    expect(allocations.map((record) => record.id)).toEqual([
      'allocation-a',
      'unallocation-a',
    ]);
    expect(allocationKind(allocations[0]!)).toBe('回款核销');
    expect(allocationKind(allocations[1]!)).toBe('解除核销');
  });

  it('accepts only one nonblank string contract query, preserving exact identifiers', () => {
    expect(queryContractId('  9223372036854775807  ')).toBe(
      '9223372036854775807',
    );
    for (const value of [
      undefined,
      null,
      '',
      ' \t ',
      123,
      ['contract-a'],
      { id: 'contract-a' },
    ]) {
      expect(queryContractId(value)).toBeUndefined();
    }
  });
});

describe('record-specific business actions', () => {
  it('gives every document action an explicit Chinese name rather than its internal code', () => {
    const actions = new Set(
      Object.values(documentDefinitions).flatMap((definition) => [
        ...definition.create,
        ...definition.actions,
      ]),
    );
    for (const name of actions) {
      const title = actionTitle(name);
      expect(title).not.toBe('办理单据');
      expect(title).not.toContain(name);
      expect(title).toMatch(/[\u3400-\u9FFF]/);
    }
  });

  it.each([
    ['requests', 'CANCEL_REQUEST', 'request-a', 'requestId'],
    ['tasks', 'TRANSFER_ASSIGNMENT', 'buy-a', 'assignmentId'],
    ['orders', 'CANCEL_ORDER', 'order-a', 'orderId'],
    ['receipts', 'CONFIRM_RECEIPT', 'pending', 'receiptId'],
    ['refunds', 'REFRESH_RECEIPT_FX', 'refund', 'receiptId'],
    ['invoices', 'VOID_INVOICE', 'invoice-a', 'invoiceId'],
    ['allocations', 'UNBIND_ALLOCATION', 'allocation-a', 'allocationId'],
    ['costs', 'REVERSE_COST', 'cost-a', 'costId'],
  ] as const)(
    'locks the selected %s record for %s',
    (kind, name, recordId, key) => {
      const contract = contractFixture();
      if (name === 'VOID_INVOICE') contract.finance!.allocations = [];
      if (name === 'CANCEL_REQUEST') {
        // This case verifies the selected request ID; cancellation requires an
        // unexecuted request. Executed-request rejection has separate coverage.
        contract.purchaseOrders = [];
        contract.productionProgress = [];
        contract.plans = [];
      }
      const definition = action(contract, kind, name, recordId);
      expect(definition.initialValues?.[key]).toBe(recordId);
      expect(actionField(definition, key).disabled).toBe(true);
    },
  );

  it.each(['SUBMIT_PLAN', 'DECIDE_PLAN', 'REQUEST_AI_REVIEW'])(
    'binds %s to the current plan version without replacing contract version',
    (name) => {
      const contract = contractFixture();
      const definition = action(contract, 'plans', name, 'plan-a');
      expect(definition.initialValues).toMatchObject({
        planId: 'plan-a',
        planVersion: 7,
      });
      expect(actionField(definition, 'planId').disabled).toBe(true);
      expect(actionField(definition, 'planVersion')).toMatchObject({
        hidden: true,
        disabled: true,
      });
      expect(contract.version).toBe(42);
    },
  );

  it('revises the selected plan with its source request and detached lines', () => {
    const contract = contractFixture();
    const record = currentDocument(contract, 'plans', 'plan-a');
    const definition = action(contract, 'plans', 'SAVE_PLAN', record.id);
    expect(definition.initialValues).toMatchObject({
      id: 'plan-a',
      requestId: 'request-a',
      planVersion: 7,
      riskNotes: '交期紧\n运费待确认',
    });
    expect(actionField(definition, 'id').disabled).toBe(true);
    expect(actionField(definition, 'requestId').disabled).toBe(true);
    const edited = definition.initialValues?.lines as BusinessRecord[];
    expect(edited).toEqual(record.lines);
    edited[0]!.quantity = 1;
    expect((record.lines as BusinessRecord[])[0]?.quantity).toBe(6);
    const fresh = action(contract, 'plans', 'SAVE_PLAN');
    expect(actionField(fresh, 'id').hidden).toBe(true);
    expect(fresh.initialValues).not.toHaveProperty('id');
  });

  it('revises the current quote rather than reusing its older predecessor', () => {
    const contract = contractFixture();
    const definition = action(contract, 'quotes', 'CREATE_QUOTE', 'quote-a');
    expect(definition.initialValues).toMatchObject({
      previousQuoteId: 'quote-a',
      assignmentId: 'buy-a',
      unitPrice: '2.50',
      evidenceIds: ['proof-a'],
    });
    expect(actionField(definition, 'previousQuoteId').disabled).toBe(true);
    expect(actionField(definition, 'assignmentId').disabled).toBe(true);
    expect(currentDocument(contract, 'quotes', 'quote-a').previousQuoteId).toBe(
      'quote-a-old',
    );
  });

  it('keeps production follow-up on the original MAKE task and its cumulative progress', () => {
    const contract = contractFixture();
    const definition = action(
      contract,
      'production',
      'UPDATE_PRODUCTION',
      'production-a',
    );
    expect(definition.initialValues).toMatchObject({
      assignmentId: 'make-a',
      completedQuantity: 3,
      status: 'IN_PROGRESS',
      remark: '已完成三件',
    });
    expect(actionField(definition, 'assignmentId').disabled).toBe(true);
    const receive = action(
      contract,
      'production',
      'STOCK_RECEIVE',
      'production-a',
    );
    expect(receive.initialValues).toMatchObject({
      assignmentId: 'make-a',
      contractItemId: 'item-a',
    });
    expect(actionField(receive, 'contractItemId').disabled).toBe(true);
  });

  it('rejects actions from a different document type', () => {
    expect(() => action(contractFixture(), 'receipts', 'CANCEL_ORDER')).toThrow(
      '此操作不属于当前单据类型',
    );
    expect(() => action(contractFixture(), 'orders', 'UNKNOWN')).toThrow(
      '此操作不属于当前单据类型',
    );
  });
});

describe('parent document choices and automatic technical fields', () => {
  it('filters application items, plan tasks and quotes by their selected parent', () => {
    const contract = contractFixture();
    const assign = action(contract, 'tasks', 'ASSIGN_FULFILLMENT');
    expect(optionIds(actionField(assign, 'requestId'))).toEqual([
      'request-a',
      'request-b',
    ]);
    expect(
      optionIds(actionField(assign, 'requestItemId'), {
        requestId: 'request-a',
      }),
    ).toEqual(['request-item-a']);
    expect(optionIds(actionField(assign, 'requestItemId'), {})).toEqual([]);
    const plan = action(contract, 'plans', 'SAVE_PLAN', 'plan-a');
    expect(
      optionIds(
        actionField(plan, 'assignmentId', true),
        {},
        plan.initialValues,
      ),
    ).toEqual(['buy-a', 'make-a']);
    expect(
      optionIds(
        actionField(plan, 'quoteId', true),
        { assignmentId: 'buy-a' },
        plan.initialValues,
      ),
    ).toEqual(['quote-a']);
    expect(
      optionIds(
        actionField(plan, 'quoteId', true),
        { assignmentId: 'make-a' },
        plan.initialValues,
      ),
    ).toEqual([]);
  });

  it('limits approval lines and cancellation lines to the current plan and order', () => {
    const contract = contractFixture();
    const approve = action(contract, 'plans', 'DECIDE_PLAN', 'plan-a');
    expect(
      optionIds(
        actionField(approve, 'planLineId', true),
        {},
        approve.initialValues,
      ),
    ).toEqual(['plan-line-a']);
    const cancel = action(contract, 'orders', 'CANCEL_ORDER', 'order-a');
    expect(
      optionIds(actionField(cancel, 'orderLineId'), cancel.initialValues),
    ).toEqual(['order-line-a']);
    const arrive = action(contract, 'arrivals', 'RECORD_ARRIVAL');
    expect(
      optionIds(actionField(arrive, 'orderLineId'), { orderId: 'order-b' }),
    ).toEqual(['order-line-b']);
  });

  it('requires all parent conditions and lets row selections override header defaults', () => {
    const scoped: Field = {
      key: 'lineId',
      label: '明细',
      options: [
        {
          value: 'match',
          label: '匹配',
          when: { requestId: 12, assignmentId: 'buy-b' },
        },
        {
          value: 'other',
          label: '其他',
          when: { requestId: 12, assignmentId: 'buy-a' },
        },
      ],
    };
    expect(
      optionIds(
        scoped,
        { assignmentId: 'buy-b' },
        { requestId: '12', assignmentId: 'buy-a' },
      ),
    ).toEqual(['match']);
    expect(
      optionIds(scoped, { assignmentId: 'buy-b' }, { requestId: '13' }),
    ).toEqual([]);
    expect(optionIds({ key: 'empty', label: '空选项' })).toEqual([]);
  });

  it('keeps hidden source fields available for the dialog to assign a fresh stable operation key', () => {
    for (const [kind, name] of [
      ['receipts', 'CREATE_RECEIPT'],
      ['refunds', 'REVERSE_RECEIPT'],
      ['shipments', 'STOCK_SHIP'],
      ['salesReturns', 'STOCK_RETURN'],
    ] as const) {
      const definition = action(contractFixture(), kind, name);
      expect(actionField(definition, 'sourceKey')).toMatchObject({
        hidden: true,
        required: true,
      });
      expect(definition.initialValues?.sourceKey).toBeUndefined();
    }
  });

  it('automatically carries the selected approved plan version including zero without exposing it as input', () => {
    const contract = contractFixture();
    const generate = action(contract, 'orders', 'GENERATE_ORDERS');
    expect(optionIds(actionField(generate, 'planId'))).toEqual(['plan-a']);
    expect(actionField(generate, 'planId').options?.[0]?.fill).toEqual({
      planVersion: 7,
    });
    expect(actionField(generate, 'planVersion').hidden).toBe(true);
    contract.plans![0]!.version = 0;
    const review = action(contract, 'plans', 'REQUEST_AI_REVIEW', 'plan-a');
    expect(review.initialValues?.planVersion).toBe(0);
    expect(actionField(review, 'planId').options?.[0]?.fill).toEqual({
      planVersion: 0,
    });
  });
});
