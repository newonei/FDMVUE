import type { FdmgongchangDashboardApi } from '#/api/fdmgongchang/dashboard';
import type {
  CompanyAgingBucket,
  CompanyBoard,
  CompanySales,
} from '#/api/fdmplatform/company-board';

import type { Delta } from '../shared/format';

import {
  compactMoney,
  delta,
  formatCount,
  formatPercent,
  monthLabel,
  sum,
  toNumber,
} from '../shared/format';

export interface BoardLink {
  path: string;
  query?: Record<string, string>;
}

/** 电商按月汇总，月份与看板其他数据对齐（最后一个是本月）。 */
export interface EcBoard {
  months: string[];
  sales: number[];
  marketing: number[];
  orders: number[];
  refund: number[];
  /** 今年 1 月 1 日到今天 / 去年同期 */
  ytd: number;
  lastYtd: null | number;
  dataMaxDate?: string;
  /** 最后一个有数据的月份下标；月初数据还没上来时是上个月 */
  latest: number;
  /** latest 那个月有销售的店铺数 */
  shops: number;
  zeroSalesWithCost: number;
  highRefund: number;
}

export interface FactoryBoard {
  id: number;
  name: string;
  dashboard: FdmgongchangDashboardApi.Dashboard | null;
}

export interface BoardInput {
  board: CompanyBoard | null;
  ec: EcBoard | null;
  factories: FactoryBoard[];
  /** YYYY-MM-DD，页面所在日期 */
  today: string;
}

export interface KpiTile {
  key: string;
  label: string;
  value: string;
  sub: string;
  delta: Delta | null;
  deltaLabel: string;
  /** 近 12 个月，最后一个是本月 */
  spark: number[];
  link: BoardLink;
}

export interface LineStat {
  label: string;
  value: string;
  tone?: 'critical' | 'good' | 'warning';
}

export interface LineCard {
  key: string;
  name: string;
  icon: string;
  headlineLabel: string;
  headline: string;
  delta: Delta | null;
  deltaLabel: string;
  stats: LineStat[];
  spark: number[];
  note?: string;
  link: BoardLink;
}

export type AlertLevel = 'critical' | 'info' | 'serious' | 'warning';

export interface BoardAlert {
  key: string;
  level: AlertLevel;
  title: string;
  detail: string;
  link?: BoardLink;
}

export const LINKS = {
  cash: { path: '/caiwu/platform-receipts', query: { view: 'customers' } },
  domestic: { path: '/neixiao/platform-contracts' },
  ec: { path: '/fdmdata/ec-shop-daily/all' },
  ecSummary: { path: '/fdmdata/ec-shop-daily/summary' },
  factory: { path: '/gongchang/dashboard' },
  foreign: { path: '/fdmwaimao/platform-contracts' },
  orders: { path: '/fdmprocurement/platform-orders' },
  payments: { path: '/caiwu/platform-procurement-payments' },
  rates: { path: '/caiwu/platform-exchange-rates' },
  receipts: { path: '/caiwu/platform-receipts' },
  receivables: {
    path: '/caiwu/platform-receipts',
    query: { view: 'receivables' },
  },
  suppliers: { path: '/fdmprocurement/platform-suppliers' },
} satisfies Record<string, BoardLink>;

export const AGING_LABELS: Record<CompanyAgingBucket, string> = {
  UNSHIPPED: '未发货',
  D30: '30 天内',
  D60: '31–60 天',
  D90: '61–90 天',
  OVER90: '90 天以上',
};
export const AGING_ORDER: CompanyAgingBucket[] = [
  'UNSHIPPED',
  'D30',
  'D60',
  'D90',
  'OVER90',
];

/** 以 end 结尾的 count 个月，YYYY-MM。 */
export function trailingMonths(end: string, count: number): string[] {
  const [year, month] = end.split('-').map(Number) as [number, number];
  const result: string[] = [];
  for (let offset = count - 1; offset >= 0; offset--) {
    const index = year * 12 + (month - 1) - offset;
    result.push(
      `${Math.floor(index / 12)}-${String((index % 12) + 1).padStart(2, '0')}`,
    );
  }
  return result;
}

/** 按月份取值，没有的月份记 0。 */
export function alignMonths(
  months: readonly string[],
  sourceMonths: readonly string[] | undefined,
  values: readonly unknown[] | undefined,
): number[] {
  const byMonth = new Map<string, number>();
  (sourceMonths ?? []).forEach((month, index) =>
    byMonth.set(month, toNumber(values?.[index])),
  );
  return months.map((month) => byMonth.get(month) ?? 0);
}

