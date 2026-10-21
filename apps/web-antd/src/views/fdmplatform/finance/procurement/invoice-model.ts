import type {
  InvoicePaymentStatus,
  PurchaseInvoiceOrder,
} from '#/api/fdmplatform/procurement';

import BigNumber from 'bignumber.js';

/** 集中收票里的一张采购单：remaining 为未开票金额（采购金额 − 有效发票已关联），读不到时为空。 */
export interface InvoiceOrderLine {
  key: string;
  contractId: string;
  orderId: string;
  code: string;
  remaining?: string;
}

/** 付款状态（系统按有效付款记录计算，不能手改）。 */
export const invoicePaymentStates: Record<
  InvoicePaymentStatus,
  { color: string; label: string }
> = {
  UNPAID: { color: 'warning', label: '未付款' },
  PARTIAL: { color: 'processing', label: '部分付款' },
  PAID: { color: 'success', label: '已付清' },
};

/**
 * 按发票金额自动分配到各采购单：依次填满每张单的未开票金额，最后一张单可以只开一部分；
 * 未开票读不到的单不自动填。分不完的余额由采购员手动处理。
 */
export function allocateInvoice(
  amount: string | undefined,
  orders: InvoiceOrderLine[],
) {
  let rest = new BigNumber(amount ?? '');
  const result: Record<string, string | undefined> = {};
  for (const order of orders) {
    const limit = new BigNumber(order.remaining ?? '');
    if (!rest.isFinite() || !limit.isFinite() || !rest.gt(0) || !limit.gt(0)) {
      result[order.key] = undefined;
      continue;
    }
    const value = BigNumber.min(rest, limit);
    result[order.key] = value.toFixed(2);
    rest = rest.minus(value);
  }
  return result;
}

export function allocatedTotal(
  allocations: Record<string, string | undefined>,
) {
  let sum = new BigNumber(0);
  for (const value of Object.values(allocations)) {
    const amount = new BigNumber(value ?? '');
    if (amount.isFinite()) sum = sum.plus(amount);
  }
  return sum;
}

/**
 * 集中收票保存前的检查：至少一张单关联金额大于 0，每张单不超过未开票金额，
 * 关联合计等于发票金额（后端同样校验）。返回空串表示可以保存。
 */
export function allocationProblem(
  amount: string | undefined,
  allocations: Record<string, string | undefined>,
  orders: InvoiceOrderLine[],
) {
  const total = new BigNumber(amount ?? '');
  if (!total.isFinite() || !total.gt(0)) return '发票金额须大于 0';
  const positive = orders.filter((order) =>
    new BigNumber(allocations[order.key] ?? '').gt(0),
  );
  if (positive.length === 0) return '至少一张采购单的关联金额大于 0';
  for (const order of positive) {
    const value = new BigNumber(allocations[order.key]!);
    if (value.decimalPlaces()! > 2)
      return `${order.code} 的关联金额最多两位小数`;
    const limit = new BigNumber(order.remaining ?? '');
    if (limit.isFinite() && value.gt(limit))
      return `${order.code} 超额开票：剩余未开票 ${limit.toFormat(2)}`;
  }
  const sum = allocatedTotal(allocations);
  if (!sum.eq(total))
    return `各采购单关联合计 ${sum.toFormat(2)}，须等于发票金额 ${total.toFormat(2)}`;
  return '';
}

/** 提交给后端的关联：金额为 0 或空的单不关联。 */
export function allocationInputs(
  allocations: Record<string, string | undefined>,
  orders: InvoiceOrderLine[],
): PurchaseInvoiceOrder[] {
  return orders
    .filter((order) => new BigNumber(allocations[order.key] ?? '').gt(0))
    .map((order) => ({
      contractId: order.contractId,
      orderId: order.orderId,
      orderCode: order.code,
      amount: new BigNumber(allocations[order.key]!).toFixed(2),
    }));
}

/** 发票付款：本次付款默认带入剩余未付，超过剩余未付不能提交（后端同样校验）。 */
export function invoicePaymentLimit(unpaid: unknown) {
  const value = new BigNumber(String(unpaid ?? ''));
  return value.isFinite() ? BigNumber.max(value, 0) : undefined;
}
