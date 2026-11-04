import type {
  CompanyBoard,
  CompanySales,
} from '#/api/fdmplatform/company-board';

import { describe, expect, it } from 'vitest';

import { compactMoney, delta } from '../shared/format';
import { heroOption, LIGHT_PALETTE } from './charts';
import {
  agingRows,
  alignMonths,
  buildAlerts,
  buildKpis,
  buildLines,
  buildMetrics,
  topCustomers,
  trailingMonths,
} from './model';

const months = trailingMonths('2026-10', 24);

function sales(channel: 'DOMESTIC' | 'FOREIGN', extra: Partial<CompanySales> = {}): CompanySales {
  const signed = months.map(() => 100);
  signed[23] = 300;
  signed[11] = 200;
  return {
    active: { amount: 5000, count: 4 },
    asOf: '2026-10-09',
    channel,
    contracts: months.map(() => 1),
    currency: 'CNY',
    due: { overdue: 0, soon: 1, soonDays: 7 },
    historyContracts: 0,
    lastMonth: { amount: 100, count: 1 },
    lastYearMonth: { amount: 200, count: 1 },
    lastYtd: { amount: 1000, count: 10 },
    months,
    previous12: { amount: 1300, count: 12 },
    recent12: { amount: 1300, count: 12 },
    signed,
    stages: {},
    thisMonth: { amount: 300, count: 1 },
    topCustomers: [{ amount: 900, contracts: 3, id: `${channel}-a`, name: `${channel} A` }],
    unconverted: [],
    unpaid: { amount: 800, count: 2 },
    ytd: { amount: 1200, count: 10 },
    ...extra,
  };
}

function board(extra: Partial<CompanyBoard> = {}): CompanyBoard {
  return {
    domestic: sales('DOMESTIC'),
    foreign: sales('FOREIGN'),
    generatedAt: '2026-10-09T02:00:00Z',
    sections: ['foreign', 'domestic'],
    unavailable: [],
    ...extra,
  };
}

describe('format', () => {
  it('compacts money into 万 and 亿', () => {
    expect(compactMoney(8620)).toBe('¥8,620');
    expect(compactMoney(126_000)).toBe('¥12.6万');
    expect(compactMoney(5_416_000)).toBe('¥542万');
    expect(compactMoney(128_000_000)).toBe('¥1.28亿');
    expect(compactMoney(null)).toBe('—');
  });

  it('rates change by whether up is good and has no base without a previous value', () => {
    expect(delta(120, 100)).toMatchObject({ direction: 'up', text: '+20.0%', tone: 'good' });
    expect(delta(80, 100, false)).toMatchObject({ direction: 'down', tone: 'good' });
    expect(delta(120, 100, null)?.tone).toBe('neutral');
    expect(delta(10, 0)).toBeNull();
  });
});

