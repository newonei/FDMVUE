import type { FdmWaimaoAttachmentApi } from '#/api/fdmwaimao/attachment';
import type { FdmWaimaoReceiptRecordApi } from '#/api/fdmwaimao/receipt-record';

import dayjs from 'dayjs';

import { canonicalDecimal, isPositiveDecimal } from './calculation';

export interface ReceiptFormModel {
  arrivalAmount: string;
  attachments: FdmWaimaoAttachmentApi.Attachment[];
  category: string;
  currency: string;
  foreignCurrencyRemark: string;
  id?: string;
  installmentLabel: string;
  invoiceStatus: FdmWaimaoReceiptRecordApi.InvoiceStatus;
  orderId?: string;
  payerName: string;
  paymentMethod: string;
  performanceAmountCny: string;
  performanceRemark: string;
  projectText: string;
  receiptDate?: string;
  receiptMethod: string;
  remark: string;
  status?: FdmWaimaoReceiptRecordApi.RecordStatus;
  version?: number;
}

export interface ConsumptionFormModel {
  amount: string;
  attachments: FdmWaimaoAttachmentApi.Attachment[];
  consumptionDate?: string;
  consumptionType: FdmWaimaoReceiptRecordApi.ConsumptionType;
  currency: string;
  id?: string;
  orderId?: string;
  reason: string;
  remark: string;
  status?: FdmWaimaoReceiptRecordApi.RecordStatus;
  version?: number;
}

function text(value: unknown) {
  if (value === null || value === undefined) return '';
  return String(value).trim();
}

function optionalText(value: unknown) {
  const normalized = text(value);
  return normalized || undefined;
}

export function normalizeRecordDate(value: unknown) {
  if (!value) return undefined;
  if (Array.isArray(value) && value.length === 3) {
    const [year, month, date] = value;
    if ([year, month, date].every((item) => typeof item === 'number')) {
      const normalized = `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(date).padStart(2, '0')}`;
      const parsed = dayjs(normalized);
      return parsed.isValid() && parsed.format('YYYY-MM-DD') === normalized
        ? normalized
        : undefined;
    }
  }
  if (dayjs.isDayjs(value)) {
    return value.isValid() ? value.format('YYYY-MM-DD') : undefined;
  }
  const normalized = text(value);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(normalized)) return undefined;
  const parsed = dayjs(normalized);
  return parsed.isValid() && parsed.format('YYYY-MM-DD') === normalized
    ? normalized
    : undefined;
}

export function normalizeRecordType(value: unknown) {
  return value === 'consumption' ? 'consumption' : 'receipt';
}

export function queryOrderId(value: unknown) {
  const candidate = Array.isArray(value) ? value[0] : value;
  return optionalText(candidate);
}

export function createEmptyReceiptForm(): ReceiptFormModel {
  return {
    arrivalAmount: '',
    attachments: [],
    category: '',
    currency: '',
    foreignCurrencyRemark: '',
    installmentLabel: '',
    invoiceStatus: 'NOT_INVOICED',
    payerName: '',
    paymentMethod: '',
    performanceAmountCny: '',
    performanceRemark: '',
    projectText: '',
    receiptDate: dayjs().format('YYYY-MM-DD'),
    receiptMethod: '',
    remark: '',
  };
}

export function createEmptyConsumptionForm(): ConsumptionFormModel {
  return {
    amount: '',
    attachments: [],
    consumptionDate: dayjs().format('YYYY-MM-DD'),
    consumptionType: 'CUSTOMER_BALANCE',
    currency: '',
    reason: '',
    remark: '',
  };
}

export function hydrateReceiptForm(
  record: FdmWaimaoReceiptRecordApi.ReceiptRecord,
): ReceiptFormModel {
  return {
    arrivalAmount: record.arrivalAmount,
    attachments: Array.isArray(record.attachments) ? record.attachments : [],
    category: record.category ?? '',
    currency: record.currency,
    foreignCurrencyRemark: record.foreignCurrencyRemark ?? '',
    id: record.id,
    installmentLabel: record.installmentLabel ?? '',
    invoiceStatus: record.invoiceStatus,
    orderId: record.orderId,
    payerName: record.payerName ?? '',
    paymentMethod: record.paymentMethod ?? '',
    performanceAmountCny: record.performanceAmountCny ?? '',
    performanceRemark: record.performanceRemark ?? '',
    projectText: record.projectText ?? '',
    receiptDate: normalizeRecordDate(record.receiptDate),
    receiptMethod: record.receiptMethod,
    remark: record.remark ?? '',
    status: record.status,
    version: record.version,
  };
}

export function hydrateConsumptionForm(
  record: FdmWaimaoReceiptRecordApi.ConsumptionRecord,
): ConsumptionFormModel {
  return {
    amount: record.amount,
    attachments: Array.isArray(record.attachments) ? record.attachments : [],
    consumptionDate: normalizeRecordDate(record.consumptionDate),
    consumptionType: record.consumptionType,
    currency: record.currency,
    id: record.id,
    orderId: record.orderId,
    reason: record.reason,
    remark: record.remark ?? '',
    status: record.status,
    version: record.version,
  };
}

