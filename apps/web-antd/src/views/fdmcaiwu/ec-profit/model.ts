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

/** Only complete monthly reports contribute; a missing amount stays unknown. */
export function aggregateReadyReports(reports: Report[]): Metric {
  const completed = reports.filter((report) => report.status === 'READY');
  const total: Metric = {};
  for (const { metrics } of METRIC_GROUPS) {
    for (const { key, rate } of metrics) {
      if (rate) continue;
      const values = completed.map((report) => decimal(report.summary?.[key]));
      total[key] =
        values.length === 0 || values.some((value) => value === null)
          ? null
          : values
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
    sales === null ||
    sales.isZero() ||
    purchaseParts.some((value) => value === null)
      ? null
      : purchaseParts
          .reduce<BigNumber>((sum, value) => sum.plus(value!), new BigNumber(0))
          .div(sales)
          .toFixed(8);
  return total;
}

export function buildYearMonths(year: number, reports: Report[]) {
  const byMonth = new Map(reports.map((report) => [report.month, report]));
  return Array.from({ length: 12 }, (_, index) => {
    const month = `${year}-${String(index + 1).padStart(2, '0')}`;
    return { month, label: `${index + 1}月`, report: byMonth.get(month) };
  });
}
