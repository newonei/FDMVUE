<script lang="ts" setup>
import type { ECOption } from '@vben/plugins/echarts';

import type { EcShopDailyOption } from '../data';
import type { FdmDateRange } from '#/components/fdm-date-range-picker';

import dayjs from 'dayjs';
import { computed, onBeforeUnmount, reactive, ref } from 'vue';

import {
  AutoComplete,
  Button,
  Card,
  Col,
  Form,
  FormItem,
  Row,
  Space,
  Spin,
  Tag,
  Tooltip,
} from 'ant-design-vue';

import {
  getEcShopDailyPlatformDetailPage,
  getEcShopDailyShopNameOptions,
} from '#/api/fdmdata/ecshopdaily';
import { FdmDateRangePicker } from '#/components/fdm-date-range-picker';

import {
  fmtAmount2,
  fmtPercent2,
  normalizeStatDateKey,
  round2,
} from '../dashboard-utils';
import EchartsBox from './echarts-box.vue';

defineOptions({ name: 'EcShopDailyDouyinDashboard' });

const PAGE_SIZE = 200;
const MAX_PAGES = 40;
const PLATFORM_CODE = 'DOUYIN';
const PLATFORM_LABEL = '抖音';

type DetailRow = Record<string, any>;

interface DouyinBucket {
  actualSales: number;
  adCost: number;
  adCostRatioCount: number;
  adCostRatioSum: number;
  adCostRatioWeight: number;
  adCostRatioWeightedTotal: number;
  buyerCount: number;
  clickPeople: number;
  expense: number;
  exposurePeople: number;
  orderCount: number;
  paidAmount: number;
  platformCommission: number;
  refundPayment: number;
  refundRefund: number;
  selfOrders: number;
  selfPaid: number;
  talentCommission: number;
  talentOrders: number;
  talentPaid: number;
  transactionAmount: number;
}

function currentYearRange(): FdmDateRange {
  return [
    dayjs().startOf('year').format('YYYY-MM-DD'),
    dayjs().endOf('year').format('YYYY-MM-DD'),
  ];
}

function asNumber(value: unknown): number {
  if (value === null || value === undefined || value === '') return 0;
  const n = Number(String(value).replace('%', '').replace(/,/g, '').trim());
  return Number.isFinite(n) ? n : 0;
}

function getValue(row: DetailRow, ...keys: string[]): unknown {
  for (const key of keys) {
    if (row[key] !== undefined && row[key] !== null && row[key] !== '') {
      return row[key];
    }
  }
  return undefined;
}

function getNumber(row: DetailRow, ...keys: string[]): number {
  return asNumber(getValue(row, ...keys));
}

function amountShort(value: unknown): string {
  const n = round2(value);
  const abs = Math.abs(n);
  if (abs >= 100_000_000) return `${round2(n / 100_000_000)}亿`;
  if (abs >= 10_000) return `${round2(n / 10_000)}万`;
  return n.toLocaleString('zh-CN', { maximumFractionDigits: 0 });
}

function kpiMoney(value: unknown): string {
  return `¥${amountShort(value)}`;
}

function kpiNumber(value: unknown): string {
  return amountShort(value);
}

function fullMoney(value: unknown): string {
  return `¥${fmtAmount2(value)}`;
}

function fullNumber(value: unknown): string {
  return round2(value).toLocaleString('zh-CN', { maximumFractionDigits: 0 });
}

function ratioPercent(numerator: number, denominator: number): null | number {
  if (denominator <= 0) return null;
  return round2((numerator / denominator) * 100);
}

function effectiveAdCostRatio(bucket: DouyinBucket): null | number {
  if (bucket.adCostRatioWeight > 0) {
    return round2(bucket.adCostRatioWeightedTotal / bucket.adCostRatioWeight);
  }
  if (bucket.adCostRatioCount > 0) {
    return round2(bucket.adCostRatioSum / bucket.adCostRatioCount);
  }
  return ratioPercent(bucket.adCost, bucket.actualSales);
}

function ratioLabel(value: null | number | undefined): string {
  if (value === null || value === undefined) return '-';
  return `${round2(value).toFixed(2)}%`;
}

function metricTitle(description: string, value: string): string {
  return `${description} 当前值：${value}`;
}

function newBucket(): DouyinBucket {
  return {
    actualSales: 0,
    adCost: 0,
    adCostRatioCount: 0,
    adCostRatioSum: 0,
    adCostRatioWeight: 0,
    adCostRatioWeightedTotal: 0,
    buyerCount: 0,
    clickPeople: 0,
    expense: 0,
    exposurePeople: 0,
    orderCount: 0,
    paidAmount: 0,
    platformCommission: 0,
    refundPayment: 0,
    refundRefund: 0,
    selfOrders: 0,
    selfPaid: 0,
    talentCommission: 0,
    talentOrders: 0,
    talentPaid: 0,
    transactionAmount: 0,
  };
}

