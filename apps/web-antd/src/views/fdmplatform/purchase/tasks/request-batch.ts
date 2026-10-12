import type { QuoteForm } from '../quotes/quick-order';

import type { BusinessRecord, Contract } from '#/api/fdmplatform';

import BigNumber from 'bignumber.js';

import { rows } from '../../data';
import { latestTaskQuotes, localDate } from '../quotes/comparison';
import { quoteFormErrors, taskContext } from '../quotes/quick-order';

/**
 * 按单分派 / 按单报价：一张采购申请打开后以产品表格逐行填写，一次提交。
 * 服务端仍逐行按单条规则校验，任何一行不通过整单不生效。
 */

export type FulfillmentMethod = 'BUY' | 'MAKE' | 'STOCK';
export const METHOD_OPTIONS: { label: string; value: FulfillmentMethod }[] = [
  { value: 'BUY', label: '外采' },
  { value: 'MAKE', label: '自产' },
  { value: 'STOCK', label: '库存' },
];

const text = (value: unknown) =>
  typeof value === 'string' ? value.trim() : '';
const decimal = (value: unknown) =>
  new BigNumber(
    typeof value === 'string' || typeof value === 'number' ? value : Number.NaN,
  );
const plain = (value: BigNumber) =>
  value.isFinite() ? value.toFixed(value.decimalPlaces() ?? 0) : '0';

export interface AssignRow {
  key: string;
  requestItemId: string;
  title: string;
  specification: string;
  unit: string;
  requested: string;
  /** Not yet given to any active task; split rows of one item share it. */
  remaining: string;
  /** A second row added for the same item (e.g. part bought, part made). */
  split: boolean;
  method: FulfillmentMethod;
  quantity?: string;
  ownerUserId?: number;
  factoryId?: string;
}

let rowSequence = 0;
const nextKey = () => `row-${++rowSequence}`;

function itemTitle(contract: Contract, item: BusinessRecord) {
  const snapshot = (item.specificationSnapshot ?? {}) as Record<
    string,
    unknown
  >;
  const product = contract.items.find(
    (entry) => entry.id === item.contractItemId,
  );
  return {
    title: text(snapshot.skuName) || text(product?.skuName) || '采购产品',
    specification: text(snapshot.specification) || text(product?.specification),
    unit: text(snapshot.unit) || text(product?.unit),
  };
}

/** Same rule as the server: request quantity minus active tasks and migrated opening assignments. */
export function unassignedQuantity(contract: Contract, item: BusinessRecord) {
  let allocated = decimal(item.openingAssignedQuantity ?? 0);
  if (!allocated.isFinite()) allocated = new BigNumber(0);
  for (const assignment of contract.assignments ?? [])
    if (
      assignment.requestItemId === item.id &&
      assignment.status !== 'CANCELLED'
    )
      allocated = allocated.plus(decimal(assignment.quantity));
  return BigNumber.maximum(0, decimal(item.quantity).minus(allocated));
}

/** One row per request item that still has an unassigned quantity, prefilled with the whole balance. */
export function assignRows(
  contract: Contract,
  requestId: string,
  defaultOwner?: number,
): AssignRow[] {
  const request = contract.requests?.find((entry) => entry.id === requestId);
  if (!request || request.status === 'CANCELLED') return [];
  return rows(request.items).flatMap((item) => {
    const remaining = unassignedQuantity(contract, item);
    if (!remaining.isGreaterThan(0)) return [];
    const owner = Number(item.ownerUserId);
    return [
      {
        key: nextKey(),
        requestItemId: String(item.id),
        ...itemTitle(contract, item),
        requested: plain(decimal(item.quantity)),
        remaining: plain(remaining),
        split: false,
        method: 'BUY' as const,
        quantity: plain(remaining),
        ownerUserId: owner > 0 ? owner : defaultOwner,
      },
    ];
  });
}

