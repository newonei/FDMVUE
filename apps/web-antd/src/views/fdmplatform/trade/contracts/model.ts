import type {
  ContractBoardOverview,
  ContractBoardRow,
  ContractBoardSort,
  ContractBoardStage,
  ContractBoardStep,
  ContractBoardTab,
  ContractBoardWaiting,
  CurrencyAmount,
} from '#/api/fdmplatform/contract-board';

import BigNumber from 'bignumber.js';

/** 流程条：按办理顺序排列；CHECK 只在有数量时出现 */
export const flowStages = [
  { key: 'DRAFT', label: '草稿待生效' },
  { key: 'REQUEST', label: '待提采购申请' },
  { key: 'PURCHASE', label: '采购中' },
  { key: 'SHIP', label: '待发货' },
  { key: 'RECEIPT', label: '待收款' },
  { key: 'INVOICE', label: '待开票' },
  { key: 'DONE', label: '待结案' },
  { key: 'CHECK', label: '数据待核对' },
] as const;
export type FlowStage = (typeof flowStages)[number]['key'];

export const stageLabels: Record<ContractBoardStage, string> = {
  DRAFT: '合同 · 草稿未生效',
  REQUEST: '采购 · 还没提采购申请',
  PURCHASE: '采购中',
  SHIP: '发货 · 等出货',
  RECEIPT: '回款 · 等客户付款',
  INVOICE: '开票 · 未开齐',
  DONE: '各环节完成 · 待结案',
  CHECK: '有数据待核对',
  COMPLETION: '金智迁入 · 待补齐资料',
  CLOSED: '已结案',
  CANCELLED: '已取消',
};
export const waitingLabels: Record<ContractBoardWaiting, string> = {
  CLAIM: '等采购接单',
  QUOTE: '等报价',
  ORDER: '等下单',
  PRODUCTION: '等工厂生产',
  ARRIVAL: '等到货',
};
export const stepNames = ['合同', '采购', '到货', '发货', '回款', '开票'];
export const tabLabels: Record<Exclude<ContractBoardTab, 'ALL'>, string> = {
  ACTIVE: '进行中的合同',
  JINZHI: '金智历史合同',
  ENDED: '已结束',
};
export const sortOptions: { label: string; value: ContractBoardSort }[] = [
  { value: 'SIGNED', label: '签订日期' },
  { value: 'DUE', label: '交期' },
  { value: 'AMOUNT', label: '合同金额' },
  { value: 'UNPAID', label: '未收款' },
  { value: 'UPDATED', label: '最近更新' },
];

function decimal(value: unknown) {
  if (value === null || value === undefined || value === '') return undefined;
  const number = new BigNumber(String(value));
  return number.isFinite() ? number : undefined;
}

/** CNY 3,000.00；没有币种写“币种未注明” */
export function amountText(value: unknown, currency?: null | string) {
  const number = decimal(value);
  if (!number) return '—';
  const text = number.toNumber().toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return currency ? `${currency} ${text}` : text;
}

/** 整数千分位，用于卡片和行内摘要 */
export function plain(value: unknown) {
  const number = decimal(value);
  if (!number) return '—';
  return number.toNumber().toLocaleString('en-US', {
    maximumFractionDigits: 2,
  });
}

export function currencyLine(
  amounts: CurrencyAmount[] | undefined,
  empty = '—',
) {
  if (!amounts?.length) return empty;
  return amounts
    .map((entry) =>
      entry.currency
        ? `${entry.currency} ${plain(entry.amount)}`
        : `${plain(entry.amount)}（币种未注明）`,
    )
    .join(' · ');
}

export function quantityText(row: ContractBoardRow) {
  const quantity = row.quantities.quantity;
  if (quantity === null || quantity === undefined) return '数量待核对';
  return `${row.itemCount > 1 ? '共 ' : ''}${plain(quantity)}${row.unit ? ` ${row.unit}` : ''}`;
}

