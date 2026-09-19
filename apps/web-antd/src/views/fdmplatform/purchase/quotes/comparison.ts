import type { BusinessRecord, Contract } from '#/api/fdmplatform';

import BigNumber from 'bignumber.js';

import { contractQuickActionReason } from '../../components/contract-workflow';
import { rows } from '../../data';
import { relatedActionDefinition } from '../../documents/related-creation';

export interface QuoteComparisonEntry {
  quote: BusinessRecord;
  subtotal?: string;
  issues: string[];
  costNotes: string[];
  canPlan: boolean;
  planReason?: string;
  planQuantity?: string;
}

const text = (value: unknown) =>
  typeof value === 'string' ? value.trim() : '';
const decimal = (value: unknown) =>
  new BigNumber(
    typeof value === 'string' || typeof value === 'number' ? value : Number.NaN,
  );
const exactDecimal = (value: BigNumber) =>
  value.toFixed(value.decimalPlaces() ?? 0);

export function localDate() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

function validDate(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value))
    return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return (
    !Number.isNaN(parsed.getTime()) &&
    parsed.toISOString().slice(0, 10) === value
  );
}

export function quoteStatus(quote: BusinessRecord, today = localDate()) {
  if (quote.confirmed !== true) return { status: 'PENDING', label: '待核实' };
  if (!validDate(quote.validUntil))
    return { status: 'PENDING', label: '有效期待补齐' };
  if (quote.validUntil < today) return { status: 'EXPIRED', label: '已过期' };
  return { status: 'CONFIRMED', label: '已核实 · 有效' };
}

/** A missing series ID is an independent record, never a shared anonymous series. */
export function latestTaskQuotes(contract: Contract, assignmentId: string) {
  if (!assignmentId.trim()) return [];
  const groups = new Map<string, BusinessRecord>();
  for (const quote of contract.quotes ?? []) {
    if (quote.assignmentId !== assignmentId) continue;
    const key = text(quote.seriesId)
      ? `series:${text(quote.seriesId)}`
      : `quote:${quote.id}`;
    const previous = groups.get(key);
    if (!previous || Number(quote.version ?? 0) > Number(previous.version ?? 0))
      groups.set(key, quote);
  }
  return [...groups.values()];
}

export function quotePlanDefault(
  contract: Contract,
  quote: BusinessRecord,
): { quantity?: string; reason?: string } {
  try {
    const definition = relatedActionDefinition(
      contract,
      'plans',
      'SAVE_PLAN',
      { kind: 'quotes', id: quote.id },
      [],
      [],
    );
    const lines = definition.initialValues?.lines;
    const quantity = Array.isArray(lines)
      ? decimal(lines[0]?.quantity)
      : decimal(undefined);
    return quantity.isFinite() && quantity.isGreaterThan(0)
      ? { quantity: exactDecimal(quantity) }
      : { reason: '任务剩余可编制数量待核实' };
  } catch (error) {
    return {
      reason:
        error instanceof Error ? error.message : '请核对任务与已有采购方案',
    };
  }
}

export function quoteQuantityRange(quote: BusinessRecord) {
  const min = decimal(quote.minQuantity);
  const max = decimal(quote.maxQuantity);
  const unit = text(quote.unit) || '单位待补齐';
  if (min.isFinite() && max.isFinite())
    return `${exactDecimal(min)}–${exactDecimal(max)} ${unit}`;
  if (min.isFinite()) return `至少 ${exactDecimal(min)} ${unit}`;
  if (max.isFinite()) return `不超过 ${exactDecimal(max)} ${unit}`;
  return `未限定数量 · ${unit}`;
}

export function includedLabel(value: unknown) {
  if (value === true) return '包含';
  return value === false ? '不含' : '待补齐';
}

