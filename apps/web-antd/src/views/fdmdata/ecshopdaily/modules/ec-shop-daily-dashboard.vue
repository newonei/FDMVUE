<!--
  数据看板方案（仅前端，不改后端）：
  1. 使用现有分页接口 getEcShopDailyPage 按筛选条件循环拉取（单页 200 条，最多 40 页），在浏览器内合并、按日汇总（同日多店相加）。
  2. 指标：净销售额 netSalesAmount、营销花费 marketingCost、退款 refundAmount、买家 buyerCount；费比 = 营销花费 / 净销售额。
  3. 后续若数据量极大，可增加后端聚合接口 /stats，看板改为单次请求即可。
-->
<script lang="ts" setup>
import type { ECOption } from '@vben/plugins/echarts';

import type { EcShopDailyRow } from '../dashboard-utils';
import type { EcShopDailyOption } from '../data';

import { computed, onBeforeUnmount, reactive, ref } from 'vue';

import {
  AutoComplete,
  Button,
  Card,
  Col,
  Collapse,
  Form,
  FormItem,
  RangePicker,
  Row,
  Select,
  Space,
  Spin,
  Statistic,
} from 'ant-design-vue';
import dayjs from 'dayjs';

import {
  getEcShopDailyPage,
  getEcShopDailyShopNameOptions,
} from '#/api/fdmdata/ecshopdaily';
import { getRangePickerDefaultProps } from '#/utils';

import {
  aggregateByMonth,
  aggregateByWeekStart,
  fmtAmount2,
  fmtPercent2,
  mergeRowsByStatDate,
  round2,
  sliceLastDays,
  sortedDailyFromMap,
  sumKpi,
} from '../dashboard-utils';
import { EC_PLATFORM_SUGGESTIONS } from '../data';
import EchartsBox from './echarts-box.vue';

const PAGE_SIZE = 200;
const MAX_PAGES = 40;

