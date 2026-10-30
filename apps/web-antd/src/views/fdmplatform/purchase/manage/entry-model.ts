import type { Contract } from '#/api/fdmplatform';
import type {
  ProcurementOrderView,
  PurchaseOrderEntry,
} from '#/api/fdmplatform/procurement';

import BigNumber from 'bignumber.js';

import { latestTaskQuotes } from '../quotes/comparison';
import { orderableQuote } from '../quotes/quick-order';
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

/**
 * 采购明细的物料类型，和后端一致按产品中心分类认：含「原材料」为原料，含「辅料」「纸箱」为辅料。
 * 选了收货工厂的采购单只能买原料、辅料。
 */
export function materialKind(category?: null | string) {
  if (!category) return undefined;
  if (category.includes('原材料')) return 'RAW' as const;
  if (category.includes('辅料') || category.includes('纸箱'))
    return 'AUX' as const;
  return undefined;
}

export interface EntryRow {
  key: string;
  /** 产品中心分类，用来认原料、辅料 */
  category?: string;
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
  /** 这一行的供应商；不填用表头供应商。不同供应商的行保存时拆成多张采购单。 */
  supplierId?: string;
  /** 修改草稿采购单时原明细行的 id，保存时沿用 */
  lineId?: string;
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
  /** 收货工厂：由工厂确认收货，不进采购仓库 */
  receiveFactoryId?: number;
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

/**
 * 申请明细已有供应商报价时带出供应商和单价：取该明细外采任务里仍有效、单位一致的最低价。
 * 没有报价返回 undefined，由采购员自己选。
 */
export function quotedSupplier(
  contract: Contract,
  requestItemId: string,
  unit: string | undefined,
  today: string,
) {
  let best: Record<string, unknown> | undefined;
  for (const assignment of contract.assignments ?? []) {
    if (
      assignment.requestItemId !== requestItemId ||
      assignment.method !== 'BUY' ||
      assignment.status === 'CANCELLED'
    )
      continue;
    for (const quote of latestTaskQuotes(contract, String(assignment.id))) {
      if (!orderableQuote(contract, quote, today) || !quote.supplierId)
        continue;
      if (unit && quote.unit !== unit) continue;
      if (!best || decimal(quote.unitPrice).isLessThan(decimal(best.unitPrice)))
        best = quote;
    }
  }
  if (!best) return undefined;
  // 保留报价原有小数位，不能按整数取整
  const price = decimal(best.unitPrice);
  return {
    supplierId: String(best.supplierId),
    supplierName:
      typeof best.supplierName === 'string' ? best.supplierName : undefined,
    unitPrice: price.isFinite()
      ? price.toFixed(price.decimalPlaces() ?? 0)
      : undefined,
  };
}

/** 保存后会生成的采购单：每个供应商一张，按明细里首次出现的顺序。 */
export function entrySuppliers(rows: EntryRow[], header: EntryHeader) {
  const groups = new Map<string, EntryRow[]>();
  for (const row of rows) {
    const supplierId = row.supplierId || header.supplierId;
    if (!supplierId) continue;
    groups.set(supplierId, [...(groups.get(supplierId) ?? []), row]);
  }
  return [...groups].map(([supplierId, lines]) => ({
    supplierId,
    rows: lines,
    total: entryTotals(lines, { discountRate: header.discountRate }).total,
  }));
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
    else if (header.receiveFactoryId && !materialKind(row.category))
      lines[row.key] = '工厂只收原料、辅料，这一行请另开采购单';
  }
  let sheet = '';
  if (rows.some((row) => !row.supplierId) && !header.supplierId)
    sheet = '请选择供应商';
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
  else if (
    entrySuppliers(rows, header).length > 1 &&
    (decimal(header.additionalAmount).gt(0) || decimal(header.roundOff).gt(0))
  )
    sheet =
      '明细分属多个供应商、会拆成多张采购单，附加费用和优惠抹零无法分摊，请清空或按供应商分别开单';
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
    receiveFactoryId: header.receiveFactoryId,
    lines: rows.map((row) => ({
      productId: row.contractItemId ? undefined : row.productId,
      contractItemId: row.contractItemId,
      quantity: row.quantity ?? '0',
      unitPrice: row.gift ? '0' : row.unitPrice,
      arrivalDate: row.arrivalDate || undefined,
      gift: row.gift,
      remark: row.remark?.trim() || undefined,
      supplierId:
        row.supplierId && row.supplierId !== header.supplierId
          ? row.supplierId
          : undefined,
      id: row.lineId,
    })),
  };
}

