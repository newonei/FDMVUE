import type { BusinessRecord, Decimal } from './index';

import { requestClient } from '#/api/request';
import {
  LARGE_FILE_TIMEOUT,
  withUploadProgress,
} from '#/components/upload-task';

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
  createdAt: number | string;
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
  return withUploadProgress([file], (onUploadProgress) =>
    requestClient.upload<{ file: BusinessDocumentFile; version: number }>(
      `${base}/${encodeURIComponent(id)}/attachments`,
      { file, ...data },
      { onUploadProgress, timeout: LARGE_FILE_TIMEOUT },
    ),
  );
}
export function renameBusinessDocumentFile(
  id: string,
  fileId: string,
  name: string,
  idempotencyKey: string,
) {
  return requestClient.post<BusinessDocumentFile>(
    `${base}/${encodeURIComponent(id)}/attachments/${encodeURIComponent(fileId)}/rename`,
    { idempotencyKey, name },
  );
}
export function downloadBusinessDocumentFile(id: string, fileId: string) {
  return requestClient.get<Blob>(
    `${base}/${encodeURIComponent(id)}/attachments/${encodeURIComponent(fileId)}/download`,
    { responseType: 'blob', timeout: LARGE_FILE_TIMEOUT },
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

/** 金智迁入的发货单：物流方式、单号、收货人与明细，只作合同附属资料，不计发货数量。 */
export interface ShipmentNote {
  id: string;
  code?: string;
  name?: string;
  status?: null | string;
  shippedDate?: null | string;
  deliveryMethod?: null | string;
  trackingNo?: null | string;
  amount?: Decimal | null;
  freight?: Decimal | null;
  weightKg?: Decimal | null;
  packages?: Decimal | null;
  recipientName?: null | string;
  recipientPhone?: null | string;
  recipientAddress?: null | string;
  platform?: null | string;
  platformOrderNo?: null | string;
  shipper?: null | string;
  remark?: null | string;
  lines?: {
    amount?: Decimal | null;
    productCode?: null | string;
    productName?: null | string;
    quantity?: Decimal | null;
    remark?: null | string;
    specification?: null | string;
    unit?: null | string;
    unitPrice?: Decimal | null;
  }[];
}
export function getContractShipmentNotes(contractId: string) {
  return requestClient.get<ShipmentNote[]>(`${base}/shipment-notes`, {
    params: { contractId },
  });
}
