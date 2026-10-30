<script setup lang="ts">
import type { TableColumnsType } from 'ant-design-vue';
import type { FdmcaiwuEcProfitApi as Api } from '#/api/fdmcaiwu/ec-profit';
import type { MetricKey } from '../model';

import { computed, onBeforeUnmount, ref, watch } from 'vue';

import { IconifyIcon } from '@vben/icons';
import { downloadFileFromBlobPart } from '@vben/utils';

import {
  Alert,
  Button,
  DatePicker,
  Empty,
  Segmented,
  Select,
  Table,
  Tooltip,
} from 'ant-design-vue';
import dayjs from 'dayjs';

import {
  exportEcProfitYearExcel,
  getEcProfitYear,
  getEcProfitYearGroups,
} from '#/api/fdmcaiwu/ec-profit';

import {
  aggregateReadyReports,
  formatMetric,
  METRIC_GROUPS,
  toNumber,
} from '../model';
import { isRateMetric, metricLabel, yearCell } from '../tree-model';
import YearTrend from './year-trend.vue';

const props = defineProps<{ defaultYear: number }>();
const emit = defineEmits<{ locate: [value: { key?: string; month: string }] }>();

const year = ref(String(props.defaultYear));
const metric = ref<MetricKey>('grossProfit');
const result = ref<Api.YearGroups>();
const reports = ref<Api.Report[]>([]);
const loading = ref(false);
const exporting = ref(false);
const error = ref('');
let sequence = 0;

const QUICK_METRICS: MetricKey[] = ['grossProfit', 'salesAmount', 'grossMargin', 'promotionCost', 'purchaseCost'];
const quickOptions = QUICK_METRICS.map((key) => ({
  label: key === 'purchaseCost' ? '采购成本' : metricLabel(key),
  value: key,
}));
const moreOptions = METRIC_GROUPS.map((group) => ({
  label: group.title,
  options: group.metrics
    .filter((item) => !QUICK_METRICS.includes(item.key))
    .map((item) => ({ label: item.label, value: item.key })),
})).filter((group) => group.options.length > 0);
const rate = computed(() => isRateMetric(metric.value));

const months = computed(() =>
  Array.from({ length: 12 }, (_, i) => `${year.value}-${String(i + 1).padStart(2, '0')}`),
);
const reportByMonth = computed(() => new Map(reports.value.map((report) => [report.month, report])));
const annual = computed(() => aggregateReadyReports(reports.value));
const readyCount = computed(() => reports.value.filter((report) => report.status === 'READY').length);
const tiles = computed(() => [
  { label: '全年销售额', value: formatMetric(annual.value.salesAmount), hint: `已就绪 ${readyCount.value} 个月合计` },
  { label: '全年毛利润', value: formatMetric(annual.value.grossProfit), hint: `已就绪 ${readyCount.value} 个月合计` },
  { label: '全年毛利率', value: formatMetric(annual.value.grossMargin, true), hint: '按全年合计金额计算' },
  { label: '已就绪月份', value: `${readyCount.value} / 12`, hint: `${reports.value.length - readyCount.value} 个月待导入` },
]);

// ==================== 矩阵 ====================

type CellState = 'complete' | 'no-group' | 'not-created' | 'partial';
interface Cell {
  state: CellState;
  value?: Api.Decimal;
  hint?: string;
}
interface MatrixRow {
  key: string;
  name: string;
  cells: Record<string, Cell>;
  total?: Api.Decimal;
  includedMonths: string[];
}

function groupRow(group: Api.YearGroup): MatrixRow {
  const cells: Record<string, Cell> = {};
  for (const month of months.value) {
    const cell = yearCell(group, month);
    if (!cell || cell.reportStatus === 'NOT_CREATED') cells[month] = { state: 'not-created' };
    else if (!cell.node) cells[month] = { state: 'no-group' };
    else {
      const complete = cell.node.dataState === 'COMPLETE' && cell.reportStatus === 'READY';
      cells[month] = {
        state: complete ? 'complete' : 'partial',
        value: cell.node.summary?.[metric.value],
        hint: complete
          ? undefined
          : `已导入 ${cell.node.importedShopCount} / ${cell.node.expectedShopCount} 家或指标未齐，不计入全年合计`,
      };
    }
  }
  return {
    key: group.key,
    name: group.name,
    cells,
    total: group.summary?.[metric.value],
    includedMonths: group.includedMonths,
  };
}

