<script lang="ts" setup>
import type { TableColumnsType, TablePaginationConfig } from 'ant-design-vue';

import type { ECOption } from '@vben/plugins/echarts';

import type { FdmdataEcShopDailyApi } from '#/api/fdmdata/ecshopdaily';
import type { FdmDateRange } from '#/components/fdm-date-range-picker';

import { computed, h, onBeforeUnmount, onMounted, reactive, ref } from 'vue';

import { Page } from '@vben/common-ui';
import { downloadFileFromBlobPart } from '@vben/utils';

import {
  Button,
  Col,
  Drawer,
  Form,
  FormItem,
  message,
  Row,
  Segmented,
  Select,
  Spin,
  Switch,
  Table,
  Tag,
  Tooltip,
} from 'ant-design-vue';
import dayjs from 'dayjs';

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

interface CompareTableRow {
  current: SummaryMetric;
  dateRange: string;
  key: string;
  periodKey: string;
  periodLabel: string;
  platformLabel?: string;
  previous?: SummaryMetric;
  shopName?: string;
}

interface CoreCompareExportRow {
  layer: string;
  platformLabel?: string;
  row: CompareTableRow;
  shopName?: string;
}

interface PlatformVisualRow {
  current: SummaryMetric;
  key: string;
  platformCode: string;
  platformLabel: string;
  previous?: SummaryMetric;
}

interface ShopDiagnosticRow {
  costRatioDelta: null | number;
  key: string;
  platformLabel?: string;
  realOrderCountGrowth: null | number;
  salesAmount: number;
  salesGrowth: null | number;
  shopName: string;
}

interface WeeklyCompareColumn {
  key: string;
  platformLabel?: string;
  shop: SummaryShop;
  title: string;
}

type WeeklyComparePeriodKey = 'current' | 'previous';

type WeeklyCompareRowKey =
  | 'costRatioDelta'
  | 'currentCostRatio'
  | 'currentMarketingCost'
  | 'currentSales'
  | 'previousCostRatio'
  | 'previousMarketingCost'
  | 'previousSales'
  | 'salesGrowth';

interface WeeklyCompareRow {
  className?: string;
  key: WeeklyCompareRowKey;
  label: string;
}

type AbnormalRankingMode =
  | 'COST_RATIO_RISE'
  | 'COUNT_GROWTH'
  | 'SALES_DROP';

type PlatformVisualMetricMode =
  | 'COST_RATIO'
  | 'MARKETING'
  | 'SALES'
  | 'SALES_COUNT';

const PERIOD_OPTIONS = [
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
  { label: '件数', value: 'ORDER' },
];

const PLATFORM_VISUAL_METRIC_OPTIONS = [
  { label: '销售额', value: 'SALES' },
  { label: '销售件数', value: 'SALES_COUNT' },
  { label: '推广费', value: 'MARKETING' },
  { label: '推广费比', value: 'COST_RATIO' },
];

const ABNORMAL_RANKING_OPTIONS = [
  { label: '销售额下降', value: 'SALES_DROP' },
  { label: '费比上升', value: 'COST_RATIO_RISE' },
  { label: '件数增长', value: 'COUNT_GROWTH' },
];

const METRIC_DESCRIPTIONS = {
  avgOrderValue: '客单价 = 实际销售额 / 真实订单数，用于观察订单质量。',
  brushRatio:
    '刷单占比 = 刷单金额 / 实际销售额，用于识别刷单对经营口径的影响。',
  costRatio: '费比 = 营销费用 / 实际销售额，越高说明获客成本压力越大。',
  refundRatio:
    '退款率：淘宝/抖音/小红书按退款金额 / 成交额(GMV)，其他平台按退款金额 / 支付金额，用于观察退款风险。',
  roi: '投产比 = 实际销售额 / 营销费用，越高说明投放效率越好。',
  salesAmount: '实际销售额使用主表真实净销售额，已剔除刷单金额影响。',
} satisfies Record<string, string>;

const MATRIX_VIEW_DESCRIPTIONS = {
  COST_RATIO: '费比 = 营销费用 / 实际销售额 × 100%。',
  MARKETING: '营销费 = 各平台推广投放费用汇总。',
  ORDER: '销售件数当前按真实订单数统计 = 已支付订单数 - 刷单单量。',
  REFUND:
    '退款 = 退款金额；退款率：淘宝/抖音/小红书按退款金额 / 成交额(GMV)，其他平台按退款金额 / 支付金额。',
  SALES: METRIC_DESCRIPTIONS.salesAmount,
  SUMMARY: '综合展示实际销售额、营销费用、费比三项核心指标。',
} satisfies Record<string, string>;

const DAILY_COLUMN_DESCRIPTIONS = {
  costRatio: MATRIX_VIEW_DESCRIPTIONS.COST_RATIO,
  marketingCost: MATRIX_VIEW_DESCRIPTIONS.MARKETING,
  periodLabel: '日期：当前抽屉内按日聚合展示。',
  realOrderCount: MATRIX_VIEW_DESCRIPTIONS.ORDER,
  refundAmount: '退款金额：当前日期店铺退款金额汇总。',
  salesAmount: METRIC_DESCRIPTIONS.salesAmount,
} satisfies Record<string, string>;

function tableHeader(label: string, description: string) {
  return () =>
    h(
      Tooltip,
      { title: description },
      {
        default: () =>
          h('span', { class: 'summary-table-header-help' }, [
            label,
            h('span', { class: 'summary-table-header-icon' }, '?'),
          ]),
      },
    );
}

const filters = reactive({
  channelType: 'ALL',
  hideEmptyPeriod: true,
  periodType: 'WEEK',
  platformCode: '',
  shopNames: [] as string[],
  statDate: [
    dayjs().startOf('year').format('YYYY-MM-DD'),
    dayjs().format('YYYY-MM-DD'),
  ] as FdmDateRange,
});

const loading = ref(false);
const exporting = ref(false);
const compareExporting = ref(false);
const summary = ref<Summary>({
  periods: [],
  rows: [],
  shops: [],
});
const weeklyCompareExporting = ref(false);
const weeklyCompareLoading = ref(false);
const weeklyCompareSummary = ref<Summary>({
  periods: [],
  rows: [],
  shops: [],
});
const viewMode = ref('SUMMARY');
const platformVisualMetricMode = ref<PlatformVisualMetricMode>('SALES');
const abnormalRankingMode = ref<AbnormalRankingMode>('SALES_DROP');
const showAllShops = ref(false);
const shopNameOptions = ref<{ label: string; value: string }[]>([]);
const dailyDrawerOpen = ref(false);
const dailyLoading = ref(false);
const dailyRows = ref<SummaryRow[]>([]);
const dailyDrawerTitle = ref('');
const periodComparePage = ref(1);
const periodComparePageSize = ref(12);
const platformComparePage = ref(1);
const platformComparePageSize = ref(12);
const shopComparePage = ref(1);
const shopComparePageSize = ref(12);
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