function salesLines(board: CompanyBoard | null): CompanySales[] {
  return [board?.foreign, board?.domestic].filter(
    (line): line is CompanySales => !!line,
  );
}

/** 外贸 + 内销合计的逐月签约额。 */
export function combinedSigned(board: CompanyBoard | null, months: string[]) {
  return months.map((_, index) =>
    sum(
      salesLines(board).map(
        (line) => alignMonths(months, line.months, line.signed)[index],
      ),
    ),
  );
}

const last12 = (values: number[]) => values.slice(-12);

export function buildKpis(input: BoardInput, months: string[]): KpiTile[] {
  const { board, ec } = input;
  const tiles: KpiTile[] = [];
  const lines = salesLines(board);
  if (lines.length > 0) {
    const ytd = sum(lines.map((line) => line.ytd.amount));
    const lastYtd = sum(lines.map((line) => line.lastYtd.amount));
    const parts = lines.map(
      (line) =>
        `${line.channel === 'FOREIGN' ? '外贸' : '内销'} ${compactMoney(toNumber(line.ytd.amount))}`,
    );
    tiles.push({
      key: 'signed',
      label: '今年签约额',
      value: compactMoney(ytd),
      sub: parts.join(' · '),
      delta: delta(ytd, lastYtd),
      deltaLabel: '较去年同期',
      spark: last12(combinedSigned(board, months)),
      link: lines[0]!.channel === 'FOREIGN' ? LINKS.foreign : LINKS.domestic,
    });
  }
  const cash = board?.cashflow;
  if (cash) {
    const ytdIn = toNumber(cash.ytd.in);
    const ytdOut = toNumber(cash.ytd.out);
    tiles.push(
      {
        key: 'inflow',
        label: '今年回款',
        value: compactMoney(ytdIn),
        sub: `本月 ${compactMoney(toNumber(cash.thisMonth.in))}`,
        delta: delta(ytdIn, toNumber(cash.lastYtd.in)),
        deltaLabel: '较去年同期',
        spark: last12(alignMonths(months, cash.months, cash.inflow)),
        link: LINKS.cash,
      },
      {
        key: 'outflow',
        label: '今年付款',
        value: compactMoney(ytdOut),
        sub: `净流入 ${compactMoney(ytdIn - ytdOut)}`,
        delta: delta(ytdOut, toNumber(cash.lastYtd.out), null),
        deltaLabel: '较去年同期',
        spark: last12(alignMonths(months, cash.months, cash.outflow)),
        link: LINKS.payments,
      },
    );
  }
  if (ec) {
    tiles.push({
      key: 'ec',
      label: '电商今年销售额',
      value: compactMoney(ec.ytd),
      sub: `${monthLabel(ec.months[ec.latest] ?? '')} ${compactMoney(ec.sales[ec.latest] ?? 0)} · ${formatCount(ec.shops)} 家店铺`,
      delta: delta(ec.ytd, ec.lastYtd),
      deltaLabel: '较去年同期',
      spark: last12(ec.sales),
      link: LINKS.ecSummary,
    });
  }
  if (lines.length > 0) {
    const unpaid = sum(lines.map((line) => line.unpaid.amount));
    const over90 = sum(
      lines.map((line) => line.aging?.OVER90?.amount ?? 0),
    );
    const hasAging = lines.some((line) => line.aging);
    tiles.push({
      key: 'unpaid',
      label: '在手合同未回款',
      value: compactMoney(unpaid),
      sub: hasAging
        ? `90 天以上 ${compactMoney(over90)}`
        : `${formatCount(sum(lines.map((line) => line.unpaid.count)))} 份合同`,
      delta: null,
      deltaLabel: '',
      spark: [],
      link: hasAging ? LINKS.receivables : LINKS.foreign,
    });
  }
  const purchasing = board?.purchasing;
  if (purchasing) {
    tiles.push({
      key: 'purchasing',
      label: '近 12 个月采购额',
      value: compactMoney(toNumber(purchasing.recent12Amount)),
      sub: `${formatCount(purchasing.recent12Orders)} 张采购单`,
      delta: null,
      deltaLabel: '',
      spark: alignMonths(
        months.slice(-12),
        purchasing.months,
        purchasing.monthly,
      ),
      link: LINKS.orders,
    });
  }
  return tiles;
}

