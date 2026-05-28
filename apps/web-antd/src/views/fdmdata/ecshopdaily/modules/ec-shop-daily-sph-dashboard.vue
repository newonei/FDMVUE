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

defineOptions({ name: 'EcShopDailySphDashboard' });

const PAGE_SIZE = 200;
const MAX_PAGES = 40;
const PLATFORM_CODE = 'SPH';
const PLATFORM_LABEL = '视频号';

type DetailRow = Record<string, any>;

interface SphBucket {
  actualTransaction: number;
  avgOrderValueTotal: number;
  avgOrderValueWeight: number;
  buyerCount: number;
  orderAmount: number;
  orderCount: number;
  orderUserCount: number;
  paidOrderCount: number;
  refundAmount: number;
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
    if (row[key] !== undefined && row[key] !== null && row[key] !== '') return row[key];
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

function ratioLabel(value: null | number | undefined): string {
  if (value === null || value === undefined) return '-';
  return `${round2(value).toFixed(2)}%`;
}

function newBucket(): SphBucket {
  return {
    actualTransaction: 0,
    avgOrderValueTotal: 0,
    avgOrderValueWeight: 0,
    buyerCount: 0,
    orderAmount: 0,
    orderCount: 0,
    orderUserCount: 0,
    paidOrderCount: 0,
    refundAmount: 0,
    transactionAmount: 0,
  };
}

function rowToBucket(row: DetailRow): SphBucket {
  const paidOrderCount = getNumber(row, 'paid_order_count', 'paidOrderCount');
  const avgOrderValue = getNumber(row, 'avg_order_value', 'avgOrderValue');
  return {
    actualTransaction: getNumber(row, 'transaction_amount_2', 'transactionAmount2'),
    avgOrderValueTotal: avgOrderValue > 0 && paidOrderCount > 0 ? avgOrderValue * paidOrderCount : 0,
    avgOrderValueWeight: avgOrderValue > 0 && paidOrderCount > 0 ? paidOrderCount : 0,
    buyerCount: getNumber(row, 'buyer_count', 'buyerCount'),
    orderAmount: getNumber(row, 'order_amount', 'orderAmount'),
    orderCount: getNumber(row, 'order_count', 'orderCount'),
    orderUserCount: getNumber(row, 'order_user_count', 'orderUserCount'),
    paidOrderCount,
    refundAmount:
      getNumber(row, 'refund_amount_2', 'refundAmount2') ||
      getNumber(row, 'refund_amount', 'refundAmount'),
    transactionAmount: getNumber(row, 'transaction_amount', 'transactionAmount'),
  };
}

function addBucket(target: SphBucket, source: SphBucket) {
  target.actualTransaction = round2(target.actualTransaction + source.actualTransaction);
  target.avgOrderValueTotal = round2(target.avgOrderValueTotal + source.avgOrderValueTotal);
  target.avgOrderValueWeight += source.avgOrderValueWeight;
  target.buyerCount += source.buyerCount;
  target.orderAmount = round2(target.orderAmount + source.orderAmount);
  target.orderCount += source.orderCount;
  target.orderUserCount += source.orderUserCount;
  target.paidOrderCount += source.paidOrderCount;
  target.refundAmount = round2(target.refundAmount + source.refundAmount);
  target.transactionAmount = round2(target.transactionAmount + source.transactionAmount);
}

function statDateOf(row: DetailRow): string {
  return normalizeStatDateKey(getValue(row, 'stat_date', 'statDate') as any);
}

function aggregateByKey(rows: DetailRow[], keyOf: (dateKey: string) => string, maxCount?: number) {
  const map = new Map<string, SphBucket>();
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
  return { buckets: slicedLabels.map((label) => map.get(label)!), labels: slicedLabels };
}

function sliceLastRows(rows: DetailRow[], days: number): DetailRow[] {
  const daily = aggregateByKey(rows, (dateKey) => dateKey);
  const labelSet = new Set(daily.labels.slice(-days));
  return rows.filter((row) => labelSet.has(statDateOf(row)));
}

const loading = ref(false);
const truncated = ref(false);
const totalRemote = ref(0);
const rawRows = ref<DetailRow[]>([]);
const shopNameOptions = ref<EcShopDailyOption[]>([]);
let shopNameFetchSeq = 0;
let shopNameSearchTimer: ReturnType<typeof setTimeout> | undefined;

const dashForm = reactive<{ shopName: string; statDate: FdmDateRange }>({
  shopName: '',
  statDate: currentYearRange(),
});

const sortedRows = computed(() =>
  [...rawRows.value].toSorted((a, b) => statDateOf(a).localeCompare(statDateOf(b))),
);
const last7Rows = computed(() => sliceLastRows(sortedRows.value, 7));
const last30Rows = computed(() => sliceLastRows(sortedRows.value, 30));
const monthAgg = computed(() => aggregateByKey(sortedRows.value, (dateKey) => dateKey.slice(0, 7)));
const last7Agg = computed(() => aggregateByKey(last7Rows.value, (dateKey) => dateKey));
const last30Agg = computed(() => aggregateByKey(last30Rows.value, (dateKey) => dateKey));
const weekAgg = computed(() =>
  aggregateByKey(
    sortedRows.value,
    (dateKey) => dayjs(dateKey).startOf('isoWeek').format('YYYY-MM-DD'),
    10,
  ),
);

const rangeKpi = computed(() => {
  const bucket = newBucket();
  for (const row of sortedRows.value) addBucket(bucket, rowToBucket(row));
  const refundRatio = ratioPercent(bucket.refundAmount, bucket.transactionAmount);
  const orderPayRate = ratioPercent(bucket.paidOrderCount, bucket.orderCount);
  const userPayRate = ratioPercent(bucket.buyerCount, bucket.orderUserCount);
  const actualRate = ratioPercent(bucket.actualTransaction, bucket.transactionAmount);
  const avgOrderValue =
    bucket.avgOrderValueWeight > 0
      ? round2(bucket.avgOrderValueTotal / bucket.avgOrderValueWeight)
      : bucket.paidOrderCount > 0
        ? round2(bucket.transactionAmount / bucket.paidOrderCount)
        : 0;
  return {
    ...bucket,
    actualRate,
    avgOrderValue,
    orderPayRate,
    refundRatio,
    userPayRate,
  };
});

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
  return [
    { label: '订单成交率', value: ratioLabel(kpi.orderPayRate), tone: 'blue' },
    { label: '用户成交率', value: ratioLabel(kpi.userPayRate), tone: 'cyan' },
    { label: '实际成交占比', value: ratioLabel(kpi.actualRate), tone: 'green' },
    { label: '退款率', value: ratioLabel(kpi.refundRatio), tone: kpi.refundRatio !== null && kpi.refundRatio <= 15 ? 'green' : 'red' },
    { label: '客单价', value: `¥${fmtAmount2(kpi.avgOrderValue)}`, tone: 'purple' },
    { label: '下单人数', value: fullNumber(kpi.orderUserCount), tone: 'geekblue' },
  ];
});

