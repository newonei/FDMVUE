import type { ReceiptConversion } from '#/api/fdmplatform/exchange-rates';

import BigNumber from 'bignumber.js';

import { formatTemporalField } from '../../date-display';

export function conversionInput(
  date?: string,
  currency?: string,
  amount?: number | string,
) {
  const normalizedCurrency = currency?.trim().toUpperCase() ?? '';
  if (
    !date ||
    !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
    !/^[A-Z]{3}$/.test(normalizedCurrency) ||
    amount === undefined ||
    amount === '' ||
    !Number.isFinite(Number(amount)) ||
    Number(amount) <= 0
  )
    return undefined;
  return { date, currency: normalizedCurrency, amount };
}
/** 跨币种回款计入合同的金额：原币 × 回款币种汇率 ÷ 合同币种汇率（同一到账日），与服务端一致保留两位 */
export function contractEquivalent(
  amount: number | string,
  rateToCny: number | string,
  contractRateToCny: number | string,
) {
  const rate = new BigNumber(contractRateToCny);
  if (!rate.isFinite() || rate.lte(0)) return undefined;
  const value = new BigNumber(amount).times(rateToCny).div(rate);
  return value.isFinite()
    ? value.decimalPlaces(2, BigNumber.ROUND_HALF_UP).toFixed(2)
    : undefined;
}
export function conversionDateNote(
  value: Pick<ReceiptConversion, 'fallback' | 'rateDate' | 'requestedDate'>,
) {
  return value.fallback
    ? `${value.requestedDate} 休市或参考值尚未公布，采用此前 ${value.rateDate} 的参考汇率。`
    : `采用 ${value.rateDate} 的参考汇率。`;
}

export function hasReceiptFx(record: Record<string, unknown>) {
  return (
    record.exchangeRateToCny !== null &&
    record.exchangeRateToCny !== undefined &&
    Number(record.exchangeRateToCny) > 0 &&
    Boolean(record.exchangeRateDate) &&
    record.rmbAmount !== null &&
    record.rmbAmount !== undefined &&
    record.rmbAmount !== ''
  );
}
export function receiptFxDisplay(
  record: Record<string, unknown>,
  key: string,
): string | undefined {
  if (
    ![
      'exchangeRateDate',
      'exchangeRateFallback',
      'exchangeRateFetchedAt',
      'exchangeRateSource',
      'exchangeRateToCny',
      'rmbAmount',
    ].includes(key)
  )
    return undefined;
  if (!hasReceiptFx(record)) return '待补齐';
  const value = record[key];
  if (value === null || value === undefined || value === '') return '待补齐';
  if (key === 'exchangeRateFallback') return value ? '此前公布日' : '当日值';
  const dateValue = formatTemporalField(key, value);
  if (dateValue !== undefined) return dateValue;
  if (key === 'exchangeRateSource') return rateSourceLabel(String(value));
  if (key === 'rmbAmount')
    return `CNY ${Number(value).toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  return String(value);
}

const RATE_SOURCE_LABELS: Record<string, string> = {
  CNY: '人民币',
  ECB: '欧洲央行参考价（外汇局未公布的币种）',
  MANUAL: '财务手动修改',
  SAFE: '国家外汇管理局中间价',
};
/** 汇率来源显示名：外汇局中间价为主，外汇局不公布的币种才用欧洲央行补充 */
export function rateSourceLabel(source?: null | string) {
  return source ? (RATE_SOURCE_LABELS[source] ?? source) : '—';
}

/** 外贸常用币种，汇率中心置顶显示 */
export const COMMON_CURRENCIES = [
  'USD',
  'EUR',
  'GBP',
  'AUD',
  'CAD',
  'JPY',
  'HKD',
];

/** 汇率显示 4 位小数，完整值放在悬停提示里 */
export function rateText(value: unknown) {
  const number = Number(value);
  return Number.isFinite(number) ? number.toFixed(4) : String(value ?? '—');
}

export function splitCommonRates<T extends { currency: string }>(rows: T[]) {
  const common = COMMON_CURRENCIES.flatMap((code) =>
    rows.filter((row) => row.currency === code),
  );
  const others = rows.filter(
    (row) => !COMMON_CURRENCIES.includes(row.currency),
  );
  return { common, others };
}

/** 走势概要：最新、区间最高 / 最低 / 均值与较区间首日的涨跌（%）。 */
export function trendSummary(
  points: { rateDate: string; rateToCny: unknown }[],
) {
  const values = points
    .map((point) => ({ date: point.rateDate, value: Number(point.rateToCny) }))
    .filter((point) => Number.isFinite(point.value) && point.value > 0);
  const first = values[0];
  const last = values.at(-1);
  if (!first || !last) return undefined;
  const numbers = values.map((point) => point.value);
  return {
    first: first.value,
    firstDate: first.date,
    last: last.value,
    lastDate: last.date,
    max: Math.max(...numbers),
    min: Math.min(...numbers),
    average: numbers.reduce((sum, value) => sum + value, 0) / numbers.length,
    change: ((last.value - first.value) / first.value) * 100,
  };
}

/**
 * 参考折算：外币 → 人民币或人民币 → 外币，按 rateToCny（1 外币 = x 人民币）。
 * 只用于估算，回款仍以登记时服务端冻结的汇率为准。
 */
export function referenceConvert(
  amount: unknown,
  rateToCny: unknown,
  toCny: boolean,
) {
  const value = Number(amount);
  const rate = Number(rateToCny);
  if (!Number.isFinite(value) || !Number.isFinite(rate) || rate <= 0)
    return undefined;
  return toCny ? value * rate : value / rate;
}
