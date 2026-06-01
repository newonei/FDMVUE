<script lang="ts" setup>
import type { ECOption } from '@vben/plugins/echarts';

import type { EcShopDailyRow } from '../dashboard-utils';
import type { EcShopDailyOption } from '../data';

import type { FdmDateRange } from '#/components/fdm-date-range-picker';

import { computed, onBeforeUnmount, reactive, ref, watch } from 'vue';

import {
  AutoComplete,
  Button,
  Col,
  Form,
  FormItem,
  Row,
  Select,
  Space,
  Spin,
  Tag,
  Tooltip,
} from 'ant-design-vue';
import dayjs from 'dayjs';
import isoWeek from 'dayjs/plugin/isoWeek';

import {
  getEcShopDailyPage,
  getEcShopDailyShopNameOptions,
} from '#/api/fdmdata/ecshopdaily';
import { FdmDateRangePicker } from '#/components/fdm-date-range-picker';

import {
  fmtAmount2,
  fmtPercent2,
  normalizeStatDateKey,
  realNetSalesAmountOf,
  round2,
} from '../dashboard-utils';
import { EC_PLATFORM_SUGGESTIONS, formatEcPlatformLabel } from '../data';
import EchartsBox from './echarts-box.vue';

defineOptions({ name: 'EcShopDailyDashboard' });

const props = defineProps<{
  platformCode?: string;
}>();

dayjs.extend(isoWeek);

const PAGE_SIZE = 200;
const MAX_PAGES = 80;

interface Bucket {
  brushAmount: number;
  brushOrders: number;
  buyers: number;
  gmv: number;
  marketing: number;
  amountBase: number;
  paid: number;
  paidOrders: number;
  realOrders: number;
  refund: number;
  refundOrders: number;
  sales: number;
  shopKeys: Set<string>;
}

interface AggregateResult {
  buckets: Bucket[];
  labels: string[];
}

interface PlatformBucket extends Bucket {
  platformCode: string;
}

function currentYearToTodayRange(): FdmDateRange {
  return [
    dayjs().startOf('year').format('YYYY-MM-DD'),
    dayjs().format('YYYY-MM-DD'),
  ];
}

function asNumber(value: unknown): number {
  if (value === null || value === undefined || value === '') return 0;
  const n = Number(String(value).replaceAll(',', '').replace('%', '').trim());
  return Number.isFinite(n) ? n : 0;
}

function asInt(value: unknown): number {
  return Math.trunc(asNumber(value));
}

function realOrderCountOf(row: Partial<EcShopDailyRow>): number {
  if (row.realPaidOrderCount !== null && row.realPaidOrderCount !== undefined) {
    return Math.max(0, asInt(row.realPaidOrderCount));
  }
  return Math.max(0, asInt(row.paidOrderCount) - asInt(row.brushOrderCount));
}

function platformCodeOf(row: Partial<EcShopDailyRow>): string {
  return (
    String(row.platformCode ?? '')
      .trim()
      .toUpperCase() || 'UNKNOWN'
  );
}

function isTaobaoPlatform(platformCode: string): boolean {
  return platformCode === 'TAOBAO' || platformCode === 'TMALL';
}

function shopKeyOf(row: Partial<EcShopDailyRow>): string {
  const platform = platformCodeOf(row);
  const shopId = String(row.shopId ?? '').trim();
  const shopName = String(row.shopName ?? '').trim();
  return `${platform}|${shopId || shopName}`;
}

function newBucket(): Bucket {
  return {
    brushAmount: 0,
    brushOrders: 0,
    buyers: 0,
    gmv: 0,
    marketing: 0,
    amountBase: 0,
    paid: 0,
    paidOrders: 0,
    realOrders: 0,
    refund: 0,
    refundOrders: 0,
    sales: 0,
    shopKeys: new Set<string>(),
  };
}

function addRow(bucket: Bucket, row: EcShopDailyRow) {
  bucket.sales = round2(bucket.sales + realNetSalesAmountOf(row));
  bucket.marketing = round2(bucket.marketing + asNumber(row.marketingCost));
  bucket.refund = round2(bucket.refund + asNumber(row.refundAmount));
  bucket.paid = round2(bucket.paid + asNumber(row.paidAmount));
  bucket.gmv = round2(bucket.gmv + asNumber(row.gmvAmount));
  bucket.amountBase = round2(
    bucket.amountBase +
      (isTaobaoPlatform(platformCodeOf(row))
        ? asNumber(row.gmvAmount)
        : asNumber(row.paidAmount)),
  );
  bucket.brushAmount = round2(
    bucket.brushAmount + asNumber(row.brushPrincipal),
  );
  bucket.paidOrders += asInt(row.paidOrderCount);
  bucket.realOrders += realOrderCountOf(row);
  bucket.brushOrders += asInt(row.brushOrderCount);
  bucket.refundOrders += asInt(row.refundOrderCount);
  bucket.buyers += asInt(row.buyerCount);
  bucket.shopKeys.add(shopKeyOf(row));
}

