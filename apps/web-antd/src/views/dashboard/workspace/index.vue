<script lang="ts" setup>
import type { ECOption } from '@vben/plugins/echarts';

import type { FdmdataEcShopDailyApi } from '#/api/fdmdata/ecshopdaily';

import { computed, onActivated, onMounted, ref, watch } from 'vue';
import { useRouter } from 'vue-router';

import { useAccess } from '@vben/access';
import { IconifyIcon } from '@vben/icons';

import { Button, Empty, Segmented, Skeleton, Tag } from 'ant-design-vue';
import dayjs from 'dayjs';

import { getEcShopDailySummary } from '#/api/fdmdata/ecshopdaily';

import EchartsBox from '../../fdmdata/ecshopdaily/modules/echarts-box.vue';

defineOptions({ name: 'CompanyDashboard' });

type RangeKey = 'month' | 'thirtyDays' | 'year';
type SummaryMetric = FdmdataEcShopDailyApi.EcShopDailySummaryMetric;
type SummaryRow = FdmdataEcShopDailyApi.EcShopDailySummaryRow;

interface CompanyMetricCard {
  color: string;
  description: string;
  displayValue: string;
  icon: string;
  key: string;
  title: string;
}

interface DepartmentCard {
  connected: boolean;
  costRatio: null | number;
  description: string;
  icon: string;
  key: string;
  name: string;
  orders: null | number;
  refundRatio: null | number;
  sales: null | number;
  status: string;
  statusColor: string;
  tone: string;
}

interface PeriodAggregate {
  costRatio: null | number;
  label: string;
  marketingCost: number;
  orders: number;
  refundAmount: number;
  salesAmount: number;
}

interface PlatformAggregate {
  label: string;
  marketingCost: number;
  salesAmount: number;
}

interface BusinessAlert {
  description: string;
  icon: string;
  key: string;
  level: 'danger' | 'warning';
  period: string;
  title: string;
  value: string;
}

const router = useRouter();
const { hasAccessByCodes } = useAccess();

const canViewEcData = computed(() =>
  hasAccessByCodes(['fdmdata:ec-shop-daily:query']),
);

const rangeOptions = [
  { label: '本月', value: 'month' },
  { label: '近 30 天', value: 'thirtyDays' },
  { label: '本年', value: 'year' },
];

const activeRange = ref<RangeKey>('year');
const summary = ref<FdmdataEcShopDailyApi.EcShopDailySummary | null>(null);
const loading = ref(false);
const loadFailed = ref(false);
const lastUpdatedAt = ref<null | number>(null);

const selectedDateRange = computed<[string, string]>(() => {
  const today = dayjs();
  if (activeRange.value === 'month') {
    return [
      today.startOf('month').format('YYYY-MM-DD'),
      today.format('YYYY-MM-DD'),
    ];
  }
  if (activeRange.value === 'thirtyDays') {
    return [
      today.subtract(29, 'day').format('YYYY-MM-DD'),
      today.format('YYYY-MM-DD'),
    ];
  }
  return [
    today.startOf('year').format('YYYY-MM-DD'),
    today.format('YYYY-MM-DD'),
  ];
});

const requestPeriodType = computed(() =>
  activeRange.value === 'year' ? 'MONTH' : 'DAY',
);

const rangeTitle = computed(() => {
  const labels: Record<RangeKey, string> = {
    month: '本月经营数据',
    thirtyDays: '近 30 天经营数据',
    year: '本年经营数据',
  };
  return labels[activeRange.value];
});

const rangeDateText = computed(
  () => `${selectedDateRange.value[0]} 至 ${selectedDateRange.value[1]}`,
);

const initialLoading = computed(() => loading.value && !summary.value);
const sourceUnavailable = computed(
  () => !canViewEcData.value || loadFailed.value,
);

const totals = computed(() => summary.value?.totals);

function asNumber(value: unknown): number {
  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? numberValue : 0;
}

function round(value: unknown, digits = 2): number {
  const factor = 10 ** digits;
  return Math.round(asNumber(value) * factor) / factor;
}

function formatMoney(
  value: null | number | undefined,
  compact = false,
): string {
  if (value === null || value === undefined) return '—';
  if (compact && Math.abs(value) >= 10_000) {
    return `¥${(value / 10_000).toLocaleString('zh-CN', {
      maximumFractionDigits: 1,
    })} 万`;
  }
  return `¥${value.toLocaleString('zh-CN', {
    maximumFractionDigits: 2,
    minimumFractionDigits: 0,
  })}`;
}

function formatNumber(value: null | number | undefined): string {
  if (value === null || value === undefined) return '—';
  return Math.trunc(value).toLocaleString('zh-CN');
}

function formatPercent(value: null | number | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return '—';
  }
  return `${value.toFixed(2)}%`;
}

function formatRatio(value: null | number | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return '—';
  }
  return value.toFixed(2);
}

function normalizeDateValue(value: unknown): string {
  if (Array.isArray(value) && value.length >= 3) {
    const [year, month, day] = value;
    return `${String(year).padStart(4, '0')}-${String(month).padStart(
      2,
      '0',
    )}-${String(day).padStart(2, '0')}`;
  }
  const textValue = String(value ?? '').trim();
  if (!textValue) return '';
  const parsed = dayjs(textValue);
  return parsed.isValid() ? parsed.format('YYYY-MM-DD') : textValue;
}

function knownMetricValue(
  metric: SummaryMetric | undefined,
  key: keyof SummaryMetric,
): null | number {
  if (sourceUnavailable.value || !summary.value) return null;
  return asNumber(metric?.[key]);
}

