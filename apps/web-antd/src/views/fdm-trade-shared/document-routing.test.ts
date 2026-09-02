import { describe, expect, it } from 'vitest';

import {
  documentDrawerLocation,
  documentListPath,
  documentPageKey,
  documentPageLocation,
} from './document-routing';

describe('foreign trade prototype document routing', () => {
  it.each([
    ['ORDER', '/fdmwaimao/contract-order', 'contract-order'],
    ['DEMAND_ANALYSIS', '/fdmwaimao/demand-analysis', 'demand-analysis'],
    ['PURCHASE_REQUISITION', '/fdmpurchase/requisition', 'requisition'],
    ['PURCHASE_ORDER', '/fdmpurchase/order', 'purchase-order'],
    ['FOLLOW_UP_TASK', '/fdmpurchase/follow-up-customs', 'follow-up-customs'],
    ['FACTORY_TASK', '/fdmsupplychain/supply-execution', 'supply-execution'],
    ['SHIPMENT', '/fdmsupplychain/shipment-outbound', 'shipment-outbound'],
    ['RECEIPT', '/fdmtradefinance/receipt-writeoff', 'receipt-writeoff'],
    ['PAYMENT', '/fdmtradefinance/payable-expense', 'payable-expense'],
    ['SUPPLIER', '/fdmpurchase/supplier', 'supplier'],
  ] as const)('maps %s to its authority page', (type, path, pageKey) => {
    expect(documentListPath(type)).toBe(path);
    expect(documentPageKey(type)).toBe(pageKey);
  });

  it('builds drawer and independent-page locations without duplicating CRUD', () => {
    expect(documentDrawerLocation('PURCHASE_ORDER', 'PO-1')).toEqual({
      path: '/fdmpurchase/order',
      query: { detail: 'PO-1' },
    });
    expect(documentPageLocation('PURCHASE_ORDER', 'PO 1')).toEqual({
      path: '/fdmpurchase/order/detail/PO%201',
    });
    expect(documentPageLocation('SUPPLIER', 'SUP 1')).toEqual({
      path: '/fdmpurchase/supplier/detail/SUP%201',
    });
  });
});