export function productText(row: ContractBoardRow) {
  if (!row.itemCount) return '没有产品明细';
  const first = row.firstItem || '未命名产品';
  return row.itemCount > 1 ? `${first} 等 ${row.itemCount} 项` : first;
}

/** 进度列下面那句话：卡在哪、等谁 */
export function progressText(
  row: ContractBoardRow,
  buyerName?: (id: number) => string,
) {
  if (row.stage === 'PURCHASE') {
    const waiting = row.waiting ? waitingLabels[row.waiting] : '采购中';
    const buyer =
      row.waiting &&
      row.waiting !== 'CLAIM' &&
      row.buyers.length > 0 &&
      buyerName
        ? `（${row.buyers.map((id) => buyerName(id)).join('、')}）`
        : '';
    return `采购 · ${waiting}${buyer}`;
  }
  if (row.stage === 'SHIP') {
    const shipped = decimal(row.quantities.shipped);
    const total = decimal(row.quantities.quantity);
    return shipped && total && shipped.isGreaterThan(0)
      ? `发货 · 已发 ${plain(shipped)}/${plain(total)}`
      : stageLabels.SHIP;
  }
  if (row.stage === 'RECEIPT' && row.money.known) {
    const confirmed = decimal(row.money.confirmed) ?? new BigNumber(0);
    const amount = decimal(row.amount);
    if (amount && amount.isGreaterThan(0) && confirmed.isGreaterThan(0))
      return `回款 · 已收 ${confirmed.dividedBy(amount).multipliedBy(100).integerValue(BigNumber.ROUND_FLOOR).toNumber()}%`;
  }
  return stageLabels[row.stage];
}

export type StepTone = 'active' | 'done' | 'late' | 'none' | 'unknown';
/** 六格进度的颜色；交期已过时当前格变红 */
export function stepTones(row: ContractBoardRow): StepTone[] {
  const late = row.dueBucket === 'OVERDUE';
  const current = row.steps.findIndex(
    (step) => step === 'ACTIVE' || step === 'WAITING',
  );
  return row.steps.map((step: ContractBoardStep, index) => {
    if (step === 'DONE') return 'done';
    if (step === 'UNKNOWN') return 'unknown';
    if (step === 'CLOSED') return 'none';
    if (index === current) return late && index > 0 ? 'late' : 'active';
    return step === 'ACTIVE' ? 'active' : 'none';
  });
}

export function dueText(row: ContractBoardRow) {
  if (row.shipState === 'ALL') return { main: '已发齐', tone: 'muted' };
  if (!row.dueDate) return { main: '未约定', tone: 'muted' };
  const days = row.dueDays ?? 0;
  const date = row.dueDate.slice(5);
  if (row.tab !== 'ACTIVE') return { main: row.dueDate, tone: 'muted' };
  if (days < 0) return { main: date, sub: `已过 ${-days} 天`, tone: 'late' };
  if (days === 0) return { main: date, sub: '今天到期', tone: 'soon' };
  if (days <= 7) return { main: date, sub: `还剩 ${days} 天`, tone: 'soon' };
  return { main: date, sub: `还剩 ${days} 天`, tone: 'plain' };
}

/** 收款条：绿 = 已确认，斜纹 = 已登记待财务确认 */
export function receiptBar(row: ContractBoardRow) {
  const amount = decimal(row.amount);
  if (!row.money.known || !amount || amount.isLessThanOrEqualTo(0))
    return {
      paid: 0,
      pending: 0,
      text: row.migrated ? '回款待核对' : '金额待核对',
    };
  const confirmed = decimal(row.money.confirmed) ?? new BigNumber(0);
  const pending = decimal(row.money.pending) ?? new BigNumber(0);
  const unpaid = decimal(row.money.unpaid) ?? new BigNumber(0);
  const pct = (value: BigNumber) =>
    Math.max(
      0,
      Math.min(100, value.dividedBy(amount).multipliedBy(100).toNumber()),
    );
  const paid = pct(confirmed);
  let text = `未收 ${plain(unpaid)}`;
  if (unpaid.isLessThanOrEqualTo(0)) text = '已收齐';
  else if (pending.isGreaterThan(0))
    text = `已登记 ${plain(pending)} 待财务确认`;
  return { paid, pending: Math.min(100 - paid, pct(pending)), text };
}