function bucketRows(rows: EcShopDailyRow[]): Bucket {
  const bucket = newBucket();
  for (const row of rows) addRow(bucket, row);
  return bucket;
}

function aggregateByKey(
  rows: EcShopDailyRow[],
  keyOf: (dateKey: string, row: EcShopDailyRow) => string,
  maxCount?: number,
): AggregateResult {
  const map = new Map<string, Bucket>();
  for (const row of rows) {
    const dateKey = normalizeStatDateKey(row.statDate);
    if (!dateKey) continue;
    const key = keyOf(dateKey, row);
    const bucket = map.get(key) ?? newBucket();
    addRow(bucket, row);
    map.set(key, bucket);
  }
  const labels = [...map.keys()].toSorted();
  const slicedLabels = maxCount ? labels.slice(-maxCount) : labels;
  return {
    buckets: slicedLabels.map((label) => map.get(label)!),
    labels: slicedLabels,
  };
}

function ratioPercent(numerator: number, denominator: number): null | number {
  if (denominator <= 0) return null;
  return round2((numerator / denominator) * 100);
}

function ratioText(value: null | number | undefined): string {
  if (value === null || value === undefined) return '-';
  return fmtPercent2(value);
}

function amountShort(value: unknown): string {
  const n = round2(value);
  const abs = Math.abs(n);
  if (abs >= 100_000_000) return `${round2(n / 100_000_000)}亿`;
  if (abs >= 10_000) return `${round2(n / 10_000)}万`;
  return n.toLocaleString('zh-CN', { maximumFractionDigits: 0 });
}

function numberShort(value: unknown): string {
  const n = asNumber(value);
  const abs = Math.abs(n);
  if (abs >= 100_000_000) return `${round2(n / 100_000_000)}亿`;
  if (abs >= 10_000) return `${round2(n / 10_000)}万`;
  return n.toLocaleString('zh-CN', { maximumFractionDigits: 0 });
}

function moneyText(value: unknown): string {
  return `¥${amountShort(value)}`;
}

function channelOf(platformCode: string): 'ec' | 'media' {
  return ['DOUYIN', 'SPH', 'XHS'].includes(platformCode) ? 'media' : 'ec';
}

function platformLabel(platformCode: string): string {
  if (platformCode === 'UNKNOWN') return '未识别平台';
  return formatEcPlatformLabel(platformCode) || platformCode;
}

function metricTone(value: null | number, goodMax: number, warnMax: number) {
  if (value === null) return 'default';
  if (value <= goodMax) return 'success';
  if (value <= warnMax) return 'warning';
  return 'error';
}

function metricTitle(description: string, value: string): string {
  return `${description} 当前值：${value}`;
}

function chartGrid(dense = false) {
  return {
    bottom: dense ? 70 : 54,
    left: 58,
    right: 36,
    top: 58,
  };
}

function moneyAxisLabel(v: number): string {
  return amountShort(v);
}

function monthOverviewOption(agg: AggregateResult): ECOption {
  const sales = agg.buckets.map((b) => round2(b.sales));
  const marketing = agg.buckets.map((b) => round2(b.marketing));
  const ratio = agg.buckets.map((b) => ratioPercent(b.marketing, b.sales));
  return {
    color: ['#2563eb', '#22c55e', '#f97316'],
    grid: chartGrid(),
    legend: { top: 12, data: ['实际销售额', '营销费用', '营销费比'] },
    tooltip: {
      trigger: 'axis',
      valueFormatter: (value: unknown) =>
        typeof value === 'number' ? fmtAmount2(value) : String(value ?? ''),
    },
    xAxis: { type: 'category', data: agg.labels },
    yAxis: [
      {
        name: '金额',
        type: 'value',
        axisLabel: { formatter: moneyAxisLabel },
        splitLine: { lineStyle: { type: 'dashed' } },
      },
      {
        name: '费比',
        type: 'value',
        axisLabel: { formatter: (v: number) => `${round2(v)}%` },
        splitLine: { show: false },
      },
    ],
    series: [
      {
        name: '实际销售额',
        type: 'bar',
        barMaxWidth: 42,
        data: sales,
        label: {
          show: true,
          position: 'top',
          formatter: (p: any) => amountShort(p.value),
          fontSize: 10,
        },
      },
      {
        name: '营销费用',
        type: 'bar',
        barMaxWidth: 42,
        data: marketing,
        label: {
          show: true,
          position: 'top',
          formatter: (p: any) => amountShort(p.value),
          fontSize: 10,
        },
      },
      {
        name: '营销费比',
        type: 'line',
        yAxisIndex: 1,
        smooth: true,
        data: ratio,
        label: {
          show: true,
          formatter: (p: any) =>
            p.value === null || p.value === undefined
              ? ''
              : fmtPercent2(p.value),
          fontSize: 10,
        },
      },
    ],
  };
}

