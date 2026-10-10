/** 看板用的数字和日期格式。 */
export function n(value: unknown) {
  const v = Number(value ?? 0);
  return Number.isFinite(v) ? v : 0;
}

/** 大数字：1.2万；小于一万保留整数（最多一位小数）。 */
export function big(value: unknown) {
  const v = n(value);
  if (Math.abs(v) >= 10_000) return `${(v / 10_000).toFixed(v >= 100_000 ? 0 : 1)}万`;
  return v.toLocaleString('zh-CN', { maximumFractionDigits: 1 });
}

export function money(value: unknown) {
  return `¥${n(value).toLocaleString('zh-CN', { maximumFractionDigits: 0 })}`;
}

export function pct(rate: null | number | undefined) {
  return rate === null || rate === undefined ? '—' : `${(rate * 100).toFixed(1)}%`;
}

/** 良品率；没有产出时为空。 */
export function yieldRate(good: unknown, defect: unknown) {
  const g = n(good);
  const total = g + n(defect);
  return total > 0 ? g / total : null;
}

/** 本期对比上期的变化：上期为 0 时没有可比的百分比。 */
export function change(current: null | number | undefined, previous: null | number | undefined) {
  if (current === null || current === undefined || previous === null || previous === undefined || previous === 0) {
    return null;
  }
  return (current - previous) / Math.abs(previous);
}

export function dateText(value: null | number[] | string | undefined) {
  if (!value) return '';
  if (Array.isArray(value)) {
    const [y, m, d] = value;
    return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  }
  return String(value).slice(0, 10);
}

/** 距今天几天：负数是已逾期。 */
export function daysLeft(value: null | number[] | string | undefined) {
  const text = dateText(value);
  if (!text) return null;
  const due = new Date(`${text}T00:00:00`);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.round((due.getTime() - today.getTime()) / 86_400_000);
}

/** 各工序在图表里的颜色，按生产顺序从深青到暖色。 */
export const PROCESS_COLORS: Record<string, string> = {
  CUT: '#3BA59A',
  EMBOSS: '#E0A43A',
  ENGRAVE: '#D9783B',
  FOLD: '#B9604A',
  LAMINATE: '#7FB86A',
  MIX: '#0F5F57',
  PACK: '#5B6CC4',
  PUNCH: '#C98B2B',
  SLICE: '#1E8A7E',
};