export interface RowNext {
  label: string;
  /** 直接在详情里办理；否则只是查看 */
  primary: boolean;
}
/** 只有轮到外贸自己时给出办理按钮；轮到别的部门时只看 */
export function rowNext(row: ContractBoardRow): RowNext {
  if (row.pendingCompletion) return { label: '补齐资料', primary: false };
  switch (row.stage) {
    case 'DRAFT': {
      return { label: '生效', primary: true };
    }
    case 'RECEIPT': {
      return { label: '登记回款', primary: true };
    }
    case 'REQUEST': {
      return { label: '提采购申请', primary: true };
    }
    case 'SHIP': {
      return { label: '安排出货', primary: true };
    }
    default: {
      return { label: '查看', primary: false };
    }
  }
}

export function flowCounts(overview: ContractBoardOverview | undefined) {
  return flowStages
    .filter(
      (stage) => stage.key !== 'CHECK' || (overview?.stages.CHECK ?? 0) > 0,
    )
    .map((stage) => ({ ...stage, count: overview?.stages[stage.key] ?? 0 }));
}

/** 门户与旧链接的入口参数：?mine=true&status=DRAFT&scope=pending */
export function entryFromQuery(query: Record<string, unknown>) {
  let tab: Exclude<ContractBoardTab, 'ALL'> = 'ACTIVE';
  if (query.scope === 'pending') tab = 'JINZHI';
  else if (query.tab === 'ENDED' || query.tab === 'JINZHI') tab = query.tab;
  let stage: FlowStage | undefined;
  if (query.status === 'DRAFT') stage = 'DRAFT';
  else if (
    typeof query.stage === 'string' &&
    flowStages.some((entry) => entry.key === query.stage)
  )
    stage = query.stage as FlowStage;
  const due =
    query.due === 'OVERDUE' || query.due === 'SOON' || query.due === 'NONE'
      ? (query.due as 'NONE' | 'OVERDUE' | 'SOON')
      : undefined;
  return {
    tab,
    stage,
    due,
    mine: ['false', 'true'].includes(String(query.mine))
      ? query.mine === 'true'
      : undefined,
  };
}

/** 金智历史合同的年份快捷筛选 → 签订日期区间 */
export function yearRange(year: 'ALL' | 'EARLIER' | number) {
  if (year === 'ALL') return {};
  if (year === 'EARLIER') return { signedTo: '2024-12-31' };
  return { signedFrom: `${year}-01-01`, signedTo: `${year}-12-31` };
}

function csvCell(value: unknown) {
  const text = value === null || value === undefined ? '' : String(value);
  return /[",\n\r]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}
export function contractCsv(
  rows: ContractBoardRow[],
  people: (id: null | number | undefined) => string,
) {
  const header = [
    '合同号',
    '订单名称',
    '客户',
    '签订日期',
    '产品',
    '数量',
    '阶段',
    '交期',
    '币种',
    '合同金额',
    '已确认回款',
    '待确认回款',
    '未收款',
    '负责人',
    '来源',
  ];
  const lines = rows.map((row) =>
    [
      row.code,
      row.name,
      row.customerName,
      row.signedDate,
      productText(row),
      quantityText(row),
      progressText(row),
      row.dueDate,
      row.currency ?? '未注明',
      row.amount,
      row.money.confirmed,
      row.money.pending,
      row.money.unpaid,
      people(row.ownerUserId),
      row.migrated ? '金智迁入' : '新系统',
    ]
      .map((cell) => csvCell(cell))
      .join(','),
  );
  return `﻿${[header.join(','), ...lines].join('\n')}`;
}
