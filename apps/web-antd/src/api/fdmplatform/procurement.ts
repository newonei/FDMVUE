import type { BusinessRecord, Decimal, DocumentRow, PageResult } from './index';

import { requestClient } from '#/api/request';
export type SettingType =
  | 'categories'
  | 'clauses'
  | 'entities'
  | 'templates'
  | 'warehouses';
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
  /** 仓库：库管人员、默认仓库、是否计入总库存 */
  managerUserIds?: number[];
  isDefault?: boolean;
  countInTotal?: boolean;
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
    /** 辅料情况说明，导出到采购单 Word（金智「采购概要」） */
    accessoryNote?: string;
    clauseIds: string[];
    clauseSnapshots?: ProcurementSetting[];
    contactId?: string;
    contactSnapshot?: SupplierContact;
    deliveryAddress?: string;
    deliveryDate?: string;
    /** 这张单不需要收票（淘宝、个体等） */
    noInvoice?: boolean;
    /** 内部下单备注，不导出给供应商 */
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
/** 不关联合同的采购单 contractId 为空，接口路径用 standalone 占位。 */
function orderPath(contractId: string, orderId: string) {
  return `${procurementBase}/orders/${encodeURIComponent(contractId || 'standalone')}/${encodeURIComponent(orderId)}`;
}

export interface PurchaseOrderEntryLine {
  productId?: string;
  contractItemId?: string;
  quantity: Decimal;
  unitPrice?: Decimal;
  arrivalDate?: string;
  gift: boolean;
  remark?: string;
}
export interface PurchaseOrderEntry {
  idempotencyKey: string;
  contractId?: string;
  requestId?: string;
  supplierId: string;
  subject?: string;
  category?: string;
  purchaseDate?: string;
  companyId?: number;
  ownerUserId?: number;
  currency?: string;
  additionalCategory?: string;
  additionalAmount?: Decimal;
  roundOff?: Decimal;
  remark?: string;
  lines: PurchaseOrderEntryLine[];
}
/** 新建采购单：关联合同时写进合同，不关联时为独立采购单。 */
export function createProcurementOrder(data: PurchaseOrderEntry) {
  return requestClient.post<{
    code: string;
    contractId: string;
    orderId: string;
  }>(`${procurementBase}/orders`, data);
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
/** format：PDF、DOCX（Word）或 XLSX（Excel），都按金智采购单模板生成并存档一版。 */
export function exportProcurementOrder(
  contractId: string,
  orderId: string,
  data: OrderCommand & { format?: 'DOCX' | 'PDF' | 'XLSX' },
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
  /** Display number: 金智 keeps its own, native orders get CG-下单日期-ID前6位. */
  orderCode?: string;
  /** A signed contract has been uploaded for this order. */
  signed?: boolean;
  /** 下单资料交货日期，没填时取报价承诺到货日。 */
  dueDate?: string;
  /** NONE 未入库 / PARTIAL 部分入库 / ALL 已入齐 */
  receivedState?: 'ALL' | 'NONE' | 'PARTIAL';
  invoicedAmount?: Decimal;
  noInvoice?: boolean;
  /** IN_PROGRESS 进行中 / COMPLETED 已完成（入库齐、付清、收票齐）/ ENDED 已结束 */
  operationStatus?: 'COMPLETED' | 'ENDED' | 'IN_PROGRESS';
  ownerUserIds?: number[];
  /** 新建的独立采购单（不关联合同），打开完整采购单抽屉 */
  nativeStandalone?: boolean;
  details?: ProcurementOrderView['details'];
  orderAmount?: string;
  paidAmount?: string;
  unpaidAmount?: string;
}
export function getProcurementOrders(params: {
  contractId?: string;
  keyword?: string;
  mine?: boolean;
  operation?: 'COMPLETED' | 'ENDED' | 'IN_PROGRESS';
  pageNo: number;
  pageSize: number;
  pendingCompletion?: boolean;
  status?: string;
}) {
  return requestClient.get<PageResult<ProcurementOrderRow>>(
    `${procurementBase}/orders/page`,
    { params },
  );
}

export type OrderAttentionReason = 'ARRIVED_UNPAID' | 'OVERDUE' | 'UNSIGNED';
export interface ProcurementOrdersOverview {
  orders: number;
  open: number;
  overdue: number;
  maxOverdueDays: number;
  unsigned: number;
  unpaid: number;
  /** 操作状态：下属单据未全部办完 / 已全部办完 */
  inProgress?: number;
  completed?: number;
  asOf: string;
  openAmount: Record<string, Decimal>;
  unpaidAmount: Record<string, Decimal>;
  arrivedUnpaidAmount: Record<string, Decimal>;
  attention: {
    amount?: Decimal | null;
    code: string;
    contractCode: string;
    contractId: string;
    currency: string;
    days?: number;
    dueDate?: string;
    orderId: string;
    reason: OrderAttentionReason;
    supplierName: string;
    unpaid?: Decimal;
  }[];
}
/** Native orders only: in transit, overdue, contract not signed back, unpaid. */
export function getProcurementOrdersOverview(mine: boolean) {
  return requestClient.get<ProcurementOrdersOverview>(
    `${procurementBase}/orders/overview`,
    { params: { mine } },
  );
}

export interface PurchaseInvoice {
  id: string;
  status: 'VALID' | 'VOID';
  orderId: string;
  orderCode?: string;
  supplierName?: string;
  currency?: string;
  invoiceNo: string;
  invoiceDate: string;
  invoiceType: 'ORDINARY' | 'OTHER' | 'SPECIAL';
  taxRate?: Decimal;
  amount: Decimal;
  remark?: string;
  voidReason?: string;
  createdBy: number;
  createdAt: string;
}
/** 采购收票：采购单上的发票与有效合计。 */
export function getOrderInvoices(contractId: string, orderId: string) {
  return requestClient.get<{
    invoicedAmount: Decimal;
    invoices: PurchaseInvoice[];
  }>(`${orderPath(contractId, orderId)}/invoices`);
}
export function createPurchaseInvoice(data: {
  amount: Decimal;
  contractId: string;
  idempotencyKey: string;
  invoiceDate?: string;
  invoiceNo: string;
  invoiceType: PurchaseInvoice['invoiceType'];
  orderId: string;
  remark?: string;
  taxRate?: Decimal;
}) {
  return requestClient.post<PurchaseInvoice>(
    `${procurementBase}/invoices`,
    data,
  );
}
export function voidPurchaseInvoice(
  id: string,
  data: { idempotencyKey: string; reason: string },
) {
  return requestClient.post<PurchaseInvoice>(
    `${procurementBase}/invoices/${encodeURIComponent(id)}/void`,
    data,
  );
}
/** 标记 / 取消「无需收票」。 */
export function setOrderNoInvoice(
  contractId: string,
  orderId: string,
  value: boolean,
) {
  return requestClient.post<ProcurementOrderView>(
    `${orderPath(contractId, orderId)}/no-invoice`,
    { value },
  );
}
