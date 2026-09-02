import type { PageParam, PageResult } from '@vben/request';

import { requestClient } from '#/api/request';

export namespace FdmWaimaoReceiptRecordApi {
  export type DateTimeValue = number | string;
  export type DecimalValue = string;
  export type InvoiceStatus = 'INVOICED' | 'NOT_INVOICED' | 'NOT_REQUIRED';
  export type RecordStatus = 'ACTIVE' | 'VOIDED';
  export type RecordType = 'consumption' | 'receipt';

  export interface BaseRecord {
    allocatedContractAmount: DecimalValue;
    companyId: string;
    companyName: string;
    contractCurrency: string;
    contractCurrencyToCnyRate: DecimalValue;
    createTime?: DateTimeValue | null;
    currency: string;
    currencyToCnyRate: DecimalValue;
    customerId: string;
    customerName: string;
    id: string;
    orderId: string;
    orderNo: string;
    orderSubject: string;
    ownerDeptId?: null | string;
    ownerDeptName?: null | string;
    ownerUserId?: null | string;
    ownerUserName?: null | string;
    rateDate: string;
    rateFallbackUsed: boolean;
    rateRetrievedAt?: DateTimeValue | null;
    rateSource: string;
    remark?: null | string;
    status: RecordStatus;
    updateTime?: DateTimeValue | null;
    version: number;
    voidedAt?: DateTimeValue | null;
    voidedBy?: null | string;
    voidReason?: null | string;
  }

  export interface ReceiptRecord extends BaseRecord {
    category?: null | string;
    arrivalAmount: DecimalValue;
    foreignCurrencyRemark?: null | string;
    installmentLabel?: null | string;
    invoiceStatus: InvoiceStatus;
    payerName?: null | string;
    paymentMethod?: null | string;
    performanceAmountCny?: DecimalValue | null;
    performanceRemark?: null | string;
    projectText?: null | string;
    receiptDate: string;
    receiptAmountCny: DecimalValue;
    receiptMethod: string;
    receiptNo: string;
  }

  export type ConsumptionType = 'CUSTOMER_BALANCE' | 'OTHER' | 'WAIVER';

  export interface ConsumptionRecord extends BaseRecord {
    amount: DecimalValue;
    amountCny: DecimalValue;
    consumptionDate: string;
    consumptionNo: string;
    consumptionType: ConsumptionType;
    reason: string;
  }

  export interface PageReq extends PageParam {
    currency?: string;
    consumptionType?: ConsumptionType;
    customerId?: string;
    keyword?: string;
    orderId?: string;
    ownerUserId?: string;
    status?: RecordStatus;
  }

  export interface ReceiptPageReq extends PageReq {
    receiptDate?: [string, string];
  }

  export interface ConsumptionPageReq extends PageReq {
    consumptionDate?: [string, string];
  }

  export interface ReceiptSaveReq {
    category?: string;
    arrivalAmount: DecimalValue;
    confirmPotentialDuplicate: boolean;
    currency: string;
    foreignCurrencyRemark?: string;
    installmentLabel?: string;
    invoiceStatus: InvoiceStatus;
    orderId: string;
    payerName?: string;
    paymentMethod?: string;
    performanceAmountCny?: DecimalValue;
    performanceRemark?: string;
    projectText?: string;
    receiptDate: string;
    receiptMethod: string;
    remark?: string;
  }

  export interface ReceiptUpdateReq extends ReceiptSaveReq {
    expectedVersion: number;
    id: string;
  }

  export interface ConsumptionSaveReq {
    amount: DecimalValue;
    consumptionDate: string;
    currency: string;
    consumptionType: ConsumptionType;
    orderId: string;
    reason: string;
    remark?: string;
  }

  export interface ConsumptionUpdateReq extends ConsumptionSaveReq {
    expectedVersion: number;
    id: string;
  }

  export interface ReceiptPreviewReq {
    currency: string;
    id?: string;
    orderId: string;
    receiptDate: string;
    arrivalAmount: DecimalValue;
  }

  export interface ConsumptionPreviewReq {
    amount: DecimalValue;
    consumptionDate: string;
    currency: string;
    id?: string;
    orderId: string;
  }

  export interface AmountPreview {
    afterCashReceivedAmount: DecimalValue;
    afterConsumptionAmount: DecimalValue;
    afterOutstandingAmount: DecimalValue;
    afterOverpaidAmount: DecimalValue;
    afterReceivedAmount: DecimalValue;
    allocatedContractAmount: DecimalValue;
    amount: DecimalValue;
    amountCny: DecimalValue;
    cashReceivedAmount: DecimalValue;
    consumptionAmount: DecimalValue;
    contractCurrency: string;
    contractRate: DecimalValue;
    contractTotalAmount: DecimalValue;
    currency: string;
    fallback: boolean;
    outstandingAmount: DecimalValue;
    overpaidAmount: DecimalValue;
    rate: DecimalValue;
    rateDate: string;
    receivedAmount: DecimalValue;
    requestedDate: string;
    source: string;
    willSettle: boolean;
  }

  export interface VoidReq {
    expectedVersion: number;
    id: string;
    reason: string;
  }
}

const RECEIPT_BASE_URL = '/fdmwaimao/receipt-record';
const CONSUMPTION_BASE_URL = '/fdmwaimao/consumption-record';

