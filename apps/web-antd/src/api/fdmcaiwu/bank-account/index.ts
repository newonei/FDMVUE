import { requestClient } from '#/api/request';

export interface CashAccountOption {
  accountName?: null | string;
  accountNumberTail?: null | string;
  accountType: 'BANK' | 'PRIVATE';
  bankName?: null | string;
  companyId?: null | number;
  currency: string;
  id: number;
  name: string;
}

export interface CashPostingMatchQuery {
  accountId: number;
  amount: number | string;
  companyId?: null | number;
  currency: string;
  date: string;
  direction: 'EXPENSE' | 'INCOME';
}

export interface CashPostingMatch {
  amount: number | string;
  companyName?: null | string;
  counterparty?: null | string;
  currency: string;
  date: string;
  id: number;
  summary?: null | string;
}

const baseUrl = '/fdmcaiwu/bank-account';

export function listCashAccountOptions(companyId?: null | number) {
  return requestClient.get<CashAccountOption[]>(`${baseUrl}/options`, {
    params: { companyId: companyId ?? undefined },
  });
}

export function listCashPostingMatches(params: CashPostingMatchQuery) {
  return requestClient.get<CashPostingMatch[]>(`${baseUrl}/matches`, {
    params,
  });
}
