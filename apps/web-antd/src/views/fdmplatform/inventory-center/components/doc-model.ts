import type {
  StockIn,
  StockInKind,
  StockOut,
} from '#/api/fdmplatform/warehouse';

import BigNumber from 'bignumber.js';

/**
 * 入库单 / 出库单按单据展示（金智同款）：主题「【单据类型】对应单据 对方」、单据类型、对应单据、状态、合计。
 * 后端没有存主题，按单据内容拼出来。
 */

const decimal = (value: unknown) =>
  new BigNumber(
    typeof value === 'string' || typeof value === 'number' ? value : Number.NaN,
  );

export const IN_KIND_LABELS: Record<StockInKind, string> = {
  PURCHASE: '采购入库',
  PRODUCTION: '生产入库',
  FACTORY_PURCHASE: '工厂收货',
  OTHER: '常规入库',
};

export const OUT_KIND_LABELS: Record<StockOut['kind'], string> = {
  SALES: '销售出库',
  DIRECT: '直发出库',
  OTHER: '其它出库',
};

/** 列表页签：没有 kind 的是采购入库，自产采购单的生产入库归到生产入库。 */
export function inKind(row: Pick<StockIn, 'kind'>): StockInKind {
  if (!row.kind) return 'PURCHASE';
  return row.kind === 'FACTORY_MADE' ? 'PRODUCTION' : row.kind;
}

export function inKindLabel(row: Pick<StockIn, 'kind'>) {
  return IN_KIND_LABELS[inKind(row)];
}

/** 供应商 / 工厂 / 来源 */
export function inPartner(row: StockIn) {
  if (row.kind === 'OTHER') return row.source ?? '';
  return row.supplierName || row.factoryName || '';
}

/** 对应单据：采购单号；工厂交货是内部订单号。 */
export function inRelated(row: StockIn) {
  return row.orderCode || '';
}

export function inSubject(row: StockIn) {
  const head = `【${inKindLabel(row)}】`;
  if (row.kind === 'OTHER') return `${head}${row.source ?? ''}`;
  return `${head}${[inRelated(row), inPartner(row)].filter(Boolean).join(' ')}`;
}

export function outPartner(row: StockOut) {
  return row.kind === 'OTHER'
    ? (row.destination ?? '')
    : (row.customerName ?? '');
}

/** 对应单据：合同号；直发另带入库单号。 */
export function outRelated(row: StockOut) {
  return row.contractCode || '';
}

export function outSubject(row: StockOut) {
  const head = `【${OUT_KIND_LABELS[row.kind] ?? '出库'}】`;
  if (row.kind === 'OTHER') return `${head}${row.destination ?? ''}`;
  return `${head}${[row.contractCode, row.customerName].filter(Boolean).join(' ')}`;
}

/** 销售出库额：数量 × 合同单价；没有单价的行不算，全都没有时返回 undefined。 */
export function outSalesAmount(row: Pick<StockOut, 'lines'>) {
  let total = new BigNumber(0);
  let priced = false;
  for (const line of row.lines) {
    const price = decimal(line.salesUnitPrice);
    if (!price.isFinite()) continue;
    priced = true;
    total = total.plus(price.times(decimal(line.quantity)));
  }
  return priced ? total.decimalPlaces(2).toFixed(2) : undefined;
}

export function lineSum<T>(lines: T[], pick: (line: T) => unknown) {
  let total = new BigNumber(0);
  for (const line of lines) {
    const number = decimal(pick(line));
    if (number.isFinite()) total = total.plus(number);
  }
  return total.toFixed(total.decimalPlaces() ?? 0);
}

/** 本页合计：作废单不计。 */
export function pageSum<T extends { status: string }>(
  rows: T[],
  pick: (row: T) => unknown,
) {
  return lineSum(
    rows.filter((row) => row.status !== 'VOIDED'),
    pick,
  );
}

/** 常规入库的一行：产品中心的产品，数量必填，成本单价不填为成本未知。 */
export interface OtherInRow {
  productId: string;
  productName: string;
  productCode: string;
  specification: string;
  unit: string;
  quantity?: string;
  unitCost?: string;
}

export const IN_SOURCES = [
  '期初库存',
  '客户退回',
  '样品退回',
  '电商仓退回',
  '借出归还',
];

const filled = (value?: string) => (value ?? '').trim() !== '';

export function otherInErrors(
  form: { source: string; warehouseId?: string },
  rows: OtherInRow[],
): { lines: Record<string, string>; sheet: string } {
  const lines: Record<string, string> = {};
  for (const row of rows) {
    if (!decimal(row.quantity).gt(0)) lines[row.productId] = '数量须大于 0';
    else if (filled(row.unitCost) && !decimal(row.unitCost).gte(0))
      lines[row.productId] = '成本单价不能小于 0';
  }
  let sheet = '';
  if (!form.warehouseId) sheet = '请选择入库仓库';
  else if (!form.source.trim()) sheet = '请填写入库来源';
  else if (rows.length === 0) sheet = '请添加入库产品';
  return { lines, sheet };
}

export function otherInLines(rows: OtherInRow[]) {
  return rows.map((row) => ({
    productId: row.productId,
    quantity: (row.quantity ?? '').trim(),
    unitCost: filled(row.unitCost) ? (row.unitCost ?? '').trim() : undefined,
  }));
}
