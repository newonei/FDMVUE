import type { Decimal, MasterRecord, PageResult } from './index';
import type {
  ProductActivityRecord,
  ProductActivityType,
} from './product-activity';

import { requestClient } from '#/api/request';

export interface Customer extends MasterRecord {
  version: number;
  contactSelection?: string;
  shortName?: string;
  country?: string;
  countryName?: string;
  customerSource?: string;
  companyName?: string;
  sourceCountry?: string;
  sourceCustomerSource?: string;
  sourceCode?: string;
  province?: string;
  city?: string;
  address?: string;
  website?: string;
  contactName?: string;
  email?: string;
  phone?: string;
  lastSyncedAt?: string;
  sourceUpdatedAt?: string;
  /** 列表带 withStats 时附带；无共用范围的账号没有 */
  stats?: CustomerStats;
}
/** 按最近一次签约分层：≤90 天活跃、91–365 天需跟进、超过 1 年沉睡、没有合同未成交 */
export type CustomerTier = 'ACTIVE' | 'FOLLOW' | 'NONE' | 'SLEEP';
export type CustomerListTier = 'NEW' | 'RECEIVABLE' | CustomerTier;
export type CustomerSort =
  | 'CONTRACT_AMOUNT'
  | 'LAST_SIGNED'
  | 'RECEIVABLE'
  | 'RECENT_12';
export interface CustomerCurrencyAmounts {
  /** 金智迁入合同没有币种，为空 */
  currency?: null | string;
  contractAmount: Decimal;
  recent12Amount: Decimal;
  receivable: Decimal;
}
/** 金额取合同最多的币种；其余币种在 otherCurrencies，不跨币种相加 */
export interface CustomerStats extends Partial<CustomerCurrencyAmounts> {
  contractCount: number;
  firstSignedDate?: null | string;
  lastSignedDate?: null | string;
  lastContractId?: null | string;
  lastContractCode?: null | string;
  daysSinceLastSigned?: null | number;
  tier: CustomerTier;
  newThisYear: boolean;
  newRecent90: boolean;
  /** JINZHI 金智汇总的客户未回款额；NATIVE 新系统合同额减回款；MIXED 两者都有 */
  receivableSource?: 'JINZHI' | 'MIXED' | 'NATIVE' | null;
  previous12Amount?: Decimal;
  /** 近 12 个自然月（含本月）每月签约额，与 overview.months 对齐 */
  monthly?: Decimal[];
  otherCurrencies?: CustomerCurrencyAmounts[];
}
export interface CustomerOverview {
  total: number;
  activeCount: number;
  inactiveCount: number;
  tiers: Record<CustomerTier, number>;
  newThisYear: number;
  newRecent90: number;
  receivableCustomers: number;
  receivables: { amount: Decimal; currency?: null | string }[];
  missingProfile: number;
  months: string[];
  activeDays: number;
  followDays: number;
  asOf: string;
}
export interface CustomerSnapshot {
  customerId: string;
  contractCount: number;
  currency?: null | string;
  years: { amount: Decimal; year: number }[];
  recentContracts: {
    amount?: Decimal | null;
    code?: null | string;
    currency?: null | string;
    id: string;
    signedDate?: null | string;
    status?: null | string;
  }[];
  products: {
    name: string;
    orders: number;
    quantity: Decimal;
    unit?: null | string;
  }[];
}
export interface OkkiCustomerSource {
  externalId: string;
  name: string;
  shortName?: string;
  code?: string;
  sourceUpdatedAt?: string;
  localId?: string;
}
export interface OkkiCustomerPreview {
  customer: Partial<Customer> & { externalId: string; name: string };
  previewHash: string;
  existingId?: string;
  existingVersion?: number;
  fetchedAt: string;
}
export interface OkkiCustomerSearch {
  items: OkkiCustomerSource[];
  nextCursor: null | number;
  hasMore: boolean;
  scannedCount: number;
  remoteTotal: null | number;
  notice: string;
  matchedTotal: number;
  directory: OkkiDirectoryStatus;
}
export interface OkkiDirectoryStatus {
  status: 'COMPLETE' | 'FAILED' | 'NEVER' | 'PAUSED' | 'RUNNING';
  indexedCount: number;
  scannedCount: number;
  remoteTotal: null | number;
  complete: boolean;
  updatedAt: null | string;
  completedAt: null | string;
  lastError: null | string;
}
export interface CustomerOptions {
  countries: CountryOption[];
  productCategories: { label: string; value: string }[];
  customerSources: string[];
  sourceVersion: number;
}
const base = '/fdmplatform/v1/customers';
export interface CountryOption {
  code: string;
  nameZh: string;
  nameEn: string;
  iso3: string;
  aliases?: string[];
}
export function getCustomerOptions() {
  return requestClient.get<CustomerOptions>(`${base}/options`);
}
export function saveCustomerSources(data: {
  expectedVersion: number;
  idempotencyKey: string;
  values: string[];
}) {
  return requestClient.post<CustomerOptions>(`${base}/source-options`, data);
}
export function getOkkiDirectoryStatus() {
  return requestClient.get<OkkiDirectoryStatus>(
    `${base}/okki/directory-status`,
  );
}
export function refreshOkkiDirectory(restart = false) {
  return requestClient.post<OkkiDirectoryStatus>(
    `${base}/okki/directory-refresh`,
    undefined,
    { params: { restart } },
  );
}
export function pauseOkkiDirectory() {
  return requestClient.post<OkkiDirectoryStatus>(
    `${base}/okki/directory-pause`,
  );
}
export function getCustomers(params: {
  active?: boolean;
  country?: string;
  customerSource?: string;
  keyword?: string;
  missing?: boolean;
  order?: 'ASC' | 'DESC';
  pageNo: number;
  pageSize: number;
  sort?: CustomerSort;
  sourceSystem?: string;
  tier?: CustomerListTier;
  withStats?: boolean;
}) {
  return requestClient.get<PageResult<Customer>>(`${base}/page`, {
    params,
    timeout: 60_000,
  });
}
export function getCustomerOverview() {
  /** 无共用范围的账号返回 null */
  return requestClient.get<CustomerOverview | null>(`${base}/overview`, {
    timeout: 60_000,
  });
}
export function getCustomerSnapshot(id: string) {
  return requestClient.get<CustomerSnapshot>(
    `${base}/${encodeURIComponent(id)}/snapshot`,
    { timeout: 60_000 },
  );
}
export function getCustomer(id: string) {
  return requestClient.get<Customer>(`${base}/${encodeURIComponent(id)}`);
}
export function saveCustomer(data: Record<string, unknown>) {
  return requestClient.post<Customer>(base, data);
}
export function setCustomerStatus(
  id: string,
  data: {
    active: boolean;
    expectedVersion: number;
    idempotencyKey: string;
  },
) {
  return requestClient.post<Customer>(
    `${base}/${encodeURIComponent(id)}/status`,
    data,
  );
}
export function getOkkiCustomerStatus() {
  return requestClient.get<{
    configured: boolean;
    enabled: boolean;
    message: string;
    missingFields: string[];
    readOnly: boolean;
  }>(`${base}/okki/status`);
}
export function searchOkkiCustomers(params: {
  cursor: number;
  keyword: string;
}) {
  return requestClient.get<OkkiCustomerSearch>(`${base}/okki/search`, {
    params,
    timeout: 120_000,
  });
}
export function previewOkkiCustomer(externalId: string) {
  return requestClient.get<OkkiCustomerPreview>(`${base}/okki/preview`, {
    params: { externalId },
    timeout: 120_000,
  });
}
export function syncOkkiCustomer(data: {
  country?: string;
  expectedVersion?: number;
  externalId: string;
  idempotencyKey: string;
  previewHash: string;
}) {
  return requestClient.post<Customer>(`${base}/okki/sync`, data, {
    timeout: 120_000,
  });
}
export function refreshOkkiCustomer(
  id: string,
  data: {
    country?: string;
    expectedVersion: number;
    idempotencyKey: string;
    previewHash: string;
  },
) {
  return requestClient.post<Customer>(
    `${base}/${encodeURIComponent(id)}/okki-refresh`,
    data,
    { timeout: 120_000 },
  );
}