/** A new row for the same item, taking whatever the item's rows have not used yet. */
export function splitRow(all: AssignRow[], source: AssignRow): AssignRow {
  let used = new BigNumber(0);
  for (const row of all) {
    const value = decimal(row.quantity);
    if (row.requestItemId === source.requestItemId && value.isFinite())
      used = used.plus(value);
  }
  const rest = BigNumber.maximum(0, decimal(source.remaining).minus(used));
  return {
    ...source,
    key: nextKey(),
    split: true,
    method: source.method === 'BUY' ? 'MAKE' : 'BUY',
    quantity: rest.isGreaterThan(0) ? plain(rest) : undefined,
    factoryId: undefined,
  };
}

/** Rows with an empty or zero quantity are simply left for later. */
export function activeAssignRows(all: AssignRow[]) {
  return all.filter((row) => decimal(row.quantity).isGreaterThan(0));
}

/** Row key → message; empty when the request can be submitted. */
export function assignErrors(all: AssignRow[]) {
  const errors: Record<string, string> = {};
  const totals = new Map<string, BigNumber>();
  for (const row of all) {
    if (!row.quantity) continue;
    const value = decimal(row.quantity);
    if (!value.isFinite() || value.isNegative()) {
      errors[row.key] = '数量需为不小于 0 的数字';
      continue;
    }
    if (value.isZero()) continue;
    totals.set(
      row.requestItemId,
      (totals.get(row.requestItemId) ?? new BigNumber(0)).plus(value),
    );
    if (!row.ownerUserId) errors[row.key] = '请选择经办人';
    else if (row.method === 'MAKE' && !row.factoryId?.trim())
      errors[row.key] = '自产请填写承接工厂';
  }
  for (const row of all) {
    const total = totals.get(row.requestItemId);
    if (!errors[row.key] && total?.isGreaterThan(decimal(row.remaining)))
      errors[row.key] = `合计 ${plain(total)} 超过待分派 ${row.remaining}`;
  }
  return errors;
}

export function assignPayload(requestId: string, all: AssignRow[]) {
  return {
    requestId,
    lines: activeAssignRows(all).map((row) => ({
      requestId,
      requestItemId: row.requestItemId,
      method: row.method,
      quantity: row.quantity,
      ownerUserId: row.ownerUserId,
      ...(row.method === 'MAKE' ? { factoryId: row.factoryId?.trim() } : {}),
    })),
  };
}

export interface QuoteRow {
  assignmentId: string;
  title: string;
  specification: string;
  unit: string;
  /** Quantity still to be planned or ordered for the task. */
  quantity: string;
  requiredDate?: string;
  /** Cheapest current confirmed quote from any supplier, for reference. */
  best?: { currency: string; supplierName: string; unitPrice: string };
  unitPrice?: string;
  /** Line total the buyer typed or the one derived from the unit price; only the unit price is submitted. */
  total?: string;
  /** Empty uses the sheet's promised date. */
  promisedDate?: string;
}

/** BUY tasks of the request that still have something to buy. */
export function requestQuoteRows(
  contract: Contract,
  requestId: string,
  today = localDate(),
): QuoteRow[] {
  return (contract.assignments ?? []).flatMap((assignment) => {
    if (
      assignment.requestId !== requestId ||
      assignment.method !== 'BUY' ||
      assignment.status === 'CANCELLED'
    )
      return [];
    const context = taskContext(contract, String(assignment.id));
    if (!context || context.request?.status === 'CANCELLED') return [];
    if (!decimal(context.plannable).isGreaterThan(0)) return [];
    const best = latestTaskQuotes(contract, String(assignment.id))
      .filter(
        (quote) =>
          quote.confirmed === true &&
          typeof quote.validUntil === 'string' &&
          quote.validUntil >= today,
      )
      .toSorted(
        (a, b) => decimal(a.unitPrice).comparedTo(decimal(b.unitPrice)) ?? 0,
      )[0];
    return [
      {
        assignmentId: String(assignment.id),
        title: context.title,
        specification: context.specification,
        unit: context.unit,
        quantity: context.plannable,
        requiredDate: context.requiredDate,
        best: best
          ? {
              supplierName: text(best.supplierName) || '供应商',
              currency: text(best.currency),
              unitPrice: String(best.unitPrice ?? ''),
            }
          : undefined,
      },
    ];
  });
}

