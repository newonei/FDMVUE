<script setup lang="ts">
import type { EchartsUIType, ECOption } from '@vben/plugins/echarts';

import type { PayrollMonthlyTotals } from '#/api/fdmplatform/payroll';

import { computed, onMounted, ref, watch } from 'vue';

import { EchartsUI, useEcharts } from '@vben/plugins/echarts';

import { currency, monthLabel, shortMonth } from './model';

const props = defineProps<{
  month: string;
  rows: PayrollMonthlyTotals[];
}>();

const chart = ref<EchartsUIType>();
const { renderEcharts } = useEcharts(chart);
const series = [
  { field: 'gross', name: '应发', color: '#ceb7c8', current: '#bb98b0' },
  { field: 'net', name: '实发', color: '#77526c', current: '#59354f' },
] as const;
const description = computed(() =>
  props.rows
    .map(
      ({ month, people, gross, net }) =>
        monthLabel(month) +
        (people > 0
          ? '应发' + currency(gross) + '，实发' + currency(net)
          : '暂无数据'),
    )
    .join('。'),
);

const spansYears = computed(
  () => new Set(props.rows.map(({ month }) => month.slice(0, 4))).size > 1,
);
const option = computed<ECOption>(() => ({
  animation: false,
  grid: { bottom: 25, left: 8, right: 4, top: 12, containLabel: true },
  tooltip: {
    trigger: 'axis',
    valueFormatter: (value) =>
      value === null || value === '-'
        ? '—'
        : `${Number(value).toLocaleString('zh-CN', {
            maximumFractionDigits: 4,
          })} 万元`,
  },
  xAxis: {
    type: 'category',
    data: props.rows.map(({ month }) =>
      spansYears.value ? month : shortMonth(month),
    ),
    axisTick: { show: false },
    axisLine: { show: false },
  },
  yAxis: {
    type: 'value',
    axisLabel: { formatter: (value: number) => value.toLocaleString('zh-CN') },
    splitLine: { lineStyle: { color: 'rgba(125, 104, 124, .17)' } },
  },
  series: series.map(({ field, name, color, current }) => ({
    type: 'bar',
    name,
    itemStyle: { color, borderRadius: [4, 4, 0, 0] },
    barMaxWidth: 24,
    data: props.rows.map((row) => ({
      itemStyle: { color: row.month === props.month ? current : color },
      value: row.people > 0 ? Number(row[field]) / 1_000_000 : null,
    })),
  })),
}));

onMounted(() => void renderEcharts(option.value));
watch(option, () => void renderEcharts(option.value));
</script>

<template>
  <EchartsUI
    ref="chart"
    class="payroll-chart"
    height="220px"
    :aria-label="description"
    role="img"
    width="100%"
  />
</template>

<style scoped>
.payroll-chart {
  max-width: 100%;
  overflow: clip;
}
</style>