function rowToBucket(row: DetailRow): DouyinBucket {
  const actualSales = getNumber(row, 'actual_sales_amount', 'actualSalesAmount');
  const adCost = getNumber(row, 'ad_cost', 'adCost');
  const adCostRatioRaw = getValue(row, 'ad_cost_ratio', 'adCostRatio');
  const hasAdCostRatio =
    adCostRatioRaw !== undefined && adCostRatioRaw !== null && adCostRatioRaw !== '';
  const adCostRatio = hasAdCostRatio ? asNumber(adCostRatioRaw) : 0;
  const platformCommission = getNumber(
    row,
    'platform_commission',
    'platformCommission',
  );
  const talentCommission = getNumber(
    row,
    'talent_commission',
    'talentCommission',
  );
  const expense =
    getNumber(row, 'expense_amount', 'expenseAmount') ||
    round2(adCost + platformCommission + talentCommission);
  return {
    actualSales,
    adCost,
    adCostRatioCount: hasAdCostRatio ? 1 : 0,
    adCostRatioSum: hasAdCostRatio ? adCostRatio : 0,
    adCostRatioWeight: hasAdCostRatio && actualSales > 0 ? actualSales : 0,
    adCostRatioWeightedTotal:
      hasAdCostRatio && actualSales > 0 ? adCostRatio * actualSales : 0,
    buyerCount: getNumber(row, 'buyer_count', 'buyerCount'),
    clickPeople: getNumber(row, 'talent_6', 'talent6'),
    expense,
    exposurePeople: getNumber(row, 'talent_5', 'talent5'),
    orderCount: getNumber(row, 'paid_order_count', 'paidOrderCount'),
    paidAmount: getNumber(row, 'paid_amount', 'paidAmount'),
    platformCommission,
    refundPayment: getNumber(
      row,
      'refund_amount_payment_time',
      'refundAmountPaymentTime',
    ),
    refundRefund: getNumber(
      row,
      'refund_amount_refund_time',
      'refundAmountRefundTime',
    ),
    selfOrders: getNumber(row, 'paid_order_count_self', 'paidOrderCountSelf'),
    selfPaid: getNumber(row, 'paid_amount_self', 'paidAmountSelf'),
    talentCommission,
    talentOrders: getNumber(row, 'paid_order_count_talent', 'paidOrderCountTalent'),
    talentPaid: getNumber(row, 'paid_amount_talent', 'paidAmountTalent'),
    transactionAmount: getNumber(row, 'transaction_amount', 'transactionAmount'),
  };
}

function addBucket(target: DouyinBucket, source: DouyinBucket) {
  target.actualSales = round2(target.actualSales + source.actualSales);
  target.adCost = round2(target.adCost + source.adCost);
  target.adCostRatioCount += source.adCostRatioCount;
  target.adCostRatioSum = round2(target.adCostRatioSum + source.adCostRatioSum);
  target.adCostRatioWeight = round2(
    target.adCostRatioWeight + source.adCostRatioWeight,
  );
  target.adCostRatioWeightedTotal =
    target.adCostRatioWeightedTotal + source.adCostRatioWeightedTotal;
  target.buyerCount += source.buyerCount;
  target.clickPeople += source.clickPeople;
  target.expense = round2(target.expense + source.expense);
  target.exposurePeople += source.exposurePeople;
  target.orderCount += source.orderCount;
  target.paidAmount = round2(target.paidAmount + source.paidAmount);
  target.platformCommission = round2(
    target.platformCommission + source.platformCommission,
  );
  target.refundPayment = round2(target.refundPayment + source.refundPayment);
  target.refundRefund = round2(target.refundRefund + source.refundRefund);
  target.selfOrders += source.selfOrders;
  target.selfPaid = round2(target.selfPaid + source.selfPaid);
  target.talentCommission = round2(
    target.talentCommission + source.talentCommission,
  );
  target.talentOrders += source.talentOrders;
  target.talentPaid = round2(target.talentPaid + source.talentPaid);
  target.transactionAmount = round2(
    target.transactionAmount + source.transactionAmount,
  );
}

function statDateOf(row: DetailRow): string {
  return normalizeStatDateKey(getValue(row, 'stat_date', 'statDate') as any);
}