function dualMoneyLineOption(
  labels: string[],
  firstName: string,
  first: number[],
  secondName: string,
  second: number[],
  colors: [string, string] = ['#2563eb', '#06b6d4'],
): ECOption {
  return {
    color: colors,
    grid: chartGrid(true),
    legend: { top: 12, data: [firstName, secondName] },
    tooltip: {
      trigger: 'axis',
      valueFormatter: (value: unknown) => fmtAmount2(value),
    },
    xAxis: {
      type: 'category',
      boundaryGap: false,
      data: labels,
      axisLabel: { fontSize: 10, hideOverlap: true, rotate: 35 },
    },
    yAxis: {
      type: 'value',
      axisLabel: { formatter: moneyAxisLabel },
      splitLine: { lineStyle: { type: 'dashed' } },
    },
    series: [
      {
        name: firstName,
        type: 'line',
        smooth: true,
        symbolSize: 5,
        data: first,
        label: {
          show: true,
          formatter: (p: any) => amountShort(p.value),
          fontSize: 10,
        },
      },
      {
        name: secondName,
        type: 'line',
        smooth: true,
        symbolSize: 5,
        data: second,
        label: {
          show: true,
          formatter: (p: any) => amountShort(p.value),
          fontSize: 10,
        },
      },
    ],
  };
}

function ratioLineOption(
  labels: string[],
  series: { color: string; data: (null | number)[]; name: string }[],
): ECOption {
  return {
    color: series.map((item) => item.color),
    grid: chartGrid(true),
    legend: { top: 12, data: series.map((item) => item.name) },
    tooltip: {
      trigger: 'axis',
      valueFormatter: (value: unknown) => fmtPercent2(value),
    },
    xAxis: {
      type: 'category',
      boundaryGap: false,
      data: labels,
      axisLabel: { fontSize: 10, hideOverlap: true, rotate: 35 },
    },
    yAxis: {
      type: 'value',
      axisLabel: { formatter: (v: number) => `${round2(v)}%` },
      splitLine: { lineStyle: { type: 'dashed' } },
    },
    series: series.map((item) => ({
      connectNulls: false,
      data: item.data,
      label: {
        show: true,
        formatter: (p: any) =>
          p.value === null || p.value === undefined ? '' : fmtPercent2(p.value),
        fontSize: 10,
      },
      name: item.name,
      smooth: true,
      symbolSize: 5,
      type: 'line',
    })),
  };
}

function platformContributionOption(rows: PlatformBucket[]): ECOption {
  const labels = rows.map((row) => platformLabel(row.platformCode));
  return {
    color: ['#2563eb', '#22c55e', '#f97316'],
    grid: { bottom: 34, left: 80, right: 28, top: 42 },
    legend: { top: 8, data: ['实际销售额', '营销费用', '营销费比'] },
    tooltip: {
      trigger: 'axis',
      valueFormatter: (value: unknown) => fmtAmount2(value),
    },
    xAxis: {
      type: 'value',
      axisLabel: { formatter: moneyAxisLabel },
      splitLine: { lineStyle: { type: 'dashed' } },
    },
    yAxis: { type: 'category', data: labels },
    series: [
      {
        name: '实际销售额',
        type: 'bar',
        data: rows.map((row) => round2(row.sales)),
        label: {
          show: true,
          position: 'right',
          formatter: (p: any) => amountShort(p.value),
          fontSize: 10,
        },
      },
      {
        name: '营销费用',
        type: 'bar',
        data: rows.map((row) => round2(row.marketing)),
        label: {
          show: true,
          position: 'right',
          formatter: (p: any) => amountShort(p.value),
          fontSize: 10,
        },
      },
    ],
  };
}

