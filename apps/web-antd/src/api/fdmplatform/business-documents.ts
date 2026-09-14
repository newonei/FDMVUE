import type { BusinessRecord, Decimal } from './index';

import { requestClient } from '#/api/request';

export interface MigrationInfo {
  sourceSystem: string;
  batchId?: string;
  recordId?: string;
  documentNo?: string;
  sourceStatus?: string;
  sourceDate?: string;
  sourceAmount?: Decimal | null;
  sourceCurrency?: null | string;
  additionalAmount?: Decimal | null;
  reconciliationState?: string;
  missingFields?: string[];
  issues?: { field: string; reason: string }[];
}
export interface BusinessDocument {
  status?: string;
  id: string;
  standaloneId?: string;
  type: string;
  recordType?: string;
  code?: string;
  name?: string;
  companyId?: number;
  companyName?: string;
  contractId?: null | string;
  contractCode?: string;
  contractName?: string;
  customerId?: string;
  customerName?: string;
  supplierId?: string;
  supplierName?: string;
  currency?: null | string;
  amount?: Decimal | null;
  version: number;
  allowedActions: string[];
  blockReasons?: string[];
  record: BusinessRecord;
  migration?: MigrationInfo;
  history?: BusinessRecord[];
}
const base = '/fdmplatform/v1/business-documents';
export interface BusinessDocumentFile {
  id: string;
  documentId: string;
  name: string;
  type: string;
  size: number;
  sha256: string;
  uploadedBy: number;
  createdAt: string;
}
export function getBusinessDocumentFiles(id: string) {
  return requestClient.get<{
    canUpload: boolean;
    enabled: boolean;
    items: BusinessDocumentFile[];
  }>(`${base}/${encodeURIComponent(id)}/attachments`);
}
export function uploadBusinessDocumentFile(
  id: string,
  file: File,
  data: { expectedVersion: number; idempotencyKey: string },
) {
  return requestClient.upload<{ file: BusinessDocumentFile; version: number }>(
    `${base}/${encodeURIComponent(id)}/attachments`,
    { file, ...data },
  );
}
export function downloadBusinessDocumentFile(id: string, fileId: string) {
  return requestClient.get<Blob>(
    `${base}/${encodeURIComponent(id)}/attachments/${encodeURIComponent(fileId)}/download`,
    { responseType: 'blob' },
  );
}
export function getBusinessDocument(id: string) {
  return requestClient.get<BusinessDocument>(
    `${base}/${encodeURIComponent(id)}`,
  );
}
export function businessDocumentAction(
  id: string,
  body: {
    action: string;
    expectedVersion: number;
    idempotencyKey: string;
    payload: Record<string, unknown>;
  },
) {
  return requestClient.post<BusinessDocument>(
    `${base}/${encodeURIComponent(id)}/actions`,
    body,
  );
}
