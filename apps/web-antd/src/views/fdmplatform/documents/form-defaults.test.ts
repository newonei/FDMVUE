import type { Field } from '../data';

import type { Contract } from '#/api/fdmplatform';

import { describe, expect, it } from 'vitest';

import { fieldVisible, initialFormValues, settleSources } from './formDefaults';
import {
  availableOptions,
  documentActionDefinition,
  documentActionUnavailableReason,
  invoiceAvailable,
  receiptAvailable,
} from './model';
const fields: Field[] = [
  {
    key: 'requestId',
    label: '申请',
    type: 'select',
    options: [
      { value: 'a', label: '甲' },
      { value: 'b', label: '乙' },
    ],
  },
  {
    key: 'requestItemId',
    label: '申请明细',
    type: 'select',
    options: [
      {
        value: 'a1',
        label: '甲项',
        when: { requestId: 'a' },
        fill: { quantity: '0.2' },
      },
      {
        value: 'b1',
        label: '乙项1',
        when: { requestId: 'b' },
        fill: { quantity: '4' },
      },
      {
        value: 'b2',
        label: '乙项2',
        when: { requestId: 'b' },
        fill: { quantity: '5' },
      },
    ],
  },
  { key: 'quantity', label: '数量', type: 'decimal', default: 1 },
];
describe('source defaults respect intentional input', () => {
  it('leaves multiple sources unselected and fills the unique dependent source', () => {
    const state = initialFormValues(fields);
    settleSources(fields, state.values, {}, state.auto);
    expect(state.values.requestId).toBeUndefined();
    expect(state.values.requestItemId).toBeUndefined();
    state.values.requestId = 'a';
    settleSources(fields, state.values, {}, state.auto);
    expect(state.values.requestItemId).toBe('a1');
    expect(state.values.quantity).toBe('0.2');
  });
  it('clears invalid old child and old automatic quantity when parent changes', () => {
    const state = initialFormValues(fields, { requestId: 'a' });
    settleSources(fields, state.values, {}, state.auto);
    state.values.requestId = 'b';
    settleSources(fields, state.values, {}, state.auto);
    expect(state.values.requestItemId).toBeUndefined();
    expect(state.values.quantity).toBeUndefined();
    state.values.requestItemId = 'b2';
    settleSources(fields, state.values, {}, state.auto);
    expect(state.values.quantity).toBe('5');
  });
  it('preserves explicitly loaded quantities and user edits across valid selections', () => {
    const state = initialFormValues(fields, {
      requestId: 'a',
      quantity: '0.1',
    });
    settleSources(fields, state.values, {}, state.auto);
    expect(state.values.quantity).toBe('0.1');
    state.values.quantity = '0.15';
    state.values.requestId = 'b';
    settleSources(fields, state.values, {}, state.auto);
    expect(state.values.quantity).toBe('0.15');
  });
  it('never silently chooses optional revision or new document identity', () => {
    const identity: Field[] = [
      'id',
      'previousQuoteId',
      'originalInvoiceId',
    ].map((key) => ({
      key,
      label: key,
      type: 'select',
      options: [{ value: 'old', label: '旧记录' }],
    }));
    const state = initialFormValues(identity);
    settleSources(identity, state.values, {}, state.auto);
    expect(
      Object.values(state.values).every((value) => value === undefined),
    ).toBe(true);
  });
  it('uses selected parent conditions even when option values repeat', () => {
    const line: Field[] = [
      {
        key: 'invoiceId',
        label: '发票',
        type: 'select',
        options: [
          {
            value: 'same',
            label: '发票',
            when: { receiptId: 'a' },
            fill: { amount: '10' },
          },
          {
            value: 'same',
            label: '发票',
            when: { receiptId: 'b' },
            fill: { amount: '2' },
          },
        ],
      },
    ];
    const state = initialFormValues(line);
    settleSources(line, state.values, { receiptId: 'b' }, state.auto);
    expect(state.values.amount).toBe('2');
  });
  it('fresh dialog state cannot retain IDs or quantities from a cancelled form', () => {
    const old = initialFormValues(fields, { requestId: 'a' });
    settleSources(fields, old.values, {}, old.auto);
    const fresh = initialFormValues(fields);
    settleSources(fields, fresh.values, {}, fresh.auto);
    expect(fresh.values.requestId).toBeUndefined();
    expect(fresh.values.requestItemId).toBeUndefined();
    expect(fresh.values.quantity).toBe(1);
  });
});
const contract = {
  id: 'contract',
  currency: 'USD',
  items: [],
  allowedActions: [],
  finance: {
    receipts: [
      {
        id: 'r',
        kind: 'PAYMENT',
        status: 'CONFIRMED',
        currency: 'USD',
        amount: '0.3',
      },
      { id: 'refund', originalReceiptId: 'r', amount: '-0.1' },
    ],
    invoices: [
      {
        id: 'i',
        type: 'COMMERCIAL',
        status: 'VALID',
        currency: 'USD',
        amount: '0.2',
        invoiceNumber: 'INV',
      },
      {
        id: 'proforma',
        type: 'PROFORMA',
        status: 'VALID',
        currency: 'USD',
        amount: 100,
      },
    ],
    allocations: [
      { id: 'a', receiptId: 'r', invoiceId: 'i', amount: '0.1' },
      { id: 'undo', originalAllocationId: 'a', amount: '-0.05' },
    ],
  },
  purchaseOrders: [
    {
      id: 'o',
      lines: [
        {
          id: 'ol',
          quantity: '0.3',
          arrivedQuantity: '0.1',
          cancelledQuantity: '0.1',
        },
      ],
    },
  ],
} as unknown as Contract;
describe('remaining quantities and monetary balances', () => {
  it('computes exact usable receipt and invoice amounts including reverse records', () => {
    expect(receiptAvailable(contract, contract.finance!.receipts![0]!)).toBe(
      '0.15',
    );
    expect(invoiceAvailable(contract, contract.finance!.invoices![0]!)).toBe(
      '0.15',
    );
  });
  it('offers only eligible invoices and defaults the smaller available balance', () => {
    const definition = documentActionDefinition(
      contract,
      'allocations',
      'BIND_ALLOCATION',
      [],
      [],
    );
    const state = initialFormValues(
      definition.fields,
      definition.initialValues,
    );
    settleSources(definition.fields, state.values, {}, state.auto);
    expect(state.values).toMatchObject({
      receiptId: 'r',
      invoiceId: 'i',
      amount: '0.15',
    });
    expect(
      availableOptions(
        definition.fields.find((field) => field.key === 'invoiceId')!,
        state.values,
      ).map((option) => option.value),
    ).toEqual(['i']);
  });
  it('defaults exact pending arrival quantity without counting cancelled quantities', () => {
    const definition = documentActionDefinition(
      contract,
      'arrivals',
      'RECORD_ARRIVAL',
      [],
      [],
    );
    const option = definition.fields.find(
      (field) => field.key === 'orderLineId',
    )!.options![0]!;
    expect(option.fill).toEqual({ quantity: '0.1', acceptedQuantity: '0.1' });
  });
  it('does not offer an exhausted receipt for refund or allocation', () => {
    const full = {
      ...contract,
      finance: {
        ...contract.finance,
        receipts: [
          {
            id: 'r',
            kind: 'PAYMENT',
            status: 'CONFIRMED',
            currency: 'USD',
            amount: '0.05',
          },
        ],
      },
    };
    const definition = documentActionDefinition(
      full,
      'refunds',
      'REVERSE_RECEIPT',
      [],
      [],
    );
    expect(
      definition.fields.find((field) => field.key === 'receiptId')!.options,
    ).toEqual([]);
  });
});