const companyMetricCards = computed<CompanyMetricCard[]>(() => {
  const sales = knownMetricValue(totals.value, 'salesAmount');
  const orders = knownMetricValue(totals.value, 'realOrderCount');
  const marketing = knownMetricValue(totals.value, 'marketingCost');
  const refund = knownMetricValue(totals.value, 'refundAmount');

  return [
    {
      color: '#2563eb',
      description: '当前已接入部门的实际销售额',
      displayValue: formatMoney(sales, true),
      icon: 'lucide:badge-dollar-sign',
      key: 'sales',
      title: '公司实际销售额',
    },
    {
      color: '#7c3aed',
      description: '支付订单扣除刷单订单',
      displayValue: formatNumber(orders),
      icon: 'lucide:shopping-bag',
      key: 'orders',
      title: '真实订单',
    },
    {
      color: '#0f9f6e',
      description: `营销费比 ${formatPercent(
        knownMetricValue(totals.value, 'costRatio'),
      )}`,
      displayValue: formatMoney(marketing, true),
      icon: 'lucide:megaphone',
      key: 'marketing',
      title: '营销费用',
    },
    {
      color: '#ea580c',
      description: `退款率 ${formatPercent(
        knownMetricValue(totals.value, 'refundRatio'),
      )}`,
      displayValue: formatMoney(refund, true),
      icon: 'lucide:rotate-ccw',
      key: 'refund',
      title: '退款金额',
    },
  ];
});

const secondaryMetrics = computed(() => [
  {
    label: '营销费比',
    value: formatPercent(knownMetricValue(totals.value, 'costRatio')),
  },
  {
    label: '退款率',
    value: formatPercent(knownMetricValue(totals.value, 'refundRatio')),
  },
  {
    label: '真实客单价',
    value: formatMoney(knownMetricValue(totals.value, 'avgOrderValue')),
  },
  {
    label: '整体 ROI',
    value: formatRatio(knownMetricValue(totals.value, 'roi')),
  },
  {
    label: '活跃店铺',
    value: sourceUnavailable.value
      ? '—'
      : `${summary.value?.shops?.length ?? 0} 家`,
  },
]);

const ecDepartmentStatus = computed(() => {
  if (!canViewEcData.value) {
    return { color: 'default', text: '暂无查看权限' };
  }
  if (loadFailed.value) {
    return { color: 'error', text: '数据暂不可用' };
  }
  if (loading.value && !summary.value) {
    return { color: 'processing', text: '正在加载' };
  }
  return { color: 'success', text: '已接入' };
});

const departmentCards = computed<DepartmentCard[]>(() => {
  const ecAvailable = !sourceUnavailable.value && !!summary.value;
  return [
    {
      connected: true,
      costRatio: ecAvailable ? asNumber(totals.value?.costRatio) : null,
      description: '店铺后台日汇总 · 全平台',
      icon: 'lucide:shopping-cart',
      key: 'ecommerce',
      name: '电商部门',
      orders: ecAvailable ? asNumber(totals.value?.realOrderCount) : null,
      refundRatio: ecAvailable ? asNumber(totals.value?.refundRatio) : null,
      sales: ecAvailable ? asNumber(totals.value?.salesAmount) : null,
      status: ecDepartmentStatus.value.text,
      statusColor: ecDepartmentStatus.value.color,
      tone: '#2563eb',
    },
    {
      connected: false,
      costRatio: 0,
      description: '销售与订单数据尚未接入',
      icon: 'lucide:store',
      key: 'domestic',
      name: '内贸部门',
      orders: 0,
      refundRatio: 0,
      sales: 0,
      status: '待接入',
      statusColor: 'default',
      tone: '#64748b',
    },
    {
      connected: false,
      costRatio: 0,
      description: '外贸订单与回款数据尚未接入',
      icon: 'lucide:globe-2',
      key: 'foreign',
      name: '外贸部门',
      orders: 0,
      refundRatio: 0,
      sales: 0,
      status: '待接入',
      statusColor: 'default',
      tone: '#64748b',
    },
    {
      connected: false,
      costRatio: 0,
      description: '其他经营部门统一预留',
      icon: 'lucide:building-2',
      key: 'other',
      name: '其他部门',
      orders: 0,
      refundRatio: 0,
      sales: 0,
      status: '待接入',
      statusColor: 'default',
      tone: '#64748b',
    },
  ];
});

function compactPeriodLabel(label: string): string {
  const parsed = dayjs(label);
  if (/^\d{4}-\d{2}-\d{2}$/.test(label) && parsed.isValid()) {
    return parsed.format('MM-DD');
  }
  return label;
}

const periodAggregates = computed<PeriodAggregate[]>(() => {
  const data = summary.value;
  if (!data) return [];

  const buckets = new Map<string, PeriodAggregate>();
  for (const period of data.periods ?? []) {
    buckets.set(period.periodKey, {
      costRatio: null,
      label: compactPeriodLabel(period.periodLabel),
      marketingCost: 0,
      orders: 0,
      refundAmount: 0,
      salesAmount: 0,
    });
  }

  for (const row of data.rows ?? []) {
    const bucket = buckets.get(row.periodKey);
    if (!bucket) continue;
    bucket.salesAmount += asNumber(row.salesAmount);
    bucket.marketingCost += asNumber(row.marketingCost);
    bucket.refundAmount += asNumber(row.refundAmount);
    bucket.orders += asNumber(row.realOrderCount);
  }

  return [...buckets.values()].map((bucket) => ({
    ...bucket,
    costRatio:
      bucket.salesAmount > 0
        ? round((bucket.marketingCost / bucket.salesAmount) * 100)
        : null,
    marketingCost: round(bucket.marketingCost),
    refundAmount: round(bucket.refundAmount),
    salesAmount: round(bucket.salesAmount),
  }));
});

