import type { Decimal } from '#/api/fdmplatform';
import type {
  CashDirection,
  CashFactView,
  CashPartyRow,
  CashPartyStats,
  CashPartyTier,
} from '#/api/fdmplatform/finance-stats';

import BigNumber from 'bignumber.js';

import { moneyShort } from '../../trade/customers/model';

export { moneyShort, sparkBars } from '../../trade/customers/model';

export interface RankRow {
  key: string;
  name: string;
  amount: Decimal;
  hint?: string;
  muted?: boolean;
}

const decimal = (value: unknown) => {
  const number = new BigNumber(
    typeof value === 'number' || typeof value === 'string' ? value : Number.NaN,
  );
  return number.isFinite() ? number : undefined;
};

/** 统计金额都是人民币：外币按冻结汇率或金智本位币金额折算。 */
export function rmb(value: unknown) {
  const text = moneyShort(value);
  return text === '—' ? text : `¥${text}`;
}

/** 原币金额：未注明币种的单独标出，不当作人民币。 */
export function nativeShort(value: unknown, currency?: null | string) {
  return moneyShort(value, currency || '未注明币种');
}

export const directionWords: Record<
  CashDirection,
  { act: string; empty: string; party: string; recent: string }
> = {
  IN: { act: '回款', empty: '没有回款', party: '客户', recent: '回款' },
  OUT: { act: '付款', empty: '没有付款', party: '供应商', recent: '付款' },
};

export const tierLabels: Record<CashPartyTier, string> = {
  ACTIVE: '活跃',
  FOLLOW: '需跟进',
  SLEEP: '沉睡',
  NONE: '还没有回款',
};
export const tierColors: Record<CashPartyTier, string> = {
  ACTIVE: 'green',
  FOLLOW: 'orange',
  SLEEP: 'default',
  NONE: 'red',
};

export function cashAgo(direction: CashDirection, days?: null | number) {
  const act = directionWords[direction].act;
  if (days === null || days === undefined)
    return directionWords[direction].empty;
  if (days <= 0) return `今天${act}`;
  if (days < 31) return `${days} 天前${act}`;
  if (days < 365) return `${Math.floor(days / 30)} 个月前${act}`;
  const years = Math.floor(days / 365);
  const months = Math.floor((days % 365) / 30);
  return `${years} 年${months ? ` ${months} 个月` : ''}前${act}`;
}

/** 两期比较：小基数给倍数，避免 +2300% 这类看不懂的数字。 */
export function changeText(
  current: unknown,
  previous: unknown,
  emptyText = '上年同期为 0',
): { text: string; tone: 'down' | 'muted' | 'up' } {
  const now = decimal(current) ?? new BigNumber(0);
  const before = decimal(previous) ?? new BigNumber(0);
  if (before.isZero() || before.isNegative())
    return { text: now.isZero() ? '两期都为 0' : emptyText, tone: 'muted' };
  const change = now
    .minus(before)
    .dividedBy(before)
    .multipliedBy(100)
    .decimalPlaces(0, BigNumber.ROUND_HALF_UP)
    .toNumber();
  if (change === 0) return { text: '与上年同期持平', tone: 'muted' };
  if (change >= 300)
    return {
      text: `是上年同期的 ${now.dividedBy(before).toFixed(0)} 倍`,
      tone: 'up',
    };
  return change > 0
    ? { text: `比上年同期 +${change}%`, tone: 'up' }
    : { text: `比上年同期 ${change}%`, tone: 'down' };
}

export function partyTrend(stats?: CashPartyStats) {
  if (!stats?.count) return { text: '', tone: 'muted' as const };
  if (!decimal(stats.recent12)?.isGreaterThan(0))
    return { text: '近 12 个月没有', tone: 'muted' as const };
  return changeText(stats.recent12, stats.previous12, '上年同期没有');
}

/** 原币构成，例：USD 12.3 万 · CNY 4,000；最多两项，其余在悬停里看。 */
export function currencyMix(stats?: CashPartyStats, limit = 2) {
  const rows = (stats?.currencies ?? []).filter(
    (row) => !decimal(row.total)?.isZero(),
  );
  const text = rows
    .slice(0, limit)
    .map((row) => nativeShort(row.total, row.currency))
    .join(' · ');
  return {
    text,
    title: rows.map((row) => nativeShort(row.total, row.currency)).join('\n'),
    more: Math.max(0, rows.length - limit),
  };
}

export function receivableText(stats?: CashPartyStats) {
  return (stats?.receivables ?? [])
    .map((row) => nativeShort(row.amount, row.currency))
    .join(' · ');
}

/** 供应商：近 12 个月付款占同期采购额的比例，提示可能的欠款或预付。 */
export function paidShare(stats?: CashPartyStats) {
  const paid = decimal(stats?.recent12);
  const purchased = decimal(stats?.purchaseRecent12);
  if (!paid || !purchased || purchased.isZero()) return undefined;
  const percent = paid
    .dividedBy(purchased)
    .multipliedBy(100)
    .decimalPlaces(0, BigNumber.ROUND_HALF_UP)
    .toNumber();
  let tone = 'muted';
  if (percent < 80) tone = 'warn';
  else if (percent > 120) tone = 'info';
  return { percent, text: `付款为采购额的 ${percent}%`, tone };
}

export function factSource(fact: Pick<CashFactView, 'bulk' | 'migrated'>) {
  if (fact.bulk) return '金智集中';
  return fact.migrated ? '金智' : '新系统';
}

/** 导出当前筛选：Excel 可直接打开的 UTF-8 CSV。 */
export function cashPartyCsv(direction: CashDirection, rows: CashPartyRow[]) {
  const words = directionWords[direction];
  const header = [
    `${words.party}编号`,
    `${words.party}名称`,
    '分层',
    `近12个月${words.act}(人民币)`,
    `上年同期${words.act}(人民币)`,
    `累计${words.act}(人民币)`,
    `${words.act}笔数`,
    `近12个月笔数`,
    `最近${words.act}日期`,
    '原币构成',
    '未折算笔数',
    '常用账户',
    direction === 'IN' ? '未回款' : '近12个月采购额(人民币)',
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
      tierLabels[stats.tier],
      stats.recent12 ?? '',
      stats.previous12 ?? '',
      stats.total ?? '',
      stats.count,
      stats.recent12Count ?? 0,
      stats.lastDate ?? '',
      (stats.currencies ?? [])
        .map((item) => `${item.currency || '未注明币种'} ${item.total}`)
        .join('；'),
      stats.unconverted ?? 0,
      (stats.accounts ?? []).join('、'),
      direction === 'IN'
        ? (stats.receivables ?? [])
            .map((item) => `${item.currency || '未注明币种'} ${item.amount}`)
            .join('；')
        : (stats.purchaseRecent12 ?? ''),
    ]
      .map((value) => cell(value))
      .join(',');
  });
  return `﻿${[header.join(','), ...lines].join('\n')}`;
}
