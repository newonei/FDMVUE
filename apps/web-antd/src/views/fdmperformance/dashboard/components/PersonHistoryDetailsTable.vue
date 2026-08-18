<script lang="ts" setup>
import type { TableColumnsType, TablePaginationConfig } from 'ant-design-vue';

import type { JixiaoDashboardApi } from '#/api/fdmperformance/dashboard';

import { ref } from 'vue';

import { Button, Empty, Table, Tag } from 'ant-design-vue';

import { PERFORMANCE_PAGE_SIZE_OPTIONS } from '../../shared/constants';
import { formatPerformanceDateTime } from '../../shared/format';

const props = defineProps<{
  canQueryReview?: boolean;
  gradeLogsByResult: Record<string, JixiaoDashboardApi.GradeLog[]>;
  loading?: boolean;
  loadingGradeLogIds: string[];
  pageNo: number;
  pageSize: number;
  rows: JixiaoDashboardApi.EmployeeHistory[];
  total: number;
}>();

const emit = defineEmits<{
  changePage: [pageNo: number, pageSize: number];
  loadGradeLogs: [record: JixiaoDashboardApi.EmployeeHistory];
  openInstance: [record: JixiaoDashboardApi.EmployeeHistory];
  openReview: [record: JixiaoDashboardApi.EmployeeHistory];
}>();

const expandedRowKeys = ref<JixiaoDashboardApi.Id[]>([]);

const columns: TableColumnsType<JixiaoDashboardApi.EmployeeHistory> = [
  { dataIndex: 'periodLabel', fixed: 'left', title: '考核周期', width: 112 },
  { dataIndex: 'templateName', ellipsis: true, title: '考评表 / 批次', width: 210 },
  { dataIndex: 'deptName', title: '历史部门', width: 155 },
  { dataIndex: 'supervisorUserName', title: '历史主管', width: 125 },
  { dataIndex: 'finalScore', title: '最终分', width: 90 },
  { dataIndex: 'grade', title: '当前等级', width: 92 },
  { dataIndex: 'employeeConfirmed', title: '员工确认', width: 100 },
  { dataIndex: 'publicTime', title: '公示时间', width: 170 },
  { dataIndex: 'reviewStatus', title: 'C/C+复盘', width: 122 },
  { dataIndex: 'action', fixed: 'right', title: '操作', width: 180 },
];

const logColumns: TableColumnsType<JixiaoDashboardApi.GradeLog> = [
  { dataIndex: 'oldGrade', title: '原等级', width: 100 },
  { dataIndex: 'newGrade', title: '新等级', width: 100 },
  { dataIndex: 'operatorUserName', title: '调整人', width: 140 },
  { dataIndex: 'reason', title: '调整原因' },
  { dataIndex: 'createTime', title: '调整时间', width: 180 },
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

function changeExpanded(expanded: boolean, record: unknown) {
  const history = asHistory(record);
  const existing = expandedRowKeys.value.filter((id) => id !== history.resultId);
  expandedRowKeys.value = expanded ? [...existing, history.resultId] : existing;
  if (expanded) {
    emit('loadGradeLogs', history);
  }
}

function asHistory(record: unknown) {
  return record as JixiaoDashboardApi.EmployeeHistory;
}
</script>

<template>
  <section class="table-panel" aria-label="人员历史绩效明细">
    <div class="panel-head">
      <div>
        <strong>历史绩效明细</strong>
        <span>展开一条结果可查看人工调级审计记录</span>
      </div>
    </div>
    <Table
      class="performance-compact-table"
      :columns="columns"
      :data-source="rows"
      :expanded-row-keys="expandedRowKeys"
      :loading="loading"
      :pagination="{
        current: pageNo,
        pageSize,
        pageSizeOptions: PERFORMANCE_PAGE_SIZE_OPTIONS,
        showSizeChanger: true,
        size: 'small',
        total,
      }"
      :scroll="{ x: 1380 }"
      row-key="resultId"
      size="small"
      @change="changePage"
      @expand="changeExpanded"
    >
      <template #bodyCell="{ column, record }">
        <template v-if="column.dataIndex === 'templateName'">
          {{ record.templateName }} / {{ record.batchName }}
        </template>
        <template v-else-if="column.dataIndex === 'finalScore'">
          {{ record.finalScore === undefined || record.finalScore === null ? '-' : record.finalScore.toFixed(1) }}
        </template>
        <template v-else-if="column.dataIndex === 'grade'">
          <Tag :color="gradeColor(record.grade)">{{ record.grade }}</Tag>
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
          <Button size="small" type="link" @click="emit('openInstance', asHistory(record))">
            考核详情
          </Button>
          <Button
            v-if="props.canQueryReview && record.reviewId"
            size="small"
            type="link"
            @click="emit('openReview', asHistory(record))"
          >
            查看复盘
          </Button>
        </template>
      </template>

      <template #expandedRowRender="{ record }">
        <div class="grade-log-area">
          <div v-if="loadingGradeLogIds.includes(String(record.resultId))" class="log-state">
            正在加载调级记录…
          </div>
          <Table
            v-else-if="(gradeLogsByResult[String(record.resultId)] || []).length > 0"
            :columns="logColumns"
            :data-source="gradeLogsByResult[String(record.resultId)] || []"
            :pagination="false"
            row-key="id"
            size="small"
          >
            <template #bodyCell="{ column: logColumn, record: logRecord }">
              <template v-if="logColumn.dataIndex === 'oldGrade' || logColumn.dataIndex === 'newGrade'">
                <Tag :color="gradeColor(logColumn.dataIndex === 'oldGrade' ? logRecord.oldGrade : logRecord.newGrade)">
                  {{ (logColumn.dataIndex === 'oldGrade' ? logRecord.oldGrade : logRecord.newGrade) || '-' }}
                </Tag>
              </template>
              <template v-else-if="logColumn.dataIndex === 'createTime'">
                {{ formatPerformanceDateTime(logRecord.createTime) }}
              </template>
            </template>
          </Table>
          <Empty v-else :image="Empty.PRESENTED_IMAGE_SIMPLE" description="暂无人工调级记录" />
        </div>
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

.panel-head span,
.log-state {
  font-size: 12px;
  color: #64748b;
}

.grade-log-area {
  padding: 4px 10px 8px 38px;
}

.log-state {
  padding: 14px 0;
}
</style>
