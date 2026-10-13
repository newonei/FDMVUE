/**
 * 单据产品明细表的字段设置（参照金智「产品明细设置」）：
 * 每张表声明全部可选字段，用户勾选、排序和拖宽后按人按表存在本机浏览器。
 */
export interface LineColumn {
  key: string;
  title: string;
  /** 默认宽度；没写时按 DEFAULT_WIDTH */
  width?: number;
  align?: 'center' | 'left' | 'right';
  /** 直接取行上的字段；没写时用 key，需自定义显示的列在 bodyCell 插槽里处理 */
  dataIndex?: string;
  /** 默认不显示，需要时在字段设置里勾选 */
  optional?: boolean;
  /** 锁定列：总是显示、排第一、固定在左侧 */
  locked?: boolean;
}

export interface LineTableSetting {
  /** 显示的字段，按显示顺序 */
  keys: string[];
  /** 用户拖过的列宽 */
  widths: Record<string, number>;
}

export const DEFAULT_WIDTH = 150;
export const MIN_WIDTH = 60;
export const MAX_WIDTH = 800;

export function defaultSetting(columns: LineColumn[]): LineTableSetting {
  return {
    keys: columns.filter((item) => !item.optional).map((item) => item.key),
    widths: {},
  };
}

/** 读回的设置可能来自旧版本：去掉已下线字段，补上锁定列，宽度限制在合理范围。 */
export function normalizeSetting(
  columns: LineColumn[],
  saved: unknown,
): LineTableSetting {
  const fallback = defaultSetting(columns);
  if (!saved || typeof saved !== 'object') return fallback;
  const value = saved as Partial<LineTableSetting>;
  if (!Array.isArray(value.keys)) return fallback;
  const known = new Set(columns.map((item) => item.key));
  const locked = columns.filter((item) => item.locked).map((item) => item.key);
  const keys = [
    ...locked,
    ...new Set(
      value.keys.filter(
        (key): key is string =>
          typeof key === 'string' && known.has(key) && !locked.includes(key),
      ),
    ),
  ];
  const widths: Record<string, number> = {};
  for (const [key, width] of Object.entries(value.widths ?? {}))
    if (known.has(key) && Number.isFinite(width))
      widths[key] = clampWidth(Number(width));
  return { keys, widths };
}

export function clampWidth(width: number) {
  return Math.round(Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, width)));
}

/** 按设置得出要显示的列（顺序、宽度、锁定列固定在左侧）。 */
export function visibleColumns(
  columns: LineColumn[],
  setting: LineTableSetting,
) {
  const byKey = new Map(columns.map((item) => [item.key, item]));
  return setting.keys
    .map((key) => byKey.get(key))
    .filter((item): item is LineColumn => !!item)
    .map((item) => ({
      key: item.key,
      title: item.title,
      dataIndex: item.dataIndex ?? item.key,
      align: item.align,
      width: setting.widths[item.key] ?? item.width ?? DEFAULT_WIDTH,
      ellipsis: true,
      resizable: true,
      minWidth: MIN_WIDTH,
      maxWidth: MAX_WIDTH,
      ...(item.locked ? { fixed: 'left' as const } : {}),
    }));
}

export function tableWidth(columns: { width: number }[]) {
  return columns.reduce((sum, item) => sum + item.width, 0);
}

/** 把 from 位置的字段挪到 to 位置；锁定列不动，也不能被挤到锁定列前面。 */
export function moveKey(
  keys: string[],
  from: number,
  to: number,
  lockedCount: number,
) {
  if (from < lockedCount || to < lockedCount || from === to) return keys;
  if (from >= keys.length || to >= keys.length) return keys;
  const next = [...keys];
  const [key] = next.splice(from, 1);
  next.splice(to, 0, key as string);
  return next;
}

export function storageKey(table: string, userId: unknown) {
  return `fdm-line-table:${table}:${String(userId ?? 'anonymous')}`;
}

export function loadSetting(
  columns: LineColumn[],
  key: string,
): LineTableSetting {
  try {
    const raw = window.localStorage.getItem(key);
    return normalizeSetting(columns, raw ? JSON.parse(raw) : undefined);
  } catch {
    return defaultSetting(columns);
  }
}

export function saveSetting(key: string, setting: LineTableSetting) {
  try {
    window.localStorage.setItem(key, JSON.stringify(setting));
  } catch {
    // 无痕模式或存储被禁用时只在本次页面里生效
  }
}

export function clearSetting(key: string) {
  try {
    window.localStorage.removeItem(key);
  } catch {
    // 同上
  }
}
