<script lang="ts" setup>
import type { ECOption } from '@vben/plugins/echarts';

import type { FdmDateRange } from '#/components/fdm-date-range-picker';
import type { FdmdataEcShopDailyApi } from '#/api/fdmdata/ecshopdaily';

import dayjs from 'dayjs';
import { computed, onBeforeUnmount, onMounted, reactive, ref } from 'vue';

import { Page } from '@vben/common-ui';
import { downloadFileFromBlobPart } from '@vben/utils';

import {
  Button,
  Col,
  Drawer,
  Form,
  FormItem,
  Row,
  Segmented,
  Select,
  Spin,
  Switch,
  Table,
  Tag,
  Tooltip,
} from 'ant-design-vue';

import {
  exportEcShopDailySummary,
  getEcShopDailyShopNameOptions,
  getEcShopDailySummary,
} from '#/api/fdmdata/ecshopdaily';
import { FdmDateRangePicker } from '#/components/fdm-date-range-picker';

import EchartsBox from '../modules/echarts-box.vue';

defineOptions({ name: 'EcShopDailySummary' });

type Summary = FdmdataEcShopDailyApi.EcShopDailySummary;
type SummaryMetric = FdmdataEcShopDailyApi.EcShopDailySummaryMetric;
type SummaryPeriod = FdmdataEcShopDailyApi.EcShopDailySummaryPeriod;
type SummaryRow = FdmdataEcShopDailyApi.EcShopDailySummaryRow;
type SummaryShop = FdmdataEcShopDailyApi.EcShopDailySummaryShop;

interface SummaryGroup {
  channelType?: string;
  key: string;
  label: string;
  platformCode?: string;
}

const PERIOD_OPTIONS = [
  { label: '日', value: 'DAY' },
  { label: '周', value: 'WEEK' },
  { label: '月', value: 'MONTH' },
];

const CHANNEL_OPTIONS = [
  { label: '全部渠道', value: 'ALL' },
  { label: '电商', value: 'EC' },
  { label: '新媒体', value: 'MEDIA' },
];

const PLATFORM_OPTIONS = [
  { label: '全部平台', value: '' },
  { label: '淘宝', value: 'TAOBAO' },
  { label: '拼多多', value: 'PDD' },
  { label: '京东', value: 'JD' },
  { label: '抖音', value: 'DOUYIN' },
  { label: '小红书', value: 'XHS' },
  { label: '视频号', value: 'SPH' },
];

const VIEW_MODE_OPTIONS = [
  { label: '综合', value: 'SUMMARY' },
  { label: '销售额', value: 'SALES' },
  { label: '营销费', value: 'MARKETING' },
  { label: '费比', value: 'COST_RATIO' },
  { label: '退款', value: 'REFUND' },
  { label: '订单', value: 'ORDER' },
];

const METRIC_DESCRIPTIONS: Record<string, string> = {
  avgOrderValue: '客单价 = 实际销售额 / 真实订单数，用于观察订单质量。',
  brushRatio: '刷单占比 = 刷单金额 / 实际销售额，用于识别刷单对经营口径的影响。',
  costRatio: '费比 = 营销费用 / 实际销售额，越高说明获客成本压力越大。',
  refundRatio: '退款率 = 退款金额 / 支付金额，用于观察退款风险。',
  roi: '投产比 = 实际销售额 / 营销费用，越高说明投放效率越好。',
  salesAmount: '实际销售额使用主表真实净销售额，已剔除刷单金额影响。',
};

const filters = reactive({
  channelType: 'ALL',
  hideEmptyPeriod: true,
  periodType: 'MONTH',
  platformCode: '',
  shopNames: [] as string[],
  statDate: [
    dayjs().startOf('year').format('YYYY-MM-DD'),
    dayjs().format('YYYY-MM-DD'),
  ] as FdmDateRange,
});

const loading = ref(false);
const exporting = ref(false);
const summary = ref<Summary>({
  periods: [],
  rows: [],
  shops: [],
});
const viewMode = ref('SUMMARY');
const showAllShops = ref(false);
const shopNameOptions = ref<{ label: string; value: string }[]>([]);
const dailyDrawerOpen = ref(false);
const dailyLoading = ref(false);
const dailyRows = ref<SummaryRow[]>([]);
const dailyDrawerTitle = ref('');
let shopSearchTimer: ReturnType<typeof setTimeout> | undefined;

function n(value: unknown): number {
  const num = Number(value ?? 0);
  return Number.isFinite(num) ? num : 0;
}

function round2(value: unknown): number {
  return Math.round(n(value) * 100) / 100;
}

function divPercent(numerator: number, denominator: number): null | number {
  if (denominator <= 0) return null;
  return round2((numerator / denominator) * 100);
}