function aggregateByKey(
  rows: DetailRow[],
  keyOf: (dateKey: string) => string,
  maxCount?: number,
) {
  const map = new Map<string, DouyinBucket>();
  for (const row of rows) {
    const dateKey = statDateOf(row);
    if (!dateKey) continue;
    const key = keyOf(dateKey);
    const bucket = map.get(key) ?? newBucket();
    addBucket(bucket, rowToBucket(row));
    map.set(key, bucket);
  }
  const labels = [...map.keys()].toSorted();
  const slicedLabels = maxCount ? labels.slice(-maxCount) : labels;
  return {
    buckets: slicedLabels.map((label) => map.get(label)!),
    labels: slicedLabels,
  };
}

function sliceLastRows(rows: DetailRow[], days: number): DetailRow[] {
  const daily = aggregateByKey(rows, (dateKey) => dateKey);
  const labels = daily.labels.slice(-days);
  const labelSet = new Set(labels);
  return rows.filter((row) => labelSet.has(statDateOf(row)));
}

const loading = ref(false);
const truncated = ref(false);
const totalRemote = ref(0);
const rawRows = ref<DetailRow[]>([]);
const shopNameOptions = ref<EcShopDailyOption[]>([]);
let shopNameFetchSeq = 0;
let shopNameSearchTimer: ReturnType<typeof setTimeout> | undefined;

const dashForm = reactive<{
  shopName: string;
  statDate: FdmDateRange;
}>({
  shopName: '',
  statDate: currentYearRange(),
});

const sortedRows = computed(() =>
  [...rawRows.value].toSorted((a, b) => statDateOf(a).localeCompare(statDateOf(b))),
);
const last7Rows = computed(() => sliceLastRows(sortedRows.value, 7));
const last30Rows = computed(() => sliceLastRows(sortedRows.value, 30));

const rangeKpi = computed(() => {
  const bucket = newBucket();
  for (const row of sortedRows.value) addBucket(bucket, rowToBucket(row));
  const adRatio = effectiveAdCostRatio(bucket);
  const expenseRatio = ratioPercent(bucket.expense, bucket.actualSales);
  const refundRatio = ratioPercent(bucket.refundPayment, bucket.paidAmount);
  const selfShare = ratioPercent(bucket.selfPaid, bucket.selfPaid + bucket.talentPaid);
  const talentShare = ratioPercent(
    bucket.talentPaid,
    bucket.selfPaid + bucket.talentPaid,
  );
  const avgOrderValue =
    bucket.orderCount > 0 ? round2(bucket.transactionAmount / bucket.orderCount) : 0;
  const clickRate = ratioPercent(bucket.clickPeople, bucket.exposurePeople);
  return {
    ...bucket,
    adRatio,
    avgOrderValue,
    clickRate,
    expenseRatio,
    refundRatio,
    selfShare,
    talentShare,
  };
});

const monthAgg = computed(() =>
  aggregateByKey(sortedRows.value, (dateKey) => dateKey.slice(0, 7)),
);
const last7Agg = computed(() =>
  aggregateByKey(last7Rows.value, (dateKey) => dateKey),
);
const last30Agg = computed(() =>
  aggregateByKey(last30Rows.value, (dateKey) => dateKey),
);

const yearLabel = computed(() => {
  const start = dashForm.statDate[0]?.slice(0, 4);
  const end = dashForm.statDate[1]?.slice(0, 4);
  return start && start === end ? start : '区间';
});

const filterSummary = computed(() => {
  const shop = dashForm.shopName?.trim() || '全部店铺';
  return `${dashForm.statDate[0]} ~ ${dashForm.statDate[1]} · ${PLATFORM_LABEL} · ${shop}`;
});

const dataSummary = computed(() => {
  const days = aggregateByKey(sortedRows.value, (dateKey) => dateKey).labels.length;
  if (!days && !loading.value) return '暂无数据，请调整筛选条件';
  return `合并后 ${days} 个统计日 · 原始记录 ${rawRows.value.length} 条`;
});