function baseChartOption(title: string): ECOption {
  return {
    title: { left: 6, text: title, textStyle: { fontSize: 15, fontWeight: 600 }, top: 4 },
    tooltip: { axisPointer: { type: 'cross' }, trigger: 'axis' },
    grid: { bottom: 58, left: 58, right: 44, top: 54 },
    legend: { bottom: 4, itemHeight: 8, itemWidth: 12 },
    xAxis: { axisLabel: { hideOverlap: true, interval: 'auto' }, boundaryGap: false, type: 'category' },
    yAxis: { axisLabel: { formatter: (value: number) => amountShort(value) }, splitLine: { lineStyle: { color: '#e5e7eb', type: 'dashed' } }, type: 'value' },
  };
}

function moneyFormatter(value: unknown) {
  return `¥${fmtAmount2(value)}`;
}

function last7TrendOption(): ECOption | null {
  const { buckets, labels } = last7Agg.value;
  if (!labels.length) return null;
  const option = baseChartOption('过去7天交易趋势') as any;
  option.xAxis.data = labels;
  option.yAxis = [
    { axisLabel: { formatter: (value: number) => amountShort(value) }, name: '金额', splitLine: { lineStyle: { color: '#e5e7eb', type: 'dashed' } }, type: 'value' },
    { axisLabel: { formatter: (value: number) => `${value}` }, name: '订单', type: 'value' },
  ];
  option.series = [
    { name: '成交金额', type: 'line', smooth: true, data: buckets.map((item) => round2(item.transactionAmount)), itemStyle: { color: '#2563eb' }, label: { show: true, position: 'top', formatter: (p: any) => amountShort(p.value), fontSize: 10 } },
    { name: '实际成交金额', type: 'line', smooth: true, data: buckets.map((item) => round2(item.actualTransaction)), itemStyle: { color: '#10b981' } },
    { name: '成交订单数', type: 'line', yAxisIndex: 1, smooth: true, data: buckets.map((item) => item.paidOrderCount), itemStyle: { color: '#f97316' } },
  ];
  return option;
}

