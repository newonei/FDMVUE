import { describe, expect, it } from 'vitest';

import { orderedAgo, rmb, supplierCsv, supplierTrend } from './model';

describe('supplier model', () => {
  it('describes how long ago the last order was', () => {
    expect(orderedAgo(undefined)).toBe('没有下过单');
    expect(orderedAgo(0)).toBe('今天下单');
    expect(orderedAgo(12)).toBe('12 天前下单');
    expect(orderedAgo(95)).toBe('3 个月前下单');
    expect(orderedAgo(800)).toBe('2 年 2 个月前下单');
  });
  it('compares the last 12 months with the 12 before', () => {
    expect(supplierTrend(undefined).text).toBe('没有下过单');
    const base = { orders: 3, tier: 'ACTIVE' as const, openOrders: 0 };
    expect(supplierTrend({ ...base, recent12Amount: 0 }).text).toBe(
      '近 12 个月没有下单',
    );
    expect(
      supplierTrend({ ...base, recent12Amount: 5, previous12Amount: 0 }).text,
    ).toBe('上年同期没有下单');
    expect(
      supplierTrend({ ...base, recent12Amount: 150, previous12Amount: 100 }),
    ).toEqual({ text: '比上年同期 +50%', tone: 'up' });
    expect(
      supplierTrend({ ...base, recent12Amount: 50, previous12Amount: 100 }),
    ).toEqual({ text: '比上年同期 -50%', tone: 'down' });
    expect(
      supplierTrend({ ...base, recent12Amount: 2700, previous12Amount: 100 })
        .text,
    ).toBe('是上年同期的 27 倍');
  });
  it('formats department totals in RMB', () => {
    expect(rmb(58_283_078)).toBe('¥5,828.3 万');
    expect(rmb(undefined)).toBe('—');
  });
  it('exports an Excel-readable CSV with quoted cells', () => {
    const csv = supplierCsv([
      {
        id: 's1',
        type: 'SUPPLIER',
        companyId: 0,
        code: 'GYS1',
        name: '工厂,甲',
        sourceSystem: 'JINZHI',
        active: true,
        stats: {
          orders: 2,
          tier: 'ACTIVE',
          openOrders: 1,
          currency: 'CNY',
          recent12Amount: 100,
          topItems: ['PE', 'POE'],
        },
      },
    ]);
    expect(csv.startsWith('﻿供应商编码,供应商名称')).toBe(true);
    expect(csv).toContain('GYS1,"工厂,甲",启用,常用,100,,,CNY,2,0,,,1,PE、POE');
  });
});
