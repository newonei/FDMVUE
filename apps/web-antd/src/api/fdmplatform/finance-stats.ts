import type { Decimal, PageResult } from './index';

import { requestClient } from '#/api/request';

/** 按最近一次收付分层：≤90 天活跃、91–365 天需跟进、超过 1 年沉睡；NONE = 只有未回款、还没有回款。 */
export type CashPartyTier = 'ACTIVE' | 'FOLLOW' | 'NONE' | 'SLEEP';
/** RECEIVABLE 只用于客户：有未回款。 */
export type CashPartyFilter = 'RECEIVABLE' | CashPartyTier;
export type CashPartySort = 'LAST' | 'RECEIVABLE' | 'RECENT_12' | 'TOTAL';
export type CashDirection = 'IN' | 'OUT';

/** 一笔收款或付款；cny 为空表示外币且没有汇率快照或金智本位币金额。 */
export interface CashFactView {
  id: string;
  date: null | string;
  currency: null | string;
  amount: Decimal;
  cny: Decimal | null;
  account?: null | string;
  migrated: boolean;
  /** 金智集中回款 / 集中付款 */
  bulk: boolean;
  contractId?: null | string;
  contractCode?: null | string;
  standaloneId?: null | string;
}
export interface CashAccount {
  name: string;
  amount: Decimal;
  count: number;
  other?: boolean;
}
export interface CashRanking {
  key: string;
  id?: null | string;
  name: string;
  amount: Decimal;
  count: number;
}
export interface CashPartyStats {
  count: number;
  tier: CashPartyTier;
  recent12Count?: number;
  /** 人民币 */
  total?: Decimal;
  recent12?: Decimal;
  previous12?: Decimal;
  monthly?: Decimal[];
  firstDate?: null | string;
  lastDate?: null | string;
  daysSinceLast?: null | number;
  /** 折不了人民币的笔数 */
  unconverted?: number;
  last?: CashFactView;
  /** 原币合计；currency 为空串表示未注明币种 */
  currencies?: { currency: string; recent12: Decimal; total: Decimal }[];
  accounts?: string[];
  /** 客户：未回款，按币种 */
  receivables?: { amount: Decimal; currency: string }[];
  receivableSource?: 'JINZHI' | 'MIXED' | 'NATIVE' | null;
  /** 供应商：同期采购额，人民币 */
  purchaseRecent12?: Decimal;
  purchaseTotal?: Decimal;
}
export interface CashPartyRow {
  key: string;
  id?: null | string;
  name?: null | string;
  code?: null | string;
  active: boolean;
  stats: CashPartyStats;
}
export interface CashTierCounts {
  ACTIVE: number;
  FOLLOW: number;
  SLEEP: number;
  total: number;
}
interface InOut {
  in: Decimal;
  out: Decimal;
}
/** 全部门收付，人民币；含金智迁入历史。 */
export interface FinanceDepartment {
  asOf: string;
  /** 最晚一笔金智迁入收付的日期；之后只有新系统登记的收付 */
  migratedUntil?: null | string;
  currency: 'CNY';
  /** 24 个月，最后一个是本月 */
  months: string[];
  inflow: Decimal[];
  outflow: Decimal[];
  thisMonth: InOut;
  lastYearMonth: InOut;
  recent12: InOut;
  previous12: InOut;
  ytd: InOut;
  lastYtd: InOut;
  unconverted: { in: number; out: number };
  pending: { cny: Decimal; count: number };
  accountsIn: CashAccount[];
  accountsOut: CashAccount[];
  topCustomers: CashRanking[];
  topSuppliers: CashRanking[];
}
export interface FinanceOverview extends FinanceDepartment {
  customerTiers: CashTierCounts;
  supplierTiers: CashTierCounts;
  receivableCustomers?: number;
}
export interface CashPartySnapshot {
  key: string;
  direction: CashDirection;
  count: number;
  years: { amount: Decimal; year: number }[];
  accounts: CashAccount[];
  recent: CashFactView[];
}

const base = '/fdmplatform/v1/finance-stats';
export interface CashPartyQuery {
  keyword?: string;
  order?: 'ASC' | 'DESC';
  pageNo: number;
  pageSize: number;
  sort?: CashPartySort;
  tier?: CashPartyFilter;
}
export function getFinanceOverview() {
  return requestClient.get<FinanceOverview>(`${base}/overview`);
}
export function getCustomerReceipts(params: CashPartyQuery) {
  return requestClient.get<PageResult<CashPartyRow>>(`${base}/customers`, {
    params,
  });
}
export function getSupplierPayments(params: CashPartyQuery) {
  return requestClient.get<PageResult<CashPartyRow>>(`${base}/suppliers`, {
    params,
  });
}
export function getCashParty(direction: CashDirection, key: string) {
  return requestClient.get<CashPartySnapshot>(`${base}/party`, {
    params: { direction, key },
  });
}