it('deducts valid credit notes but excludes void credit notes from invoice balance', () => {
  const invoice = {
    id: 'invoice',
    amount: '1000',
    status: 'VALID',
    type: 'COMMERCIAL',
  };
  const ledger = {
    ...contract,
    finance: {
      invoices: [
        invoice,
        {
          id: 'credit',
          originalInvoiceId: 'invoice',
          amount: '-200',
          status: 'VALID',
          type: 'CREDIT_NOTE',
        },
        {
          id: 'void-credit',
          originalInvoiceId: 'invoice',
          amount: '-500',
          status: 'VOID',
          type: 'CREDIT_NOTE',
        },
      ],
      allocations: [{ id: 'allocation', invoiceId: 'invoice', amount: '100' }],
    },
  };
  expect(invoiceAvailable(ledger, invoice)).toBe('700');
});

it('offers returned purchase quantities for replenishment without exceeding the net balance', () => {
  const returned = {
    ...contract,
    purchaseOrders: [
      {
        id: 'o',
        lines: [
          {
            id: 'ol',
            quantity: 10,
            arrivedQuantity: 10,
            returnedQuantity: 2,
            cancelledQuantity: 0,
          },
        ],
      },
    ],
  };
  const definition = documentActionDefinition(
    returned,
    'arrivals',
    'RECORD_ARRIVAL',
    [],
    [],
  );
  expect(
    definition.fields.find((field) => field.key === 'orderLineId')!.options![0]!
      .fill,
  ).toEqual({ quantity: '2', acceptedQuantity: '2' });
});