/** Calculations are quote subtotals, never landed cost or a supplier recommendation. */
export function compareTaskQuotes(
  contract: Contract,
  assignmentId: string,
  quantity: unknown,
  today = localDate(),
) {
  const assignment = contract.assignments?.find(
    (entry) => entry.id === assignmentId,
  );
  const request = contract.requests?.find(
    (entry) => entry.id === assignment?.requestId,
  );
  const taskItem = contract.items.find(
    (entry) => entry.id === assignment?.contractItemId,
  );
  const requestItem = rows(request?.items).find(
    (entry) => entry.id === assignment?.requestItemId,
  );
  const snapshot = requestItem?.specificationSnapshot;
  const sourceUnit =
    text(
      snapshot && typeof snapshot === 'object'
        ? (snapshot as Record<string, unknown>).unit
        : undefined,
    ) || taskItem?.unit;
  const quotes = latestTaskQuotes(contract, assignmentId);
  const amount = decimal(quantity);
  const baseline = quotes[0];
  const entries: QuoteComparisonEntry[] = quotes.map((quote) => {
    const issues: string[] = [];
    const costNotes: string[] = [];
    const price = decimal(quote.unitPrice);
    const min = decimal(quote.minQuantity);
    const max = decimal(quote.maxQuantity);
    const currency = text(quote.currency).toUpperCase();
    const unit = text(quote.unit);
    if (quote.confirmed !== true) issues.push('报价尚未核实');
    // Java compares nullable series across the whole contract. Keep legacy entries
    // visible independently, but never label a server-rejected version selectable.
    if (
      (contract.quotes ?? []).some(
        (candidate) =>
          (candidate.seriesId ?? null) === (quote.seriesId ?? null) &&
          Number(candidate.version ?? 0) > Number(quote.version ?? 0),
      )
    ) {
      issues.push(
        text(quote.seriesId)
          ? '报价已有新版本，请核对修订记录'
          : '历史报价版本关联待核实，请重新登记报价',
      );
    }
    if (!validDate(quote.validUntil)) issues.push('有效期待补齐');
    else if (quote.validUntil < today) issues.push('报价已过期');
    if (!validDate(quote.promisedDate)) issues.push('承诺到货日待补齐');
    if (!currency) issues.push('币种待补齐');
    if (!unit) issues.push('计价单位待补齐');
    else if (sourceUnit && sourceUnit !== unit)
      issues.push('计价单位与采购需求单位不同');
    if (!amount.isFinite() || !amount.isGreaterThan(0))
      issues.push('请填写大于 0 的比较数量');
    if (!price.isFinite() || price.isNegative()) issues.push('单价待核实');
    if (
      quote.minQuantity !== null &&
      quote.minQuantity !== undefined &&
      (!min.isFinite() || min.isNegative())
    )
      issues.push('最低适用数量待核实');
    if (
      quote.maxQuantity !== null &&
      quote.maxQuantity !== undefined &&
      (!max.isFinite() || max.isNegative())
    )
      issues.push('最高适用数量待核实');
    if (min.isFinite() && max.isFinite() && min.isGreaterThan(max))
      issues.push('适用数量区间异常');
    if (min.isFinite() && amount.isLessThan(min))
      issues.push('比较数量低于起订量');
    if (max.isFinite() && amount.isGreaterThan(max))
      issues.push('比较数量超过适用上限');
    for (const [key, title] of [
      ['taxIncluded', '税费'],
      ['freightIncluded', '运费'],
      ['packagingIncluded', '包装'],
    ] as const) {
      if (typeof quote[key] !== 'boolean') issues.push(`${title}口径待补齐`);
      else if (!quote[key]) costNotes.push(`小计未含${title}`);
    }
    const planned = quotePlanDefault(contract, quote);
    let actionReason = contractQuickActionReason(contract, 'SAVE_PLAN');
    if (actionReason === null || actionReason === undefined) {
      if (!assignment || assignment.method !== 'BUY') {
        actionReason = '来源外采任务待核实';
      } else if (
        assignment.status === 'CANCELLED' ||
        request?.status === 'CANCELLED'
      ) {
        actionReason = '来源任务或采购申请已取消';
      } else {
        actionReason = request ? planned.reason : '来源采购申请待核实';
      }
    }
    return {
      quote,
      subtotal:
        amount.isFinite() &&
        amount.isGreaterThan(0) &&
        price.isFinite() &&
        !price.isNegative()
          ? exactDecimal(amount.multipliedBy(price))
          : undefined,
      issues,
      costNotes,
      planQuantity: planned.quantity,
      canPlan: !actionReason && issues.length === 0,
      planReason: actionReason ?? issues[0],
    };
  });
  const differences: string[] = [];
  if (quotes.length > 1 && baseline) {
    if (
      quotes.some(
        (quote) =>
          text(quote.currency).toUpperCase() !==
          text(baseline.currency).toUpperCase(),
      )
    )
      differences.push('币种不同');
    if (quotes.some((quote) => text(quote.unit) !== text(baseline.unit)))
      differences.push('计价单位不同');
    for (const [key, title] of [
      ['taxIncluded', '税费'],
      ['freightIncluded', '运费'],
      ['packagingIncluded', '包装'],
    ] as const) {
      if (quotes.some((quote) => quote[key] !== baseline[key]))
        differences.push(`${title}口径不同`);
    }
  }
  const comparable =
    quotes.length > 1 &&
    differences.length === 0 &&
    entries.every((entry) => entry.issues.length === 0);
  return { entries, comparable, differences, assignment, taskItem, sourceUnit };
}
