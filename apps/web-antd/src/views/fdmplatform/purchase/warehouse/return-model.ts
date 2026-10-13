import type {
  PurchaseReturnCreate,
  ReturnKind,
  StockIn,
  StockTxn,
} from '#/api/fdmplatform/warehouse';

import BigNumber from 'bignumber.js';

import { qty } from './model';

const decimal = (value: unknown) =>
  new BigNumber(
    typeof value === 'string' || typeof value === 'number' ? value : Number.NaN,
  );
const plain = (value: BigNumber) => value.toFixed(value.decimalPlaces() ?? 0);
const orZero = (value: unknown) => {
  const number = decimal(value ?? 0);
  return number.isFinite() ? number : new BigNumber(0);
};

/** 退货表的一行：一张入库单行的合格品或不合格品。 */
export interface ReturnRow {
  key: string;
  orderLineId: string;
  kind: ReturnKind;
  productName: string;
  specification: string;
  unit: string;
  /** 还能退的数量（入库数 − 已退） */
  available: string;
  quantity?: string;
}

/** 入库单还能退的行：合格品在前，有不合格品时另起一行；已全部退完的不列出。 */
export function returnRows(stockIn: StockIn): ReturnRow[] {
  const rows: ReturnRow[] = [];
  for (const line of stockIn.lines) {
    const base = {
      orderLineId: line.orderLineId,
      productName: line.productName || '产品未注明',
      specification: line.specification ?? '',
      unit: line.unit ?? '',
    };
    const accepted = orZero(line.acceptedQuantity).minus(
      orZero(line.returnedAcceptedQuantity),
    );
    const exception = orZero(line.exceptionQuantity).minus(
      orZero(line.returnedExceptionQuantity),
    );
    if (accepted.gt(0))
      rows.push({
        ...base,
        key: `${line.orderLineId}:ACCEPTED`,
        kind: 'ACCEPTED',
        available: plain(accepted),
      });
    if (exception.gt(0))
      rows.push({
        ...base,
        key: `${line.orderLineId}:EXCEPTION`,
        kind: 'EXCEPTION',
        available: plain(exception),
      });
  }
  return rows;
}

/** 入库单能否办理：未作废且还有可退数量。 */
export function canReturn(stockIn: StockIn) {
  return (
    stockIn.kind !== 'PRODUCTION' &&
    stockIn.status !== 'VOIDED' &&
    returnRows(stockIn).length > 0
  );
}

/** 入库单能否作废：未作废且没有办理过退货（直发的出库单会一起作废）。 */
export function canVoidStockIn(stockIn: StockIn) {
  return (
    stockIn.kind !== 'PRODUCTION' &&
    stockIn.status !== 'VOIDED' &&
    stockIn.lines.every(
      (line) =>
        orZero(line.returnedAcceptedQuantity).isZero() &&
        orZero(line.returnedExceptionQuantity).isZero(),
    )
  );
}

export function returnErrors(
  form: { reason?: string },
  rows: ReturnRow[],
): { lines: Record<string, string>; sheet: string } {
  const lines: Record<string, string> = {};
  for (const row of rows) {
    if ((row.quantity ?? '') === '') continue;
    const quantity = decimal(row.quantity);
    if (!quantity.gt(0)) lines[row.key] = '退货数须大于 0';
    else if (quantity.gt(decimal(row.available)))
      lines[row.key] = `最多可退 ${qty(row.available)}`;
  }
  let sheet = '';
  if (!rows.some((row) => decimal(row.quantity).gt(0)))
    sheet = '至少填写一行退货数量';
  else if (!form.reason?.trim()) sheet = '请填写退货原因';
  return { lines, sheet };
}

export function returnPayload(
  form: {
    noReplacement: boolean;
    reason?: string;
    remark?: string;
    returnedDate?: string;
  },
  rows: ReturnRow[],
  ids: { idempotencyKey: string; stockInId: string },
): PurchaseReturnCreate {
  return {
    ...ids,
    returnedDate: form.returnedDate || undefined,
    reason: form.reason?.trim() ?? '',
    noReplacement: form.noReplacement,
    remark: form.remark?.trim() || undefined,
    lines: rows
      .filter((row) => decimal(row.quantity).gt(0))
      .map((row) => ({
        orderLineId: row.orderLineId,
        kind: row.kind,
        quantity: row.quantity ?? '0',
      })),
  };
}

/**
 * 退货不再补货后，已付货款超过新的采购金额的部分；没有多付或金额未核实时为 undefined。
 * summary 是采购财务的采购单汇总（orderAmount / paidAmount）。
 */
export function overpaidAfterReturn(summary: {
  orderAmount?: unknown;
  paidAmount?: unknown;
}) {
  const paid = decimal(summary.paidAmount);
  const amount = decimal(summary.orderAmount);
  if (!paid.isFinite() || !amount.isFinite()) return undefined;
  const over = paid.minus(amount);
  return over.gt(0) ? plain(over) : undefined;
}

const ACTION_LABELS: Record<string, string> = {
  STOCK_IN: '采购入库',
  STOCK_OUT: '销售出库',
  VOID_STOCK_IN: '作废入库',
  VOID_STOCK_OUT: '作废出库',
  PURCHASE_RETURN: '采购退货',
};

/** 流水来源名称；早期流水没有 action，按入 / 出推断。 */
export function txnLabel(txn: Pick<StockTxn, 'action' | 'type'>) {
  return (
    (txn.action && ACTION_LABELS[txn.action]) ??
    (txn.type === 'IN' ? '采购入库' : '销售出库')
  );
}
