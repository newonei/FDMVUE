import type {
  LegacyKind,
  LegacyRecord,
  LegacySummary,
} from '#/api/fdmplatform/legacy';

import { entityTarget } from '../documents/navigation';

export const legacyLabels: Record<LegacyKind, string> = {
  PRODUCT: '产品信息',
  CUSTOMER: '按客户汇总',
  SUPPLIER: '供应商资料',
  SUPPLIER_CONTACT: '供应商联系人',
  CONTRACT: '合同订单',
  PURCHASE_REQUEST: '采购申请单',
  PURCHASE_ORDER: '采购单',
  SHIPMENT: '发货单',
  STOCK_IN: '入库单',
  STOCK_OUT: '出库单',
  STOCKTAKE: '库存盘点',
  STOCK_BALANCE: '产品库存',
  RECEIPT: '回款记录',
  REFUND: '退款记录',
  SALES_INVOICE: '开票记录',
  PURCHASE_PAYMENT: '付款记录',
  PURCHASE_INVOICE: '付款发票',
};
export const allLegacyKinds = Object.keys(legacyLabels) as LegacyKind[];

export function legacyDocumentKinds(kind: string): LegacyKind[] {
  const mapping: Record<string, LegacyKind[]> = {
    requests: ['PURCHASE_REQUEST'],
    tasks: ['PURCHASE_REQUEST'],
    orders: ['PURCHASE_ORDER'],
    arrivals: ['STOCK_IN'],
    shipments: ['SHIPMENT', 'STOCK_OUT'],
    receipts: ['RECEIPT'],
    refunds: ['REFUND'],
    invoices: ['SALES_INVOICE'],
  };
  return mapping[kind] ?? [];
}

export function legacyWorkspaceKinds(workspace: string): LegacyKind[] {
  if (workspace === 'trade-contracts') return ['CONTRACT'];
  if (workspace === 'inventory-stock')
    return ['STOCK_BALANCE', 'STOCK_IN', 'STOCK_OUT', 'STOCKTAKE'];
  return [];
}

export function legacyCount(
  summary: LegacySummary | undefined,
  kinds: LegacyKind[],
) {
  let count = 0;
  for (const kind of kinds) count += summary?.counts[kind] ?? 0;
  return count;
}

const nativeReferenceKeys = [
  'contractId',
  'documentId',
  'financeId',
  'orderId',
  'poolId',
  'eventId',
  'productId',
  'customerId',
  'supplierId',
];

export function legacyModeQuery<T extends Record<string, unknown>>(
  query: T,
  mode: 'current' | 'legacy',
) {
  const next = { ...query, dataSource: mode };
  if (mode === 'legacy')
    for (const key of nativeReferenceKeys) Reflect.deleteProperty(next, key);
  return next;
}

export function legacyDefaultMode(
  query: Record<string, unknown>,
  count: number,
): 'current' | 'legacy' {
  // A native deep link must always reach the native drawer, even after visiting history.
  if (
    nativeReferenceKeys.some(
      (key) => typeof query[key] === 'string' && String(query[key]).trim(),
    )
  )
    return 'current';
  if (query.dataSource === 'current') return 'current';
  if (query.dataSource === 'legacy') return 'legacy';
  return count > 0 ? 'legacy' : 'current';
}

export function legacyText(value: unknown, empty = '未注明'): string {
  if (value === null || value === undefined || value === '') return empty;
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

export function legacyRecordName(record: LegacyRecord) {
  return (
    record.documentNo ||
    record.title ||
    record.externalId ||
    legacyLabels[record.kind]
  );
}

export function legacyAmount(record: LegacyRecord) {
  if (
    record.amount === null ||
    record.amount === undefined ||
    record.amount === ''
  )
    return '未注明';
  return `${legacyText(record.amount)} ${record.currency || '（币种未注明）'}`;
}

export function legacyNativeTarget(record: LegacyRecord) {
  const type = {
    PRODUCT: 'product',
    CUSTOMER: 'customer',
    SUPPLIER: 'supplier',
  } as const;
  return record.nativeType
    ? entityTarget(type[record.nativeType], record.nativeId)
    : undefined;
}

export function legacyDateError(from: string, to: string) {
  const valid = (value: string) => {
    if (!value) return true;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
    const date = new Date(`${value}T00:00:00Z`);
    return (
      !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value
    );
  };
  if (!valid(from) || !valid(to)) return '请选择有效的起止日期';
  return from && to && from > to ? '开始日期不能晚于结束日期' : '';
}
