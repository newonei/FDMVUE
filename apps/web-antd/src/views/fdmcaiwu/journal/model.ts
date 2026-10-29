import type { FdmcaiwuJournalApi as Api } from '#/api/fdmcaiwu/journal';

import dayjs from 'dayjs';

export const DIRECTION_LABELS: Record<Api.Direction, string> = {
  EXPENSE: '支出',
  INCOME: '收入',
};

export const INVOICE_STATUS_OPTIONS: {
  color: string;
  label: string;
  value: Api.InvoiceStatus;
}[] = [
  { color: 'success', label: '是', value: 'RECEIVED' },
  { color: 'warning', label: '否', value: 'PENDING' },
  { color: 'default', label: '无需', value: 'NOT_REQUIRED' },
];

export const CURRENCY_OPTIONS = [
  'CNY',
  'USD',
  'EUR',
  'GBP',
  'JPY',
  'HKD',
  'AUD',
  'CAD',
].map((value) => ({ label: value, value }));

export const DIMENSION_OPTIONS: { label: string; value: Api.Dimension }[] = [
  { label: '按收付款行', value: 'BANK' },
  { label: '按经手人', value: 'HANDLER' },
  { label: '按部门', value: 'DEPT' },
  { label: '按类别', value: 'CATEGORY' },
  { label: '按所属公司', value: 'COMPANY' },
];

/** 两张表名称不同的列：收入的「收款行 / 往来单位 / 备注/单据号」对应支出的「付款行 / 收款方 / 备注」 */
export function labels(direction: Api.Direction) {
  return direction === 'INCOME'
    ? {
        amount: '金额',
        bank: '收款行',
        counterparty: '往来单位',
        remark: '备注/单据号',
      }
    : { amount: '付款金额', bank: '付款行', counterparty: '收款方', remark: '备注' };
}

export function invoiceStatusOption(status?: null | string) {
  return INVOICE_STATUS_OPTIONS.find((item) => item.value === status);
}

/** 金额千分位两位小数；空值显示 — */
export function formatMoney(value: unknown) {
  if (value === null || value === undefined || value === '') return '—';
  const number = Number(value);
  if (!Number.isFinite(number)) return '—';
  return number.toLocaleString('zh-CN', {
    maximumFractionDigits: 2,
    minimumFractionDigits: 2,
  });
}

export function sumBy<T>(rows: T[], get: (row: T) => unknown) {
  // 按分累加，避免 0.1 + 0.2 这类浮点误差
  const cents = rows.reduce((total, row) => {
    const number = Number(get(row));
    return Number.isFinite(number) ? total + Math.round(number * 100) : total;
  }, 0);
  return cents / 100;
}

/** 原币 × 汇率，四舍五入到分；缺一项返回 undefined */
export function toRmb(amount: unknown, rate: unknown) {
  const a = Number(amount);
  const r = Number(rate);
  if (
    amount === null ||
    amount === undefined ||
    amount === '' ||
    !Number.isFinite(a) ||
    !Number.isFinite(r) ||
    r <= 0
  ) {
    return undefined;
  }
  return Math.round(a * r * 100) / 100;
}

export type MonthPreset = 'all' | 'lastMonth' | 'thisMonth' | 'thisYear';

export function monthRange(
  preset: MonthPreset,
  today = dayjs(),
): [string, string] | undefined {
  switch (preset) {
    case 'all': {
      return undefined;
    }
    case 'lastMonth': {
      const last = today.subtract(1, 'month').format('YYYY-MM');
      return [last, last];
    }
    case 'thisMonth': {
      return [today.format('YYYY-MM'), today.format('YYYY-MM')];
    }
    case 'thisYear': {
      return [`${today.year()}-01`, today.format('YYYY-MM')];
    }
  }
}

export function emptyForm(direction: Api.Direction): Api.SaveReq {
  return {
    amount: '',
    bankAccount: undefined,
    billType: undefined,
    category: undefined,
    companyId: undefined,
    companyName: undefined,
    counterparty: undefined,
    currency: 'CNY',
    deliveredDate: undefined,
    deliverer: undefined,
    deptName: undefined,
    direction,
    entryDate: dayjs().format('YYYY-MM-DD'),
    entryMonth: undefined,
    exchangeRate: undefined,
    handlerName: undefined,
    invoiceAmount: undefined,
    invoiceNo: undefined,
    invoiceStatus: direction === 'EXPENSE' ? 'PENDING' : undefined,
    paymentMethod: undefined,
    remark: undefined,
    rmbAmount: undefined,
    summary: undefined,
  };
}

/**
 * 「保存并继续」时沿用的字段：同一批账通常同一天、同一账户、同一公司和经手人，
 * 金额、摘要、往来单位和发票信息每笔不同，清空重填。
 */
export const STICKY_FIELDS = [
  'entryDate',
  'entryMonth',
  'currency',
  'exchangeRate',
  'companyId',
  'companyName',
  'bankAccount',
  'category',
  'deptName',
  'handlerName',
  'paymentMethod',
  'billType',
] as const;

export function nextForm(previous: Api.SaveReq): Api.SaveReq {
  const next = emptyForm(previous.direction);
  for (const field of STICKY_FIELDS) {
    (next as Record<string, unknown>)[field] = previous[field];
  }
  return next;
}

/** 接口返回的记录转成表单：null 换成 undefined，去掉只读字段 */
export function toSaveReq(entry: Api.Entry): Api.SaveReq {
  const {
    createTime: _createTime,
    source: _source,
    sourceRef: _sourceRef,
    updateTime: _updateTime,
    ...rest
  } = entry;
  const data: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(rest)) {
    data[key] = value ?? undefined;
  }
  return data as Api.SaveReq;
}

/** 复制一行为新记录：日期改为今天，月份跟着日期走 */
export function copyForm(entry: Api.Entry): Api.SaveReq {
  return {
    ...toSaveReq(entry),
    entryDate: dayjs().format('YYYY-MM-DD'),
    entryMonth: undefined,
    id: undefined,
  };
}

/** 汇总表按月份合并单元格：每月第一行显示月份并跨若干行，其余行隐藏 */
export function monthRowSpans(rows: { month: string }[]) {
  return rows.map((row, index) => {
    if (index > 0 && rows[index - 1]?.month === row.month) return 0;
    let span = 1;
    while (rows[index + span]?.month === row.month) span++;
    return span;
  });
}