const companyTrendOption = computed<ECOption | null>(() => {
  const rows = periodAggregates.value;
  if (rows.length === 0) return null;
  return {
    color: ['#2563eb', '#14b8a6', '#f59e0b'],
    grid: { bottom: 44, left: 62, right: 58, top: 54 },
    legend: {
      data: ['实际销售额', '营销费用', '营销费比'],
      top: 10,
    },
    series: [
      {
        barMaxWidth: 34,
        data: rows.map((row) => row.salesAmount),
        name: '实际销售额',
        type: 'bar',
      },
      {
        data: rows.map((row) => row.marketingCost),
        name: '营销费用',
        smooth: true,
        symbolSize: 6,
        type: 'line',
      },
      {
        data: rows.map((row) => row.costRatio),
        name: '营销费比',
        smooth: true,
        symbolSize: 5,
        type: 'line',
        yAxisIndex: 1,
      },
    ],
    tooltip: { trigger: 'axis' },
    xAxis: {
      axisLabel: { hideOverlap: true },
      data: rows.map((row) => row.label),
      type: 'category',
    },
    yAxis: [
      {
        axisLabel: {
          formatter: (value: number) =>
            Math.abs(value) >= 10_000
              ? `${round(value / 10_000, 1)}万`
              : `${round(value, 0)}`,
        },
        name: '金额',
        splitLine: { lineStyle: { type: 'dashed' } },
        type: 'value',
      },
      {
        axisLabel: { formatter: (value: number) => `${round(value)}%` },
        name: '费比',
        splitLine: { show: false },
        type: 'value',
      },
    ],
  };
});

const platformAggregates = computed<PlatformAggregate[]>(() => {
  const byPlatform = new Map<string, PlatformAggregate>();
  for (const shop of summary.value?.shops ?? []) {
    const label = shop.platformLabel || shop.platformCode || '未识别平台';
    const item = byPlatform.get(label) ?? {
      label,
      marketingCost: 0,
      salesAmount: 0,
    };
    item.salesAmount += asNumber(shop.salesAmount);
    item.marketingCost += asNumber(shop.marketingCost);
    byPlatform.set(label, item);
  }
  return [...byPlatform.values()]
    .map((item) => ({
      ...item,
      marketingCost: round(item.marketingCost),
      salesAmount: round(item.salesAmount),
    }))
    .filter((item) => item.salesAmount > 0 || item.marketingCost > 0)
    .toSorted((first, second) => second.salesAmount - first.salesAmount)
    .slice(0, 8);
});

const platformContributionOption = computed<ECOption | null>(() => {
  const rows = platformAggregates.value.toReversed();
  if (rows.length === 0) return null;
  return {
    color: ['#2563eb', '#14b8a6'],
    grid: { bottom: 34, left: 74, right: 32, top: 46 },
    legend: { data: ['实际销售额', '营销费用'], top: 8 },
    series: [
      {
        barMaxWidth: 22,
        data: rows.map((row) => row.salesAmount),
        name: '实际销售额',
        type: 'bar',
      },
      {
        barMaxWidth: 22,
        data: rows.map((row) => row.marketingCost),
        name: '营销费用',
        type: 'bar',
      },
    ],
    tooltip: { trigger: 'axis' },
    xAxis: {
      axisLabel: {
        formatter: (value: number) =>
          Math.abs(value) >= 10_000
            ? `${round(value / 10_000, 1)}万`
            : `${round(value, 0)}`,
      },
      splitLine: { lineStyle: { type: 'dashed' } },
      type: 'value',
    },
    yAxis: {
      data: rows.map((row) => row.label),
      type: 'category',
    },
  };
});

const topShops = computed(() =>
  (summary.value?.shops ?? [])
    .filter((shop) => asNumber(shop.salesAmount) > 0)
    .toSorted(
      (first, second) =>
        asNumber(second.salesAmount) - asNumber(first.salesAmount),
    )
    .slice(0, 6),
);

const topShopOption = computed<ECOption | null>(() => {
  const rows = topShops.value.toReversed();
  if (rows.length === 0) return null;
  return {
    color: ['#8b5cf6'],
    grid: { bottom: 28, left: 128, right: 48, top: 26 },
    series: [
      {
        barMaxWidth: 24,
        data: rows.map((row) => round(row.salesAmount)),
        label: {
          formatter: (params: any) =>
            asNumber(params.value) >= 10_000
              ? `${round(asNumber(params.value) / 10_000, 1)}万`
              : `${round(params.value, 0)}`,
          position: 'right',
          show: true,
        },
        name: '实际销售额',
        type: 'bar',
      },
    ],
    tooltip: { trigger: 'axis' },
    xAxis: {
      axisLabel: {
        formatter: (value: number) =>
          Math.abs(value) >= 10_000
            ? `${round(value / 10_000, 1)}万`
            : `${round(value, 0)}`,
      },
      splitLine: { lineStyle: { type: 'dashed' } },
      type: 'value',
    },
    yAxis: {
      axisLabel: {
        formatter: (value: string) =>
          value.length > 10 ? `${value.slice(0, 10)}…` : value,
      },
      data: rows.map((row) => row.shopName),
      type: 'category',
    },
  };
});

function rowAlertKey(type: string, row: SummaryRow): string {
  return `${type}-${row.shopKey}-${row.periodKey}`;
}

function rowPeriodText(row: SummaryRow): string {
  return row.periodLabel || row.periodKey || rangeTitle.value;
}