/** Rows with a price are submitted; the rest stay in 待报价. */
export function pricedQuoteRows(all: QuoteRow[]) {
  return all.filter((row) => (row.unitPrice ?? '').trim() !== '');
}

/** Quotes accept at most 6 decimals on the unit price. */
const PRICE_SCALE = 6;
const blank = (value: string | undefined) => (value ?? '').trim() === '';

/** Unit price typed: total follows as price × quantity, rounded to cents. */
export function totalFromPrice(price: string | undefined, quantity: string) {
  if (blank(price)) return undefined;
  const value = decimal(price).multipliedBy(decimal(quantity));
  return value.isFinite() ? value.toFixed(2) : undefined;
}

/** Total typed: unit price follows as total ÷ quantity, kept to 6 decimals. */
export function priceFromTotal(total: string | undefined, quantity: string) {
  const amount = decimal(quantity);
  if (blank(total) || !amount.isGreaterThan(0)) return undefined;
  const value = decimal(total).dividedBy(amount);
  return value.isFinite()
    ? plain(value.decimalPlaces(PRICE_SCALE, BigNumber.ROUND_HALF_UP))
    : undefined;
}

/**
 * When a typed total does not divide evenly, the rounded unit price gives a slightly
 * different total; show what will actually be recorded.
 */
export function quoteTotalDrift(row: QuoteRow) {
  if (blank(row.total) || blank(row.unitPrice)) return undefined;
  const recorded = decimal(row.unitPrice).multipliedBy(decimal(row.quantity));
  if (
    !recorded.isFinite() ||
    recorded.decimalPlaces(2).isEqualTo(decimal(row.total).decimalPlaces(2))
  )
    return undefined;
  return recorded.toFormat(2);
}

/** Sheet-level errors (supplier, terms, evidence) plus row errors keyed by assignment. */
export function batchQuoteErrors(
  form: QuoteForm,
  all: QuoteRow[],
  files: number,
  today = localDate(),
) {
  const sheet = quoteFormErrors(
    { ...form, unitPrice: '0', unit: 'sheet' },
    files,
    today,
  );
  const lines: Record<string, string> = {};
  const priced = pricedQuoteRows(all);
  for (const row of priced) {
    const price = decimal(row.unitPrice);
    if (!price.isFinite() || price.isNegative())
      lines[row.assignmentId] = '单价需为不小于 0 的数字';
    else if (!row.unit) lines[row.assignmentId] = '采购需求缺少单位';
    else if (row.promisedDate && row.promisedDate < today)
      lines[row.assignmentId] = '交期不能早于今天';
  }
  // A row-level date covers the sheet date only when every priced row has one.
  if (
    sheet.promisedDate &&
    priced.length > 0 &&
    priced.every((row) => row.promisedDate)
  )
    delete sheet.promisedDate;
  if (priced.length === 0) sheet.lines = '至少填写一个产品的单价';
  return { sheet, lines };
}

export function batchQuotePayload(form: QuoteForm, all: QuoteRow[]) {
  const payload: Record<string, unknown> = {
    supplierId: form.supplierId,
    supplierName: form.supplierName,
    currency: form.currency,
    taxIncluded: form.taxIncluded,
    freightIncluded: form.freightIncluded,
    packagingIncluded: form.packagingIncluded,
    promisedDate: form.promisedDate,
    validUntil: form.validUntil,
    evidenceIds: form.evidenceIds,
    confirmed: true,
    lines: pricedQuoteRows(all).map((row) => ({
      assignmentId: row.assignmentId,
      unitPrice: row.unitPrice?.trim(),
      unit: row.unit,
      ...(row.promisedDate ? { promisedDate: row.promisedDate } : {}),
    })),
  };
  if (form.remark?.trim()) payload.remark = form.remark.trim();
  return payload;
}