function amountText(value: unknown): string {
  const num = round2(value);
  const abs = Math.abs(num);
  if (abs >= 100_000_000) return `${round2(num / 100_000_000)}亿`;
  if (abs >= 10_000) return `${round2(num / 10_000)}万`;
  return num.toLocaleString('zh-CN', { maximumFractionDigits: 2 });
}

function moneyTextOrDash(value: unknown): string {
  if (value === null || value === undefined || value === '') return '-';
  return `¥${amountText(value)}`;
}

function fullAmountText(value: unknown): string {
  return round2(value).toLocaleString('zh-CN', {
    maximumFractionDigits: 2,
    minimumFractionDigits: 2,
  });
}

function intText(value: unknown): string {
  return Math.trunc(n(value)).toLocaleString('zh-CN');
}

function percentText(value: unknown): string {
  if (value === null || value === undefined || value === '') return '-';
  return `${round2(value)}%`;
}

function ratioText(value: unknown): string {
  if (value === null || value === undefined || value === '') return '-';
  return round2(value).toLocaleString('zh-CN', { maximumFractionDigits: 2 });
}

function normalizeDateValue(value: unknown): string | undefined {
  if (value === null || value === undefined || value === '') return undefined;
  if (Array.isArray(value) && value.length >= 3) {
    const [year, month, day] = value;
    const parsed = dayjs(
      `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`,
    );
    return parsed.isValid() ? parsed.format('YYYY-MM-DD') : undefined;
  }
  const parsed = dayjs(String(value).slice(0, 10));
  return parsed.isValid() ? parsed.format('YYYY-MM-DD') : undefined;
}

function normalizeDateRangeValue(value: unknown): FdmDateRange {
  const raw = Array.isArray(value) ? value : [];
  const start = normalizeDateValue(raw[0]);
  const end = normalizeDateValue(raw[1]);
  return [
    start ?? dayjs().startOf('year').format('YYYY-MM-DD'),
    end ?? dayjs().format('YYYY-MM-DD'),
  ];
}

function buildParams() {
  const statDate = normalizeDateRangeValue(filters.statDate);
  return {
    channelType: filters.channelType,
    hideEmptyPeriod: filters.hideEmptyPeriod,
    periodType: filters.periodType,
    platformCode: filters.platformCode || undefined,
    shopNames: filters.shopNames.join(',') || undefined,
    statDate,
  };
}

async function loadSummary() {
  loading.value = true;
  try {
    summary.value = await getEcShopDailySummary(buildParams());
    if (summary.value.startDate && summary.value.endDate) {
      filters.statDate = normalizeDateRangeValue([
        summary.value.startDate,
        summary.value.endDate,
      ]);
    }
  } finally {
    loading.value = false;
  }
}

async function handleExport() {
  exporting.value = true;
  try {
    const data = await exportEcShopDailySummary(buildParams());
    downloadFileFromBlobPart({
      fileName: '店铺经营汇总分析.xls',
      source: data,
    });
  } finally {
    exporting.value = false;
  }
}

function handleReset() {
  filters.channelType = 'ALL';
  filters.periodType = 'MONTH';
  filters.platformCode = '';
  filters.shopNames = [];
  filters.hideEmptyPeriod = true;
  filters.statDate = [
    dayjs().startOf('year').format('YYYY-MM-DD'),
    dayjs().format('YYYY-MM-DD'),
  ];
  showAllShops.value = false;
  void loadSummary();
}

async function fetchShopNameOptions(keyword = '') {
  try {
    const list = await getEcShopDailyShopNameOptions({
      keyword: keyword.trim() || undefined,
      limit: 100,
      platformCode: filters.platformCode,
    });
    shopNameOptions.value = list.map((item) => ({ label: item, value: item }));
  } catch (error) {
    console.error('Load summary shop options failed', error);
    shopNameOptions.value = [];
  }
}

function handleShopSearch(keyword = '') {
  if (shopSearchTimer) clearTimeout(shopSearchTimer);
  shopSearchTimer = setTimeout(() => {
    void fetchShopNameOptions(keyword);
  }, 250);
}

const periods = computed(() => summary.value.periods ?? []);
const rows = computed(() => summary.value.rows ?? []);
const shops = computed(() => summary.value.shops ?? []);
const totals = computed(() => summary.value.totals ?? {});

const visibleShops = computed(() => {
  if (showAllShops.value || filters.shopNames.length > 0) return shops.value;
  return shops.value.slice(0, 12);
});

const rowsByPeriod = computed(() => {
  const map = new Map<string, SummaryRow[]>();
  for (const row of rows.value) {
    const list = map.get(row.periodKey) ?? [];
    list.push(row);
    map.set(row.periodKey, list);
  }
  return map;
});

