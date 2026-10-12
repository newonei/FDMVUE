import type { Decimal } from './index';

import { requestClient } from '#/api/request';

export interface ExchangeRate {
  currency: string;
  rateToCny: Decimal;
  requestedDate: string;
  rateDate: string;
  source: string;
  fetchedAt: string;
  fallback: boolean;
}
export interface ExchangeRateBundle {
  requestedDate: string;
  rateDate: string;
  source: string;
  sourceUrl: string;
  fetchedAt: string;
  fallback: boolean;
  rows: ExchangeRate[];
}
export interface ReceiptConversion extends ExchangeRate {
  rmbAmount: Decimal;
}
const base = '/fdmplatform/v1/fx-rates';
export function getExchangeRates(date: string) {
  return requestClient.get<ExchangeRateBundle>(base, {
    params: { date },
    timeout: 120_000,
  });
}
export function fetchExchangeRates(date: string, idempotencyKey: string) {
  return requestClient.post<ExchangeRateBundle>(
    `${base}/fetch`,
    { date, idempotencyKey },
    { timeout: 120_000 },
  );
}
export function convertReceiptToRmb(params: {
  amount: Decimal;
  currency: string;
  date: string;
}) {
  return requestClient.get<ReceiptConversion>(`${base}/convert`, {
    params,
    timeout: 120_000,
  });
}
export interface ExchangeRatePoint {
  rateDate: string;
  rateToCny: Decimal;
}
/** 只读已保存的每日参考值；同一来源日期只出现一次。 */
export function getExchangeRateHistory(currency: string, days: number) {
  return requestClient.get<ExchangeRatePoint[]>(`${base}/history`, {
    params: { currency, days },
  });
}
