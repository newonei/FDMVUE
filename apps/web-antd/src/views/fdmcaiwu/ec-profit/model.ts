import type { FdmcaiwuEcProfitApi } from '#/api/fdmcaiwu/ec-profit';

import BigNumber from 'bignumber.js';

type Metric = FdmcaiwuEcProfitApi.Metric;
type Report = FdmcaiwuEcProfitApi.Report;
export type MetricKey = keyof Metric;

export const METRIC_GROUPS: {
  title: string;
  metrics: { key: MetricKey; label: string; rate?: boolean }[];
}[] = [
  {
    title: '收入',
    metrics: [
      { key: 'salesAmount', label: '销售额' },
      { key: 'newProductGiftAmount', label: '新品礼金' },
      { key: 'customerRefundAmount', label: '客户返款' },
    ],
  },
  {
    title: '采购',
    metrics: [
      { key: 'purchaseCost', label: '采购成本（自营+周边）' },
      { key: 'ownPurchaseCost', label: '自营采购成本' },
      { key: 'accessoryPurchaseCost', label: '周边采购成本' },
      { key: 'dropshipPurchaseCost', label: '代发采购' },
      { key: 'purchaseCostRate', label: '采购占比', rate: true },
    ],
  },
  {
    title: '运费',
    metrics: [
      { key: 'estimatedFreight', label: '聚水潭暂估运费' },
      { key: 'freightAdjustment', label: '运费差异' },
      { key: 'freightCost', label: '快递运费' },
      { key: 'freightRate', label: '运费占比', rate: true },
    ],
  },
  {
    title: '费用',
    metrics: [
      { key: 'promotionCost', label: '推广费' },
      { key: 'promotionRate', label: '推广占比', rate: true },
      { key: 'platformFee', label: '平台费用' },
      { key: 'platformFeeRate', label: '平台费占比', rate: true },
      { key: 'taxFee', label: '税费' },
    ],
  },
  {
    title: '利润',
    metrics: [
      { key: 'grossProfit', label: '毛利润' },
      { key: 'grossMargin', label: '毛利率', rate: true },
    ],
  },
];

const RATE_NUMERATORS: Partial<Record<MetricKey, MetricKey>> = {
  freightRate: 'freightCost',
  grossMargin: 'grossProfit',
  platformFeeRate: 'platformFee',
  promotionRate: 'promotionCost',
};

function decimal(value: FdmcaiwuEcProfitApi.Decimal | undefined) {
  if (value === null || value === undefined || value === '') return null;
  const result = new BigNumber(value);
  return result.isFinite() ? result : null;
}

export function formatMetric(
  value: FdmcaiwuEcProfitApi.Decimal | undefined,
  rate = false,
) {
  const amount = decimal(value);
  if (amount === null) return '—';
  return rate ? `${amount.times(100).toFixed(2)}%` : amount.toFormat(2);
}

/** Sums amounts (any unknown → unknown) and recomputes every rate from the totals. */
export function sumMetrics(values: Metric[]): Metric {
  const total: Metric = {};
  for (const { metrics } of METRIC_GROUPS) {
    for (const { key, rate } of metrics) {
      if (rate) continue;
      const amounts = values.map((value) => decimal(value[key]));
      total[key] =
        amounts.length === 0 || amounts.includes(null)
          ? null
          : amounts
              .reduce<BigNumber>(
                (sum, value) => sum.plus(value!),
                new BigNumber(0),
              )
              .toFixed();
    }
  }
  const sales = decimal(total.salesAmount);
  for (const [rate, numerator] of Object.entries(RATE_NUMERATORS)) {
    const amount = decimal(total[numerator as MetricKey]);
    total[rate as MetricKey] =
      sales === null || sales.isZero() || amount === null
        ? null
        : amount.div(sales).toFixed(8);
  }
  const purchaseParts = [
    total.ownPurchaseCost,
    total.accessoryPurchaseCost,
    total.dropshipPurchaseCost,
  ].map(decimal);
  total.purchaseCostRate =
    sales === null || sales.isZero() || purchaseParts.includes(null)
      ? null
      : purchaseParts
          .reduce<BigNumber>((sum, value) => sum.plus(value!), new BigNumber(0))
          .div(sales)
          .toFixed(8);
  return total;
}

/** Only complete monthly reports contribute; a missing amount stays unknown. */
export function aggregateReadyReports(reports: Report[]): Metric {
  return sumMetrics(
    reports
      .filter((report) => report.status === 'READY')
      .map((report) => report.summary ?? {}),
  );
}

export function toNumber(value: FdmcaiwuEcProfitApi.Decimal | undefined) {
  return decimal(value)?.toNumber() ?? null;
}

/** 大额读数：≥1万 显示「万」，完整金额放在悬浮提示或表格里。 */
export function formatCompact(value: FdmcaiwuEcProfitApi.Decimal | undefined) {
  const amount = decimal(value);
  if (amount === null) return '—';
  return amount.abs().gte(10_000)
    ? `${amount.div(10_000).toFormat(amount.abs().gte(1_000_000) ? 1 : 2)}万`
    : amount.toFormat(0);
}

/** 环比：金额按相对变化，比率按百分点差。两边任一未知则不给结论。 */
export function changeOf(
  current: FdmcaiwuEcProfitApi.Decimal | undefined,
  previous: FdmcaiwuEcProfitApi.Decimal | undefined,
  rate = false,
) {
  const now = decimal(current);
  const before = decimal(previous);
  if (now === null || before === null) return undefined;
  if (rate) {
    const points = now.minus(before).times(100);
    return {
      direction: points.isZero() ? 0 : points.isPositive() ? 1 : -1,
      text: `${points.isNegative() ? '' : '+'}${points.toFixed(2)} 个百分点`,
    };
  }
  if (before.isZero()) return undefined;
  const ratio = now.minus(before).div(before.abs()).times(100);
  return {
    direction: ratio.isZero() ? 0 : ratio.isPositive() ? 1 : -1,
    text: `${ratio.isNegative() ? '' : '+'}${ratio.toFixed(1)}%`,
  };
}

export function buildYearMonths(year: number, reports: Report[]) {
  const byMonth = new Map(reports.map((report) => [report.month, report]));
  return Array.from({ length: 12 }, (_, index) => {
    const month = `${year}-${String(index + 1).padStart(2, '0')}`;
    return { month, label: `${index + 1}月`, report: byMonth.get(month) };
  });
}
