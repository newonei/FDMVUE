<script lang="ts" setup>
import type { TableColumnsType } from 'ant-design-vue';

import type { JixiaoDashboardApi } from '#/api/fdmperformance/dashboard';

import { Button, Table, Tag } from 'ant-design-vue';

import { formatPerformanceRate } from '../../shared/format';

const props = defineProps<{
  loading?: boolean;
  rows: JixiaoDashboardApi.DepartmentSummary[];
}>();

const emit = defineEmits<{
  selectDept: [deptId: JixiaoDashboardApi.Id];
}>();

const columns: TableColumnsType<JixiaoDashboardApi.DepartmentSummary> = [
  { dataIndex: 'deptName', fixed: 'left', title: '历史部门', width: 180 },
  {
    dataIndex: 'resultCount',
    defaultSortOrder: 'descend',
    sorter: (left, right) => left.resultCount - right.resultCount,
    title: '结果人次',
    width: 105,
  },
  {
    dataIndex: 'employeeCount',
    sorter: (left, right) => left.employeeCount - right.employeeCount,
    title: '去重员工',
    width: 105,
  },
  {
    dataIndex: 'averageScore',
    sorter: (left, right) =>
      (left.averageScore || 0) - (right.averageScore || 0),
    title: '平均分',
    width: 90,
  },
  { dataIndex: 'aplusCount', title: 'A+', width: 70 },
  { dataIndex: 'aCount', title: 'A', width: 65 },
  { dataIndex: 'bCount', title: 'B', width: 65 },
  { dataIndex: 'cplusCount', title: 'C+', width: 70 },
  { dataIndex: 'cCount', title: 'C', width: 65 },
  {
    dataIndex: 'aRate',
    sorter: (left, right) => (left.aRate || 0) - (right.aRate || 0),
    title: 'A档率',
    width: 90,
  },
  {
    dataIndex: 'cRate',
    sorter: (left, right) => (left.cRate || 0) - (right.cRate || 0),
    title: 'C档率',
    width: 90,
  },
  { dataIndex: 'averageScoreChange', title: '上期平均分变化', width: 135 },
];

function change(value?: number) {
  if (value === undefined || value === null) return '-';
  return `${value > 0 ? '+' : ''}${value.toFixed(1)}`;
}
</script>

<template>
  <section class="table-panel" aria-label="部门绩效横向比较">
    <div class="panel-head">
      <div>
        <strong>部门对比</strong>
        <span>按考核发起时冻结部门统计，点击部门可缩小人员历史范围</span>
      </div>
    </div>
    <Table
      class="performance-compact-table"
      :columns="columns"
      :data-source="rows"
      :loading="loading"
      :pagination="false"
      :scroll="{ x: 1220 }"
      row-key="deptId"
      size="small"
    >
      <template #bodyCell="{ column, record }">
        <template v-if="column.dataIndex === 'deptName'">
          <Button size="small" type="link" @click="emit('selectDept', record.deptId)">
            {{ record.deptName }}
          </Button>
        </template>
        <template v-else-if="column.dataIndex === 'averageScore'">
          {{ record.averageScore === undefined || record.averageScore === null ? '-' : record.averageScore.toFixed(1) }}
        </template>
        <template v-else-if="column.dataIndex === 'aRate'">
          <Tag color="green">{{ formatPerformanceRate(record.aRate) }}</Tag>
        </template>
        <template v-else-if="column.dataIndex === 'cRate'">
          <Tag color="red">{{ formatPerformanceRate(record.cRate) }}</Tag>
        </template>
        <template v-else-if="column.dataIndex === 'averageScoreChange'">
          <span :class="record.averageScoreChange && record.averageScoreChange < 0 ? 'negative' : 'positive'">
            {{ change(record.averageScoreChange) }}
          </span>
        </template>
      </template>
    </Table>
  </section>
</template>

<style scoped>
.table-panel {
  min-width: 0;
  padding: 14px;
  background: #fff;
  border: 1px solid #edf0f4;
  border-radius: 8px;
}

.panel-head {
  margin-bottom: 10px;
}

.panel-head > div {
  display: grid;
  gap: 3px;
}

.panel-head strong {
  font-size: 15px;
  color: #172033;
}

.panel-head span {
  font-size: 12px;
  color: #64748b;
}

.positive {
  color: #15803d;
}

.negative {
  color: #dc2626;
}
</style>