function topShopOption(
  shops: { label: string; platformCode: string; sales: number }[],
): ECOption {
  return {
    color: ['#8b5cf6'],
    grid: { bottom: 34, left: 132, right: 34, top: 24 },
    tooltip: {
      trigger: 'axis',
      formatter: (params: any) => {
        const item = Array.isArray(params) ? params[0] : params;
        const row = shops[item.dataIndex];
        return `${row.label}<br/>平台：${platformLabel(row.platformCode)}<br/>实际销售额：¥${fmtAmount2(row.sales)}`;
      },
    },
    xAxis: {
      type: 'value',
      axisLabel: { formatter: moneyAxisLabel },
      splitLine: { lineStyle: { type: 'dashed' } },
    },
    yAxis: {
      type: 'category',
      data: shops.map((shop) => shop.label),
      axisLabel: {
        formatter: (value: string) =>
          value.length > 10 ? `${value.slice(0, 10)}...` : value,
      },
    },
    series: [
      {
        name: '实际销售额',
        type: 'bar',
        data: shops.map((shop) => round2(shop.sales)),
        label: {
          show: true,
          position: 'right',
          formatter: (p: any) => amountShort(p.value),
          fontSize: 10,
        },
      },
    ],
  };
}

const fixedPlatformCode = computed(() => {
  const code = String(props.platformCode ?? '').trim();
  return code ? code.toUpperCase() : undefined;
});
const isFixedPlatform = computed(() => !!fixedPlatformCode.value);
const platformOptions = EC_PLATFORM_SUGGESTIONS.map((item) => ({
  label: item.label,
  value: item.value,
}));

const loading = ref(false);
const truncated = ref(false);
const totalRemote = ref(0);
const rawRows = ref<EcShopDailyRow[]>([]);
const shopNameOptions = ref<EcShopDailyOption[]>([]);
let shopNameFetchSeq = 0;
let shopNameSearchTimer: ReturnType<typeof setTimeout> | undefined;

const dashForm = reactive<{
  platformCode: string | undefined;
  shopName: string;
  statDate: FdmDateRange;
}>({
  platformCode: fixedPlatformCode.value,
  shopName: '',
  statDate: currentYearToTodayRange(),
});

const sortedRows = computed(() =>
  [...rawRows.value].toSorted((a, b) =>
    normalizeStatDateKey(a.statDate).localeCompare(
      normalizeStatDateKey(b.statDate),
    ),
  ),
);

const dateAgg = computed(() =>
  aggregateByKey(sortedRows.value, (dateKey) => dateKey),
);
const last30Agg = computed(() => {
  const keys = dateAgg.value.labels.slice(-30);
  const keySet = new Set(keys);
  return aggregateByKey(
    sortedRows.value.filter((row) =>
      keySet.has(normalizeStatDateKey(row.statDate)),
    ),
    (dateKey) => dateKey,
  );
});
const monthAgg = computed(() =>
  aggregateByKey(sortedRows.value, (dateKey) => dateKey.slice(0, 7)),
);
const weekAgg = computed(() =>
  aggregateByKey(
    sortedRows.value,
    (dateKey) => dayjs(dateKey).startOf('isoWeek').format('YYYY-MM-DD'),
    12,
  ),
);

const kpi = computed(() => {
  const bucket = bucketRows(sortedRows.value);
  const feeRatio = ratioPercent(bucket.marketing, bucket.sales);
  const refundRatio = ratioPercent(bucket.refund, bucket.amountBase);
  const brushRatio = ratioPercent(bucket.brushAmount, bucket.amountBase);
  const aov =
    bucket.realOrders > 0 ? round2(bucket.sales / bucket.realOrders) : 0;
  return {
    ...bucket,
    aov,
    brushRatio,
    feeRatio,
    refundRatio,
    shopCount: bucket.shopKeys.size,
  };
});

const platformAgg = computed<PlatformBucket[]>(() => {
  const map = new Map<string, PlatformBucket>();
  for (const row of sortedRows.value) {
    const code = platformCodeOf(row);
    const bucket =
      map.get(code) ??
      ({
        ...newBucket(),
        platformCode: code,
      } as PlatformBucket);
    addRow(bucket, row);
    map.set(code, bucket);
  }
  return [...map.values()].toSorted((a, b) => b.sales - a.sales);
});

const platformCount = computed(() => platformAgg.value.length);
const topPlatform = computed(() => platformAgg.value[0]);

const channelLast30 = computed(() => {
  const labels = last30Agg.value.labels;
  const ecMap = new Map<string, Bucket>();
  const mediaMap = new Map<string, Bucket>();
  const keySet = new Set(labels);
  for (const row of sortedRows.value) {
    const dateKey = normalizeStatDateKey(row.statDate);
    if (!keySet.has(dateKey)) continue;
    const targetMap =
      channelOf(platformCodeOf(row)) === 'media' ? mediaMap : ecMap;
    const bucket = targetMap.get(dateKey) ?? newBucket();
    addRow(bucket, row);
    targetMap.set(dateKey, bucket);
  }
  const ecBuckets = labels.map((label) => ecMap.get(label) ?? newBucket());
  const mediaBuckets = labels.map(
    (label) => mediaMap.get(label) ?? newBucket(),
  );
  return { ecBuckets, labels, mediaBuckets };
});