const rowsByPeriodShop = computed(() => {
  const map = new Map<string, SummaryRow>();
  for (const row of rows.value) {
    map.set(`${row.periodKey}|${row.shopKey}`, row);
  }
  return map;
});

const summaryGroups = computed<SummaryGroup[]>(() => {
  const platforms = PLATFORM_OPTIONS.filter((item) => item.value).map((item) => ({
    key: `PLATFORM:${item.value}`,
    label: item.label,
    platformCode: item.value || undefined,
  }));
  return [
    { key: 'TOTAL', label: '总计' },
    { channelType: 'EC', key: 'CHANNEL:EC', label: '电商合计' },
    { channelType: 'MEDIA', key: 'CHANNEL:MEDIA', label: '新媒体合计' },
    ...platforms,
  ];
});

function aggregateMetrics(list: SummaryRow[]): SummaryMetric {
  const metric: SummaryMetric = {
    brushAmount: 0,
    brushOrderCount: 0,
    buyerCount: 0,
    gmvAmount: 0,
    marketingCost: 0,
    paidAmount: 0,
    paidOrderCount: 0,
    realOrderCount: 0,
    refundAmount: 0,
    refundOrderCount: 0,
    salesAmount: 0,
  };
  for (const item of list) {
    metric.salesAmount = round2(n(metric.salesAmount) + n(item.salesAmount));
    metric.marketingCost = round2(
      n(metric.marketingCost) + n(item.marketingCost),
    );
    metric.paidAmount = round2(n(metric.paidAmount) + n(item.paidAmount));
    metric.refundAmount = round2(n(metric.refundAmount) + n(item.refundAmount));
    metric.brushAmount = round2(n(metric.brushAmount) + n(item.brushAmount));
    metric.gmvAmount = round2(n(metric.gmvAmount) + n(item.gmvAmount));
    metric.realOrderCount = n(metric.realOrderCount) + n(item.realOrderCount);
    metric.paidOrderCount = n(metric.paidOrderCount) + n(item.paidOrderCount);
    metric.refundOrderCount =
      n(metric.refundOrderCount) + n(item.refundOrderCount);
    metric.brushOrderCount =
      n(metric.brushOrderCount) + n(item.brushOrderCount);
    metric.buyerCount = n(metric.buyerCount) + n(item.buyerCount);
  }
  metric.costRatio = divPercent(n(metric.marketingCost), n(metric.salesAmount)) ?? undefined;
  metric.refundRatio = divPercent(n(metric.refundAmount), n(metric.paidAmount)) ?? undefined;
  metric.brushRatio = divPercent(n(metric.brushAmount), n(metric.salesAmount)) ?? undefined;
  metric.avgOrderValue =
    n(metric.realOrderCount) > 0
      ? round2(n(metric.salesAmount) / n(metric.realOrderCount))
      : undefined;
  metric.roi =
    n(metric.marketingCost) > 0
      ? round2(n(metric.salesAmount) / n(metric.marketingCost))
      : undefined;
  return metric;
}

function periodMetric(periodKey: string, group?: SummaryGroup): SummaryMetric {
  let list = rowsByPeriod.value.get(periodKey) ?? [];
  if (group?.channelType) {
    list = list.filter((item) => item.channelType === group.channelType);
  }
  if (group?.platformCode) {
    list = list.filter((item) => item.platformCode === group.platformCode);
  }
  return aggregateMetrics(list);
}

function shopPeriodMetric(periodKey: string, shop: SummaryShop): SummaryRow | undefined {
  return rowsByPeriodShop.value.get(`${periodKey}|${shop.shopKey}`);
}

function metricValue(metric: SummaryMetric | undefined): string {
  if (!metric) return '-';
  switch (viewMode.value) {
    case 'COST_RATIO': {
      return percentText(metric.costRatio);
    }
    case 'MARKETING': {
      return amountText(metric.marketingCost);
    }
    case 'ORDER': {
      return intText(metric.realOrderCount);
    }
    case 'REFUND': {
      return amountText(metric.refundAmount);
    }
    case 'SALES': {
      return amountText(metric.salesAmount);
    }
    default: {
      return amountText(metric.salesAmount);
    }
  }
}

function cellClass(metric: SummaryMetric | undefined) {
  if (!metric) return 'is-empty';
  if (n(metric.salesAmount) <= 0 && n(metric.marketingCost) > 0) {
    return 'is-danger';
  }
  if (n(metric.costRatio) >= 30 || n(metric.refundRatio) >= 30) {
    return 'is-danger';
  }
  if (n(metric.costRatio) >= 20 || n(metric.refundRatio) >= 15) {
    return 'is-warning';
  }
  return '';
}