function monthTrendOption(): ECOption | null {
  const { buckets, labels } = monthAgg.value;
  if (!labels.length) return null;
  const option = baseChartOption('月度交易数据') as any;
  option.xAxis.data = labels;
  option.xAxis.boundaryGap = true;
  option.tooltip.valueFormatter = moneyFormatter;
  option.series = [
    { name: '成交金额', type: 'bar', data: buckets.map((item) => round2(item.transactionAmount)), itemStyle: { color: '#2563eb', borderRadius: [5, 5, 0, 0] }, label: { show: labels.length <= 12, position: 'top', formatter: (p: any) => amountShort(p.value), fontSize: 10 } },
    { name: '下单金额', type: 'bar', data: buckets.map((item) => round2(item.orderAmount)), itemStyle: { color: '#93c5fd', borderRadius: [5, 5, 0, 0] } },
    { name: '退款金额', type: 'line', smooth: true, data: buckets.map((item) => round2(item.refundAmount)), itemStyle: { color: '#ef4444' } },
  ];
  return option;
}

function last30FunnelOption(): ECOption | null {
  const { buckets, labels } = last30Agg.value;
  if (!labels.length) return null;
  const option = baseChartOption('近30天下单与成交漏斗') as any;
  option.xAxis.data = labels;
  option.series = [
    { name: '下单订单数', type: 'line', smooth: true, data: buckets.map((item) => item.orderCount), itemStyle: { color: '#64748b' }, label: { show: true, position: 'top', fontSize: 10 } },
    { name: '成交订单数', type: 'line', smooth: true, data: buckets.map((item) => item.paidOrderCount), itemStyle: { color: '#2563eb' } },
    { name: '下单人数', type: 'line', smooth: true, data: buckets.map((item) => item.orderUserCount), itemStyle: { color: '#f59e0b' } },
    { name: '成交人数', type: 'line', smooth: true, data: buckets.map((item) => item.buyerCount), itemStyle: { color: '#10b981' } },
  ];
  return option;
}

function refundRatioOption(): ECOption | null {
  const { buckets, labels } = last30Agg.value;
  if (!labels.length) return null;
  const option = baseChartOption('近30天退款风险') as any;
  option.xAxis.data = labels;
  option.yAxis = [
    { axisLabel: { formatter: (value: number) => amountShort(value) }, name: '金额', splitLine: { lineStyle: { color: '#e5e7eb', type: 'dashed' } }, type: 'value' },
    { axisLabel: { formatter: (value: number) => `${value}%` }, name: '退款率', type: 'value' },
  ];
  option.series = [
    { name: '退款金额', type: 'bar', data: buckets.map((item) => round2(item.refundAmount)), itemStyle: { color: '#ef4444', borderRadius: [5, 5, 0, 0] } },
    { name: '退款率', type: 'line', yAxisIndex: 1, smooth: true, data: buckets.map((item) => ratioPercent(item.refundAmount, item.transactionAmount)), itemStyle: { color: '#1d4ed8' }, label: { show: true, position: 'top', formatter: (p: any) => ratioLabel(p.value), fontSize: 10 } },
  ];
  return option;
}

