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

defineOptions({ name: 'EcShopDailyXhsDashboard' });

const PAGE_SIZE = 200;
const MAX_PAGES = 40;
const PLATFORM_CODE = 'XHS';
const PLATFORM_LABEL = '小红书';

type DetailRow = Record<string, any>;

interface RatioState {
  count: number;
  sum: number;
  weightedSum: number;
  weight: number;
}

interface XhsBucket {
  addCartUsers: number;
  brushOrders: number;
  brushPrincipal: number;
  buyers: number;
  comments: number;
  favorites: number;
  inquiryAmount: number;
  inquiryOrders: number;
  likes: number;
  noteClicks: number;
  notePaid: number;
  notePaidOrders: number;
  notePaidUsers: number;
  paidAmount: number;
  paidOrders: number;
  productPv: number;
  productVisitors: number;
  promotionCost: number;
  reads: number;
  refund: number;
  refundOrders: number;
  reviews: number;
  sessions: number;
  shares: number;
  transaction: number;
  visitors: number;
  views: number;
  wishlist: number;
  noteConversion: RatioState;
  paymentConversion: RatioState;
  productClickRate: RatioState;
  refundOrderRatio: RatioState;
  replyRate: RatioState;
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

function ratioState(): RatioState {
  return { count: 0, sum: 0, weight: 0, weightedSum: 0 };
}

function addRatio(target: RatioState, value: number, weight = 0) {
  target.count += 1;
  target.sum = round2(target.sum + value);
  if (weight > 0) {
    target.weight = round2(target.weight + weight);
    target.weightedSum += value * weight;
  }
}

function mergeRatio(target: RatioState, source: RatioState) {
  target.count += source.count;
  target.sum = round2(target.sum + source.sum);
  target.weight = round2(target.weight + source.weight);
  target.weightedSum += source.weightedSum;
}

function ratioValue(state: RatioState, fallback?: null | number): null | number {
  if (state.weight > 0) return round2(state.weightedSum / state.weight);
  if (state.count > 0) return round2(state.sum / state.count);
  return fallback ?? null;
}

function ratioPercent(numerator: number, denominator: number): null | number {
  if (denominator <= 0) return null;
  return round2((numerator / denominator) * 100);
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

function ratioLabel(value: null | number | undefined): string {
  if (value === null || value === undefined) return '-';
  return `${round2(value).toFixed(2)}%`;
}

function newBucket(): XhsBucket {
  return {
    addCartUsers: 0,
    brushOrders: 0,
    brushPrincipal: 0,
    buyers: 0,
    comments: 0,
    favorites: 0,
    inquiryAmount: 0,
    inquiryOrders: 0,
    likes: 0,
    noteClicks: 0,
    notePaid: 0,
    notePaidOrders: 0,
    notePaidUsers: 0,
    paidAmount: 0,
    paidOrders: 0,
    productPv: 0,
    productVisitors: 0,
    promotionCost: 0,
    reads: 0,
    refund: 0,
    refundOrders: 0,
    reviews: 0,
    sessions: 0,
    shares: 0,
    transaction: 0,
    visitors: 0,
    views: 0,
    wishlist: 0,
    noteConversion: ratioState(),
    paymentConversion: ratioState(),
    productClickRate: ratioState(),
    refundOrderRatio: ratioState(),
    replyRate: ratioState(),
  };
}

function maybeRatio(row: DetailRow, keys: string[], weight: number, apply: (value: number, weight: number) => void) {
  const raw = getValue(row, ...keys);
  if (raw !== undefined && raw !== null && raw !== '') apply(asNumber(raw), weight);
}

function rowToBucket(row: DetailRow): XhsBucket {
  const bucket = newBucket();
  bucket.transaction = getNumber(row, 'transaction_amount', 'transactionAmount');
  bucket.paidOrders = getNumber(row, 'paid_order_count', 'paidOrderCount');
  bucket.paidAmount = getNumber(row, 'paid_amount', 'paidAmount');
  bucket.buyers = getNumber(row, 'buyer_count', 'buyerCount');
  bucket.visitors = getNumber(row, 'visitor_count', 'visitorCount');
  bucket.views = getNumber(row, 'page_view_count', 'pageViewCount');
  bucket.productPv = getNumber(row, 'product_page_view_count', 'productPageViewCount');
  bucket.productVisitors = getNumber(row, 'product_visitor_count', 'productVisitorCount');
  bucket.addCartUsers = getNumber(row, 'metric_e3ccf5de');
  bucket.wishlist = getNumber(row, 'wishlist_count', 'wishlistCount');
  bucket.refund = getNumber(row, 'refund_amount', 'refundAmount');
  bucket.refundOrders = getNumber(row, 'metric_3187cc38');
  bucket.notePaid = getNumber(row, 'paid_amount_2', 'paidAmount2');
  bucket.notePaidUsers = getNumber(row, 'metric_693faef4');
  bucket.notePaidOrders = getNumber(row, 'paid_order_count_3', 'paidOrderCount3');
  bucket.noteClicks = getNumber(row, 'metric_7b6177a4');
  bucket.reads = getNumber(row, 'metric_80fb5d71');
  bucket.likes = getNumber(row, 'metric_a1a1870d');
  bucket.favorites = getNumber(row, 'metric_668470d8');
  bucket.comments = getNumber(row, 'metric_3d54b4f7');
  bucket.shares = getNumber(row, 'metric_76dc0874');
  bucket.sessions = getNumber(row, 'metric_45cfb387');
  bucket.reviews = getNumber(row, 'review_count', 'reviewCount');
  bucket.inquiryOrders = getNumber(row, 'metric_65cad336');
  bucket.inquiryAmount = getNumber(row, 'metric_ddab6396');
  bucket.promotionCost = getNumber(row, 'promotion_cost', 'promotionCost');
  bucket.brushPrincipal = getNumber(row, 'brush_principal', 'brushPrincipal');
  bucket.brushOrders = getNumber(row, 'brush_order_count', 'brushOrderCount');
  maybeRatio(row, ['pv'], bucket.productPv, (v, w) => addRatio(bucket.productClickRate, v, w));
  maybeRatio(row, ['payment_conversion_rate_uv', 'paymentConversionRateUv'], bucket.visitors, (v, w) => addRatio(bucket.paymentConversion, v, w));
  maybeRatio(row, ['payment_conversion_rate', 'paymentConversionRate'], bucket.noteClicks, (v, w) => addRatio(bucket.noteConversion, v, w));
  maybeRatio(row, ['metric_92eeacec'], bucket.paidOrders, (v, w) => addRatio(bucket.refundOrderRatio, v, w));
  maybeRatio(row, ['metric_e5fd943a'], bucket.sessions, (v, w) => addRatio(bucket.replyRate, v, w));
  return bucket;
}

function addBucket(target: XhsBucket, source: XhsBucket) {
  target.addCartUsers += source.addCartUsers;
  target.brushOrders += source.brushOrders;
  target.brushPrincipal = round2(target.brushPrincipal + source.brushPrincipal);
  target.buyers += source.buyers;
  target.comments += source.comments;
  target.favorites += source.favorites;
  target.inquiryAmount = round2(target.inquiryAmount + source.inquiryAmount);
  target.inquiryOrders += source.inquiryOrders;
  target.likes += source.likes;
  target.noteClicks += source.noteClicks;
  target.notePaid = round2(target.notePaid + source.notePaid);
  target.notePaidOrders += source.notePaidOrders;
  target.notePaidUsers += source.notePaidUsers;
  target.paidAmount = round2(target.paidAmount + source.paidAmount);
  target.paidOrders += source.paidOrders;
  target.productPv += source.productPv;
  target.productVisitors += source.productVisitors;
  target.promotionCost = round2(target.promotionCost + source.promotionCost);
  target.reads += source.reads;
  target.refund = round2(target.refund + source.refund);
  target.refundOrders += source.refundOrders;
  target.reviews += source.reviews;
  target.sessions += source.sessions;
  target.shares += source.shares;
  target.transaction = round2(target.transaction + source.transaction);
  target.visitors += source.visitors;
  target.views += source.views;
  target.wishlist += source.wishlist;
  mergeRatio(target.noteConversion, source.noteConversion);
  mergeRatio(target.paymentConversion, source.paymentConversion);
  mergeRatio(target.productClickRate, source.productClickRate);
  mergeRatio(target.refundOrderRatio, source.refundOrderRatio);
  mergeRatio(target.replyRate, source.replyRate);
}

function statDateOf(row: DetailRow): string {
  return normalizeStatDateKey(getValue(row, 'stat_date', 'statDate') as any);
}

function aggregateByKey(rows: DetailRow[], keyOf: (dateKey: string) => string, maxCount?: number) {
  const map = new Map<string, XhsBucket>();
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

const rangeKpi = computed(() => {
  const bucket = newBucket();
  for (const row of sortedRows.value) addBucket(bucket, rowToBucket(row));
  const paymentConversion = ratioValue(bucket.paymentConversion, ratioPercent(bucket.paidOrders, bucket.visitors));
  const productClickRate = ratioValue(bucket.productClickRate, ratioPercent(bucket.productPv, bucket.views));
  const noteConversion = ratioValue(bucket.noteConversion, ratioPercent(bucket.notePaidOrders, bucket.noteClicks));
  const refundOrderRatio = ratioValue(bucket.refundOrderRatio, ratioPercent(bucket.refundOrders, bucket.paidOrders));
  const replyRate = ratioValue(bucket.replyRate);
  const promotionRatio = ratioPercent(bucket.promotionCost, bucket.transaction);
  const avgOrderValue = bucket.paidOrders > 0 ? round2(bucket.transaction / bucket.paidOrders) : 0;
  const engagementRate = ratioPercent(bucket.likes + bucket.favorites + bucket.comments + bucket.shares, bucket.reads);
  const inquiryRate = ratioPercent(bucket.inquiryOrders, bucket.sessions);
  return {
    ...bucket,
    avgOrderValue,
    engagementRate,
    inquiryRate,
    noteConversion,
    paymentConversion,
    productClickRate,
    promotionRatio,
    refundOrderRatio,
    replyRate,
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
    { label: '支付转化率', value: ratioLabel(kpi.paymentConversion), tone: 'blue' },
    { label: '商品点击率', value: ratioLabel(kpi.productClickRate), tone: 'geekblue' },
    { label: '笔记支付转化', value: ratioLabel(kpi.noteConversion), tone: 'magenta' },
    { label: '退款订单占比', value: ratioLabel(kpi.refundOrderRatio), tone: kpi.refundOrderRatio !== null && kpi.refundOrderRatio <= 15 ? 'green' : 'red' },
    { label: '推广占比', value: ratioLabel(kpi.promotionRatio), tone: kpi.promotionRatio !== null && kpi.promotionRatio <= 25 ? 'green' : 'orange' },
    { label: '客单价', value: `¥${fmtAmount2(kpi.avgOrderValue)}`, tone: 'purple' },
    { label: '内容互动率', value: ratioLabel(kpi.engagementRate), tone: 'cyan' },
    { label: '客服回复率', value: ratioLabel(kpi.replyRate), tone: 'green' },
    { label: '询购转化率', value: ratioLabel(kpi.inquiryRate), tone: 'gold' },
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
  const option = baseChartOption('过去7天趋势图') as any;
  option.xAxis.data = labels;
  option.yAxis = [
    { axisLabel: { formatter: (value: number) => amountShort(value) }, name: '金额', splitLine: { lineStyle: { color: '#e5e7eb', type: 'dashed' } }, type: 'value' },
    { axisLabel: { formatter: (value: number) => `${value}` }, name: '数量', type: 'value' },
  ];
  option.series = [
    { name: '实际成交金额', type: 'line', smooth: true, data: buckets.map((item) => round2(item.transaction)), itemStyle: { color: '#2563eb' }, label: { show: true, position: 'top', formatter: (p: any) => amountShort(p.value), fontSize: 10 } },
    { name: '支付件数', type: 'line', yAxisIndex: 1, smooth: true, data: buckets.map((item) => item.paidOrders), itemStyle: { color: '#10b981' } },
    { name: '总访客数', type: 'line', yAxisIndex: 1, smooth: true, data: buckets.map((item) => item.visitors), itemStyle: { color: '#f59e0b' } },
    { name: '新增加购人数', type: 'line', yAxisIndex: 1, smooth: true, data: buckets.map((item) => item.addCartUsers), itemStyle: { color: '#f97316' } },
  ];
  return option;
}

function monthTrendOption(): ECOption | null {
  const { buckets, labels } = monthAgg.value;
  if (!labels.length) return null;
  const option = baseChartOption('月度数据走势图') as any;
  option.xAxis.data = labels;
  option.xAxis.boundaryGap = true;
  option.tooltip.valueFormatter = moneyFormatter;
  option.series = [
    { name: '实际成交金额', type: 'bar', data: buckets.map((item) => round2(item.transaction)), itemStyle: { color: '#a855f7', borderRadius: [5, 5, 0, 0] }, label: { show: labels.length <= 12, position: 'top', formatter: (p: any) => amountShort(p.value), fontSize: 10 } },
    { name: '笔记支付金额', type: 'bar', data: buckets.map((item) => round2(item.notePaid)), itemStyle: { color: '#fb923c', borderRadius: [5, 5, 0, 0] } },
    { name: '推广花费', type: 'line', data: buckets.map((item) => round2(item.promotionCost)), itemStyle: { color: '#06b6d4' }, smooth: true },
  ];
  return option;
}

function last30TrendOption(): ECOption | null {
  const { buckets, labels } = last30Agg.value;
  if (!labels.length) return null;
  const option = baseChartOption('最近30天数据走势') as any;
  option.xAxis.data = labels;
  option.yAxis = [
    { axisLabel: { formatter: (value: number) => amountShort(value) }, name: '金额', splitLine: { lineStyle: { color: '#e5e7eb', type: 'dashed' } }, type: 'value' },
    { axisLabel: { formatter: (value: number) => `${value}` }, name: '数量', type: 'value' },
  ];
  option.series = [
    { name: '实际成交金额', type: 'line', smooth: true, data: buckets.map((item) => round2(item.transaction)), itemStyle: { color: '#2563eb' }, label: { show: true, position: 'top', formatter: (p: any) => amountShort(p.value), fontSize: 10 } },
    { name: '支付件数', type: 'line', yAxisIndex: 1, smooth: true, data: buckets.map((item) => item.paidOrders), itemStyle: { color: '#f97316' } },
    { name: '商品访客数', type: 'line', yAxisIndex: 1, smooth: true, data: buckets.map((item) => item.productVisitors), itemStyle: { color: '#22c55e' } },
    { name: '新增加购人数', type: 'line', yAxisIndex: 1, smooth: true, data: buckets.map((item) => item.addCartUsers), itemStyle: { color: '#eab308' } },
  ];
  return option;
}

function ratioTrendOption(): ECOption | null {
  const { buckets, labels } = last30Agg.value;
  if (!labels.length) return null;
  const option = baseChartOption('近30天转化和退款趋势') as any;
  option.xAxis.data = labels;
  option.tooltip.valueFormatter = (value: unknown) => fmtPercent2(value);
  option.yAxis.axisLabel = { formatter: (value: number) => `${value}%` };
  option.series = [
    { name: '支付转化率', type: 'line', smooth: true, data: buckets.map((item) => ratioValue(item.paymentConversion, ratioPercent(item.paidOrders, item.visitors))), itemStyle: { color: '#2563eb' }, label: { show: true, position: 'top', formatter: (p: any) => ratioLabel(p.value), fontSize: 10 } },
    { name: '退款订单占比', type: 'line', smooth: true, data: buckets.map((item) => ratioValue(item.refundOrderRatio, ratioPercent(item.refundOrders, item.paidOrders))), itemStyle: { color: '#ef4444' } },
    { name: '笔记支付转化率', type: 'line', smooth: true, data: buckets.map((item) => ratioValue(item.noteConversion, ratioPercent(item.notePaidOrders, item.noteClicks))), itemStyle: { color: '#ec4899' } },
  ];
  return option;
}

function contentInteractionOption(): ECOption | null {
  const { buckets, labels } = last30Agg.value;
  if (!labels.length) return null;
  const option = baseChartOption('近30天笔记互动趋势') as any;
  option.xAxis.data = labels;
  option.series = [
    { name: '阅读次数', type: 'line', smooth: true, data: buckets.map((item) => item.reads), itemStyle: { color: '#6366f1' } },
    { name: '点赞次数', type: 'line', smooth: true, data: buckets.map((item) => item.likes), itemStyle: { color: '#f43f5e' } },
    { name: '收藏次数', type: 'line', smooth: true, data: buckets.map((item) => item.favorites), itemStyle: { color: '#f59e0b' } },
    { name: '评论次数', type: 'line', smooth: true, data: buckets.map((item) => item.comments), itemStyle: { color: '#22c55e' } },
  ];
  return option;
}

function serviceInquiryOption(): ECOption | null {
  const { buckets, labels } = monthAgg.value;
  if (!labels.length) return null;
  const option = baseChartOption('客服与询购转化') as any;
  option.xAxis.data = labels;
  option.xAxis.boundaryGap = true;
  option.tooltip.valueFormatter = (value: unknown) => String(value);
  option.yAxis = [
    { axisLabel: { formatter: (value: number) => `${value}` }, name: '数量', splitLine: { lineStyle: { color: '#e5e7eb', type: 'dashed' } }, type: 'value' },
    { axisLabel: { formatter: (value: number) => amountShort(value) }, name: '金额', type: 'value' },
  ];
  option.series = [
    { name: '会话量', type: 'bar', data: buckets.map((item) => item.sessions), itemStyle: { color: '#14b8a6', borderRadius: [5, 5, 0, 0] } },
    { name: '询购转化订单数', type: 'bar', data: buckets.map((item) => item.inquiryOrders), itemStyle: { color: '#8b5cf6', borderRadius: [5, 5, 0, 0] } },
    { name: '询购转化金额', type: 'line', yAxisIndex: 1, smooth: true, data: buckets.map((item) => round2(item.inquiryAmount)), itemStyle: { color: '#f97316' } },
  ];
  return option;
}

const last7Chart = computed(() => last7TrendOption());
const monthChart = computed(() => monthTrendOption());
const last30Chart = computed(() => last30TrendOption());
const ratioChart = computed(() => ratioTrendOption());
const contentChart = computed(() => contentInteractionOption());
const serviceChart = computed(() => serviceInquiryOption());

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
    console.error('Load xhs dashboard shop name options failed', error);
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
    <Card size="small" class="xhs-filter mb-4">
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
            <FormItem label=" " class="mb-0 xhs-filter-actions">
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
      <span class="text-sm font-semibold text-foreground">小红书核心指标</span>
      <span class="text-xs text-muted-foreground">{{ dataSummary }}</span>
    </div>

    <div class="xhs-kpi-grid mb-4">
      <Card class="xhs-kpi xhs-kpi--transaction" size="small">
        <div class="xhs-kpi-title">{{ yearLabel }}实际成交金额</div>
        <Tooltip :title="fullMoney(rangeKpi.transaction)">
          <div class="xhs-kpi-value">{{ kpiMoney(rangeKpi.transaction) }}</div>
        </Tooltip>
      </Card>
      <Card class="xhs-kpi xhs-kpi--note" size="small">
        <div class="xhs-kpi-title">{{ yearLabel }}笔记支付金额</div>
        <Tooltip :title="fullMoney(rangeKpi.notePaid)">
          <div class="xhs-kpi-value">{{ kpiMoney(rangeKpi.notePaid) }}</div>
        </Tooltip>
      </Card>
      <Card class="xhs-kpi xhs-kpi--orders" size="small">
        <div class="xhs-kpi-title">{{ yearLabel }}总支付件数</div>
        <Tooltip :title="fullNumber(rangeKpi.paidOrders)">
          <div class="xhs-kpi-value">{{ amountShort(rangeKpi.paidOrders) }}</div>
        </Tooltip>
      </Card>
      <Card class="xhs-kpi xhs-kpi--visitors" size="small">
        <div class="xhs-kpi-title">总访客数</div>
        <Tooltip :title="fullNumber(rangeKpi.visitors)">
          <div class="xhs-kpi-value">{{ amountShort(rangeKpi.visitors) }}</div>
        </Tooltip>
      </Card>
    </div>

    <Card size="small" class="mb-4 xhs-diagnosis">
      <div class="diagnosis-grid">
        <div v-for="item in diagnosticItems" :key="item.label" class="diagnosis-item">
          <span class="diagnosis-label">{{ item.label }}</span>
          <Tag :color="item.tone" class="diagnosis-value">{{ item.value }}</Tag>
        </div>
      </div>
    </Card>

    <Row :gutter="[16, 16]" class="mb-4">
      <Col :xs="24" :xl="12">
        <Card class="xhs-chart-card h-full" size="small">
          <EchartsBox :option="last7Chart" :height="318" />
        </Card>
      </Col>
      <Col :xs="24" :xl="12">
        <Card class="xhs-chart-card h-full" size="small">
          <EchartsBox :option="monthChart" :height="318" />
        </Card>
      </Col>
      <Col :xs="24">
        <Card class="xhs-chart-card" size="small">
          <EchartsBox :option="last30Chart" :height="330" />
        </Card>
      </Col>
      <Col :xs="24">
        <Card class="xhs-chart-card" size="small">
          <EchartsBox :option="ratioChart" :height="300" />
        </Card>
      </Col>
      <Col :xs="24" :xl="12">
        <Card class="xhs-chart-card h-full" size="small">
          <EchartsBox :option="contentChart" :height="318" />
        </Card>
      </Col>
      <Col :xs="24" :xl="12">
        <Card class="xhs-chart-card h-full" size="small">
          <EchartsBox :option="serviceChart" :height="318" />
        </Card>
      </Col>
    </Row>
  </Spin>
</template>

<style scoped>
.xhs-filter :deep(.ant-card-body) {
  padding: 16px;
  background: linear-gradient(135deg, rgb(255 255 255) 0%, rgb(253 242 248) 100%);
}

.xhs-filter :deep(.ant-form-item-label > label) {
  color: hsl(var(--muted-foreground));
  font-size: 13px;
}

.xhs-filter-actions :deep(.ant-form-item-label) {
  visibility: hidden;
}

.xhs-kpi-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
  gap: 16px;
}

.xhs-kpi {
  overflow: hidden;
  min-height: 148px;
  border: 0;
  border-radius: 8px;
  box-shadow: 0 8px 24px rgb(15 23 42 / 7%);
}

.xhs-kpi :deep(.ant-card-body) {
  min-height: 148px;
  padding: 18px;
}

.xhs-kpi-title {
  color: #111827;
  font-size: 14px;
  font-weight: 700;
}

.xhs-kpi-value {
  overflow: hidden;
  margin-top: 28px;
  font-size: clamp(30px, 3vw, 50px);
  font-weight: 850;
  letter-spacing: 0;
  line-height: 1.05;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.xhs-kpi--transaction .xhs-kpi-value {
  color: #d946ef;
}

.xhs-kpi--note .xhs-kpi-value {
  color: #ec1671;
}

.xhs-kpi--orders .xhs-kpi-value {
  color: #fb7185;
}

.xhs-kpi--visitors .xhs-kpi-value {
  color: #7c3aed;
}

.xhs-diagnosis,
.xhs-chart-card {
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

.xhs-chart-card :deep(.ant-card-body) {
  padding: 10px;
}

.xhs-chart-card :deep(.echarts) {
  border: 0;
}

@media (max-width: 768px) {
  .xhs-filter-actions :deep(.ant-form-item-label) {
    display: none;
  }
}
</style>
