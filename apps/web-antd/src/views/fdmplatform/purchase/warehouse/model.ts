import type { ProcurementSetting } from '#/api/fdmplatform/procurement';
import type {
  InboundLine,
  OutboundItem,
  StockInCreate,
  StockOutCreate,
} from '#/api/fdmplatform/warehouse';

import BigNumber from 'bignumber.js';

const plain = (value: BigNumber) => value.toFixed(value.decimalPlaces() ?? 0);
const decimal = (value: unknown) =>
  new BigNumber(
    typeof value === 'string' || typeof value === 'number' ? value : Number.NaN,
  );

/** 「1,200」 for display; unknown values show a dash. */
export function qty(value: unknown) {
  const number = decimal(value);
  return number.isFinite() ? number.toFormat() : '—';
}

export function money(value: unknown, currency = 'CNY') {
  const number = decimal(value);
  return number.isFinite() ? `${currency} ${number.toFormat(2)}` : '—';
}

/** Average cost per unit of a balance, or undefined when unknown or empty. */
export function averageCost(stock: {
  costAmount: unknown;
  costKnown: boolean;
  onHand: unknown;
}) {
  const onHand = decimal(stock.onHand);
  if (!stock.costKnown || !onHand.gt(0)) return undefined;
  return decimal(stock.costAmount).div(onHand).decimalPlaces(4).toFormat();
}

/** The default active warehouse, else the only active one. */
export function defaultWarehouse(warehouses: ProcurementSetting[]) {
  const active = warehouses.filter((entry) => entry.active);
  return (
    active.find((entry) => entry.isDefault)?.id ??
    (active.length === 1 ? active[0]?.id : undefined)
  );
}

export interface InRow {
  /** 同一采购行可拆到多个仓库，key 区分拆出来的行 */
  key: string;
  orderLineId: string;
  /** 空表示用表头的入库仓库 */
  warehouseId?: string;
  split?: boolean;
  productName: string;
  specification: string;
  unit: string;
  remaining: string;
  quantity?: string;
  acceptedQuantity?: string;
  exceptionReason?: string;
  batchNo?: string;
}

/** Every open order line prefilled with its remaining quantity, all accepted. */
export function inboundRows(lines: InboundLine[]): InRow[] {
  return lines.map((line) => ({
    key: line.orderLineId,
    orderLineId: line.orderLineId,
    productName: line.productName || '产品未注明',
    specification: line.specification ?? '',
    unit: line.unit ?? '',
    remaining: String(line.remainingQuantity),
    quantity: String(line.remainingQuantity),
    acceptedQuantity: String(line.remainingQuantity),
  }));
}

let splitSequence = 0;
/** 分到其他仓：同一采购行再加一行，数量留空待填，仓库另选。 */
export function splitInRow(rows: InRow[], source: InRow): InRow[] {
  splitSequence += 1;
  const copy: InRow = {
    ...source,
    key: `${source.orderLineId}:split-${splitSequence}`,
    split: true,
    warehouseId: undefined,
    quantity: undefined,
    acceptedQuantity: undefined,
    exceptionReason: undefined,
    batchNo: undefined,
  };
  const index = rows.findLastIndex(
    (row) => row.orderLineId === source.orderLineId,
  );
  return [...rows.slice(0, index + 1), copy, ...rows.slice(index + 1)];
}

/** Rows with a received quantity are submitted; the rest stay open. */
export function filledInRows(rows: InRow[]) {
  return rows.filter((row) => decimal(row.quantity).gt(0));
}

export function stockInErrors(
  form: { warehouseId?: string },
  rows: InRow[],
): { lines: Record<string, string>; sheet: string } {
  const lines: Record<string, string> = {};
  const used = new Map<string, BigNumber>();
  for (const row of filledInRows(rows))
    used.set(
      row.orderLineId,
      (used.get(row.orderLineId) ?? new BigNumber(0)).plus(
        decimal(row.quantity),
      ),
    );
  for (const row of rows) {
    const quantity = decimal(row.quantity);
    const accepted = decimal(row.acceptedQuantity);
    if ((row.quantity ?? '') === '') continue;
    if (!quantity.gt(0)) lines[row.key] = '实收须大于 0';
    else if ((used.get(row.orderLineId) ?? quantity).gt(decimal(row.remaining)))
      lines[row.key] = `各仓合计超过未入库数量 ${qty(row.remaining)}`;
    else if (!accepted.isFinite() || accepted.lt(0) || accepted.gt(quantity))
      lines[row.key] = '合格数须在 0 到实收之间';
    else if (accepted.lt(quantity) && !row.exceptionReason?.trim())
      lines[row.key] = '有不合格，请填原因';
    else if (row.split && !row.warehouseId)
      lines[row.key] = '请选择这一行的仓库';
  }
  let sheet = '';
  if (!form.warehouseId) sheet = '请选择入库仓库';
  else if (filledInRows(rows).length === 0) sheet = '至少填写一行实收数量';
  return { lines, sheet };
}