describe('financial form business constraints', () => {
  it('requires and displays a valid original invoice only for a credit note', () => {
    const definition = documentActionDefinition(
      contract,
      'invoices',
      'CREATE_INVOICE',
      [],
      [],
    );
    const original = definition.fields.find(
      (field) => field.key === 'originalInvoiceId',
    )!;
    expect(original.required).toBe(true);
    expect(fieldVisible(original, { type: 'COMMERCIAL' })).toBe(false);
    expect(fieldVisible(original, { type: 'CREDIT_NOTE' })).toBe(true);
    expect(original.options?.map((option) => option.value)).toEqual(['i']);
    const state = initialFormValues(definition.fields, { type: 'CREDIT_NOTE' });
    settleSources(definition.fields, state.values, {}, state.auto);
    expect(state.values.originalInvoiceId).toBe('i');
    expect(state.values.amount).toBe('0.15');
    state.values.type = 'COMMERCIAL';
    settleSources(definition.fields, state.values, {}, state.auto);
    expect(state.values.originalInvoiceId).toBeUndefined();
  });
  it('disables void actions with precise business reasons and allows an unallocated ordinary invoice', () => {
    const invoice = contract.finance!.invoices![0]!;
    expect(
      documentActionUnavailableReason(contract, 'VOID_INVOICE', invoice),
    ).toContain('先解除');
    expect(
      documentActionUnavailableReason(contract, 'VOID_INVOICE', {
        id: 'credit',
        type: 'CREDIT_NOTE',
      }),
    ).toContain('红字结果');
    const credited = {
      ...contract,
      finance: {
        invoices: [
          invoice,
          {
            id: 'credit',
            originalInvoiceId: 'i',
            status: 'VALID',
            type: 'CREDIT_NOTE',
            amount: '-0.05',
          },
        ],
      },
    };
    expect(
      documentActionUnavailableReason(credited, 'VOID_INVOICE', invoice),
    ).toContain('已有有效红字');
    expect(
      documentActionUnavailableReason(
        { ...contract, finance: { invoices: [invoice] } },
        'VOID_INVOICE',
        invoice,
      ),
    ).toBeUndefined();
  });
  it('prevents reopening a fully reversed allocation action', () => {
    const allocation = { id: 'a', amount: '10' };
    const ledger = {
      ...contract,
      finance: {
        allocations: [
          allocation,
          { id: 'undo', originalAllocationId: 'a', amount: '-10' },
        ],
      },
    };
    expect(
      documentActionUnavailableReason(ledger, 'UNBIND_ALLOCATION', allocation),
    ).toBe('此核销单已全部解除');
    expect(() =>
      documentActionDefinition(
        ledger,
        'allocations',
        'UNBIND_ALLOCATION',
        [],
        [],
        allocation,
      ),
    ).toThrow('此核销单已全部解除');
  });
  it('requires positive cost quantity and excludes the cost category from included charges', () => {
    const definition = documentActionDefinition(
      contract,
      'costs',
      'CREATE_COST',
      [],
      [],
    );
    expect(
      definition.fields.find((field) => field.key === 'quantity')!.min,
    ).toBeGreaterThan(0);
    const field = definition.fields.find(
      (entry) => entry.key === 'includesCategories',
    )!;
    expect(
      availableOptions(field, { category: 'TRANSPORT' }).some(
        (option) => option.value === 'TRANSPORT',
      ),
    ).toBe(false);
    const state = initialFormValues(definition.fields, {
      category: 'TRANSPORT',
      includesCategories: ['TRANSPORT', 'MATERIAL'],
    });
    settleSources(definition.fields, state.values, {}, state.auto);
    expect(state.values.includesCategories).toEqual(['MATERIAL']);
  });
});