const diagnosticItems = computed(() => {
  const kpi = rangeKpi.value;
  const latest = sortedRows.value.at(-1);
  const highRefundDays = last30Agg.value.buckets.filter((bucket) => {
    const rate = ratioPercent(bucket.refundPayment, bucket.paidAmount);
    return rate !== null && rate >= 20;
  }).length;
  const highAdDays = last30Agg.value.buckets.filter((bucket) => {
    const rate = ratioPercent(bucket.adCost, bucket.actualSales);
    return rate !== null && rate >= 25;
  }).length;
  return [
    {
      description: '投放费比 = 投放消耗 / 实际销售额，用于衡量广告投放成本压力。',
      label: '投放费比',
      value: ratioLabel(kpi.adRatio),
      tone: kpi.adRatio !== null && kpi.adRatio <= 20 ? 'green' : 'orange',
    },
    {
      description: '支出占比 = 总支出费用 / 实际销售额，支出包含投放、佣金及平台扣点等费用。',
      label: '支出占比',
      value: ratioLabel(kpi.expenseRatio),
      tone: kpi.expenseRatio !== null && kpi.expenseRatio <= 30 ? 'green' : 'red',
    },
    {
      description: '退款率 = 退款金额 / 支付金额，用于观察售后退款对成交的影响。',
      label: '退款率',
      value: ratioLabel(kpi.refundRatio),
      tone: kpi.refundRatio !== null && kpi.refundRatio <= 20 ? 'green' : 'red',
    },
    {
      description: '客单价 = 实际销售额 / 成交订单数，用于衡量单笔成交价值。',
      label: '客单价',
      value: `¥${fmtAmount2(kpi.avgOrderValue)}`,
      tone: 'blue',
    },
    {
      description: '自播销售占比 = 自播支付金额 / 支付金额，用于观察自播渠道贡献。',
      label: '自播销售占比',
      value: ratioLabel(kpi.selfShare),
      tone: 'cyan',
    },
    {
      description: '达人销售占比 = 达人支付金额 / 支付金额，用于观察达人带货贡献。',
      label: '达人销售占比',
      value: ratioLabel(kpi.talentShare),
      tone: 'purple',
    },
    {
      description: '近 30 天内投放费比达到或超过 25% 的天数。',
      label: '高费比天数',
      value: `${highAdDays} 天`,
      tone: highAdDays > 0 ? 'orange' : 'green',
    },
    {
      description: '近 30 天内退款率达到或超过 20% 的天数。',
      label: '高退款天数',
      value: `${highRefundDays} 天`,
      tone: highRefundDays > 0 ? 'red' : 'green',
    },
    {
      description: '达人商品点击率 = 达人商品点击人数 / 达人商品曝光人数，用于观察达人商品承接效率。',
      label: '达人商品点击率',
      value: ratioLabel(kpi.clickRate),
      tone: 'geekblue',
    },
    {
      description: '当前数据集中最新一条统计日期。',
      label: '最新统计日',
      value: latest ? statDateOf(latest) : '-',
      tone: 'default',
    },
  ];
});

function baseChartOption(title: string): ECOption {
  return {
    title: {
      text: title,
      left: 6,
      top: 4,
      textStyle: { fontSize: 15, fontWeight: 600 },
    },
    tooltip: {
      axisPointer: { type: 'cross' },
      trigger: 'axis',
    },
    grid: { bottom: 58, left: 58, right: 44, top: 54 },
    legend: { bottom: 4, itemHeight: 8, itemWidth: 12 },
    xAxis: {
      axisLabel: { hideOverlap: true, interval: 'auto' },
      boundaryGap: false,
      type: 'category',
    },
    yAxis: {
      axisLabel: { formatter: (value: number) => amountShort(value) },
      splitLine: { lineStyle: { color: '#e5e7eb', type: 'dashed' } },
      type: 'value',
    },
  };
}

function moneyFormatter(value: unknown) {
  return `¥${fmtAmount2(value)}`;
}

function last7TrendOption(): ECOption | null {
  const { buckets, labels } = last7Agg.value;
  if (!labels.length) return null;
  const option = baseChartOption('过去7天趋势图') as any;
  option.xAxis.data = labels;
  option.tooltip.valueFormatter = (value: unknown) => String(value);
  option.yAxis = [
    {
      axisLabel: { formatter: (value: number) => amountShort(value) },
      name: '金额',
      splitLine: { lineStyle: { color: '#e5e7eb', type: 'dashed' } },
      type: 'value',
    },
    {
      axisLabel: { formatter: (value: number) => `${value}` },
      name: '订单',
      type: 'value',
    },
  ];
  option.series = [
    {
      name: '实际销售额',
      type: 'line',
      smooth: true,
      symbolSize: 6,
      data: buckets.map((item) => round2(item.actualSales)),
      itemStyle: { color: '#ff5b24' },
      label: { show: true, position: 'top', formatter: (p: any) => amountShort(p.value), fontSize: 10 },
    },
    {
      name: '成交订单数',
      type: 'line',
      yAxisIndex: 1,
      smooth: true,
      symbolSize: 6,
      data: buckets.map((item) => item.orderCount),
      itemStyle: { color: '#2563eb' },
      label: { show: true, position: 'bottom', fontSize: 10 },
    },
  ];
  return option;
}