const platformOptions = EC_PLATFORM_SUGGESTIONS.map((p) => ({
  value: p.value,
  label: p.label,
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
  statDate: [string, string] | undefined;
}>({
  statDate: [
    dayjs().subtract(89, 'day').startOf('day').format('YYYY-MM-DD HH:mm:ss'),
    dayjs().endOf('day').format('YYYY-MM-DD HH:mm:ss'),
  ],
  platformCode: undefined,
  shopName: '',
});

const rangePickerProps = getRangePickerDefaultProps();

const mergedSorted = computed(() =>
  sortedDailyFromMap(mergeRowsByStatDate(rawRows.value)),
);

const kpi = computed(() => sumKpi(mergedSorted.value));

const last7 = computed(() => sliceLastDays(mergedSorted.value, 7));
const last30 = computed(() => sliceLastDays(mergedSorted.value, 30));

const monthAgg = computed(() => aggregateByMonth(mergedSorted.value));
const weekAgg = computed(() => aggregateByWeekStart(mergedSorted.value, 12));

const filterSummary = computed(() => {
  const start = dashForm.statDate?.[0]?.slice(0, 10) ?? '—';
  const end = dashForm.statDate?.[1]?.slice(0, 10) ?? '—';
  const platform =
    platformOptions.find((o) => o.value === dashForm.platformCode)?.label ??
    (dashForm.platformCode?.trim() || '全部平台');
  const shop = dashForm.shopName?.trim() || '全部店铺';
  return `${start} ~ ${end} · ${platform} · ${shop}`;
});

const dataSummary = computed(() => {
  const days = mergedSorted.value.length;
  if (!days && !loading.value) {
    return '暂无数据，请调整筛选或先在表格中录入';
  }
  return `合并后 ${days} 个统计日 · 拉取原始记录 ${rawRows.value.length} 条`;
});

type LineChartOpts = { dense?: boolean; showPointLabels?: boolean };

function dualLineOption(
  title: string,
  cats: string[],
  net: number[],
  mkt: number[],
  opts?: LineChartOpts,
): ECOption {
  const dense = opts?.dense ?? false;
  const showPointLabels = opts?.showPointLabels ?? !dense;
  return {
    title: {
      text: title,
      left: 8,
      top: 6,
      textStyle: { fontSize: 14, fontWeight: 600 },
    },
    tooltip: {
      trigger: 'axis',
      valueFormatter: (v: unknown) => fmtAmount2(v),
    },
    legend: { bottom: 4, data: ['实际销售额(净)', '营销花费'] },
    grid: { left: 52, right: 20, top: 44, bottom: dense ? 68 : 52 },
    xAxis: {
      type: 'category',
      boundaryGap: false,
      data: cats,
      axisLabel: dense
        ? { rotate: 35, interval: 'auto', fontSize: 10, hideOverlap: true }
        : {},
    },
    yAxis: {
      type: 'value',
      splitLine: { lineStyle: { type: 'dashed' } },
      axisLabel: { formatter: (v: number) => fmtAmount2(v) },
    },
    series: [
      {
        name: '实际销售额(净)',
        type: 'line',
        smooth: true,
        symbolSize: dense ? 4 : 6,
        data: net,
        itemStyle: { color: '#1677ff' },
        label: {
          show: showPointLabels,
          position: 'top',
          formatter: (p: any) => fmtAmount2(p.value),
          fontSize: 10,
        },
      },
      {
        name: '营销花费',
        type: 'line',
        smooth: true,
        symbolSize: dense ? 4 : 6,
        data: mkt,
        itemStyle: { color: '#52c41a' },
        label: {
          show: showPointLabels,
          position: 'bottom',
          formatter: (p: any) => fmtAmount2(p.value),
          fontSize: 10,
        },
      },
    ],
  };
}

function ratioLineOption(
  title: string,
  cats: string[],
  ratio: (null | number)[],
  opts?: LineChartOpts,
): ECOption {
  const dense = opts?.dense ?? false;
  const showPointLabels = opts?.showPointLabels ?? !dense;
  const data = ratio.map((v) =>
    v === null || v === undefined ? null : round2(v),
  );
  return {
    title: {
      text: title,
      left: 8,
      top: 6,
      textStyle: { fontSize: 14, fontWeight: 600 },
    },
    tooltip: {
      trigger: 'axis',
      valueFormatter: (v: unknown) => fmtPercent2(v),
    },
    legend: { bottom: 4, data: ['费比(营销/净销)'] },
    grid: { left: 52, right: 20, top: 44, bottom: dense ? 64 : 48 },
    xAxis: {
      type: 'category',
      boundaryGap: false,
      data: cats,
      axisLabel: dense
        ? { rotate: 35, interval: 'auto', fontSize: 10, hideOverlap: true }
        : {},
    },
    yAxis: {
      type: 'value',
      axisLabel: { formatter: (v: number) => `${round2(v).toFixed(2)}%` },
      splitLine: { lineStyle: { type: 'dashed' } },
    },
    series: [
      {
        name: '费比(营销/净销)',
        type: 'line',
        smooth: true,
        symbolSize: dense ? 4 : 6,
        data,
        connectNulls: false,
        itemStyle: { color: '#1677ff' },
        label: {
          show: showPointLabels,
          formatter: (p: any) =>
            p.value === null || p.value === undefined || p.value === ''
              ? ''
              : fmtPercent2(p.value),
          fontSize: 10,
        },
      },
    ],
  };
}

function monthBarOption(
  labels: string[],
  net: number[],
  mkt: number[],
): ECOption {
  return {
    title: {
      text: '月度数据走势（净销售额 vs 营销花费）',
      left: 8,
      top: 6,
      textStyle: { fontSize: 14, fontWeight: 600 },
    },
    tooltip: {
      trigger: 'axis',
      valueFormatter: (v: unknown) => fmtAmount2(v),
    },
    legend: { bottom: 4, data: ['实际销售额(净)', '营销花费'] },
    grid: { left: 52, right: 20, top: 44, bottom: 52 },
    xAxis: { type: 'category', data: labels },
    yAxis: {
      type: 'value',
      splitLine: { lineStyle: { type: 'dashed' } },
      axisLabel: { formatter: (v: number) => fmtAmount2(v) },
    },
    series: [
      {
        name: '实际销售额(净)',
        type: 'bar',
        data: net,
        itemStyle: { color: '#1677ff' },
        label: {
          show: true,
          position: 'top',
          fontSize: 10,
          formatter: (p: any) => fmtAmount2(p.value),
        },
      },
      {
        name: '营销花费',
        type: 'bar',
        data: mkt,
        itemStyle: { color: '#52c41a' },
        label: {
          show: true,
          position: 'top',
          fontSize: 10,
          formatter: (p: any) => fmtAmount2(p.value),
        },
      },
    ],
  };
}

const chart7 = computed<ECOption | null>(() => {
  const rows = last7.value;
  if (rows.length === 0) return null;
  const cats = rows.map((r) => String(r.statDate).slice(0, 10));
  const net = rows.map((r) => round2(r.netSalesAmount));
  const mkt = rows.map((r) => round2(r.marketingCost));
  return dualLineOption('过去7天数据', cats, net, mkt, {
    showPointLabels: true,
  });
});

const chart30 = computed<ECOption | null>(() => {
  const rows = last30.value;
  if (rows.length === 0) return null;
  const cats = rows.map((r) => String(r.statDate).slice(0, 10));
  const net = rows.map((r) => round2(r.netSalesAmount));
  const mkt = rows.map((r) => round2(r.marketingCost));
  return dualLineOption('近30天数据走势图', cats, net, mkt, { dense: true });
});

const chart30Ratio = computed<ECOption | null>(() => {
  const rows = last30.value;
  if (rows.length === 0) return null;
  const cats = rows.map((r) => String(r.statDate).slice(0, 10));
  const ratio = rows.map((r) => {
    const net = Number(r.netSalesAmount ?? 0);
    const m = Number(r.marketingCost ?? 0);
    return net > 0 ? (m / net) * 100 : null;
  });
  return ratioLineOption('过去30天费比', cats, ratio, { dense: true });
});

const chartMonthBar = computed<ECOption | null>(() => {
  const m = monthAgg.value;
  if (m.labels.length === 0) return null;
  return monthBarOption(m.labels, m.net, m.mkt);
});

const chartMonthRatio = computed<ECOption | null>(() => {
  const m = monthAgg.value;
  if (m.labels.length === 0) return null;
  return ratioLineOption('月度费比', m.labels, m.ratio);
});

const chartWeek = computed<ECOption | null>(() => {
  const w = weekAgg.value;
  if (w.labels.length === 0) return null;
  return dualLineOption(
    '近12周销售和费用（按周起始周一汇总）',
    w.labels,
    w.net,
    w.mkt,
    {
      dense: true,
    },
  );
});

const chartWeekRatio = computed<ECOption | null>(() => {
  const w = weekAgg.value;
  if (w.labels.length === 0) return null;
  return ratioLineOption('周费比', w.labels, w.ratio, { dense: true });
});

async function fetchShopNameOptions(keyword = '') {
  const seq = ++shopNameFetchSeq;
  const platformCode = dashForm.platformCode?.trim() || undefined;
  try {
    const list = await getEcShopDailyShopNameOptions({
      keyword: keyword.trim() || undefined,
      limit: 50,
      platformCode,
    });
    if (seq !== shopNameFetchSeq) return;
    shopNameOptions.value = list.map((name) => ({
      label: name,
      value: name,
    }));
  } catch (error) {
    if (seq !== shopNameFetchSeq) return;
    console.error('Load ec shop daily dashboard shop name options failed', error);
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
  handleShopNameSearch(dashForm.shopName);
}

function buildQueryPayload(): Record<string, unknown> {
  const p: Record<string, unknown> = {};
  if (dashForm.statDate?.[0] && dashForm.statDate?.[1]) {
    p.statDate = dashForm.statDate;
  }
  if (dashForm.platformCode?.trim()) {
    p.platformCode = dashForm.platformCode.trim();
  }
  if (dashForm.shopName?.trim()) p.shopName = dashForm.shopName.trim();
  return p;
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
      if (list.length < PAGE_SIZE || acc.length >= total) {
        break;
      }
      pageNo++;
    }
    if (pageNo >= MAX_PAGES && acc.length < total) {
      truncated.value = true;
    }
    rawRows.value = acc;
  } finally {
    loading.value = false;
  }
}

function resetFilters() {
  dashForm.statDate = [
    dayjs().subtract(89, 'day').startOf('day').format('YYYY-MM-DD HH:mm:ss'),
    dayjs().endOf('day').format('YYYY-MM-DD HH:mm:ss'),
  ];
  dashForm.platformCode = undefined;
  dashForm.shopName = '';
  handleShopNameSearch('');
  void loadRows();
}

function applyQuickRange(days: number) {
  dashForm.statDate = [
    dayjs()
      .subtract(days - 1, 'day')
      .startOf('day')
      .format('YYYY-MM-DD HH:mm:ss'),
    dayjs().endOf('day').format('YYYY-MM-DD HH:mm:ss'),
  ];
  void loadRows();
}

function applyYesterday() {
  const yesterday = dayjs().subtract(1, 'day');
  dashForm.statDate = [
    yesterday.startOf('day').format('YYYY-MM-DD HH:mm:ss'),
    yesterday.endOf('day').format('YYYY-MM-DD HH:mm:ss'),
  ];
  void loadRows();
}

defineExpose({
  reload: loadRows,
});

onBeforeUnmount(() => {
  if (shopNameSearchTimer) {
    clearTimeout(shopNameSearchTimer);
  }
});

void loadRows();
void fetchShopNameOptions();
</script>

<template>
  <Spin :spinning="loading">
    <!-- 筛选面板 -->
    <Card size="small" class="ec-filter-panel mb-4 border-border shadow-sm">
      <div class="mb-3 flex flex-wrap items-center justify-between gap-2">
        <span class="text-sm font-semibold text-foreground">筛选条件</span>
        <span class="text-xs text-muted-foreground">{{ filterSummary }}</span>
      </div>

      <Form layout="vertical" class="ec-filter-form">
        <Row :gutter="[16, 12]">
          <Col :xs="24" :lg="14" :xl="15">
            <FormItem label="统计日期" class="mb-0">
              <div class="flex flex-wrap items-center gap-2">
                <RangePicker
                  v-model:value="dashForm.statDate"
                  class="min-w-[280px] flex-1"
                  v-bind="rangePickerProps"
                />
                <Space :size="4" wrap class="flex-shrink-0">
                  <Button size="small" @click="applyYesterday">昨天</Button>
                  <Button size="small" @click="applyQuickRange(7)">
                    近7天
                  </Button>
                  <Button size="small" @click="applyQuickRange(30)">
                    近30天
                  </Button>
                  <Button size="small" @click="applyQuickRange(90)">
                    近90天
                  </Button>
                </Space>
              </div>
            </FormItem>
          </Col>
          <Col :xs="24" :sm="12" :lg="6" :xl="5">
            <FormItem label="平台" class="mb-0">
              <Select
                v-model:value="dashForm.platformCode"
                allow-clear
                placeholder="全部平台"
                :options="platformOptions"
                class="w-full"
                @change="handlePlatformChange"
              />
            </FormItem>
          </Col>
        </Row>

        <Row :gutter="[16, 12]" class="mt-1">
          <Col :xs="24" :sm="12" :md="8" :lg="7">
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
          <Col :xs="24" :md="16" :lg="17" :xl="17">
            <FormItem label=" " class="mb-0 ec-filter-actions">
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
      class="mb-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-200"
    >
      已截断：服务端共 {{ totalRemote }} 条，当前仅拉取前
      {{ PAGE_SIZE * MAX_PAGES }} 条参与统计。
    </div>

    <!-- 核心指标 -->
    <div class="mb-2 flex flex-wrap items-baseline justify-between gap-2">
      <span class="text-sm font-semibold text-foreground">核心指标</span>
      <span class="text-xs text-muted-foreground">{{ dataSummary }}</span>
    </div>

    <Row :gutter="[16, 16]" class="mb-4">
      <Col :xs="24" :sm="12" :lg="6">
        <Card size="small" class="kpi-card kpi-card--net h-full">
          <Statistic
            title="净销售额（区间内合计）"
            :precision="2"
            :value="kpi.netSales"
            prefix="¥"
            :value-style="{
              color: '#0d9488',
              fontWeight: 700,
              fontSize: '22px',
            }"
          />
        </Card>
      </Col>
      <Col :xs="24" :sm="12" :lg="6">
        <Card size="small" class="kpi-card kpi-card--mkt h-full">
          <Statistic
            title="营销花费（合计）"
            :precision="2"
            :value="kpi.marketing"
            prefix="¥"
            :value-style="{
              color: '#ca8a04',
              fontWeight: 700,
              fontSize: '22px',
            }"
          />
        </Card>
      </Col>
      <Col :xs="24" :sm="12" :lg="6">
        <Card size="small" class="kpi-card kpi-card--refund h-full">
          <Statistic
            title="退款金额（合计）"
            :precision="2"
            :value="kpi.refund"
            prefix="¥"
            :value-style="{
              color: '#ea580c',
              fontWeight: 700,
              fontSize: '22px',
            }"
          />
        </Card>
      </Col>
      <Col :xs="24" :sm="12" :lg="6">
        <Card size="small" class="kpi-card kpi-card--buyer h-full">
          <Statistic
            title="买家数（合计）"
            :precision="0"
            :value="kpi.buyers"
            :value-style="{ fontWeight: 700, fontSize: '22px' }"
          />
        </Card>
      </Col>
    </Row>

    <!-- 首屏图表 -->
    <Row :gutter="[16, 16]" class="mb-4">
      <Col :xs="24" :lg="12">
        <Card size="small" class="chart-card h-full" title="过去7天">
          <EchartsBox v-if="chart7" :option="chart7" :height="300" />
          <div v-else class="py-8 text-center text-sm text-muted-foreground">
            暂无数据
          </div>
        </Card>
      </Col>
      <Col :xs="24" :lg="12">
        <Card size="small" class="chart-card h-full" title="近30天走势">
          <EchartsBox v-if="chart30" :option="chart30" :height="300" />
          <div v-else class="py-8 text-center text-sm text-muted-foreground">
            暂无数据
          </div>
        </Card>
      </Col>
      <Col :span="24">
        <Card size="small" class="chart-card" title="过去30天费比">
          <EchartsBox
            v-if="chart30Ratio"
            :option="chart30Ratio"
            :height="280"
          />
        </Card>
      </Col>
    </Row>

    <!-- 更多分析 -->
    <Collapse ghost class="ec-more-charts">
      <Collapse.Panel key="more" header="更多分析（月度 / 周度）">
        <Row :gutter="[16, 16]">
          <Col :xs="24" :lg="12">
            <Card size="small" class="chart-card h-full">
              <EchartsBox
                v-if="chartMonthBar"
                :option="chartMonthBar"
                :height="300"
              />
              <div
                v-else
                class="py-6 text-center text-sm text-muted-foreground"
              >
                暂无数据
              </div>
            </Card>
          </Col>
          <Col :xs="24" :lg="12">
            <Card size="small" class="chart-card h-full">
              <EchartsBox
                v-if="chartMonthRatio"
                :option="chartMonthRatio"
                :height="300"
              />
              <div
                v-else
                class="py-6 text-center text-sm text-muted-foreground"
              >
                暂无数据
              </div>
            </Card>
          </Col>
          <Col :xs="24" :lg="12">
            <Card size="small" class="chart-card h-full">
              <EchartsBox v-if="chartWeek" :option="chartWeek" :height="280" />
              <div
                v-else
                class="py-6 text-center text-sm text-muted-foreground"
              >
                暂无数据
              </div>
            </Card>
          </Col>
          <Col :xs="24" :lg="12">
            <Card size="small" class="chart-card h-full">
              <EchartsBox
                v-if="chartWeekRatio"
                :option="chartWeekRatio"
                :height="280"
              />
              <div
                v-else
                class="py-6 text-center text-sm text-muted-foreground"
              >
                暂无数据
              </div>
            </Card>
          </Col>
        </Row>
      </Collapse.Panel>
    </Collapse>
  </Spin>
