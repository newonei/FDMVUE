import type { Contract } from '#/api/fdmplatform';

import { describe, expect, it } from 'vitest';

import {
  contractItemProgress,
  contractRelatedStages,
} from './contract-progress';
describe('unified contract progress', () => {
  it('uses related native totals even when contract arrays are empty and keeps unverified ledger amounts unknown', () => {
    const stages = contractRelatedStages(
      {
        requests: { total: 9, active: 7 },
        purchaseOrders: { total: 12, received: 3 },
        shipments: { total: 4 },
        receipts: { total: 5 },
        invoices: { total: 6 },
      },
      {
        items: [],
        requests: [],
        purchaseOrders: [],
        financeSummary: undefined,
        currency: null,
      } as unknown as Contract,
    );
    expect(stages.find((stage) => stage.name === '采购申请')?.value).toBe(
      '9 份（有效 7 份）',
    );
    expect(stages.find((stage) => stage.name === '采购执行')?.value).toBe(
      '3 / 12 单到货',
    );
    expect(stages.find((stage) => stage.name === '关联回款')).toMatchObject({
      value: '5 笔',
      description: '已入账确认金额：未提供（币种待核对）',
    });
  });
  it('never displays a failed or pending summary load as zero records', () => {
    expect(
      contractRelatedStages(undefined, undefined).every(
        (stage) => stage.value === '暂未读取',
      ),
    ).toBe(true);
  });
  it('includes opening shipment quantities exactly once with later shipments and returns', () => {
    const contract = {
      items: [{ id: 'i', quantity: '0.35', openingShippedQuantity: '0.3' }],
      shipments: [
        { id: 's', contractItemId: 'i', quantity: '0.1', kind: 'OUTBOUND' },
        { id: 'r', contractItemId: 'i', quantity: '0.05', kind: 'RETURN' },
        { id: 'other', contractItemId: 'other', quantity: 999 },
      ],
      requests: [],
    } as unknown as Contract;
    expect(contractItemProgress(contract)[0]).toMatchObject({
      shippedQuantity: '0.35',
      requestedQuantity: '0',
      deliveryComplete: true,
    });
  });
  it('counts only current mapped noncancelled request quantities without borrowing independent quantities', () => {
    const contract = {
      items: [{ id: 'i', quantity: 5 }],
      requests: [
        {
          id: 'r',
          status: 'ACTIVE',
          items: [{ id: 'l', contractItemId: 'i', quantity: '1.2' }],
        },
        {
          id: 'cancelled',
          status: 'CANCELLED',
          items: [{ id: 'l2', contractItemId: 'i', quantity: 99 }],
        },
      ],
    } as unknown as Contract;
    expect(contractItemProgress(contract)[0]?.requestedQuantity).toBe('1.2');
  });
});
