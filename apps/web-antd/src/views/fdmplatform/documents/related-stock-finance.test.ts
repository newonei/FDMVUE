import type { ActionDefinition } from '../data';
import type { DocumentKind } from './model';

import type { BusinessRecord, Contract } from '#/api/fdmplatform';

import { describe, expect, it } from 'vitest';

import { initialFormValues, settleSources } from './formDefaults';
import { documentActionDefinition } from './model';
import { stockFinanceRelatedDefinition } from './related-stock-finance';

function fixture() {
  const contract = {
    id: 'contract-1',
    currency: 'USD',
    items: [
      { id: 'item-1', skuId: 'sku-1', skuName: '产品一', specVersion: 1 },
      { id: 'item-2', skuId: 'sku-2', skuName: '产品二', specVersion: 1 },
    ],
    assignments: [{ id: 'task-1', contractItemId: 'item-1', method: 'MAKE' }],
    plans: [
      {
        id: 'plan-1',
        name: '已生效方案',
        version: 3,
        status: 'APPROVED',
        lines: [
          { id: 'line-1', contractItemId: 'item-1' },
          { id: 'line-2', contractItemId: 'item-2' },
        ],
      },
      {
        id: 'plan-2',
        name: '其他产品方案',
        version: 1,
        status: 'APPROVED',
        lines: [{ id: 'line-3', contractItemId: 'item-2' }],
      },
      {
        id: 'plan-draft',
        name: '未生效方案',
        version: 1,
        status: 'DRAFT',
        lines: [{ id: 'line-4', contractItemId: 'item-1' }],
      },
    ],
    shipments: [
      {
        id: 'shipment-1',
        eventId: 'ship-event-1',
        poolId: 'pool-1',
        contractItemId: 'item-1',
        kind: 'OUTBOUND',
        quantity: '8',
      },
    ],
    finance: {
      receipts: [
        {
          id: 'receipt-1',
          kind: 'PAYMENT',
          status: 'CONFIRMED',
          amount: '100',
          currency: 'USD',
        },
        {
          id: 'refund-1',
          kind: 'REFUND',
          status: 'CONFIRMED',
          originalReceiptId: 'receipt-1',
          amount: '-20',
          currency: 'USD',
        },
        {
          id: 'receipt-2',
          kind: 'PAYMENT',
          status: 'CONFIRMED',
          amount: '10',
          currency: 'USD',
        },
        {
          id: 'receipt-eur',
          kind: 'PAYMENT',
          status: 'CONFIRMED',
          amount: '100',
          currency: 'EUR',
        },
        {
          id: 'receipt-pending',
          kind: 'PAYMENT',
          status: 'PENDING',
          amount: '100',
          currency: 'USD',
        },
      ],
      invoices: [
        {
          id: 'invoice-1',
          invoiceNumber: 'INV-1',
          type: 'TAX',
          status: 'VALID',
          amount: '100',
          currency: 'USD',
        },
        {
          id: 'credit-1',
          type: 'CREDIT_NOTE',
          status: 'VALID',
          originalInvoiceId: 'invoice-1',
          amount: '-10',
          currency: 'USD',
        },
        {
          id: 'invoice-eur',
          type: 'TAX',
          status: 'VALID',
          amount: '100',
          currency: 'EUR',
        },
        {
          id: 'invoice-void',
          type: 'TAX',
          status: 'VOID',
          amount: '100',
          currency: 'USD',
        },
      ],
      allocations: [
        {
          id: 'allocation-1',
          receiptId: 'receipt-1',
          invoiceId: 'invoice-1',
          amount: '30',
        },
        { id: 'unbind-1', originalAllocationId: 'allocation-1', amount: '-10' },
      ],
    },
  } as unknown as Contract;
  const pools: BusinessRecord[] = [
    {
      id: 'pool-1',
      skuId: 'sku-1',
      specVersion: 1,
      reservations: [
        {
          id: 'reservation-1',
          contractId: 'contract-1',
          contractItemId: 'item-1',
          remainingQuantity: '8',
        },
        {
          id: 'reservation-foreign',
          contractId: 'other-contract',
          contractItemId: 'item-1',
          remainingQuantity: '99',
        },
      ],
    },
    {
      id: 'pool-2',
      skuId: 'sku-2',
      specVersion: 1,
      reservations: [
        {
          id: 'reservation-2',
          contractId: 'contract-1',
          contractItemId: 'item-2',
          remainingQuantity: '99',
        },
      ],
    },
    { id: 'pool-3', skuId: 'sku-1', specVersion: 1, reservations: [] },
  ];
  const production: BusinessRecord = {
    id: 'production-1',
    assignmentId: 'task-1',
    completedQuantity: '10',
  };
  return { contract, pools, production };
}
function related(
  contract: Contract,
  pools: BusinessRecord[],
  kind: DocumentKind,
  sourceKind: DocumentKind,
  record: BusinessRecord,
  action: string,
) {
  return stockFinanceRelatedDefinition(
    documentActionDefinition(contract, kind, action, [], pools),
    contract,
    sourceKind,
    record,
    pools,
  )!;
}
function options(definition: ActionDefinition, key: string) {
  return definition.fields
    .find((field) => field.key === key)!
    .options!.map((option) => option.value);
}
function form(definition: ActionDefinition) {
  const state = initialFormValues(definition.fields, definition.initialValues);
  const settle = () =>
    settleSources(definition.fields, state.values, state.values, state.auto);
  settle();
  return { ...state, settle };
}
describe('source-bound stock and finance creation', () => {
  it('reserves only the current production product against approved matching plan lines', () => {
    const { contract, pools, production } = fixture();
    const snapshot = JSON.stringify({ contract, pools });
    const definition = related(
      contract,
      pools,
      'shipments',
      'production',
      production,
      'STOCK_RESERVE',
    );
    expect(definition.initialValues).toEqual({ contractItemId: 'item-1' });
    expect(
      definition.fields.find((field) => field.key === 'contractItemId')
        ?.disabled,
    ).toBe(true);
    expect(options(definition, 'planId')).toEqual(['plan-1']);
    expect(options(definition, 'planLineId')).toEqual(['line-1']);
    expect(options(definition, 'poolId')).toEqual(['pool-1', 'pool-3']);
    expect(form(definition).values).toMatchObject({
      contractItemId: 'item-1',
      planId: 'plan-1',
      planVersion: 3,
      planLineId: 'line-1',
    });
    expect(JSON.stringify({ contract, pools })).toBe(snapshot);
  });
  it('does not invent an approved plan or inventory when production is complete', () => {
    const { contract, pools, production } = fixture();
    expect(() =>
      related(
        { ...contract, plans: [] },
        pools,
        'shipments',
        'production',
        production,
        'STOCK_RESERVE',
      ),
    ).toThrow('没有已生效的方案明细');
    expect(() =>
      related(
        contract,
        [],
        'shipments',
        'production',
        production,
        'STOCK_RESERVE',
      ),
    ).toThrow('尚无匹配的库存池');
  });
  it('ships only current-product reservations and uses their remaining quantity rather than production quantity', () => {
    const { contract, pools, production } = fixture();
    const definition = related(
      contract,
      pools,
      'shipments',
      'production',
      production,
      'STOCK_SHIP',
    );
    expect(options(definition, 'poolId')).toEqual(['pool-1']);
    expect(options(definition, 'reservationId')).toEqual(['reservation-1']);
    expect(form(definition).values).toMatchObject({
      poolId: 'pool-1',
      reservationId: 'reservation-1',
      quantity: '8',
    });
    expect(() =>
      related(
        contract,
        pools.slice(1),
        'shipments',
        'production',
        production,
        'STOCK_SHIP',
      ),
    ).toThrow('没有可发货的库存预留');
  });
  it('lets the user choose among matching-product pools and updates untouched quantity on changing pools', () => {
    const { contract, pools, production } = fixture();
    pools[2]!.reservations = [
      {
        id: 'reservation-3',
        contractId: contract.id,
        contractItemId: 'item-1',
        remainingQuantity: '4',
      },
    ];
    const definition = related(
      contract,
      pools,
      'shipments',
      'production',
      production,
      'STOCK_SHIP',
    );
    const state = form(definition);
    expect(state.values.poolId).toBeUndefined();
    state.values.poolId = 'pool-1';
    state.settle();
    expect(state.values).toMatchObject({
      reservationId: 'reservation-1',
      quantity: '8',
    });
    state.values.poolId = 'pool-3';
    state.settle();
    expect(state.values).toMatchObject({
      reservationId: 'reservation-3',
      quantity: '4',
    });
    expect(
      definition.fields.find((field) => field.key === 'reservationId')?.hidden,
    ).toBe(false);
  });
  it('locks a sales return to the actual inventory event instead of the shipment document id', () => {
    const { contract, pools } = fixture();
    const definition = related(
      contract,
      pools,
      'salesReturns',
      'shipments',
      contract.shipments![0]!,
      'STOCK_RETURN',
    );
    expect(form(definition).values).toMatchObject({
      poolId: 'pool-1',
      shipmentEventId: 'ship-event-1',
    });
    expect(options(definition, 'shipmentEventId')).toEqual(['ship-event-1']);
    expect(
      definition.fields
        .filter((field) => ['poolId', 'shipmentEventId'].includes(field.key))
        .every((field) => field.disabled),
    ).toBe(true);
  });
  it('locks the source receipt and calculates allocation and refund from its actual remaining balance', () => {
    const { contract, pools } = fixture();
    const receipt = contract.finance!.receipts![0]!;
    const binding = related(
      contract,
      pools,
      'allocations',
      'receipts',
      receipt,
      'BIND_ALLOCATION',
    );
    expect(options(binding, 'receiptId')).toEqual(['receipt-1']);
    expect(options(binding, 'invoiceId')).toEqual(['invoice-1']);
    expect(form(binding).values).toMatchObject({
      receiptId: 'receipt-1',
      invoiceId: 'invoice-1',
      amount: '60',
    });
    const refund = related(
      contract,
      pools,
      'refunds',
      'receipts',
      receipt,
      'REVERSE_RECEIPT',
    );
    expect(form(refund).values).toMatchObject({
      receiptId: 'receipt-1',
      amount: '60',
    });
  });
  it('keeps the selected invoice while waiting for a receipt and fills the smaller available balance', () => {
    const { contract, pools } = fixture();
    const definition = related(
      contract,
      pools,
      'allocations',
      'invoices',
      contract.finance!.invoices![0]!,
      'BIND_ALLOCATION',
    );
    expect(options(definition, 'receiptId')).toEqual([
      'receipt-1',
      'receipt-2',
    ]);
    expect(options(definition, 'invoiceId')).toEqual(['invoice-1']);
    const state = form(definition);
    expect(state.values.invoiceId).toBe('invoice-1');
    expect(state.values.receiptId).toBeUndefined();
    expect(state.values.amount).toBeUndefined();
    state.values.receiptId = 'receipt-1';
    state.settle();
    expect(state.values).toMatchObject({
      invoiceId: 'invoice-1',
      amount: '60',
    });
    state.values.receiptId = 'receipt-2';
    state.settle();
    expect(state.values).toMatchObject({
      invoiceId: 'invoice-1',
      amount: '10',
    });
    state.values.amount = '5';
    state.values.receiptId = 'receipt-1';
    state.settle();
    expect(state.values.amount).toBe('5');
  });
  it('rejects unavailable source balances and excludes unconfirmed or different-currency receipts', () => {
    const { contract, pools } = fixture();
    expect(() =>
      related(
        contract,
        pools,
        'refunds',
        'receipts',
        contract.finance!.receipts![4]!,
        'REVERSE_RECEIPT',
      ),
    ).toThrow('未确认或已无可用余额');
    const invoice = contract.finance!.invoices![0]!;
    invoice.amount = '30';
    expect(() =>
      related(
        contract,
        pools,
        'allocations',
        'invoices',
        invoice,
        'BIND_ALLOCATION',
      ),
    ).toThrow('已无可核销余额');
    invoice.amount = '100';
    contract.finance!.receipts = contract.finance!.receipts!.slice(3);
    expect(() =>
      related(
        contract,
        pools,
        'allocations',
        'invoices',
        invoice,
        'BIND_ALLOCATION',
      ),
    ).toThrow('没有可核销的同币种已确认回款');
  });
  it('returns undefined for unrelated actions without changing their definitions', () => {
    const { contract, pools, production } = fixture();
    const definition = documentActionDefinition(
      contract,
      'receipts',
      'CREATE_RECEIPT',
      [],
      [],
    );
    expect(
      stockFinanceRelatedDefinition(
        definition,
        contract,
        'production',
        production,
        pools,
      ),
    ).toBeUndefined();
  });
});