const kpiCards = computed(() => [
  {
    className: 'kpi-sales',
    desc: METRIC_DESCRIPTIONS.salesAmount,
    label: '总实际销售额',
    sub: `覆盖 ${shops.value.length} 个店铺`,
    value: `¥${amountText(totals.value.salesAmount)}`,
  },
  {
    className: 'kpi-cost',
    desc: '营销费用为各店铺推广投放费用汇总，是费比和 ROI 的基础。',
    label: '总营销费用',
    sub: `综合费比 ${percentText(totals.value.costRatio)}`,
    value: `¥${amountText(totals.value.marketingCost)}`,
  },
  {
    className: 'kpi-refund',
    desc: METRIC_DESCRIPTIONS.refundRatio,
    label: '退款金额 / 退款率',
    sub: `退款率 ${percentText(totals.value.refundRatio)}`,
    value: `¥${amountText(totals.value.refundAmount)}`,
  },
  {
    className: 'kpi-order',
    desc: METRIC_DESCRIPTIONS.avgOrderValue,
    label: '真实订单 / 客单价',
    sub: `客单价 ¥${amountText(totals.value.avgOrderValue)}`,
    value: intText(totals.value.realOrderCount),
  },
]);

const insightItems = computed(() => {
  const topShop = shops.value[0];
  const highCostCount = rows.value.filter((row) => n(row.costRatio) >= 30).length;
  const highRefundCount = rows.value.filter((row) => n(row.refundRatio) >= 30).length;
  const zeroSalesCostCount = rows.value.filter(
    (row) => n(row.salesAmount) <= 0 && n(row.marketingCost) > 0,
  ).length;
  return [
    {
      color: 'blue',
      desc: METRIC_DESCRIPTIONS.roi,
      label: '综合投产比',
      value: ratioText(totals.value.roi),
    },
    {
      color: 'green',
      desc: '销售额最高的店铺，用于快速定位主要贡献来源。',
      label: 'TOP 店铺',
      value: topShop ? `${topShop.shopName} ${amountText(topShop.salesAmount)}` : '-',
    },
    {
      color: highCostCount > 0 ? 'red' : 'green',
      desc: '费比达到 30% 及以上的周期店铺数，需要优先复盘投放效率。',
      label: '高费比预警',
      value: `${highCostCount} 个`,
    },
    {
      color: highRefundCount > 0 ? 'orange' : 'green',
      desc: '退款率达到 30% 及以上的周期店铺数，需要结合平台和商品排查。',
      label: '高退款预警',
      value: `${highRefundCount} 个`,
    },
    {
      color: zeroSalesCostCount > 0 ? 'red' : 'green',
      desc: '无销售额但产生营销费用的记录，通常需要检查投放或数据归集。',
      label: '零销售有费用',
      value: `${zeroSalesCostCount} 个`,
    },
  ];
});

const trendChart = computed<ECOption | null>(() => {
  if (periods.value.length === 0) return null;
  const labels = periods.value.map((item) => item.periodLabel);
  const metrics = periods.value.map((item) => periodMetric(item.periodKey));
  return {
    color: ['#2563eb', '#16a34a', '#f97316'],
    grid: { bottom: 42, left: 58, right: 56, top: 42 },
    legend: { top: 4 },
    tooltip: { trigger: 'axis' },
    xAxis: { axisLabel: { rotate: labels.length > 10 ? 35 : 0 }, data: labels, type: 'category' },
    yAxis: [
      { name: '金额', type: 'value' },
      { name: '费比', type: 'value' },
    ],
    series: [
      {
        data: metrics.map((item) => round2(item.salesAmount)),
        name: '实际销售额',
        type: 'bar',
      },
      {
        data: metrics.map((item) => round2(item.marketingCost)),
        name: '营销费用',
        type: 'bar',
      },
      {
        data: metrics.map((item) => round2(item.costRatio)),
        name: '总费比',
        smooth: true,
        type: 'line',
        yAxisIndex: 1,
      },
    ],
  };
});

const channelChart = computed<ECOption | null>(() => {
  if (periods.value.length === 0) return null;
  const labels = periods.value.map((item) => item.periodLabel);
  return {
    color: ['#2563eb', '#ec4899', '#f97316'],
    grid: { bottom: 42, left: 58, right: 26, top: 42 },
    legend: { top: 4 },
    tooltip: { trigger: 'axis' },
    xAxis: { axisLabel: { rotate: labels.length > 10 ? 35 : 0 }, data: labels, type: 'category' },
    yAxis: { name: '销售额', type: 'value' },
    series: [
      {
        data: periods.value.map((item) =>
          round2(periodMetric(item.periodKey, { channelType: 'EC' }).salesAmount),
        ),
        name: '电商销售额',
        type: 'bar',
      },
      {
        data: periods.value.map((item) =>
          round2(periodMetric(item.periodKey, { channelType: 'MEDIA' }).salesAmount),
        ),
        name: '新媒体销售额',
        type: 'bar',
      },
    ],
  };
});

