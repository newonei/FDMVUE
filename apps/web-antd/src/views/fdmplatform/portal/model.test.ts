import type { PortalSummary, PortalTodo } from '#/api/fdmplatform/portal';

import { describe, expect, it } from 'vitest';

import {
  actionableCount,
  daysUntil,
  moneyLines,
  pickTrend,
  portalDefinitions,
} from './model';

const todo = (key: string, count: number, extra: Partial<PortalTodo> = {}) =>
  ({ key, count, preview: '', ...extra }) as PortalTodo;
const target = (
  department: keyof typeof portalDefinitions,
  key: string,
  value: PortalTodo,
) =>
  portalDefinitions[department].todos
    .find((entry) => entry.key === key)!
    .target(value);

describe('department portal model', () => {
  it('keeps every currency on its own line, largest first', () => {
    expect(moneyLines({ CNY: '78100', USD: 1010.5 })).toEqual([
      'CNY 78,100',
      'USD 1,010.5',
    ]);
    expect(moneyLines(undefined)).toEqual([]);
    expect(moneyLines({ CNY: 0, USD: '0.00' })).toEqual([]);
  });

  it('opens a single waiting contract directly and several as a filtered list', () => {
    expect(
      target('trade', 'draft', todo('draft', 1, { contractId: 'c1' })),
    ).toEqual({
      path: '/fdmwaimao/platform-contracts',
      query: { contractId: 'c1' },
    });
    expect(
      target('trade', 'draft', todo('draft', 2, { contractId: 'c1' })),
    ).toEqual({
      path: '/fdmwaimao/platform-contracts',
      query: { mine: 'true', status: 'DRAFT' },
    });
    expect(target('purchase', 'quote', todo('quote', 3))).toEqual({
      path: '/fdmprocurement/platform-tasks',
      query: { stage: 'quote', mine: 'true' },
    });
    expect(
      target(
        'finance',
        'receipt',
        todo('receipt', 1, { contractId: 'c1', recordId: 'r1' }),
      ).query,
    ).toEqual({ view: 'receipts', contractId: 'c1', documentId: 'r1' });
    expect(target('finance', 'history', todo('history', 9)).query).toEqual({
      view: 'receipts',
      scope: 'pending',
    });
  });

  it('counts only work that someone can do today', () => {
    const summary = {
      todos: [todo('draft', 1), todo('receipt', 2), todo('history', 11_708)],
    } as PortalSummary;
    expect(actionableCount(summary)).toBe(3);
  });

  it('charts the largest series and names the others', () => {
    const trend = pickTrend({
      months: ['2026-08', '2026-09'],
      series: { CNY: [100, 0], USD: [0, 5000] },
    });
    expect(trend).toMatchObject({
      key: 'USD',
      values: [0, 5000],
      months: ['8月', '9月'],
      others: ['CNY'],
    });
    expect(pickTrend(undefined).values).toEqual([]);
  });

  it('counts days to a due date and marks overdue ones negative', () => {
    const today = new Date(2026, 8, 29);
    expect(daysUntil('2026-09-30', today)).toBe(1);
    expect(daysUntil('2026-09-11', today)).toBe(-18);
    expect(daysUntil(undefined, today)).toBeUndefined();
  });
});