function monthlySalesAdOption(): ECOption | null {
  const { buckets, labels } = monthAgg.value;
  if (!labels.length) return null;
  const option = baseChartOption('每月销售数据、推广数据') as any;
  option.xAxis.data = labels;
  option.xAxis.boundaryGap = true;
  option.tooltip.valueFormatter = moneyFormatter;
  option.series = [
    {
      name: '实际销售额',
      type: 'bar',
      data: buckets.map((item) => round2(item.actualSales)),
      itemStyle: { color: '#7c3aed', borderRadius: [5, 5, 0, 0] },
      label: { show: labels.length <= 12, position: 'top', formatter: (p: any) => amountShort(p.value), fontSize: 10 },
    },
    {
      name: '投放消耗',
      type: 'line',
      smooth: true,
      data: buckets.map((item) => round2(item.adCost)),
      itemStyle: { color: '#f59e0b' },
    },
    {
      name: '支出金额',
      type: 'line',
      smooth: true,
      data: buckets.map((item) => round2(item.expense)),
      itemStyle: { color: '#0ea5e9' },
    },
  ];
  return option;
}

function last30SalesExpenseOption(): ECOption | null {
  const { buckets, labels } = last30Agg.value;
  if (!labels.length) return null;
  const option = baseChartOption('近30天实际销售额、推广费用趋势图') as any;
  option.xAxis.data = labels;
  option.tooltip.valueFormatter = moneyFormatter;
  option.series = [
    {
      name: '实际销售额',
      type: 'line',
      smooth: true,
      symbolSize: 5,
      data: buckets.map((item) => round2(item.actualSales)),
      itemStyle: { color: '#6366f1' },
      label: { show: true, position: 'top', formatter: (p: any) => amountShort(p.value), fontSize: 10 },
    },
    {
      name: '投放消耗',
      type: 'line',
      smooth: true,
      symbolSize: 5,
      data: buckets.map((item) => round2(item.adCost)),
      itemStyle: { color: '#38bdf8' },
    },
    {
      name: '支出金额',
      type: 'line',
      smooth: true,
      symbolSize: 5,
      data: buckets.map((item) => round2(item.expense)),
      itemStyle: { color: '#f97316' },
    },
  ];
  return option;
}

function ratioLineOption(
  title: string,
  seriesName: string,
  ratioOf: (bucket: DouyinBucket) => null | number,
): ECOption | null {
  const { buckets, labels } = last30Agg.value;
  if (!labels.length) return null;
  const option = baseChartOption(title) as any;
  option.xAxis.data = labels;
  option.tooltip.valueFormatter = (value: unknown) => fmtPercent2(value);
  option.yAxis.axisLabel = { formatter: (value: number) => `${value}%` };
  option.series = [
    {
      name: seriesName,
      type: 'line',
      smooth: true,
      symbolSize: 5,
      data: buckets.map((item) => ratioOf(item)),
      itemStyle: { color: '#7c3aed' },
      label: { show: true, position: 'top', formatter: (p: any) => ratioLabel(p.value), fontSize: 10 },
    },
  ];
  return option;
}

function channelSplitOption(): ECOption | null {
  const { buckets, labels } = monthAgg.value;
  if (!labels.length) return null;
  const option = baseChartOption('自播 / 达人成交拆分') as any;
  option.xAxis.data = labels;
  option.xAxis.boundaryGap = true;
  option.tooltip.valueFormatter = moneyFormatter;
  option.series = [
    {
      name: '自播用户支付金额',
      type: 'bar',
      stack: 'amount',
      data: buckets.map((item) => round2(item.selfPaid)),
      itemStyle: { color: '#10b981' },
    },
    {
      name: '达人用户支付金额',
      type: 'bar',
      stack: 'amount',
      data: buckets.map((item) => round2(item.talentPaid)),
      itemStyle: { color: '#f43f5e' },
    },
  ];
  return option;
}

function refundRiskOption(): ECOption | null {
  const { buckets, labels } = last30Agg.value;
  if (!labels.length) return null;
  const option = baseChartOption('近30天退款风险趋势') as any;
  option.xAxis.data = labels;
  option.tooltip.valueFormatter = (value: unknown) => String(value);
  option.yAxis = [
    {
      axisLabel: { formatter: (value: number) => amountShort(value) },
      name: '金额',
      splitLine: { lineStyle: { color: '#e5e7eb', type: 'dashed' } },
      type: 'value',
    },
    {
      axisLabel: { formatter: (value: number) => `${value}%` },
      name: '退款率',
      type: 'value',
    },
  ];
  option.series = [
    {
      name: '退款金额(支付时间)',
      type: 'bar',
      data: buckets.map((item) => round2(item.refundPayment)),
      itemStyle: { color: '#ef4444', borderRadius: [5, 5, 0, 0] },
    },
    {
      name: '退款率',
      type: 'line',
      yAxisIndex: 1,
      smooth: true,
      data: buckets.map((item) => ratioPercent(item.refundPayment, item.paidAmount)),
      itemStyle: { color: '#1d4ed8' },
    },
  ];
  return option;
}