const topShopAgg = computed(() => {
  const map = new Map<
    string,
    { label: string; platformCode: string; sales: number }
  >();
  for (const row of sortedRows.value) {
    const shopName = String(row.shopName ?? '').trim() || '未命名店铺';
    const platformCode = platformCodeOf(row);
    const key = `${platformCode}|${shopName}`;
    const item = map.get(key) ?? {
      label: shopName,
      platformCode,
      sales: 0,
    };
    item.sales = round2(item.sales + realNetSalesAmountOf(row));
    map.set(key, item);
  }
  return [...map.values()].toSorted((a, b) => b.sales - a.sales).slice(0, 8);
});

const latestDate = computed(() => dateAgg.value.labels.at(-1) ?? '-');

const filterSummary = computed(() => {
  const platformCode = fixedPlatformCode.value ?? dashForm.platformCode?.trim();
  const platform = platformCode ? platformLabel(platformCode) : '全部平台';
  const shop = dashForm.shopName?.trim() || '全部店铺';
  return `${dashForm.statDate[0]} ~ ${dashForm.statDate[1]} · ${platform} · ${shop}`;
});

const dataSummary = computed(() => {
  if (sortedRows.value.length === 0 && !loading.value) {
    return '暂无数据，请调整筛选条件或先在表格中录入';
  }
  return `合并 ${dateAgg.value.labels.length} 个统计日 · 原始记录 ${rawRows.value.length} 条 · 覆盖 ${platformCount.value} 个平台`;
});

const insightItems = computed(() => [
  {
    description: '营销费比 = 营销费用 / 实际销售额，用于观察推广投入强度。',
    label: '营销费比',
    tone: metricTone(kpi.value.feeRatio, 20, 30),
    value: ratioText(kpi.value.feeRatio),
  },
  {
    description:
      '退款率：淘宝按退款金额 / 成交额(GMV)，其他平台按退款金额 / 支付金额，用于观察售后退款压力。',
    label: '退款率',
    tone: metricTone(kpi.value.refundRatio, 15, 25),
    value: ratioText(kpi.value.refundRatio),
  },
  {
    description:
      '真实客单价 = 实际销售额 / 真实订单数，用于衡量单笔真实订单价值。',
    label: '真实客单价',
    tone: 'processing',
    value: moneyText(kpi.value.aov),
  },
  {
    description:
      '刷单金额占比：淘宝按刷单本金 / 成交额(GMV)，其他平台按刷单本金 / 支付金额，用于识别非真实成交占用比例。',
    label: '刷单金额占比',
    tone: metricTone(kpi.value.brushRatio, 3, 8),
    value: ratioText(kpi.value.brushRatio),
  },
  {
    description: '当前筛选范围内产生有效统计数据的店铺数量。',
    label: '活跃店铺',
    tone: 'default',
    value: `${kpi.value.shopCount} 家`,
  },
  {
    description: '当前筛选范围内实际销售额最高的平台。',
    label: '最高平台',
    tone: 'processing',
    value: topPlatform.value
      ? `${platformLabel(topPlatform.value.platformCode)} ${amountShort(topPlatform.value.sales)}`
      : '-',
  },
  {
    description: '当前数据集中最新一条统计日期。',
    label: '最新统计日',
    tone: 'default',
    value: latestDate.value,
  },
]);

const chartMonthOverview = computed<ECOption | null>(() =>
  monthAgg.value.labels.length > 0 ? monthOverviewOption(monthAgg.value) : null,
);

const chartPlatformContribution = computed<ECOption | null>(() =>
  platformAgg.value.length > 0
    ? platformContributionOption(platformAgg.value.slice(0, 8))
    : null,
);

const chartWeek = computed<ECOption | null>(() => {
  const agg = weekAgg.value;
  if (agg.labels.length === 0) return null;
  return dualMoneyLineOption(
    agg.labels,
    '实际销售额',
    agg.buckets.map((b) => round2(b.sales)),
    '营销费用',
    agg.buckets.map((b) => round2(b.marketing)),
  );
});

const chartLast30Ratio = computed<ECOption | null>(() => {
  const agg = last30Agg.value;
  if (agg.labels.length === 0) return null;
  return ratioLineOption(agg.labels, [
    {
      color: '#6366f1',
      data: agg.buckets.map((b) => ratioPercent(b.marketing, b.sales)),
      name: '营销费比',
    },
    {
      color: '#f97316',
      data: agg.buckets.map((b) => ratioPercent(b.refund, b.amountBase)),
      name: '退款率',
    },
  ]);
});

