import { describe, expect, it } from 'vitest';

import { referenceConvert, trendSummary } from '../exchange-rates/model';
import {
  cashAgo,
  cashPartyCsv,
  changeText,
  currencyMix,
  paidShare,
  rmb,
} from './model';

describe('finance cash presentation', () => {
  it('formats RMB totals and keeps unlabeled currencies apart', () => {
    expect(rmb('1234567')).toBe('¥123.5 万');
    expect(rmb(undefined)).toBe('—');
    const mix = currencyMix({
      count: 3,
      tier: 'ACTIVE',
      currencies: [
        { currency: 'USD', total: '120000', recent12: '0' },
        { currency: '', total: '500', recent12: '0' },
        { currency: 'EUR', total: '10', recent12: '0' },
      ],
    });
    expect(mix.text).toBe('USD 12.0 万 · 未注明币种 500');
    expect(mix.more).toBe(1);
  });

  it('compares periods with a multiple for tiny bases', () => {
    expect(changeText('150', '100')).toEqual({
      text: '比上年同期 +50%',
      tone: 'up',
    });
    expect(changeText('50', '100')).toEqual({
      text: '比上年同期 -50%',
      tone: 'down',
    });
    expect(changeText('1000', '10').text).toBe('是上年同期的 100 倍');
    expect(changeText('5', '0').tone).toBe('muted');
  });

  it('describes how long ago and the paid share of purchases', () => {
    expect(cashAgo('IN', 0)).toBe('今天回款');
    expect(cashAgo('OUT', 45)).toBe('1 个月前付款');
    expect(cashAgo('IN', null)).toBe('没有回款');
    expect(
      paidShare({
        count: 1,
        tier: 'ACTIVE',
        recent12: '60',
        purchaseRecent12: '100',
      }),
    ).toMatchObject({ percent: 60, tone: 'warn' });
    expect(
      paidShare({ count: 1, tier: 'ACTIVE', recent12: '60' }),
    ).toBeUndefined();
  });

  it('exports a BOM-prefixed CSV with quoted cells', () => {
    const csv = cashPartyCsv('IN', [
      {
        key: 'c1',
        name: 'Acme, Inc',
        code: 'C001',
        active: true,
        stats: {
          count: 2,
          tier: 'FOLLOW',
          recent12: '10',
          receivables: [{ currency: 'USD', amount: '5' }],
        },
      },
    ]);
    expect(csv.startsWith('﻿客户编号')).toBe(true);
    expect(csv).toContain('"Acme, Inc"');
    expect(csv).toContain('USD 5');
  });
});

describe('exchange rate trend and reference conversion', () => {
  it('summarizes stored points and converts both ways', () => {
    const view = trendSummary([
      { rateDate: '2026-09-01', rateToCny: '7.0' },
      { rateDate: '2026-09-02', rateToCny: '7.2' },
      { rateDate: '2026-09-03', rateToCny: '7.1' },
    ]);
    expect(view).toMatchObject({ first: 7, last: 7.1, max: 7.2, min: 7 });
    expect(view?.change).toBeCloseTo(1.4286, 3);
    expect(trendSummary([])).toBeUndefined();
    expect(referenceConvert(100, '7.1', true)).toBeCloseTo(710);
    expect(referenceConvert(710, '7.1', false)).toBeCloseTo(100);
    expect(referenceConvert(1, 0, true)).toBeUndefined();
  });
});