function salesCard(line: CompanySales): LineCard {
  const foreign = line.channel === 'FOREIGN';
  const stats: LineStat[] = [
    {
      label: '本月签约',
      value: `${compactMoney(toNumber(line.thisMonth.amount))} · ${formatCount(line.thisMonth.count)} 份`,
    },
    {
      label: '执行中合同',
      value: `${formatCount(line.active.count)} 份 · ${compactMoney(toNumber(line.active.amount))}`,
    },
    {
      label: '未回款',
      value: compactMoney(toNumber(line.unpaid.amount)),
    },
    {
      label: '交期已逾期',
      tone: line.due.overdue > 0 ? 'critical' : 'good',
      value: `${formatCount(line.due.overdue)} 份`,
    },
  ];
  const notes: string[] = [];
  if (line.unconverted.length > 0) {
    notes.push(`${line.unconverted.join('、')} 缺汇率，只计份数`);
  }
  return {
    key: foreign ? 'foreign' : 'domestic',
    name: foreign ? '外贸' : '内销',
    icon: foreign ? 'lucide:globe-2' : 'lucide:store',
    headlineLabel: '今年签约额',
    headline: compactMoney(toNumber(line.ytd.amount)),
    delta: delta(toNumber(line.ytd.amount), toNumber(line.lastYtd.amount)),
    deltaLabel: '较去年同期',
    stats,
    spark: last12(line.signed.map((value) => toNumber(value))),
    note: notes.join('；') || undefined,
    link: foreign ? LINKS.foreign : LINKS.domestic,
  };
}

function ratio(part: number, whole: number) {
  return whole > 0 ? (part / whole) * 100 : null;
}

export function factoryStats(dashboard: FdmgongchangDashboardApi.Dashboard) {
  const kpi = dashboard.kpi;
  const good = toNumber(kpi.good);
  const defect = toNumber(kpi.defect);
  return {
    packed: toNumber(kpi.packedGood),
    packedPrev: toNumber(kpi.packedGoodPrev),
    unit: kpi.packedUnit || '',
    yieldRate: ratio(good, good + defect),
    planRate:
      kpi.planRate === null || kpi.planRate === undefined
        ? null
        : toNumber(kpi.planRate),
    openOrders: kpi.openOrders ?? 0,
    overdueOrders: kpi.overdueOrders ?? 0,
    wip: kpi.wipCount ?? 0,
    stale: kpi.staleCount ?? 0,
  };
}

export function buildLines(input: BoardInput): LineCard[] {
  const { board, ec, factories } = input;
  const cards = salesLines(board).map((line) => salesCard(line));
  if (ec) {
    const index = ec.latest;
    const sales = ec.sales[index] ?? 0;
    const marketing = ec.marketing[index] ?? 0;
    const refund = ec.refund[index] ?? 0;
    // 当月还没过完时不和去年整月比
    const complete = index < ec.months.length - 1;
    const lastYear = complete ? ec.sales[index - 12] : undefined;
    const costRatio = ratio(marketing, sales);
    const refundRatio = ratio(refund, sales);
    cards.push({
      key: 'ec',
      name: '电商',
      icon: 'lucide:shopping-cart',
      headlineLabel: `${monthLabel(ec.months[index] ?? '')}销售额${complete ? '' : '（本月至今）'}`,
      headline: compactMoney(sales),
      delta: delta(sales, lastYear),
      deltaLabel: '较去年同月',
      stats: [
        { label: '真实订单', value: formatCount(ec.orders[index] ?? 0, ' 单') },
        { label: '营销费用', value: compactMoney(marketing) },
        {
          label: '营销费比',
          tone: costRatio !== null && costRatio > 30 ? 'warning' : undefined,
          value: formatPercent(costRatio),
        },
        {
          label: '退款率',
          tone:
            refundRatio !== null && refundRatio > 15 ? 'warning' : undefined,
          value: formatPercent(refundRatio),
        },
      ],
      spark: last12(ec.sales),
      note: ec.dataMaxDate ? `数据更新至 ${ec.dataMaxDate}` : undefined,
      link: LINKS.ecSummary,
    });
  }
  const purchasing = board?.purchasing;
  if (purchasing) {
    const months = purchasing.months ?? [];
    const monthly = (purchasing.monthly ?? []).map((value) => toNumber(value));
    cards.push({
      key: 'purchasing',
      name: '采购',
      icon: 'lucide:package-search',
      headlineLabel: '本月至今采购额',
      headline: compactMoney(monthly.at(-1) ?? 0),
      // 本月还没过完，不和上月整月比
      delta: null,
      deltaLabel: '',
      stats: [
        {
          label: '近 12 个月',
          value: compactMoney(toNumber(purchasing.recent12Amount)),
        },
        {
          label: '采购单',
          value: formatCount(purchasing.recent12Orders, ' 张'),
        },
        {
          label: '活跃供应商',
          value: formatCount(purchasing.activeSuppliers, ' 家'),
        },
        {
          label: '月均',
          value: compactMoney(
            months.length > 0 ? sum(monthly) / months.length : 0,
          ),
        },
      ],
      spark: monthly.slice(-12),
      link: LINKS.orders,
    });
  }
  for (const factory of factories) {
    if (!factory.dashboard) continue;
    const stats = factoryStats(factory.dashboard);
    cards.push({
      key: `factory-${factory.id}`,
      name: factory.name,
      icon: 'lucide:factory',
      headlineLabel: '近 30 天成品',
      headline: `${formatCount(stats.packed)}${stats.unit ? ` ${stats.unit}` : ''}`,
      delta: delta(stats.packed, stats.packedPrev),
      deltaLabel: '较前 30 天',
      stats: [
        {
          label: '良品率',
          tone:
            stats.yieldRate !== null && stats.yieldRate < 95
              ? 'warning'
              : undefined,
          value: formatPercent(stats.yieldRate),
        },
        { label: '排单达成', value: formatPercent(stats.planRate) },
        { label: '待交付订单', value: formatCount(stats.openOrders, ' 张') },
        {
          label: '逾期订单',
          tone: stats.overdueOrders > 0 ? 'critical' : 'good',
          value: formatCount(stats.overdueOrders, ' 张'),
        },
      ],
      spark: dailyPacked(factory.dashboard),
      link: LINKS.factory,
    });
  }
  return cards;
}

