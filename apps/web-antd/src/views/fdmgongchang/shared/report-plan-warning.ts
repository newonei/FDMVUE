import { formatQty, roundQty, toNumber } from '../stage-stock/model';

/** 计划偏差供报工人复核，实物产出仍按现场点数登记。 */
export function reportPlanWarning(plan: unknown, previouslyReported: unknown, thisGood: unknown, unit?: null | string) {
  const expected = toNumber(plan);
  const good = toNumber(thisGood) ?? 0;
  if (expected === undefined || expected <= 0 || good <= 0) return '';
  const diff = roundQty((toNumber(previouslyReported) ?? 0) + good - expected);
  if (diff <= 0) return '';
  return `累计良品比计划多 ${formatQty(diff)} ${unit ?? ''}，请复点确认实际产出。`;
}
