import type { DocumentKind } from '../documents/model';
import type { RelatedTarget } from '../documents/navigation';

import type {
  ProductActivityRecord,
  ProductActivityType,
} from '#/api/fdmplatform/product-activity';

import BigNumber from 'bignumber.js';

import { label } from '../data';
import { businessRecordTarget, referenceId } from '../documents/navigation';

export const activityTypes: { label: string; value: ProductActivityType }[] = [
  { value: 'ALL', label: '业务动态' },
  { value: 'CONTRACT', label: '合同订单' },
  { value: 'PURCHASE_REQUEST', label: '采购申请' },
  { value: 'PURCHASE_ORDER', label: '采购单' },
  { value: 'QUOTE', label: '供应商报价' },
  { value: 'SHIPMENT', label: '发货单' },
  { value: 'ARRIVAL', label: '到货单' },
  { value: 'PURCHASE_RETURN', label: '采购退货' },
  { value: 'SALES_RETURN', label: '销售退货' },
  { value: 'PRODUCTION_PROGRESS', label: '生产进度' },
  { value: 'STOCK_EVENT', label: '库存流水' },
  { value: 'ASSIGNMENT', label: '履约任务' },
  { value: 'PURCHASE_PLAN', label: '采购方案' },
  { value: 'CUSTOMS', label: '报关跟进' },
  { value: 'STOCK_IN', label: '入库单' },
  { value: 'STOCK_OUT', label: '出库单' },
  { value: 'STOCKTAKE', label: '库存盘点' },
  { value: 'RECEIPT', label: '回款记录' },
  { value: 'REFUND', label: '退款记录' },
  { value: 'SALES_INVOICE', label: '开票记录' },
  { value: 'PURCHASE_INVOICE', label: '采购发票' },
  { value: 'PURCHASE_PAYMENT', label: '采购付款' },
];

const documentKinds: Partial<Record<ProductActivityType, DocumentKind>> = {
  PURCHASE_REQUEST: 'requests',
  ASSIGNMENT: 'tasks',
  QUOTE: 'quotes',
  PURCHASE_PLAN: 'plans',
  PURCHASE_ORDER: 'orders',
  ARRIVAL: 'arrivals',
  PURCHASE_RETURN: 'purchaseReturns',
  PRODUCTION_PROGRESS: 'production',
  SHIPMENT: 'shipments',
  SALES_RETURN: 'salesReturns',
  RECEIPT: 'receipts',
  REFUND: 'refunds',
  SALES_INVOICE: 'invoices',
};

export function activityLabel(type: ProductActivityType) {
  return activityTypes.find((entry) => entry.value === type)?.label ?? type;
}

export function activityName(record: ProductActivityRecord) {
  if (record.name)
    return record.type === 'STOCK_EVENT' ? label(record.name) : record.name;
  if (record.type === 'CONTRACT' && record.contractCode)
    return record.contractCode;
  return `${record.supplierName ? `${record.supplierName} · ` : ''}${activityLabel(record.type)} · ${record.documentId.slice(0, 8)}`;
}

export function activityTarget(
  record: ProductActivityRecord,
): RelatedTarget | undefined {
  if (record.standaloneId)
    return businessRecordTarget(
      record.recordType ?? record.type,
      record.standaloneId,
    );
  if (record.financeDocumentId) {
    const id = referenceId(record.financeDocumentId);
    return id ? { type: 'procurementFinance', id } : undefined;
  }
  if (record.type === 'STOCK_EVENT') {
    return record.poolId && record.eventId
      ? { type: 'stock', poolId: record.poolId, eventId: record.eventId }
      : undefined;
  }
  if (!record.contractId) return undefined;
  if (record.type === 'CONTRACT')
    return { type: 'contract', contractId: record.contractId };
  if (!record.documentId) return undefined;
  if (record.type === 'CUSTOMS') {
    return {
      type: 'customs',
      contractId: record.contractId,
      documentId: record.documentId,
    };
  }
  const kind = documentKinds[record.type];
  return kind
    ? {
        type: 'document',
        kind,
        contractId: record.contractId,
        documentId: record.documentId,
      }
    : undefined;
}

export function activityAmount(record: ProductActivityRecord) {
  if (record.amountBasis === 'DOCUMENT_TOTAL_NOT_ALLOCATED')
    return `整单付款 ${quantityText(record.documentAmount)} ${record.documentCurrency || '（币种未注明）'}，未分摊至产品`;
  return (
    record.amounts
      .map(
        (value) =>
          `${quantityText(value.amount)} ${value.currency || '（币种未注明）'}`,
      )
      .join(' / ') || '—'
  );
}

export function quantityText(value: unknown, unit?: null | string) {
  if (value === null || value === undefined || value === '') return '—';
  if (typeof value !== 'number' && typeof value !== 'string') return '—';
  const amount = new BigNumber(value);
  if (!amount.isFinite()) return '—';
  return `${amount.toFormat()}${unit ? ` ${unit}` : ''}`;
}

export function activityQuantity(record: ProductActivityRecord) {
  return (
    record.quantities
      .map((item) => quantityText(item.quantity, item.unit || '（单位未记录）'))
      .filter((value) => value !== '—')
      .join(' / ') || '—'
  );
}

export function activityDate(record: ProductActivityRecord) {
  const value = record.occurredAt || record.businessDate;
  if (!value) return '时间未记录';
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return '时间未记录';
  return parsed.toLocaleString('zh-CN', { hour12: false });
}

export function dateRangeError(fromDate: string, toDate: string) {
  return fromDate && toDate && fromDate > toDate
    ? '开始日期不能晚于结束日期'
    : '';
}
