import type { PageParam, PageResult } from '@vben/request';

type DetailRow = Record<string, any>;
type DailyRow = { id: number };

function normalizeKeyPart(value: unknown): string {
  return String(value ?? '').trim();
}

function normalizeDateKey(value: unknown): string {
  if (Array.isArray(value) && value.length >= 3) {
    const [year, month, day] = value;
    return [
      String(year).padStart(4, '0'),
      String(month).padStart(2, '0'),
      String(day).padStart(2, '0'),
    ].join('-');
  }
  return normalizeKeyPart(value).slice(0, 10);
}

function detailMergeKey(row: DetailRow) {
  return [
    normalizeDateKey(row.statDate ?? row.stat_date),
    normalizeKeyPart(row.platformCode ?? row.platform_code).toUpperCase(),
    normalizeKeyPart(row.shopId ?? row.shop_id),
    normalizeKeyPart(row.shopName ?? row.shop_name),
  ].join('|');
}

export function mergePlatformDetailRows<T extends DailyRow>(
  rows: T[],
  details: DetailRow[],
  fieldPrefix: string,
): T[] {
  const byDailyId = new Map<string, DetailRow>();
  const byBizKey = new Map<string, DetailRow>();
  for (const detail of details) {
    const dailyId = detail.matched_daily_id ?? detail.daily_id;
    if (dailyId !== null && dailyId !== undefined) {
      byDailyId.set(String(dailyId), detail);
    }
    // 新接口已经确定关联，不能把它再按业务键复制到另一条主表记录。
    if (
      detail.matched_daily_id === null ||
      detail.matched_daily_id === undefined
    ) {
      byBizKey.set(detailMergeKey(detail), detail);
    }
  }
  return rows.map((row) => {
    const detail =
      byDailyId.get(String(row.id)) ?? byBizKey.get(detailMergeKey(row));
    if (!detail) return row;
    const merged: DetailRow = { ...row };
    for (const [key, value] of Object.entries(detail)) {
      merged[`${fieldPrefix}${key}`] = value;
    }
    return merged as T;
  });
}

/** 明细页顺序与主表不同，必须先得到当前页 ID，不能复用页码或查询全量明细。 */
export async function loadDailyPage<T extends DailyRow>(
  params: PageParam,
  platformCode: string | undefined,
  api: {
    getDetails: (
      params: PageParam & { dailyIds: number[]; platformCode: string },
    ) => Promise<PageResult<DetailRow>>;
    getPage: (params: PageParam) => Promise<PageResult<T>>;
  },
  fieldPrefix: string,
): Promise<PageResult<T>> {
  const page = await api.getPage(params);
  if (!platformCode || page.list.length === 0) return page;
  const dailyIds = [...new Set(page.list.map((row) => row.id))];
  const detailPage = await api.getDetails({
    dailyIds,
    pageNo: 1,
    pageSize: dailyIds.length,
    platformCode,
  });
  return {
    ...page,
    list: mergePlatformDetailRows(page.list, detailPage.list, fieldPrefix),
  };
}

/** 组件内仅缓存一个筛选，复用切页请求；失效后旧 Promise 不会写回新缓存。 */
export function createDailySummaryCache<T>(
  load: (params: PageParam) => Promise<T>,
  ttlMs = 30_000,
) {
  let entry:
    | { expiresAt: number; key: string; promise: Promise<T> }
    | undefined;
  return {
    clear() {
      entry = undefined;
    },
    get(params: PageParam): Promise<T> {
      const filters = Object.fromEntries(
        Object.entries(params)
          .filter(([key]) => key !== 'pageNo' && key !== 'pageSize')
          .sort(([a], [b]) => a.localeCompare(b)),
      );
      const key = JSON.stringify(filters);
      if (entry?.key === key && entry.expiresAt > Date.now())
        return entry.promise;
      const current = {
        expiresAt: Number.POSITIVE_INFINITY,
        key,
        promise: Promise.resolve().then(() => load(filters)),
      };
      entry = current;
      current.promise = current.promise.then(
        (value) => {
          if (entry === current) current.expiresAt = Date.now() + ttlMs;
          return value;
        },
        (error: unknown) => {
          if (entry === current) entry = undefined;
          throw error;
        },
      );
      return current.promise;
    },
  };
}

/** VXE 查询中会忽略新的 query；待 querySuccess/queryError 后合并补刷一次。 */
export function createDailyRefreshQueue(refresh: () => void) {
  let active = false;
  let pending = false;
  let disposed = false;
  return {
    dispose() {
      disposed = true;
      pending = false;
    },
    finish() {
      active = false;
      if (pending && !disposed) {
        pending = false;
        refresh();
      }
    },
    isPending() {
      return pending;
    },
    request() {
      if (disposed) return;
      if (active) {
        pending = true;
      } else {
        refresh();
      }
    },
    start() {
      active = true;
    },
  };
}
