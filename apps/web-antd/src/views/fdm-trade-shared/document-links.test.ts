import { describe, expect, it } from 'vitest';

import {
  fdmTradeContractListRoute,
  fdmTradeDocumentRoute,
  fdmTradeReceiptListRoute,
  fdmTradeShipmentListRoute,
} from './document-links';

describe('fdm trade document links', () => {
  it('builds direct detail routes for core documents', () => {
    expect(fdmTradeDocumentRoute('customer', '11')).toBe(
      '/fdmwaimao/customer/detail/11',
    );
    expect(fdmTradeDocumentRoute('contract-order', '22')).toBe(
      '/fdmwaimao/contract-order/detail/22',
    );
    expect(fdmTradeDocumentRoute('demand-plan', '33')).toBe(
      '/fdmwaimao/demand-analysis/detail/33',
    );
    expect(fdmTradeDocumentRoute('purchase-requisition', '34')).toBe(
      '/fdmprocurement/requisition/detail/34',
    );
  });

  it('preserves receipt and consumption record variants', () => {
    expect(fdmTradeDocumentRoute('receipt-record', '44')).toEqual({
      path: '/fdmwaimao/receipt-record/detail/44',
      query: { type: 'receipt' },
    });
    expect(fdmTradeDocumentRoute('consumption-record', '55')).toBe(
      '/fdmwaimao/receipt-record/consumption/detail/55',
    );
  });

  it('builds filtered relationship list routes', () => {
    expect(fdmTradeContractListRoute('66')).toEqual({
      path: '/fdmwaimao/contract-order',
      query: { customerId: '66' },
    });
    expect(
      fdmTradeReceiptListRoute({ orderId: '77', type: 'consumption' }),
    ).toEqual({
      path: '/fdmwaimao/receipt-record',
      query: {
        customerId: undefined,
        orderId: '77',
        type: 'consumption',
        workspace: 'consumption',
      },
    });
    expect(
      fdmTradeShipmentListRoute({
        contractOrderId: '88',
        contractOrderNo: 'DD-88',
      }),
    ).toEqual({
      path: '/fdmwaimao/shipment',
      query: {
        contractOrderId: '88',
        contractOrderNo: 'DD-88',
        customerId: undefined,
        customerName: undefined,
        fulfillmentPlanId: undefined,
        fulfillmentPlanNo: undefined,
        shipmentId: undefined,
      },
    });
  });
});
