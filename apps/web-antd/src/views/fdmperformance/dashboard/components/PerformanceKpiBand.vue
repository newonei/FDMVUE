<script lang="ts" setup>
import type { JixiaoDashboardApi } from '#/api/fdmperformance/dashboard';

import { formatPerformanceRate } from '../../shared/format';

const props = defineProps<{
  gradeGroups: JixiaoDashboardApi.GradeGroup[];
  kpi: JixiaoDashboardApi.Kpi | null;
  performanceHr: boolean;
}>();

function value(value?: number) {
  return value === undefined || value === null ? '-' : String(value);
}

function score(value?: number) {
  return value === undefined || value === null ? '-' : value.toFixed(1);
}

function rate(gradeGroup: 'A' | 'B' | 'C') {
  const item = props.gradeGroups.find((group) => group.gradeGroup === gradeGroup);
  return formatPerformanceRate(item?.rate);
}

const items = [
  { key: 'resultCount', label: '绩效结果人次', get: () => value(props.kpi?.resultCount) },
  { key: 'employeeCount', label: '去重员工数', get: () => value(props.kpi?.employeeCount) },
  { key: 'averageScore', label: '平均最终分', get: () => score(props.kpi?.averageScore) },
  { key: 'A', label: 'A档占比', get: () => rate('A') },
  { key: 'B', label: 'B档占比', get: () => rate('B') },
  { key: 'C', label: 'C档占比', get: () => rate('C') },
];
</script>

<template>
  <section class="kpi-band" aria-label="绩效统计概览">
    <div v-for="item in items" :key="item.key" class="kpi-item">
      <span>{{ item.label }}</span>
      <strong>{{ item.get() }}</strong>
    </div>
    <div v-if="performanceHr" class="kpi-item">
      <span>公示率</span>
      <strong>{{ formatPerformanceRate(kpi?.publicRate) }}</strong>
    </div>
  </section>
</template>

<style scoped>
.kpi-band {
  display: grid;
  grid-template-columns: repeat(6, minmax(0, 1fr));
  overflow: hidden;
  background: #fff;
  border: 1px solid #edf0f4;
  border-radius: 8px;
}

.kpi-item {
  display: grid;
  gap: 4px;
  min-height: 76px;
  padding: 14px 16px;
  border-right: 1px solid #edf0f4;
}

.kpi-item:last-child {
  border-right: 0;
}

.kpi-item span {
  font-size: 12px;
  color: #64748b;
}

.kpi-item strong {
  font-size: 22px;
  font-variant-numeric: tabular-nums;
  color: #172033;
}

@media (max-width: 1080px) {
  .kpi-band {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }

  .kpi-item:nth-child(3n) {
    border-right: 0;
  }
}

@media (max-width: 600px) {
  .kpi-band {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .kpi-item {
    border-bottom: 1px solid #edf0f4;
  }
}
</style>
