import type { DocumentKind } from './model';

import type { FdmAiCheckApi } from '#/api/fdmaicheck';
import type { BusinessRecord, DocumentRow } from '#/api/fdmplatform';
import type { BusinessDocument } from '#/api/fdmplatform/business-documents';
import type { ProcurementFinanceType } from '#/api/fdmplatform/procurement-finance';

import { receiptKind, shipmentKind } from './model';

export const contractRecordAiCheckTypes: Partial<
  Record<DocumentKind, FdmAiCheckApi.DocType>
> = {
  allocations: 'RECEIPT_ALLOCATION',
  arrivals: 'ARRIVAL',
  invoices: 'SALES_INVOICE',
  orders: 'PURCHASE_ORDER',
  plans: 'PURCHASE_PLAN',
  purchaseReturns: 'PURCHASE_RETURN',
  quotes: 'QUOTE',
  receipts: 'RECEIPT',
  refunds: 'REFUND',
  requests: 'PURCHASE_REQUEST',
  salesReturns: 'SALES_RETURN',
  shipments: 'SHIPMENT',
};

const standaloneAiCheckTypes: Partial<Record<string, FdmAiCheckApi.DocType>> = {
  ARRIVAL: 'ARRIVAL',
  PURCHASE_INVOICE: 'PURCHASE_INVOICE',
  PURCHASE_ORDER: 'PURCHASE_ORDER',
  PURCHASE_PAYMENT: 'PAYMENT',
  PURCHASE_REQUEST: 'PURCHASE_REQUEST',
  PURCHASE_RETURN: 'PURCHASE_RETURN',
  RECEIPT: 'RECEIPT',
  REFUND: 'REFUND',
  SALES_INVOICE: 'SALES_INVOICE',
  SALES_RETURN: 'SALES_RETURN',
  SHIPMENT: 'SHIPMENT',
  STOCK_IN: 'STOCK_IN',
  STOCK_OUT: 'STOCK_OUT',
  STOCKTAKE: 'STOCKTAKE',
};

export function standaloneAiCheckType(
  document: Pick<BusinessDocument, 'record' | 'type'>,
) {
  if (
    document.type === 'SHIPMENT' &&
    shipmentKind(document.record) === 'RETURN'
  )
    return 'SALES_RETURN';
  return standaloneAiCheckTypes[document.type];
}

export function documentRowAiReviewTarget(
  row: DocumentRow,
  docType?: FdmAiCheckApi.DocType,
) {
  if (!row.standaloneId) return { docType, docId: row.id };
  const type = typeof row.type === 'string' ? row.type : row.recordType;
  return {
    docType: type
      ? standaloneAiCheckType({ type, record: row.record })
      : docType,
    docId: row.standaloneId,
  };
}

export function shipmentAiReviewType(
  record: BusinessRecord,
): FdmAiCheckApi.DocType {
  return shipmentKind(record) === 'RETURN' ? 'SALES_RETURN' : 'SHIPMENT';
}

export function receiptAiReviewType(
  record: BusinessRecord,
): FdmAiCheckApi.DocType {
  return ['REFUND', 'REVERSAL'].includes(receiptKind(record))
    ? 'REFUND'
    : 'RECEIPT';
}

export const procurementFinanceAiCheckTypes: Record<
  ProcurementFinanceType,
  FdmAiCheckApi.DocType
> = {
  COST_ALLOCATION: 'COST_ALLOCATION',
  PAYMENT: 'PAYMENT',
  PAYMENT_PLAN: 'PAYMENT_PLAN',
  REIMBURSEMENT: 'REIMBURSEMENT',
  REQUEST: 'PAYMENT_REQUEST',
};
