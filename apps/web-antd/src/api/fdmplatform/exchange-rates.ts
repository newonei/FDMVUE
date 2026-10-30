import type { Decimal } from './index';

import { requestClient } from '#/api/request';

export interface ExchangeRate {
  currency: string;
  rateToCny: Decimal;
  requestedDate: string;
  rateDate: string;
  source: string;
  fetchedAt: number | string;
  fallback: boolean;
  /** 手动修改时保留的来源公布值、来源名称、修改人和原因 */
  sourceRate?: Decimal | null;
  sourceName?: null | string;
  overriddenBy?: null | number;
  overriddenAt?: null | string;
  reason?: null | string;
}
export interface ExchangeRateBundle {
  requestedDate: string;
  rateDate: string;
  source: string;
  sourceUrl: string;
  fetchedAt: number | string;
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
/** 财务手动修改某日某币种汇率；rateToCny 为空表示恢复来源公布值 */
export function overrideExchangeRate(body: {
  currency: string;
  date: string;
  idempotencyKey: string;
  rateToCny?: null | string;
  reason?: string;
}) {
  return requestClient.post<ExchangeRateBundle>(`${base}/override`, body, {
    timeout: 120_000,
  });
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
