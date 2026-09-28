<script setup lang="ts">
import type { EchartsUIType } from '@vben/plugins/echarts';

import type { FdmcaiwuEcProfitApi as Api } from '#/api/fdmcaiwu/ec-profit';

import { nextTick, ref, watch } from 'vue';

import { EchartsUI, useEcharts } from '@vben/plugins/echarts';
import { usePreferences } from '@vben/preferences';

import { formatMetric, toNumber } from '../model';

/**
 * 公司层面的逐月走势。金额与毛利率量纲不同，按规范拆成两张图，不做双轴。
 * 只画已就绪月份；待导入与未建单留空，不当作 0。
 */
const props = defineProps<{ reports: Api.Report[]; year: number }>();

const amountRef = ref<EchartsUIType>();
const marginRef = ref<EchartsUIType>();
const { renderEcharts: renderAmount } = useEcharts(amountRef);
const { renderEcharts: renderMargin } = useEcharts(marginRef);
const { isDark } = usePreferences();

function token(name: string) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

function monthly(key: keyof Api.Metric) {
  const byMonth = new Map(props.reports.map((report) => [report.month, report]));
  return Array.from({ length: 12 }, (_, index) => {
    const report = byMonth.get(`${props.year}-${String(index + 1).padStart(2, '0')}`);
    return report?.status === 'READY' ? toNumber(report.summary?.[key]) : null;
  });
}

async function render() {
  await nextTick();
  const months = Array.from({ length: 12 }, (_, index) => `${index + 1}月`);
  const muted = '#898781';
  const margins = monthly('grossMargin');
  const lastMargin = margins.reduce<number>(
    (last, value, index) => (value === null ? last : index),
    -1,
  );
  const grid = isDark.value ? '#2c2c2a' : '#e1e0d9';
  const axis = {
    axisLine: { lineStyle: { color: grid } },
    axisTick: { show: false },
    axisLabel: { color: muted },
  };
  const tooltip = {
    trigger: 'axis' as const,
    axisPointer: { type: 'shadow' as const },
  };
  await renderAmount({
    color: [token('--ecp-series-1'), token('--ecp-series-2')],
    grid: { left: 8, right: 8, top: 36, bottom: 4, containLabel: true },
    legend: { top: 0, left: 0, itemWidth: 10, itemHeight: 10, textStyle: { color: muted } },
    tooltip: {
      ...tooltip,
      valueFormatter: (value) => (value === null || value === undefined ? '—' : `${formatMetric(value as number)} 元`),
    },
    xAxis: { type: 'category', data: months, ...axis },
    yAxis: {
      type: 'value',
      axisLabel: { color: muted, formatter: (value: number) => `${value / 10_000}万` },
      splitLine: { lineStyle: { color: grid } },
    },
    series: [
      {
        name: '销售额',
        type: 'bar',
        data: monthly('salesAmount'),
        barMaxWidth: 18,
        barGap: '15%',
        itemStyle: { borderRadius: [4, 4, 0, 0] },
      },
      {
        name: '毛利润',
        type: 'bar',
        data: monthly('grossProfit'),
        barMaxWidth: 18,
        itemStyle: { borderRadius: [4, 4, 0, 0] },
      },
    ],
  });
  await renderMargin({
    color: [token('--ecp-series-1')],
    grid: { left: 8, right: 16, top: 16, bottom: 4, containLabel: true },
    tooltip: {
      trigger: 'axis',
      valueFormatter: (value) => (value === null || value === undefined ? '—' : formatMetric(value as number, true)),
    },
    xAxis: { type: 'category', data: months, boundaryGap: false, ...axis },
    yAxis: {
      type: 'value',
      scale: true,
      axisLabel: { color: muted, formatter: (value: number) => `${(value * 100).toFixed(0)}%` },
      splitLine: { lineStyle: { color: grid } },
    },
    series: [
      {
        name: '毛利率',
        type: 'line',
        data: margins,
        lineStyle: { width: 2 },
        symbol: 'circle',
        symbolSize: 8,
        connectNulls: false,
        label: {
          show: true,
          position: 'top',
          color: muted,
          fontSize: 11,
          // 只标注最新一个月，其余看悬浮提示
          formatter: ({ dataIndex, value }: any) =>
            dataIndex === lastMargin ? formatMetric(value, true) : '',
        },
      },
    ],
  });
}

watch(() => [props.reports, props.year], () => void render(), { immediate: true });
// 主题切换后 CSS 变量改变，按新配色重绘
watch(isDark, () => setTimeout(() => void render(), 60));
</script>

<template>
  <div class="grid grid-cols-1 gap-4 xl:grid-cols-5">
    <div class="rounded-xl border border-border bg-card p-5 xl:col-span-3">
      <div class="mb-2">
        <div class="font-medium">各月销售额与毛利润</div>
        <div class="text-xs text-muted-foreground">仅已就绪月份，单位：元</div>
      </div>
      <EchartsUI ref="amountRef" height="260px" />
    </div>
    <div class="rounded-xl border border-border bg-card p-5 xl:col-span-2">
      <div class="mb-2">
        <div class="font-medium">毛利率走势</div>
        <div class="text-xs text-muted-foreground">按当月合计金额计算</div>
      </div>
      <EchartsUI ref="marginRef" height="260px" />
    </div>
  </div>
</template>