/** 按仓库分组：每个仓库一张入库单。 */
export function warehouseGroups(rows: InRow[], fallback?: string) {
  const groups = new Map<string, InRow[]>();
  for (const row of filledInRows(rows)) {
    const warehouse = row.warehouseId || fallback;
    if (!warehouse) continue;
    groups.set(warehouse, [...(groups.get(warehouse) ?? []), row]);
  }
  return groups;
}

export function stockInPayload(
  form: {
    deliveryNo?: string;
    directShip: boolean;
    receivedDate?: string;
    remark?: string;
    warehouseId?: string;
  },
  rows: InRow[],
  ids: { contractId: string; idempotencyKey: string; orderId: string },
): StockInCreate {
  return {
    ...ids,
    warehouseId: form.warehouseId ?? '',
    receivedDate: form.receivedDate || undefined,
    deliveryNo: form.deliveryNo?.trim() || undefined,
    remark: form.remark?.trim() || undefined,
    directShip: form.directShip,
    lines: filledInRows(rows).map((row) => ({
      orderLineId: row.orderLineId,
      quantity: row.quantity ?? '0',
      acceptedQuantity: row.acceptedQuantity ?? row.quantity ?? '0',
      exceptionReason: row.exceptionReason?.trim() || undefined,
      batchNo: row.batchNo?.trim() || undefined,
    })),
  };
}

export interface OutRow {
  contractItemId: string;
  productName: string;
  specification: string;
  unit: string;
  remaining: string;
  onHand: string;
  quantity?: string;
}

/** Prefill min(未出, 现存) so a full shipment is one click. */
export function outboundRows(items: OutboundItem[]): OutRow[] {
  return items.map((item) => {
    const onHand = decimal(item.onHand ?? 0);
    const remaining = decimal(item.remainingQuantity);
    const suggested = BigNumber.minimum(onHand, remaining);
    return {
      contractItemId: item.contractItemId,
      productName: item.productName || '产品未注明',
      specification: item.specification ?? '',
      unit: item.unit ?? '',
      remaining: plain(remaining),
      onHand: plain(onHand),
      quantity: suggested.gt(0) ? plain(suggested) : undefined,
    };
  });
}

export function stockOutErrors(
  form: { warehouseId?: string },
  rows: OutRow[],
): { lines: Record<string, string>; sheet: string } {
  const lines: Record<string, string> = {};
  for (const row of rows) {
    if ((row.quantity ?? '') === '') continue;
    const quantity = decimal(row.quantity);
    if (!quantity.gt(0)) lines[row.contractItemId] = '出库数须大于 0';
    else if (quantity.gt(decimal(row.remaining)))
      lines[row.contractItemId] = `超过合同未出 ${qty(row.remaining)}`;
    else if (quantity.gt(decimal(row.onHand)))
      lines[row.contractItemId] = `超过仓库现存 ${qty(row.onHand)}`;
  }
  let sheet = '';
  if (!form.warehouseId) sheet = '请选择出库仓库';
  else if (!rows.some((row) => decimal(row.quantity).gt(0)))
    sheet = '至少填写一行出库数量';
  return { lines, sheet };
}

export function stockOutPayload(
  form: { remark?: string; shippedDate?: string; warehouseId?: string },
  rows: OutRow[],
  ids: { contractId: string; idempotencyKey: string },
): StockOutCreate {
  return {
    ...ids,
    warehouseId: form.warehouseId ?? '',
    shippedDate: form.shippedDate || undefined,
    remark: form.remark?.trim() || undefined,
    lines: rows
      .filter((row) => decimal(row.quantity).gt(0))
      .map((row) => ({
        contractItemId: row.contractItemId,
        quantity: row.quantity ?? '0',
      })),
  };
}

/** 「TPE瑜伽垫 等 3 项」 for document lists. */
export function linesTitle(lines: { productName?: string }[]) {
  const first = lines.find((line) => line.productName)?.productName ?? '产品';
  return lines.length > 1 ? `${first} 等 ${lines.length} 项` : first;
}
