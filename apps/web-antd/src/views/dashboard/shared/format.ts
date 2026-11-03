/** 首页与公司看板共用的数字格式：金额自动折成万 / 亿，变化率带方向。 */

export function toNumber(value: unknown): number {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

export function sum(values: readonly unknown[]): number {
  return values.reduce<number>((total, value) => total + toNumber(value), 0);
}

function trim(value: number, digits: number) {
  return value.toLocaleString('zh-CN', {
    maximumFractionDigits: digits,
    minimumFractionDigits: 0,
  });
}

/** ¥8,620 / ¥12.6万 / ¥1.28亿；null 表示无数据。 */
export function compactMoney(value: null | number | undefined, prefix = '¥') {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return '—';
  }
  const sign = value < 0 ? '-' : '';
  const abs = Math.abs(value);
  if (abs >= 100_000_000) return `${sign}${prefix}${trim(abs / 100_000_000, 2)}亿`;
  if (abs >= 10_000) return `${sign}${prefix}${trim(abs / 10_000, abs >= 1_000_000 ? 0 : 1)}万`;
  return `${sign}${prefix}${trim(abs, 0)}`;
}

/** 坐标轴刻度：不带货币符号。 */
export function axisMoney(value: number) {
  return compactMoney(value, '');
}

export function formatCount(value: null | number | undefined, unit = '') {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return '—';
  }
  return `${Math.trunc(value).toLocaleString('zh-CN')}${unit}`;
}

export function formatPercent(value: null | number | undefined, digits = 1) {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return '—';
  }
  return `${value.toFixed(digits)}%`;
}

export type DeltaTone = 'bad' | 'good' | 'neutral';

export interface Delta {
  /** 例：+12.4% */
  text: string;
  direction: 'down' | 'flat' | 'up';
  tone: DeltaTone;
}

/**
 * 相对上期的变化。上期为 0 或缺失时没有可比基数，返回 null。
 * upIsGood=false 时上涨记为不利（如退款）；null 表示涨跌都不评价（如付款）。
 */
export function delta(
  current: null | number | undefined,
  previous: null | number | undefined,
  upIsGood: boolean | null = true,
): Delta | null {
  if (
    current === null ||
    current === undefined ||
    previous === null ||
    previous === undefined ||
    !Number.isFinite(current) ||
    !Number.isFinite(previous) ||
    previous <= 0
  ) {
    return null;
  }
  const ratio = ((current - previous) / previous) * 100;
  let direction: Delta['direction'] = ratio > 0 ? 'up' : 'down';
  if (Math.abs(ratio) < 0.05) direction = 'flat';
  let tone: DeltaTone = 'neutral';
  if (upIsGood !== null && direction !== 'flat') {
    tone = (direction === 'up') === upIsGood ? 'good' : 'bad';
  }
  const sign = ratio > 0 ? '+' : '';
  return { direction, text: `${sign}${ratio.toFixed(1)}%`, tone };
}

/** 2026-10 -> 10月；跨年的一月带年份。 */
export function monthLabel(month: string, withYear = false) {
  const [year, value] = month.split('-');
  const number = Number(value);
  if (!year || !Number.isFinite(number)) return month;
  return withYear || number === 1 ? `${year.slice(2)}年${number}月` : `${number}月`;
}
