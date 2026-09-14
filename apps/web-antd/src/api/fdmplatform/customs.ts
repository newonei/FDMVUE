import type { BusinessRecord, Decimal, PageResult } from './index';

import { requestClient } from '#/api/request';

export interface CustomsLine {
  contractItemId: string;
  quantity: Decimal;
  skuId?: string;
  skuName?: string;
  specVersion?: string;
  specification?: string;
  unit?: string;
}
export interface CustomsShipment {
  eventId: string;
  quantity: Decimal;
  contractItemId?: string;
  specVersion?: string;
  availableQuantity?: Decimal;
}
export interface CustomsDetails {
  name: string;
  required: boolean;
  notRequiredReason?: string;
  plannedDate?: string;
  actualDate?: string;
  destination?: string;
  transportMode?: string;
  agentName?: string;
  externalReference?: string;
  remark?: string;
  packageCount?: number;
  grossWeight?: Decimal;
  netWeight?: Decimal;
  volume?: Decimal;
  purchaseOrderIds: string[];
  lines: CustomsLine[];
  shipments: CustomsShipment[];
}
export interface CustomsBatch extends CustomsDetails {
  id: string;
  code?: string;
  version: number;
  contractId: string;
  contractCode: string;
  contractVersion: number;
  companyId: number;
  ownerUserId?: number;
  status: string;
  documentStatus: string;
  allowedActions: string[];
  details?: CustomsDetails;
  checklist?: BusinessRecord[];
  feedback?: BusinessRecord[];
  history?: BusinessRecord[];
  costReferences?: BusinessRecord[];
  expenses?: CustomsExpense[];
}
export interface CustomsExpense extends BusinessRecord {
  attachmentId: string;
  status: string;
  costId?: string;
  reason?: string;
  cost: {
    amount: Decimal;
    category: string;
    contractItemId?: string;
    currency: string;
    taxTreatment?: string;
  };
}
export interface CustomsSource {
  contractId: string;
  contractCode: string;
  contractVersion: number;
  companyId: number;
  items: CustomsLine[];
  purchaseOrders: BusinessRecord[];
  shipments: CustomsShipment[];
  assignees?: { id: number; nickname: string }[];
}
export interface CustomsFile extends BusinessRecord {
  id: string;
  name: string;
  category: string;
  type?: string;
  size: number;
  uploadedBy?: number;
  createdAt?: string;
  replacesId?: string;
  remark?: string;
}
const base = '/fdmplatform/v1/customs';
export function getCustomsPage(params: {
  companyId: number;
  contractId?: string;
  keyword?: string;
  ownerUserId?: number;
  pageNo: number;
  pageSize: number;
  status?: string;
}) {
  return requestClient.get<PageResult<CustomsBatch>>(`${base}/page`, {
    params,
  });
}
export function getCustoms(id: string) {
  return requestClient.get<CustomsBatch>(`${base}/${encodeURIComponent(id)}`);
}
export function getCustomsSource(contractId: string, batchId?: string) {
  return requestClient.get<CustomsSource>(`${base}/source`, {
    params: { contractId, batchId },
  });
}
export function createCustoms(data: {
  contractId: string;
  contractVersion: number;
  details: CustomsDetails;
  idempotencyKey: string;
}) {
  return requestClient.post<CustomsBatch>(base, data);
}
export function customsAction(
  id: string,
  expectedVersion: number,
  idempotencyKey: string,
  action: string,
  payload: Record<string, unknown>,
) {
  return requestClient.post<CustomsBatch>(
    `${base}/${encodeURIComponent(id)}/actions`,
    { expectedVersion, idempotencyKey, action, payload },
  );
}
export function getCustomsFiles(id: string) {
  return requestClient.get<{
    canUpload: boolean;
    enabled: boolean;
    items: CustomsFile[];
    version: number;
  }>(`${base}/${encodeURIComponent(id)}/attachments`);
}
export function uploadCustomsFile(
  id: string,
  file: File,
  fields: {
    category: string;
    expectedVersion: number;
    idempotencyKey: string;
    remark?: string;
    replacesId?: string;
  },
) {
  return requestClient.upload<{ file: CustomsFile; version: number }>(
    `${base}/${encodeURIComponent(id)}/attachments`,
    { file, ...fields },
    { timeout: 300_000 },
  );
}
export function downloadCustomsFile(id: string, fileId: string) {
  return requestClient.download<Blob>(
    `${base}/${encodeURIComponent(id)}/attachments/${encodeURIComponent(fileId)}/download`,
  );
}
export function getCustomsSummary(contractId: string) {
  return requestClient.get<{
    completed: number;
    documentMissing: number;
    notRequired: number;
    pending: number;
    supplementing: number;
    total: number;
  }>(`${base}/summary`, { params: { contractId } });
}
