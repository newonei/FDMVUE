import type { BusinessRecord } from '#/api/fdmplatform';

import { rows } from '../data';
import { referenceId } from './navigation';

interface StockLocation {
  poolId: string;
  eventId?: string;
}
interface StockNavigationView {
  pools: BusinessRecord[];
  events: BusinessRecord[];
  reservations: BusinessRecord[];
  filtered: boolean;
  status: 'all' | 'invalid' | 'loading' | 'located' | 'missing' | 'unavailable';
  message: string;
}

export function stockLocation(
  workspace: string,
  query: Record<string, unknown>,
): StockLocation | undefined {
  if (workspace !== 'inventory-stock') return undefined;
  if (query.poolId === undefined && query.eventId === undefined)
    return undefined;
  const poolId = referenceId(query.poolId);
  const eventId = referenceId(query.eventId);
  if (!poolId)
    throw new Error('库存链接缺少有效的库存池，请从产品详情重新打开');
  if (query.eventId !== undefined && !eventId)
    throw new Error('库存流水链接无效，请从产品详情重新打开');
  return { poolId, ...(eventId ? { eventId } : {}) };
}

export function withoutStockQuery<T extends Record<string, unknown>>(query: T) {
  const next = { ...query };
  Reflect.deleteProperty(next, 'poolId');
  Reflect.deleteProperty(next, 'eventId');
  return next;
}

function poolRows(pools: BusinessRecord[]) {
  return {
    pools,
    events: pools.flatMap((pool) =>
      rows(pool.events).map((event) => ({ ...event, poolId: pool.id })),
    ),
    reservations: pools.flatMap((pool) =>
      rows(pool.reservations).map((reservation) => ({
        ...reservation,
        poolId: pool.id,
      })),
    ),
  };
}

export function stockNavigationView(
  pools: BusinessRecord[],
  workspace: string,
  query: Record<string, unknown>,
  state: { error?: string; loading?: boolean } = {},
): StockNavigationView {
  const empty = { pools: [], events: [], reservations: [], filtered: true };
  let location: StockLocation | undefined;
  try {
    location = stockLocation(workspace, query);
  } catch (error) {
    return {
      ...empty,
      status: 'invalid',
      message: error instanceof Error ? error.message : '库存链接无效',
    };
  }
  if (!location)
    return { ...poolRows(pools), filtered: false, status: 'all', message: '' };
  if (state.loading)
    return { ...empty, status: 'loading', message: '正在读取并定位关联库存…' };
  if (state.error)
    return {
      ...empty,
      status: 'unavailable',
      message: `暂时无法定位库存：${state.error}。请刷新数据后重试。`,
    };
  const pool = pools.find((item) => item.id === location.poolId);
  if (!pool)
    return {
      ...empty,
      status: 'missing',
      message: '未找到关联库存池，可能已不可访问。请核对来源或清除库存定位。',
    };
  const selected = poolRows([pool]);
  if (location.eventId) {
    selected.events = selected.events.filter(
      (event) => event.id === location.eventId,
    );
    if (selected.events.length === 0)
      return {
        ...empty,
        status: 'missing',
        message: '未在关联库存池中找到该流水。请核对来源或清除库存定位。',
      };
  }
  return {
    ...selected,
    filtered: true,
    status: 'located',
    message: `已定位库存池 ${location.poolId}${location.eventId ? `；库存流水 ${location.eventId}（仅显示此条流水）` : '（仅显示该池余额、预留与流水）'}`,
  };
}
