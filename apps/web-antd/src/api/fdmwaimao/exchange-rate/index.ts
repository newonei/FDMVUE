import { requestClient } from '#/api/request';

export namespace FdmWaimaoExchangeRateApi {
  export type DecimalValue = string;
  export type LocalDateValue = [number, number, number] | string;

  export interface CurrencyOption {
    code: string;
    name: string;
  }

  export interface RateItem {
    currencyCode: string;
    currencyName: string;
    currencyToCnyRate: DecimalValue;
    fallbackUsed: boolean;
    provider: string;
    rateDate: LocalDateValue;
    retrievedAt?: null | number | string;
    requestedDate: LocalDateValue;
  }

  export interface Quote {
    fallbackUsed: boolean;
    fromCurrency: string;
    provider: string;
    rate: DecimalValue;
    rateDate: LocalDateValue;
    retrievedAt?: null | number | string;
    requestedDate: LocalDateValue;
    toCurrency: string;
  }

  export interface RefreshResult {
    currencyCount: number;
    fetchedFromRemote: boolean;
    rateDate: LocalDateValue;
    requestedDate: LocalDateValue;
    retrievedAt?: null | number | string;
  }

  export interface ListReq {
    date: string;
    keyword?: string;
  }

  export interface QuoteReq {
    date: string;
    fromCurrency: string;
    toCurrency: string;
  }
}

const BASE_URL = '/fdmwaimao/exchange-rate';

export function getExchangeRateList(params: FdmWaimaoExchangeRateApi.ListReq) {
  return requestClient.get<FdmWaimaoExchangeRateApi.RateItem[]>(
    `${BASE_URL}/list`,
    { params },
  );
}

export function getExchangeRateCurrencies() {
  return requestClient.get<FdmWaimaoExchangeRateApi.CurrencyOption[]>(
    `${BASE_URL}/currencies`,
  );
}

export function getExchangeRateQuote(
  params: FdmWaimaoExchangeRateApi.QuoteReq,
) {
  return requestClient.get<FdmWaimaoExchangeRateApi.Quote>(
    `${BASE_URL}/quote`,
    { params },
  );
}

export function refreshExchangeRates(date: string) {
  return requestClient.post<FdmWaimaoExchangeRateApi.RefreshResult>(
    `${BASE_URL}/refresh`,
    undefined,
    { params: { date } },
  );
}