function trafficEfficiencyOption(): ECOption | null {
  const { buckets, labels } = last30Agg.value;
  if (!labels.length) return null;
  const option = baseChartOption('近30天达人流量效率') as any;
  option.xAxis.data = labels;
  option.tooltip.valueFormatter = (value: unknown) => String(value);
  option.yAxis = [
    {
      axisLabel: { formatter: (value: number) => amountShort(value) },
      name: '人数',
      splitLine: { lineStyle: { color: '#e5e7eb', type: 'dashed' } },
      type: 'value',
    },
    {
      axisLabel: { formatter: (value: number) => `${value}%` },
      name: '点击率',
      type: 'value',
    },
  ];
  option.series = [
    {
      name: '曝光人数',
      type: 'line',
      smooth: true,
      data: buckets.map((item) => item.exposurePeople),
      itemStyle: { color: '#64748b' },
    },
    {
      name: '点击人数',
      type: 'line',
      smooth: true,
      data: buckets.map((item) => item.clickPeople),
      itemStyle: { color: '#0ea5e9' },
    },
    {
      name: '点击率',
      type: 'line',
      yAxisIndex: 1,
      smooth: true,
      data: buckets.map((item) => ratioPercent(item.clickPeople, item.exposurePeople)),
      itemStyle: { color: '#8b5cf6' },
    },
  ];
  return option;
}

const last7TrendChart = computed(() => last7TrendOption());
const monthlySalesAdChart = computed(() => monthlySalesAdOption());
const last30SalesExpenseChart = computed(() => last30SalesExpenseOption());
const last30AdRatioChart = computed(() =>
  ratioLineOption(
    '近30天推广费比趋势图',
    '投放费比',
    (bucket) => effectiveAdCostRatio(bucket),
  ),
);
const channelSplitChart = computed(() => channelSplitOption());
const refundRiskChart = computed(() => refundRiskOption());
const trafficEfficiencyChart = computed(() => trafficEfficiencyOption());

async function fetchShopNameOptions(keyword = '') {
  const seq = ++shopNameFetchSeq;
  try {
    const list = await getEcShopDailyShopNameOptions({
      keyword: keyword.trim() || undefined,
      limit: 50,
      platformCode: PLATFORM_CODE,
    });
    if (seq !== shopNameFetchSeq) return;
    shopNameOptions.value = list.map((name) => ({
      label: name,
      value: name,
    }));
  } catch (error) {
    if (seq !== shopNameFetchSeq) return;
    console.error('Load douyin dashboard shop name options failed', error);
    shopNameOptions.value = [];
  }
}

function handleShopNameSearch(keyword = '') {
  if (shopNameSearchTimer) clearTimeout(shopNameSearchTimer);
  shopNameSearchTimer = setTimeout(() => {
    void fetchShopNameOptions(keyword);
  }, 250);
}

function handleShopNameClear() {
  dashForm.shopName = '';
  handleShopNameSearch('');
}

function buildQueryPayload(): Record<string, unknown> {
  const params: Record<string, unknown> = {
    platformCode: PLATFORM_CODE,
    statDate: dashForm.statDate,
  };
  if (dashForm.shopName?.trim()) {
    params.shopName = dashForm.shopName.trim();
  }
  return params;
}

async function loadRows() {
  loading.value = true;
  truncated.value = false;
  rawRows.value = [];
  try {
    const base = buildQueryPayload();
    const acc: DetailRow[] = [];
    let pageNo = 1;
    let total = 0;
    while (pageNo <= MAX_PAGES) {
      const res = await getEcShopDailyPlatformDetailPage({
        ...base,
        pageNo,
        pageSize: PAGE_SIZE,
      } as any);
      total = res.total ?? 0;
      totalRemote.value = total;
      const list = res.list ?? [];
      acc.push(...list);
      if (list.length < PAGE_SIZE || acc.length >= total) break;
      pageNo++;
    }
    if (pageNo >= MAX_PAGES && acc.length < total) truncated.value = true;
    rawRows.value = acc;
  } finally {
    loading.value = false;
  }
}

function resetFilters() {
  dashForm.statDate = currentYearRange();
  dashForm.shopName = '';
  handleShopNameSearch('');
  void loadRows();
}

defineExpose({ reload: loadRows });

onBeforeUnmount(() => {
  if (shopNameSearchTimer) clearTimeout(shopNameSearchTimer);
});