const chartChannelSales = computed<ECOption | null>(() => {
  const agg = channelLast30.value;
  if (agg.labels.length === 0) return null;
  return dualMoneyLineOption(
    agg.labels,
    '电商渠道销售额',
    agg.ecBuckets.map((b) => round2(b.sales)),
    '新媒体渠道销售额',
    agg.mediaBuckets.map((b) => round2(b.sales)),
    ['#2563eb', '#06b6d4'],
  );
});

const chartChannelRatio = computed<ECOption | null>(() => {
  const agg = channelLast30.value;
  if (agg.labels.length === 0) return null;
  return ratioLineOption(agg.labels, [
    {
      color: '#2563eb',
      data: agg.ecBuckets.map((b) => ratioPercent(b.marketing, b.sales)),
      name: '电商渠道费比',
    },
    {
      color: '#06b6d4',
      data: agg.mediaBuckets.map((b) => ratioPercent(b.marketing, b.sales)),
      name: '新媒体渠道费比',
    },
  ]);
});

const chartTopShop = computed<ECOption | null>(() =>
  topShopAgg.value.length > 0 ? topShopOption(topShopAgg.value) : null,
);

async function fetchShopNameOptions(keyword = '') {
  const seq = ++shopNameFetchSeq;
  const platformCode =
    fixedPlatformCode.value ?? dashForm.platformCode?.trim() ?? undefined;
  try {
    const list = await getEcShopDailyShopNameOptions({
      keyword: keyword.trim() || undefined,
      limit: 80,
      platformCode,
    });
    if (seq !== shopNameFetchSeq) return;
    shopNameOptions.value = list.map((name) => ({
      label: name,
      value: name,
    }));
  } catch (error) {
    if (seq !== shopNameFetchSeq) return;
    console.error(
      'Load ec shop daily dashboard shop name options failed',
      error,
    );
    shopNameOptions.value = [];
  }
}

function handleShopNameSearch(keyword = '') {
  if (shopNameSearchTimer) {
    clearTimeout(shopNameSearchTimer);
  }
  shopNameSearchTimer = setTimeout(() => {
    void fetchShopNameOptions(keyword);
  }, 250);
}

function handleShopNameClear() {
  dashForm.shopName = '';
  handleShopNameSearch('');
}

function handlePlatformChange() {
  dashForm.shopName = '';
  handleShopNameSearch('');
}

function buildQueryPayload(): Record<string, unknown> {
  const payload: Record<string, unknown> = {};
  if (dashForm.statDate?.[0] && dashForm.statDate?.[1]) {
    payload.statDate = dashForm.statDate;
  }
  const platformCode =
    fixedPlatformCode.value ?? dashForm.platformCode?.trim() ?? undefined;
  if (platformCode) payload.platformCode = platformCode;
  if (dashForm.shopName?.trim()) payload.shopName = dashForm.shopName.trim();
  return payload;
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
  dashForm.statDate = currentYearToTodayRange();
  dashForm.platformCode = fixedPlatformCode.value;
  dashForm.shopName = '';
  handleShopNameSearch('');
  void loadRows();
}

watch(fixedPlatformCode, (platformCode) => {
  dashForm.platformCode = platformCode;
  dashForm.shopName = '';
  handleShopNameSearch('');
  void loadRows();
});

defineExpose({
  reload: loadRows,
});

onBeforeUnmount(() => {
  if (shopNameSearchTimer) clearTimeout(shopNameSearchTimer);
});

void loadRows();
void fetchShopNameOptions();
</script>