/** 行为用户配置的电商分组（服务端已按分组排序，未配置在最后） */
const rows = computed<MatrixRow[]>(() => (result.value?.groups ?? []).map(groupRow));

function sparkline(row: MatrixRow) {
  const values = months.value.map((month) =>
    row.cells[month]?.state === 'complete' || row.cells[month]?.state === 'partial'
      ? toNumber(row.cells[month]?.value)
      : null,
  );
  const known = values.filter((value): value is number => value !== null);
  if (known.length < 2) return { paths: [] as string[], last: undefined };
  const min = Math.min(...known);
  const max = Math.max(...known);
  const span = max - min || 1;
  const point = (value: number, index: number) =>
    `${(index / 11) * 88 + 4},${20 - ((value - min) / span) * 16}`;
  const paths: string[] = [];
  let current: string[] = [];
  values.forEach((value, index) => {
    if (value === null) {
      if (current.length > 1) paths.push(current.join(' '));
      current = [];
    } else current.push(point(value, index));
  });
  if (current.length > 1) paths.push(current.join(' '));
  const lastIndex = values.reduce<number>((last, value, index) => (value === null ? last : index), -1);
  return { paths, last: point(values[lastIndex]!, lastIndex).split(',').map(Number) };
}

function display(value: Api.Decimal | undefined) {
  if (rate.value) return formatMetric(value, true);
  const amount = toNumber(value);
  return amount === null ? '—' : amount.toLocaleString('zh-CN', { maximumFractionDigits: 0 });
}
function negative(value: Api.Decimal | undefined) {
  return (toNumber(value) ?? 0) < 0;
}
function monthState(month: string) {
  const report = reportByMonth.value.get(month);
  if (!report) return month > dayjs().format('YYYY-MM') ? '' : '未建单';
  return report.status === 'READY' ? '' : '待导入';
}

const columns = computed<TableColumnsType>(() => [
  { key: 'name', title: '分组', fixed: 'left', width: 220 },
  { key: 'trend', title: '走势', width: 112 },
  ...months.value.map((month) => ({
    key: month,
    title: `${Number(month.slice(5))}月`,
    width: rate.value ? 90 : 104,
    align: 'right' as const,
  })),
  { key: 'total', title: '全年合计', width: 150, align: 'right', fixed: 'right' },
]);
const scrollX = computed(() => columns.value.reduce((sum, column) => sum + Number(column.width ?? 0), 0));

// ==================== 加载 ====================

async function load() {
  const current = ++sequence;
  loading.value = true;
  error.value = '';
  try {
    const [groups, list] = await Promise.all([
      getEcProfitYearGroups(Number(year.value)),
      getEcProfitYear(Number(year.value)),
    ]);
    if (current !== sequence) return;
    result.value = groups;
    reports.value = list;
  } catch {
    if (current === sequence) {
      result.value = undefined;
      reports.value = [];
      error.value = '年度数据加载失败，请重试。';
    }
  } finally {
    if (current === sequence) loading.value = false;
  }
}
watch(year, () => void load(), { immediate: true });
onBeforeUnmount(() => sequence++);

function shiftYear(step: number) {
  year.value = String(Number(year.value) + step);
}
function locate(row: MatrixRow, month: string) {
  emit('locate', { month, key: row.key });
}
async function exportExcel() {
  exporting.value = true;
  try {
    const data = await exportEcProfitYearExcel(Number(year.value));
    downloadFileFromBlobPart({ fileName: `电商毛利年度汇总-${year.value}.xlsx`, source: data });
  } finally {
    exporting.value = false;
  }
}
</script>

