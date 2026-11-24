import type { Contract } from '#/api/fdmplatform';
import type {
  ProcurementOrderView,
  ProcurementProductSnapshot,
  PurchaseOrderEntry,
} from '#/api/fdmplatform/procurement';
import type { ProductStructure } from '#/api/fdmplatform/products';

import BigNumber from 'bignumber.js';

import { currencyScale } from '../../finance/procurement/model';
import { productStructure } from '../../products/structure';
import { latestTaskQuotes } from '../quotes/comparison';
import { orderableQuote } from '../quotes/quick-order';
import { priceFromTotal, totalFromPrice } from '../tasks/request-batch';
import { orderDateError, validOrderDate } from './model';

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
  requestItemId?: string;
  assignmentId?: string;
  /** 当前申请明细可转上限；编辑草稿时包含本行已占用数量。 */
  availableQuantity?: string;
  name: string;
  code?: string;
  specification?: string;
  /** 只读的来源结构资料；保存时由服务端按来源 ID 冻结，不提交任意快照。 */
  structure?: ProductStructure;
  unit?: string;
  quantity?: string;
  unitPrice?: string;
  total?: string;
  pricingMode?: 'TOTAL' | 'UNIT';
  arrivalDate?: string;
  gift: boolean;
  remark?: string;
  /** 这一行的供应商；不填用表头供应商。不同供应商的行保存时拆成多张采购单。 */
  supplierId?: string;
  /** 修改草稿采购单时原明细行的 id，保存时沿用 */
  lineId?: string;
  /** 复制原行的可信来源；换产品后清空。 */
  sourceLineId?: string;
}

