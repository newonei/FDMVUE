import type { BusinessRecord, Contract } from '#/api/fdmplatform';

import BigNumber from 'bignumber.js';

import { rows } from '../../data';
import { planAvailable } from '../../documents/related-creation';
import { latestTaskQuotes, localDate } from './comparison';

/** Currencies a supplier quotes in; domestic factories almost always quote CNY. */
export const QUOTE_CURRENCIES = ['CNY', 'USD', 'EUR', 'GBP', 'HKD', 'JPY'];
export const VALIDITY_PRESETS = [7, 15, 30] as const;

const text = (value: unknown) =>
  typeof value === 'string' ? value.trim() : '';
const decimal = (value: unknown) =>
  new BigNumber(
    typeof value === 'string' || typeof value === 'number' ? value : Number.NaN,
  );
const plain = (value: BigNumber) => value.toFixed(value.decimalPlaces() ?? 0);

export function addDays(date: string, days: number) {
  const value = new Date(`${date}T00:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}
/** Whole days from `from` to `to` (negative when `to` is earlier). */
export function daysBetween(from: string, to: string) {
  const start = Date.parse(`${from}T00:00:00Z`);
  const end = Date.parse(`${to}T00:00:00Z`);
  return Number.isFinite(start) && Number.isFinite(end)
    ? Math.round((end - start) / 86_400_000)
    : undefined;
}

export interface TaskContext {
  assignment: BusinessRecord;
  request?: BusinessRecord;
  requestItem?: BusinessRecord;
  title: string;
  specification: string;
  /** The order must use the request unit, or the server rejects the plan. */
  unit: string;
  requiredDate?: string;
  quantity: string;
  plannable: string;
}

export function taskContext(
  contract: Contract,
  assignmentId: string,
): TaskContext | undefined {
  const assignment = contract.assignments?.find(
    (entry) => entry.id === assignmentId,
  );
  if (!assignment) return undefined;
  const request = contract.requests?.find(
    (entry) => entry.id === assignment.requestId,
  );
  const requestItem = rows(request?.items).find(
    (entry) => entry.id === assignment.requestItemId,
  );
  const snapshot = (requestItem?.specificationSnapshot ?? {}) as Record<
    string,
    unknown
  >;
  const item = contract.items.find(
    (entry) => entry.id === assignment.contractItemId,
  );
  return {
    assignment,
    request,
    requestItem,
    title: text(snapshot.skuName) || text(item?.skuName) || '采购产品',
    specification: text(snapshot.specification) || text(item?.specification),
    unit: text(snapshot.unit) || text(item?.unit),
    requiredDate:
      text(requestItem?.requiredDate) || text(item?.requiredDate) || undefined,
    quantity: plain(decimal(assignment.quantity)),
    plannable: plain(planAvailable(contract, assignment)),
  };
}

/** BUY tasks that can still take a quote, for the stand-alone 新增报价 entry. */
export function quotableTasks(contract: Contract) {
  return (contract.assignments ?? [])
    .filter(
      (assignment) =>
        assignment.method === 'BUY' && assignment.status !== 'CANCELLED',
    )
    .map((assignment) => taskContext(contract, String(assignment.id))!)
    .filter((context) => context.request?.status !== 'CANCELLED');
}

export interface QuoteForm {
  supplierId?: string;
  supplierName?: string;
  currency: string;
  unitPrice?: string;
  unit: string;
  taxIncluded: boolean;
  freightIncluded: boolean;
  packagingIncluded: boolean;
  promisedDate?: string;
  validUntil?: string;
  evidenceIds: string[];
  minQuantity?: string;
  maxQuantity?: string;
  previousQuoteId?: string;
  remark?: string;
}

export function newQuoteForm(
  context: TaskContext | undefined,
  today = localDate(),
): QuoteForm {
  return {
    currency: 'CNY',
    unit: context?.unit ?? '',
    taxIncluded: false,
    freightIncluded: false,
    packagingIncluded: false,
    validUntil: addDays(today, 15),
    evidenceIds: [],
  };
}

/** Field → message; empty when the quote can be saved. */
export function quoteFormErrors(
  form: QuoteForm,
  files: number,
  today = localDate(),
) {
  const errors: Record<string, string> = {};
  if (!form.supplierId) errors.supplierId = '请选择供应商';
  const price = decimal(form.unitPrice);
  if (!price.isFinite() || price.isNegative()) errors.unitPrice = '请填写单价';
  if (!form.currency) errors.currency = '请选择币种';
  if (!form.unit) errors.unit = '采购需求缺少单位，请先补齐申请';
  if (!form.promisedDate) errors.promisedDate = '请填写供应商承诺的交期';
  if (!form.validUntil) errors.validUntil = '请选择报价有效期';
  else if (form.validUntil < today) errors.validUntil = '有效期不能早于今天';
  if (files === 0 && form.evidenceIds.length === 0)
    errors.evidence = '请上传报价单或聊天截图，或选择已上传的文件';
  const min = decimal(form.minQuantity);
  const max = decimal(form.maxQuantity);
  if (form.minQuantity && (!min.isFinite() || min.isNegative()))
    errors.minQuantity = '最低数量需为不小于 0 的数字';
  if (form.maxQuantity && (!max.isFinite() || max.isNegative()))
    errors.maxQuantity = '最高数量需为不小于 0 的数字';
  if (min.isFinite() && max.isFinite() && min.isGreaterThan(max))
    errors.maxQuantity = '最高数量不能小于最低数量';
  return errors;
}

export function quotePayload(assignmentId: string, form: QuoteForm) {
  const payload: Record<string, unknown> = {
    assignmentId,
    supplierId: form.supplierId,
    supplierName: form.supplierName,
    currency: form.currency,
    unitPrice: form.unitPrice,
    unit: form.unit,
    taxIncluded: form.taxIncluded,
    freightIncluded: form.freightIncluded,
    packagingIncluded: form.packagingIncluded,
    promisedDate: form.promisedDate,
    validUntil: form.validUntil,
    evidenceIds: form.evidenceIds,
    confirmed: true,
  };
  if (form.minQuantity) payload.minQuantity = form.minQuantity;
  if (form.maxQuantity) payload.maxQuantity = form.maxQuantity;
  if (form.previousQuoteId) payload.previousQuoteId = form.previousQuoteId;
  if (form.remark?.trim()) payload.remark = form.remark.trim();
  return payload;
}

function latestVersion(contract: Contract, quote: BusinessRecord) {
  return !(contract.quotes ?? []).some(
    (candidate) =>
      (candidate.seriesId ?? null) === (quote.seriesId ?? null) &&
      Number(candidate.version ?? 0) > Number(quote.version ?? 0),
  );
}

/** Usable for ordering: confirmed, latest version and not expired. */
export function orderableQuote(
  contract: Contract,
  quote: BusinessRecord,
  today = localDate(),
) {
  return (
    quote.confirmed === true &&
    latestVersion(contract, quote) &&
    typeof quote.validUntil === 'string' &&
    quote.validUntil >= today
  );
}

/**
 * The cheapest other valid quote with the same currency, unit and price terms for this task.
 * Mirrors the server rule that makes a 推荐理由 compulsory.
 */
export function cheaperQuote(
  contract: Contract,
  selected: BusinessRecord,
  quantity: unknown,
  today = localDate(),
) {
  const amount = decimal(quantity);
  const price = decimal(selected.unitPrice);
  let best: BusinessRecord | undefined;
  for (const candidate of latestTaskQuotes(
    contract,
    String(selected.assignmentId ?? ''),
  )) {
    if (
      candidate.id === selected.id ||
      !orderableQuote(contract, candidate, today)
    )
      continue;
    if (
      text(candidate.currency) !== text(selected.currency) ||
      text(candidate.unit) !== text(selected.unit) ||
      candidate.taxIncluded !== selected.taxIncluded ||
      candidate.packagingIncluded !== selected.packagingIncluded ||
      candidate.freightIncluded !== selected.freightIncluded
    )
      continue;
    const min = decimal(candidate.minQuantity);
    const max = decimal(candidate.maxQuantity);
    if (amount.isFinite() && min.isFinite() && amount.isLessThan(min)) continue;
    if (amount.isFinite() && max.isFinite() && amount.isGreaterThan(max))
      continue;
    const candidatePrice = decimal(candidate.unitPrice);
    if (!candidatePrice.isFinite() || !candidatePrice.isLessThan(price))
      continue;
    if (!best || candidatePrice.isLessThan(decimal(best.unitPrice)))
      best = candidate;
  }
  return best;
}

export interface OrderLine {
  quote: BusinessRecord;
  context: TaskContext;
  /** Defaults to everything the task can still order. */
  quantity: string;
}

/**
 * The picked quote plus other tasks of the same request that already have a valid quote from
 * the same supplier: those can go on the same purchase order.
 */
export function orderLines(
  contract: Contract,
  quoteId: string,
  today = localDate(),
): { companions: OrderLine[]; primary?: OrderLine; reason?: string } {
  const quote = contract.quotes?.find((entry) => entry.id === quoteId);
  if (!quote) return { companions: [], reason: '报价不存在，请刷新后重试' };
  const context = taskContext(contract, String(quote.assignmentId ?? ''));
  if (!context) return { companions: [], reason: '报价所属的采购任务不存在' };
  if (!orderableQuote(contract, quote, today))
    return {
      companions: [],
      reason:
        quote.confirmed === true
          ? '报价已过期或已有新版本，请让供应商更新报价'
          : '报价尚未核实',
    };
  if (context.unit && text(quote.unit) !== context.unit)
    return {
      companions: [],
      reason: `报价单位「${text(quote.unit)}」与需求单位「${context.unit}」不同，请重新登记报价`,
    };
  if (!decimal(context.plannable).isGreaterThan(0))
    return {
      companions: [],
      reason: '该任务已全部编入采购方案或已下单',
    };
  const primary = { quote, context, quantity: context.plannable };
  const companions: OrderLine[] = [];
  for (const assignment of contract.assignments ?? []) {
    if (
      assignment.id === quote.assignmentId ||
      assignment.method !== 'BUY' ||
      assignment.status === 'CANCELLED' ||
      assignment.requestId !== context.assignment.requestId
    )
      continue;
    const other = taskContext(contract, String(assignment.id));
    if (!other || !decimal(other.plannable).isGreaterThan(0)) continue;
    const match = latestTaskQuotes(contract, String(assignment.id))
      .filter(
        (candidate) =>
          candidate.supplierId === quote.supplierId &&
          orderableQuote(contract, candidate, today) &&
          text(candidate.unit) === other.unit,
      )
      .toSorted(
        (a, b) => decimal(a.unitPrice).comparedTo(decimal(b.unitPrice)) ?? 0,
      )[0];
    if (match)
      companions.push({
        quote: match,
        context: other,
        quantity: other.plannable,
      });
  }
  return { primary, companions };
}

export function lineAmount(line: { quantity: unknown; quote: BusinessRecord }) {
  const value = decimal(line.quantity).multipliedBy(
    decimal(line.quote.unitPrice),
  );
  return value.isFinite() ? value.decimalPlaces(2) : undefined;
}

export function formatAmount(value: BigNumber | undefined) {
  return value ? value.toFormat(2) : '—';
}

/** New purchase orders after a successful order, by id difference. */
export function createdOrders(before: Contract, after: Contract) {
  const previous = new Set(
    (before.purchaseOrders ?? []).map((order) => order.id),
  );
  return (after.purchaseOrders ?? []).filter(
    (order) => !previous.has(order.id),
  );
}