it('disables cancellation when a purchase order has no remaining balance while retaining returned quantity', () => {
  const completed = {
    id: 'completed-order',
    lines: [
      {
        id: 'line',
        quantity: 60,
        arrivedQuantity: 60,
        returnedQuantity: 0,
        cancelledQuantity: 0,
      },
    ],
  };
  expect(
    documentActionUnavailableReason(contract, 'CANCEL_ORDER', completed),
  ).toBe('没有可取消采购余额');
  expect(() =>
    documentActionDefinition(
      contract,
      'orders',
      'CANCEL_ORDER',
      [],
      [],
      completed,
    ),
  ).toThrow('没有可取消采购余额');
  const replenishable = {
    ...completed,
    lines: [{ ...completed.lines[0]!, returnedQuantity: 2 }],
  };
  expect(
    documentActionUnavailableReason(contract, 'CANCEL_ORDER', replenishable),
  ).toBeUndefined();
});

it('disables cancelling requests already cancelled, ordered, produced, or actively approved', () => {
  const request = { id: 'request-a', status: 'ACTIVE' };
  expect(
    documentActionUnavailableReason(contract, 'CANCEL_REQUEST', {
      ...request,
      status: 'CANCELLED',
    }),
  ).toBe('采购申请已取消');
  expect(
    documentActionUnavailableReason(
      {
        ...contract,
        purchaseOrders: [{ id: 'order-a', requestId: request.id }],
      },
      'CANCEL_REQUEST',
      request,
    ),
  ).toBe('已下单申请需先处理执行余额，不可直接取消');
  expect(
    documentActionUnavailableReason(
      {
        ...contract,
        assignments: [{ id: 'assignment-a', requestId: request.id }],
        productionProgress: [
          { id: 'progress-a', assignmentId: 'assignment-a' },
        ],
      },
      'CANCEL_REQUEST',
      request,
    ),
  ).toBe('已有生产进度的申请不可直接取消');
  const approved = {
    ...contract,
    plans: [
      {
        id: 'plan-a',
        requestId: request.id,
        approvals: [{ id: 'approval-a', approved: true, invalidated: false }],
      },
    ],
  };
  expect(
    documentActionUnavailableReason(approved, 'CANCEL_REQUEST', request),
  ).toBe('已批准申请需先变更方案并释放预留');
  expect(() =>
    documentActionDefinition(
      approved,
      'requests',
      'CANCEL_REQUEST',
      [],
      [],
      request,
    ),
  ).toThrow('已批准申请需先变更方案并释放预留');
});
it('allows cancelling a request with only invalidated approvals and ignores other request execution', () => {
  const request = { id: 'request-a', status: 'ACTIVE' };
  const unrelated = {
    ...contract,
    purchaseOrders: [{ id: 'order-b', requestId: 'request-b' }],
    assignments: [{ id: 'assignment-b', requestId: 'request-b' }],
    productionProgress: [{ id: 'progress-b', assignmentId: 'assignment-b' }],
    plans: [
      {
        id: 'plan-a',
        requestId: request.id,
        approvals: [
          { id: 'old-approval', approved: true, invalidated: true },
          { id: 'rejection', approved: false, invalidated: false },
        ],
      },
      {
        id: 'plan-b',
        requestId: 'request-b',
        approvals: [{ id: 'approval-b', approved: true }],
      },
    ],
  };
  expect(
    documentActionUnavailableReason(unrelated, 'CANCEL_REQUEST', request),
  ).toBeUndefined();
});
