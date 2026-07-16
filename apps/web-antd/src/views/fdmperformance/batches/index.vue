<script lang="ts" setup>
import type { TableColumnsType } from 'ant-design-vue';

import type { JixiaoApi } from '#/api/fdmperformance';

import { onMounted, reactive, ref } from 'vue';
import { useRouter } from 'vue-router';

import { useUserStore } from '@vben/stores';

import { Button, DatePicker, Select, Table, Tabs, Tag } from 'ant-design-vue';

import { getInstancePage, getSetting } from '#/api/fdmperformance';

import { TASK_LABELS } from '../shared/constants';
import PerformanceShell from '../shared/PerformanceShell.vue';
import HrReviewQueue from './components/HrReviewQueue.vue';

defineOptions({ name: 'FdmPerformanceBatches' });

const router = useRouter();
const userStore = useUserStore();
const activeTab = ref('batches');
const isPerformanceHr = ref(false);
const instanceLoading = ref(false);
const instances = ref<JixiaoApi.Instance[]>([]);
const instanceTotal = ref(0);

function currentMonthKey() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

const instanceQuery = reactive({
  pageNo: 1,
  pageSize: 10,
  periodKey: currentMonthKey(),
  status: undefined as number | undefined,
});

const instanceColumns: TableColumnsType = [
  { dataIndex: 'userName', title: '被考核人', width: 140 },
  { dataIndex: 'deptName', ellipsis: true, title: '部门', width: 160 },
  { dataIndex: 'currentTaskName', title: '当前流程', width: 150 },
  {
    dataIndex: 'currentTaskAssigneeUserName',
    title: '当前执行人',
    width: 150,
  },
  { dataIndex: 'finalScore', title: '考核结果', width: 110 },
  { dataIndex: 'grade', title: '绩效等级', width: 100 },
  { dataIndex: 'action', fixed: 'right', title: '操作', width: 90 },
];

function currentFlow(record: JixiaoApi.Instance) {
  if (record.status === 2) return '考核结束';
  if (record.status === 3) return '已取消';
  return (
    TASK_LABELS[record.currentTaskKey || ''] ||
    record.currentTaskName ||
    '等待流程处理'
  );
}

function currentExecutor(record: JixiaoApi.Instance) {
  if (record.status !== 1) return '-';
  if (record.currentTaskAssigneeUserName) {
    return record.currentTaskAssigneeUserName;
  }
  if (record.currentTaskKey === 'JIXIAO_HR_REVIEW') {
    return '绩效 HR';
  }
  return '待分配';
}

function gradeColor(grade?: string) {
  if (grade === 'A+') return 'green';
  if (grade === 'A') return 'cyan';
  if (grade === 'C+') return 'orange';
  if (grade === 'C') return 'red';
  return 'blue';
}

async function loadInstances() {
  instanceLoading.value = true;
  try {
    const data = await getInstancePage(instanceQuery);
    instances.value = data.list;
    instanceTotal.value = data.total;
  } finally {
    instanceLoading.value = false;
  }
}

function searchInstances() {
  instanceQuery.pageNo = 1;
  void loadInstances();
}

function changePeriodMonth() {
  searchInstances();
}

function monthLabel(periodKey: string) {
  const [year, month] = periodKey.split('-');
  return year && month ? `${year}年${month}月` : periodKey;
}

function openInstance(record: JixiaoApi.Instance) {
  router.push(
    `/fdmperformance/batches/${record.batchId}/instances/${record.id}`,
  );
}

function changeInstancePage(pagination: any) {
  instanceQuery.pageNo = pagination.current;
  instanceQuery.pageSize = pagination.pageSize;
  loadInstances();
}

async function initialize() {
  const [setting] = await Promise.all([getSetting(), loadInstances()]);
  const currentUserId = Number(
    userStore.userInfo?.id ?? userStore.userInfo?.userId ?? 0,
  );
  isPerformanceHr.value = (setting.hrUserIds || []).includes(currentUserId);
  if (isPerformanceHr.value) {
    activeTab.value = 'hr-review';
  }
}

onMounted(initialize);
</script>

<template>
  <PerformanceShell title="考核管理">
    <Tabs v-model:active-key="activeTab" class="management-tabs">
      <Tabs.TabPane v-if="isPerformanceHr" key="hr-review" tab="待人事审核">
        <HrReviewQueue />
      </Tabs.TabPane>
      <Tabs.TabPane key="batches" tab="月度考核">
        <div class="filter-bar">
          <DatePicker
            v-model:value="instanceQuery.periodKey"
            :allow-clear="false"
            format="YYYY年MM月"
            :input-read-only="true"
            picker="month"
            placeholder="选择月份"
            value-format="YYYY-MM"
            @change="changePeriodMonth"
          />
          <Select
            v-model:value="instanceQuery.status"
            allow-clear
            :options="[
              { label: '进行中', value: 1 },
              { label: '已完成', value: 2 },
              { label: '已取消', value: 3 },
            ]"
            placeholder="全部状态"
          />
          <Button type="primary" @click="searchInstances">查询</Button>
        </div>

        <div class="instance-panel">
          <div class="panel-head">
            <strong>{{ monthLabel(instanceQuery.periodKey) }}考核人员</strong>
          </div>
          <Table
            :columns="instanceColumns"
            :data-source="instances"
            :loading="instanceLoading"
            :pagination="{
              current: instanceQuery.pageNo,
              pageSize: instanceQuery.pageSize,
              total: instanceTotal,
            }"
            :scroll="{ x: 1100 }"
            row-key="id"
            @change="changeInstancePage"
          >
            <template #bodyCell="{ column, record }">
              <template v-if="column.dataIndex === 'deptName'">
                {{ record[column.dataIndex] || '-' }}
              </template>
              <template v-else-if="column.dataIndex === 'currentTaskName'">
                {{ currentFlow(record) }}
              </template>
              <template
                v-else-if="column.dataIndex === 'currentTaskAssigneeUserName'"
              >
                {{ currentExecutor(record) }}
              </template>
              <template v-else-if="column.dataIndex === 'finalScore'">
                {{ record.finalScore ?? '-' }}
              </template>
              <template v-else-if="column.dataIndex === 'grade'">
                <Tag v-if="record.grade" :color="gradeColor(record.grade)">
                  {{ record.grade }}
                </Tag>
                <span v-else>-</span>
              </template>
              <template v-else-if="column.dataIndex === 'action'">
                <Button size="small" type="link" @click="openInstance(record)">
                  详情
                </Button>
              </template>
            </template>
          </Table>
        </div>
      </Tabs.TabPane>
    </Tabs>
  </PerformanceShell>
</template>

<style scoped>
.filter-bar,
.instance-panel {
  padding: 12px;
  background: #fff;
  border: 1px solid #edf0f4;
  border-radius: 8px;
}

.management-tabs {
  min-width: 0;
}

.filter-bar {
  display: grid;
  grid-template-columns: 180px 140px auto;
  gap: 8px;
}

.panel-head {
  display: flex;
  gap: 12px;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 10px;
}

@media (max-width: 900px) {
  .filter-bar,
  .panel-head {
    grid-template-columns: 1fr;
  }

  .panel-head {
    flex-direction: column;
    align-items: flex-start;
  }
}
</style>
