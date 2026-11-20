import { describe, expect, it } from 'vitest';

import {
  contractEquivalent,
  conversionDateNote,
  conversionInput,
  hasReceiptFx,
  receiptFxDisplay,
  validateBackfillRange,
} from './model';

describe('validateBackfillRange', () => {
  const today = '2026-11-19';

  it('accepts a one-day range and counts both dates in the 31-day limit', () => {
    expect(validateBackfillRange(today, today, today)).toBe('');
    expect(validateBackfillRange('2026-10-20', today, today)).toBe('');
    expect(validateBackfillRange('2026-10-19', today, today)).toContain(
      '31 天',
    );
  });

  it('rejects missing, invalid, reversed, future and unsupported dates', () => {
    expect(validateBackfillRange('', today, today)).toContain('请选择');
    expect(validateBackfillRange('2026-02-30', today, today)).toContain('有效');
    expect(validateBackfillRange(today, '2026-11-18', today)).toContain('早于');
    expect(validateBackfillRange(today, '2026-11-20', today)).toContain(today);
    expect(validateBackfillRange('1999-01-03', today, today)).toContain(
      '1999-01-04',
    );
  });
});

describe('contractEquivalent', () => {
  it('converts through CNY with both same-day rates, rounded half up to cents', () => {
    expect(contractEquivalent('7100', '1', '7.1')).toBe('1000.00');
    expect(contractEquivalent('200', '7.8', '7.1')).toBe('219.72');
    expect(contractEquivalent('100', '9', '7.2')).toBe('125.00');
  });
  it('refuses a missing or zero contract rate', () => {
    expect(contractEquivalent('100', '9', '0')).toBeUndefined();
    expect(contractEquivalent('100', '9', '')).toBeUndefined();
  });
});
describe('receipt reference exchange rate presentation', () => {
  it('requires valid conversion inputs and normalizes currency without calculating a rate locally', () => {
    expect(conversionInput('2026-09-06', ' usd ', '125.50')).toEqual({
      date: '2026-09-06',
      currency: 'USD',
      amount: '125.50',
    });
    for (const amount of [undefined, '', '-1', 'not-a-number', 0])
      expect(conversionInput('2026-09-06', 'USD', amount)).toBeUndefined();
    expect(conversionInput(undefined, 'USD', 10)).toBeUndefined();
    expect(conversionInput('2026-09-06', '美元', 10)).toBeUndefined();
  });
  it('shows the prior publication date instead of presenting a holiday as the rate date', () => {
    expect(
      conversionDateNote({
        requestedDate: '2026-09-06',
        rateDate: '2026-09-04',
        fallback: true,
      }),
    ).toContain('采用此前 2026-09-04');
    expect(
      conversionDateNote({
        requestedDate: '2026-09-04',
        rateDate: '2026-09-04',
        fallback: false,
      }),
    ).toBe('采用 2026-09-04 的参考汇率。');
  });
  it('does not turn missing historical snapshots into zero RMB or an assumed exchange rate', () => {
    expect(hasReceiptFx({ amount: 125, currency: 'USD' })).toBe(false);
    expect(receiptFxDisplay({}, 'rmbAmount')).toBe('待补齐');
    expect(
      receiptFxDisplay({ exchangeRateFallback: false }, 'exchangeRateFallback'),
    ).toBe('待补齐');
    expect(receiptFxDisplay({}, 'amount')).toBeUndefined();
  });
  it('shows stored RMB amounts including zero and signed reversals without recomputing them', () => {
    const snapshot = {
      exchangeRateToCny: '7.1',
      exchangeRateDate: '2026-09-04',
      exchangeRateFallback: true,
      rmbAmount: '0',
    };
    expect(hasReceiptFx(snapshot)).toBe(true);
    expect(receiptFxDisplay(snapshot, 'rmbAmount')).toBe('CNY 0.00');
    expect(
      receiptFxDisplay({ ...snapshot, rmbAmount: '-710.00' }, 'rmbAmount'),
    ).toBe('CNY -710.00');
    expect(receiptFxDisplay(snapshot, 'exchangeRateFallback')).toBe(
      '此前公布日',
    );
    expect(
      receiptFxDisplay(
        { ...snapshot, exchangeRateSource: 'CFETS' },
        'exchangeRateSource',
      ),
    ).toBe('中国外汇交易中心中间价');
  });
});
