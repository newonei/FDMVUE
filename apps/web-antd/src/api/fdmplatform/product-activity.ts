import type { Decimal } from './index';

import { requestClient } from '#/api/request';

export type ProductActivityType =
  | 'ALL'
  | 'ARRIVAL'
  | 'ASSIGNMENT'
  | 'CONTRACT'
  | 'CUSTOMS'
  | 'PRODUCTION_PROGRESS'
  | 'PURCHASE_INVOICE'
  | 'PURCHASE_ORDER'
  | 'PURCHASE_PAYMENT'
  | 'PURCHASE_PLAN'
  | 'PURCHASE_REQUEST'
  | 'PURCHASE_RETURN'
  | 'QUOTE'
  | 'RECEIPT'
  | 'REFUND'
  | 'SALES_INVOICE'
  | 'SALES_RETURN'
  | 'SHIPMENT'
  | 'STOCK_EVENT'
  | 'STOCK_IN'
  | 'STOCK_OUT'
  | 'STOCKTAKE';

export interface ProductActivityQuantity {
  unit?: null | string;
  quantity?: Decimal | null;
  netQuantity?: Decimal | null;
  acceptedQuantity?: Decimal | null;
}

export interface ProductActivityRecord {
  id: string;
  type: Exclude<ProductActivityType, 'ALL'>;
  documentId: string;
  contractId?: null | string;
  contractCode?: null | string;
  contractName?: null | string;
  companyId?: null | number;
  customerId?: null | string;
  customerName?: null | string;
  supplierId?: null | string;
  supplierName?: null | string;
  name: null | string;
  status?: null | string;
  occurredAt?: null | string;
  businessDate?: null | string;
  timeLabel?: null | string;
  quantities: ProductActivityQuantity[];
  amounts: { amount: Decimal | null; currency: string }[];
  lines: Record<string, unknown>[];
  targetType: string;
  poolId?: null | string;
  eventId?: null | string;
  standaloneId?: null | string;
  recordType?: null | string;
  financeDocumentId?: null | string;
  documentAmount?: Decimal | null;
  documentCurrency?: null | string;
  amountBasis?: null | string;
}

export interface ProductQuantitySummary {
  unit?: null | string;
  contractQuantity?: Decimal | null;
  requestedQuantity?: Decimal | null;
  orderedQuantity?: Decimal | null;
  cancelledOrderQuantity?: Decimal | null;
  arrivedQuantity?: Decimal | null;
  acceptedQuantity?: Decimal | null;
  purchaseReturnedQuantity?: Decimal | null;
  netAcceptedQuantity?: Decimal | null;
  shippedQuantity?: Decimal | null;
  salesReturnedQuantity?: Decimal | null;
  netShippedQuantity?: Decimal | null;
  productionCompletedQuantity?: Decimal | null;
}

export interface ProductInventoryPool {
  id: string;
  companyId?: number;
  warehouseId?: string;
  warehouseName?: null | string;
  stockOwnerId?: string;
  stockOwnerName?: null | string;
  specVersion?: number | string;
  unit?: null | string;
  onHand?: Decimal | null;
  reserved?: Decimal | null;
  unavailable?: Decimal | null;
  safetyStock?: Decimal | null;
  available?: Decimal | null;
  authority?: string;
  sourceOnHandQuantity?: Decimal | null;
  sourceAvailableQuantity?: Decimal | null;
  sourceUnit?: null | string;
}

export interface ProductActivityView {
  productId: string;
  list: ProductActivityRecord[];
  total: number;
  counts: Partial<Record<Exclude<ProductActivityType, 'ALL'>, number>>;
  summary: { quantities: ProductQuantitySummary[] };
  inventoryPools: ProductInventoryPool[];
  pageNo: number;
  pageSize: number;
  notes: string[];
}

export interface ProductActivityQuery {
  companyId: number;
  type: ProductActivityType;
  pageNo: number;
  pageSize: number;
  keyword?: string;
  fromDate?: string;
  toDate?: string;
}

export function getProductActivity(id: string, params: ProductActivityQuery) {
  return requestClient.get<ProductActivityView>(
    `/fdmplatform/v1/products/${encodeURIComponent(id)}/activity`,
    { params, timeout: 60_000 },
  );
}
