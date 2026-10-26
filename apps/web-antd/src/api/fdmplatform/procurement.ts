import type { BusinessRecord, Decimal, DocumentRow, PageResult } from './index';

import { requestClient } from '#/api/request';
export type SettingType =
  | 'accessories'
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
  /** 常用辅料的排列顺序 */
  sortNo?: number;
  text?: string;
  /** 仓库：库管人员、默认仓库、是否计入总库存 */
  managerUserIds?: number[];
  isDefault?: boolean;
  countInTotal?: boolean;
  /** 仓库所属工厂：工厂完工的货入本厂仓库，工厂库管只能操作本厂仓库 */
  factoryId?: null | number;
  factoryName?: null | string;
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
/** 采购单明细行的补充资料，印在导出的采购单上（#88） */
export interface OrderLineExtra {
  customerColor?: string;
  weight?: string;
  /** 型号（如正反面颜色） */
  model?: string;
  /** 装箱数：每箱几件，箱数按数量自动算 */
  packQty?: number;
  imageId?: string;
}
/** 整单共用说明列（如纹路、定制）：明细各行合并成一格，文字加配图 */
export interface OrderSharedColumn {
  title: string;
  text?: string;
  imageIds: string[];
}
export interface OrderAccessory {
  name: string;
  checked: boolean;
  remark?: string;
}
export interface OrderPackagingStep {
  title: string;
  text?: string;
  imageIds: string[];
}
export interface ProcurementOrderImage {
  id: string;
  name: string;
  type: string;
  width: number;
  height: number;
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
    /** 辅料明细表：整份清单，勾选本次需要的 */
    accessories?: OrderAccessory[];
    /** 辅料情况说明，导出到采购单（金智「采购概要」） */
    accessoryNote?: string;
    clauseIds: string[];
    clauseSnapshots?: ProcurementSetting[];
    contactId?: string;
    contactSnapshot?: SupplierContact;
    deliveryAddress?: string;
    deliveryDate?: string;
    /** 明细行 id → 补充资料 */
    lineExtras?: Record<string, OrderLineExtra>;
    /** 这张单不需要收票（淘宝、个体等） */
    noInvoice?: boolean;
    packagingSteps?: OrderPackagingStep[];
    /** 内部下单备注，不导出给供应商 */
    remark?: string;
    revision?: number;
    sharedColumns?: OrderSharedColumn[];
    signingEntityId?: string;
    signingEntitySnapshot?: ProcurementSetting;
    status: 'CONFIRMED' | 'DRAFT';
    templateId?: string;
    templateSnapshot?: ProcurementSetting;
    version: number;
  };
  /** 辅料明细表可勾选的常用辅料 */
  accessoryCatalog?: string[];
  allowedActions: string[];
  blockReasons: string[];
  history: BusinessRecord[];
  exports: ProcurementFile[];
  files: ProcurementFile[];
  storageEnabled: boolean;
}
/** 带图片的采购单导出稿有几 MB，生成和下载都不受默认 30 秒超时限制。 */
const FILE_TIMEOUT = 300_000;
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
  /** 这一行的供应商，不填用表头供应商；不同供应商自动拆成多张采购单 */
  supplierId?: string;
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
  /** 整单折扣 %，不传为 100 */
  discountRate?: Decimal;
  remark?: string;
  /** 收货工厂：选了就由该工厂确认收货（只能买原料、辅料），不进采购仓库 */
  receiveFactoryId?: number;
  lines: PurchaseOrderEntryLine[];
}
/** 采购单可选的收货工厂；工厂模块未启用时为空。 */
export function getReceiveFactories() {
  return requestClient.get<{ id: number; name: string }[]>(
    `${procurementBase}/receive-factories`,
  );
}
export interface CreatedProcurementOrder {
  orderId: string;
  code: string;
  supplierId?: string;
  supplierName?: string;
}
/** orderId / code 是第一张；明细分属多个供应商时 orders 里是按供应商拆出的每一张。 */
export interface CreatedProcurementOrders {
  code: string;
  contractId: string;
  orderId: string;
  orders?: CreatedProcurementOrder[];
}
/** 新建采购单：关联合同时写进合同，不关联时为独立采购单；不同供应商的明细拆成多张。 */
export function createProcurementOrder(data: PurchaseOrderEntry) {
  return requestClient.post<CreatedProcurementOrders>(
    `${procurementBase}/orders`,
    data,
  );
}
/** 「已新建采购单 CG001」；拆单时「已按供应商拆成 2 张采购单：CG001、CG002」。 */
export function createdOrdersText(
  value: CreatedProcurementOrders,
  single = '已新建采购单',
) {
  const orders = value.orders ?? [];
  return orders.length > 1
    ? `已按供应商拆成 ${orders.length} 张采购单：${orders.map((order) => order.code).join('、')}`
    : `${single} ${value.code}`;
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
/** format：PDF 或 XLSX（Excel），都按金智采购单模板生成并存档一版；历史 Word 版本仍可下载。 */
export function exportProcurementOrder(
  contractId: string,
  orderId: string,
  data: OrderCommand & { format?: 'PDF' | 'XLSX' },
) {
  return requestClient.post<ProcurementOrderView>(
    `${orderPath(contractId, orderId)}/exports`,
    data,
    { timeout: FILE_TIMEOUT },
  );
}
export function downloadProcurementFile(
  contractId: string,
  orderId: string,
  fileId: string,
) {
  return requestClient.download<Blob>(
    `${orderPath(contractId, orderId)}/files/${encodeURIComponent(fileId)}/download`,
    { timeout: FILE_TIMEOUT },
  );
}
/** 下单资料图片：上传后由后端压缩存档，保存资料时引用返回的 id。 */
export function uploadProcurementImage(
  contractId: string,
  orderId: string,
  file: File,
) {
  return requestClient.upload<ProcurementOrderImage>(
    `${orderPath(contractId, orderId)}/images`,
    { file },
    { timeout: 300_000 },
  );
}
export function getProcurementImage(
  contractId: string,
  orderId: string,
  imageId: string,
) {
  return requestClient.download<Blob>(
    `${orderPath(contractId, orderId)}/images/${encodeURIComponent(imageId)}`,
    { timeout: FILE_TIMEOUT },
  );
}
/** 从历史采购单复制图片引用到本单；返回 来源图片 id → 本单新 id。 */
export function copyProcurementImages(
  contractId: string,
  orderId: string,
  data: { imageIds: string[]; sourceContractId: string; sourceOrderId: string },
) {
  return requestClient.post<Record<string, string>>(
    `${orderPath(contractId, orderId)}/images/copy`,
    { ...data, sourceContractId: data.sourceContractId || 'standalone' },
  );
}
/** 采购单辅料明细表的勾选清单：维护过常用辅料用维护的，否则为默认清单。 */
export function getAccessoryCatalog() {
  return requestClient.get<string[]>(`${procurementBase}/accessory-catalog`);
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
  /** 采购单附件页签里上传过附件（合同附件、单据附件或盖章件） */
  attached?: boolean;
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

/** 发票关联的一张采购单：amount 为本发票对应这张单的金额（部分开票时小于采购金额）。 */
export interface PurchaseInvoiceOrder {
  amount: Decimal;
  contractId: string;
  orderCode?: string;
  orderId: string;
}
/** 付款状态：系统按有效付款记录计算，不能手改。 */
export type InvoicePaymentStatus = 'PAID' | 'PARTIAL' | 'UNPAID';
export interface PurchaseInvoice {
  id: string;
  /** 系统发票编号（FP-…）；老发票没有 */
  code?: string;
  status: 'VALID' | 'VOID';
  /** 第一张关联采购单，兼容只认单张单的页面；全部关联看 orders */
  orderId: string;
  orderCode?: string;
  /** 关联的全部采购单；老发票没有，按 orderId 一张单 */
  orders?: PurchaseInvoiceOrder[];
  orderCount?: number;
  /** 采购单发票列表里：本发票对应这张单的金额 */
  allocatedAmount?: Decimal;
  /** 经手人（登记人姓名） */
  createdByName?: string;
  /** 有效发票：累计已付、剩余未付、付款状态 */
  paidAmount?: Decimal;
  unpaidAmount?: Decimal;
  paymentStatus?: InvoicePaymentStatus;
  supplierName?: string;
  currency?: string;
  invoiceNo?: string;
  invoiceDate: string;
  invoiceType: 'ORDINARY' | 'OTHER' | 'SPECIAL';
  taxRate?: Decimal;
  amount: Decimal;
  remark?: string;
  voidReason?: string;
  /** 挂在哪张付款记录下（金智付款发票的「付款计划/记录」），可空 */
  paymentId?: string;
  paymentCode?: string;
  /** 发票原件 */
  file?: { id: string; name: string; size: number; type?: string };
  createdBy: number;
  createdAt: string;
  version: number;
}
/** 采购收票：采购单上的发票与有效合计。 */
export function getOrderInvoices(contractId: string, orderId: string) {
  return requestClient.get<{
    invoicedAmount: Decimal;
    invoices: PurchaseInvoice[];
  }>(`${orderPath(contractId, orderId)}/invoices`);
}
/** 登记付款发票：必须上传发票原件，其余字段随表单提交。 */
export function createPurchaseInvoice(
  file: File,
  data: {
    amount: Decimal;
    contractId: string;
    idempotencyKey: string;
    invoiceDate?: string;
    invoiceNo?: string;
    invoiceType: PurchaseInvoice['invoiceType'];
    orderId: string;
    /** 集中收票：多张采购单及各单关联金额；传了就不用 contractId / orderId */
    orders?: PurchaseInvoiceOrder[];
    paymentId?: string;
    remark?: string;
    taxRate?: Decimal;
  },
) {
  const fields = Object.fromEntries(
    Object.entries({
      ...data,
      contractId: data.contractId === 'standalone' ? '' : data.contractId,
      orders: invoiceOrders(data.orders),
    }).filter(([, value]) => value !== undefined && value !== ''),
  );
  return requestClient.upload<PurchaseInvoice>(
    `${procurementBase}/invoices`,
    { file, ...fields },
    { timeout: 300_000 },
  );
}
function invoiceOrders(orders?: PurchaseInvoiceOrder[]) {
  if (!orders || orders.length === 0) return undefined;
  return JSON.stringify(
    orders.map((order) => ({
      contractId: order.contractId === 'standalone' ? '' : order.contractId,
      orderId: order.orderId,
      amount: order.amount,
    })),
  );
}
/** 修改付款发票：字段整体覆盖，带 file 时换原件；采购单不能换，集中收票可用 orders 重新分配各单金额。 */
export function updatePurchaseInvoice(
  id: string,
  file: File | undefined,
  data: {
    amount: Decimal;
    expectedVersion: number;
    idempotencyKey: string;
    invoiceDate?: string;
    invoiceNo?: string;
    invoiceType: PurchaseInvoice['invoiceType'];
    orders?: PurchaseInvoiceOrder[];
    paymentId?: string;
    remark?: string;
    taxRate?: Decimal;
  },
) {
  // 不换原件时也走 multipart（后端同一个接口），所以自己拼 FormData
  const form = new FormData();
  if (file) form.append('file', file);
  for (const [key, value] of Object.entries({
    ...data,
    orders: invoiceOrders(data.orders),
  })) {
    if (value !== undefined && value !== '') form.append(key, String(value));
  }
  return requestClient.post<PurchaseInvoice>(
    `${procurementBase}/invoices/${encodeURIComponent(id)}`,
    form,
    { headers: { 'Content-Type': 'multipart/form-data' }, timeout: 300_000 },
  );
}
/** 发票识别结果：识别不到的字段为空，由采购员手填。 */
export interface InvoiceRecognition {
  recognized: boolean;
  invoiceNo?: string;
  invoiceDate?: string;
  amount?: Decimal;
  taxAmount?: Decimal;
  taxRate?: Decimal;
  invoiceType?: PurchaseInvoice['invoiceType'];
  sellerName?: string;
}
/** 从发票 PDF / 数电 XML 读出号码、日期和价税合计，不保存文件。 */
export function recognizePurchaseInvoice(file: File) {
  return requestClient.upload<InvoiceRecognition>(
    `${procurementBase}/invoices/recognize`,
    { file },
    { timeout: 60_000 },
  );
}
export function downloadPurchaseInvoiceFile(id: string) {
  return requestClient.download<Blob>(
    `${procurementBase}/invoices/${encodeURIComponent(id)}/file`,
  );
}
/** 付款发票列表（金智同款）：按收票时间倒序，附全部有效发票合计。 */
export function getPurchaseInvoicePage(params: {
  keyword?: string;
  linked?: boolean;
  pageNo: number;
  pageSize: number;
  paymentStatus?: InvoicePaymentStatus;
  status?: PurchaseInvoice['status'];
}) {
  return requestClient.get<{
    list: PurchaseInvoice[];
    total: number;
    validTotals: Array<{ amount: Decimal; currency: string }>;
  }>(`${procurementBase}/invoices/page`, { params });
}
/** 发票的来源采购单（查看来源）：采购单信息与本发票关联金额。 */
export interface InvoiceSourceOrder {
  allocatedAmount: Decimal;
  category?: string;
  contractId: string;
  currency?: string;
  /** 采购单已读不到（被删或无权） */
  missing?: boolean;
  orderAmount?: Decimal;
  orderCode?: string;
  orderId: string;
  ownerName?: string;
  ownerUserId?: number;
  purchaseDate?: string;
  status?: string;
  subject?: string;
  supplierName?: string;
}
export interface InvoiceSources {
  allocatedTotal: Decimal;
  amount: Decimal;
  code?: string;
  currency?: string;
  invoiceId: string;
  invoiceNo?: string;
  orders: InvoiceSourceOrder[];
}
/** 查看来源：发票关联的全部采购单（付款记录按它挂的发票查）。 */
export function getPurchaseInvoiceSources(id: string) {
  return requestClient.get<InvoiceSources>(
    `${procurementBase}/invoices/${encodeURIComponent(id)}/sources`,
  );
}
/** 付款发票详情：发票信息、来源采购单、这张发票的付款记录与已付 / 未付。 */
export function getPurchaseInvoiceDetail(id: string) {
  return requestClient.get<
    PurchaseInvoice & {
      payments: Array<Record<string, unknown>>;
      sourceAllocatedTotal: Decimal;
      sources: InvoiceSourceOrder[];
    }
  >(`${procurementBase}/invoices/${encodeURIComponent(id)}`);
}
/** 把发票挂到本采购单的某张付款记录下；paymentId 为空即取消关联。 */
export function assignInvoicePayment(
  id: string,
  data: { idempotencyKey: string; paymentId?: string },
) {
  return requestClient.post<PurchaseInvoice>(
    `${procurementBase}/invoices/${encodeURIComponent(id)}/payment`,
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

/** 结束采购单：未到货的余额全部取消，返回结束掉的行数。 */
export function endProcurementOrder(
  contractId: string,
  orderId: string,
  data: { idempotencyKey: string; reason: string },
) {
  return requestClient.post<number>(
    `${orderPath(contractId, orderId)}/end`,
    data,
  );
}
