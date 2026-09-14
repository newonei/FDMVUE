import type { BusinessRecord } from '#/api/fdmplatform';

import { describe, expect, it } from 'vitest';

import {
  stockLocation,
  stockNavigationView,
  withoutStockQuery,
} from './stock-navigation';

const pools: BusinessRecord[] = [
  {
    id: 'pool-a',
    skuId: 'product-a',
    onHand: '12',
    events: [
      { id: 'event-a', deltaOnHand: '10' },
      { id: 'event-b', deltaOnHand: '2' },
    ],
    reservations: [{ id: 'reservation-a', remainingQuantity: '4' }],
  },
  {
    id: 'pool-b',
    skuId: 'product-b',
    onHand: '30',
    events: [{ id: 'event-other', deltaOnHand: '30' }],
    reservations: [{ id: 'reservation-b', remainingQuantity: '5' }],
  },
];

describe('stock deep-link destination', () => {
  it('shows all pools and their immutable events when no stock filter exists', () => {
    const result = stockNavigationView(pools, 'inventory-stock', {});
    expect(result.status).toBe('all');
    expect(result.filtered).toBe(false);
    expect(result.pools).toEqual(pools);
    expect(result.events.map((event) => [event.id, event.poolId])).toEqual([
      ['event-a', 'pool-a'],
      ['event-b', 'pool-a'],
      ['event-other', 'pool-b'],
    ]);
  });
  it('locates only the specified pool and its reservations and events', () => {
    const result = stockNavigationView(pools, 'inventory-stock', {
      poolId: 'pool-a',
    });
    expect(result.status).toBe('located');
    expect(result.filtered).toBe(true);
    expect(result.pools.map((pool) => pool.id)).toEqual(['pool-a']);
    expect(result.events.map((event) => event.id)).toEqual([
      'event-a',
      'event-b',
    ]);
    expect(result.reservations.map((entry) => entry.id)).toEqual([
      'reservation-a',
    ]);
    expect(pools).toHaveLength(2);
  });
  it('locates an event past any previous table page and keeps its pool context', () => {
    const manyEvents = Array.from({ length: 50 }, (_, index) => ({
      id: `event-${index}`,
    }));
    const result = stockNavigationView(
      [{ ...pools[0]!, events: manyEvents }],
      'inventory-stock',
      {
        poolId: 'pool-a',
        eventId: 'event-49',
      },
    );
    expect(result.events).toEqual([{ id: 'event-49', poolId: 'pool-a' }]);
    expect(result.pools.map((pool) => pool.id)).toEqual(['pool-a']);
    expect(result.message).toContain('event-49');
  });
  it('recomputes selection when pool or event changes on the same page', () => {
    const first = stockNavigationView(pools, 'inventory-stock', {
      poolId: 'pool-a',
      eventId: 'event-a',
    });
    const second = stockNavigationView(pools, 'inventory-stock', {
      poolId: 'pool-b',
      eventId: 'event-other',
    });
    expect(first.events.map((event) => event.id)).toEqual(['event-a']);
    expect(second.events.map((event) => event.id)).toEqual(['event-other']);
    expect(second.reservations.map((entry) => entry.id)).toEqual([
      'reservation-b',
    ]);
  });
  it('does not mistake another pool event for the requested relationship', () => {
    const result = stockNavigationView(pools, 'inventory-stock', {
      poolId: 'pool-a',
      eventId: 'event-other',
    });
    expect(result.status).toBe('missing');
    expect(result.message).toContain('未在关联库存池中找到该流水');
    expect(result.pools).toEqual([]);
    expect(result.events).toEqual([]);
    expect(result.reservations).toEqual([]);
  });
  it('explicitly reports a missing pool without falling back to the full inventory', () => {
    const result = stockNavigationView(pools, 'inventory-stock', {
      poolId: 'missing',
    });
    expect(result.status).toBe('missing');
    expect(result.message).toContain('未找到关联库存池');
    expect(result.pools).toEqual([]);
  });
  it('rejects blank, repeated or parentless references', () => {
    for (const query of [
      { poolId: '' },
      { poolId: ['pool-a'] },
      { eventId: 'event-a' },
    ]) {
      expect(() => stockLocation('inventory-stock', query)).toThrow(
        '库存链接缺少有效的库存池',
      );
      expect(
        stockNavigationView(pools, 'inventory-stock', query).pools,
      ).toEqual([]);
    }
    for (const eventId of ['', null, ['event-a']]) {
      const result = stockNavigationView(pools, 'inventory-stock', {
        poolId: 'pool-a',
        eventId,
      });
      expect(result.status).toBe('invalid');
      expect(result.message).toContain('库存流水链接无效');
    }
  });
  it('waits for fresh inventory before judging missing targets and reports load failures', () => {
    const query = { poolId: 'pool-a', eventId: 'event-a' };
    const loading = stockNavigationView([], 'inventory-stock', query, {
      loading: true,
    });
    expect(loading.status).toBe('loading');
    expect(loading.pools).toEqual([]);
    const failed = stockNavigationView(pools, 'inventory-stock', query, {
      error: '读取库存失败',
    });
    expect(failed.status).toBe('unavailable');
    expect(failed.message).toContain('读取库存失败');
    expect(failed.events).toEqual([]);
    expect(stockNavigationView(pools, 'inventory-stock', query).status).toBe(
      'located',
    );
  });
  it('ignores even malformed stock queries on unrelated workspaces', () => {
    for (const workspace of [
      'trade-contracts',
      'purchase-tasks',
      'finance-receipts',
      'admin-master',
    ]) {
      const query = { poolId: ['invalid'], eventId: null };
      expect(stockLocation(workspace, query)).toBeUndefined();
      const result = stockNavigationView(pools, workspace, query);
      expect(result.status).toBe('all');
      expect(result.filtered).toBe(false);
      expect(result.pools).toEqual(pools);
    }
  });
  it('clears both stock references and preserves unrelated list context without mutation', () => {
    const query = {
      poolId: 'pool-a',
      eventId: 'event-a',
      keyword: '瑜伽垫',
      contractId: 'contract-a',
    };
    const cleared = withoutStockQuery(query);
    expect(cleared).toEqual({ keyword: '瑜伽垫', contractId: 'contract-a' });
    expect(query.eventId).toBe('event-a');
    expect(
      stockNavigationView(pools, 'inventory-stock', cleared).pools,
    ).toHaveLength(2);
  });
});
