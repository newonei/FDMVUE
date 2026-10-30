import type {
  SupplierRow,
  SupplierStats,
  SupplierTier,
} from '#/api/fdmplatform/supplier-stats';

import BigNumber from 'bignumber.js';

import { moneyShort } from '../../trade/customers/model';

export { moneyShort, sparkBars } from '../../trade/customers/model';

/** Department totals are always RMB: 金智 orders carry no currency and count as CNY. */
export function rmb(value: unknown) {
  const text = moneyShort(value);
  return text === '—' ? text : `¥${text}`;
}

export const tierNames: Record<SupplierTier, string> = {
  ACTIVE: '常用',
  OCCASIONAL: '偶尔',
  SLEEP: '沉睡',
  NONE: '未合作',
};
export const tierColors: Record<SupplierTier, string> = {
  ACTIVE: 'green',
  OCCASIONAL: 'blue',
  SLEEP: 'default',
  NONE: 'default',
};

const decimal = (value: unknown) => {
  const number = new BigNumber(
    typeof value === 'number' || typeof value === 'string' ? value : Number.NaN,
  );
  return number.isFinite() ? number : undefined;
};

export function orderedAgo(days?: null | number) {
  if (days === null || days === undefined) return '没有下过单';
  if (days <= 0) return '今天下单';
  if (days < 31) return `${days} 天前下单`;
  if (days < 365) return `${Math.floor(days / 30)} 个月前下单`;
  const years = Math.floor(days / 365);
  const months = Math.floor((days % 365) / 30);
  return `${years} 年${months ? ` ${months} 个月` : ''}前下单`;
}

/** 近 12 个月与之前 12 个月比较。 */
export function supplierTrend(stats?: SupplierStats): {
  text: string;
  tone: 'down' | 'muted' | 'up';
} {
  if (!stats?.orders) return { text: '没有下过单', tone: 'muted' };
  const recent = decimal(stats.recent12Amount) ?? new BigNumber(0);
  const previous = decimal(stats.previous12Amount) ?? new BigNumber(0);
  if (recent.isZero()) return { text: '近 12 个月没有下单', tone: 'muted' };
  if (previous.isZero()) return { text: '上年同期没有下单', tone: 'muted' };
  const change = recent.minus(previous).dividedBy(previous).multipliedBy(100);
  const rounded = change.decimalPlaces(0, BigNumber.ROUND_HALF_UP).toNumber();
  if (rounded === 0) return { text: '与上年同期持平', tone: 'muted' };
  // Tiny previous-year amounts make huge percentages; say how many times instead.
  if (rounded >= 300)
    return {
      text: `是上年同期的 ${recent.dividedBy(previous).toFixed(0)} 倍`,
      tone: 'up',
    };
  return rounded > 0
    ? { text: `比上年同期 +${rounded}%`, tone: 'up' }
    : { text: `比上年同期 ${rounded}%`, tone: 'down' };
}

export function otherCurrencyTitle(stats?: SupplierStats) {
  return (stats?.otherCurrencies ?? [])
    .map((row) => `${row.currency} ${moneyShort(row.totalAmount)}`)
    .join('；');
}

/** 导出当前筛选的供应商：Excel 可直接打开的 UTF-8 CSV。 */
export function supplierCsv(rows: SupplierRow[]) {
  const header = [
    '供应商编码',
    '供应商名称',
    '状态',
    '分层',
    '近12个月采购额',
    '上年同期采购额',
    '累计采购额',
    '币种',
    '采购单数',
    '近12个月单数',
    '最近下单',
    '最近采购单',
    '在途采购单',
    '常购物料',
  ];
  const cell = (value: unknown) => {
    const text = value === null || value === undefined ? '' : String(value);
    return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
  };
  const lines = rows.map((row) => {
    const stats = row.stats;
    return [
      row.code,
      row.name,
      row.active ? '启用' : '停用',
      tierNames[stats?.tier ?? 'NONE'],
      stats?.recent12Amount ?? '',
      stats?.previous12Amount ?? '',
      stats?.totalAmount ?? '',
      stats?.currency ?? '',
      stats?.orders ?? 0,
      stats?.recent12Orders ?? 0,
      stats?.lastOrderDate ?? '',
      stats?.lastOrderCode ?? '',
      stats?.openOrders ?? 0,
      (stats?.topItems ?? []).join('、'),
    ]
      .map((value) => cell(value))
      .join(',');
  });
  return `﻿${[header.join(','), ...lines].join('\n')}`;
}