export const RECEIPT_RECORD_DUPLICATE_CONFIRM_REQUIRED = 1_206_004_010;

interface RequestFailure {
  data?: { code?: number | string; msg?: string };
  response?: { data?: { code?: number | string; msg?: string } };
}

export function getReceiptRecordBusinessErrorCode(error: unknown) {
  const failure = error as RequestFailure;
  return failure.data?.code ?? failure.response?.data?.code;
}

export function isReceiptRecordDuplicateConfirmationError(error: unknown) {
  return (
    Number(getReceiptRecordBusinessErrorCode(error)) ===
    RECEIPT_RECORD_DUPLICATE_CONFIRM_REQUIRED
  );
}

export function getReceiptRecordPage(
  params: FdmWaimaoReceiptRecordApi.ReceiptPageReq,
) {
  return requestClient.get<PageResult<FdmWaimaoReceiptRecordApi.ReceiptRecord>>(
    `${RECEIPT_BASE_URL}/page`,
    { params },
  );
}

export function getReceiptRecord(id: string) {
  return requestClient.get<FdmWaimaoReceiptRecordApi.ReceiptRecord>(
    `${RECEIPT_BASE_URL}/get`,
    { params: { id } },
  );
}

export function previewReceiptAmount(
  data: FdmWaimaoReceiptRecordApi.ReceiptPreviewReq,
) {
  return requestClient.post<FdmWaimaoReceiptRecordApi.AmountPreview>(
    `${RECEIPT_BASE_URL}/amount-preview`,
    data,
    { silent: true },
  );
}

export function createReceiptRecord(
  data: FdmWaimaoReceiptRecordApi.ReceiptSaveReq,
) {
  const payload: FdmWaimaoReceiptRecordApi.ReceiptSaveReq = {
    arrivalAmount: data.arrivalAmount,
    category: data.category,
    confirmPotentialDuplicate: data.confirmPotentialDuplicate,
    currency: data.currency,
    foreignCurrencyRemark: data.foreignCurrencyRemark,
    installmentLabel: data.installmentLabel,
    invoiceStatus: data.invoiceStatus,
    orderId: data.orderId,
    payerName: data.payerName,
    paymentMethod: data.paymentMethod,
    performanceAmountCny: data.performanceAmountCny,
    performanceRemark: data.performanceRemark,
    projectText: data.projectText,
    receiptDate: data.receiptDate,
    receiptMethod: data.receiptMethod,
    remark: data.remark,
  };
  return requestClient.post<string>(`${RECEIPT_BASE_URL}/create`, payload);
}

export function updateReceiptRecord(
  data: FdmWaimaoReceiptRecordApi.ReceiptUpdateReq,
) {
  const payload: FdmWaimaoReceiptRecordApi.ReceiptUpdateReq = {
    arrivalAmount: data.arrivalAmount,
    category: data.category,
    confirmPotentialDuplicate: data.confirmPotentialDuplicate,
    currency: data.currency,
    expectedVersion: data.expectedVersion,
    foreignCurrencyRemark: data.foreignCurrencyRemark,
    id: data.id,
    installmentLabel: data.installmentLabel,
    invoiceStatus: data.invoiceStatus,
    orderId: data.orderId,
    payerName: data.payerName,
    paymentMethod: data.paymentMethod,
    performanceAmountCny: data.performanceAmountCny,
    performanceRemark: data.performanceRemark,
    projectText: data.projectText,
    receiptDate: data.receiptDate,
    receiptMethod: data.receiptMethod,
    remark: data.remark,
  };
  return requestClient.put<boolean>(`${RECEIPT_BASE_URL}/update`, payload);
}

export function voidReceiptRecord(data: FdmWaimaoReceiptRecordApi.VoidReq) {
  return requestClient.put<boolean>(`${RECEIPT_BASE_URL}/void`, data);
}

export function getConsumptionRecordPage(
  params: FdmWaimaoReceiptRecordApi.ConsumptionPageReq,
) {
  return requestClient.get<
    PageResult<FdmWaimaoReceiptRecordApi.ConsumptionRecord>
  >(`${CONSUMPTION_BASE_URL}/page`, { params });
}

export function getConsumptionRecord(id: string) {
  return requestClient.get<FdmWaimaoReceiptRecordApi.ConsumptionRecord>(
    `${CONSUMPTION_BASE_URL}/get`,
    { params: { id } },
  );
}

export function previewConsumptionAmount(
  data: FdmWaimaoReceiptRecordApi.ConsumptionPreviewReq,
) {
  return requestClient.post<FdmWaimaoReceiptRecordApi.AmountPreview>(
    `${CONSUMPTION_BASE_URL}/amount-preview`,
    data,
    { silent: true },
  );
}

export function createConsumptionRecord(
  data: FdmWaimaoReceiptRecordApi.ConsumptionSaveReq,
) {
  return requestClient.post<string>(`${CONSUMPTION_BASE_URL}/create`, data);
}

export function updateConsumptionRecord(
  data: FdmWaimaoReceiptRecordApi.ConsumptionUpdateReq,
) {
  return requestClient.put<boolean>(`${CONSUMPTION_BASE_URL}/update`, data);
}

export function voidConsumptionRecord(data: FdmWaimaoReceiptRecordApi.VoidReq) {
  return requestClient.put<boolean>(`${CONSUMPTION_BASE_URL}/void`, data);
}
