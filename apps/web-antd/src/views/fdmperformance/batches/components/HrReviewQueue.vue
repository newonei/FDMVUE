<script lang="ts" setup>
import type { TableColumnsType } from 'ant-design-vue';

import type { JixiaoApi } from '#/api/fdmperformance';

import { computed, onMounted, reactive, ref } from 'vue';
import { useRouter } from 'vue-router';

import { Button, message, Popconfirm, Space, Table, Tag } from 'ant-design-vue';

import { batchHrReview, getHrReviewPendingPage } from '#/api/fdmperformance';

defineOptions({ name: 'FdmPerformanceHrReviewQueue' });

const router = useRouter();
const loading = ref(false);
const submitting = ref(false);
const rows = ref<JixiaoApi.HrReviewPendingItem[]>([]);
const total = ref(0);
const selectedInstanceIds = ref<number[]>([]);
const query = reactive<JixiaoApi.HrReviewPendingPageParams>({
  pageNo: 1,
  pageSize: 10,
});

const columns: TableColumnsType = [
  { dataIndex: 'batchName', title: '考核批次', width: 220 },
  { dataIndex: 'periodKey', title: '周期', width: 120 },
  { dataIndex: 'userName', title: '被考核人', width: 130 },
  { dataIndex: 'supervisorUserName', title: '主管', width: 150 },
  { dataIndex: 'finalScore', title: '最终分', width: 100 },
  { dataIndex: 'taskAssigneeUserName', title: '当前处理人', width: 160 },
  { dataIndex: 'action', fixed: 'right', title: '操作', width: 90 },
];

function canReview(record: JixiaoApi.HrReviewPendingItem) {
  return typeof record.instanceId === 'number' && Boolean(record.taskId);
}

const rowSelection = computed(() => ({
  preserveSelectedRowKeys: true,
  selectedRowKeys: selectedInstanceIds.value,
  getCheckboxProps: (record: JixiaoApi.HrReviewPendingItem) => ({
    disabled: !canReview(record),
  }),
  onChange: (keys: Array<number | string>) => {
    selectedInstanceIds.value = keys
      .map(Number)
      .filter((key) => Number.isFinite(key));
  },
}));

async function load() {
  loading.value = true;
  try {
    const data = await getHrReviewPendingPage(query);
    rows.value = data.list;
    total.value = data.total;
  } finally {
    loading.value = false;
  }
}

async function refresh() {
  selectedInstanceIds.value = [];
  query.pageNo = 1;
  await load();
}

async function submitSelected() {
  if (selectedInstanceIds.value.length === 0) return;
  const instanceIds = [...selectedInstanceIds.value];
  submitting.value = true;
  try {
    await batchHrReview({ instanceIds });
    selectedInstanceIds.value = [];
    message.success(`已审核通过 ${instanceIds.length} 条绩效记录`);
    await load();
  } finally {
    submitting.value = false;
  }
}

function openInstance(record: JixiaoApi.HrReviewPendingItem) {
  if (!record.batchId || !record.instanceId) return;
  router.push(
    `/fdmperformance/batches/${record.batchId}/instances/${record.instanceId}`,
  );
}

function changePage(pagination: any) {
  query.pageNo = pagination.current;
  query.pageSize = pagination.pageSize;
  load();
}

onMounted(load);
</script>

<template>
  <div class="queue-panel">
    <div class="queue-head">
      <div class="queue-title">
        <strong>全部待审核</strong>
        <span>共 {{ total }} 条</span>
      </div>
      <Space wrap>
        <span class="selected-count">
          已选择 {{ selectedInstanceIds.length }} 项
        </span>
        <Button
          :disabled="selectedInstanceIds.length === 0"
          size="small"
          type="link"
          @click="selectedInstanceIds = []"
        >
          清空
        </Button>
        <Button :loading="loading" @click="refresh">刷新列表</Button>
        <Popconfirm
          :title="`确认审核通过选中的 ${selectedInstanceIds.length} 条绩效记录？`"
          @confirm="submitSelected"
        >
          <Button
            :disabled="selectedInstanceIds.length === 0"
            :loading="submitting"
            type="primary"
          >
            批量审核通过
          </Button>
        </Popconfirm>
      </Space>
    </div>

    <Table
      class="performance-compact-table"
      :columns="columns"
      :data-source="rows"
      :loading="loading"
      :pagination="{
        current: query.pageNo,
        pageSize: query.pageSize,
        size: 'small',
        total,
      }"
      :row-selection="rowSelection"
      :scroll="{ x: 970 }"
      row-key="instanceId"
      size="small"
      @change="changePage"
    >
      <template #bodyCell="{ column, record }">
        <template v-if="column.dataIndex === 'batchName'">
          <div class="batch-cell">
            <span>{{ record.batchName || '-' }}</span>
            <small>{{ record.templateName || '-' }}</small>
          </div>
        </template>
        <template v-else-if="column.dataIndex === 'taskAssigneeUserName'">
          <Tag :color="record.taskAssigneeUserName ? 'default' : 'blue'">
            {{ record.taskAssigneeUserName || '绩效 HR 共享待办' }}
          </Tag>
        </template>
        <template v-else-if="column.dataIndex === 'action'">
          <Button size="small" type="link" @click="openInstance(record)">
            详情
          </Button>
        </template>
      </template>
    </Table>
  </div>
</template>

<style scoped>
.queue-panel {
  min-width: 0;
  padding: 12px;
  background: #fff;
  border: 1px solid #edf0f4;
  border-radius: 8px;
}

.queue-head,
.queue-title,
.batch-cell {
  display: flex;
}

.queue-head {
  gap: 12px;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 10px;
}

.queue-title {
  gap: 10px;
  align-items: baseline;
}

.queue-title span,
.selected-count,
.batch-cell small {
  color: #60666f;
}

.batch-cell {
  flex-direction: column;
  gap: 2px;
}

@media (max-width: 800px) {
  .queue-head {
    flex-direction: column;
    align-items: stretch;
  }
}
</style>
