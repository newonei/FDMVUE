import type { ProcurementOrderRow } from '#/api/fdmplatform/procurement';

import BigNumber from 'bignumber.js';

import { purchaseRowLabels } from './model';

/** 列表批量操作的一张采购单：独立采购单 contractId 为空。 */
export interface BatchOrder {
  key: string;
  contractId: string;
  orderId: string;
  code: string;
  supplierId?: string;
  supplierName: string;
  currency: string;
  unpaid: string;
  /** 采购金额，读不到时为空 */
  orderAmount?: string;
  /** 未开票金额（采购金额 − 有效发票合计），读不到时为空 */
  uninvoiced?: string;
  noInvoice?: boolean;
  ended: boolean;
}

/** 金智迁入的历史单（补齐页）不参与批量操作。 */
export function batchSelectable(row: ProcurementOrderRow) {
  return !row.standaloneId || row.nativeStandalone === true;
}

export function batchOrders(rows: ProcurementOrderRow[]): BatchOrder[] {
  return rows
    .filter((row) => batchSelectable(row))
    .map((row) => {
      const labels = purchaseRowLabels(row);
      return {
        key: String(row.standaloneId ?? row.id),
        contractId: row.standaloneId ? '' : String(row.contractId ?? ''),
        orderId: String(row.standaloneId ?? row.id),
        code: labels.order,
        supplierId: labels.supplierId,
        supplierName: labels.supplier,
        currency: String(row.record?.currency ?? 'CNY'),
        unpaid: String(row.unpaidAmount ?? '0'),
        orderAmount:
          row.orderAmount === undefined || row.orderAmount === null
            ? undefined
            : String(row.orderAmount),
        uninvoiced: uninvoiced(row),
        noInvoice: row.noInvoice === true,
        ended: row.operationStatus === 'ENDED',
      };
    });
}

function uninvoiced(row: ProcurementOrderRow) {
  const amount = new BigNumber(String(row.orderAmount ?? ''));
  if (!amount.isFinite()) return undefined;
  return BigNumber.max(
    amount.minus(String(row.invoicedAmount ?? 0)),
    0,
  ).toFixed(2);
}

/**
 * 集中付款、集中收票、转入库要求同一供应商、同一币种（一张付款 / 发票对应一个供应商）；结束不限制。
 * 返回不能一起办的原因，空串表示可以。
 */
export function batchProblem(
  orders: BatchOrder[],
  mode: 'end' | 'invoice' | 'payment' | 'stockIn',
) {
  if (orders.length === 0) return '请先勾选采购单';
  const active = orders.filter((order) => !order.ended);
  if (active.length === 0) return '选中的采购单都已结束';
  if (mode === 'end') return '';
  if (new Set(active.map((order) => order.supplierId)).size > 1)
    return '一次只能办理同一家供应商的采购单';
  if (new Set(active.map((order) => order.currency)).size > 1)
    return '选中的采购单币种不同，请分开办理';
  if (
    mode === 'payment' &&
    !active.some((order) => new BigNumber(order.unpaid).gt(0))
  )
    return '选中的采购单都已付清';
  if (
    mode === 'invoice' &&
    !active.some(
      (order) =>
        !order.noInvoice &&
        (order.uninvoiced === undefined ||
          new BigNumber(order.uninvoiced).gt(0)),
    )
  )
    return '选中的采购单发票都已收齐';
  return '';
}

/** 集中收票的采购单：结束的、无需收票的、发票已收齐的不参与。 */
export function batchInvoiceLines(orders: BatchOrder[]) {
  return orders
    .filter(
      (order) =>
        !order.ended &&
        !order.noInvoice &&
        (order.uninvoiced === undefined ||
          new BigNumber(order.uninvoiced).gt(0)),
    )
    .map((order) => ({
      key: order.key,
      contractId: order.contractId,
      orderId: order.orderId,
      code: order.code,
      remaining: order.uninvoiced,
    }));
}

export interface BatchPaymentForm {
  paidAt?: string;
  payerEntityId?: string;
  payerAccount?: string;
  paymentMethod?: string;
  payeeName?: string;
  payeeAccount?: string;
  remark?: string;
}

export function batchPaymentProblem(
  form: BatchPaymentForm,
  amounts: Record<string, string | undefined>,
  available: Record<string, string | undefined>,
  today: string,
) {
  if (!form.paidAt) return '请选择付款日期';
  if (form.paidAt > today) return '付款日期不能晚于今天';
  if (!form.payerEntityId) return '请选择所属公司（付款公司）';
  if (!form.payerAccount?.trim()) return '请填写付款方式（付款账户）';
  if (!form.payeeName?.trim()) return '请填写收款方';
  const positive = Object.entries(amounts).filter(([, value]) =>
    new BigNumber(value ?? '').gt(0),
  );
  if (positive.length === 0) return '至少一张采购单的本次付款金额大于 0';
  for (const [key, value] of positive) {
    const limit = new BigNumber(available[key] ?? '');
    if (limit.isFinite() && new BigNumber(value!).gt(limit))
      return `有采购单的本次付款超过未付金额（最多 ${limit.toFormat(2)}）`;
  }
  return '';
}

/** 集中付款批号：同一次转账生成的各张付款记录共用，方便对银行流水。 */
export function batchPaymentNo(today: string) {
  return `JZFK-${today.replaceAll('-', '')}-${crypto.randomUUID().slice(0, 4).toUpperCase()}`;
}

/**
 * 集中付款（金智「集中付款」）：一次转账付多张采购单，每张采购单各登记一张付款记录，
 * 共用付款日期、付款公司、收款方和批号；金额为 0 或空的跳过。
 */
export function batchPaymentInputs(
  orders: BatchOrder[],
  amounts: Record<string, string | undefined>,
  form: BatchPaymentForm,
  batchNo: string,
) {
  return orders
    .filter(
      (order) => !order.ended && new BigNumber(amounts[order.key] ?? '').gt(0),
    )
    .map((order) => ({
      order,
      input: {
        contractId: order.contractId,
        orderId: order.orderId,
        name: `${order.code} 付款`,
        amount: amounts[order.key]!,
        paidAt: form.paidAt!,
        payerEntityId: form.payerEntityId!,
        payerAccount: form.payerAccount!.trim(),
        paymentMethod: form.paymentMethod?.trim() || undefined,
        payeeName: form.payeeName!.trim(),
        payeeAccount: form.payeeAccount?.trim() || undefined,
        remark: form.remark?.trim() || undefined,
        batchNo,
      },
    }));
}

/** 集中收票里已经付过款（未付少于采购金额）的单号，用来提醒别从发票重复付。 */
export function batchPrepaidCodes(orders: BatchOrder[]) {
  const keys = new Set(batchInvoiceLines(orders).map((line) => line.key));
  return orders
    .filter((order) => {
      if (!keys.has(order.key)) return false;
      const amount = new BigNumber(order.orderAmount ?? '');
      return amount.isFinite() && new BigNumber(order.unpaid).lt(amount);
    })
    .map((order) => order.code);
}
