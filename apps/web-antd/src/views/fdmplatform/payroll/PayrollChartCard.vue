<script setup lang="ts">
import type { EchartsUIType, ECOption } from '@vben/plugins/echarts';

import { computed, onMounted, ref, watch } from 'vue';

import { EchartsUI, useEcharts } from '@vben/plugins/echarts';

const props = withDefaults(
  defineProps<{
    columns: string[];
    description?: string;
    largeAmounts?: boolean;
    series: Array<{
      color?: string;
      name: string;
      values: Array<null | number>;
    }>;
    stacked?: boolean;
    title: string;
    type?: 'bar' | 'line';
  }>(),
  { description: '', type: 'line' },
);

const chart = ref<EchartsUIType>();
const { renderEcharts } = useEcharts(chart);
const palette = [
  '#754661',
  '#497176',
  '#a66243',
  '#5a6590',
  '#9971a0',
  '#647d4a',
  '#5978ab',
  '#9e5769',
  '#8e7937',
  '#617367',
];
const divisor = computed(() => (props.largeAmounts ? 1_000_000 : 100));
const unit = computed(() => (props.largeAmounts ? '万元' : '元'));
const option = computed<ECOption>(() => ({
  animation: false,
  grid: { bottom: 38, left: 8, right: 15, top: 40, containLabel: true },
  legend: { bottom: 0, type: 'scroll' },
  tooltip: {
    trigger: 'axis',
    valueFormatter: (value) =>
      value === null || value === undefined || value === '-'
        ? '—'
        : `${Number(value).toLocaleString('zh-CN', { maximumFractionDigits: 6 })} ${unit.value}`,
  },
  xAxis: {
    type: 'category',
    data: props.columns,
    axisLabel: { hideOverlap: true },
    axisTick: { show: false },
  },
  yAxis: { type: 'value', name: unit.value },
  series: props.series.map(({ color, name, values }, index) => ({
    name,
    type: props.type,
    itemStyle: { color: color ?? palette[index % palette.length] },
    data: values.map((value) =>
      value === null ? null : value / divisor.value,
    ),
    ...(props.type === 'bar'
      ? { barMaxWidth: 32, stack: props.stacked ? 'income' : undefined }
      : { connectNulls: false, symbolSize: 6, lineStyle: { width: 2 } }),
  })),
}));

onMounted(() => void renderEcharts(option.value));
watch(option, () => void renderEcharts(option.value));
</script>

<template>
  <section class="chart-card">
    <h3>{{ title }}</h3>
    <p v-if="description">{{ description }}</p>
    <EchartsUI
      ref="chart"
      :aria-label="title"
      height="255px"
      role="img"
      width="100%"
    />
  </section>
</template>

<style scoped>
.chart-card {
  min-width: 0;
  padding: 16px 18px 12px;
  background: var(--panel);
  border: 1px solid var(--line);
  border-radius: 10px;
}

.chart-card h3 {
  margin: 0;
  font-size: 15px;
  font-weight: 700;
}

.chart-card p {
  margin: 5px 0 0;
  font-size: 12px;
  color: var(--muted);
}
</style>