<template>
  <Spin :spinning="loading">
    <div class="all-dashboard">
      <section class="filter-panel">
        <div class="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div>
            <div class="text-sm font-semibold text-foreground">筛选条件</div>
            <div class="mt-1 text-xs text-muted-foreground">
              {{ filterSummary }}
            </div>
          </div>
          <Tag color="blue">基于全平台通用主表统计</Tag>
        </div>

        <Form layout="vertical">
          <Row :gutter="[16, 12]">
            <Col :xs="24" :lg="9" :xl="8">
              <FormItem label="统计日期" class="mb-0">
                <FdmDateRangePicker
                  v-model:value="dashForm.statDate"
                  class="w-full"
                />
              </FormItem>
            </Col>
            <Col v-if="!isFixedPlatform" :xs="24" :sm="12" :lg="5" :xl="4">
              <FormItem label="平台" class="mb-0">
                <Select
                  v-model:value="dashForm.platformCode"
                  allow-clear
                  class="w-full"
                  option-filter-prop="label"
                  :options="platformOptions"
                  placeholder="全部平台"
                  show-search
                  @change="handlePlatformChange"
                />
              </FormItem>
            </Col>
            <Col :xs="24" :sm="12" :lg="6" :xl="6">
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
            <Col
              :xs="24"
              :lg="isFixedPlatform ? 9 : 4"
              :xl="isFixedPlatform ? 10 : 6"
            >
              <FormItem label=" " class="mb-0 filter-actions">
                <Space wrap class="w-full justify-end">
                  <Button type="primary" @click="loadRows">查询</Button>
                  <Button @click="resetFilters">重置</Button>
                </Space>
              </FormItem>
            </Col>
          </Row>
        </Form>
      </section>

      <div
        v-if="truncated"
        class="mb-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-200"
      >
        已截断：服务端共 {{ totalRemote }} 条，当前仅拉取前
        {{ PAGE_SIZE * MAX_PAGES }} 条参与统计。
      </div>

      <div class="mb-2 flex flex-wrap items-baseline justify-between gap-2">
        <span class="text-sm font-semibold text-foreground">全平台核心指标</span>
        <span class="text-xs text-muted-foreground">{{ dataSummary }}</span>
      </div>

      <section class="kpi-grid">
        <div class="kpi-card kpi-card--sales">
          <div class="kpi-title">总实际销售额</div>
          <Tooltip
            :title="
              metricTitle(
                '实际销售额按真实净销售口径统计，已剔除退款与刷单金额影响。',
                `¥${fmtAmount2(kpi.sales)}`,
              )
            "
          >
            <div class="kpi-value">{{ moneyText(kpi.sales) }}</div>
          </Tooltip>
          <div class="kpi-desc">已剔除退款与刷单影响</div>
        </div>
        <div class="kpi-card kpi-card--marketing">
          <div class="kpi-title">总营销费用</div>
          <Tooltip
            :title="
              metricTitle(
                '营销费用为当前筛选范围内各平台推广投放费用合计。',
                `¥${fmtAmount2(kpi.marketing)}`,
              )
            "
          >
            <div class="kpi-value">{{ moneyText(kpi.marketing) }}</div>
          </Tooltip>
          <div class="kpi-desc">全平台推广投放合计</div>
        </div>
        <div class="kpi-card kpi-card--refund">
          <div class="kpi-title">总退款金额</div>
          <Tooltip
            :title="
              metricTitle(
                '退款金额为当前筛选范围内主表退款金额字段汇总。',
                `¥${fmtAmount2(kpi.refund)}`,
              )
            "
          >
            <div class="kpi-value">{{ moneyText(kpi.refund) }}</div>
          </Tooltip>
          <div class="kpi-desc">按主表退款金额汇总</div>
        </div>
        <div class="kpi-card kpi-card--orders">
          <div class="kpi-title">真实订单</div>
          <Tooltip
            :title="
              metricTitle(
                '真实订单 = 支付订单数 - 刷单订单数，用于观察真实成交订单规模。',
                numberShort(kpi.realOrders),
              )
            "
          >
            <div class="kpi-value">{{ numberShort(kpi.realOrders) }}</div>
          </Tooltip>
          <div class="kpi-desc">支付订单扣除刷单订单</div>
        </div>
      </section>

      <section class="insight-strip">
        <div
          v-for="item in insightItems"
          :key="item.label"
          class="insight-item"
        >
          <span class="insight-label">{{ item.label }}</span>
          <Tooltip :title="metricTitle(item.description, item.value)">
            <Tag :color="item.tone">{{ item.value }}</Tag>
          </Tooltip>
        </div>
      </section>

      <Row :gutter="[16, 16]" class="mb-4">
        <Col :xs="24" :xl="14">
          <section class="chart-panel">
            <div class="chart-title">月度经营总览</div>
            <EchartsBox
              v-if="chartMonthOverview"
              :height="340"
              :option="chartMonthOverview"
            />
            <div v-else class="empty-block">暂无数据</div>
          </section>
        </Col>
        <Col :xs="24" :xl="10">
          <section class="chart-panel">
            <div class="chart-title">平台贡献排行</div>
            <EchartsBox
              v-if="chartPlatformContribution"
              :height="340"
              :option="chartPlatformContribution"
            />
            <div v-else class="empty-block">暂无数据</div>
          </section>
        </Col>
        <Col :span="24">
          <section class="chart-panel">
            <div class="chart-title">过去十二周销售与营销费用</div>
            <EchartsBox v-if="chartWeek" :height="320" :option="chartWeek" />
            <div v-else class="empty-block">暂无数据</div>
          </section>
        </Col>
        <Col :xs="24" :xl="12">
          <section class="chart-panel">
            <div class="chart-title">近30天费比与退款率</div>
            <EchartsBox
              v-if="chartLast30Ratio"
              :height="300"
              :option="chartLast30Ratio"
            />
            <div v-else class="empty-block">暂无数据</div>
          </section>
        </Col>
        <Col :xs="24" :xl="12">
          <section class="chart-panel">
            <div class="chart-title">近30天电商与新媒体销售额</div>
            <EchartsBox
              v-if="chartChannelSales"
              :height="300"
              :option="chartChannelSales"
            />
            <div v-else class="empty-block">暂无数据</div>
          </section>
        </Col>
        <Col :xs="24" :xl="12">
          <section class="chart-panel">
            <div class="chart-title">近30天渠道营销费比</div>
            <EchartsBox
              v-if="chartChannelRatio"
              :height="300"
              :option="chartChannelRatio"
            />
            <div v-else class="empty-block">暂无数据</div>
          </section>
        </Col>
        <Col :xs="24" :xl="12">
          <section class="chart-panel">
            <div class="chart-title">店铺销售贡献 Top 8</div>
            <EchartsBox
              v-if="chartTopShop"
              :height="300"
              :option="chartTopShop"
            />
            <div v-else class="empty-block">暂无数据</div>
          </section>
        </Col>
      </Row>
    </div>
  </Spin>
