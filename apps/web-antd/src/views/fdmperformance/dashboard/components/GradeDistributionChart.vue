<script lang="ts" setup>
import type { EchartsUIType } from '@vben/plugins/echarts';

import type { JixiaoDashboardApi } from '#/api/fdmperformance/dashboard';

import { nextTick, onMounted, ref, watch } from 'vue';

import { EchartsUI, useEcharts } from '@vben/plugins/echarts';

import { formatPerformanceRate } from '../../shared/format';
import { createGradeDistributionOption } from '../chart-options';

const props = defineProps<{
  details: JixiaoDashboardApi.GradeCount[];
  loading?: boolean;
}>();

const emit = defineEmits<{
  gradeClick: [grade: string];
}>();

const chartRef = ref<EchartsUIType>();
const { renderEcharts } = useEcharts(chartRef);

async function render() {
  await nextTick();
  const chart = await renderEcharts(createGradeDistributionOption(props.details));
  chart?.off('click');
  chart?.on('click', (event: unknown) => {
    const grade = (event as { seriesName?: string }).seriesName;
    if (['A', 'A+', 'B', 'C', 'C+'].includes(grade || '')) {
      emit('gradeClick', grade as string);
    }
  });
}

watch(
  () => props.details,
  () => void render(),
  { deep: true },
);

onMounted(() => void render());
</script>

<template>
  <section class="chart-panel" aria-label="绩效等级分布">
    <div class="panel-title">
      <div>
        <strong>等级分布</strong>
        <span>A档 = A+ / A，B档 = B，C档 = C+ / C</span>
      </div>
      <span class="hint">点击等级筛选</span>
    </div>
    <div class="chart-area">
      <EchartsUI ref="chartRef" height="240px" />
      <div v-if="loading" class="chart-loading">加载中</div>
    </div>
    <div class="grade-details">
      <span v-for="item in details" :key="item.grade">
        <i :style="{ background: item.grade === 'A+' ? '#15803d' : item.grade === 'A' ? '#22a06b' : item.grade === 'B' ? '#1677ff' : item.grade === 'C+' ? '#f59e0b' : '#ef4444' }"></i>
        {{ item.grade }} {{ item.count }} 人次
        {{ item.rate === undefined ? '-' : `(${formatPerformanceRate(item.rate)})` }}
      </span>
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

.grade-details {
  display: flex;
  flex-wrap: wrap;
  gap: 8px 14px;
  padding-top: 6px;
  font-size: 12px;
  color: #475569;
}

.grade-details span {
  display: inline-flex;
  gap: 5px;
  align-items: center;
}

.grade-details i {
  width: 8px;
  height: 8px;
  border-radius: 50%;
}
</style>
