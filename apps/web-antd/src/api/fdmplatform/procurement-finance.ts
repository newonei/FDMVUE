import type { BusinessDocumentFile, MigrationInfo } from './business-documents';
import type { BusinessRecord, Decimal, PageResult } from './index';

import { requestClient } from '#/api/request';
export type ProcurementFinanceType =
  | 'COST_ALLOCATION'
  | 'PAYMENT'
  | 'PAYMENT_PLAN'
  | 'REIMBURSEMENT'
  | 'REQUEST';
export interface ProcurementFinanceRecord extends BusinessRecord {
  standaloneId?: string;
  recordType?: string;
  sourceAttachmentDocumentId?: string;
  sourceAttachments?: BusinessDocumentFile[];
  migration?: MigrationInfo;
  blockReasons?: string[];
  type: ProcurementFinanceType;
  code: string;
  name: string;
  version: number;
  status: string;
  allowedActions: string[];
  contractId: string;
  orderId: string;
  currency: string;
  amount: Decimal;
  payerEntityId?: string;
  payerSnapshot?: { name?: string };
  exchange?: {
    fallback: boolean;
    fetchedAt: string;
    rateDate: string;
    rateToCny: Decimal;
    requestedDate: string;
    rmbAmount: Decimal;
    source: string;
  };
  history?: BusinessRecord[];
  summary?: Record<string, unknown>;
}
const base = '/fdmplatform/v1/procurement-finance';
export function getProcurementFinancePage(params: {
  contractId?: string;
  keyword?: string;
  orderId?: string;
  pageNo: number;
  pageSize: number;
  status?: string;
  type: ProcurementFinanceType;
}) {
  return requestClient.get<PageResult<ProcurementFinanceRecord>>(
    `${base}/page`,
    { params },
  );
}
export function getProcurementFinance(id: string) {
  return requestClient.get<ProcurementFinanceRecord>(
    `${base}/${encodeURIComponent(id)}`,
  );
}
export function createProcurementFinance(data: {
  idempotencyKey: string;
  payload: Record<string, unknown>;
  type: ProcurementFinanceType;
}) {
  return requestClient.post<ProcurementFinanceRecord>(base, data);
}
export function procurementFinanceAction(
  id: string,
  data: {
    action: string;
    expectedVersion: number;
    idempotencyKey: string;
    payload: Record<string, unknown>;
  },
) {
  return requestClient.post<ProcurementFinanceRecord>(
    `${base}/${encodeURIComponent(id)}/actions`,
    data,
  );
}
export function getProcurementFinanceSummary(
  contractId: string,
  orderId: string,
) {
  return requestClient.get<Record<string, unknown>>(`${base}/order-summary`, {
    params: { contractId, orderId },
  });
}

export interface ProcurementFinanceFile {
  id: string;
  name: string;
  type?: string;
  size: number;
  createdAt?: string;
}
export function getProcurementFinanceFiles(id: string) {
  return requestClient.get<{
    canUpload: boolean;
    enabled: boolean;
    items: ProcurementFinanceFile[];
    version: number;
  }>(`${base}/${encodeURIComponent(id)}/attachments`);
}
export function uploadProcurementFinanceFile(
  id: string,
  file: File,
  data: { expectedVersion: number; idempotencyKey: string },
) {
  return requestClient.upload<{
    file: ProcurementFinanceFile;
    version: number;
  }>(
    `${base}/${encodeURIComponent(id)}/attachments`,
    { file, ...data },
    { timeout: 300_000 },
  );
}
export function downloadProcurementFinanceFile(id: string, fileId: string) {
  return requestClient.download<Blob>(
    `${base}/${encodeURIComponent(id)}/attachments/${encodeURIComponent(fileId)}/download`,
  );
}
