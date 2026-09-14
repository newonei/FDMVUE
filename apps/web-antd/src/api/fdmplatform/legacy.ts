import type { PageResult } from './index';

import { requestClient } from '#/api/request';

export type LegacyKind =
  | 'CONTRACT'
  | 'CUSTOMER'
  | 'PRODUCT'
  | 'PURCHASE_INVOICE'
  | 'PURCHASE_ORDER'
  | 'PURCHASE_PAYMENT'
  | 'PURCHASE_REQUEST'
  | 'RECEIPT'
  | 'REFUND'
  | 'SALES_INVOICE'
  | 'SHIPMENT'
  | 'STOCK_BALANCE'
  | 'STOCK_IN'
  | 'STOCK_OUT'
  | 'STOCKTAKE'
  | 'SUPPLIER'
  | 'SUPPLIER_CONTACT';

export interface LegacySummary {
  batchId: null | string;
  sourceSystem: string;
  counts: Partial<Record<LegacyKind, number>>;
  totalRecords: number;
  totalRows: number;
  issueRecords: number;
}

export interface LegacyRecord {
  id: string;
  kind: LegacyKind;
  externalId: null | string;
  documentNo: null | string;
  title: null | string;
  partyName: null | string;
  companyName: null | string;
  businessDate: null | string;
  sourceStatus: null | string;
  amount: null | number | string;
  amountLabel: null | string;
  currency: null | string;
  rowCount: number;
  issueCount: number;
  nativeType: 'CUSTOMER' | 'PRODUCT' | 'SUPPLIER' | null;
  nativeId: null | string;
}

export interface LegacyDetailView {
  record: LegacyRecord;
  source: { file: string; sha256: string; sheet: string };
  fields: { key: string; label: string; value: unknown }[];
  columns: { key: string; label: string }[];
  list: { rowNo: number; values: Record<string, unknown> }[];
  total: number;
  issues: { field: string; reason: string; value: unknown }[];
  relatedCounts: Partial<Record<LegacyKind, number>>;
}

export interface LegacyQuery {
  kind?: LegacyKind;
  keyword?: string;
  productId?: string;
  relatedId?: string;
  fromDate?: string;
  toDate?: string;
  pageNo: number;
  pageSize: number;
  issuesOnly?: boolean;
}

const base = '/fdmplatform/v1/legacy';
export interface NativeSourceRef {
  kind:
    | 'BUSINESS_DOCUMENT'
    | 'CONTRACT'
    | 'MASTER_CUSTOMER'
    | 'MASTER_SKU'
    | 'MASTER_SUPPLIER'
    | 'PROC_CONTACT'
    | 'PROC_FINANCE'
    | 'STOCK';
  nativeId: string;
  recordId?: string;
}
export function getNativeSource(
  source: NativeSourceRef,
  params: { pageNo: number; pageSize: number },
) {
  return requestClient.get<LegacyDetailView>(
    `/fdmplatform/v1/sources/${source.kind}/${encodeURIComponent(source.nativeId)}`,
    { params: { ...params, recordId: source.recordId } },
  );
}

export function getLegacySummary(
  params: { productId?: string; relatedId?: string } = {},
) {
  return requestClient.get<LegacySummary>(`${base}/summary`, { params });
}

export function getLegacyRecords(params: LegacyQuery) {
  return requestClient.get<PageResult<LegacyRecord>>(`${base}/records`, {
    params,
  });
}

export function getLegacyDetail(
  id: string,
  params: { pageNo: number; pageSize: number },
) {
  return requestClient.get<LegacyDetailView>(
    `${base}/records/${encodeURIComponent(id)}`,
    { params },
  );
}
