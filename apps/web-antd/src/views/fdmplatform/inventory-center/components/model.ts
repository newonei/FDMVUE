import type {
  InventoryWarehouse,
  StockBalance,
  StockLineInput,
  StocktakeCreate,
} from '#/api/fdmplatform/warehouse';

import BigNumber from 'bignumber.js';

const decimal = (value: unknown) =>
  new BigNumber(
    typeof value === 'string' || typeof value === 'number' ? value : Number.NaN,
  );
const plain = (value: BigNumber) => value.toFixed(value.decimalPlaces() ?? 0);
const filled = (value?: string) => (value ?? '').trim() !== '';

/** 工厂工序库存的阶段名称与单位，和后端 FactoryStage 一致。 */
export const STAGES: Array<{ code: string; label: string; unit: string }> = [
  { code: 'RAW', label: '原材料', unit: 'kg' },
  { code: 'BOARD', label: '板材', unit: '张' },
  { code: 'SHEET', label: '片材', unit: '片' },
  { code: 'CUT', label: '已立切片材', unit: '片' },
  { code: 'LAMINATED', label: '已贴合片材', unit: '片' },
  { code: 'EMBOSSED', label: '已压花片材', unit: '片' },
  { code: 'PUNCHED', label: '已冲裁成品', unit: '件' },
  { code: 'ENGRAVED', label: '已雕刻成品', unit: '件' },
  { code: 'FOLDED', label: '已折叠成品', unit: '件' },
  { code: 'PACKED', label: '已包装成品', unit: '件' },
  { code: 'AUX', label: '辅料', unit: '' },
];

export function stageOf(code: string) {
  return STAGES.find((stage) => stage.code === code);
}

/** 能操作的仓库：本人可写的；默认仓优先，其次只有一个时选它。 */
export function writableWarehouses(warehouses: InventoryWarehouse[]) {
  return warehouses.filter((entry) => entry.writable);
}

export function firstWarehouse(warehouses: InventoryWarehouse[]) {
  const writable = writableWarehouses(warehouses);
  return (
    writable.find((entry) => entry.isDefault)?.id ??
    (writable.length === 1 ? writable[0]?.id : undefined)
  );
}

export interface PickRow {
  stockId: string;
  productName: string;
  productCode: string;
  specification: string;
  unit: string;
  onHand: string;
  quantity?: string;
}

/** 仓库有货的库存行，数量留空待填。 */
export function pickRows(stocks: StockBalance[]): PickRow[] {
  return stocks
    .filter((stock) => decimal(stock.onHand).gt(0))
    .map((stock) => ({
      stockId: stock.id,
      productName: stock.productName || '产品未注明',
      productCode: stock.productCode ?? '',
      specification: stock.specification ?? '',
      unit: stock.unit ?? '',
      onHand: plain(decimal(stock.onHand)),
    }));
}

export function pickErrors(
  form: { warehouseId?: string },
  rows: PickRow[],
  name = '出库',
): { lines: Record<string, string>; sheet: string } {
  const lines: Record<string, string> = {};
  for (const row of rows) {
    if (!filled(row.quantity)) continue;
    const quantity = decimal(row.quantity);
    if (!quantity.gt(0)) lines[row.stockId] = `${name}数须大于 0`;
    else if (quantity.gt(decimal(row.onHand)))
      lines[row.stockId] = `超过现存 ${decimal(row.onHand).toFormat()}`;
  }
  let sheet = '';
  if (!form.warehouseId) sheet = '请选择仓库';
  else if (!rows.some((row) => decimal(row.quantity).gt(0)))
    sheet = `至少填写一行${name}数量`;
  return { lines, sheet };
}

export function pickLines(rows: PickRow[]): StockLineInput[] {
  return rows
    .filter((row) => decimal(row.quantity).gt(0))
    .map((row) => ({ stockId: row.stockId, quantity: row.quantity ?? '0' }));
}

export interface CountRow {
  stockId: string;
  productName: string;
  productCode: string;
  specification: string;
  unit: string;
  book: string;
  actual?: string;
}

/** 盘点表：仓库全部库存行（含现存为 0 的，可能实物还有），实盘数留空 = 不盘这行。 */
export function countRows(stocks: StockBalance[]): CountRow[] {
  return stocks.map((stock) => ({
    stockId: stock.id,
    productName: stock.productName || '产品未注明',
    productCode: stock.productCode ?? '',
    specification: stock.specification ?? '',
    unit: stock.unit ?? '',
    book: plain(decimal(stock.onHand)),
  }));
}

/** 实盘 − 账面；没填实盘为 undefined。 */
export function countDiff(row: CountRow) {
  if (!filled(row.actual)) return undefined;
  const actual = decimal(row.actual);
  return actual.isFinite() ? plain(actual.minus(decimal(row.book))) : undefined;
}

export function countErrors(
  form: { warehouseId?: string },
  rows: CountRow[],
): { lines: Record<string, string>; sheet: string } {
  const lines: Record<string, string> = {};
  for (const row of rows) {
    if (!filled(row.actual)) continue;
    const actual = decimal(row.actual);
    if (!actual.isFinite() || actual.lt(0))
      lines[row.stockId] = '实盘数不能小于 0';
  }
  let sheet = '';
  if (!form.warehouseId) sheet = '请选择盘点仓库';
  else if (!rows.some((row) => filled(row.actual)))
    sheet = '至少录入一行实盘数';
  return { lines, sheet };
}

export function countPayload(
  form: { countedDate?: string; remark?: string; warehouseId?: string },
  rows: CountRow[],
  idempotencyKey: string,
): StocktakeCreate {
  return {
    idempotencyKey,
    warehouseId: form.warehouseId ?? '',
    countedDate: form.countedDate || undefined,
    remark: form.remark?.trim() || undefined,
    lines: rows
      .filter((row) => filled(row.actual))
      .map((row) => ({
        stockId: row.stockId,
        bookQuantity: row.book,
        actualQuantity: (row.actual ?? '').trim(),
      })),
  };
}
