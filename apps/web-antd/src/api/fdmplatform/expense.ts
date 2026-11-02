import type { PageResult } from '@vben/request';

import type { ProcurementFinanceRecord } from './procurement-finance';

import { requestClient } from '#/api/request';

const base = '/fdmplatform/v1/expense';

export interface ExpenseEntity {
  active?: boolean;
  id: string;
  name: string;
  usages?: string[];
}
/** 当前账号在费用报销里的身份，和新建时带出的上次收款信息。 */
export interface ExpenseContext {
  canAudit: boolean;
  canPay: boolean;
  canSummarize: boolean;
  canViewAll: boolean;
  departmentName?: string;
  entities?: ExpenseEntity[];
  lastPayee?: { payeeAccount?: string; payeeName?: string };
  userId: number;
  userName: string;
}
export interface ExpensePageParams {
  category?: string;
  contractId?: string;
  from?: string;
  keyword?: string;
  orderId?: string;
  pageNo: number;
  pageSize: number;
  paymentStatus?: 'PAID' | 'UNPAID';
  status?: string;
  to?: string;
  view?: 'mine' | 'pending';
}
export interface ExpenseSourceRow {
  code: string;
  contractCode?: string;
  contractId: string;
  id: string;
  name?: string;
  orderId?: string;
  supplierName?: string;
}
export interface ExpenseSource {
  contractId: string;
  label: string;
  orderId?: string;
  products: { label: string; value: string }[];
}
export interface ExpenseSummaryRow {
  amount: number | string;
  currency: string;
  name: string;
}
export interface ExpenseSummary {
  byBinding: ExpenseSummaryRow[];
  byCategory: ExpenseSummaryRow[];
  byDepartment: ExpenseSummaryRow[];
  byMonth: ExpenseSummaryRow[];
}

export function getExpenseContext() {
  return requestClient.get<ExpenseContext>(`${base}/context`);
}
export function getExpensePage(params: ExpensePageParams) {
  return requestClient.get<PageResult<ProcurementFinanceRecord>>(
    `${base}/page`,
    { params },
  );
}
export function getExpenseSources(params: {
  keyword?: string;
  pageNo: number;
  pageSize: number;
  type: 'CONTRACT' | 'ORDER';
}) {
  return requestClient.get<PageResult<ExpenseSourceRow>>(`${base}/sources`, {
    params,
  });
}
export function getExpenseSource(contractId: string, orderId?: string) {
  return requestClient.get<ExpenseSource>(`${base}/source`, {
    params: { contractId, orderId: orderId || undefined },
  });
}
export function getExpenseSummary(params: { from?: string; to?: string }) {
  return requestClient.get<ExpenseSummary>(`${base}/summary`, { params });
}
