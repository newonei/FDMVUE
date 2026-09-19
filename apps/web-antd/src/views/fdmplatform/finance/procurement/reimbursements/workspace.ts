import type { ProcurementFinanceRecord } from '#/api/fdmplatform/procurement-finance';

import BigNumber from 'bignumber.js';

import { currencyScale } from '../model';

export const reimbursementViews = [
  { key: 'all', label: '全部报销' },
  { key: 'draft', label: '草稿' },
  { key: 'pending', label: '待生效' },
  { key: 'unpaid', label: '待付款' },
  { key: 'paid', label: '已付清' },
  { key: 'returned', label: '待补充' },
] as const;
export type ReimbursementView = (typeof reimbursementViews)[number]['key'];

export function reimbursementQuery(view: ReimbursementView): {
  paymentStatus?: 'PAID' | 'UNPAID';
  status?: string;
} {
  if (view === 'unpaid') return { paymentStatus: 'UNPAID' };
  if (view === 'paid') return { paymentStatus: 'PAID' };
  return {
    status: {
      all: undefined,
      draft: 'DRAFT',
      pending: 'SUBMITTED',
      returned: 'REJECTED',
    }[view],
  };
}

function decimal(value: unknown) {
  if (value === undefined || value === null || String(value).trim() === '')
    return;
  const number = new BigNumber(String(value));
  return number.isFinite() ? number : undefined;
}

export function expenseMoney(value: unknown, currency?: string) {
  const number = decimal(value);
  return number && currency
    ? `${currency} ${number.toFormat(currencyScale(currency))}`
    : '—';
}

export function expensePayment(record: ProcurementFinanceRecord) {
  if (record.status !== 'APPROVED')
    return {
      label: '生效后办理付款',
      color: undefined,
      paid: undefined,
      unpaid: undefined,
    };
  const paid = decimal(record.summary?.paidAmount);
  const unpaid = decimal(record.summary?.availablePaymentAmount);
  const amount = decimal(record.amount);
  if (record.summary?.complete !== true || !paid || !unpaid || !amount?.gt(0)) {
    return {
      label: '付款资料待核实',
      color: 'orange',
      paid: undefined,
      unpaid: undefined,
    };
  }
  const completed = unpaid.lte(0) && paid.gte(amount);
  const progress = paid.gt(0)
    ? { label: '部分付款', color: 'blue' }
    : { label: '待付款', color: 'orange' };
  return {
    label: completed ? '已付清' : progress.label,
    color: completed ? 'green' : progress.color,
    paid: paid.toFixed(paid.decimalPlaces() ?? 0),
    unpaid: unpaid.toFixed(unpaid.decimalPlaces() ?? 0),
  };
}

export function expenseAction(record: ProcurementFinanceRecord) {
  if (record.standaloneId || record.blockReasons?.length) return '查看详情';
  if (record.allowedActions.includes('UPDATE')) return '继续填写';
  if (record.allowedActions.includes('SUBMIT')) return '提交生效';
  if (
    record.status === 'APPROVED' &&
    new BigNumber(String(expensePayment(record).unpaid ?? 0)).gt(0)
  )
    return '办理付款';
  return '查看详情';
}
