import type { Contract, ContractItem } from '#/api/fdmplatform';

import { describe, expect, it } from 'vitest';

import { contractDeliveryStatus } from '../components/contract-progress';
import { contractActions } from '../data';
import { initialFormValues, settleSources } from '../documents/formDefaults';
import { documentActionDefinition } from '../documents/model';
import {
  historicalAdditionalAmount,
  requestLineDefaults,
  salesChargesTotal,
} from './feedback-model';
import { contractItemsTotal, copyContractLine } from './model';

function contract(): Contract {
  return {
    id: 'order',
    code: 'HT-1',
    status: 'CONFIRMED',
    currency: 'CNY',
    items: [
      {
        id: 'a',
        skuId: 'sku',
        skuName: '测试产品',
        quantity: '100',
        requiredDate: '2026-10-12',
      },
    ],
    requests: [
      {
        id: 'r',
        status: 'ACTIVE',
        items: [{ contractItemId: 'a', quantity: '35' }],
      },
    ],
    shipments: [],
    finance: { receipts: [], invoices: [] },
    allowedActions: ['CREATE_REQUEST', 'STOCK_SHIP'],
  } as unknown as Contract;
}

describe('feedback business defaults', () => {
  it('rounds each sales line before summing the same receivable as the server', () => {
    const lines = [
      { id: 'a', quantity: '1', unitPrice: '0.005' },
      { id: 'b', quantity: '1', unitPrice: '0.005' },
    ] as ContractItem[];
    expect(contractItemsTotal(lines)).toBe('0.02');
    expect(
      salesChargesTotal([{ name: '运费', amount: '0.10' }])
        .plus(contractItemsTotal(lines))
        .toFixed(2),
    ).toBe('0.12');
  });

  it('uses the remaining quantity and contract date in both purchase request entry points', () => {
    const order = contract();
    for (const action of [
      contractActions(order, []).CREATE_REQUEST!,
      documentActionDefinition(order, 'requests', 'CREATE_REQUEST', [], []),
    ]) {
      const fields = action.lineFields!;
      const state = initialFormValues(fields);
      settleSources(fields, state.values, {}, state.auto);
      expect(state.values).toMatchObject({
        contractItemId: 'a',
        quantity: '65',
        requiredDate: '2026-10-12',
      });
      state.values.quantity = '20';
      settleSources(fields, state.values, {}, state.auto);
      expect(state.values.quantity).toBe('20');
    }
    order.requests!.push({
      id: 'cancelled',
      status: 'CANCELLED',
      items: [{ contractItemId: 'a', quantity: '90' }],
    });
    expect(requestLineDefaults(order, order.items[0]!).quantity).toBe('65');
  });

  it('leaves unknown or exhausted quantities for manual entry instead of repeating the whole order', () => {
    const order = contract();
    order.requests![0]!.items = [{ contractItemId: 'a', quantity: '100' }];
    expect(requestLineDefaults(order, order.items[0]!).quantity).toBe('');
    order.requests![0]!.items = [{ contractItemId: 'a', quantity: null }];
    expect(requestLineDefaults(order, order.items[0]!).quantity).toBe('');
    delete (order as Partial<Contract>).requests;
    expect(requestLineDefaults(order, order.items[0]!).quantity).toBe('');
  });

  it('retains historical charges without counting previously itemized charges twice', () => {
    const order = {
      ...contract(),
      additionalAmount: '30.30',
      salesCharges: [{ name: '运费', amount: '10.10' }],
    };
    expect(historicalAdditionalAmount(order)).toBe('20.20');
    expect(
      salesChargesTotal([
        { name: '运费', amount: '0.10' },
        { name: '模具费', amount: '0.20' },
      ]).toFixed(2),
    ).toBe('0.30');
    expect(
      salesChargesTotal(order.salesCharges)
        .plus(historicalAdditionalAmount(order))
        .toFixed(2),
    ).toBe('30.30');
  });

  it('automatically binds the only eligible reservation but retains a real product choice for multiple reservations', () => {
    const order = contract();
    const pool = {
      id: 'pool',
      skuId: 'sku',
      reservations: [
        {
          id: 'reservation',
          contractId: order.id,
          contractItemId: 'a',
          remainingQuantity: '40',
        },
      ],
    };
    const single = documentActionDefinition(
      order,
      'shipments',
      'STOCK_SHIP',
      [],
      [pool],
    );
    const state = initialFormValues(single.fields);
    settleSources(single.fields, state.values, {}, state.auto);
    expect(
      single.fields.find((field) => field.key === 'reservationId')?.hidden,
    ).toBe(true);
    expect(state.values).toMatchObject({
      poolId: 'pool',
      reservationId: 'reservation',
      quantity: '40',
    });
    pool.reservations.push({
      id: 'second',
      contractId: order.id,
      contractItemId: 'a',
      remainingQuantity: '10',
    });
    const multiple = documentActionDefinition(
      order,
      'shipments',
      'STOCK_SHIP',
      [],
      [pool],
    );
    const next = initialFormValues(multiple.fields);
    settleSources(multiple.fields, next.values, {}, next.auto);
    expect(
      multiple.fields.find((field) => field.key === 'reservationId')?.hidden,
    ).not.toBe(true);
    expect(next.values.reservationId).toBeUndefined();
  });

  it('computes delivery state from net shipments and keeps unknown history explicit', () => {
    const order = contract();
    expect(contractDeliveryStatus(order)).toBe('未发货');
    order.shipments = [
      {
        id: 's',
        eventId: 's',
        contractItemId: 'a',
        quantity: '100',
        kind: 'OUTBOUND',
      },
    ];
    expect(contractDeliveryStatus(order)).toBe('已发齐');
    order.shipments.push({
      id: 'return',
      eventId: 'return',
      contractItemId: 'a',
      quantity: '5',
      kind: 'RETURN',
      reversalOf: 's',
    });
    expect(contractDeliveryStatus(order)).toBe('部分发货');
    delete (order as Partial<Contract>).shipments;
    expect(contractDeliveryStatus(order)).toBe('待核对');
  });

  it('copies attachment purpose assignments independently for a copied product line', () => {
    const line = {
      id: 'a',
      attachmentIds: ['file'],
      attachmentPurposes: { file: 'LOGO' },
    } as unknown as ContractItem;
    const copy = copyContractLine(line, 'b');
    copy.attachmentPurposes!.file = 'ARTWORK';
    expect(line.attachmentPurposes!.file).toBe('LOGO');
  });
});