function signedPercentText(value: null | number | undefined): string {
  if (value === null || value === undefined) return '-';
  return `${round2(value).toLocaleString('zh-CN', {
    maximumFractionDigits: 2,
    minimumFractionDigits: 2,
  })}%`;
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

function startOfIsoWeek(value = dayjs()) {
  const weekdayOffset = (value.day() + 6) % 7;
  return value.startOf('day').subtract(weekdayOffset, 'day');
}

const weeklyComparePeriods = computed(() => {
  const currentWeekStart = startOfIsoWeek();
  const previousStart = currentWeekStart.subtract(2, 'week');
  const previousEnd = currentWeekStart.subtract(8, 'day');
  const currentStart = currentWeekStart.subtract(1, 'week');
  const currentEnd = currentWeekStart.subtract(1, 'day');
  return {
    current: {
      endDate: currentEnd.format('YYYY-MM-DD'),
      label: '上周',
      startDate: currentStart.format('YYYY-MM-DD'),
    },
    previous: {
      endDate: previousEnd.format('YYYY-MM-DD'),
      label: '上上周',
      startDate: previousStart.format('YYYY-MM-DD'),
    },
  };
});

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

function buildWeeklyCompareParams() {
  const periods0 = weeklyComparePeriods.value;
  return {
    channelType: filters.channelType,
    hideEmptyPeriod: false,
    periodType: 'WEEK',
    platformCode: filters.platformCode || undefined,
    shopNames: filters.shopNames.join(',') || undefined,
    statDate: [periods0.previous.startDate, periods0.current.endDate],
  };
}

function maxCompletedPeriodEndDate() {
  const today = dayjs().startOf('day');
  if (filters.periodType === 'MONTH') {
    return today.startOf('month').subtract(1, 'day');
  }
  if (filters.periodType === 'WEEK') {
    return startOfIsoWeek(today).subtract(1, 'day');
  }
  return today.subtract(1, 'day');
}

function buildExportParams() {
  const params = buildParams();
  const [startDate, endDate] = params.statDate;
  const start = dayjs(startDate);
  const selectedEnd = dayjs(endDate);
  const maxCompletedEnd = maxCompletedPeriodEndDate();
  const exportEnd = selectedEnd.isAfter(maxCompletedEnd, 'day')
    ? maxCompletedEnd
    : selectedEnd;
  if (exportEnd.isBefore(start, 'day')) return undefined;
  return {
    ...params,
    statDate: [startDate, exportEnd.format('YYYY-MM-DD')],
  };
}

async function loadSummary() {
  loading.value = true;
  weeklyCompareLoading.value = true;
  try {
    const [summaryData, weeklyCompareData] = await Promise.all([
      getEcShopDailySummary(buildParams()),
      getEcShopDailySummary(buildWeeklyCompareParams()),
    ]);
    summary.value = summaryData;
    weeklyCompareSummary.value = weeklyCompareData;
    if (summary.value.startDate && summary.value.endDate) {
      filters.statDate = normalizeDateRangeValue([
        summary.value.startDate,
        summary.value.endDate,
      ]);
    }
  } finally {
    loading.value = false;
    weeklyCompareLoading.value = false;
  }
}

async function handleExport() {
  const params = buildExportParams();
  if (!params) {
    message.warning('当前筛选范围内暂无已完成周期数据可导出');
    return;
  }
  exporting.value = true;
  try {
    const data = await exportEcShopDailySummary(params);
    downloadFileFromBlobPart({
      fileName: `店铺经营汇总分析_${periodTypeLabel.value}.xls`,
      source: data,
    });
  } finally {
    exporting.value = false;
  }
}

function escapeExcelCell(value: unknown): string {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

function weeklyCompareExportColumnTitle(column: WeeklyCompareColumn): string {
  return column.platformLabel
    ? `${column.title}（${column.platformLabel}）`
    : column.title;
}

function plainExcelNumberText(value: unknown): string {
  if (value === null || value === undefined || value === '') return '-';
  return String(round2(value));
}

function plainExcelPercentText(value: null | number | undefined): string {
  if (value === null || value === undefined) return '-';
  return `${plainExcelNumberText(value)}%`;
}

function weeklyCompareExportCellValue(
  rowKey: WeeklyCompareRowKey,
  column: WeeklyCompareColumn,
) {
  const previous = weeklyMetric('previous', column);
  const current = weeklyMetric('current', column);
  switch (rowKey) {
    case 'costRatioDelta': {
      return plainExcelPercentText(
        ratioDelta(current?.costRatio, previous?.costRatio),
      );
    }
    case 'currentCostRatio': {
      return plainExcelPercentText(current?.costRatio);
    }
    case 'currentMarketingCost': {
      return plainExcelNumberText(current?.marketingCost);
    }
    case 'currentSales': {
      return plainExcelNumberText(current?.salesAmount);
    }
    case 'previousCostRatio': {
      return plainExcelPercentText(previous?.costRatio);
    }
    case 'previousMarketingCost': {
      return plainExcelNumberText(previous?.marketingCost);
    }
    case 'previousSales': {
      return plainExcelNumberText(previous?.salesAmount);
    }
    case 'salesGrowth': {
      return plainExcelPercentText(
        growthPercent(current?.salesAmount, previous?.salesAmount),
      );
    }
    default: {
      return '-';
    }
  }
}

function buildWeeklyCompareExcelHtml() {
  const columns = weeklyCompareColumns.value;
  const comparePeriods = weeklyComparePeriods.value;
  const title = '近两周店铺对比';
  const rangeText =
    `${comparePeriods.previous.label} ${comparePeriods.previous.startDate} ~ ${comparePeriods.previous.endDate}` +
    ` 对比 ${comparePeriods.current.label} ${comparePeriods.current.startDate} ~ ${comparePeriods.current.endDate}`;
  const headerCells = [
    '店铺',
    ...columns.map((column) => weeklyCompareExportColumnTitle(column)),
  ]
    .map((cell) => `<th>${escapeExcelCell(cell)}</th>`)
    .join('');
  const bodyRows = weeklyCompareDisplayRows
    .map((row) => {
      const cells = [
        row.label,
        ...columns.map((column) =>
          weeklyCompareExportCellValue(row.key, column),
        ),
      ]
        .map((cell) => `<td>${escapeExcelCell(cell)}</td>`)
        .join('');
      return `<tr>${cells}</tr>`;
    })
    .join('');
  return `\uFEFF<html>
  <head>
    <meta charset="utf-8" />
    <style>
      table { border-collapse: collapse; font-family: Arial, "Microsoft YaHei", sans-serif; }
      th, td { border: 1px solid #999; padding: 6px 8px; text-align: center; white-space: nowrap; }
      th { background: #facc15; font-weight: 700; }
      .title { font-size: 16px; font-weight: 700; text-align: left; }
      .range { color: #666; text-align: left; }
    </style>
  </head>
  <body>
    <table>
      <tr><td class="title" colspan="${columns.length + 1}">${escapeExcelCell(title)}</td></tr>
      <tr><td class="range" colspan="${columns.length + 1}">${escapeExcelCell(rangeText)}</td></tr>
      <tr>${headerCells}</tr>
      ${bodyRows}
    </table>
  </body>
</html>`;
}

function handleWeeklyCompareExport() {
  if (weeklyCompareRowsRaw.value.length === 0) return;
  weeklyCompareExporting.value = true;
  try {
    const comparePeriods = weeklyComparePeriods.value;
    const blob = new Blob([buildWeeklyCompareExcelHtml()], {
      type: 'application/vnd.ms-excel;charset=utf-8',
    });
    downloadFileFromBlobPart({
      fileName: `近两周店铺对比_${comparePeriods.previous.startDate}_${comparePeriods.current.endDate}.xls`,
      source: blob,
    });
  } finally {
    weeklyCompareExporting.value = false;
  }
}

function handleReset() {
  filters.channelType = 'ALL';
  filters.periodType = 'WEEK';
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
const weeklyCompareRowsRaw = computed(() => weeklyCompareSummary.value.rows ?? []);
const weeklyCompareShops = computed(() => weeklyCompareSummary.value.shops ?? []);

const weeklyCompareColumns = computed<WeeklyCompareColumn[]>(() =>
  weeklyCompareShops.value.map((shop) => ({
    key: shop.shopKey,
    platformLabel: shop.platformLabel,
    shop,
    title: shop.shopName,
  })),
);

const weeklyCompareDisplayRows: WeeklyCompareRow[] = [
  { key: 'previousSales', label: '上上周' },
  { key: 'currentSales', label: '上周' },
  { className: 'is-emphasis', key: 'salesGrowth', label: '环比' },
  { key: 'previousMarketingCost', label: '上上周营销费用' },
  { key: 'currentMarketingCost', label: '上周营销费用' },
  { key: 'previousCostRatio', label: '上上周费比' },
  { key: 'currentCostRatio', label: '上周费比' },
  { className: 'is-emphasis', key: 'costRatioDelta', label: '幅度' },
];

const visibleShops = computed(() => {
  if (showAllShops.value || filters.shopNames.length > 0) return shops.value;
  return shops.value.slice(0, 12);
});

const matrixHeaderTitle = computed(() => {
  const option = VIEW_MODE_OPTIONS.find(
    (item) => item.value === viewMode.value,
  );
  const description =
    MATRIX_VIEW_DESCRIPTIONS[
      viewMode.value as keyof typeof MATRIX_VIEW_DESCRIPTIONS
    ] ?? '';
  return `${option?.label ?? '综合'}：${description}`;
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
  const platforms = PLATFORM_OPTIONS.filter((item) => item.value).map(
    (item) => ({
      key: `PLATFORM:${item.value}`,
      label: item.label,
      platformCode: item.value || undefined,
    }),
  );
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
    refundBaseAmount: 0,
    paidOrderCount: 0,
    realOrderCount: 0,
    refundAmount: 0,
    refundOrderCount: 0,
    salesAmount: 0,
  };
  for (const item of list) {
    const platformCode = String(item.platformCode ?? '')
      .trim()
      .toUpperCase();
    metric.salesAmount = round2(n(metric.salesAmount) + n(item.salesAmount));
    metric.marketingCost = round2(
      n(metric.marketingCost) + n(item.marketingCost),
    );
    metric.paidAmount = round2(n(metric.paidAmount) + n(item.paidAmount));
    metric.refundBaseAmount = round2(
      n(metric.refundBaseAmount) +
        (['DOUYIN', 'TAOBAO', 'TMALL', 'XHS'].includes(platformCode)
          ? n(item.gmvAmount)
          : n(item.paidAmount)),
    );
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
  metric.costRatio =
    divPercent(n(metric.marketingCost), n(metric.salesAmount)) ?? undefined;
  metric.refundRatio =
    divPercent(n(metric.refundAmount), n(metric.refundBaseAmount)) ?? undefined;
  metric.brushRatio =
    divPercent(n(metric.brushAmount), n(metric.salesAmount)) ?? undefined;
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

function growthPercent(current: unknown, previous: unknown): null | number {
  const previousValue = n(previous);
  if (previousValue === 0) return null;
  return round2(((n(current) - previousValue) / previousValue) * 100);
}

function ratioDelta(
  current: null | number | undefined,
  previous: null | number | undefined,
): null | number {
  if (current === null || current === undefined) return null;
  if (previous === null || previous === undefined) return null;
  return round2(n(current) - n(previous));
}

function isDateRangeOverlap(
  row: SummaryRow,
  range: { endDate: string; startDate: string },
) {
  const rowStart = normalizeDateValue(row.startDate);
  const rowEnd = normalizeDateValue(row.endDate);
  return Boolean(
    rowStart &&
      rowEnd &&
      rowStart <= range.endDate &&
      rowEnd >= range.startDate,
  );
}

function weeklyRowsInPeriod(periodKey: WeeklyComparePeriodKey) {
  const range = weeklyComparePeriods.value[periodKey];
  return weeklyCompareRowsRaw.value.filter((row) =>
    isDateRangeOverlap(row, range),
  );
}

function weeklyMetric(
  periodKey: WeeklyComparePeriodKey,
  column: WeeklyCompareColumn,
): SummaryMetric | undefined {
  return weeklyRowsInPeriod(periodKey).find(
    (row) => row.shopKey === column.shop.shopKey,
  );
}

function weeklyCompareColumnClasses() {
  return [];
}

function weeklyCompareColumnTitle(column: WeeklyCompareColumn) {
  return `${column.platformLabel} · ${column.title}`;
}

function weeklyCompareCellValue(
  rowKey: WeeklyCompareRowKey,
  column: WeeklyCompareColumn,
) {
  const previous = weeklyMetric('previous', column);
  const current = weeklyMetric('current', column);
  switch (rowKey) {
    case 'costRatioDelta': {
      return signedPercentText(
        ratioDelta(current?.costRatio, previous?.costRatio),
      );
    }
    case 'currentCostRatio': {
      return percentText(current?.costRatio);
    }
    case 'currentMarketingCost': {
      return moneyTextOrDash(current?.marketingCost);
    }
    case 'currentSales': {
      return moneyTextOrDash(current?.salesAmount);
    }
    case 'previousCostRatio': {
      return percentText(previous?.costRatio);
    }
    case 'previousMarketingCost': {
      return moneyTextOrDash(previous?.marketingCost);
    }
    case 'previousSales': {
      return moneyTextOrDash(previous?.salesAmount);
    }
    case 'salesGrowth': {
      return signedPercentText(
        growthPercent(current?.salesAmount, previous?.salesAmount),
      );
    }
    default: {
      return '-';
    }
  }
}

function weeklyCompareCellClass(
  rowKey: WeeklyCompareRowKey,
  column: WeeklyCompareColumn,
) {
  const columnClasses = weeklyCompareColumnClasses();
  if (rowKey !== 'salesGrowth' && rowKey !== 'costRatioDelta') {
    return columnClasses;
  }
  const previous = weeklyMetric('previous', column);
  const current = weeklyMetric('current', column);
  const value =
    rowKey === 'salesGrowth'
      ? growthPercent(current?.salesAmount, previous?.salesAmount)
      : ratioDelta(current?.costRatio, previous?.costRatio);
  if (value === null || value === undefined) {
    return columnClasses;
  }
  return [
    ...columnClasses,
    value > 0 ? 'is-positive' : '',
    value < 0 ? 'is-negative' : '',
  ];
}

const periodTypeLabel = computed(() =>
  filters.periodType === 'MONTH' ? '月数据' : '周数据',
);

const compareBasisText = computed(() =>
  filters.periodType === 'MONTH' ? '与上月对比' : '与上周对比',
);

function periodRangeText(period: SummaryPeriod): string {
  if (!period.startDate || !period.endDate) return '-';
  return `${period.startDate} ~ ${period.endDate}`;
}

function previousPeriod(periodKey: string): SummaryPeriod | undefined {
  const index = periods.value.findIndex((item) => item.periodKey === periodKey);
  return index > 0 ? periods.value[index - 1] : undefined;
}

function aggregateMetricsOrUndefined(
  list: SummaryRow[],
): SummaryMetric | undefined {
  return list.length === 0 ? undefined : aggregateMetrics(list);
}

function rowsForPlatform(periodKey: string, platformCode?: string) {
  return (rowsByPeriod.value.get(periodKey) ?? []).filter(
    (row) => row.platformCode === platformCode,
  );
}

function compareGrowthText(current: unknown, previous: unknown): string {
  return signedPercentText(growthPercent(current, previous));
}

function signedPointText(value: null | number | undefined): string {
  if (value === null || value === undefined) return '-';
  let direction = '持平';
  if (value > 0) {
    direction = '上升';
  } else if (value < 0) {
    direction = '下降';
  }
  return `${direction} ${Math.abs(round2(value)).toLocaleString('zh-CN', {
    maximumFractionDigits: 2,
    minimumFractionDigits: 2,
  })} 个点`;
}

function compareValueClass(value: null | number | undefined) {
  if (value === null || value === undefined || value === 0) return '';
  return value > 0 ? 'compare-up' : 'compare-down';
}

function renderCompareText(
  text: string,
  value: null | number | undefined,
) {
  return h('span', { class: compareValueClass(value) }, text);
}

function naturalPeriodEnd(period: SummaryPeriod): string | undefined {
  const startDate = normalizeDateValue(period.startDate);
  const endDate = normalizeDateValue(period.endDate);
  if (!startDate) return endDate;
  const start = dayjs(startDate);
  if (!start.isValid()) return endDate;
  if (filters.periodType === 'MONTH') return start.endOf('month').format('YYYY-MM-DD');
  if (filters.periodType === 'WEEK') return start.add(6, 'day').format('YYYY-MM-DD');
  return endDate;
}

function isCompletedPeriod(period: SummaryPeriod): boolean {
  const endDate = naturalPeriodEnd(period);
  if (!endDate) return false;
  return dayjs(endDate).isBefore(dayjs().startOf('day'), 'day');
}

const completedPeriods = computed(() =>
  periods.value.filter((period) => isCompletedPeriod(period)),
);

const completedPeriodKeys = computed(
  () => new Set(completedPeriods.value.map((period) => period.periodKey)),
);

const periodCompareRows = computed<CompareTableRow[]>(() =>
  completedPeriods.value.map((period) => {
    const previous = previousPeriod(period.periodKey);
    return {
      current: periodMetric(period.periodKey),
      dateRange: periodRangeText(period),
      key: `PERIOD:${period.periodKey}`,
      periodKey: period.periodKey,
      periodLabel: period.periodLabel,
      previous: previous ? periodMetric(previous.periodKey) : undefined,
    };
  }),
);

const platformCompareRows = computed<CompareTableRow[]>(() => {
  const result: CompareTableRow[] = [];
  for (const period of completedPeriods.value) {
    const previous = previousPeriod(period.periodKey);
    const platformCodes = [
      ...new Set(
        (rowsByPeriod.value.get(period.periodKey) ?? [])
          .map((row) => row.platformCode)
          .filter(Boolean),
      ),
    ];
    for (const platformCode of platformCodes) {
      result.push({
        current: aggregateMetrics(rowsForPlatform(period.periodKey, platformCode)),
        dateRange: periodRangeText(period),
        key: `PLATFORM:${period.periodKey}:${platformCode}`,
        periodKey: period.periodKey,
        periodLabel: period.periodLabel,
        platformLabel:
          PLATFORM_OPTIONS.find((item) => item.value === platformCode)?.label ??
          platformCode,
        previous: previous
          ? aggregateMetricsOrUndefined(
              rowsForPlatform(previous.periodKey, platformCode),
            )
          : undefined,
      });
    }
  }
  return result;
});

const shopCompareRows = computed<CompareTableRow[]>(() =>
  rows.value
    .filter((row) => completedPeriodKeys.value.has(row.periodKey))
    .map((row) => {
      const previous = previousPeriod(row.periodKey);
      const previousRow = previous
        ? rowsByPeriodShop.value.get(`${previous.periodKey}|${row.shopKey}`)
        : undefined;
      return {
        current: row,
        dateRange: `${row.startDate ?? '-'} ~ ${row.endDate ?? '-'}`,
        key: `SHOP:${row.periodKey}:${row.shopKey}`,
        periodKey: row.periodKey,
        periodLabel: row.periodLabel,
        platformLabel: row.platformLabel,
        previous: previousRow,
        shopName: row.shopName,
      };
    }),
);

function boundedPage(page: number, total: number, pageSize: number) {
  return Math.min(Math.max(page, 1), Math.max(Math.ceil(total / pageSize), 1));
}

function buildComparePagination(
  current: number,
  pageSize: number,
  total: number,
): TablePaginationConfig {
  return {
    current: boundedPage(current, total, pageSize),
    pageSize,
    showSizeChanger: true,
    showTotal: (value) => `共 ${value} 条`,
    total,
  };
}

const periodComparePagination = computed(() =>
  buildComparePagination(
    periodComparePage.value,
    periodComparePageSize.value,
    periodCompareRows.value.length,
  ),
);

const platformComparePagination = computed(() =>
  buildComparePagination(
    platformComparePage.value,
    platformComparePageSize.value,
    platformCompareRows.value.length,
  ),
);

const shopComparePagination = computed(() =>
  buildComparePagination(
    shopComparePage.value,
    shopComparePageSize.value,
    shopCompareRows.value.length,
  ),
);

function handlePeriodCompareTableChange(pagination: TablePaginationConfig) {
  periodComparePage.value = pagination.current ?? 1;
  periodComparePageSize.value = pagination.pageSize ?? 12;
}

function handlePlatformCompareTableChange(pagination: TablePaginationConfig) {
  platformComparePage.value = pagination.current ?? 1;
  platformComparePageSize.value = pagination.pageSize ?? 12;
}

function handleShopCompareTableChange(pagination: TablePaginationConfig) {
  shopComparePage.value = pagination.current ?? 1;
  shopComparePageSize.value = pagination.pageSize ?? 12;
}

const latestPeriod = computed<SummaryPeriod | undefined>(() =>
  completedPeriods.value.length > 0
    ? completedPeriods.value[completedPeriods.value.length - 1]
    : undefined,
);

const previousSelectedPeriod = computed<SummaryPeriod | undefined>(() =>
  completedPeriods.value.length > 1
    ? completedPeriods.value[completedPeriods.value.length - 2]
    : undefined,
);

function platformLabelOf(platformCode?: string): string {
  return (
    PLATFORM_OPTIONS.find((item) => item.value === platformCode)?.label ??
    platformCode ??
    '未知平台'
  );
}

const platformVisualRows = computed<PlatformVisualRow[]>(() => {
  const currentPeriod = latestPeriod.value;
  if (!currentPeriod) return [];
  const previous = previousSelectedPeriod.value;
  const platformCodes = new Set<string>();
  for (const row of rowsByPeriod.value.get(currentPeriod.periodKey) ?? []) {
    if (row.platformCode) platformCodes.add(row.platformCode);
  }
  if (previous) {
    for (const row of rowsByPeriod.value.get(previous.periodKey) ?? []) {
      if (row.platformCode) platformCodes.add(row.platformCode);
    }
  }
  return [...platformCodes].map((platformCode) => ({
    current: aggregateMetrics(rowsForPlatform(currentPeriod.periodKey, platformCode)),
    key: platformCode,
    platformCode,
    platformLabel: platformLabelOf(platformCode),
    previous: previous
      ? aggregateMetricsOrUndefined(rowsForPlatform(previous.periodKey, platformCode))
      : undefined,
  }));
});

const shopDiagnosticRows = computed<ShopDiagnosticRow[]>(() =>
  shopCompareRows.value
    .filter((row) => row.periodKey === latestPeriod.value?.periodKey)
    .map((row) => ({
      costRatioDelta: ratioDelta(
        row.current.costRatio,
        row.previous?.costRatio,
      ),
      key: row.key,
      platformLabel: row.platformLabel,
      realOrderCountGrowth: growthPercent(
        row.current.realOrderCount,
        row.previous?.realOrderCount,
      ),
      salesAmount: n(row.current.salesAmount),
      salesGrowth: growthPercent(
        row.current.salesAmount,
        row.previous?.salesAmount,
      ),
      shopName: row.shopName ?? '',
    })),
);

const costRatioHeatmapShops = computed(() => {
  const salesMap = new Map<string, number>();
  for (const row of rows.value) {
    salesMap.set(
      row.shopKey,
      round2(n(salesMap.get(row.shopKey)) + n(row.salesAmount)),
    );
  }
  return shops.value
    .toSorted(
      (a, b) =>
        n(salesMap.get(b.shopKey) ?? b.salesAmount) -
        n(salesMap.get(a.shopKey) ?? a.salesAmount),
    )
    .slice(0, 20);
});

type CompareColumn = TableColumnsType<CompareTableRow>[number];

function buildCompareColumns(
  extraColumns: CompareColumn[] = [],
): CompareColumn[] {
  return [
    {
      dataIndex: 'periodLabel',
      fixed: 'left',
      title: '周期',
      width: 130,
    },
    {
      customRender: ({ record }) => record.dateRange,
      fixed: 'left',
      key: 'dateRange',
      title: '日期范围',
      width: 190,
    },
    ...extraColumns,
    {
      customRender: ({ record }) => moneyTextOrDash(record.current.salesAmount),
      key: 'salesAmount',
      title: '销售额',
      width: 120,
    },
    {
      customRender: ({ record }) =>
        moneyTextOrDash(record.previous?.salesAmount),
      key: 'previousSalesAmount',
      title: '上期销售额',
      width: 120,
    },
    {
      customRender: ({ record }) => {
        const value = growthPercent(
          record.current.salesAmount,
          record.previous?.salesAmount,
        );
        return renderCompareText(signedPercentText(value), value);
      },
      key: 'salesGrowth',
      title: '销售额环比',
      width: 120,
    },
    {
      customRender: ({ record }) => intText(record.current.realOrderCount),
      key: 'realOrderCount',
      title: '销售件数',
      width: 110,
    },
    {
      customRender: ({ record }) =>
        record.previous ? intText(record.previous.realOrderCount) : '-',
      key: 'previousRealOrderCount',
      title: '上期销售件数',
      width: 125,
    },
    {
      customRender: ({ record }) => {
        const value = growthPercent(
          record.current.realOrderCount,
          record.previous?.realOrderCount,
        );
        return renderCompareText(
          compareGrowthText(
            record.current.realOrderCount,
            record.previous?.realOrderCount,
          ),
          value,
        );
      },
      key: 'realOrderCountGrowth',
      title: '件数环比',
      width: 110,
    },
    {
      customRender: ({ record }) =>
        moneyTextOrDash(record.current.marketingCost),
      key: 'marketingCost',
      title: '推广费',
      width: 115,
    },
    {
      customRender: ({ record }) =>
        moneyTextOrDash(record.previous?.marketingCost),
      key: 'previousMarketingCost',
      title: '上期推广费',
      width: 115,
    },
    {
      customRender: ({ record }) => {
        const value = growthPercent(
          record.current.marketingCost,
          record.previous?.marketingCost,
        );
        return renderCompareText(signedPercentText(value), value);
      },
      key: 'marketingCostGrowth',
      title: '推广费环比',
      width: 120,
    },
    {
      customRender: ({ record }) => percentText(record.current.costRatio),
      key: 'costRatio',
      title: '推广费比',
      width: 110,
    },
    {
      customRender: ({ record }) => percentText(record.previous?.costRatio),
      key: 'previousCostRatio',
      title: '上期费比',
      width: 110,
    },
    {
      customRender: ({ record }) => {
        const value = ratioDelta(
          record.current.costRatio,
          record.previous?.costRatio,
        );
        return renderCompareText(signedPointText(value), value);
      },
      key: 'costRatioDelta',
      title: '费比变化',
      width: 140,
    },
  ];
}

const periodCompareColumns = computed(() => buildCompareColumns());
const platformCompareColumns = computed(() =>
  buildCompareColumns([
    {
      dataIndex: 'platformLabel',
      fixed: 'left',
      title: '平台',
      width: 120,
    },
  ]),
);
const shopCompareColumns = computed(() =>
  buildCompareColumns([
    {
      dataIndex: 'platformLabel',
      fixed: 'left',
      title: '平台',
      width: 110,
    },
    {
      dataIndex: 'shopName',
      fixed: 'left',
      title: '店铺',
      width: 190,
    },
  ]),
);

function plainExcelPointText(value: null | number | undefined): string {
  return value === null || value === undefined ? '-' : plainExcelNumberText(value);
}

function costRatioDirectionText(value: null | number | undefined): string {
  if (value === null || value === undefined || value === 0) return '持平';
  return value > 0 ? '上升' : '下降';
}

function buildCoreCompareExportRows(): CoreCompareExportRow[] {
  return [
    ...periodCompareRows.value.map((row) => ({
      layer: '周期合计',
      row,
    })),
    ...platformCompareRows.value.map((row) => ({
      layer: '平台汇总',
      platformLabel: row.platformLabel,
      row,
    })),
    ...shopCompareRows.value.map((row) => ({
      layer: '店铺明细',
      platformLabel: row.platformLabel,
      row,
      shopName: row.shopName,
    })),
  ];
}

function coreCompareExportCellValues(item: CoreCompareExportRow): string[] {
  const { row } = item;
  const salesGrowth = growthPercent(
    row.current.salesAmount,
    row.previous?.salesAmount,
  );
  const realOrderCountGrowth = growthPercent(
    row.current.realOrderCount,
    row.previous?.realOrderCount,
  );
  const marketingCostGrowth = growthPercent(
    row.current.marketingCost,
    row.previous?.marketingCost,
  );
  const costRatioDeltaValue = ratioDelta(
    row.current.costRatio,
    row.previous?.costRatio,
  );
  return [
    item.layer,
    row.periodLabel,
    row.dateRange,
    item.platformLabel ?? '',
    item.shopName ?? '',
    plainExcelNumberText(row.current.salesAmount),
    plainExcelNumberText(row.previous?.salesAmount),
    plainExcelPointText(salesGrowth),
    plainExcelNumberText(row.current.realOrderCount),
    plainExcelNumberText(row.previous?.realOrderCount),
    plainExcelPointText(realOrderCountGrowth),
    plainExcelNumberText(row.current.marketingCost),
    plainExcelNumberText(row.previous?.marketingCost),
    plainExcelPointText(marketingCostGrowth),
    plainExcelNumberText(row.current.costRatio),
    plainExcelNumberText(row.previous?.costRatio),
    plainExcelPointText(costRatioDeltaValue),
    costRatioDirectionText(costRatioDeltaValue),
  ];
}

function buildCoreCompareExcelHtml() {
  const rows0 = buildCoreCompareExportRows();
  const headers = [
    '层级',
    '周期',
    '日期范围',
    '平台',
    '店铺',
    '销售额',
    '上期销售额',
    '销售额环比(%)',
    '销售件数',
    '上期销售件数',
    '件数环比(%)',
    '推广费',
    '上期推广费',
    '推广费环比(%)',
    '推广费比(%)',
    '上期费比(%)',
    '费比变化(百分点)',
    '费比方向',
  ];
  const headerCells = headers
    .map((header) => `<th>${escapeExcelCell(header)}</th>`)
    .join('');
  const bodyRows = rows0
    .map((item) => {
      const cells = coreCompareExportCellValues(item)
        .map((cell) => `<td>${escapeExcelCell(cell)}</td>`)
        .join('');
      return `<tr>${cells}</tr>`;
    })
    .join('');
  return `\uFEFF<html>
  <head>
    <meta charset="utf-8" />
    <style>
      table { border-collapse: collapse; font-family: Arial, "Microsoft YaHei", sans-serif; }
      th, td { border: 1px solid #999; padding: 6px 8px; text-align: center; white-space: nowrap; }
      th { background: #facc15; font-weight: 700; }
      .title { font-size: 16px; font-weight: 700; text-align: left; }
      .range { color: #666; text-align: left; }
    </style>
  </head>
  <body>
    <table>
      <tr><td class="title" colspan="${headers.length}">${escapeExcelCell(`${periodTypeLabel.value}核心对比`)}</td></tr>
      <tr><td class="range" colspan="${headers.length}">${escapeExcelCell(compareBasisText.value)}</td></tr>
      <tr>${headerCells}</tr>
      ${bodyRows}
    </table>
  </body>
</html>`;
}

function handleCoreCompareExport() {
  if (buildCoreCompareExportRows().length === 0) return;
  compareExporting.value = true;
  try {
    const blob = new Blob([buildCoreCompareExcelHtml()], {
      type: 'application/vnd.ms-excel;charset=utf-8',
    });
    downloadFileFromBlobPart({
      fileName: `${periodTypeLabel.value}核心对比_${dayjs().format('YYYYMMDDHHmmss')}.xls`,
      source: blob,
    });
  } finally {
    compareExporting.value = false;
  }
}

function periodMetric(
  periodKey: string,
  group?: Partial<SummaryGroup>,
): SummaryMetric {
  let list = rowsByPeriod.value.get(periodKey) ?? [];
  if (group?.channelType) {
    list = list.filter((item) => item.channelType === group.channelType);
  }
  if (group?.platformCode) {
    list = list.filter((item) => item.platformCode === group.platformCode);
  }
  return aggregateMetrics(list);
}

function shopPeriodMetric(
  periodKey: string,
  shop: SummaryShop,
): SummaryRow | undefined {
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
    label: '销售件数 / 客单价',
    sub: `客单价 ¥${amountText(totals.value.avgOrderValue)}`,
    value: intText(totals.value.realOrderCount),
  },
]);

const insightItems = computed(() => {
  const topShop = shops.value[0];
  const highCostCount = rows.value.filter(
    (row) => n(row.costRatio) >= 30,
  ).length;
  const highRefundCount = rows.value.filter(
    (row) => n(row.refundRatio) >= 30,
  ).length;
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
      value: topShop
        ? `${topShop.shopName} ${amountText(topShop.salesAmount)}`
        : '-',
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
    xAxis: {
      axisLabel: { rotate: labels.length > 10 ? 35 : 0 },
      data: labels,
      type: 'category',
    },
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

const salesCountChart = computed<ECOption | null>(() => {
  if (periods.value.length === 0) return null;
  const labels = periods.value.map((item) => item.periodLabel);
  const metrics = periods.value.map((item) => periodMetric(item.periodKey));
  return {
    color: ['#0f766e'],
    grid: { bottom: 42, left: 58, right: 28, top: 36 },
    tooltip: { trigger: 'axis' },
    xAxis: {
      axisLabel: { rotate: labels.length > 10 ? 35 : 0 },
      data: labels,
      type: 'category',
    },
    yAxis: { name: '件', type: 'value' },
    series: [
      {
        data: metrics.map((item) => Math.trunc(n(item.realOrderCount))),
        name: '销售件数',
        smooth: true,
        type: 'line',
      },
    ],
  };
});

function platformMetricValue(
  metric: SummaryMetric | undefined,
  mode: PlatformVisualMetricMode,
): number {
  if (!metric) return 0;
  switch (mode) {
    case 'COST_RATIO': {
      return round2(metric.costRatio);
    }
    case 'MARKETING': {
      return round2(metric.marketingCost);
    }
    case 'SALES_COUNT': {
      return Math.trunc(n(metric.realOrderCount));
    }
    default: {
      return round2(metric.salesAmount);
    }
  }
}

const platformMetricTitle = computed(() => {
  return (
    PLATFORM_VISUAL_METRIC_OPTIONS.find(
      (item) => item.value === platformVisualMetricMode.value,
    )?.label ?? '销售额'
  );
});

const platformCompareTitle = computed(() =>
  filters.periodType === 'MONTH'
    ? '平台上月 / 上上月对比'
    : '平台上周 / 上上周对比',
);

const platformMetricAxisName = computed(() => {
  if (platformVisualMetricMode.value === 'COST_RATIO') return '%';
  if (platformVisualMetricMode.value === 'SALES_COUNT') return '件';
  return '金额';
});

const platformCompareChart = computed<ECOption | null>(() => {
  const currentPeriod = latestPeriod.value;
  if (!currentPeriod || platformVisualRows.value.length === 0) return null;
  const previousPeriod = previousSelectedPeriod.value;
  const labels = platformVisualRows.value.map((item) => item.platformLabel);
  return {
    color: ['#94a3b8', '#2563eb'],
    grid: { bottom: 40, left: 58, right: 26, top: 42 },
    legend: { top: 4 },
    tooltip: { trigger: 'axis' },
    xAxis: {
      axisLabel: { interval: 0 },
      data: labels,
      type: 'category',
    },
    yAxis: { name: platformMetricAxisName.value, type: 'value' },
    series: [
      {
        data: platformVisualRows.value.map((item) =>
          platformMetricValue(item.previous, platformVisualMetricMode.value),
        ),
        name: previousPeriod?.periodLabel ?? '上期',
        type: 'bar',
      },
      {
        data: platformVisualRows.value.map((item) =>
          platformMetricValue(item.current, platformVisualMetricMode.value),
        ),
        name: currentPeriod.periodLabel,
        type: 'bar',
      },
    ],
  };
});

const shopDiagnosticChart = computed<ECOption | null>(() => {
  const data = shopDiagnosticRows.value
    .filter(
      (item) =>
        item.salesGrowth !== null &&
        item.costRatioDelta !== null &&
        item.shopName,
    )
    .map((item) => [
      item.salesGrowth,
      item.costRatioDelta,
      item.salesAmount,
      item.shopName,
      item.platformLabel ?? '',
    ]);
  if (data.length === 0) return null;
  return {
    color: ['#2563eb'],
    grid: { bottom: 42, left: 58, right: 30, top: 36 },
    tooltip: {
      formatter: (params: any) => {
        const value = params.value as any[];
        return [
          `${value[4]} · ${value[3]}`,
          `销售额环比：${signedPercentText(value[0] as number)}`,
          `费比变化：${signedPointText(value[1] as number)}`,
          `销售额：¥${amountText(value[2])}`,
        ].join('<br/>');
      },
    },
    xAxis: { name: '销售额环比(%)', type: 'value' },
    yAxis: { name: '费比变化(点)', type: 'value' },
    series: [
      {
        data,
        name: '店铺',
        symbolSize: (value: any[]) =>
          Math.max(8, Math.min(34, Math.sqrt(Math.abs(n(value[2]))) / 12)),
        type: 'scatter',
      },
    ],
  };
});

function abnormalRankingValue(row: ShopDiagnosticRow): null | number {
  switch (abnormalRankingMode.value) {
    case 'COST_RATIO_RISE': {
      return row.costRatioDelta;
    }
    case 'COUNT_GROWTH': {
      return row.realOrderCountGrowth;
    }
    default: {
      return row.salesGrowth;
    }
  }
}

const abnormalRankingTitle = computed(() => {
  return (
    ABNORMAL_RANKING_OPTIONS.find(
      (item) => item.value === abnormalRankingMode.value,
    )?.label ?? '销售额下降'
  );
});

const abnormalRankingRows = computed(() => {
  const rows0 = shopDiagnosticRows.value
    .map((row) => ({ ...row, value: abnormalRankingValue(row) }))
    .filter((row) => row.value !== null && row.shopName);
  if (abnormalRankingMode.value === 'SALES_DROP') {
    return rows0.toSorted((a, b) => n(a.value) - n(b.value)).slice(0, 10);
  }
  return rows0.toSorted((a, b) => n(b.value) - n(a.value)).slice(0, 10);
});

const abnormalRankingChart = computed<ECOption | null>(() => {
  const data = abnormalRankingRows.value.toReversed();
  if (data.length === 0) return null;
  const isCostRatio = abnormalRankingMode.value === 'COST_RATIO_RISE';
  return {
    color: [isCostRatio ? '#dc2626' : '#2563eb'],
    grid: { bottom: 24, left: 160, right: 38, top: 24 },
    tooltip: { trigger: 'axis' },
    xAxis: { name: isCostRatio ? '百分点' : '%', type: 'value' },
    yAxis: {
      axisLabel: { width: 140, overflow: 'truncate' },
      data: data.map((item) => item.shopName),
      type: 'category',
    },
    series: [
      {
        data: data.map((item) => round2(item.value)),
        name: abnormalRankingTitle.value,
        type: 'bar',
      },
    ],
  };
});

const costRatioHeatmapChart = computed<ECOption | null>(() => {
  const heatmapPeriods = completedPeriods.value;
  if (heatmapPeriods.length === 0 || costRatioHeatmapShops.value.length === 0) {
    return null;
  }
  const yShops = costRatioHeatmapShops.value.toReversed();
  const deltas: number[] = [];
  const data: any[] = [];
  for (const [xIndex, period] of heatmapPeriods.entries()) {
    const previous = previousPeriod(period.periodKey);
    for (const [yIndex, shop] of yShops.entries()) {
      const currentRow = rowsByPeriodShop.value.get(
        `${period.periodKey}|${shop.shopKey}`,
      );
      const previousRow = previous
        ? rowsByPeriodShop.value.get(`${previous.periodKey}|${shop.shopKey}`)
        : undefined;
      const delta = ratioDelta(currentRow?.costRatio, previousRow?.costRatio);
      if (delta !== null) deltas.push(Math.abs(delta));
      data.push([xIndex, yIndex, delta ?? 0, delta]);
    }
  }
  const maxDelta = Math.max(5, Math.min(30, Math.ceil(Math.max(...deltas, 0))));
  return {
    grid: { bottom: 72, left: 170, right: 28, top: 36 },
    tooltip: {
      formatter: (params: any) => {
        const value = params.value as any[];
        const period = heatmapPeriods[value[0]];
        const shop = yShops[value[1]];
        return [
          `${period?.periodLabel ?? ''} · ${shop?.platformLabel ?? ''}`,
          shop?.shopName ?? '',
          `费比变化：${signedPointText(value[3] as null | number)}`,
        ].join('<br/>');
      },
    },
    visualMap: {
      calculable: true,
      inRange: { color: ['#15803d', '#f8fafc', '#dc2626'] },
      max: maxDelta,
      min: -maxDelta,
      orient: 'horizontal',
      right: 24,
      top: 0,
    },
    xAxis: {
      axisLabel: { rotate: heatmapPeriods.length > 8 ? 35 : 0 },
      data: heatmapPeriods.map((item) => item.periodLabel),
      splitArea: { show: true },
      type: 'category',
    },
    yAxis: {
      axisLabel: { width: 150, overflow: 'truncate' },
      data: yShops.map((item) => item.shopName),
      splitArea: { show: true },
      type: 'category',
    },
    series: [
      {
        data,
        label: { show: false },
        name: '费比变化',
        type: 'heatmap',
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
  ...(summary.value.rankings?.highRefundRatio ?? [])
    .slice(0, 5)
    .map((item) => ({
      metric: percentText(item.refundRatio),
      reason: '退款率偏高',
      row: item,
    })),
  ...(summary.value.rankings?.zeroSalesWithCost ?? [])
    .slice(0, 5)
    .map((item) => ({
      metric: `¥${amountText(item.marketingCost)}`,
      reason: '零销售有费用',
      row: item,
    })),
]);

const dailyColumns = [
  {
    dataIndex: 'periodLabel',
    title: tableHeader('日期', DAILY_COLUMN_DESCRIPTIONS.periodLabel),
    width: 110,
  },
  {
    dataIndex: 'salesAmount',
    title: tableHeader('实际销售额', DAILY_COLUMN_DESCRIPTIONS.salesAmount),
    customRender: ({ text }: { text: number }) => `¥${fullAmountText(text)}`,
  },
  {
    dataIndex: 'marketingCost',
    title: tableHeader('营销费用', DAILY_COLUMN_DESCRIPTIONS.marketingCost),
    customRender: ({ text }: { text: number }) => `¥${fullAmountText(text)}`,
  },
  {
    dataIndex: 'costRatio',
    title: tableHeader('费比', DAILY_COLUMN_DESCRIPTIONS.costRatio),
    customRender: ({ text }: { text: number }) => percentText(text),
  },
  {
    dataIndex: 'refundAmount',
    title: tableHeader('退款金额', DAILY_COLUMN_DESCRIPTIONS.refundAmount),
    customRender: ({ text }: { text: number }) => `¥${fullAmountText(text)}`,
  },
  {
    dataIndex: 'realOrderCount',
    title: tableHeader('真实订单', DAILY_COLUMN_DESCRIPTIONS.realOrderCount),
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
            <p>按周、月查看各店铺销售、投放、退款和销售件数表现</p>
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

        <section class="weekly-compare-panel">
          <div class="matrix-head">
            <div>
              <div class="section-title">近两周店铺对比</div>
              <div class="section-sub">
                {{ weeklyComparePeriods.previous.label }}
                {{ weeklyComparePeriods.previous.startDate }} ~
                {{ weeklyComparePeriods.previous.endDate }} 对比
                {{ weeklyComparePeriods.current.label }}
                {{ weeklyComparePeriods.current.startDate }} ~
                {{ weeklyComparePeriods.current.endDate }}
              </div>
            </div>
            <div class="matrix-tools">
              <Tag color="gold">周环比</Tag>
              <Button
                size="small"
                :disabled="weeklyCompareRowsRaw.length === 0"
                :loading="weeklyCompareExporting"
                @click="handleWeeklyCompareExport"
              >
                导出 Excel
              </Button>
            </div>
          </div>
          <Spin :spinning="weeklyCompareLoading">
            <div
              v-if="weeklyCompareRowsRaw.length === 0"
              class="empty-block weekly-empty"
            >
              近两周暂无可对比店铺数据
            </div>
            <div v-else class="weekly-compare-scroll">
              <table class="weekly-compare-table">
                <thead>
                  <tr>
                    <th class="sticky-col compare-row-label">店铺</th>
                    <th
                      v-for="column in weeklyCompareColumns"
                      :key="column.key"
                      class="weekly-shop-col"
                      :class="weeklyCompareColumnClasses()"
                      :title="weeklyCompareColumnTitle(column)"
                    >
                      <span>{{ column.title }}</span>
                      <em v-if="column.platformLabel">{{
                        column.platformLabel
                      }}</em>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  <tr
                    v-for="row in weeklyCompareDisplayRows"
                    :key="row.key"
                    :class="row.className"
                  >
                    <th class="sticky-col compare-row-label">
                      {{ row.label }}
                    </th>
                    <td
                      v-for="column in weeklyCompareColumns"
                      :key="column.key"
                      :class="weeklyCompareCellClass(row.key, column)"
                    >
                      {{ weeklyCompareCellValue(row.key, column) }}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </Spin>
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
              <div class="chart-title">销售件数趋势</div>
              <EchartsBox :height="330" :option="salesCountChart" />
            </section>
          </Col>
          <Col :xl="12" :xs="24">
            <section class="chart-panel">
              <div class="chart-head">
                <div>
                  <div class="chart-title">
                    {{ platformCompareTitle }}（{{ platformMetricTitle }}）
                  </div>
                  <div class="section-sub">
                    {{ previousSelectedPeriod?.periodLabel || '上期' }} 对比
                    {{ latestPeriod?.periodLabel || '本期' }}
                  </div>
                </div>
                <Segmented
                  v-model:value="platformVisualMetricMode"
                  :options="PLATFORM_VISUAL_METRIC_OPTIONS"
                  size="small"
                />
              </div>
              <EchartsBox :height="330" :option="platformCompareChart" />
            </section>
          </Col>
          <Col :xl="12" :xs="24">
            <section class="chart-panel">
              <div class="chart-title">经营诊断散点图</div>
              <div class="section-sub">
                横轴销售额环比，纵轴费比变化，气泡大小代表销售额
              </div>
              <EchartsBox :height="330" :option="shopDiagnosticChart" />
            </section>
          </Col>
          <Col :xl="12" :xs="24">
            <section class="chart-panel">
              <div class="chart-title">店铺费比变化热力图</div>
              <div class="section-sub">
                红色为费比上升，绿色为费比下降，默认展示销售额 TOP20 店铺
              </div>
              <EchartsBox :height="420" :option="costRatioHeatmapChart" />
            </section>
          </Col>
          <Col :xl="12" :xs="24">
            <section class="chart-panel">
              <div class="chart-head">
                <div>
                  <div class="chart-title">店铺异常排行</div>
                  <div class="section-sub">
                    取本期与上期可比店铺，默认展示 TOP10
                  </div>
                </div>
                <Segmented
                  v-model:value="abnormalRankingMode"
                  :options="ABNORMAL_RANKING_OPTIONS"
                  size="small"
                />
              </div>
              <EchartsBox :height="420" :option="abnormalRankingChart" />
            </section>
          </Col>
        </Row>

        <section class="compare-panel">
          <div class="matrix-head">
            <div>
              <div class="section-title">{{ periodTypeLabel }}核心对比</div>
              <div class="section-sub">
                {{ compareBasisText }}；销售件数按真实订单数统计
              </div>
            </div>
            <div class="matrix-tools">
              <Tag color="gold">{{ compareBasisText }}</Tag>
              <Button
                size="small"
                :disabled="periodCompareRows.length === 0"
                :loading="compareExporting"
                @click="handleCoreCompareExport"
              >
                导出 Excel
              </Button>
            </div>
          </div>

          <div v-if="periodCompareRows.length === 0" class="empty-block">
            当前筛选范围内暂无汇总数据
          </div>
          <div v-else class="compare-table-stack">
            <div class="compare-table-block">
              <div class="compare-table-title">周期合计</div>
              <Table
                :columns="periodCompareColumns"
                :data-source="periodCompareRows"
                :pagination="periodComparePagination"
                :scroll="{ x: 1540 }"
                row-key="key"
                size="small"
                @change="handlePeriodCompareTableChange"
              />
            </div>
            <div class="compare-table-block">
              <div class="compare-table-title">平台汇总</div>
              <Table
                :columns="platformCompareColumns"
                :data-source="platformCompareRows"
                :pagination="platformComparePagination"
                :scroll="{ x: 1660 }"
                row-key="key"
                size="small"
                @change="handlePlatformCompareTableChange"
              />
            </div>
            <div class="compare-table-block">
              <div class="compare-table-title">店铺明细</div>
              <Table
                :columns="shopCompareColumns"
                :data-source="shopCompareRows"
                :pagination="shopComparePagination"
                :scroll="{ x: 1860 }"
                row-key="key"
                size="small"
                @change="handleShopCompareTableChange"
              />
            </div>
          </div>
        </section>

        <section class="risk-panel">
          <div class="section-title">经营风险提醒</div>
          <div v-if="riskRows.length === 0" class="empty-block">
            当前筛选范围内暂无明显风险
          </div>
          <div v-else class="risk-list">
            <div
              v-for="item in riskRows"
              :key="`${item.reason}-${item.row.periodKey}-${item.row.shopKey}`"
              class="risk-item"
            >
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
                  <th
                    class="sticky-col period-col"
                    title="周期：按当前选择的周或月聚合。"
                  >
                    周期
                  </th>
                  <th
                    v-for="group in summaryGroups"
                    :key="group.key"
                    class="summary-col"
                    :title="`${group.label} · ${matrixHeaderTitle}`"
                  >
                    {{ group.label }}
                  </th>
                  <th
                    v-for="shop in visibleShops"
                    :key="shop.shopKey"
                    class="shop-col"
                    :title="`${shop.platformLabel} · ${shop.shopName} · ${matrixHeaderTitle}`"
                  >
                    <span>{{ shop.shopName }}</span>
                    <em>{{ shop.platformLabel }}</em>
                  </th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="period in completedPeriods" :key="period.periodKey">
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
                        ¥{{
                          amountText(
                            periodMetric(period.periodKey, group).salesAmount,
                          )
                        }}
                      </strong>
                      <span>
                        费 ¥{{
                          amountText(
                            periodMetric(period.periodKey, group).marketingCost,
                          )
                        }}
                      </span>
                      <span>
                        比
                        {{
                          percentText(
                            periodMetric(period.periodKey, group).costRatio,
                          )
                        }}
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
                    <div v-if="viewMode === 'SUMMARY'" class="metric-lines">
                      <strong>
                        {{
                          moneyTextOrDash(
                            shopPeriodMetric(period.periodKey, shop)
                              ?.salesAmount,
                          )
                        }}
                      </strong>
                      <span>
                        费
                        {{
                          moneyTextOrDash(
                            shopPeriodMetric(period.periodKey, shop)
                              ?.marketingCost,
                          )
                        }}
                      </span>
                      <span>
                        比
                        {{
                          percentText(
                            shopPeriodMetric(period.periodKey, shop)?.costRatio,
                          )
                        }}
                      </span>
                    </div>
                    <span v-else>
                      {{
                        metricValue(shopPeriodMetric(period.periodKey, shop))
                      }}
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
  gap: 16px;
  align-items: flex-start;
  justify-content: space-between;
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
  font-size: 12px;
  color: hsl(var(--muted-foreground));
}

.page-range {
  font-size: 13px;
  color: hsl(var(--muted-foreground));
  white-space: nowrap;
}

.filter-panel,
.chart-panel,
.compare-panel,
.insight-strip,
.kpi-card,
.matrix-panel,
.risk-panel,
.weekly-compare-panel {
  background: hsl(var(--card));
  border: 1px solid hsl(var(--border));
  border-radius: 8px;
  box-shadow: 0 6px 18px rgb(15 23 42 / 5%);
}

.filter-panel {
  padding: 16px;
  margin-bottom: 16px;
}

.filter-actions {
  display: flex;
  gap: 8px;
  justify-content: flex-end;
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

.kpi-label {
  margin-bottom: 18px;
  font-size: 14px;
  font-weight: 650;
}

.kpi-value {
  overflow: hidden;
  text-overflow: ellipsis;
  font-size: 34px;
  font-weight: 780;
  line-height: 1.12;
  white-space: nowrap;
}

.kpi-sub {
  margin-top: 12px;
  overflow: hidden;
  text-overflow: ellipsis;
  font-size: 12px;
  color: hsl(var(--muted-foreground));
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
  padding: 12px;
  margin-bottom: 16px;
}

.insight {
  display: inline-flex;
  gap: 8px;
  align-items: center;
  min-width: 150px;
  padding: 4px 8px;
  font-size: 12px;
  background: hsl(var(--muted) / 20%);
  border: 1px solid hsl(var(--border) / 70%);
  border-radius: 6px;
}

.chart-panel {
  min-width: 0;
  height: 100%;
  padding: 12px;
}

.chart-head {
  display: flex;
  gap: 12px;
  align-items: flex-start;
  justify-content: space-between;
  margin-bottom: 8px;
}

.chart-head :deep(.ant-segmented) {
  flex-shrink: 0;
}

.chart-title,
.section-title {
  font-size: 15px;
  font-weight: 700;
}

.summary-table-header-help {
  display: inline-flex;
  gap: 4px;
  align-items: center;
  white-space: nowrap;
}

.summary-table-header-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 14px;
  height: 14px;
  font-size: 10px;
  line-height: 1;
  color: hsl(var(--muted-foreground));
  border: 1px solid hsl(var(--border));
  border-radius: 999px;
}

.risk-panel,
.matrix-panel,
.compare-panel,
.weekly-compare-panel {
  padding: 14px;
  margin-bottom: 16px;
}

.compare-table-stack {
  display: grid;
  gap: 14px;
}

.compare-table-block {
  min-width: 0;
}

.compare-table-title {
  margin-bottom: 8px;
  font-size: 13px;
  font-weight: 700;
}

.compare-up {
  color: #b45309;
}

.compare-down {
  color: #dc2626;
}

.weekly-compare-scroll {
  max-height: 420px;
  overflow: auto;
  border: 1px solid hsl(var(--border));
  border-radius: 8px;
}

.weekly-compare-table {
  width: max-content;
  min-width: 100%;
  font-size: 12px;
  border-spacing: 0;
  border-collapse: separate;
}

.weekly-compare-table th,
.weekly-compare-table td {
  height: 32px;
  padding: 6px 8px;
  text-align: center;
  white-space: nowrap;
  background: hsl(var(--card));
  border-right: 1px solid hsl(var(--border));
  border-bottom: 1px solid hsl(var(--border));
}

.weekly-compare-table thead th {
  position: sticky;
  top: 0;
  z-index: 2;
  min-width: 104px;
  max-width: 132px;
  overflow: hidden;
  text-overflow: ellipsis;
  font-weight: 700;
  background: #facc15;
}

.weekly-compare-table thead th span,
.weekly-compare-table thead th em {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
}

.weekly-compare-table thead th em {
  margin-top: 2px;
  font-style: normal;
  font-weight: 500;
}

.weekly-compare-table tbody th {
  font-weight: 650;
  text-align: left;
  background: hsl(var(--muted) / 28%);
}

.weekly-compare-table tbody tr.is-emphasis th,
.weekly-compare-table tbody tr.is-emphasis td {
  background: #fde68a;
}

.weekly-compare-table td.is-positive {
  color: #b45309;
}

.weekly-compare-table td.is-negative {
  color: #dc2626;
}

.compare-row-label {
  left: 0;
  z-index: 3;
  width: 142px;
  min-width: 142px;
  max-width: 142px;
}

.weekly-empty {
  border: 1px solid hsl(var(--border));
  border-radius: 8px;
}

.risk-list {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
  margin-top: 12px;
}

.risk-item {
  display: flex;
  gap: 8px;
  align-items: center;
  min-width: 0;
  padding: 8px 10px;
  border: 1px solid hsl(var(--border) / 70%);
  border-radius: 6px;
}

.risk-main {
  flex: 1;
  min-width: 0;
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
  gap: 16px;
  align-items: flex-start;
  justify-content: space-between;
  margin-bottom: 12px;
}

.matrix-tools {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  justify-content: flex-end;
}

.matrix-scroll {
  height: 560px;
  overflow: auto;
  border: 1px solid hsl(var(--border));
  border-radius: 8px;
}

.summary-matrix {
  width: max-content;
  min-width: 100%;
  font-size: 12px;
  border-spacing: 0;
  border-collapse: separate;
}

.summary-matrix th,
.summary-matrix td {
  background: hsl(var(--card));
  border-right: 1px solid hsl(var(--border));
  border-bottom: 1px solid hsl(var(--border));
}

.summary-matrix thead th {
  position: sticky;
  top: 0;
  z-index: 2;
  height: 54px;
  padding: 8px;
  font-weight: 650;
  white-space: nowrap;
  background: hsl(var(--muted) / 35%);
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
  font-size: 11px;
  font-weight: 400;
  color: hsl(var(--muted-foreground));
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
  font-style: normal;
  font-weight: 400;
  color: hsl(var(--muted-foreground));
}

.metric-cell {
  height: 64px;
  padding: 8px;
  vertical-align: middle;
  white-space: nowrap;
  cursor: default;
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
  font-size: 13px;
  color: #2563eb;
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

  .matrix-scroll {
    height: 420px;
  }
}
</style>
