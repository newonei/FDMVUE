import type { BusinessRecord, DocumentRow, PageResult } from './index';

import { requestClient } from '#/api/request';
export type SettingType = 'clauses' | 'entities' | 'templates';
export interface ProcurementSetting {
  id: string;
  version: number;
  name: string;
  active: boolean;
  code?: string;
  companyId?: number;
  legalName?: string;
  address?: string;
  contactName?: string;
  phone?: string;
  taxNo?: string;
  bankName?: string;
  bankAccount?: string;
  usages?: string[];
  remark?: string;
  title?: string;
  headerText?: string;
  footerText?: string;
  requiredClauseGroups?: string[];
  groupCode?: string;
  text?: string;
}
export interface SupplierContact {
  id: string;
  version: number;
  supplierId: string;
  name: string;
  role?: string;
  phone?: string;
  email?: string;
  defaultContact: boolean;
  active: boolean;
}
export const procurementBase = '/fdmplatform/v1/procurement';
export function getProcurementSettings(
  type: SettingType,
  params: { active?: boolean; keyword?: string; usage?: string } = {},
) {
  return requestClient.get<ProcurementSetting[]>(
    `${procurementBase}/settings/${type}`,
    { params },
  );
}
export function saveProcurementSetting(
  type: SettingType,
  data: Record<string, unknown>,
) {
  return requestClient.post<ProcurementSetting>(
    `${procurementBase}/settings/${type}`,
    data,
  );
}
export function deleteProcurementSetting(
  type: SettingType,
  id: string,
  data: { expectedVersion: number; idempotencyKey: string },
) {
  return requestClient.post(
    `${procurementBase}/settings/${type}/${encodeURIComponent(id)}/delete`,
    data,
  );
}
export function getSupplierContacts(supplierId: string) {
  return requestClient.get<SupplierContact[]>(
    `${procurementBase}/suppliers/${encodeURIComponent(supplierId)}/contacts`,
  );
}
export function saveSupplierContact(
  supplierId: string,
  data: Record<string, unknown>,
) {
  return requestClient.post<SupplierContact>(
    `${procurementBase}/suppliers/${encodeURIComponent(supplierId)}/contacts`,
    data,
  );
}

export interface ProcurementFile {
  id: string;
  name: string;
  type?: string;
  size: number;
  revision?: number;
  kind?: 'EXPORT' | 'SIGNED';
  exportId?: string;
  detailsRevision?: number;
  detailsVersion?: number;
  createdAt?: string;
  orderId: string;
  contractId: string;
}
export interface ProcurementOrderView {
  id: string;
  contractId: string;
  version: number;
  companyId: number;
  companyName: string;
  contractCode: string;
  contractName: string;
  order: BusinessRecord;
  details: {
    clauseIds: string[];
    clauseSnapshots?: ProcurementSetting[];
    contactId?: string;
    contactSnapshot?: SupplierContact;
    deliveryAddress?: string;
    deliveryDate?: string;
    remark?: string;
    revision?: number;
    signingEntityId?: string;
    signingEntitySnapshot?: ProcurementSetting;
    status: 'CONFIRMED' | 'DRAFT';
    templateId?: string;
    templateSnapshot?: ProcurementSetting;
    version: number;
  };
  allowedActions: string[];
  blockReasons: string[];
  history: BusinessRecord[];
  exports: ProcurementFile[];
  files: ProcurementFile[];
  storageEnabled: boolean;
}
function orderPath(contractId: string, orderId: string) {
  return `${procurementBase}/orders/${encodeURIComponent(contractId)}/${encodeURIComponent(orderId)}`;
}
export function getProcurementOrder(contractId: string, orderId: string) {
  return requestClient.get<ProcurementOrderView>(
    orderPath(contractId, orderId),
  );
}
export interface OrderCommand {
  expectedVersion: number;
  contractVersion: number;
  idempotencyKey: string;
}
export function procurementOrderAction(
  contractId: string,
  orderId: string,
  data: OrderCommand & { action: string; payload: Record<string, unknown> },
) {
  return requestClient.post<ProcurementOrderView>(
    `${orderPath(contractId, orderId)}/actions`,
    data,
  );
}
export function exportProcurementOrder(
  contractId: string,
  orderId: string,
  data: OrderCommand,
) {
  return requestClient.post<ProcurementOrderView>(
    `${orderPath(contractId, orderId)}/exports`,
    data,
  );
}
export function downloadProcurementFile(
  contractId: string,
  orderId: string,
  fileId: string,
) {
  return requestClient.download<Blob>(
    `${orderPath(contractId, orderId)}/files/${encodeURIComponent(fileId)}/download`,
  );
}
export function uploadProcurementSigned(
  contractId: string,
  orderId: string,
  file: File,
  data: OrderCommand & { exportId: string },
) {
  return requestClient.upload<ProcurementOrderView>(
    `${orderPath(contractId, orderId)}/signed`,
    { file, ...data },
    { timeout: 300_000 },
  );
}

export interface ProcurementOrderRow extends DocumentRow {
  ownerUserIds?: number[];
  details?: ProcurementOrderView['details'];
  orderAmount?: string;
  paidAmount?: string;
  unpaidAmount?: string;
}
export function getProcurementOrders(params: {
  contractId?: string;
  keyword?: string;
  mine?: boolean;
  pageNo: number;
  pageSize: number;
  status?: string;
}) {
  return requestClient.get<PageResult<ProcurementOrderRow>>(
    `${procurementBase}/orders/page`,
    { params },
  );
}
