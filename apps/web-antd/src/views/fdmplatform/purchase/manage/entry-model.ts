import type { PurchaseOrderEntry } from '#/api/fdmplatform/procurement';

import BigNumber from 'bignumber.js';

import { priceFromTotal, totalFromPrice } from '../tasks/request-batch';

/** 金智常用的采购分类；先固定选项，后续再做成可维护。 */
export const PURCHASE_CATEGORIES = [
  '经营主产品采购',
  '原材料',
  '辅料',
  '包材',
  '样品',
  '费用类采购',
  '其他',
];

export interface EntryRow {
  key: string;
  /** 产品档案 id；选合同产品时为空 */
  productId?: string;
  contractItemId?: string;
  name: string;
  code?: string;
  specification?: string;
  unit?: string;
  quantity?: string;
  unitPrice?: string;
  total?: string;
  arrivalDate?: string;
  gift: boolean;
  remark?: string;
}

export interface EntryHeader {
  additionalAmount?: string;
  additionalCategory?: string;
  category?: string;
  companyId?: number;
  contractId?: string;
  /** 整单折扣 %，空或 100 表示不打折 */
  discountRate?: string;
  purchaseDate?: string;
  remark?: string;
  roundOff?: string;
  subject?: string;
  supplierId?: string;
}

const decimal = (value: unknown) =>
  new BigNumber(
    typeof value === 'string' || typeof value === 'number' ? value : Number.NaN,
  );
const blank = (value: string | undefined) => (value ?? '').trim() === '';

export function emptyRow(key: string): EntryRow {
  return { key, name: '', gift: false };
}

/** 填单价：总价跟着算；赠品单价总价都为 0。 */
export function setRowPrice(row: EntryRow, value: string | undefined) {
  row.unitPrice = value;
  row.total = totalFromPrice(value, row.quantity ?? '');
}
/** 填总价：单价按 6 位小数反算。 */
export function setRowTotal(row: EntryRow, value: string | undefined) {
  row.total = value;
  row.unitPrice = priceFromTotal(value, row.quantity ?? '');
}
/** 改数量时以单价为准重算总价；只有总价时按总价反算单价。 */
export function setRowQuantity(row: EntryRow, value: string | undefined) {
  row.quantity = value;
  if (!blank(row.unitPrice))
    row.total = totalFromPrice(row.unitPrice, value ?? '');
  else if (!blank(row.total))
    row.unitPrice = priceFromTotal(row.total, value ?? '');
}
export function setRowGift(row: EntryRow, gift: boolean) {
  row.gift = gift;
  if (gift) {
    row.unitPrice = '0';
    row.total = '0.00';
  }
}

/** 总金额 = 明细合计 × 整单折扣 − 优惠抹零 + 附加费用（和金智的计算过程一致）。 */
export function entryTotals(rows: EntryRow[], header: EntryHeader) {
  let lines = new BigNumber(0);
  for (const row of rows) {
    if (row.gift) continue;
    const amount = decimal(row.unitPrice).multipliedBy(decimal(row.quantity));
    if (amount.isFinite()) lines = lines.plus(amount);
  }
  const rate = decimal(header.discountRate || 100);
  const discounted = lines
    .multipliedBy(rate.isFinite() ? rate : 100)
    .dividedBy(100)
    .decimalPlaces(2, BigNumber.ROUND_HALF_UP);
  const fee = decimal(header.additionalAmount || 0);
  const roundOff = decimal(header.roundOff || 0);
  const total = discounted
    .plus(fee.isFinite() ? fee : 0)
    .minus(roundOff.isFinite() ? roundOff : 0);
  return {
    lines: lines.toFixed(2),
    discounted: discounted.toFixed(2),
    total: total.toFixed(2),
    count: rows.filter((row) => !blank(row.quantity)).length,
  };
}

export function entryErrors(
  rows: EntryRow[],
  header: EntryHeader,
): { lines: Record<string, string>; sheet: string } {
  const lines: Record<string, string> = {};
  for (const row of rows) {
    if (!row.productId && !row.contractItemId) lines[row.key] = '请选择产品';
    else if (!decimal(row.quantity).gt(0)) lines[row.key] = '数量须大于 0';
    else if (!row.gift && !decimal(row.unitPrice).gte(0))
      lines[row.key] = '请填单价或总价';
  }
  let sheet = '';
  if (!header.supplierId) sheet = '请选择供应商';
  else if (!header.contractId && !header.companyId) sheet = '请选择所属公司';
  else if (rows.length === 0) sheet = '请至少添加一行产品';
  else if (
    !blank(header.discountRate) &&
    !(
      decimal(header.discountRate).gt(0) &&
      decimal(header.discountRate).lte(100)
    )
  )
    sheet = '整单折扣须在 0 到 100 之间';
  else if (new BigNumber(entryTotals(rows, header).total).lt(0))
    sheet = '优惠抹零不能超过采购金额';
  return { lines, sheet };
}

export function entryPayload(
  rows: EntryRow[],
  header: EntryHeader,
  idempotencyKey: string,
): PurchaseOrderEntry {
  return {
    idempotencyKey,
    contractId: header.contractId || undefined,
    supplierId: header.supplierId ?? '',
    subject: header.subject?.trim() || undefined,
    category: header.category || undefined,
    purchaseDate: header.purchaseDate || undefined,
    companyId: header.companyId,
    additionalCategory: header.additionalCategory?.trim() || undefined,
    additionalAmount: blank(header.additionalAmount)
      ? undefined
      : header.additionalAmount,
    roundOff: blank(header.roundOff) ? undefined : header.roundOff,
    discountRate: blank(header.discountRate) ? undefined : header.discountRate,
    remark: header.remark?.trim() || undefined,
    lines: rows.map((row) => ({
      productId: row.contractItemId ? undefined : row.productId,
      contractItemId: row.contractItemId,
      quantity: row.quantity ?? '0',
      unitPrice: row.gift ? '0' : row.unitPrice,
      arrivalDate: row.arrivalDate || undefined,
      gift: row.gift,
      remark: row.remark?.trim() || undefined,
    })),
  };
}

export interface PastedLine {
  lineNo: number;
  code: string;
  quantity?: string;
  unitPrice?: string;
  arrivalDate?: string;
  remark?: string;
  error?: string;
}
/**
 * 从 Excel 复制的明细：每行「产品编号、数量、单价、到货日期、备注」，制表符或逗号分隔；
 * 第一行是标题（含「编号」）时跳过。数量必填且大于 0，单价可空（之后在表格里填）。
 */
export function parsePastedLines(text: string): PastedLine[] {
  const result: PastedLine[] = [];
  for (const [index, raw] of text.split(/\r?\n/).entries()) {
    const cells = raw.split(/\t|,|，/).map((cell) => cell.trim());
    if (cells.every((cell) => cell === '')) continue;
    if (index === 0 && cells[0]?.includes('编号')) continue;
    const [code = '', quantity, unitPrice, arrivalDate, remark] = cells;
    const line: PastedLine = {
      lineNo: index + 1,
      code,
      quantity: quantity || undefined,
      unitPrice: unitPrice || undefined,
      arrivalDate: arrivalDate || undefined,
      remark: remark || undefined,
    };
    if (!code) line.error = '缺少产品编号';
    else if (!decimal(quantity).gt(0)) line.error = '数量须大于 0';
    else if (unitPrice && !decimal(unitPrice).gte(0))
      line.error = '单价不是数字';
    else if (arrivalDate && !/^\d{4}-\d{2}-\d{2}$/.test(arrivalDate))
      line.error = '到货日期请写成 2026-10-20';
    result.push(line);
  }
  return result;
}
