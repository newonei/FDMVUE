<script lang="ts" setup>
import type { ECOption } from '@vben/plugins/echarts';

import type { EcShopDailyRow } from '../dashboard-utils';
import type { EcShopDailyOption } from '../data';
import type { FdmDateRange } from '#/components/fdm-date-range-picker';

import dayjs from 'dayjs';
import { computed, onBeforeUnmount, reactive, ref, watch } from 'vue';

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
  Statistic,
  Tag,
  Tooltip,
} from 'ant-design-vue';

import {
  getEcShopDailyPage,
  getEcShopDailyShopNameOptions,
} from '#/api/fdmdata/ecshopdaily';
import { FdmDateRangePicker } from '#/components/fdm-date-range-picker';

import { formatEcPlatformLabel } from '../data';
import {
  fmtAmount2,
  fmtPercent2,
  mergeRowsByStatDate,
  normalizeStatDateKey,
  realNetSalesAmountOf,
  round2,
  sliceLastDays,
  sortedDailyFromMap,
} from '../dashboard-utils';
import EchartsBox from './echarts-box.vue';

defineOptions({ name: 'EcShopDailyTaobaoDashboard' });

const PAGE_SIZE = 200;
const MAX_PAGES = 40;
const DEFAULT_PLATFORM_CODE = 'TAOBAO';

const props = withDefaults(
  defineProps<{
    platformCode?: string;
    platformLabel?: string;
  }>(),
  {
    platformCode: 'TAOBAO',
    platformLabel: '',
  },
);

const currentPlatformCode = computed(() => {
  const code = String(props.platformCode ?? DEFAULT_PLATFORM_CODE)
    .trim()
    .toUpperCase();
  return code || DEFAULT_PLATFORM_CODE;
});
const currentPlatformLabel = computed(
  () =>
    props.platformLabel?.trim() ||
    formatEcPlatformLabel(currentPlatformCode.value) ||
    currentPlatformCode.value,
);

interface PeriodBucket {
  brush: number;
  marketing: number;
  netSales: number;
  paidAmount: number;
  realOrders: number;
  refund: number;
}

function currentYearRange(): FdmDateRange {
  return [
    dayjs().startOf('year').format('YYYY-MM-DD'),
    dayjs().endOf('year').format('YYYY-MM-DD'),
  ];
}

