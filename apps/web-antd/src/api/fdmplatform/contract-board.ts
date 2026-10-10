import type { Decimal, PageResult } from './index';

import { requestClient } from '#/api/request';

/** ACTIVE 进行中 · JINZHI 金智迁入待补齐 · ENDED 已结案或取消 · ALL 全部 */
export type ContractBoardTab = 'ACTIVE' | 'ALL' | 'ENDED' | 'JINZHI';
/** 第一个未完成的主线环节；CHECK = 有环节数量或金额待核对；COMPLETION = 金智合同待补齐 */
export type ContractBoardStage =
  | 'CANCELLED'
  | 'CHECK'
  | 'CLOSED'
  | 'COMPLETION'
  | 'DONE'
  | 'DRAFT'
  | 'INVOICE'
  | 'PURCHASE'
  | 'RECEIPT'
  | 'REQUEST'
  | 'SHIP';
/** 采购中在等什么 */
export type ContractBoardWaiting =
  | 'ARRIVAL'
  | 'CLAIM'
  | 'ORDER'
  | 'PRODUCTION'
  | 'QUOTE';
/** 主线六个环节：合同、采购、到货、发货、回款、开票 */
export type ContractBoardStep =
  | 'ACTIVE'
  | 'CLOSED'
  | 'DONE'
  | 'UNKNOWN'
  | 'WAITING';
export type ContractShipState = 'ALL' | 'NONE' | 'PARTIAL' | 'UNKNOWN';
export type ContractDueBucket = 'NONE' | 'OVERDUE' | 'SOON';
export type ContractBoardSort =
  | 'AMOUNT'
  | 'DUE'
  | 'SIGNED'
  | 'UNPAID'
  | 'UPDATED';

export interface ContractBoardRow {
  id: string;
  code?: null | string;
  name?: null | string;
  status: string;
  stage: ContractBoardStage;
  waiting?: ContractBoardWaiting | null;
  tab: Exclude<ContractBoardTab, 'ALL'>;
  customerId?: null | string;
  customerName?: null | string;
  companyId?: null | number;
  sourceCompanyName?: null | string;
  ownerUserId?: null | number;
  departmentId?: null | number;
  productCategory?: null | string;
  sample: boolean;
  currency?: null | string;
  amount?: Decimal | null;
  additionalAmount?: Decimal | null;
  signedDate?: null | string;
  migrated: boolean;
  pendingCompletion: boolean;
  documentNo?: null | string;
  itemCount: number;
  firstItem?: null | string;
  unit?: null | string;
  /** null = 有明细数量待核对 */
  quantities: {
    ordered: Decimal | null;
    quantity: Decimal | null;
    received: Decimal | null;
    requested: Decimal | null;
    shipped: Decimal | null;
  };
  shipState: ContractShipState;
  dueDate?: null | string;
  /** 距今天数，负数为已过 */
  dueDays?: null | number;
  dueBucket?: ContractDueBucket | null;
  buyers: number[];
  money: {
    confirmed?: Decimal | null;
    invoiced?: Decimal | null;
    known: boolean;
    pending?: Decimal | null;
    unpaid?: Decimal | null;
  };
  steps: ContractBoardStep[];
  counts: {
    attachments: number;
    invoices: number;
    orders: number;
    quotes: number;
    receipts: number;
    requests: number;
    shipments: number;
  };
}

export interface CurrencyAmount {
  currency: null | string;
  amount: Decimal;
}
export interface ContractBoardOverview {
  tabs: Record<Exclude<ContractBoardTab, 'ALL'>, number>;
  stages: Record<
    | 'CHECK'
    | 'DONE'
    | 'DRAFT'
    | 'INVOICE'
    | 'PURCHASE'
    | 'RECEIPT'
    | 'REQUEST'
    | 'SHIP',
    number
  >;
  due: Record<ContractDueBucket, number>;
  activeCount: number;
  activeAmounts: CurrencyAmount[];
  unpaidContracts: number;
  unpaid: CurrencyAmount[];
  pending: CurrencyAmount[];
  signed: {
    lastMonth: { amounts: CurrencyAmount[]; count: number };
    thisMonth: { amounts: CurrencyAmount[]; count: number };
  };
  jinzhi: {
    latestSigned: null | string;
    none: number;
    open: number;
    partial: number;
    since: string;
  };
  soonDays: number;
  asOf: string;
}

export interface ContractBoardQuery {
  pageNo: number;
  pageSize: number;
  keyword?: string;
  tab?: ContractBoardTab;
  stage?: string;
  due?: ContractDueBucket;
  shipState?: 'OPEN' | Exclude<ContractShipState, 'UNKNOWN'>;
  mine?: boolean;
  ownerUserId?: number;
  customerId?: string;
  companyId?: number;
  productCategory?: string;
  signedFrom?: string;
  signedTo?: string;
  sort?: ContractBoardSort;
  order?: 'ASC' | 'DESC';
}

const base = '/fdmplatform/v1/contracts/board';

export function getContractBoard(params: ContractBoardQuery) {
  return requestClient.get<PageResult<ContractBoardRow>>(`${base}/page`, {
    params,
  });
}

export function getContractBoardOverview(mine?: boolean) {
  return requestClient.get<ContractBoardOverview>(`${base}/overview`, {
    params: { mine: mine || undefined },
  });
}

export type AgingBucket = 'D30' | 'D60' | 'D90' | 'OVER90' | 'UNSHIPPED';
export interface ReceivableRow extends ContractBoardRow {
  aging: AgingBucket;
  agingDays: null | number;
  lastShipDate: null | string;
  lastReceiptDate: null | string;
}
export interface ContractReceivables {
  contracts: number;
  unpaid: CurrencyAmount[];
  pending: CurrencyAmount[];
  buckets: { amounts: CurrencyAmount[]; count: number; key: AgingBucket }[];
  asOf: string;
  list: ReceivableRow[];
  total: number;
}
export interface MarginRow extends ContractBoardRow {
  revenueCny: Decimal | null;
  purchaseCny: Decimal | null;
  otherCny: Decimal | null;
  marginCny: Decimal | null;
  marginRate: Decimal | null;
  notes: string[];
}
export interface ContractMargins {
  summary: {
    contracts: number;
    incomplete: number;
    marginCny: Decimal;
    marginRate: Decimal | null;
    otherCny: Decimal;
    purchaseCny: Decimal;
    revenueCny: Decimal;
  };
  asOf: string;
  list: MarginRow[];
  total: number;
}

export function getContractReceivables(
  params: Pick<
    ContractBoardQuery,
    'keyword' | 'mine' | 'pageNo' | 'pageSize'
  > & {
    aging?: AgingBucket;
  },
) {
  return requestClient.get<ContractReceivables>(`${base}/receivables`, {
    params,
  });
}

export function getContractMargins(
  params: Pick<
    ContractBoardQuery,
    | 'keyword'
    | 'mine'
    | 'order'
    | 'pageNo'
    | 'pageSize'
    | 'signedFrom'
    | 'signedTo'
    | 'sort'
  >,
) {
  return requestClient.get<ContractMargins>(`${base}/margins`, { params });
}