function weekTrendOption(): ECOption | null {
  const { buckets, labels } = weekAgg.value;
  if (!labels.length) return null;
  const option = baseChartOption('过去十周交易趋势') as any;
  option.xAxis.data = labels;
  option.tooltip.valueFormatter = (value: unknown) => String(value);
  option.yAxis = [
    { axisLabel: { formatter: (value: number) => amountShort(value) }, name: '金额', splitLine: { lineStyle: { color: '#e5e7eb', type: 'dashed' } }, type: 'value' },
    { axisLabel: { formatter: (value: number) => `${value}%` }, name: '成交率', type: 'value' },
  ];
  option.series = [
    { name: '成交金额', type: 'line', smooth: true, data: buckets.map((item) => round2(item.transactionAmount)), itemStyle: { color: '#2563eb' } },
    { name: '订单成交率', type: 'line', yAxisIndex: 1, smooth: true, data: buckets.map((item) => ratioPercent(item.paidOrderCount, item.orderCount)), itemStyle: { color: '#8b5cf6' } },
  ];
  return option;
}

const last7Chart = computed(() => last7TrendOption());
const monthChart = computed(() => monthTrendOption());
const funnelChart = computed(() => last30FunnelOption());
const refundChart = computed(() => refundRatioOption());
const weekChart = computed(() => weekTrendOption());

async function fetchShopNameOptions(keyword = '') {
  const seq = ++shopNameFetchSeq;
  try {
    const list = await getEcShopDailyShopNameOptions({
      keyword: keyword.trim() || undefined,
      limit: 50,
      platformCode: PLATFORM_CODE,
    });
    if (seq !== shopNameFetchSeq) return;
    shopNameOptions.value = list.map((name) => ({ label: name, value: name }));
  } catch (error) {
    if (seq !== shopNameFetchSeq) return;
    console.error('Load sph dashboard shop name options failed', error);
    shopNameOptions.value = [];
  }
}