export interface EntryHeader {
  sourceContractId?: string;
  sourceOrderId?: string;
  additionalAmount?: string;
  additionalCategory?: string;
  category?: string;
  companyId?: number;
  contractId?: string;
  currency?: string;
  /** 整单折扣 %，空或 100 表示不打折 */
  discountRate?: string;
  deliveryDate?: string;
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
const ReferencePrice = BigNumber.clone({
  DECIMAL_PLACES: 12,
  ROUNDING_MODE: BigNumber.ROUND_HALF_UP,
});

export function emptyRow(key: string): EntryRow {
  return { key, name: '', gift: false };
}

export function entryProductFields(source: ProcurementProductSnapshot) {
  return {
    category: source.category ?? undefined,
    name: source.skuName || '产品',
    code: source.skuCode ?? undefined,
    specification: source.specification ?? undefined,
    unit: source.unit ?? undefined,
    structure: productStructure(source),
  };
}

/** 填单价：总价跟着算；赠品单价总价都为 0。 */
export function setRowPrice(row: EntryRow, value: string | undefined) {
  if (row.pricingMode === 'TOTAL') return;
  row.unitPrice = value;
  row.total = totalFromPrice(value, row.quantity ?? '');
}
/** 按总价计价时保留原总价，单价只作折算参考。 */
export function setRowTotal(row: EntryRow, value: string | undefined) {
  row.total = value;
  row.unitPrice =
    row.pricingMode === 'TOTAL'
      ? entryPrice(
          new ReferencePrice(value ?? '')
            .dividedBy(row.quantity ?? '')
            .toString(),
        )
      : priceFromTotal(value, row.quantity ?? '');
}

export function setRowPricingMode(row: EntryRow, mode: 'TOTAL' | 'UNIT') {
  if (row.gift || (row.pricingMode ?? 'UNIT') === mode) return;
  row.pricingMode = mode;
  if (mode === 'TOTAL') setRowTotal(row, row.total);
  else setRowPrice(row, priceFromTotal(row.total, row.quantity ?? ''));
}

export function setRowQuantity(row: EntryRow, value: string | undefined) {
  row.quantity = value;
  if (row.pricingMode === 'TOTAL') setRowTotal(row, row.total);
  else if (!blank(row.unitPrice))
    row.total = totalFromPrice(row.unitPrice, value ?? '');
  else if (!blank(row.total))
    row.unitPrice = priceFromTotal(row.total, value ?? '');
}
export function setRowGift(row: EntryRow, gift: boolean) {
  row.gift = gift;
  if (gift) {
    if (row.pricingMode === 'TOTAL') row.pricingMode = 'UNIT';
    row.unitPrice = '0';
    row.total = '0.00';
  }
}

/** 按总价计价的采购单按币种逐行结算，整单优惠和附加费用单独计算。 */
export function entryTotals(rows: EntryRow[], header: EntryHeader) {
  const scale = currencyScale(header.currency ?? 'CNY');
  let lines = new BigNumber(0);
  let settledLines = new BigNumber(0);
  let hasAgreedAmount = false;
  let quantity = new BigNumber(0);
  for (const row of rows) {
    const rowQuantity = decimal(row.quantity);
    if (rowQuantity.isFinite()) quantity = quantity.plus(rowQuantity);
    if (row.gift) continue;
    const fixed = row.pricingMode === 'TOTAL';
    const amount = fixed
      ? decimal(row.total)
      : decimal(row.unitPrice).multipliedBy(rowQuantity);
    if (!amount.isFinite()) continue;
    hasAgreedAmount ||= fixed;
    lines = lines.plus(amount);
    settledLines = settledLines.plus(
      amount.decimalPlaces(scale, BigNumber.ROUND_HALF_UP),
    );
  }
  const inputRate = decimal(header.discountRate || 100);
  const rate = inputRate.isFinite() ? inputRate : new BigNumber(100);
  const discountAdjustment = lines
    .multipliedBy(new BigNumber(100).minus(rate))
    .shiftedBy(-2)
    .decimalPlaces(2, BigNumber.ROUND_HALF_UP);
  const discounted = hasAgreedAmount
    ? settledLines.minus(discountAdjustment)
    : lines
        .multipliedBy(rate)
        .shiftedBy(-2)
        .decimalPlaces(scale, BigNumber.ROUND_HALF_UP);
  const fee = decimal(header.additionalAmount || 0);
  const roundOff = decimal(header.roundOff || 0);
  const total = discounted
    .plus(fee.isFinite() ? fee : 0)
    .minus(roundOff.isFinite() ? roundOff : 0);
  return {
    lines: (hasAgreedAmount ? settledLines : lines).toFixed(scale),
    discounted: discounted.toFixed(scale),
    total: total.toFixed(scale),
    ...(hasAgreedAmount && {
      discountAdjustment: discountAdjustment.toFixed(2),
    }),
    quantity: quantity.toFixed(0),
    count: rows.filter((row) => !blank(row.quantity)).length,
  };
}

/**
 * 带出申请明细有效且单位一致的最低供应商报价。有任务或币种时按对应条件筛选。
 * 没有报价返回 undefined，由采购员自己选。
 */
export function quotedSupplier(
  contract: Contract,
  requestItemId: string,
  unit: string | undefined,
  today: string,
  { assignmentId, currency }: { assignmentId?: string; currency?: string } = {},
) {
  let best: Record<string, unknown> | undefined;
  for (const assignment of contract.assignments ?? []) {
    if (
      assignment.requestItemId !== requestItemId ||
      (assignmentId && assignment.id !== assignmentId) ||
      assignment.method !== 'BUY' ||
      assignment.status === 'CANCELLED'
    )
      continue;
    for (const quote of latestTaskQuotes(contract, String(assignment.id))) {
      if (!orderableQuote(contract, quote, today) || !quote.supplierId)
        continue;
      if (unit && quote.unit !== unit) continue;
      if (currency && quote.currency !== currency) continue;
      if (entryPrice(quote.unitPrice) === undefined) continue;
      if (!best || decimal(quote.unitPrice).isLessThan(decimal(best.unitPrice)))
        best = quote;
    }
  }
  if (!best) return undefined;
  // 保留报价原有小数位，不能按整数取整
  return {
    supplierId: String(best.supplierId),
    supplierName:
      typeof best.supplierName === 'string' ? best.supplierName : undefined,
    unitPrice: entryPrice(best.unitPrice),
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
    total: entryTotals(lines, {
      currency: header.currency,
      discountRate: header.discountRate,
    }).total,
  }));
}

function requestQuantity(rows: EntryRow[], row: EntryRow) {
  if (!row.requestItemId) return decimal(row.quantity);
  let quantity = new BigNumber(0);
  for (const entry of rows) {
    if (
      entry.requestItemId === row.requestItemId &&
      entry.assignmentId === row.assignmentId
    ) {
      quantity = quantity.plus(decimal(entry.quantity));
    }
  }
  return quantity;
}

