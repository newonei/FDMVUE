import type { FdmgongchangScheduleApi as Api } from '#/api/fdmgongchang/schedule';

/** 工序名称，和后端 FactoryProcess 一致。 */
export const PROCESS_LABELS: Record<string, string> = {
  CUT: '立切',
  EMBOSS: '压花',
  ENGRAVE: '雕刻',
  FOLD: '折叠',
  LAMINATE: '贴合',
  MIX: '密炼挤出发泡',
  PACK: '包装',
  PUNCH: '冲裁',
  SLICE: '开片',
};

export const SCHEDULE_STATUS: Record<Api.Status, { color: string; label: string }> = {
  CONFIRMED: { color: 'green', label: '已下发' },
  DISCARDED: { color: 'default', label: '已作废' },
  DRAFT: { color: 'blue', label: '待确认' },
  FAILED: { color: 'red', label: '生成失败' },
  GENERATING: { color: 'processing', label: 'AI 生成中' },
};

export const RISK_TYPES: Record<string, 'error' | 'info' | 'warning'> = {
  HIGH: 'error',
  LOW: 'info',
  MEDIUM: 'warning',
};

export function dateText(value: Api.DateValue | undefined) {
  if (!value) return '';
  if (Array.isArray(value)) {
    const [y, m, d] = value;
    return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  }
  return String(value).slice(0, 10);
}

const WEEKDAYS = ['日', '一', '二', '三', '四', '五', '六'];

/** 「10-11 周六」 */
export function dayLabel(date: string) {
  const d = new Date(`${date}T00:00:00`);
  return `${date.slice(5)} 周${WEEKDAYS[d.getDay()]}`;
}

/** 按日期分组，组内按工序顺序、当天顺序排列。 */
export function groupByDate<T>(items: T[], dateOf: (item: T) => string) {
  const groups = new Map<string, T[]>();
  for (const item of items) {
    const key = dateOf(item);
    groups.set(key, [...(groups.get(key) ?? []), item]);
  }
  return [...groups.entries()].toSorted(([a], [b]) => a.localeCompare(b));
}
