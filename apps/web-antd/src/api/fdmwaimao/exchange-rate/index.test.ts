import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  getExchangeRateCurrencies,
  getExchangeRateList,
  getExchangeRateQuote,
  refreshExchangeRates,
} from './index';

const requestMocks = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn(),
}));

vi.mock('#/api/request', () => ({
  requestClient: requestMocks,
}));

describe('fdmwaimao exchange-rate API contract', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requestMocks.get.mockResolvedValue([]);
    requestMocks.post.mockResolvedValue({});
  });

  it('uses the exact list, currencies, quote and refresh contracts', async () => {
    await getExchangeRateList({ date: '2026-08-28', keyword: 'usd' });
    await getExchangeRateCurrencies();
    await getExchangeRateQuote({
      date: '2026-08-28',
      fromCurrency: 'USD',
      toCurrency: 'CNY',
    });
    await refreshExchangeRates('2026-08-28');

    expect(requestMocks.get).toHaveBeenNthCalledWith(
      1,
      '/fdmwaimao/exchange-rate/list',
      { params: { date: '2026-08-28', keyword: 'usd' } },
    );
    expect(requestMocks.get).toHaveBeenNthCalledWith(
      2,
      '/fdmwaimao/exchange-rate/currencies',
    );
    expect(requestMocks.get).toHaveBeenNthCalledWith(
      3,
      '/fdmwaimao/exchange-rate/quote',
      {
        params: {
          date: '2026-08-28',
          fromCurrency: 'USD',
          toCurrency: 'CNY',
        },
      },
    );
    expect(requestMocks.post).toHaveBeenCalledWith(
      '/fdmwaimao/exchange-rate/refresh',
      undefined,
      { params: { date: '2026-08-28' } },
    );
  });
});