void loadRows();
void fetchShopNameOptions();
</script>

<template>
  <Spin :spinning="loading">
    <div class="douyin-dashboard">
      <Card size="small" class="douyin-filter mb-4">
        <div class="mb-3 flex flex-wrap items-center justify-between gap-2">
          <span class="text-sm font-semibold text-foreground">筛选条件</span>
          <span class="text-xs text-muted-foreground">{{ filterSummary }}</span>
        </div>
        <Form layout="vertical">
          <Row :gutter="[16, 12]">
            <Col :xs="24" :md="8" :xl="6">
              <FormItem label="统计日期" class="mb-0">
                <FdmDateRangePicker v-model:value="dashForm.statDate" />
              </FormItem>
            </Col>
            <Col :xs="24" :md="10" :xl="7">
              <FormItem label="店铺名称" class="mb-0">
                <AutoComplete
                  v-model:value="dashForm.shopName"
                  allow-clear
                  :filter-option="false"
                  :options="shopNameOptions"
                  placeholder="输入关键词或选择店铺"
                  @clear="handleShopNameClear"
                  @focus="handleShopNameSearch('')"
                  @search="handleShopNameSearch"
                />
              </FormItem>
            </Col>
            <Col :xs="24" :md="6" :xl="11">
              <FormItem label=" " class="mb-0 douyin-filter-actions">
                <Space wrap class="w-full justify-end">
                  <Button type="primary" @click="loadRows">查询</Button>
                  <Button @click="resetFilters">重置</Button>
                </Space>
              </FormItem>
            </Col>
          </Row>
        </Form>
      </Card>

      <div
        v-if="truncated"
        class="mb-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800"
      >
        已截断：服务端共 {{ totalRemote }} 条，当前仅拉取前
        {{ PAGE_SIZE * MAX_PAGES }} 条参与统计。
      </div>

      <div class="mb-2 flex flex-wrap items-baseline justify-between gap-2">
        <span class="text-sm font-semibold text-foreground">抖音核心指标</span>
        <span class="text-xs text-muted-foreground">{{ dataSummary }}</span>
      </div>

      <div class="douyin-kpi-grid mb-4">
        <Card class="douyin-kpi douyin-kpi--sales" size="small">
          <div class="douyin-kpi-title">{{ yearLabel }}销售额</div>
          <Tooltip
            :title="
              metricTitle(
                '销售额按抖音明细表实际销售额口径汇总，用于观察真实经营收入规模。',
                fullMoney(rangeKpi.actualSales),
              )
            "
          >
            <div class="douyin-kpi-value">
              {{ kpiMoney(rangeKpi.actualSales) }}
            </div>
          </Tooltip>
        </Card>
        <Card class="douyin-kpi douyin-kpi--expense" size="small">
          <div class="douyin-kpi-title">{{ yearLabel }}支出费用</div>
          <Tooltip
            :title="
              metricTitle(
                '支出费用包含投放消耗、平台佣金、达人佣金等费用合计。',
                fullMoney(rangeKpi.expense),
              )
            "
          >
            <div class="douyin-kpi-value">
              {{ kpiMoney(rangeKpi.expense) }}
            </div>
          </Tooltip>
        </Card>
        <Card class="douyin-kpi douyin-kpi--transaction" size="small">
          <div class="douyin-kpi-title">成交金额</div>
          <Tooltip
            :title="
              metricTitle(
                '成交金额为抖音成交口径金额，未必等同于扣除退款后的实际销售额。',
                fullMoney(rangeKpi.transactionAmount),
              )
            "
          >
            <div class="douyin-kpi-value">
              {{ kpiMoney(rangeKpi.transactionAmount) }}
            </div>
          </Tooltip>
        </Card>
        <Card class="douyin-kpi douyin-kpi--refund" size="small">
          <div class="douyin-kpi-title">退款金额</div>
          <Tooltip
            :title="
              metricTitle(
                '退款金额按抖音退款口径汇总，用于观察退款对支付成交的影响。',
                fullMoney(rangeKpi.refundPayment),
              )
            "
          >
            <div class="douyin-kpi-value">
              {{ kpiMoney(rangeKpi.refundPayment) }}
            </div>
          </Tooltip>
        </Card>
        <Card class="douyin-kpi douyin-kpi--orders" size="small">
          <div class="douyin-kpi-title">{{ yearLabel }}实际订单量</div>
          <Tooltip
            :title="
              metricTitle(
                '实际订单量为当前筛选范围内成交订单数量汇总。',
                fullNumber(rangeKpi.orderCount),
              )
            "
          >
            <div class="douyin-kpi-value">
              {{ kpiNumber(rangeKpi.orderCount) }}
            </div>
          </Tooltip>
        </Card>
      </div>

      <Card size="small" class="mb-4 douyin-diagnosis">
        <div class="diagnosis-grid">
          <div
            v-for="item in diagnosticItems"
            :key="item.label"
            class="diagnosis-item"
          >
            <span class="diagnosis-label">{{ item.label }}</span>
            <Tooltip :title="metricTitle(item.description, item.value)">
              <Tag :color="item.tone" class="diagnosis-value">
                {{ item.value }}
              </Tag>
            </Tooltip>
          </div>
        </div>
      </Card>

      <Row :gutter="[16, 16]" class="mb-4">
        <Col :xs="24" :xl="12">
          <Card class="douyin-chart-card h-full" size="small">
            <EchartsBox :option="last7TrendChart" :height="318" />
          </Card>
        </Col>
        <Col :xs="24" :xl="12">
          <Card class="douyin-chart-card h-full" size="small">
            <EchartsBox :option="monthlySalesAdChart" :height="318" />
          </Card>
        </Col>
        <Col :xs="24">
          <Card class="douyin-chart-card" size="small">
            <EchartsBox :option="last30SalesExpenseChart" :height="330" />
          </Card>
        </Col>
        <Col :xs="24">
          <Card class="douyin-chart-card" size="small">
            <EchartsBox :option="last30AdRatioChart" :height="300" />
          </Card>
        </Col>
        <Col :xs="24" :xl="12">
          <Card class="douyin-chart-card h-full" size="small">
            <EchartsBox :option="channelSplitChart" :height="318" />
          </Card>
        </Col>
        <Col :xs="24" :xl="12">
          <Card class="douyin-chart-card h-full" size="small">
            <EchartsBox :option="refundRiskChart" :height="318" />
          </Card>
        </Col>
        <Col :xs="24">
          <Card class="douyin-chart-card" size="small">
            <EchartsBox :option="trafficEfficiencyChart" :height="310" />
          </Card>
        </Col>
      </Row>
    </div>
  </Spin>
