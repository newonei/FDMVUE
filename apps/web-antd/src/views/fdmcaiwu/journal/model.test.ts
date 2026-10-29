import dayjs from 'dayjs';
import { describe, expect, it } from 'vitest';

import {
  copyForm,
  emptyForm,
  monthRange,
  monthRowSpans,
  nextForm,
  sumBy,
  toRmb,
} from './model';

describe('journal model', () => {
  it('converts to rmb with cent rounding and ignores missing values', () => {
    expect(toRmb('1000', '7.12345')).toBe(7123.45);
    expect(toRmb('', '7.1')).toBeUndefined();
    expect(toRmb('10', undefined)).toBeUndefined();
    expect(toRmb('10', 0)).toBeUndefined();
  });

  it('sums money by cents', () => {
    expect(sumBy([{ v: '0.1' }, { v: 0.2 }, { v: null }], (row) => row.v)).toBe(
      0.3,
    );
  });

  it('keeps date, account and handler when saving and continuing', () => {
    const form = {
      ...emptyForm('EXPENSE'),
      amount: '88',
      bankAccount: '工行',
      entryDate: '2026-10-01',
      handlerName: '张三',
      invoiceNo: 'F001',
      summary: '房租',
    };
    const next = nextForm(form);
    expect(next.entryDate).toBe('2026-10-01');
    expect(next.bankAccount).toBe('工行');
    expect(next.handlerName).toBe('张三');
    expect(next.amount).toBe('');
    expect(next.summary).toBeUndefined();
    expect(next.invoiceNo).toBeUndefined();
    expect(next.invoiceStatus).toBe('PENDING');
  });

  it('copies an entry as a new one dated today', () => {
    const copy = copyForm({
      ...emptyForm('INCOME'),
      amount: '5',
      entryDate: '2020-01-01',
      entryMonth: '2020-01',
      id: 9,
      rmbAmount: '5',
      source: 'IMPORT',
    });
    expect(copy.id).toBeUndefined();
    expect(copy.entryDate).toBe(dayjs().format('YYYY-MM-DD'));
    expect(copy.entryMonth).toBeUndefined();
    expect(copy.amount).toBe('5');
  });

  it('builds month presets', () => {
    const today = dayjs('2026-01-15');
    expect(monthRange('thisMonth', today)).toEqual(['2026-01', '2026-01']);
    expect(monthRange('lastMonth', today)).toEqual(['2025-12', '2025-12']);
    expect(monthRange('thisYear', today)).toEqual(['2026-01', '2026-01']);
    expect(monthRange('all', today)).toBeUndefined();
  });

  it('merges month cells in summary', () => {
    expect(
      monthRowSpans([
        { month: '2026-10' },
        { month: '2026-10' },
        { month: '2026-09' },
      ]),
    ).toEqual([2, 0, 1]);
  });
});