function handleShopNameSearch(keyword = '') {
  if (shopNameSearchTimer) clearTimeout(shopNameSearchTimer);
  shopNameSearchTimer = setTimeout(() => void fetchShopNameOptions(keyword), 250);
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
  if (dashForm.shopName?.trim()) params.shopName = dashForm.shopName.trim();
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
    <Card size="small" class="sph-filter mb-4">
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
            <FormItem label=" " class="mb-0 sph-filter-actions">
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
      <span class="text-sm font-semibold text-foreground">视频号核心指标</span>
      <span class="text-xs text-muted-foreground">{{ dataSummary }}</span>
    </div>

    <div class="sph-kpi-grid mb-4">
      <Card class="sph-kpi sph-kpi--transaction" size="small">
        <div class="sph-kpi-title">{{ yearLabel }}成交金额</div>
        <Tooltip :title="fullMoney(rangeKpi.transactionAmount)">
          <div class="sph-kpi-value">{{ kpiMoney(rangeKpi.transactionAmount) }}</div>
        </Tooltip>
      </Card>
      <Card class="sph-kpi sph-kpi--actual" size="small">
        <div class="sph-kpi-title">{{ yearLabel }}实际成交金额</div>
        <Tooltip :title="fullMoney(rangeKpi.actualTransaction)">
          <div class="sph-kpi-value">{{ kpiMoney(rangeKpi.actualTransaction) }}</div>
        </Tooltip>
      </Card>
      <Card class="sph-kpi sph-kpi--orders" size="small">
        <div class="sph-kpi-title">成交订单数</div>
        <Tooltip :title="fullNumber(rangeKpi.paidOrderCount)">
          <div class="sph-kpi-value">{{ amountShort(rangeKpi.paidOrderCount) }}</div>
        </Tooltip>
      </Card>
      <Card class="sph-kpi sph-kpi--refund" size="small">
        <div class="sph-kpi-title">退款金额</div>
        <Tooltip :title="fullMoney(rangeKpi.refundAmount)">
          <div class="sph-kpi-value">{{ kpiMoney(rangeKpi.refundAmount) }}</div>
        </Tooltip>
      </Card>
    </div>

    <Card size="small" class="mb-4 sph-diagnosis">
      <div class="diagnosis-grid">
        <div v-for="item in diagnosticItems" :key="item.label" class="diagnosis-item">
          <span class="diagnosis-label">{{ item.label }}</span>
          <Tag :color="item.tone" class="diagnosis-value">{{ item.value }}</Tag>
        </div>
      </div>
    </Card>

    <Row :gutter="[16, 16]" class="mb-4">
      <Col :xs="24" :xl="12">
        <Card class="sph-chart-card h-full" size="small">
          <EchartsBox :option="last7Chart" :height="318" />
        </Card>
      </Col>
      <Col :xs="24" :xl="12">
        <Card class="sph-chart-card h-full" size="small">
          <EchartsBox :option="monthChart" :height="318" />
        </Card>
      </Col>
      <Col :xs="24">
        <Card class="sph-chart-card" size="small">
          <EchartsBox :option="funnelChart" :height="330" />
        </Card>
      </Col>
      <Col :xs="24" :xl="12">
        <Card class="sph-chart-card h-full" size="small">
          <EchartsBox :option="refundChart" :height="318" />
        </Card>
      </Col>
      <Col :xs="24" :xl="12">
        <Card class="sph-chart-card h-full" size="small">
          <EchartsBox :option="weekChart" :height="318" />
        </Card>
      </Col>
    </Row>
  </Spin>
</template>

<style scoped>
.sph-filter :deep(.ant-card-body) {
  padding: 16px;
  background: linear-gradient(135deg, rgb(255 255 255) 0%, rgb(239 246 255) 100%);
}

.sph-filter :deep(.ant-form-item-label > label) {
  color: hsl(var(--muted-foreground));
  font-size: 13px;
}

.sph-filter-actions :deep(.ant-form-item-label) {
  visibility: hidden;
}

.sph-kpi-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
  gap: 16px;
}

.sph-kpi {
  overflow: hidden;
  min-height: 148px;
  border: 0;
  border-radius: 8px;
  box-shadow: 0 8px 24px rgb(15 23 42 / 7%);
}

.sph-kpi :deep(.ant-card-body) {
  min-height: 148px;
  padding: 18px;
}

.sph-kpi-title {
  color: #111827;
  font-size: 14px;
  font-weight: 700;
}

.sph-kpi-value {
  overflow: hidden;
  margin-top: 28px;
  font-size: clamp(30px, 3vw, 50px);
  font-weight: 850;
  letter-spacing: 0;
  line-height: 1.05;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.sph-kpi--transaction .sph-kpi-value {
  color: #2563eb;
}

.sph-kpi--actual .sph-kpi-value {
  color: #10b981;
}

.sph-kpi--orders .sph-kpi-value {
  color: #f97316;
}

.sph-kpi--refund .sph-kpi-value {
  color: #dc2626;
}

.sph-diagnosis,
.sph-chart-card {
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

.sph-chart-card :deep(.ant-card-body) {
  padding: 10px;
}

.sph-chart-card :deep(.echarts) {
  border: 0;
}

@media (max-width: 768px) {
  .sph-filter-actions :deep(.ant-form-item-label) {
    display: none;
  }
}
</style>