interface CopiedLine {
  id?: string;
  contractItemId?: null | string;
  skuId?: null | string;
  quantity?: unknown;
  unitPrice?: unknown;
  specificationSnapshot?: null | {
    category?: null | string;
    skuCode?: null | string;
    skuName?: null | string;
    specification?: null | string;
    unit?: null | string;
  };
}
const copiedText = (value: unknown) =>
  typeof value === 'string' && value.trim() !== '' ? value : undefined;
const copiedNumber = (value: unknown) => {
  if (value === null || value === undefined || value === '') return undefined;
  const number = decimal(value);
  return number.isFinite()
    ? number.toFixed(number.decimalPlaces() ?? 0)
    : undefined;
};
/**
 * 复制采购单：带出合同、供应商、表头和明细（数量、单价、赠品、备注），
 * 采购日期改为今天，到货日期不带；附加费用为 0、折扣 100 时留空，和新建一样。
 * edit=true 时是修改撤回为草稿的这张单：采购日期、到货日期照原单带出，明细保留原行 id。
 */
export function copyEntry(
  view: ProcurementOrderView,
  key: () => string,
  today: string,
  edit = false,
): { header: EntryHeader; rows: EntryRow[] } {
  const order = view.order;
  const details = view.details as Record<string, unknown>;
  const notes = (details.lineNotes ?? {}) as Record<
    string,
    { gift?: boolean; remark?: null | string }
  >;
  const dates = (details.lineDates ?? {}) as Record<string, string>;
  const nonZero = (value: unknown, empty: string) => {
    const number = copiedNumber(value);
    return number === undefined || decimal(number).isEqualTo(empty)
      ? undefined
      : number;
  };
  const header: EntryHeader = {
    contractId: view.contractId || undefined,
    supplierId: copiedText(order.supplierId),
    subject: copiedText(details.subject),
    category: copiedText(details.category),
    purchaseDate: (edit && copiedText(details.purchaseDate)) || today,
    companyId:
      typeof order.companyId === 'number' ? order.companyId : view.companyId,
    additionalCategory: copiedText(details.additionalCategory),
    additionalAmount: nonZero(details.additionalAmount, '0'),
    roundOff: nonZero(details.roundOff, '0'),
    discountRate: nonZero(details.discountRate, '100'),
    remark: copiedText(details.remark),
    receiveFactoryId:
      typeof order.receiveFactoryId === 'number'
        ? order.receiveFactoryId
        : undefined,
  };
  const rows = ((order.lines ?? []) as CopiedLine[])
    .filter((line) => line.contractItemId || line.skuId)
    .map((line) => {
      const snapshot = line.specificationSnapshot ?? {};
      const note = line.id ? notes[line.id] : undefined;
      const row: EntryRow = {
        ...emptyRow(key()),
        category: snapshot.category ?? undefined,
        productId: line.contractItemId ? undefined : (line.skuId ?? undefined),
        contractItemId: line.contractItemId ?? undefined,
        name: snapshot.skuName || '产品',
        code: snapshot.skuCode ?? undefined,
        specification: snapshot.specification ?? undefined,
        unit: snapshot.unit ?? undefined,
        quantity: copiedNumber(line.quantity),
        remark: copiedText(note?.remark),
      };
      if (edit && line.id) {
        row.lineId = line.id;
        row.arrivalDate = copiedText(dates[line.id]);
      }
      if (note?.gift === true) setRowGift(row, true);
      else setRowPrice(row, copiedNumber(line.unitPrice));
      return row;
    });
  return { header, rows };
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