const topShopChart = computed<ECOption | null>(() => {
  const top = shops.value.slice(0, 10).toReversed();
  if (top.length === 0) return null;
  return {
    color: ['#2563eb', '#16a34a'],
    grid: { bottom: 24, left: 150, right: 30, top: 24 },
    tooltip: { trigger: 'axis' },
    xAxis: { type: 'value' },
    yAxis: {
      axisLabel: { width: 132, overflow: 'truncate' },
      data: top.map((item) => item.shopName),
      type: 'category',
    },
    series: [
      {
        data: top.map((item) => round2(item.salesAmount)),
        name: '实际销售额',
        type: 'bar',
      },
    ],
  };
});

const ratioChart = computed<ECOption | null>(() => {
  if (periods.value.length === 0) return null;
  const labels = periods.value.map((item) => item.periodLabel);
  const metrics = periods.value.map((item) => periodMetric(item.periodKey));
  return {
    color: ['#7c3aed', '#ef4444'],
    grid: { bottom: 42, left: 44, right: 28, top: 36 },
    legend: { top: 4 },
    tooltip: { trigger: 'axis' },
    xAxis: { axisLabel: { rotate: labels.length > 10 ? 35 : 0 }, data: labels, type: 'category' },
    yAxis: { name: '%', type: 'value' },
    series: [
      {
        data: metrics.map((item) => round2(item.costRatio)),
        name: '总费比',
        smooth: true,
        type: 'line',
      },
      {
        data: metrics.map((item) => round2(item.refundRatio)),
        name: '退款率',
        smooth: true,
        type: 'line',
      },
    ],
  };
});

const riskRows = computed(() => [
  ...(summary.value.rankings?.highCostRatio ?? []).slice(0, 5).map((item) => ({
    metric: percentText(item.costRatio),
    reason: '费比偏高',
    row: item,
  })),
  ...(summary.value.rankings?.highRefundRatio ?? []).slice(0, 5).map((item) => ({
    metric: percentText(item.refundRatio),
    reason: '退款率偏高',
    row: item,
  })),
  ...(summary.value.rankings?.zeroSalesWithCost ?? []).slice(0, 5).map((item) => ({
    metric: `¥${amountText(item.marketingCost)}`,
    reason: '零销售有费用',
    row: item,
  })),
]);

const dailyColumns = [
  { dataIndex: 'periodLabel', title: '日期', width: 110 },
  {
    dataIndex: 'salesAmount',
    title: '实际销售额',
    customRender: ({ text }: { text: number }) => `¥${fullAmountText(text)}`,
  },
  {
    dataIndex: 'marketingCost',
    title: '营销费用',
    customRender: ({ text }: { text: number }) => `¥${fullAmountText(text)}`,
  },
  {
    dataIndex: 'costRatio',
    title: '费比',
    customRender: ({ text }: { text: number }) => percentText(text),
  },
  {
    dataIndex: 'refundAmount',
    title: '退款金额',
    customRender: ({ text }: { text: number }) => `¥${fullAmountText(text)}`,
  },
  {
    dataIndex: 'realOrderCount',
    title: '真实订单',
    customRender: ({ text }: { text: number }) => intText(text),
  },
];

async function openDailyDrawer(period: SummaryPeriod, shop: SummaryShop) {
  const row = shopPeriodMetric(period.periodKey, shop);
  if (!row) return;
  dailyDrawerOpen.value = true;
  dailyDrawerTitle.value = `${period.periodLabel} · ${shop.shopName}`;
  dailyLoading.value = true;
  dailyRows.value = [];
  try {
    const res = await getEcShopDailySummary({
      channelType: 'ALL',
      hideEmptyPeriod: true,
      periodType: 'DAY',
      platformCode: shop.platformCode,
      shopNames: shop.shopName,
      statDate: normalizeDateRangeValue([period.startDate, period.endDate]),
    });
    dailyRows.value = res.rows ?? [];
  } finally {
    dailyLoading.value = false;
  }
}

onMounted(() => {
  void fetchShopNameOptions();
  void loadSummary();
});

onBeforeUnmount(() => {
  if (shopSearchTimer) clearTimeout(shopSearchTimer);
});
</script>