export function validateReceiptForm(model: ReceiptFormModel) {
  const issues: string[] = [];
  if (!text(model.orderId)) issues.push('合同订单不能为空');
  if (!normalizeRecordDate(model.receiptDate))
    issues.push('回款日期不能为空或格式无效');
  if (!text(model.receiptMethod)) issues.push('到款方式不能为空');
  if (!text(model.currency)) issues.push('币种不能为空');
  if (!isPositiveDecimal(model.arrivalAmount))
    issues.push('到款金额必须大于 0');
  if (
    normalizeRecordDate(model.receiptDate) &&
    dayjs(model.receiptDate).isAfter(dayjs(), 'day')
  ) {
    issues.push('回款日期不能晚于今天');
  }
  return issues;
}

export function validateConsumptionForm(model: ConsumptionFormModel) {
  const issues: string[] = [];
  if (!text(model.orderId)) issues.push('合同订单不能为空');
  if (!normalizeRecordDate(model.consumptionDate))
    issues.push('消费日期不能为空或格式无效');
  if (!text(model.currency)) issues.push('币种不能为空');
  if (!isPositiveDecimal(model.amount)) issues.push('消费金额必须大于 0');
  if (!text(model.reason)) issues.push('消费原因不能为空');
  if (
    normalizeRecordDate(model.consumptionDate) &&
    dayjs(model.consumptionDate).isAfter(dayjs(), 'day')
  ) {
    issues.push('消费日期不能晚于今天');
  }
  return issues;
}

function buildReceiptCorePayload(
  model: ReceiptFormModel,
  confirmPotentialDuplicate = false,
): Omit<FdmWaimaoReceiptRecordApi.ReceiptSaveReq, 'attachmentIds'> {
  return {
    arrivalAmount: canonicalDecimal(model.arrivalAmount),
    category: optionalText(model.category),
    confirmPotentialDuplicate,
    currency: text(model.currency).toUpperCase(),
    foreignCurrencyRemark: optionalText(model.foreignCurrencyRemark),
    installmentLabel: optionalText(model.installmentLabel),
    invoiceStatus: model.invoiceStatus,
    orderId: text(model.orderId),
    payerName: optionalText(model.payerName),
    paymentMethod: optionalText(model.paymentMethod),
    performanceAmountCny: text(model.performanceAmountCny)
      ? canonicalDecimal(model.performanceAmountCny)
      : undefined,
    performanceRemark: optionalText(model.performanceRemark),
    projectText: optionalText(model.projectText),
    receiptDate: normalizeRecordDate(model.receiptDate) ?? '',
    receiptMethod: text(model.receiptMethod),
    remark: optionalText(model.remark),
  };
}

export function buildReceiptSavePayload(
  model: ReceiptFormModel,
  confirmPotentialDuplicate = false,
): FdmWaimaoReceiptRecordApi.ReceiptSaveReq {
  return {
    ...buildReceiptCorePayload(model, confirmPotentialDuplicate),
    attachmentIds: model.attachments.map((attachment) => attachment.id),
  };
}

export function buildReceiptUpdatePayload(
  model: ReceiptFormModel,
  confirmPotentialDuplicate = false,
): FdmWaimaoReceiptRecordApi.ReceiptUpdateReq {
  if (!model.id || model.version === undefined) {
    throw new Error('编辑回款记录缺少 id 或 expectedVersion');
  }
  return {
    ...buildReceiptCorePayload(model, confirmPotentialDuplicate),
    expectedVersion: model.version,
    id: text(model.id),
  };
}

export function buildReceiptPreviewPayload(
  model: ReceiptFormModel,
): FdmWaimaoReceiptRecordApi.ReceiptPreviewReq {
  return {
    arrivalAmount: canonicalDecimal(model.arrivalAmount),
    currency: text(model.currency).toUpperCase(),
    id: optionalText(model.id),
    orderId: text(model.orderId),
    receiptDate: normalizeRecordDate(model.receiptDate) ?? '',
  };
}

function buildConsumptionCorePayload(
  model: ConsumptionFormModel,
): Omit<FdmWaimaoReceiptRecordApi.ConsumptionSaveReq, 'attachmentIds'> {
  return {
    amount: canonicalDecimal(model.amount),
    consumptionDate: normalizeRecordDate(model.consumptionDate) ?? '',
    consumptionType: model.consumptionType,
    currency: text(model.currency).toUpperCase(),
    orderId: text(model.orderId),
    reason: text(model.reason),
    remark: optionalText(model.remark),
  };
}

export function buildConsumptionSavePayload(
  model: ConsumptionFormModel,
): FdmWaimaoReceiptRecordApi.ConsumptionSaveReq {
  return {
    ...buildConsumptionCorePayload(model),
    attachmentIds: model.attachments.map((attachment) => attachment.id),
  };
}

export function buildConsumptionUpdatePayload(
  model: ConsumptionFormModel,
): FdmWaimaoReceiptRecordApi.ConsumptionUpdateReq {
  if (!model.id || model.version === undefined) {
    throw new Error('编辑消费记录缺少 id 或 expectedVersion');
  }
  return {
    ...buildConsumptionCorePayload(model),
    expectedVersion: model.version,
    id: text(model.id),
  };
}

export function buildConsumptionPreviewPayload(
  model: ConsumptionFormModel,
): FdmWaimaoReceiptRecordApi.ConsumptionPreviewReq {
  return {
    amount: canonicalDecimal(model.amount),
    consumptionDate: normalizeRecordDate(model.consumptionDate) ?? '',
    currency: text(model.currency).toUpperCase(),
    id: optionalText(model.id),
    orderId: text(model.orderId),
  };
}
