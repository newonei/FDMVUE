<script setup lang="ts">
import type { EchartsUIType } from '@vben/plugins/echarts';

import type { FdmgongchangDashboardApi as Api } from '#/api/fdmgongchang/dashboard';

import { computed, nextTick, onMounted, ref, watch } from 'vue';

import { EchartsUI, useEcharts } from '@vben/plugins/echarts';

import { dateText, n, PROCESS_COLORS } from '../shared';

/**
 * 产出趋势：每天各工序良品堆叠柱，折线是当天全部工序的残次率。
 * 不同工序单位不同（张 / 片 / 件），堆叠只看节奏和结构，具体数量看提示框。
 */
const props = defineProps<{ from: string; processes: Api.ProcessStat[]; to: string; trend: Api.TrendPoint[] }>();

const chartRef = ref<EchartsUIType>();
const { renderEcharts } = useEcharts(chartRef);

const days = computed(() => {
  const list: string[] = [];
  const end = new Date(`${props.to}T00:00:00`);
  // 按日历日加，跨夏令时切换也不会重复或漏一天
  for (let i = 0; i < 62; i++) {
    const d = new Date(`${props.from}T00:00:00`);
    d.setDate(d.getDate() + i);
    if (d > end) break;
    list.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`);
  }
  return list;
});
const empty = computed(() => props.trend.length === 0);

function render() {
  if (empty.value) return;
  const byKey = new Map(props.trend.map((t) => [`${dateText(t.date)}|${t.process}`, t]));
  const used = props.processes.filter((p) => props.trend.some((t) => t.process === p.process));
  const defectRate = days.value.map((d) => {
    let good = 0;
    let defect = 0;
    for (const p of used) {
      const t = byKey.get(`${d}|${p.process}`);
      good += n(t?.good);
      defect += n(t?.defect);
    }
    return good + defect > 0 ? Number(((defect / (good + defect)) * 100).toFixed(2)) : null;
  });
  renderEcharts({
    grid: { bottom: 28, containLabel: true, left: 8, right: 8, top: 40 },
    legend: { icon: 'roundRect', itemHeight: 8, itemWidth: 12, left: 0, top: 0 },
    series: [
      ...used.map((p) => ({
        barMaxWidth: 28,
        data: days.value.map((d) => n(byKey.get(`${d}|${p.process}`)?.good)),
        emphasis: { focus: 'series' as const },
        itemStyle: { borderRadius: 2, color: PROCESS_COLORS[p.process] ?? '#8A9893' },
        name: p.label,
        stack: 'good',
        type: 'bar' as const,
      })),
      {
        connectNulls: true,
        data: defectRate,
        itemStyle: { color: '#C2551A' },
        lineStyle: { type: 'dashed' as const, width: 2 },
        name: '残次率',
        smooth: true,
        symbolSize: 6,
        type: 'line' as const,
        yAxisIndex: 1,
      },
    ],
    tooltip: {
      axisPointer: { type: 'shadow' },
      formatter: (params: any) => {
        const list = Array.isArray(params) ? params : [params];
        const day = list[0]?.axisValue ?? '';
        const rows = list
          .filter((x: any) => x.seriesName === '残次率' || n(x.value) > 0)
          .map((x: any) => {
            const unit = x.seriesName === '残次率' ? '%' : (used.find((p) => p.label === x.seriesName)?.unit ?? '');
            return `${x.marker}${x.seriesName}&nbsp;&nbsp;<b>${x.value ?? '—'}</b>${unit}`;
          });
        return [day, ...rows].join('<br/>');
      },
      trigger: 'axis',
    },
    xAxis: {
      axisTick: { show: false },
      data: days.value.map((d) => d.slice(5)),
      type: 'category',
    },
    yAxis: [
      { splitLine: { lineStyle: { type: 'dashed' } }, type: 'value' },
      { axisLabel: { formatter: '{value}%' }, max: (v: { max: number }) => Math.max(5, Math.ceil(v.max)), splitLine: { show: false }, type: 'value' },
    ],
  });
}

onMounted(() => nextTick(render));
watch(() => [props.trend, props.from, props.to], () => nextTick(render), { deep: true });
</script>

<template>
  <div class="relative h-80">
    <div v-if="empty" class="flex h-full items-center justify-center text-sm text-muted-foreground">这段时间还没有报产出</div>
    <EchartsUI v-else ref="chartRef" height="100%" />
  </div>
</template>