const businessAlerts = computed<BusinessAlert[]>(() => {
  const rankings = summary.value?.rankings;
  if (!rankings) return [];
  const result: BusinessAlert[] = [];

  for (const row of (rankings.zeroSalesWithCost ?? []).slice(0, 2)) {
    result.push({
      description: `${row.shopName} 有营销投入但未形成实际销售额`,
      icon: 'lucide:circle-off',
      key: rowAlertKey('zero-sales', row),
      level: 'danger',
      period: rowPeriodText(row),
      title: '有花费无销售',
      value: formatMoney(asNumber(row.marketingCost)),
    });
  }

  for (const row of (rankings.highCostRatio ?? []).slice(0, 2)) {
    result.push({
      description: `${row.shopName} 的营销投入占销售额比例偏高`,
      icon: 'lucide:megaphone-off',
      key: rowAlertKey('high-cost', row),
      level: 'warning',
      period: rowPeriodText(row),
      title: '营销费比偏高',
      value: formatPercent(asNumber(row.costRatio)),
    });
  }

  for (const row of (rankings.highRefundRatio ?? []).slice(0, 2)) {
    result.push({
      description: `${row.shopName} 的退款金额占比需要关注`,
      icon: 'lucide:triangle-alert',
      key: rowAlertKey('high-refund', row),
      level: 'warning',
      period: rowPeriodText(row),
      title: '退款率偏高',
      value: formatPercent(asNumber(row.refundRatio)),
    });
  }

  return result.slice(0, 6);
});

const dataFreshness = computed(() => {
  const maxDate = normalizeDateValue(summary.value?.dataMaxDate);
  if (!maxDate) {
    return {
      color: 'default',
      detail: '尚未获得电商统计日期',
      text: '无数据水位',
    };
  }
  const lagDays = Math.max(
    0,
    dayjs().startOf('day').diff(dayjs(maxDate).startOf('day'), 'day'),
  );
  if (lagDays <= 2) {
    return {
      color: 'success',
      detail: `电商数据更新至 ${maxDate}`,
      text: '数据更新正常',
    };
  }
  if (lagDays <= 7) {
    return {
      color: 'warning',
      detail: `电商数据更新至 ${maxDate}，已滞后 ${lagDays} 天`,
      text: '数据需要更新',
    };
  }
  return {
    color: 'error',
    detail: `电商数据更新至 ${maxDate}，已滞后 ${lagDays} 天`,
    text: '数据严重滞后',
  };
});

const lastUpdatedText = computed(() =>
  lastUpdatedAt.value
    ? `页面更新于 ${dayjs(lastUpdatedAt.value).format('HH:mm')}`
    : '正在获取公司经营数据',
);

async function loadCompanyDashboard() {
  loadFailed.value = false;
  if (!canViewEcData.value) {
    summary.value = null;
    lastUpdatedAt.value = Date.now();
    return;
  }

  loading.value = true;
  try {
    summary.value = await getEcShopDailySummary({
      channelType: 'ALL',
      hideEmptyPeriod: true,
      periodType: requestPeriodType.value,
      statDate: selectedDateRange.value,
    });
    lastUpdatedAt.value = Date.now();
  } catch {
    loadFailed.value = true;
  } finally {
    loading.value = false;
  }
}

function openEcDashboard() {
  void router.push('/fdmdata/ec-shop-daily/all');
}

watch(activeRange, () => {
  void loadCompanyDashboard();
});

onMounted(() => {
  void loadCompanyDashboard();
});

onActivated(() => {
  if (lastUpdatedAt.value && Date.now() - lastUpdatedAt.value > 300_000) {
    void loadCompanyDashboard();
  }
});
</script>

