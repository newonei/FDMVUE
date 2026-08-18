<script lang="ts" setup>
import type { EchartsUIType } from '@vben/plugins/echarts';

import type { JixiaoDashboardApi } from '#/api/fdmperformance/dashboard';

import { nextTick, onMounted, ref, watch } from 'vue';

import { EchartsUI, useEcharts } from '@vben/plugins/echarts';

import { createPersonHistoryTrendOption } from '../chart-options';

const props = defineProps<{
  loading?: boolean;
  rows: JixiaoDashboardApi.EmployeeHistory[];
}>();

const chartRef = ref<EchartsUIType>();
const { renderEcharts } = useEcharts(chartRef);

async function render() {
  await nextTick();
  await renderEcharts(createPersonHistoryTrendOption(props.rows));
}

watch(
  () => props.rows,
  () => void render(),
  { deep: true },
);

onMounted(() => void render());
</script>

<template>
  <section class="chart-panel" aria-label="人员历史绩效趋势">
    <div class="panel-title">
      <div>
        <strong>历史分数趋势</strong>
        <span>同周期多张考评表保留为独立数据点</span>
      </div>
    </div>
    <div class="chart-area">
      <EchartsUI ref="chartRef" height="270px" />
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

.panel-title > div {
  display: grid;
  gap: 3px;
}

.panel-title strong {
  font-size: 15px;
  color: #172033;
}

.panel-title span {
  font-size: 12px;
  color: #64748b;
}

.chart-area {
  position: relative;
  min-height: 270px;
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