function asNumber(value: unknown): number {
  if (value === null || value === undefined || value === '') return 0;
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function realOrderCountOf(row: Partial<EcShopDailyRow>): number {
  if (row.realPaidOrderCount !== null && row.realPaidOrderCount !== undefined) {
    return Math.max(0, Math.trunc(asNumber(row.realPaidOrderCount)));
  }
  return Math.max(
    0,
    Math.trunc(asNumber(row.paidOrderCount) - asNumber(row.brushOrderCount)),
  );
}

function ratioPercent(numerator: number, denominator: number): null | number {
  if (denominator <= 0) return null;
  return round2((numerator / denominator) * 100);
}

function roiValue(netSales: number, marketing: number): null | number {
  if (marketing <= 0) return null;
  return round2(netSales / marketing);
}

function amountShort(value: unknown): string {
  const n = round2(value);
  const abs = Math.abs(n);
  if (abs >= 100_000_000) return `${round2(n / 100_000_000)}亿`;
  if (abs >= 10_000) return `${round2(n / 10_000)}万`;
  return n.toLocaleString('zh-CN', { maximumFractionDigits: 0 });
}

function ratioLabel(value: null | number | undefined): string {
  if (value === null || value === undefined) return '-';
  return `${round2(value).toFixed(2)}%`;
}

function metricTitle(description: string, value: string): string {
  return `${description} 当前值：${value}`;
}

function newBucket(): PeriodBucket {
  return {
    brush: 0,
    marketing: 0,
    netSales: 0,
    paidAmount: 0,
    realOrders: 0,
    refund: 0,
  };
}

function addRow(bucket: PeriodBucket, row: EcShopDailyRow) {
  bucket.netSales = round2(bucket.netSales + realNetSalesAmountOf(row));
  bucket.marketing = round2(bucket.marketing + asNumber(row.marketingCost));
  bucket.refund = round2(bucket.refund + asNumber(row.refundAmount));
  bucket.paidAmount = round2(bucket.paidAmount + asNumber(row.paidAmount));
  bucket.brush = round2(bucket.brush + asNumber(row.brushPrincipal));
  bucket.realOrders += realOrderCountOf(row);
}

function aggregateByKey(
  rows: EcShopDailyRow[],
  keyOf: (dateKey: string) => string,
  maxCount?: number,
) {
  const map = new Map<string, PeriodBucket>();
  for (const row of rows) {
    const dateKey = normalizeStatDateKey(row.statDate);
    if (!dateKey) continue;
    const key = keyOf(dateKey);
    const bucket = map.get(key) ?? newBucket();
    addRow(bucket, row);
    map.set(key, bucket);
  }

  const labels = [...map.keys()].toSorted();
  const slicedLabels = maxCount ? labels.slice(-maxCount) : labels;
  const buckets = slicedLabels.map((label) => map.get(label)!);
  return { buckets, labels: slicedLabels };
}

const loading = ref(false);
const truncated = ref(false);
const totalRemote = ref(0);
const rawRows = ref<EcShopDailyRow[]>([]);
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

const mergedSorted = computed(() =>
  sortedDailyFromMap(mergeRowsByStatDate(rawRows.value)),
);
const last7Rows = computed(() => sliceLastDays(mergedSorted.value, 7));
const last30Rows = computed(() => sliceLastDays(mergedSorted.value, 30));

const rangeKpi = computed(() => {
  const bucket = newBucket();
  for (const row of mergedSorted.value) addRow(bucket, row);
  const promoRatio = ratioPercent(bucket.marketing, bucket.netSales);
  const refundRatio = ratioPercent(bucket.refund, bucket.paidAmount);
  const roi = roiValue(bucket.netSales, bucket.marketing);
  const realAov =
    bucket.realOrders > 0 ? round2(bucket.netSales / bucket.realOrders) : 0;
  return { ...bucket, promoRatio, realAov, refundRatio, roi };
});

const monthAgg = computed(() =>
  aggregateByKey(mergedSorted.value, (dateKey) => dateKey.slice(0, 7)),
);
const weekAgg = computed(() =>
  aggregateByKey(
    mergedSorted.value,
    (dateKey) => dayjs(dateKey).startOf('isoWeek').format('YYYY-MM-DD'),
    10,
  ),
);
const last30Agg = computed(() =>
  aggregateByKey(last30Rows.value, (dateKey) => dateKey),
);
const last7Agg = computed(() =>
  aggregateByKey(last7Rows.value, (dateKey) => dateKey),
);

const filterSummary = computed(() => {
  const shop = dashForm.shopName?.trim() || '全部店铺';
  return `${dashForm.statDate[0]} ~ ${dashForm.statDate[1]} · ${currentPlatformLabel.value} · ${shop}`;
});

const dataSummary = computed(() => {
  const days = mergedSorted.value.length;
  if (!days && !loading.value) return '暂无数据，请调整筛选条件';
  return `合并后 ${days} 个统计日 · 原始记录 ${rawRows.value.length} 条`;
});

const diagnosticItems = computed(() => {
  const kpi = rangeKpi.value;
  const latest = mergedSorted.value.at(-1);
  const peak = last30Rows.value.reduce<EcShopDailyRow | undefined>(
    (max, row) =>
      !max || realNetSalesAmountOf(row) > realNetSalesAmountOf(max) ? row : max,
    undefined,
  );
  const riskyDays = last30Rows.value.filter((row) => {
    const promoRatio = ratioPercent(
      asNumber(row.marketingCost),
      realNetSalesAmountOf(row),
    );
    return promoRatio !== null && promoRatio >= 30;
  }).length;
  return [
    {
      description: '投产比 = 实际销售额 / 营销推广费，用于衡量投放产出效率。',
      label: '投产比',
      value: kpi.roi === null ? '-' : `${kpi.roi.toFixed(2)}`,
      tone: kpi.roi !== null && kpi.roi >= 4 ? 'green' : 'gold',
    },
    {
      description: '推广占比 = 营销推广费 / 实际销售额，用于观察推广成本占销售额比例。',
      label: '推广占比',
      value: ratioLabel(kpi.promoRatio),
      tone: kpi.promoRatio !== null && kpi.promoRatio <= 25 ? 'green' : 'orange',
    },
    {
      description: '退款占比 = 退款金额 / 支付金额，用于观察退款对成交金额的影响。',
      label: '退款占比',
      value: ratioLabel(kpi.refundRatio),
      tone: kpi.refundRatio !== null && kpi.refundRatio <= 20 ? 'green' : 'red',
    },
    {
      description: '真实客单价 = 实际销售额 / 真实订单数，用于衡量单笔真实订单价值。',
      label: '真实客单价',
      value: `¥${fmtAmount2(kpi.realAov)}`,
      tone: 'blue',
    },
    {
      description: '当前筛选范围近 30 天内实际销售额最高的日期。',
      label: '近30天销售高点',
      value: peak
        ? `${normalizeStatDateKey(peak.statDate)} · ¥${amountShort(
            realNetSalesAmountOf(peak),
          )}`
        : '-',
      tone: 'blue',
    },
    {
      description: '近 30 天内推广占比达到或超过 30% 的天数，用于提示投放成本风险。',
      label: '高费比天数',
      value: `${riskyDays} 天`,
      tone: riskyDays > 0 ? 'orange' : 'green',
    },
    {
      description: '当前数据集中最新一条统计日期。',
      label: '最新统计日',
      value: latest ? normalizeStatDateKey(latest.statDate) : '-',
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
    grid: { bottom: 56, left: 58, right: 24, top: 52 },
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

function moneyTrendOption(
  title: string,
  labels: string[],
  buckets: PeriodBucket[],
  extra?: { paid?: boolean; type?: 'bar' | 'line' },
): ECOption | null {
  if (!labels.length) return null;
  const chartType = extra?.type ?? 'line';
  const marketingName = extra?.paid ? '营销费用总额' : '营销费用';
  const option = baseChartOption(title) as any;
  option.xAxis.data = labels;
  option.xAxis.boundaryGap = chartType === 'bar';
  option.tooltip.valueFormatter = (value: unknown) => `¥${fmtAmount2(value)}`;
  option.series = [
    {
      name: '实际销售额',
      type: chartType,
      smooth: chartType === 'line',
      symbolSize: 5,
      data: buckets.map((item) => round2(item.netSales)),
      itemStyle: { color: '#2563eb' },
      label: {
        show: labels.length <= 12,
        position: 'top',
        formatter: (params: any) => amountShort(params.value),
        fontSize: 10,
      },
    },
    {
      name: marketingName,
      type: chartType,
      smooth: chartType === 'line',
      symbolSize: 5,
      data: buckets.map((item) => round2(item.marketing)),
      itemStyle: { color: '#22c55e' },
      label: {
        show: labels.length <= 12,
        position: 'top',
        formatter: (params: any) => amountShort(params.value),
        fontSize: 10,
      },
    },
  ];
  if (extra?.paid) {
    option.series.push({
      name: '支付金额',
      type: 'line',
      smooth: true,
      symbolSize: 5,
      data: buckets.map((item: PeriodBucket) => round2(item.paidAmount)),
      itemStyle: { color: '#f97316' },
      label: {
        show: labels.length <= 8,
        position: 'top',
        formatter: (params: any) => amountShort(params.value),
        fontSize: 10,
      },
    });
  }
  return option;
}

function ratioTrendOption(
  title: string,
  labels: string[],
  buckets: PeriodBucket[],
  ratioOf: (bucket: PeriodBucket) => null | number,
  seriesName = '费比',
): ECOption | null {
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
      connectNulls: false,
      symbolSize: 5,
      data: buckets.map((item) => ratioOf(item)),
      itemStyle: { color: '#2563eb' },
      label: {
        show: labels.length <= 12,
        position: 'top',
        formatter: (params: any) => ratioLabel(params.value),
        fontSize: 10,
      },
    },
  ];
  return option;
}

function amountStructureOption(): ECOption | null {
  if (!mergedSorted.value.length) return null;
  const kpi = rangeKpi.value;
  return {
    title: {
      text: '金额结构',
      left: 6,
      top: 4,
      textStyle: { fontSize: 15, fontWeight: 600 },
    },
    tooltip: {
      trigger: 'axis',
      valueFormatter: (value: unknown) => `¥${fmtAmount2(value)}`,
    },
    grid: { bottom: 32, left: 58, right: 20, top: 52 },
    xAxis: {
      data: ['支付金额', '实际销售额', '退款金额', '营销费用', '刷单本金'],
      type: 'category',
    },
    yAxis: {
      axisLabel: { formatter: (value: number) => amountShort(value) },
      splitLine: { lineStyle: { color: '#e5e7eb', type: 'dashed' } },
      type: 'value',
    },
    series: [
      {
        type: 'bar',
        data: [
          kpi.paidAmount,
          kpi.netSales,
          kpi.refund,
          kpi.marketing,
          kpi.brush,
        ],
        itemStyle: {
          color: (params: any) =>
            ['#f97316', '#2563eb', '#ea580c', '#22c55e', '#64748b'][
              params.dataIndex
            ],
          borderRadius: [5, 5, 0, 0],
        },
        label: {
          show: true,
          position: 'top',
          formatter: (params: any) => amountShort(params.value),
          fontSize: 10,
        },
      },
    ],
  };
}

const monthTrendChart = computed(() =>
  moneyTrendOption(
    '月度数据走势图',
    monthAgg.value.labels,
    monthAgg.value.buckets,
    { type: 'bar' },
  ),
);
const monthRatioChart = computed(() =>
  ratioTrendOption(
    '月度费比',
    monthAgg.value.labels,
    monthAgg.value.buckets,
    (bucket) => ratioPercent(bucket.marketing, bucket.netSales),
    '月度费比',
  ),
);
const weekTrendChart = computed(() =>
  moneyTrendOption(
    '过去十周数据走势图',
    weekAgg.value.labels,
    weekAgg.value.buckets,
  ),
);
const weekRatioChart = computed(() =>
  ratioTrendOption(
    '周费比走势图',
    weekAgg.value.labels,
    weekAgg.value.buckets,
    (bucket) => ratioPercent(bucket.marketing, bucket.netSales),
    '周费比',
  ),
);
const last30TrendChart = computed(() =>
  moneyTrendOption(
    '近30天数据走势图',
    last30Agg.value.labels,
    last30Agg.value.buckets,
  ),
);
const last30PromoRatioChart = computed(() =>
  ratioTrendOption(
    '近30天推广占比走势图',
    last30Agg.value.labels,
    last30Agg.value.buckets,
    (bucket) => ratioPercent(bucket.marketing, bucket.netSales),
    '推广占比',
  ),
);
const last7TrendChart = computed(() =>
  moneyTrendOption(
    '过去7天数据走势图',
    last7Agg.value.labels,
    last7Agg.value.buckets,
    { paid: true },
  ),
);
const amountStructureChart = computed(() => amountStructureOption());

async function fetchShopNameOptions(keyword = '') {
  const seq = ++shopNameFetchSeq;
  try {
    const list = await getEcShopDailyShopNameOptions({
      keyword: keyword.trim() || undefined,
      limit: 50,
      platformCode: currentPlatformCode.value,
    });
    if (seq !== shopNameFetchSeq) return;
    shopNameOptions.value = list.map((name) => ({
      label: name,
      value: name,
    }));
  } catch (error) {
    if (seq !== shopNameFetchSeq) return;
    console.error(
      `Load ${currentPlatformCode.value} dashboard shop name options failed`,
      error,
    );
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
    platformCode: currentPlatformCode.value,
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
    const acc: EcShopDailyRow[] = [];
    let pageNo = 1;
    let total = 0;
    while (pageNo <= MAX_PAGES) {
      const res = await getEcShopDailyPage({
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

watch(currentPlatformCode, () => {
  dashForm.shopName = '';
  void fetchShopNameOptions();
  void loadRows();
});

void loadRows();
void fetchShopNameOptions();
</script>

<template>
  <Spin :spinning="loading">
    <Card size="small" class="taobao-filter mb-4">
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
            <FormItem label=" " class="mb-0 taobao-filter-actions">
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
      <span class="text-sm font-semibold text-foreground">核心指标</span>
      <span class="text-xs text-muted-foreground">{{ dataSummary }}</span>
    </div>

    <Row :gutter="[16, 16]" class="mb-4">
      <Col :xs="24" :sm="12" :xl="6">
        <Card class="taobao-kpi taobao-kpi--sales h-full" size="small">
          <Tooltip
            :title="
              metricTitle(
                '实际销售额按真实净销售口径统计，已剔除退款和刷单金额影响。',
                `¥${fmtAmount2(rangeKpi.netSales)}`,
              )
            "
          >
            <Statistic
              title="实际销售额"
              :precision="2"
              :value="rangeKpi.netSales"
              prefix="¥"
            />
          </Tooltip>
        </Card>
      </Col>
      <Col :xs="24" :sm="12" :xl="6">
        <Card class="taobao-kpi taobao-kpi--marketing h-full" size="small">
          <Tooltip
            :title="
              metricTitle(
                '营销推广费为当前筛选范围内店铺推广投放费用合计。',
                `¥${fmtAmount2(rangeKpi.marketing)}`,
              )
            "
          >
            <Statistic
              title="营销推广费"
              :precision="2"
              :value="rangeKpi.marketing"
              prefix="¥"
            />
          </Tooltip>
        </Card>
      </Col>
      <Col :xs="24" :sm="12" :xl="6">
        <Card class="taobao-kpi taobao-kpi--refund h-full" size="small">
          <Tooltip
            :title="
              metricTitle(
                '退款金额为当前筛选范围内已归集的退款金额合计。',
                `¥${fmtAmount2(rangeKpi.refund)}`,
              )
            "
          >
            <Statistic
              title="退款金额"
              :precision="2"
              :value="rangeKpi.refund"
              prefix="¥"
            />
          </Tooltip>
        </Card>
      </Col>
      <Col :xs="24" :sm="12" :xl="6">
        <Card class="taobao-kpi taobao-kpi--orders h-full" size="small">
          <Tooltip
            :title="
              metricTitle(
                '真实订单 = 支付订单数 - 刷单订单数，用于观察真实成交规模。',
                amountShort(rangeKpi.realOrders),
              )
            "
          >
            <Statistic
              title="真实订单"
              :precision="0"
              :value="rangeKpi.realOrders"
            />
          </Tooltip>
        </Card>
      </Col>
    </Row>

    <Card size="small" class="mb-4 taobao-diagnosis">
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
        <Card class="taobao-chart-card h-full" size="small">
          <EchartsBox :option="monthTrendChart" :height="318" />
        </Card>
      </Col>
      <Col :xs="24" :xl="12">
        <Card class="taobao-chart-card h-full" size="small">
          <EchartsBox :option="monthRatioChart" :height="318" />
        </Card>
      </Col>
      <Col :xs="24" :xl="16">
        <Card class="taobao-chart-card h-full" size="small">
          <EchartsBox :option="weekTrendChart" :height="318" />
        </Card>
      </Col>
      <Col :xs="24" :xl="8">
        <Card class="taobao-chart-card h-full" size="small">
          <EchartsBox :option="weekRatioChart" :height="318" />
        </Card>
      </Col>
      <Col :xs="24">
        <Card class="taobao-chart-card" size="small">
          <EchartsBox :option="last30TrendChart" :height="330" />
        </Card>
      </Col>
      <Col :xs="24">
        <Card class="taobao-chart-card" size="small">
          <EchartsBox :option="last30PromoRatioChart" :height="300" />
        </Card>
      </Col>
      <Col :xs="24" :xl="16">
        <Card class="taobao-chart-card h-full" size="small">
          <EchartsBox :option="last7TrendChart" :height="310" />
        </Card>
      </Col>
      <Col :xs="24" :xl="8">
        <Card class="taobao-chart-card h-full" size="small">
          <EchartsBox :option="amountStructureChart" :height="310" />
        </Card>
      </Col>
    </Row>
  </Spin>
</template>

<style scoped>
.taobao-filter :deep(.ant-card-body) {
  padding: 16px;
  background: hsl(var(--muted) / 25%);
}

.taobao-filter :deep(.ant-form-item-label > label) {
  color: hsl(var(--muted-foreground));
  font-size: 13px;
}

.taobao-filter-actions :deep(.ant-form-item-label) {
  visibility: hidden;
}

.taobao-kpi {
  overflow: hidden;
  border: 0;
  border-radius: 8px;
  box-shadow: 0 8px 22px rgb(15 23 42 / 6%);
}

.taobao-kpi :deep(.ant-card-body) {
  min-height: 132px;
  padding: 18px 18px 16px;
}

.taobao-kpi :deep(.ant-statistic-title) {
  color: #111827;
  font-size: 14px;
  font-weight: 600;
}

.taobao-kpi :deep(.ant-statistic-content) {
  margin-top: 22px;
  font-size: clamp(30px, 3.1vw, 48px);
  font-weight: 800;
  letter-spacing: 0;
  line-height: 1.05;
}

.taobao-kpi--sales :deep(.ant-statistic-content) {
  color: #10b981;
}

.taobao-kpi--marketing :deep(.ant-statistic-content) {
  color: #eab308;
}

.taobao-kpi--refund :deep(.ant-statistic-content) {
  color: #c2410c;
}

.taobao-kpi--orders :deep(.ant-statistic-content) {
  color: #07559f;
}

.taobao-diagnosis {
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

.taobao-chart-card {
  border: 0;
  border-radius: 8px;
  box-shadow: 0 8px 22px rgb(15 23 42 / 5%);
}

.taobao-chart-card :deep(.ant-card-body) {
  padding: 10px;
}

.taobao-chart-card :deep(.echarts) {
  border: 0;
}

@media (max-width: 768px) {
  .taobao-filter-actions :deep(.ant-form-item-label) {
    display: none;
  }
}
</style>