<template>
  <main class="company-dashboard">
    <section class="company-hero">
      <div class="company-hero__main">
        <div class="company-hero__eyebrow">
          <span>COMPANY PERFORMANCE</span>
          <Tag :color="dataFreshness.color">{{ dataFreshness.text }}</Tag>
        </div>
        <h1>公司经营驾驶舱</h1>
        <p>
          汇总各业务部门的销售、订单、营销与退款表现，当前已接入电商真实数据。
        </p>
        <div class="company-hero__meta">
          <span>
            <IconifyIcon icon="lucide:calendar-range" />
            {{ rangeDateText }}
          </span>
          <span>
            <IconifyIcon icon="lucide:database" />
            {{ dataFreshness.detail }}
          </span>
          <span>
            <IconifyIcon icon="lucide:refresh-cw" />
            {{ lastUpdatedText }}
          </span>
        </div>
      </div>

      <div class="coverage-panel">
        <div class="coverage-panel__value">1/4</div>
        <strong>部门数据已接入</strong>
        <p>电商已接入，内贸、外贸和其他部门待接入</p>
        <div class="coverage-progress">
          <span></span>
        </div>
      </div>
    </section>

    <section class="dashboard-toolbar" aria-label="看板筛选">
      <div class="dashboard-toolbar__range">
        <Segmented v-model:value="activeRange" :options="rangeOptions" />
        <div>
          <strong>{{ rangeTitle }}</strong>
          <span>{{ rangeDateText }}</span>
        </div>
      </div>
      <div class="dashboard-toolbar__actions">
        <Button :loading="loading" @click="loadCompanyDashboard">
          <template #icon>
            <IconifyIcon icon="lucide:refresh-cw" />
          </template>
          刷新数据
        </Button>
        <Button
          type="primary"
          :disabled="!canViewEcData"
          @click="openEcDashboard"
        >
          查看电商明细
          <template #icon>
            <IconifyIcon icon="lucide:arrow-up-right" />
          </template>
        </Button>
      </div>
    </section>

    <section class="data-scope-notice">
      <IconifyIcon icon="lucide:info" />
      <div>
        <strong>当前公司汇总口径</strong>
        <span>
          公司合计目前仅包含电商部门真实数据；内贸、外贸和其他部门显示的 0
          为待接入占位，不代表已完成业绩统计。
        </span>
      </div>
    </section>

    <section class="metric-grid" aria-label="公司核心指标">
      <article
        v-for="card in companyMetricCards"
        :key="card.key"
        class="metric-card"
        :style="{ '--metric-color': card.color }"
      >
        <div class="metric-card__icon">
          <IconifyIcon :icon="card.icon" />
        </div>
        <div class="metric-card__content">
          <span>{{ card.title }}</span>
          <Skeleton.Button
            v-if="initialLoading"
            active
            size="small"
            style="width: 132px"
          />
          <strong v-else>{{ card.displayValue }}</strong>
          <p>{{ card.description }}</p>
        </div>
      </article>
    </section>

    <section class="secondary-metrics" aria-label="经营辅助指标">
      <div v-for="item in secondaryMetrics" :key="item.label">
        <span>{{ item.label }}</span>
        <strong>{{ initialLoading ? '—' : item.value }}</strong>
      </div>
    </section>

    <section class="section-block department-section">
      <div class="section-heading">
        <div>
          <span class="section-heading__eyebrow">DEPARTMENT OVERVIEW</span>
          <h2>部门经营概览</h2>
          <p>以统一口径查看各部门当前经营贡献与数据接入状态</p>
        </div>
        <Tag color="blue">数据覆盖 25%</Tag>
      </div>

      <div class="department-grid">
        <article
          v-for="department in departmentCards"
          :key="department.key"
          class="department-card"
          :class="{ 'department-card--pending': !department.connected }"
          :style="{ '--department-tone': department.tone }"
        >
          <header>
            <div class="department-card__identity">
              <span class="department-card__icon">
                <IconifyIcon :icon="department.icon" />
              </span>
              <div>
                <h3>{{ department.name }}</h3>
                <p>{{ department.description }}</p>
              </div>
            </div>
            <Tag :color="department.statusColor">{{ department.status }}</Tag>
          </header>

          <div class="department-card__sales">
            <span>实际销售额</span>
            <Skeleton.Button
              v-if="initialLoading && department.key === 'ecommerce'"
              active
              size="small"
              style="width: 116px"
            />
            <strong v-else>{{ formatMoney(department.sales, true) }}</strong>
          </div>

          <dl>
            <div>
              <dt>真实订单</dt>
              <dd>{{ formatNumber(department.orders) }}</dd>
            </div>
            <div>
              <dt>营销费比</dt>
              <dd>{{ formatPercent(department.costRatio) }}</dd>
            </div>
            <div>
              <dt>退款率</dt>
              <dd>{{ formatPercent(department.refundRatio) }}</dd>
            </div>
          </dl>

          <button
            v-if="department.key === 'ecommerce' && canViewEcData"
            type="button"
            @click="openEcDashboard"
          >
            查看部门详情
            <IconifyIcon icon="lucide:arrow-right" />
          </button>
          <span v-else class="department-card__pending-text">
            数据接口接入后自动纳入公司汇总
          </span>
        </article>
      </div>
    </section>

    <section class="dashboard-grid dashboard-grid--primary">
      <article class="section-block chart-card chart-card--wide">
        <div class="section-heading section-heading--compact">
          <div>
            <span class="section-heading__eyebrow">COMPANY TREND</span>
            <h2>已接入销售趋势</h2>
            <p>当前趋势等于电商部门实际销售额、营销费用与营销费比</p>
          </div>
          <Tag color="blue">
{{
            requestPeriodType === 'MONTH' ? '按月' : '按日'
          }}
</Tag>
        </div>

        <div v-if="initialLoading" class="chart-loading">
          <Skeleton active :paragraph="{ rows: 6 }" />
        </div>
        <div v-else-if="sourceUnavailable" class="chart-placeholder">
          <IconifyIcon icon="lucide:database-zap" />
          <strong>{{
            canViewEcData ? '电商数据暂不可用' : '暂无电商数据查看权限'
          }}</strong>
          <span>其他部门仍按待接入状态展示，不会被误计为真实数据。</span>
        </div>
        <EchartsBox v-else :height="350" :option="companyTrendOption" />
      </article>

      <article class="section-block chart-card">
        <div class="section-heading section-heading--compact">
          <div>
            <span class="section-heading__eyebrow">PLATFORM MIX</span>
            <h2>电商平台贡献</h2>
            <p>按当前时间范围汇总各平台销售与营销投入</p>
          </div>
        </div>

        <div v-if="initialLoading" class="chart-loading">
          <Skeleton active :paragraph="{ rows: 6 }" />
        </div>
        <div
          v-else-if="sourceUnavailable"
          class="chart-placeholder chart-placeholder--small"
        >
          <IconifyIcon icon="lucide:chart-no-axes-column" />
          <strong>平台数据不可用</strong>
        </div>
        <EchartsBox v-else :height="350" :option="platformContributionOption" />
      </article>
    </section>

    <section class="dashboard-grid dashboard-grid--secondary">
      <article class="section-block chart-card">
        <div class="section-heading section-heading--compact">
          <div>
            <span class="section-heading__eyebrow">TOP SHOPS</span>
            <h2>电商店铺贡献 Top 6</h2>
            <p>使用服务端范围汇总结果，避免将单个周期排行误作总排名</p>
          </div>
        </div>

        <div v-if="initialLoading" class="chart-loading">
          <Skeleton active :paragraph="{ rows: 6 }" />
        </div>
        <div
          v-else-if="sourceUnavailable"
          class="chart-placeholder chart-placeholder--small"
        >
          <IconifyIcon icon="lucide:store" />
          <strong>店铺数据不可用</strong>
        </div>
        <EchartsBox v-else :height="340" :option="topShopOption" />
      </article>

      <article class="section-block alert-card">
        <div class="section-heading section-heading--compact">
          <div>
            <span class="section-heading__eyebrow">OPERATING ALERTS</span>
            <h2>电商经营提醒</h2>
            <p>聚焦有花费无销售、营销费比和退款率异常</p>
          </div>
          <Tag v-if="businessAlerts.length" color="orange">
            {{ businessAlerts.length }} 项
          </Tag>
        </div>

        <div v-if="initialLoading" class="alert-loading">
          <Skeleton active :paragraph="{ rows: 7 }" />
        </div>
        <div
          v-else-if="sourceUnavailable"
          class="chart-placeholder chart-placeholder--small"
        >
          <IconifyIcon icon="lucide:shield-alert" />
          <strong>暂无法分析经营提醒</strong>
        </div>
        <div v-else-if="businessAlerts.length" class="alert-list">
          <article
            v-for="alert in businessAlerts"
            :key="alert.key"
            class="alert-item"
            :class="`alert-item--${alert.level}`"
          >
            <span class="alert-item__icon">
              <IconifyIcon :icon="alert.icon" />
            </span>
            <div class="alert-item__content">
              <div>
                <strong>{{ alert.title }}</strong>
                <Tag>{{ alert.period }}</Tag>
              </div>
              <p>{{ alert.description }}</p>
            </div>
            <strong class="alert-item__value">{{ alert.value }}</strong>
          </article>
        </div>
        <Empty v-else description="当前范围暂无经营异常" />
      </article>
    </section>

    <footer class="dashboard-footnote">
      <IconifyIcon icon="lucide:shield-check" />
      <span>
        电商指标统一采用后端经营汇总口径；页面按权限加载，接口失败时显示“—”，不会将未知数据误报为
        0。
      </span>
    </footer>
  </main>
