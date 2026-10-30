import type { Decimal, MasterRecord, PageResult } from './index';

import { requestClient } from '#/api/request';

/** 常用 ≤90 天、偶尔 91–365 天、沉睡超过 1 年、未合作 = 从没下过单。 */
export type SupplierTier = 'ACTIVE' | 'NONE' | 'OCCASIONAL' | 'SLEEP';
export type SupplierSort = 'LAST_ORDER' | 'ORDERS' | 'RECENT_12' | 'TOTAL';
/** 金智采购单没有币种，按人民币计；外币采购单在 otherCurrencies 里单独列出。 */
export interface SupplierStats {
  orders: number;
  recent12Orders?: number;
  tier: SupplierTier;
  firstOrderDate?: null | string;
  lastOrderDate?: null | string;
  lastOrderCode?: null | string;
  daysSinceLastOrder?: null | number;
  openOrders: number;
  currency?: string;
  totalAmount?: Decimal;
  recent12Amount?: Decimal;
  previous12Amount?: Decimal;
  monthly?: Decimal[];
  otherCurrencies?: {
    currency: string;
    recent12Amount: Decimal;
    totalAmount: Decimal;
  }[];
  topItems?: string[];
}
export interface SupplierRow extends MasterRecord {
  stats?: SupplierStats;
}
export interface SupplierRanking {
  id?: null | string;
  name: string;
  amount: Decimal;
  orders: number;
}
export interface SupplierDepartment {
  months: string[];
  monthly: Decimal[];
  currency: string;
  recent12Amount: Decimal;
  recent12Orders: number;
  activeSuppliers: number;
  asOf: string;
  topSuppliers: SupplierRanking[];
}
export interface SupplierOverview extends SupplierDepartment {
  total: number;
  inactive: number;
  withoutContact: number;
  tiers: Record<SupplierTier, number>;
  top10Amount: Decimal;
  top10Share: Decimal | null;
  activeDays: number;
  occasionalDays: number;
}
export interface SupplierSnapshot {
  supplierId: string;
  orderCount: number;
  openOrders: number;
  years: { amount: Decimal; year: number }[];
  items: { name: string; orders: number }[];
  recentOrders: {
    amount: Decimal | null;
    code?: string;
    contractCode?: string;
    contractId?: string;
    currency: string;
    date?: string;
    id: string;
    items: string;
    migrated: boolean;
    standaloneId?: string;
    status?: string;
  }[];
}

const base = '/fdmplatform/v1/suppliers';
export function getSupplierStatsPage(params: {
  active?: boolean;
  keyword?: string;
  order?: 'ASC' | 'DESC';
  pageNo: number;
  pageSize: number;
  sort?: SupplierSort;
  tier?: SupplierTier;
}) {
  return requestClient.get<PageResult<SupplierRow>>(`${base}/stats/page`, {
    params,
  });
}
export function getSupplierOverview() {
  return requestClient.get<SupplierOverview>(`${base}/stats/overview`);
}
export function getSupplierSnapshot(id: string) {
  return requestClient.get<SupplierSnapshot>(
    `${base}/${encodeURIComponent(id)}/stats-snapshot`,
  );
}
