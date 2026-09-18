import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  createDailyRefreshQueue,
  createDailySummaryCache,
  loadDailyPage,
  mergePlatformDetailRows,
} from './table-query';

afterEach(() => vi.useRealTimers());

describe('日报加载中刷新', () => {
  it('查询期间多次变更只在完成后补刷一次', () => {
    const refresh = vi.fn();
    const queue = createDailyRefreshQueue(refresh);
    queue.start();
    queue.request();
    queue.request();
    expect(queue.isPending()).toBe(true);
    expect(refresh).not.toHaveBeenCalled();
    queue.finish();
    expect(refresh).toHaveBeenCalledOnce();
    expect(queue.isPending()).toBe(false);
    queue.finish();
    expect(refresh).toHaveBeenCalledOnce();
  });

  it('空闲时立即刷新，失败结束也可补刷', () => {
    const refresh = vi.fn();
    const queue = createDailyRefreshQueue(refresh);
    queue.request();
    expect(refresh).toHaveBeenCalledOnce();
    queue.start();
    queue.request();
    // queryError 与 querySuccess 都调用 finish。
    queue.finish();
    expect(refresh).toHaveBeenCalledTimes(2);
  });

  it('卸载后迟到的查询完成不会再次发送请求', () => {
    const refresh = vi.fn();
    const queue = createDailyRefreshQueue(refresh);
    queue.start();
    queue.request();
    queue.dispose();
    queue.finish();
    queue.request();
    expect(refresh).not.toHaveBeenCalled();
  });
});

describe('日报当前页明细', () => {
  it('等待主表后仅按该页 ID 查询，保留主表顺序和总数', async () => {
    const getPage = vi
      .fn()
      .mockResolvedValue({ list: [{ id: 22 }, { id: 7 }], total: 9000 });
    const getDetails = vi.fn().mockImplementation(async () => {
      expect(getPage).toHaveBeenCalledOnce();
      return {
        list: [
          { daily_id: 999, matched_daily_id: 7, expense: 70 },
          { matched_daily_id: 22, expense: 220 },
        ],
        total: 2,
      };
    });
    const result = await loadDailyPage(
      { pageNo: 3, pageSize: 2, shopName: '店铺' },
      'JD',
      { getPage, getDetails },
      '__detail__',
    );
    expect(getDetails).toHaveBeenCalledExactlyOnceWith({
      dailyIds: [22, 7],
      pageNo: 1,
      pageSize: 2,
      platformCode: 'JD',
    });
    expect(result).toEqual({
      list: [
        { id: 22, __detail__matched_daily_id: 22, __detail__expense: 220 },
        {
          id: 7,
          __detail__daily_id: 999,
          __detail__matched_daily_id: 7,
          __detail__expense: 70,
        },
      ],
      total: 9000,
    });
  });

  it('空页与全部平台视图不请求明细', async () => {
    const getDetails = vi.fn();
    await loadDailyPage(
      {},
      'JD',
      { getPage: async () => ({ list: [], total: 0 }), getDetails },
      '__detail__',
    );
    await loadDailyPage(
      {},
      undefined,
      { getPage: async () => ({ list: [{ id: 1 }], total: 1 }), getDetails },
      '__detail__',
    );
    expect(getDetails).not.toHaveBeenCalled();
  });

  it('后端确定的 matched_daily_id 不再次按旧 ID 或业务键复制给其他行', () => {
    const sharedKey = {
      statDate: '2026-09-01',
      platformCode: 'JD',
      shopId: '',
      shopName: 'A',
    };
    const rows = [
      { id: 1, ...sharedKey },
      { id: 2, ...sharedKey },
    ];
    const result = mergePlatformDetailRows(
      rows,
      [{ ...sharedKey, matched_daily_id: 1, daily_id: 2, amount: 10 }],
      'd_',
    );
    expect(result[0]).toHaveProperty('d_amount', 10);
    expect(result[1]).toBe(rows[1]);
  });

  it('兼容旧接口业务键，但同名异 ID、空 ID 异名称不串行', () => {
    const common = { statDate: '2026-09-01', platformCode: 'JD' };
    const rows = [
      { id: 1, ...common, shopId: '1', shopName: 'A' },
      { id: 2, ...common, shopId: '2', shopName: 'A' },
      { id: 3, ...common, shopId: '', shopName: 'B' },
    ];
    const result = mergePlatformDetailRows(
      rows,
      [
        {
          stat_date: [2026, 9, 1],
          platform_code: 'JD',
          shop_id: '1',
          shop_name: 'A',
          amount: 0,
        },
      ],
      'd_',
    );
    expect(result[0]).toHaveProperty('d_amount', 0);
    expect(result[1]).toBe(rows[1]);
    expect(result[2]).toBe(rows[2]);
  });
});

describe('日报合计缓存', () => {
  it('并发请求和翻页共用合计，分页参数不发到汇总端点', async () => {
    const load = vi.fn().mockResolvedValue({ marketingCost: 100 });
    const cache = createDailySummaryCache(load);
    const first = cache.get({
      pageNo: 1,
      pageSize: 20,
      platformCode: 'JD',
      shopName: 'A',
    });
    const second = cache.get({
      shopName: 'A',
      platformCode: 'JD',
      pageNo: 2,
      pageSize: 50,
    });
    expect(first).toBe(second);
    await Promise.all([first, second]);
    await cache.get({ platformCode: 'JD', shopName: 'A', pageNo: 3 });
    expect(load).toHaveBeenCalledExactlyOnceWith({
      platformCode: 'JD',
      shopName: 'A',
    });
  });

  it('筛选变更、显式失效以及 TTL 到期重新查询', async () => {
    vi.useFakeTimers();
    const load = vi.fn().mockResolvedValue(100);
    const cache = createDailySummaryCache(load, 30_000);
    await cache.get({ shopName: 'A' });
    await cache.get({ shopName: 'B' });
    cache.clear();
    await cache.get({ shopName: 'B' });
    vi.advanceTimersByTime(30_001);
    await cache.get({ shopName: 'B' });
    expect(load).toHaveBeenCalledTimes(4);
  });

  it('变更后迟到的旧响应不覆盖新缓存', async () => {
    let resolveOld!: (value: number) => void;
    const load = vi
      .fn()
      .mockImplementationOnce(
        () =>
          new Promise<number>((resolve) => {
            resolveOld = resolve;
          }),
      )
      .mockResolvedValue(200);
    const cache = createDailySummaryCache(load);
    const old = cache.get({ shopName: 'A' });
    await Promise.resolve();
    cache.clear();
    expect(await cache.get({ shopName: 'A' })).toBe(200);
    resolveOld(100);
    expect(await old).toBe(100);
    expect(await cache.get({ shopName: 'A' })).toBe(200);
    expect(load).toHaveBeenCalledTimes(2);
  });

  it('请求失败可以重试，不把失败永久缓存', async () => {
    const load = vi
      .fn()
      .mockRejectedValueOnce(new Error('网络异常'))
      .mockResolvedValue(0);
    const cache = createDailySummaryCache(load);
    await expect(cache.get({})).rejects.toThrow('网络异常');
    expect(await cache.get({})).toBe(0);
    expect(load).toHaveBeenCalledTimes(2);
  });
});
