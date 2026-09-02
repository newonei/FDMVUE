import type { DocumentType } from './domain/types';
import type { TradePageKey } from './page-config';

export type PrototypeDocumentType =
  | 'SUPPLIER'
  | 'WRITE_OFF_ITEM'
  | DocumentType;

const TYPE_PAGE_PATH: Record<PrototypeDocumentType, string> = {
  CUSTOMER: '/fdmwaimao/customer',
  DEMAND_ANALYSIS: '/fdmwaimao/demand-analysis',
  FACTORY_TASK: '/fdmsupplychain/supply-execution',
  FOLLOW_UP_TASK: '/fdmpurchase/follow-up-customs',
  INBOUND_DOCUMENT: '/fdmsupplychain/supply-execution',
  ORDER: '/fdmwaimao/contract-order',
  ORDER_EXPENSE: '/fdmtradefinance/payable-expense',
  OUTBOUND_DOCUMENT: '/fdmsupplychain/shipment-outbound',
  PAYMENT: '/fdmtradefinance/payable-expense',
  PURCHASE_ORDER: '/fdmpurchase/order',
  PURCHASE_REQUISITION: '/fdmpurchase/requisition',
  RECEIPT: '/fdmtradefinance/receipt-writeoff',
  SHIPMENT: '/fdmsupplychain/shipment-outbound',
  SUPPLIER: '/fdmpurchase/supplier',
  SUPPLIER_INVOICE: '/fdmtradefinance/payable-expense',
  WRITE_OFF_ITEM: '/fdmtradefinance/receipt-writeoff',
};

const TYPE_PAGE_KEY: Record<PrototypeDocumentType, TradePageKey> = {
  CUSTOMER: 'customer',
  DEMAND_ANALYSIS: 'demand-analysis',
  FACTORY_TASK: 'supply-execution',
  FOLLOW_UP_TASK: 'follow-up-customs',
  INBOUND_DOCUMENT: 'supply-execution',
  ORDER: 'contract-order',
  ORDER_EXPENSE: 'payable-expense',
  OUTBOUND_DOCUMENT: 'shipment-outbound',
  PAYMENT: 'payable-expense',
  PURCHASE_ORDER: 'purchase-order',
  PURCHASE_REQUISITION: 'requisition',
  RECEIPT: 'receipt-writeoff',
  SHIPMENT: 'shipment-outbound',
  SUPPLIER: 'supplier',
  SUPPLIER_INVOICE: 'payable-expense',
  WRITE_OFF_ITEM: 'receipt-writeoff',
};

export function documentListPath(type: PrototypeDocumentType) {
  return TYPE_PAGE_PATH[type];
}

export function documentPageKey(type: PrototypeDocumentType) {
  return TYPE_PAGE_KEY[type];
}

export function documentDrawerLocation(
  type: PrototypeDocumentType,
  id: string,
) {
  return {
    path: documentListPath(type),
    query: { detail: id },
  };
}

export function documentPageLocation(type: PrototypeDocumentType, id: string) {
  return {
    path: `${documentListPath(type)}/detail/${encodeURIComponent(id)}`,
  };
}