/** 工厂看板的逐日趋势按天合计良品，作为卡片里的小图。 */
function dailyPacked(dashboard: FdmgongchangDashboardApi.Dashboard) {
  const byDay = new Map<string, number>();
  for (const point of dashboard.trend ?? []) {
    const day = Array.isArray(point.date)
      ? point.date.join('-')
      : String(point.date);
    byDay.set(day, (byDay.get(day) ?? 0) + toNumber(point.good));
  }
  return [...byDay.entries()]
    .toSorted(([a], [b]) => a.localeCompare(b))
    .map(([, value]) => value);
}

export interface AgingRow {
  bucket: CompanyAgingBucket;
  label: string;
  amount: number;
  count: number;
  share: number;
}

export function agingRows(board: CompanyBoard | null): AgingRow[] | null {
  const lines = salesLines(board).filter((line) => line.aging);
  if (lines.length === 0) return null;
  const rows = AGING_ORDER.map((bucket) => ({
    bucket,
    label: AGING_LABELS[bucket],
    amount: sum(lines.map((line) => line.aging?.[bucket]?.amount ?? 0)),
    count: sum(lines.map((line) => line.aging?.[bucket]?.count ?? 0)),
    share: 0,
  }));
  const total = sum(rows.map((row) => row.amount));
  return rows.map((row) => ({
    ...row,
    share: total > 0 ? (row.amount / total) * 100 : 0,
  }));
}

export interface RankRow {
  key: string;
  name: string;
  tag?: string;
  amount: number;
  detail: string;
}

export function topCustomers(board: CompanyBoard | null): RankRow[] {
  return salesLines(board)
    .flatMap((line) =>
      line.topCustomers.map((customer) => ({
        amount: toNumber(customer.amount),
        detail: `${formatCount(customer.contracts)} 份合同`,
        key: `${line.channel}-${customer.id ?? customer.name}`,
        name: customer.name || '未命名客户',
        tag: line.channel === 'FOREIGN' ? '外贸' : '内销',
      })),
    )
    .filter((row) => row.amount > 0)
    .toSorted((a, b) => b.amount - a.amount)
    .slice(0, 5);
}

export function topSuppliers(board: CompanyBoard | null): RankRow[] {
  return (board?.purchasing?.topSuppliers ?? [])
    .map((supplier) => ({
      amount: toNumber(supplier.amount),
      detail: `${formatCount(supplier.orders)} 张采购单`,
      key: supplier.id ?? supplier.name,
      name: supplier.name,
    }))
    .slice(0, 5);
}

const LEVEL_ORDER: Record<AlertLevel, number> = {
  critical: 0,
  serious: 1,
  warning: 2,
  info: 3,
};

function daysBetween(from: string, to: string) {
  const start = Date.parse(`${from.slice(0, 10)}T00:00:00Z`);
  const end = Date.parse(`${to.slice(0, 10)}T00:00:00Z`);
  return Number.isFinite(start) && Number.isFinite(end)
    ? Math.round((end - start) / 86_400_000)
    : null;
}