</template>

<style scoped>
.all-dashboard {
  --sales-color: #2563eb;
  --marketing-color: #16a34a;
  --refund-color: #ea580c;
  --orders-color: #7c3aed;
}

.filter-panel,
.chart-panel,
.insight-strip,
.kpi-card {
  background: hsl(var(--card));
  border: 1px solid hsl(var(--border));
  border-radius: 8px;
  box-shadow: 0 6px 18px rgb(15 23 42 / 5%);
}

.filter-panel {
  padding: 16px;
  margin-bottom: 16px;
}

.filter-panel :deep(.ant-form-item-label > label) {
  font-size: 13px;
  color: hsl(var(--muted-foreground));
}

.filter-actions :deep(.ant-form-item-label) {
  visibility: hidden;
}

.kpi-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 16px;
  margin-bottom: 16px;
}

.kpi-card {
  min-width: 0;
  padding: 18px;
  overflow: hidden;
  border-top-width: 3px;
}

.kpi-card--sales {
  border-top-color: var(--sales-color);
}

.kpi-card--marketing {
  border-top-color: var(--marketing-color);
}

.kpi-card--refund {
  border-top-color: var(--refund-color);
}

.kpi-card--orders {
  border-top-color: var(--orders-color);
}

.kpi-title {
  margin-bottom: 18px;
  font-size: 14px;
  font-weight: 600;
  color: hsl(var(--foreground));
}

.kpi-value {
  overflow: hidden;
  text-overflow: ellipsis;
  font-size: 38px;
  font-weight: 760;
  line-height: 1.1;
  color: hsl(var(--foreground));
  white-space: nowrap;
}

.kpi-card--sales .kpi-value {
  color: var(--sales-color);
}

.kpi-card--marketing .kpi-value {
  color: var(--marketing-color);
}

.kpi-card--refund .kpi-value {
  color: var(--refund-color);
}

.kpi-card--orders .kpi-value {
  color: var(--orders-color);
}

.kpi-desc {
  margin-top: 14px;
  overflow: hidden;
  text-overflow: ellipsis;
  font-size: 12px;
  color: hsl(var(--muted-foreground));
  white-space: nowrap;
}

.insight-strip {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  padding: 12px;
  margin-bottom: 16px;
}

.insight-item {
  display: inline-flex;
  gap: 8px;
  align-items: center;
  min-width: 150px;
  padding: 4px 8px;
  background: hsl(var(--muted) / 22%);
  border: 1px solid hsl(var(--border) / 70%);
  border-radius: 6px;
}

.insight-label {
  font-size: 12px;
  color: hsl(var(--muted-foreground));
  white-space: nowrap;
}

.chart-panel {
  min-width: 0;
  height: 100%;
  padding: 12px;
}

.chart-title {
  margin-bottom: 8px;
  font-size: 15px;
  font-weight: 650;
  color: hsl(var(--foreground));
}

.empty-block {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 220px;
  font-size: 13px;
  color: hsl(var(--muted-foreground));
}

@media (max-width: 1200px) {
  .kpi-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (max-width: 768px) {
  .filter-actions :deep(.ant-form-item-label) {
    display: none;
  }

  .kpi-grid {
    grid-template-columns: 1fr;
  }

  .kpi-value {
    font-size: 32px;
  }
}
</style>
