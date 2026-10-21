import type { BusinessDocumentFile, MigrationInfo } from './business-documents';
import type { BusinessRecord, Decimal, PageResult } from './index';
import type { PurchaseInvoice } from './procurement';

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
  /** 发票付款：挂的付款发票及其摘要（sourceType=PURCHASE_INVOICE） */
  invoiceId?: string;
  invoice?: {
    amount: Decimal;
    code?: string;
    id: string;
    invoiceNo?: string;
    orderCount: number;
    status?: string;
    supplierName?: string;
  };
  currency: string;
  amount: Decimal;
  payerEntityId?: string;
  payerSnapshot?: { name?: string };
  expenseEntityId?: string;
  expenseEntitySnapshot?: { name?: string };
  approval?: {
    handlerUserId: number;
    openedAt: string;
    requesterUserId: number;
    round: number;
    status: string;
  };
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
  /** 付款记录：直接挂采购单时为 PURCHASE_ORDER，从付款发票增加付款时为 PURCHASE_INVOICE */
  sourceType?: string;
  paidAt?: string;
  payerAccount?: string;
  payeeName?: string;
  payeeAccount?: string;
  paymentMethod?: string;
  noInvoice?: boolean;
  batchNo?: string;
  remark?: string;
  /** 付款记录下属的付款发票 */
  invoices?: PurchaseInvoice[];
  invoicedAmount?: Decimal;
  invoiceState?: 'INVOICED' | 'NOT_REQUIRED' | 'PARTIAL' | 'PENDING';
}
/** 付款记录的内容（金智「付款记录」）：每付一笔钱登记一张，分期就是多张。 */
export interface OrderPaymentInput {
  contractId: string;
  orderId: string;
  amount: Decimal;
  paidAt: string;
  payerEntityId: string;
  payerAccount: string;
  paymentMethod?: string;
  payeeName: string;
  payeeAccount?: string;
  remark?: string;
  noInvoice?: boolean;
  batchNo?: string;
  name?: string;
}
const base = '/fdmplatform/v1/procurement-finance';
export function getProcurementFinancePage(params: {
  contractId?: string;
  keyword?: string;
  orderId?: string;
  pageNo: number;
  pageSize: number;
  paymentStatus?: 'PAID' | 'UNPAID';
  /** NATIVE 新系统单据 · JINZHI 金智迁入；不传看全部 */
  source?: 'JINZHI' | 'NATIVE';
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
/**
 * 登记付款记录：建单后直接确认，确认即计入已付。幂等键按调用方给的前缀区分，
 * 中途失败重试时已建好的单不会重复。
 */
export async function registerOrderPayment(
  input: OrderPaymentInput,
  key: string,
) {
  return registerPayment(
    {
      ...input,
      contractId: input.contractId || undefined,
      sourceType: 'PURCHASE_ORDER',
    },
    key,
  );
}
async function registerPayment(payload: Record<string, unknown>, key: string) {
  const draft = await createProcurementFinance({
    type: 'PAYMENT',
    idempotencyKey: `${key}:create`,
    payload,
  });
  if (draft.status === 'CANCELLED')
    throw new Error('上次登记未完成已取消，请重新提交');
  if (draft.status !== 'DRAFT') return draft;
  try {
    return await procurementFinanceAction(draft.id, {
      action: 'CONFIRM',
      expectedVersion: draft.version,
      idempotencyKey: `${key}:confirm`,
      payload: {},
    });
  } catch (error) {
    // 确认没过就把草稿取消，不在采购单下留半截付款；调用方换新键重试
    await procurementFinanceAction(draft.id, {
      action: 'CANCEL',
      expectedVersion: draft.version,
      idempotencyKey: `${key}:cancel`,
      payload: { reason: '登记付款未完成，自动取消草稿' },
    }).catch(() => undefined);
    throw error;
  }
}
/** 从付款发票「增加付款」：付款挂整张发票，不选采购单（来源采购单经发票查询）。 */
export interface InvoicePaymentInput extends Omit<
  OrderPaymentInput,
  'batchNo' | 'contractId' | 'orderId'
> {
  invoiceId: string;
}
/** 发票付款登记：同样建单后确认（登记确认流程不变），确认后计入发票已付。 */
export async function registerInvoicePayment(
  input: InvoicePaymentInput,
  key: string,
) {
  return registerPayment({ ...input, sourceType: 'PURCHASE_INVOICE' }, key);
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

/** 采购退款记录：付款单上登记的一笔退款 / 冲销。 */
export interface ProcurementRefund {
  id: string;
  paymentId: string;
  paymentCode?: string;
  contractId?: string;
  orderId?: string;
  orderCode?: string;
  supplierName?: string;
  payeeName?: string;
  currency?: string;
  amount: Decimal;
  rmbAmount?: Decimal;
  paymentAmount?: Decimal;
  paidAt?: string;
  occurredDate?: string;
  reason?: string;
  evidenceRef?: string;
  actorId?: number;
  createdAt?: string;
}
export function getProcurementRefunds(params: {
  contractId?: string;
  from?: string;
  keyword?: string;
  orderId?: string;
  pageNo: number;
  pageSize: number;
  to?: string;
}) {
  return requestClient.get<PageResult<ProcurementRefund>>(
    `${base}/refunds/page`,
    { params },
  );
}