</template>

<style scoped>
.company-dashboard {
  --dashboard-border: #e4eaf2;
  --dashboard-muted: #667085;
  --dashboard-surface: #fff;
  --dashboard-text: #172033;

  min-height: 100%;
  padding: 20px;
  color: var(--dashboard-text);
}

.company-hero {
  position: relative;
  display: grid;
  grid-template-columns: minmax(0, 1fr) 280px;
  gap: 28px;
  min-height: 224px;
  padding: 34px 38px;
  overflow: hidden;
  color: #fff;
  background:
    radial-gradient(circle at 76% 16%, rgb(56 189 248 / 24%), transparent 28%),
    linear-gradient(115deg, #0b1739 0%, #123a78 58%, #0e7490 100%);
  border-radius: 18px;
  box-shadow: 0 18px 45px rgb(15 23 42 / 16%);
}

.company-hero::after {
  position: absolute;
  right: 18%;
  bottom: -160px;
  width: 420px;
  height: 420px;
  pointer-events: none;
  content: '';
  border: 1px solid rgb(255 255 255 / 10%);
  border-radius: 50%;
}

.company-hero__main,
.coverage-panel {
  position: relative;
  z-index: 1;
}

.company-hero__eyebrow {
  display: flex;
  gap: 12px;
  align-items: center;
  margin-bottom: 14px;
}

.company-hero__eyebrow > span {
  font-size: 11px;
  font-weight: 800;
  letter-spacing: 0.18em;
  opacity: 0.72;
}

.company-hero h1 {
  margin: 0;
  font-size: 32px;
  font-weight: 750;
  letter-spacing: -0.03em;
}

.company-hero__main > p {
  max-width: 720px;
  margin: 12px 0 24px;
  font-size: 15px;
  line-height: 1.7;
  color: rgb(255 255 255 / 76%);
}

.company-hero__meta {
  display: flex;
  flex-wrap: wrap;
  gap: 12px 22px;
  font-size: 12px;
  color: rgb(255 255 255 / 72%);
}

.company-hero__meta span {
  display: inline-flex;
  gap: 7px;
  align-items: center;
}

.coverage-panel {
  display: flex;
  flex-direction: column;
  justify-content: center;
  padding: 24px;
  background: rgb(255 255 255 / 10%);
  border: 1px solid rgb(255 255 255 / 14%);
  border-radius: 16px;
  backdrop-filter: blur(10px);
}

.coverage-panel__value {
  margin-bottom: 4px;
  font-size: 38px;
  font-weight: 760;
  letter-spacing: -0.04em;
}

.coverage-panel > strong {
  font-size: 14px;
}

.coverage-panel p {
  margin: 9px 0 18px;
  font-size: 12px;
  line-height: 1.6;
  color: rgb(255 255 255 / 66%);
}

.coverage-progress {
  height: 6px;
  overflow: hidden;
  background: rgb(255 255 255 / 16%);
  border-radius: 999px;
}

.coverage-progress span {
  display: block;
  width: 25%;
  height: 100%;
  background: linear-gradient(90deg, #67e8f9, #a7f3d0);
  border-radius: inherit;
}

.dashboard-toolbar {
  display: flex;
  gap: 20px;
  align-items: center;
  justify-content: space-between;
  padding: 15px 18px;
  margin-top: 16px;
  background: var(--dashboard-surface);
  border: 1px solid var(--dashboard-border);
  border-radius: 14px;
  box-shadow: 0 6px 20px rgb(15 23 42 / 4%);
}

.dashboard-toolbar__range,
.dashboard-toolbar__actions {
  display: flex;
  gap: 14px;
  align-items: center;
}

.dashboard-toolbar__range > div:last-child {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.dashboard-toolbar__range strong {
  font-size: 13px;
}

.dashboard-toolbar__range span {
  font-size: 11px;
  color: var(--dashboard-muted);
}

.data-scope-notice {
  display: flex;
  gap: 12px;
  align-items: flex-start;
  padding: 13px 16px;
  margin-top: 14px;
  color: #1d4ed8;
  background: #eff6ff;
  border: 1px solid #bfdbfe;
  border-radius: 12px;
}

.data-scope-notice > svg {
  flex: none;
  width: 18px;
  height: 18px;
  margin-top: 1px;
}

.data-scope-notice div {
  display: flex;
  gap: 8px;
  align-items: baseline;
}

.data-scope-notice strong {
  flex: none;
  font-size: 13px;
}

.data-scope-notice span {
  font-size: 12px;
  line-height: 1.6;
  color: #48658e;
}

.metric-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 14px;
  margin-top: 16px;
}

.metric-card {
  position: relative;
  display: flex;
  gap: 16px;
  align-items: flex-start;
  min-width: 0;
  padding: 20px;
  overflow: hidden;
  background: var(--dashboard-surface);
  border: 1px solid var(--dashboard-border);
  border-radius: 14px;
  box-shadow: 0 8px 24px rgb(15 23 42 / 5%);
}

.metric-card::before {
  position: absolute;
  top: 0;
  right: 0;
  left: 0;
  height: 3px;
  content: '';
  background: var(--metric-color);
}

.metric-card__icon {
  display: grid;
  flex: none;
  place-items: center;
  width: 46px;
  height: 46px;
  color: var(--metric-color);
  background: color-mix(in srgb, var(--metric-color) 10%, transparent);
  border-radius: 13px;
}

.metric-card__icon svg {
  width: 22px;
  height: 22px;
}

.metric-card__content {
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.metric-card__content > span {
  font-size: 12px;
  color: var(--dashboard-muted);
}

.metric-card__content > strong {
  margin-top: 7px;
  overflow: hidden;
  text-overflow: ellipsis;
  font-size: clamp(22px, 2vw, 29px);
  line-height: 1.1;
  white-space: nowrap;
}

.metric-card__content > p {
  margin: 8px 0 0;
  overflow: hidden;
  text-overflow: ellipsis;
  font-size: 11px;
  color: var(--dashboard-muted);
  white-space: nowrap;
}

.secondary-metrics {
  display: grid;
  grid-template-columns: repeat(5, minmax(0, 1fr));
  margin-top: 12px;
  overflow: hidden;
  background: var(--dashboard-surface);
  border: 1px solid var(--dashboard-border);
  border-radius: 12px;
}

.secondary-metrics > div {
  display: flex;
  gap: 12px;
  align-items: center;
  justify-content: center;
  min-width: 0;
  padding: 12px 16px;
  border-right: 1px solid var(--dashboard-border);
}

.secondary-metrics > div:last-child {
  border-right: 0;
}

.secondary-metrics span {
  font-size: 11px;
  color: var(--dashboard-muted);
}

.secondary-metrics strong {
  overflow: hidden;
  text-overflow: ellipsis;
  font-size: 13px;
  white-space: nowrap;
}

.section-block {
  min-width: 0;
  background: var(--dashboard-surface);
  border: 1px solid var(--dashboard-border);
  border-radius: 16px;
  box-shadow: 0 8px 28px rgb(15 23 42 / 5%);
}

.department-section {
  padding: 20px;
  margin-top: 16px;
}

.section-heading {
  display: flex;
  gap: 18px;
  align-items: flex-start;
  justify-content: space-between;
  margin-bottom: 17px;
}

.section-heading--compact {
  min-height: 67px;
  padding: 19px 20px 0;
  margin-bottom: 0;
}

.section-heading__eyebrow {
  display: block;
  margin-bottom: 4px;
  font-size: 9px;
  font-weight: 800;
  color: #2563eb;
  letter-spacing: 0.16em;
}

.section-heading h2 {
  margin: 0;
  font-size: 17px;
  font-weight: 700;
}

.section-heading p {
  margin: 5px 0 0;
  font-size: 11px;
  color: var(--dashboard-muted);
}

.department-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 14px;
}

.department-card {
  position: relative;
  min-width: 0;
  padding: 18px;
  overflow: hidden;
  background: linear-gradient(
    145deg,
    color-mix(in srgb, var(--department-tone) 5%, var(--dashboard-surface)),
    var(--dashboard-surface) 58%
  );
  border: 1px solid
    color-mix(in srgb, var(--department-tone) 18%, var(--dashboard-border));
  border-radius: 14px;
}

.department-card--pending {
  background: color-mix(in srgb, #94a3b8 4%, var(--dashboard-surface));
  border-style: dashed;
}

.department-card header,
.department-card__identity {
  display: flex;
  gap: 12px;
  align-items: flex-start;
}

.department-card header {
  justify-content: space-between;
}

.department-card__identity {
  min-width: 0;
}

.department-card__icon {
  display: grid;
  flex: none;
  place-items: center;
  width: 38px;
  height: 38px;
  color: var(--department-tone);
  background: color-mix(in srgb, var(--department-tone) 10%, transparent);
  border-radius: 11px;
}

.department-card h3 {
  margin: 1px 0 0;
  font-size: 14px;
}

.department-card header p {
  margin: 4px 0 0;
  overflow: hidden;
  text-overflow: ellipsis;
  font-size: 10px;
  color: var(--dashboard-muted);
  white-space: nowrap;
}

.department-card__sales {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 19px 0 15px;
}

.department-card__sales span {
  font-size: 11px;
  color: var(--dashboard-muted);
}

.department-card__sales strong {
  overflow: hidden;
  text-overflow: ellipsis;
  font-size: 25px;
  line-height: 1.1;
  white-space: nowrap;
}

.department-card dl {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 8px;
  padding: 12px 0;
  margin: 0;
  border-top: 1px solid var(--dashboard-border);
  border-bottom: 1px solid var(--dashboard-border);
}

.department-card dl div {
  min-width: 0;
}

.department-card dt {
  font-size: 9px;
  color: var(--dashboard-muted);
}

.department-card dd {
  margin: 5px 0 0;
  overflow: hidden;
  text-overflow: ellipsis;
  font-size: 12px;
  font-weight: 700;
  white-space: nowrap;
}

.department-card > button,
.department-card__pending-text {
  display: inline-flex;
  gap: 6px;
  align-items: center;
  margin-top: 13px;
  font-size: 10px;
}

.department-card > button {
  padding: 0;
  color: var(--department-tone);
  cursor: pointer;
  background: transparent;
  border: 0;
}

.department-card__pending-text {
  color: var(--dashboard-muted);
}

.dashboard-grid {
  display: grid;
  gap: 16px;
  margin-top: 16px;
}

.dashboard-grid--primary {
  grid-template-columns: minmax(0, 2fr) minmax(380px, 1fr);
}

.dashboard-grid--secondary {
  grid-template-columns: repeat(2, minmax(0, 1fr));
}

.chart-card,
.alert-card {
  overflow: hidden;
}

.chart-card :deep(.echarts-ui) {
  border: 0;
  border-radius: 0;
}

.chart-loading,
.alert-loading {
  min-height: 320px;
  padding: 38px 24px;
}

.chart-placeholder {
  display: flex;
  flex-direction: column;
  gap: 8px;
  align-items: center;
  justify-content: center;
  min-height: 350px;
  padding: 28px;
  color: var(--dashboard-muted);
  text-align: center;
}

.chart-placeholder--small {
  min-height: 290px;
}

.chart-placeholder svg {
  width: 32px;
  height: 32px;
  margin-bottom: 3px;
  color: #94a3b8;
}

.chart-placeholder strong {
  color: var(--dashboard-text);
}

.chart-placeholder span {
  max-width: 420px;
  font-size: 11px;
  line-height: 1.6;
}

.alert-card {
  min-height: 430px;
}

.alert-list {
  padding: 9px 18px 18px;
}

.alert-item {
  display: grid;
  grid-template-columns: 36px minmax(0, 1fr) auto;
  gap: 11px;
  align-items: center;
  padding: 12px 10px;
  border-bottom: 1px solid var(--dashboard-border);
}

.alert-item:last-child {
  border-bottom: 0;
}

.alert-item__icon {
  display: grid;
  place-items: center;
  width: 34px;
  height: 34px;
  color: #d97706;
  background: #fff7ed;
  border-radius: 10px;
}

.alert-item--danger .alert-item__icon {
  color: #dc2626;
  background: #fef2f2;
}

.alert-item__content {
  min-width: 0;
}

.alert-item__content > div {
  display: flex;
  gap: 8px;
  align-items: center;
}

.alert-item__content strong {
  font-size: 12px;
}

.alert-item__content p {
  margin: 4px 0 0;
  overflow: hidden;
  text-overflow: ellipsis;
  font-size: 10px;
  color: var(--dashboard-muted);
  white-space: nowrap;
}

.alert-item__value {
  font-size: 12px;
  color: #b45309;
}

.alert-item--danger .alert-item__value {
  color: #dc2626;
}

.dashboard-footnote {
  display: flex;
  gap: 9px;
  align-items: center;
  justify-content: center;
  padding: 14px 18px 4px;
  font-size: 10px;
  color: var(--dashboard-muted);
}

.dashboard-footnote svg {
  flex: none;
  color: #16a34a;
}

:global(.dark) .company-dashboard {
  --dashboard-border: #273246;
  --dashboard-muted: #98a2b3;
  --dashboard-surface: #111827;
  --dashboard-text: #f1f5f9;
}

:global(.dark) .data-scope-notice {
  color: #93c5fd;
  background: rgb(30 64 175 / 16%);
  border-color: rgb(59 130 246 / 28%);
}

:global(.dark) .data-scope-notice span {
  color: #a7b9d7;
}

:global(.dark) .alert-item__icon {
  background: rgb(217 119 6 / 14%);
}

:global(.dark) .alert-item--danger .alert-item__icon {
  background: rgb(220 38 38 / 14%);
}

@media (max-width: 1400px) {
  .metric-grid,
  .department-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .dashboard-grid--primary {
    grid-template-columns: minmax(0, 1.55fr) minmax(340px, 1fr);
  }
}

@media (max-width: 1100px) {
  .company-hero {
    grid-template-columns: 1fr 230px;
  }

  .dashboard-grid--primary,
  .dashboard-grid--secondary {
    grid-template-columns: 1fr;
  }

  .secondary-metrics {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }

  .secondary-metrics > div:nth-child(3) {
    border-right: 0;
  }

  .secondary-metrics > div:nth-child(n + 4) {
    border-top: 1px solid var(--dashboard-border);
  }
}

@media (max-width: 760px) {
  .company-dashboard {
    padding: 12px;
  }

  .company-hero {
    grid-template-columns: 1fr;
    padding: 25px 22px;
  }

  .company-hero h1 {
    font-size: 26px;
  }

  .coverage-panel {
    padding: 18px;
  }

  .dashboard-toolbar,
  .dashboard-toolbar__range {
    align-items: stretch;
  }

  .dashboard-toolbar,
  .dashboard-toolbar__range,
  .dashboard-toolbar__actions {
    flex-direction: column;
  }

  .dashboard-toolbar__actions :deep(.ant-btn) {
    width: 100%;
  }

  .data-scope-notice div {
    flex-direction: column;
    gap: 3px;
  }

  .metric-grid,
  .department-grid,
  .secondary-metrics {
    grid-template-columns: 1fr;
  }

  .secondary-metrics > div {
    justify-content: space-between;
    border-top: 1px solid var(--dashboard-border);
    border-right: 0;
  }

  .secondary-metrics > div:first-child {
    border-top: 0;
  }

  .department-section {
    padding: 16px;
  }

  .section-heading {
    flex-direction: column;
    gap: 9px;
  }

  .section-heading--compact {
    min-height: auto;
  }

  .alert-item {
    grid-template-columns: 34px minmax(0, 1fr);
  }

  .alert-item__value {
    grid-column: 2;
  }
}
</style>