<template>
  <div class="space-y-4">
    <div class="flex flex-wrap items-center justify-between gap-3">
      <div class="flex items-center">
        <Button aria-label="上一年" @click="shiftYear(-1)">
          <template #icon><IconifyIcon icon="lucide:chevron-left" /></template>
        </Button>
        <DatePicker
          v-model:value="year"
          picker="year"
          format="YYYY 年"
          value-format="YYYY"
          :allow-clear="false"
          class="mx-1 w-28"
          aria-label="对比年度"
        />
        <Button
          aria-label="下一年"
          :disabled="Number(year) >= dayjs().year()"
          @click="shiftYear(1)"
        >
          <template #icon><IconifyIcon icon="lucide:chevron-right" /></template>
        </Button>
      </div>
      <div class="flex items-center gap-2">
        <Tooltip title="全年汇总 + 分组逐月对比（毛利润、销售额、毛利率、采购、推广）">
          <Button :loading="exporting" :disabled="reports.length === 0" @click="exportExcel">
            <template #icon><IconifyIcon icon="lucide:download" /></template>导出 Excel
          </Button>
        </Tooltip>
        <Tooltip title="刷新">
          <Button aria-label="刷新" :loading="loading" @click="load">
            <template #icon><IconifyIcon icon="lucide:refresh-cw" /></template>
          </Button>
        </Tooltip>
      </div>
    </div>

    <Alert v-if="error" type="error" :message="error" show-icon />

    <div class="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <div v-for="tile in tiles" :key="tile.label" class="rounded-xl border border-border bg-card px-5 py-4">
        <div class="text-sm text-muted-foreground">{{ tile.label }}</div>
        <div class="my-2 text-[26px] font-semibold leading-tight">{{ tile.value }}</div>
        <div class="text-xs text-muted-foreground">{{ tile.hint }}</div>
      </div>
    </div>

    <YearTrend :reports="reports" :year="Number(year)" />

    <div class="rounded-xl border border-border bg-card p-4">
      <div class="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div>
          <div class="font-medium">分组逐月对比 · {{ metricLabel(metric) }}</div>
          <div class="text-xs text-muted-foreground">
            按当月归属快照；点击数值进入该月明细。全年合计只统计月报已就绪且数据完整的月份，比率按金额重算。
          </div>
        </div>
        <div class="flex flex-wrap items-center gap-2">
          <Segmented v-model:value="metric" :options="quickOptions" />
          <Select
            :value="QUICK_METRICS.includes(metric) ? undefined : metric"
            :options="moreOptions"
            placeholder="更多指标"
            class="w-36"
            aria-label="更多指标"
            @change="(value) => (metric = value as MetricKey)"
          />
        </div>
      </div>
      <Table
        :columns="columns"
        :data-source="rows"
        :loading="loading"
        :pagination="false"
        :scroll="{ x: scrollX, y: 620 }"
        :row-class-name="(record: any) => (record.key === 'UNCONFIGURED' ? 'ecp-row-unconfigured' : '')"
        row-key="key"
        size="small"
      >
        <template #headerCell="{ column }">
          <div v-if="String(column.key).startsWith(`${year}-`)" class="leading-tight">
            <div>{{ column.title }}</div>
            <div
              v-if="monthState(String(column.key))"
              class="text-[11px] font-normal"
              :class="monthState(String(column.key)) === '待导入' ? 'text-amber-600' : 'text-muted-foreground'"
            >
              {{ monthState(String(column.key)) }}
            </div>
          </div>
          <template v-else>{{ column.title }}</template>
        </template>
        <template #bodyCell="{ column, record }">
          <div v-if="column.key === 'name'" class="flex min-w-0 items-center gap-1.5">
            <span class="truncate font-medium" :title="record.name">{{ record.name }}</span>
            <Tooltip v-if="record.key === 'UNCONFIGURED'" title="未配置电商分组的店铺，以及非店铺的费用行">
              <IconifyIcon icon="lucide:info" class="shrink-0 text-muted-foreground" />
            </Tooltip>
          </div>
          <template v-else-if="column.key === 'trend'">
            <svg
              v-if="sparkline(record as MatrixRow).paths.length > 0"
              viewBox="0 0 96 24"
              class="h-6 w-24"
              role="img"
              :aria-label="`${record.name} 各月走势`"
            >
              <polyline
                v-for="(path, index) in sparkline(record as MatrixRow).paths"
                :key="index"
                :points="path"
                fill="none"
                stroke="var(--ecp-series-1)"
                stroke-width="1.5"
                stroke-linejoin="round"
                stroke-linecap="round"
              />
              <circle
                v-if="sparkline(record as MatrixRow).last"
                :cx="sparkline(record as MatrixRow).last![0]"
                :cy="sparkline(record as MatrixRow).last![1]"
                r="2.5"
                fill="var(--ecp-series-1)"
              />
            </svg>
            <span v-else class="text-xs text-muted-foreground">—</span>
          </template>
          <template v-else-if="column.key === 'total'">
            <Tooltip
              :title="
                record.includedMonths.length > 0
                  ? `纳入：${record.includedMonths.map((m: string) => `${Number(m.slice(5))}月`).join('、')}`
                  : '尚无满足汇总条件的月份'
              "
            >
              <div>
                <div
                  class="font-semibold tabular-nums"
                  :class="negative(record.total) ? 'text-[var(--ecp-negative)]' : ''"
                >
                  {{ display(record.total) }}
                </div>
                <div
                  v-if="record.includedMonths.length < readyCount"
                  class="text-[11px] text-muted-foreground"
                >
                  纳入 {{ record.includedMonths.length }} 个月
                </div>
              </div>
            </Tooltip>
          </template>
          <template v-else>
            <template v-if="record.cells[String(column.key)]?.state === 'complete' || record.cells[String(column.key)]?.state === 'partial'">
              <Tooltip :title="record.cells[String(column.key)].hint || `${formatMetric(record.cells[String(column.key)].value, rate)}${rate ? '' : ' 元'}`">
                <button
                  type="button"
                  class="inline-flex items-center gap-1 tabular-nums hover:text-primary hover:underline"
                  :class="[
                    negative(record.cells[String(column.key)].value) ? 'text-[var(--ecp-negative)]' : '',
                  ]"
                  @click="locate(record as MatrixRow, String(column.key))"
                >
                  <i
                    v-if="record.cells[String(column.key)].state === 'partial'"
                    class="inline-block size-1.5 rounded-full bg-amber-500"
                    aria-label="数据未完整"
                  ></i>
                  {{ display(record.cells[String(column.key)].value) }}
                </button>
              </Tooltip>
            </template>
            <span v-else class="text-muted-foreground/50">{{
              record.cells[String(column.key)]?.state === 'no-group' ? '·' : ''
            }}</span>
          </template>
        </template>
        <template #summary>
          <Table.Summary v-if="reports.length > 0" fixed>
            <Table.Summary.Row class="ecp-summary-row">
              <Table.Summary.Cell :index="0">
                <span class="font-semibold">公司合计</span>
                <span class="ml-1 text-xs text-muted-foreground">已就绪月份</span>
              </Table.Summary.Cell>
              <Table.Summary.Cell :index="1" />
              <Table.Summary.Cell
                v-for="(month, index) in months"
                :key="month"
                :index="index + 2"
                align="right"
              >
                <strong
                  class="tabular-nums"
                  :class="negative(reportByMonth.get(month)?.summary?.[metric]) ? 'text-[var(--ecp-negative)]' : ''"
                  >{{
                    reportByMonth.get(month)?.status === 'READY'
                      ? display(reportByMonth.get(month)?.summary?.[metric])
                      : ''
                  }}</strong
                >
              </Table.Summary.Cell>
              <Table.Summary.Cell :index="14" align="right">
                <strong class="tabular-nums">{{ display(annual[metric]) }}</strong>
              </Table.Summary.Cell>
            </Table.Summary.Row>
          </Table.Summary>
        </template>
        <template #emptyText>
          <Empty
            :image="Empty.PRESENTED_IMAGE_SIMPLE"
            :description="error ? '数据暂不可用' : '本年度暂无分组月报数据'"
          />
        </template>
      </Table>
      <div class="mt-2 flex flex-wrap gap-4 text-xs text-muted-foreground">
        <span>{{ rate ? '比率' : '金额取整显示，悬停看精确值' }}</span>
        <span class="inline-flex items-center gap-1"
          ><i class="inline-block size-1.5 rounded-full bg-amber-500"></i>该月数据未完整或归属待确认</span
        >
        <span>「·」该月无此分组</span>
      </div>
    </div>
  </div>
</template>

<style scoped>
:deep(.ecp-row-unconfigured > td) {
  color: hsl(var(--muted-foreground));
}

:deep(.ecp-summary-row > td) {
  background: hsl(var(--accent)) !important;
}
</style>
