<script lang="ts" setup>
import type { EchartsUIType } from '@vben/plugins/echarts';

import type { JixiaoDashboardApi } from '#/api/fdmperformance/dashboard';

import { nextTick, onMounted, ref, watch } from 'vue';

import { EchartsUI, useEcharts } from '@vben/plugins/echarts';

import { createPerformanceTrendOption } from '../chart-options';

const props = defineProps<{
  loading?: boolean;
  trends: JixiaoDashboardApi.PeriodTrend[];
}>();

const emit = defineEmits<{
  gradeClick: [grade: string];
}>();

const chartRef = ref<EchartsUIType>();
const { renderEcharts } = useEcharts(chartRef);

async function render() {
  await nextTick();
  const chart = await renderEcharts(createPerformanceTrendOption(props.trends));
  chart?.off('click');
  chart?.on('click', (event: unknown) => {
    const grade = (event as { seriesName?: string }).seriesName;
    if (['A', 'A+', 'B', 'C', 'C+'].includes(grade || '')) {
      emit('gradeClick', grade as string);
    }
  });
}

watch(
  () => props.trends,
  () => void render(),
  { deep: true },
);

onMounted(() => void render());
</script>

<template>
  <section class="chart-panel" aria-label="绩效周期趋势">
    <div class="panel-title">
      <div>
        <strong>周期趋势</strong>
        <span>五级绩效结果人次与平均最终分</span>
      </div>
      <span class="hint">点击等级筛选</span>
    </div>
    <div class="chart-area">
      <EchartsUI ref="chartRef" height="240px" />
      <div v-if="loading" class="chart-loading">加载中</div>
    </div>
  </section>
</template>

<style scoped>
.chart-panel {
  min-width: 0;
  padding: 14px;
  background: #fff;
  border: 1px solid #edf0f4;
  border-radius: 8px;
}

.panel-title {
  display: flex;
  gap: 8px;
  align-items: start;
  justify-content: space-between;
}

.panel-title > div {
  display: grid;
  gap: 3px;
}

.panel-title strong {
  font-size: 15px;
  color: #172033;
}

.panel-title span,
.hint {
  font-size: 12px;
  color: #64748b;
}

.hint {
  white-space: nowrap;
}

.chart-area {
  position: relative;
  min-height: 240px;
}

.chart-loading {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 13px;
  color: #64748b;
  background: rgb(255 255 255 / 72%);
}
</style>
