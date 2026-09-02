import type { RouteLocationRaw } from 'vue-router';

export type FdmTradeDocumentType =
  | 'consumption-record'
  | 'contract-order'
  | 'customer'
  | 'demand-plan'
  | 'purchase-requisition'
  | 'receipt-record'
  | 'shipment';

export function fdmTradeDocumentRoute(
  type: FdmTradeDocumentType,
  id: string,
): RouteLocationRaw {
  if (type === 'customer') return `/fdmwaimao/customer/detail/${id}`;
  if (type === 'contract-order') {
    return `/fdmwaimao/contract-order/detail/${id}`;
  }
  if (type === 'demand-plan') {
    return `/fdmwaimao/demand-analysis/detail/${id}`;
  }
  if (type === 'purchase-requisition') {
    return `/fdmprocurement/requisition/detail/${id}`;
  }
  if (type === 'receipt-record') {
    return {
      path: `/fdmwaimao/receipt-record/detail/${id}`,
      query: { type: 'receipt' },
    };
  }
  if (type === 'consumption-record') {
    return `/fdmwaimao/receipt-record/consumption/detail/${id}`;
  }
  return { path: '/fdmwaimao/shipment', query: { shipmentId: id } };
}

export function fdmTradeContractListRoute(
  customerId: string,
): RouteLocationRaw {
  return { path: '/fdmwaimao/contract-order', query: { customerId } };
}

export function fdmTradeReceiptListRoute(options: {
  customerId?: string;
  orderId?: string;
  type?: 'consumption' | 'receipt';
}): RouteLocationRaw {
  return {
    path: '/fdmwaimao/receipt-record',
    query: {
      customerId: options.customerId,
      orderId: options.orderId,
      type: options.type || 'receipt',
      workspace: options.type || 'receipt',
    },
  };
}

export function fdmTradeShipmentListRoute(options: {
  contractOrderId?: string;
  contractOrderNo?: string;
  customerId?: string;
  customerName?: string;
  fulfillmentPlanId?: string;
  fulfillmentPlanNo?: string;
  shipmentId?: string;
}): RouteLocationRaw {
  return {
    path: '/fdmwaimao/shipment',
    query: {
      contractOrderId: options.contractOrderId,
      contractOrderNo: options.contractOrderNo,
      customerId: options.customerId,
      customerName: options.customerName,
      fulfillmentPlanId: options.fulfillmentPlanId,
      fulfillmentPlanNo: options.fulfillmentPlanNo,
      shipmentId: options.shipmentId,
    },
  };
}
