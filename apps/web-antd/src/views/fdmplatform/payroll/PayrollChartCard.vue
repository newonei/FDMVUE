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
    tooltipTotal?: {
      name: string;
      values: Array<null | number>;
    };
    type?: 'bar' | 'grouped-bar' | 'line';
  }>(),
  { description: '', tooltipTotal: undefined, type: 'line' },
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
const groupedBars = computed(() => props.type === 'grouped-bar');
const wholeYuan = new Intl.NumberFormat('zh-CN', {
  maximumFractionDigits: 0,
  useGrouping: false,
});

function formatValue(value: unknown) {
  return value === null || value === undefined || value === '-'
    ? '—'
    : `${Number(value).toLocaleString('zh-CN', { maximumFractionDigits: 6 })} ${unit.value}`;
}

function tooltipEntry(name: string, value: string, color?: string) {
  const row = document.createElement('div');
  row.style.borderInlineStartColor = color ?? 'transparent';
  const term = document.createElement('dt');
  term.textContent = name;
  const amount = document.createElement('dd');
  amount.textContent = value;
  row.append(term, amount);
  return row;
}

const tooltip = computed<ECOption['tooltip']>(() => {
  const total = props.tooltipTotal;
  if (!total) return { trigger: 'axis', valueFormatter: formatValue };

  return {
    axisPointer: { type: 'shadow' },
    confine: true,
    renderMode: 'html',
    trigger: 'axis',
    formatter: (params) => {
      const items = Array.isArray(params) ? params : [params];
      const first = items[0];
      if (!first) return '';
      const content = document.createElement('div');
      content.className = 'payroll-composition-tooltip';
      const heading = document.createElement('strong');
      heading.textContent = first.name;
      const breakdown = document.createElement('dl');
      for (const { color, seriesName, value } of items) {
        breakdown.append(
          tooltipEntry(
            seriesName ?? '',
            formatValue(value),
            typeof color === 'string' ? color : undefined,
          ),
        );
      }
      const cents = total.values[first.dataIndex];
      const value = typeof cents === 'number' ? cents / divisor.value : null;
      breakdown.append(tooltipEntry(total.name, formatValue(value)));
      content.append(heading, breakdown);
      return content;
    },
  };
});

const option = computed<ECOption>(() => ({
  animation: false,
  grid: {
    bottom: groupedBars.value ? 12 : 38,
    left: 8,
    right: 15,
    top: groupedBars.value ? 48 : 40,
    containLabel: true,
  },
  legend: groupedBars.value
    ? {
        icon: 'roundRect',
        itemHeight: 10,
        itemWidth: 10,
        left: 0,
        top: 0,
        type: 'scroll',
      }
    : { bottom: 0, type: 'scroll' },
  tooltip: tooltip.value,
  xAxis: {
    type: 'category',
    data: props.columns,
    axisLabel: { hideOverlap: true },
    axisTick: { show: false },
  },
  yAxis: { type: 'value', name: unit.value },
  series: props.series.map(({ color, name, values }, index) => ({
    name,
    type: props.type === 'line' ? 'line' : 'bar',
    itemStyle: {
      color: color ?? palette[index % palette.length],
      ...(groupedBars.value && { borderRadius: [4, 4, 3, 3] }),
    },
    data: values.map((value) =>
      value === null ? null : value / divisor.value,
    ),
    ...(props.type === 'line'
      ? { connectNulls: false, symbolSize: 6, lineStyle: { width: 2 } }
      : { barMaxWidth: 32, stack: props.stacked ? 'income' : undefined }),
    ...(groupedBars.value && {
      barCategoryGap: '24%',
      barGap: '15%',
      label: {
        show: true,
        position: 'top' as const,
        formatter: ({ value }) =>
          typeof value === 'number' ? wholeYuan.format(value) : '',
      },
      labelLayout: { hideOverlap: true },
    }),
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

:global(.payroll-composition-tooltip) {
  line-height: 1.15;
}

:global(.payroll-composition-tooltip dl) {
  display: grid;
  gap: 6px;
  margin: 7px 0 0;
}

:global(.payroll-composition-tooltip dl > div) {
  padding-inline-start: 7px;
  border-inline-start: 3px solid transparent;
}

:global(.payroll-composition-tooltip dt) {
  font-size: 12px;
}

:global(.payroll-composition-tooltip dd) {
  margin: 2px 0 0;
  font-size: 14px;
}

:global(.payroll-composition-tooltip dl > div:last-child dd) {
  font-weight: 700;
}
</style>