</template>

<style scoped>
.ec-filter-panel :deep(.ant-card-body) {
  padding: 16px;
  background: hsl(var(--muted) / 25%);
}

.ec-filter-form :deep(.ant-form-item-label > label) {
  font-size: 13px;
  color: hsl(var(--muted-foreground));
}

.ec-filter-actions :deep(.ant-form-item-label) {
  visibility: hidden;
}

@media (max-width: 768px) {
  .ec-filter-actions :deep(.ant-form-item-label) {
    display: none;
  }
}

.kpi-card {
  border-left-style: solid;
  border-left-width: 3px;
}

.kpi-card--net {
  border-left-color: #0d9488;
}

.kpi-card--mkt {
  border-left-color: #ca8a04;
}

.kpi-card--refund {
  border-left-color: #ea580c;
}

.kpi-card--buyer {
  border-left-color: #94a3b8;
}

.chart-card :deep(.ant-card-head) {
  min-height: 40px;
  padding: 0 12px;
}

.chart-card :deep(.ant-card-head-title) {
  font-size: 14px;
  font-weight: 600;
}

.chart-card :deep(.ant-card-body) {
  padding: 8px 12px 12px;
}

.ec-more-charts :deep(.ant-collapse-header) {
  padding: 8px 0 !important;
  font-size: 13px;
  font-weight: 500;
}
</style>