/** 客户档案里能出现的单据类型（与产品档案共用类型名、跳转和展示规则） */
export type CustomerActivityType = Extract<
  ProductActivityType,
  | 'ALL'
  | 'ARRIVAL'
  | 'ASSIGNMENT'
  | 'CONTRACT'
  | 'CUSTOMS'
  | 'PRODUCTION_PROGRESS'
  | 'PURCHASE_INVOICE'
  | 'PURCHASE_ORDER'
  | 'PURCHASE_PAYMENT'
  | 'PURCHASE_PLAN'
  | 'PURCHASE_REQUEST'
  | 'PURCHASE_RETURN'
  | 'QUOTE'
  | 'RECEIPT'
  | 'REFUND'
  | 'SALES_INVOICE'
  | 'SALES_RETURN'
  | 'SHIPMENT'
  | 'STOCK_IN'
  | 'STOCK_OUT'
>;
export interface CustomerAmountSummary {
  /** 未注明币种的历史单据为空 */
  currency?: null | string;
  contractAmount: Decimal;
  receivedAmount: Decimal;
  refundedAmount: Decimal;
  invoicedAmount: Decimal;
}
/** 与产品档案的记录同形，另带备注/原因（如回款扣款原因） */
export interface CustomerActivityRecord extends ProductActivityRecord {
  note?: null | string;
}
export interface CustomerActivityView {
  customerId: string;
  list: CustomerActivityRecord[];
  total: number;
  counts: Partial<Record<Exclude<CustomerActivityType, 'ALL'>, number>>;
  summary: {
    amounts: CustomerAmountSummary[];
    firstDate?: null | string;
    lastDate?: null | string;
  };
  pageNo: number;
  pageSize: number;
  notes: string[];
}
export function getCustomerActivity(
  id: string,
  params: {
    fromDate?: string;
    keyword?: string;
    pageNo: number;
    pageSize: number;
    toDate?: string;
    type: CustomerActivityType;
  },
) {
  return requestClient.get<CustomerActivityView>(
    `${base}/${encodeURIComponent(id)}/activity`,
    { params, timeout: 60_000 },
  );
}
