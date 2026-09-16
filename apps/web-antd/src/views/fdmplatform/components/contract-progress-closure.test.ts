import type { Contract } from '#/api/fdmplatform';

import { describe, expect, it } from 'vitest';

import {
  contractItemProgress,
  contractRelatedStages,
} from './contract-progress';

function contract(overrides: Record<string, unknown> = {}) {
  return {
    items: [{ id: 'line', quantity: '1000' }],
    requests: [
      {
        id: 'request',
        status: 'ACTIVE',
        items: [{ id: 'r-line', contractItemId: 'line', quantity: '600' }],
      },
    ],
    shipments: [],
    ...overrides,
  } as unknown as Contract;
}

describe('closure quantity reference', () => {
  it('does not show an unauthorized receipt total as zero', () => {
    const stages = contractRelatedStages(
      {
        requests: { active: 0, total: 0 },
        purchaseOrders: { received: 0, total: 0 },
        shipments: { total: 0 },
        invoices: { total: 0 },
        receipts: { total: 0, statusBreakdownAvailable: false },
      },
      contract(),
    );
    expect(stages.find((stage) => stage.name === '关联回款')?.value).toBe(
      '未读取或当前不可见',
    );
  });
  it('shows 400 as snapshot reference, not an authoritative purchasing limit', () => {
    expect(contractItemProgress(contract())[0]).toMatchObject({
      requestedQuantity: '600',
      remainingRequestQuantity: '400',
      deliveryComplete: false,
    });
  });
  it('does not expand sales quantity when over-procured', () => {
    const source = contract({ items: [{ id: 'line', quantity: '500' }] });
    expect(contractItemProgress(source)[0]).toMatchObject({
      quantity: '500',
      requestedQuantity: '600',
      remainingRequestQuantity: '0',
    });
  });
  it('does not count cancelled requests', () => {
    expect(
      contractItemProgress(
        contract({
          requests: [
            {
              id: 'r',
              status: 'CANCELLED',
              items: [{ contractItemId: 'line', quantity: '600' }],
            },
          ],
        }),
      )[0]?.remainingRequestQuantity,
    ).toBe('1000');
  });
  it('does not infer full coverage from an omitted request array', () => {
    expect(
      contractItemProgress(contract({ requests: undefined }))[0]
        ?.remainingRequestQuantity,
    ).toBeUndefined();
  });
  it('does not borrow a same-SKU line from a different source ID', () => {
    expect(
      contractItemProgress(
        contract({
          requests: [
            {
              id: 'r',
              status: 'ACTIVE',
              items: [{ contractItemId: 'another-line', quantity: 9999 }],
            },
          ],
        }),
      )[0]?.requestedQuantity,
    ).toBe('0');
  });
  it.each([null, '', 'bad', -1, 0])(
    'does not complete an unverified/zero contract quantity %s',
    (quantity) => {
      expect(
        contractItemProgress(
          contract({
            items: [{ id: 'line', quantity }],
            shipments: [{ contractItemId: 'line', quantity: '1000' }],
          }),
        )[0]?.deliveryComplete,
      ).toBe(false);
    },
  );
  it('does not treat invalid matched shipment quantity as zero', () => {
    const result = contractItemProgress(
      contract({
        shipments: [{ contractItemId: 'line', quantity: 'invalid' }],
      }),
    )[0];
    expect(result?.shippedQuantity).toBeUndefined();
    expect(result?.deliveryComplete).toBe(false);
  });
  it('does not treat a missing shipment source as a verified empty source', () => {
    expect(
      contractItemProgress(contract({ shipments: undefined }))[0]
        ?.quantityProgressKnown,
    ).toBe(false);
  });
  it('keeps decimal opening, subsequent shipment and return arithmetic exact', () => {
    const result = contractItemProgress(
      contract({
        items: [
          { id: 'line', quantity: '0.35', openingShippedQuantity: '0.3' },
        ],
        requests: [],
        shipments: [
          { contractItemId: 'line', quantity: '0.1', kind: 'OUTBOUND' },
          { contractItemId: 'line', quantity: '0.05', kind: 'RETURN' },
        ],
      }),
    )[0];
    expect(result?.shippedQuantity).toBe('0.35');
    expect(result?.deliveryComplete).toBe(true);
  });
  it('keeps invalid or unsupported request state unknown instead of available', () => {
    expect(
      contractItemProgress(
        contract({
          requests: [
            {
              id: 'r',
              status: 'DRAFT',
              items: [{ contractItemId: 'line', quantity: '1' }],
            },
          ],
        }),
      )[0]?.remainingRequestQuantity,
    ).toBeUndefined();
  });
});