<template>
  <Page auto-content-height>
    <Spin :spinning="loading">
      <div class="summary-page">
        <div class="page-heading">
          <div>
            <h2>店铺经营汇总分析</h2>
            <p>按日、周、月查看各店铺销售、投放、退款和订单表现</p>
          </div>
          <div class="page-range">
            {{ summary.startDate || filters.statDate[0] }} ~
            {{ summary.endDate || filters.statDate[1] }}
          </div>
        </div>

        <section class="filter-panel">
          <Form layout="vertical">
            <Row :gutter="[16, 8]">
              <Col :lg="4" :md="8" :xs="24">
                <FormItem label="统计周期">
                  <Segmented
                    v-model:value="filters.periodType"
                    :options="PERIOD_OPTIONS"
                    block
                  />
                </FormItem>
              </Col>
              <Col :lg="5" :md="8" :xs="24">
                <FormItem label="统计日期">
                  <FdmDateRangePicker v-model:value="filters.statDate" />
                </FormItem>
              </Col>
              <Col :lg="4" :md="8" :xs="24">
                <FormItem label="渠道">
                  <Select
                    v-model:value="filters.channelType"
                    :options="CHANNEL_OPTIONS"
                  />
                </FormItem>
              </Col>
              <Col :lg="4" :md="8" :xs="24">
                <FormItem label="平台">
                  <Select
                    v-model:value="filters.platformCode"
                    allow-clear
                    :options="PLATFORM_OPTIONS"
                    @change="fetchShopNameOptions('')"
                  />
                </FormItem>
              </Col>
              <Col :lg="5" :md="12" :xs="24">
                <FormItem label="店铺名称">
                  <Select
                    v-model:value="filters.shopNames"
                    mode="multiple"
                    show-search
                    allow-clear
                    :filter-option="false"
                    :max-tag-count="1"
                    :options="shopNameOptions"
                    placeholder="输入关键词或选择店铺"
                    @search="handleShopSearch"
                  />
                </FormItem>
              </Col>
              <Col :lg="2" :md="4" :xs="24">
                <FormItem label="隐藏空周期">
                  <Switch v-model:checked="filters.hideEmptyPeriod" />
                </FormItem>
              </Col>
              <Col :span="24">
                <div class="filter-actions">
                  <Button type="primary" @click="loadSummary">查询</Button>
                  <Button @click="handleReset">重置</Button>
                  <Button :loading="exporting" @click="handleExport">
                    导出
                  </Button>
                </div>
              </Col>
            </Row>
          </Form>
        </section>

        <section class="kpi-grid">
          <Tooltip
            v-for="item in kpiCards"
            :key="item.label"
            :title="item.desc"
          >
            <div class="kpi-card" :class="item.className">
              <div class="kpi-label">{{ item.label }}</div>
              <div class="kpi-value">{{ item.value }}</div>
              <div class="kpi-sub">{{ item.sub }}</div>
            </div>
          </Tooltip>
        </section>

        <section class="insight-strip">
          <div v-for="item in insightItems" :key="item.label" class="insight">
            <span>{{ item.label }}</span>
            <Tooltip :title="item.desc">
              <Tag :color="item.color">{{ item.value }}</Tag>
            </Tooltip>
          </div>
        </section>

        <Row :gutter="[16, 16]" class="mb-4">
          <Col :xl="14" :xs="24">
            <section class="chart-panel">
              <div class="chart-title">销售额、营销费用与总费比趋势</div>
              <EchartsBox :height="330" :option="trendChart" />
            </section>
          </Col>
          <Col :xl="10" :xs="24">
            <section class="chart-panel">
              <div class="chart-title">电商 / 新媒体销售贡献</div>
              <EchartsBox :height="330" :option="channelChart" />
            </section>
          </Col>
          <Col :xl="12" :xs="24">
            <section class="chart-panel">
              <div class="chart-title">TOP10 店铺销售排行</div>
              <EchartsBox :height="320" :option="topShopChart" />
            </section>
          </Col>
          <Col :xl="12" :xs="24">
            <section class="chart-panel">
              <div class="chart-title">费比与退款率趋势</div>
              <EchartsBox :height="320" :option="ratioChart" />
            </section>
          </Col>
        </Row>

        <section class="risk-panel">
          <div class="section-title">经营风险提醒</div>
          <div v-if="riskRows.length === 0" class="empty-block">
            当前筛选范围内暂无明显风险
          </div>
          <div v-else class="risk-list">
            <div v-for="item in riskRows" :key="`${item.reason}-${item.row.periodKey}-${item.row.shopKey}`" class="risk-item">
              <Tag :color="item.reason === '费比偏高' ? 'red' : 'orange'">
                {{ item.reason }}
              </Tag>
              <span class="risk-main">
                {{ item.row.periodLabel }} · {{ item.row.platformLabel }} ·
                {{ item.row.shopName }}
              </span>
              <strong>{{ item.metric }}</strong>
            </div>
          </div>
        </section>

        <section class="matrix-panel">
          <div class="matrix-head">
            <div>
              <div class="section-title">分析师矩阵</div>
              <div class="section-sub">
                默认展示销售额 TOP12 店铺；点击店铺单元格可查看日明细
              </div>
            </div>
            <div class="matrix-tools">
              <Segmented
                v-model:value="viewMode"
                :options="VIEW_MODE_OPTIONS"
              />
              <Button size="small" @click="showAllShops = !showAllShops">
                {{ showAllShops ? '只看 TOP12' : '显示全部店铺' }}
              </Button>
            </div>
          </div>

          <div class="matrix-scroll">
            <table class="summary-matrix">
              <thead>
                <tr>
                  <th class="sticky-col period-col">周期</th>
                  <th
                    v-for="group in summaryGroups"
                    :key="group.key"
                    class="summary-col"
                  >
                    {{ group.label }}
                  </th>
                  <th
                    v-for="shop in visibleShops"
                    :key="shop.shopKey"
                    class="shop-col"
                    :title="`${shop.platformLabel} · ${shop.shopName}`"
                  >
                    <span>{{ shop.shopName }}</span>
                    <em>{{ shop.platformLabel }}</em>
                  </th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="period in periods" :key="period.periodKey">
                  <th class="sticky-col period-col">
                    <strong>{{ period.periodLabel }}</strong>
                    <span>{{ period.startDate }} ~ {{ period.endDate }}</span>
                  </th>
                  <td
                    v-for="group in summaryGroups"
                    :key="group.key"
                    class="metric-cell summary-cell"
                    :class="cellClass(periodMetric(period.periodKey, group))"
                  >
                    <div v-if="viewMode === 'SUMMARY'" class="metric-lines">
                      <strong>
                        ¥{{ amountText(periodMetric(period.periodKey, group).salesAmount) }}
                      </strong>
                      <span>
                        费 ¥{{ amountText(periodMetric(period.periodKey, group).marketingCost) }}
                      </span>
                      <span>
                        比 {{ percentText(periodMetric(period.periodKey, group).costRatio) }}
                      </span>
                    </div>
                    <span v-else>
                      {{ metricValue(periodMetric(period.periodKey, group)) }}
                    </span>
                  </td>
                  <td
                    v-for="shop in visibleShops"
                    :key="shop.shopKey"
                    class="metric-cell shop-cell"
                    :class="cellClass(shopPeriodMetric(period.periodKey, shop))"
                    @click="openDailyDrawer(period, shop)"
                  >
                    <div
                      v-if="viewMode === 'SUMMARY'"
                      class="metric-lines"
                    >
                      <strong>
                        {{ moneyTextOrDash(shopPeriodMetric(period.periodKey, shop)?.salesAmount) }}
                      </strong>
                      <span>
                        费 {{ moneyTextOrDash(shopPeriodMetric(period.periodKey, shop)?.marketingCost) }}
                      </span>
                      <span>
                        比 {{ percentText(shopPeriodMetric(period.periodKey, shop)?.costRatio) }}
                      </span>
                    </div>
                    <span v-else>
                      {{ metricValue(shopPeriodMetric(period.periodKey, shop)) }}
                    </span>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </Spin>

    <Drawer
      v-model:open="dailyDrawerOpen"
      :title="dailyDrawerTitle"
      width="760"
    >
      <Table
        :columns="dailyColumns"
        :data-source="dailyRows"
        :loading="dailyLoading"
        :pagination="false"
        row-key="periodKey"
        size="small"
      />
    </Drawer>
  </Page>