export function buildAlerts(input: BoardInput): BoardAlert[] {
  const { board, ec, factories, today } = input;
  const alerts: BoardAlert[] = [];
  for (const line of salesLines(board)) {
    const name = line.channel === 'FOREIGN' ? '外贸' : '内销';
    const link = line.channel === 'FOREIGN' ? LINKS.foreign : LINKS.domestic;
    if (line.due.overdue > 0) {
      alerts.push({
        detail: `另有 ${line.due.soon} 份 ${line.due.soonDays} 天内到期`,
        key: `${line.channel}-overdue`,
        level: 'critical',
        link,
        title: `${name} ${line.due.overdue} 份合同交期已过未发齐`,
      });
    }
    const over90 = line.aging?.OVER90;
    if (over90 && over90.count > 0) {
      alerts.push({
        detail: `合计 ${compactMoney(toNumber(over90.amount))}，按最后一次发货算账龄`,
        key: `${line.channel}-over90`,
        level: 'serious',
        link: LINKS.receivables,
        title: `${name} ${over90.count} 份合同发货超过 90 天未收齐`,
      });
    }
    if (line.unconverted.length > 0) {
      alerts.push({
        detail: '这些合同只计份数，签约额偏低',
        key: `${line.channel}-rates`,
        level: 'warning',
        link: LINKS.rates,
        title: `${name}合同缺 ${line.unconverted.join('、')} 汇率`,
      });
    }
  }
  const cash = board?.cashflow;
  if (cash && cash.pending.count > 0) {
    alerts.push({
      detail: `合计 ${compactMoney(toNumber(cash.pending.cny))}，确认后才计入收付`,
      key: 'cash-pending',
      level: 'info',
      link: LINKS.receipts,
      title: `${cash.pending.count} 笔收付款待确认`,
    });
  }
  if (ec) {
    if (ec.zeroSalesWithCost > 0) {
      alerts.push({
        detail: `${monthLabel(ec.months[ec.latest] ?? '')}有营销投入但没有实际销售额`,
        key: 'ec-zero',
        level: 'serious',
        link: LINKS.ecSummary,
        title: `电商 ${ec.zeroSalesWithCost} 家店铺只花费不出单`,
      });
    }
    if (ec.highRefund > 0) {
      alerts.push({
        detail: `${monthLabel(ec.months[ec.latest] ?? '')}退款金额占比偏高`,
        key: 'ec-refund',
        level: 'warning',
        link: LINKS.ecSummary,
        title: `电商 ${ec.highRefund} 家店铺退款率偏高`,
      });
    }
    const lag = ec.dataMaxDate ? daysBetween(ec.dataMaxDate, today) : null;
    if (lag !== null && lag > 2) {
      alerts.push({
        detail: `店铺后台日汇总最新到 ${ec.dataMaxDate}`,
        key: 'ec-lag',
        level: lag > 7 ? 'serious' : 'warning',
        link: LINKS.ec,
        title: `电商数据已 ${lag} 天未更新`,
      });
    }
  }
  for (const factory of factories) {
    if (!factory.dashboard) continue;
    const stats = factoryStats(factory.dashboard);
    if (stats.overdueOrders > 0) {
      alerts.push({
        detail: `待交付共 ${stats.openOrders} 张`,
        key: `factory-${factory.id}-overdue`,
        level: 'critical',
        link: LINKS.factory,
        title: `${factory.name} ${stats.overdueOrders} 张订单已逾期`,
      });
    }
    if (stats.stale > 0) {
      alerts.push({
        detail: '领料超过 8 小时还没报数量',
        key: `factory-${factory.id}-stale`,
        level: 'warning',
        link: LINKS.factory,
        title: `${factory.name} ${stats.stale} 张在制单未报工`,
      });
    }
  }
  return alerts.toSorted((a, b) => LEVEL_ORDER[a.level] - LEVEL_ORDER[b.level]);
}

/** 签约 / 收付 / 电商 / 采购 四个趋势视图里，当前账号能看的。 */
export type TrendView = 'cash' | 'ec' | 'purchasing' | 'signed';

export function trendViews(input: BoardInput) {
  const views: { label: string; value: TrendView }[] = [];
  if (salesLines(input.board).length > 0) {
    views.push({ label: '签约额', value: 'signed' });
  }
  if (input.board?.cashflow) views.push({ label: '回款与付款', value: 'cash' });
  if (input.ec) views.push({ label: '电商销售', value: 'ec' });
  if (input.board?.purchasing) {
    views.push({ label: '采购额', value: 'purchasing' });
  }
  return views;
}
