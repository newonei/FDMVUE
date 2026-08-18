<script lang="ts" setup>
import type { TableColumnsType, TablePaginationConfig } from 'ant-design-vue';

import type { JixiaoDashboardApi } from '#/api/fdmperformance/dashboard';

import { Button, Space, Table, Tag } from 'ant-design-vue';

import { PERFORMANCE_PAGE_SIZE_OPTIONS } from '../../shared/constants';
import { formatPerformanceDateTime } from '../../shared/format';

const props = defineProps<{
  canQueryReview?: boolean;
  loading?: boolean;
  pageNo: number;
  pageSize: number;
  rows: JixiaoDashboardApi.EmployeeHistory[];
  total: number;
}>();

const emit = defineEmits<{
  changePage: [pageNo: number, pageSize: number];
  openInstance: [record: JixiaoDashboardApi.EmployeeHistory];
  openPerson: [record: JixiaoDashboardApi.EmployeeHistory];
  openReview: [record: JixiaoDashboardApi.EmployeeHistory];
}>();

const columns: TableColumnsType<JixiaoDashboardApi.EmployeeHistory> = [
  { dataIndex: 'userName', fixed: 'left', title: '员工', width: 130 },
  { dataIndex: 'deptName', title: '历史部门', width: 155 },
  { dataIndex: 'periodLabel', title: '考核周期', width: 112 },
  { dataIndex: 'templateName', ellipsis: true, title: '考评表 / 批次', width: 195 },
  { dataIndex: 'supervisorUserName', title: '历史主管', width: 125 },
  { dataIndex: 'finalScore', title: '最终分', width: 90 },
  { dataIndex: 'grade', title: '等级', width: 76 },
  { dataIndex: 'gradeGroup', title: '档位', width: 76 },
  { dataIndex: 'employeeConfirmed', title: '员工确认', width: 100 },
  { dataIndex: 'publicTime', title: '公示时间', width: 170 },
  { dataIndex: 'reviewStatus', title: 'C/C+复盘', width: 122 },
  { dataIndex: 'action', fixed: 'right', title: '操作', width: 222 },
];

function gradeColor(grade?: string) {
  if (grade === 'A+') return 'green';
  if (grade === 'A') return 'cyan';
  if (grade === 'C+') return 'orange';
  if (grade === 'C') return 'red';
  return 'blue';
}

function reviewStatus(status?: number) {
  if (status === 0) return { color: 'orange', text: '待主管填写' };
  if (status === 1) return { color: 'processing', text: '待员工确认' };
  if (status === 2) return { color: 'default', text: '已关闭' };
  if (status === 3) return { color: 'green', text: '已完成' };
  return { color: 'default', text: '-' };
}

function changePage(pagination: TablePaginationConfig) {
  emit('changePage', pagination.current || 1, pagination.pageSize || props.pageSize);
}

function asHistory(record: unknown) {
  return record as JixiaoDashboardApi.EmployeeHistory;
}
</script>

<template>
  <section class="table-panel" aria-label="人员历史绩效结果">
    <div class="panel-head">
      <div>
        <strong>人员历史</strong>
        <span>每条结果单独展示；同一员工同周期的多张考评表不会合并</span>
      </div>
    </div>
    <Table
      class="performance-compact-table"
      :columns="columns"
      :data-source="rows"
      :loading="loading"
      :pagination="{
        current: pageNo,
        pageSize,
        pageSizeOptions: PERFORMANCE_PAGE_SIZE_OPTIONS,
        showSizeChanger: true,
        size: 'small',
        total,
      }"
      :scroll="{ x: 1630 }"
      row-key="resultId"
      size="small"
      @change="changePage"
    >
      <template #bodyCell="{ column, record }">
        <template v-if="column.dataIndex === 'userName'">
          <Button size="small" type="link" @click="emit('openPerson', asHistory(record))">
            {{ record.userName }}
          </Button>
        </template>
        <template v-else-if="column.dataIndex === 'templateName'">
          <span :title="`${record.templateName} / ${record.batchName}`">
            {{ record.templateName }} / {{ record.batchName }}
          </span>
        </template>
        <template v-else-if="column.dataIndex === 'finalScore'">
          {{ record.finalScore === undefined || record.finalScore === null ? '-' : record.finalScore.toFixed(1) }}
        </template>
        <template v-else-if="column.dataIndex === 'grade'">
          <Tag :color="gradeColor(record.grade)">{{ record.grade }}</Tag>
        </template>
        <template v-else-if="column.dataIndex === 'gradeGroup'">
          {{ record.gradeGroup }}档
        </template>
        <template v-else-if="column.dataIndex === 'employeeConfirmed'">
          <Tag :color="record.employeeConfirmed ? 'green' : 'orange'">
            {{ record.employeeConfirmed ? '已确认' : '待确认' }}
          </Tag>
        </template>
        <template v-else-if="column.dataIndex === 'publicTime'">
          {{ formatPerformanceDateTime(record.publicTime) }}
        </template>
        <template v-else-if="column.dataIndex === 'reviewStatus'">
          <Tag v-if="record.reviewId" :color="reviewStatus(record.reviewStatus).color">
            {{ reviewStatus(record.reviewStatus).text }}
          </Tag>
          <span v-else>-</span>
        </template>
        <template v-else-if="column.dataIndex === 'action'">
          <Space :size="0">
            <Button size="small" type="link" @click="emit('openPerson', asHistory(record))">历史</Button>
            <Button size="small" type="link" @click="emit('openInstance', asHistory(record))">考核详情</Button>
            <Button
              v-if="props.canQueryReview && record.reviewId"
              size="small"
              type="link"
              @click="emit('openReview', asHistory(record))"
            >
              查看复盘
            </Button>
          </Space>
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
</style>