export function entryErrors(
  rows: EntryRow[],
  header: EntryHeader,
): { lines: Record<string, string>; sheet: string } {
  const lines: Record<string, string> = {};
  const amountScale = currencyScale(header.currency ?? 'CNY');
  for (const row of rows) {
    const totalPricing = row.pricingMode === 'TOTAL';
    if (!row.productId && !row.contractItemId) lines[row.key] = '请选择产品';
    else if (!decimal(row.quantity).gt(0)) lines[row.key] = '数量须大于 0';
    else if (
      row.availableQuantity !== undefined &&
      requestQuantity(rows, row).gt(row.availableQuantity)
    )
      lines[row.key] = `本次最多可转 ${row.availableQuantity}`;
    else if (!row.gift && totalPricing && entryPrice(row.total) === undefined)
      lines[row.key] = '请填写非负的成交总价';
    else if (
      !row.gift &&
      totalPricing &&
      (decimal(row.total).decimalPlaces() ?? 0) > amountScale
    )
      lines[row.key] = amountScale
        ? `成交总价最多 ${amountScale} 位小数`
        : '成交总价须为整数';
    else if (!row.gift && !totalPricing && !decimal(row.unitPrice).gte(0))
      lines[row.key] = '请填单价或总价';
    else if (header.receiveFactoryId && !materialKind(row.category))
      lines[row.key] = '工厂只收原料、辅料，这一行请另开采购单';
    else if (row.arrivalDate && !validOrderDate(row.arrivalDate))
      lines[row.key] = '请填写有效的到货日期';
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
  return { lines, sheet: sheet || orderDateError(header) };
}

export function entryPayload(
  rows: EntryRow[],
  header: EntryHeader,
  idempotencyKey: string,
): PurchaseOrderEntry {
  return {
    idempotencyKey,
    contractId: header.contractId || undefined,
    sourceContractId: header.sourceOrderId
      ? header.sourceContractId
      : undefined,
    sourceOrderId: header.sourceOrderId,
    supplierId: header.supplierId ?? '',
    subject: header.subject?.trim() || undefined,
    category: header.category || undefined,
    purchaseDate: header.purchaseDate || undefined,
    deliveryDate: header.deliveryDate || null,
    companyId: header.companyId,
    currency: header.currency,
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
      requestItemId: row.requestItemId,
      assignmentId: row.assignmentId,
      quantity: row.quantity ?? '0',
      unitPrice: row.gift ? '0' : row.unitPrice,
      pricingMode: row.pricingMode,
      agreedAmount:
        !row.gift && row.pricingMode === 'TOTAL' ? row.total : undefined,
      arrivalDate: row.arrivalDate || undefined,
      gift: row.gift,
      remark: row.remark?.trim() || undefined,
      supplierId:
        row.supplierId && row.supplierId !== header.supplierId
          ? row.supplierId
          : undefined,
      id: row.lineId,
      sourceLineId: row.sourceLineId,
    })),
  };
}

interface CopiedLine {
  id?: string;
  requestItemId?: null | string;
  assignmentId?: null | string;
  contractItemId?: null | string;
  skuId?: null | string;
  quantity?: unknown;
  unitPrice?: unknown;
  agreedAmount?: unknown;
  specificationSnapshot?: null | ProcurementProductSnapshot;
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

export function entryPrice(value: unknown): string | undefined {
  const price = decimal(value);
  return price.isFinite() && price.gte(0)
    ? price.toFixed(price.decimalPlaces() ?? 0)
    : undefined;
}
/**
 * 复制采购单：带出合同、供应商、表头和明细（数量、单价、赠品、备注），
 * 采购日期改为今天，交付和到货日期留空；附加费用为 0、折扣 100 时留空。
 * edit=true 时修改当前草稿，保留原单日期和明细 id。
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
    sourceContractId: edit ? undefined : view.contractId || 'standalone',
    sourceOrderId: edit ? undefined : String(order.id),
    contractId: view.contractId || undefined,
    supplierId: copiedText(order.supplierId),
    subject: copiedText(details.subject),
    category: copiedText(details.category),
    currency: copiedText(order.currency),
    purchaseDate: (edit && copiedText(details.purchaseDate)) || today,
    deliveryDate: edit ? copiedText(details.deliveryDate) : undefined,
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
        ...entryProductFields(snapshot),
        productId: line.contractItemId ? undefined : (line.skuId ?? undefined),
        contractItemId: line.contractItemId ?? undefined,
        requestItemId: edit ? (line.requestItemId ?? undefined) : undefined,
        assignmentId: edit ? (line.assignmentId ?? undefined) : undefined,
        sourceLineId: edit ? undefined : line.id,
        quantity: copiedNumber(line.quantity),
        remark: copiedText(note?.remark),
      };
      if (edit && line.id) {
        row.lineId = line.id;
        row.arrivalDate =
          copiedText(dates[line.id]) ||
          copiedText(view.lineDeliveryDates?.[line.id]);
      }
      const agreedAmount = copiedNumber(line.agreedAmount);
      if (note?.gift === true) setRowGift(row, true);
      else if (agreedAmount === undefined) {
        setRowPrice(row, copiedNumber(line.unitPrice));
      } else {
        row.pricingMode = 'TOTAL';
        setRowTotal(row, agreedAmount);
      }
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