</template>

<style scoped>
.douyin-filter :deep(.ant-card-body) {
  padding: 16px;
  background: linear-gradient(135deg, rgb(255 255 255) 0%, rgb(248 250 252) 100%);
}

.douyin-filter :deep(.ant-form-item-label > label) {
  color: hsl(var(--muted-foreground));
  font-size: 13px;
}

.douyin-filter-actions :deep(.ant-form-item-label) {
  visibility: hidden;
}

.douyin-kpi-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(210px, 1fr));
  gap: 16px;
}

.douyin-kpi {
  overflow: hidden;
  min-height: 148px;
  border: 0;
  border-radius: 8px;
  box-shadow: 0 8px 24px rgb(15 23 42 / 7%);
}

.douyin-kpi :deep(.ant-card-body) {
  min-height: 148px;
  padding: 18px;
}

.douyin-kpi-title {
  color: #111827;
  font-size: 14px;
  font-weight: 700;
}

.douyin-kpi-value {
  overflow: hidden;
  margin-top: 28px;
  font-size: clamp(30px, 3vw, 48px);
  font-weight: 850;
  letter-spacing: 0;
  line-height: 1.05;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.douyin-kpi--sales .douyin-kpi-value {
  color: #c2410c;
}

.douyin-kpi--expense .douyin-kpi-value {
  color: #0b6fdc;
}

.douyin-kpi--transaction .douyin-kpi-value {
  color: #db2777;
}

.douyin-kpi--refund .douyin-kpi-value {
  color: #1e3a8a;
}

.douyin-kpi--orders .douyin-kpi-value {
  color: #fb7185;
}

.douyin-diagnosis,
.douyin-chart-card {
  border: 0;
  border-radius: 8px;
  box-shadow: 0 8px 22px rgb(15 23 42 / 5%);
}

.diagnosis-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
  gap: 10px 14px;
}

.diagnosis-item {
  display: flex;
  min-width: 0;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 8px 10px;
  border: 1px solid hsl(var(--border));
  border-radius: 6px;
  background: hsl(var(--background));
}

.diagnosis-label {
  overflow: hidden;
  color: hsl(var(--muted-foreground));
  font-size: 13px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.diagnosis-value {
  flex-shrink: 0;
  margin-inline-end: 0;
  font-weight: 600;
}

.douyin-chart-card :deep(.ant-card-body) {
  padding: 10px;
}

.douyin-chart-card :deep(.echarts) {
  border: 0;
}

@media (max-width: 768px) {
  .douyin-filter-actions :deep(.ant-form-item-label) {
    display: none;
  }
}
</style>