</template>

<style scoped>
.summary-page {
  min-width: 0;
}

.page-heading {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 12px;
}

.page-heading h2 {
  margin: 0 0 4px;
  font-size: 20px;
  font-weight: 700;
}

.page-heading p,
.section-sub {
  margin: 0;
  color: hsl(var(--muted-foreground));
  font-size: 12px;
}

.page-range {
  color: hsl(var(--muted-foreground));
  font-size: 13px;
  white-space: nowrap;
}

.filter-panel,
.chart-panel,
.insight-strip,
.kpi-card,
.matrix-panel,
.risk-panel {
  border: 1px solid hsl(var(--border));
  border-radius: 8px;
  background: hsl(var(--card));
  box-shadow: 0 6px 18px rgb(15 23 42 / 5%);
}

.filter-panel {
  margin-bottom: 16px;
  padding: 16px;
}

.filter-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}

.kpi-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 16px;
  margin-bottom: 16px;
}

.kpi-card {
  min-width: 0;
  overflow: hidden;
  padding: 18px;
  border-top-width: 3px;
}

.kpi-label {
  margin-bottom: 18px;
  font-size: 14px;
  font-weight: 650;
}

.kpi-value {
  overflow: hidden;
  font-size: 34px;
  font-weight: 780;
  line-height: 1.12;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.kpi-sub {
  margin-top: 12px;
  overflow: hidden;
  color: hsl(var(--muted-foreground));
  font-size: 12px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.kpi-sales {
  border-top-color: #2563eb;
}

.kpi-sales .kpi-value {
  color: #2563eb;
}

.kpi-cost {
  border-top-color: #16a34a;
}

.kpi-cost .kpi-value {
  color: #16a34a;
}

.kpi-refund {
  border-top-color: #ea580c;
}

.kpi-refund .kpi-value {
  color: #ea580c;
}

.kpi-order {
  border-top-color: #7c3aed;
}

.kpi-order .kpi-value {
  color: #7c3aed;
}

.insight-strip {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  margin-bottom: 16px;
  padding: 12px;
}

.insight {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  min-width: 150px;
  padding: 4px 8px;
  border: 1px solid hsl(var(--border) / 70%);
  border-radius: 6px;
  background: hsl(var(--muted) / 20%);
  font-size: 12px;
}

.chart-panel {
  min-width: 0;
  height: 100%;
  padding: 12px;
}

.chart-title,
.section-title {
  font-size: 15px;
  font-weight: 700;
}

.risk-panel,
.matrix-panel {
  margin-bottom: 16px;
  padding: 14px;
}

.risk-list {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
  margin-top: 12px;
}

.risk-item {
  display: flex;
  min-width: 0;
  align-items: center;
  gap: 8px;
  padding: 8px 10px;
  border: 1px solid hsl(var(--border) / 70%);
  border-radius: 6px;
}

.risk-main {
  min-width: 0;
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.empty-block {
  padding: 20px 0 8px;
  color: hsl(var(--muted-foreground));
  text-align: center;
}

.matrix-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 12px;
}

.matrix-tools {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 8px;
}

.matrix-scroll {
  overflow: auto;
  border: 1px solid hsl(var(--border));
  border-radius: 8px;
}

.summary-matrix {
  width: max-content;
  min-width: 100%;
  border-collapse: separate;
  border-spacing: 0;
  font-size: 12px;
}

.summary-matrix th,
.summary-matrix td {
  border-right: 1px solid hsl(var(--border));
  border-bottom: 1px solid hsl(var(--border));
  background: hsl(var(--card));
}

.summary-matrix thead th {
  position: sticky;
  top: 0;
  z-index: 2;
  height: 54px;
  padding: 8px;
  background: hsl(var(--muted) / 35%);
  font-weight: 650;
  white-space: nowrap;
}

.sticky-col {
  position: sticky;
  left: 0;
  z-index: 3;
}

.period-col {
  width: 180px;
  min-width: 180px;
  max-width: 180px;
  padding: 8px 10px;
  text-align: left;
}

.period-col span {
  display: block;
  margin-top: 4px;
  color: hsl(var(--muted-foreground));
  font-size: 11px;
  font-weight: 400;
}

.summary-col,
.shop-col {
  width: 128px;
  min-width: 128px;
  max-width: 128px;
  overflow: hidden;
  text-overflow: ellipsis;
}

.shop-col span {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
}

.shop-col em {
  display: block;
  margin-top: 3px;
  color: hsl(var(--muted-foreground));
  font-style: normal;
  font-weight: 400;
}

.metric-cell {
  height: 64px;
  padding: 8px;
  cursor: default;
  vertical-align: middle;
  white-space: nowrap;
}

.shop-cell {
  cursor: pointer;
}

.shop-cell:hover {
  background: rgb(37 99 235 / 8%);
}

.metric-lines {
  display: grid;
  gap: 2px;
  line-height: 1.25;
}

.metric-lines strong {
  color: #2563eb;
  font-size: 13px;
}

.metric-lines span {
  color: hsl(var(--muted-foreground));
}

.metric-cell.is-warning {
  background: rgb(245 158 11 / 12%);
}

.metric-cell.is-danger {
  background: rgb(239 68 68 / 12%);
}

.metric-cell.is-empty {
  color: hsl(var(--muted-foreground));
}

@media (max-width: 1280px) {
  .kpi-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .risk-list {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 768px) {
  .page-heading,
  .matrix-head {
    display: block;
  }

  .filter-actions {
    justify-content: flex-start;
  }

  .kpi-grid {
    grid-template-columns: 1fr;
  }
}
</style>