describe('company board model', () => {
  it('builds trailing months across a year boundary and aligns by month', () => {
    expect(trailingMonths('2026-02', 3)).toEqual(['2025-12', '2026-01', '2026-02']);
    expect(alignMonths(['2026-01', '2026-02'], ['2026-02'], [5])).toEqual([0, 5]);
  });

  it('sums both business lines into the signed tile and compares with last year', () => {
    const kpis = buildKpis({ board: board(), ec: null, factories: [], today: '2026-10-09' }, months);
    const signed = kpis.find((tile) => tile.key === 'signed')!;
    expect(signed.value).toBe('¥2,400');
    expect(signed.delta?.text).toBe('+20.0%');
    expect(signed.compare).toBe('去年同期 ¥2,000');
    expect(signed.metric).toBe('signed');
    // 没有收付、采购、电商时只出签约和未回款；未回款点击进入明细，不切换主图
    expect(kpis.map((tile) => tile.key)).toEqual(['signed', 'unpaid']);
    expect(kpis[1]!.metric).toBeUndefined();
  });

  it('shows only the sections the account received', () => {
    const tradeOnly = board({ domestic: undefined, sections: ['foreign'] });
    const input = { board: tradeOnly, ec: null, factories: [], today: '2026-10-09' };
    expect(buildLines(input).map((line) => line.key)).toEqual(['foreign']);
    expect(buildMetrics(input, months).map((metric) => metric.key)).toEqual(['signed']);
    expect(agingRows(tradeOnly)).toBeNull();
  });

  it('raises overdue delivery, old receivables and missing rates, most urgent first', () => {
    const foreign = sales('FOREIGN', {
      aging: {
        D30: { amount: 100, count: 1 },
        D60: { amount: 0, count: 0 },
        D90: { amount: 0, count: 0 },
        OVER90: { amount: 300, count: 2 },
        UNSHIPPED: { amount: 0, count: 0 },
      },
      due: { overdue: 3, soon: 1, soonDays: 7 },
      unconverted: ['EUR'],
    });
    const input = { board: board({ foreign }), ec: null, factories: [], today: '2026-10-09' };
    expect(buildAlerts(input).map((alert) => alert.level)).toEqual(['critical', 'serious', 'warning']);
    const aging = agingRows(input.board)!;
    expect(aging.rows.find((row) => row.bucket === 'OVER90')?.share).toBe(75);
    expect(aging.total).toBe(400);
  });

  it('flags stale e-commerce data', () => {
    const ec = {
      dataMaxDate: '2026-10-01',
      highRefund: 0,
      latest: 23,
      lastYtd: 100,
      marketing: months.map(() => 0),
      months,
      orders: months.map(() => 0),
      refund: months.map(() => 0),
      sales: months.map(() => 10),
      shops: 2,
      ytd: 100,
      zeroSalesWithCost: 1,
    };
    const alerts = buildAlerts({ board: null, ec, factories: [], today: '2026-10-09' });
    expect(alerts.map((alert) => alert.key)).toEqual(['ec-zero', 'ec-lag']);
    expect(alerts[1]!.level).toBe('serious');
  });

  it('merges customers from both lines by amount', () => {
    const domestic = sales('DOMESTIC', {
      topCustomers: [{ amount: 1200, contracts: 1, id: 'd', name: '内销大客户' }],
    });
    const rows = topCustomers(board({ domestic }));
    expect(rows.map((row) => row.name)).toEqual(['内销大客户', 'FOREIGN A']);
    expect(rows[0]!.tag).toBe('内销');
  });

  it('notes the history migration gap only when it is old and recent', () => {
    const foreign = sales('FOREIGN', { migratedUntil: '2026-09-08' });
    const domestic = sales('DOMESTIC', { migratedUntil: '2026-08-20' });
    const input = { board: board({ domestic, foreign }), ec: null, factories: [], today: '2026-10-09' };
    const signed = buildMetrics(input, months)[0]!;
    expect(signed.gapFrom).toBe('2026-09-08');
    expect(signed.gapNote).toContain('9月8日');
    // 离今天不到 20 天不提示
    const fresh = buildMetrics({ ...input, today: '2026-09-20' }, months)[0]!;
    expect(fresh.gapNote).toBeUndefined();
  });

  it('compares the running total with last year and stacks both lines by month', () => {
    const input = { board: board(), ec: null, factories: [], today: '2026-10-09' };
    const signed = buildMetrics(input, months)[0]!;
    // 去年 1–12 月每月两条线各 100，其中 2025-10 各 200
    expect(signed.lastYearTotal).toBe(2600);
    const cumulative = heroOption(signed, months, 'cumulative', LIGHT_PALETTE) as any;
    expect(cumulative.series.map((item: any) => item.name)).toEqual(['2025 年', '2026 年']);
    expect(cumulative.series[0].data).toHaveLength(12);
    // 今年只画到本月
    expect(cumulative.series[1].data).toHaveLength(10);
    expect(cumulative.series[1].data.at(-1)).toBe(2400);
    const monthly = heroOption(signed, months, 'monthly', LIGHT_PALETTE) as any;
    expect(monthly.series.map((item: any) => item.type)).toEqual(['bar', 'bar', 'line']);
    expect(monthly.series[2].data.at(-1)).toBe(400);
    expect(Array.isArray(monthly.yAxis)).toBe(false);
  });
});
