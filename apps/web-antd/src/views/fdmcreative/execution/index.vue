<script lang="ts" setup>
import type { TableColumnsType, TablePaginationConfig } from 'ant-design-vue';

import type { FdmCreativeApi } from '#/api/fdmcreative';

import { onMounted, reactive, ref } from 'vue';
import { useRoute } from 'vue-router';

import {
  Button,
  Drawer,
  Progress,
  Select,
  Space,
  Table,
  Tag,
} from 'ant-design-vue';

import {
  cancelCreativeExecution,
  getCreativeExecution,
  getCreativeExecutionPage,
  retryCreativeNode,
} from '#/api/fdmcreative';

import CreativeShell from '../shared/CreativeShell.vue';

defineOptions({ name: 'FdmCreativeExecutions' });

const route = useRoute();
const loading = ref(false);
const detailLoading = ref(false);
const drawerOpen = ref(false);
const rows = ref<FdmCreativeApi.Execution[]>([]);
const detail = ref<FdmCreativeApi.ExecutionDetail>();
const total = ref(0);
const query = reactive<FdmCreativeApi.ExecutionPageParams>({
  pageNo: 1,
  pageSize: 20,
});

const columns: TableColumnsType = [
  { dataIndex: 'id', title: '任务编号', width: 110 },
  { dataIndex: 'projectId', title: '项目编号', width: 120 },
  { dataIndex: 'scope', title: '范围', width: 110 },
  { dataIndex: 'status', title: '状态', width: 120 },
  { dataIndex: 'progress', title: '进度', width: 180 },
  { dataIndex: 'startedTime', title: '开始时间', width: 180 },
  { dataIndex: 'action', fixed: 'right', title: '操作', width: 160 },
];

const statusColor: Record<string, string> = {
  CANCELED: 'default',
  CANCEL_REQUESTED: 'warning',
  CREATED: 'blue',
  FAILED: 'red',
  PARTIAL_SUCCESS: 'orange',
  RUNNING: 'processing',
  SUCCEEDED: 'green',
};

async function load() {
  loading.value = true;
  try {
    const data = await getCreativeExecutionPage(query);
    rows.value = data.list;
    total.value = data.total;
  } finally {
    loading.value = false;
  }
}

async function openDetail(record: Record<string, unknown>) {
  const row = record as unknown as FdmCreativeApi.Execution;
  await openExecutionDetail(row.id);
}

async function openExecutionDetail(executionId: number) {
  drawerOpen.value = true;
  detailLoading.value = true;
  try {
    detail.value = await getCreativeExecution(executionId);
  } finally {
    detailLoading.value = false;
  }
}

async function cancel(record: Record<string, unknown>) {
  const row = record as unknown as FdmCreativeApi.Execution;
  await cancelCreativeExecution(row.id);
  await load();
}

async function retry(nodeRunId: number) {
  await retryCreativeNode(nodeRunId);
  if (detail.value) detail.value = await getCreativeExecution(detail.value.id);
}

function executionProgress(record: Record<string, unknown>) {
  const row = record as unknown as FdmCreativeApi.Execution;
  if (!row.totalNodeCount) return 0;
  return Math.round(
    (((row.succeededNodeCount ?? 0) + (row.failedNodeCount ?? 0)) /
      row.totalNodeCount) *
      100,
  );
}

function handleTableChange(pagination: TablePaginationConfig) {
  query.pageNo = pagination.current ?? 1;
  query.pageSize = pagination.pageSize ?? query.pageSize ?? 20;
  void load();
}

onMounted(() => {
  void (async () => {
    await load();
    const rawExecutionId = route.query.executionId;
    const executionId = Number(
      Array.isArray(rawExecutionId) ? rawExecutionId[0] : rawExecutionId,
    );
    if (Number.isSafeInteger(executionId) && executionId > 0) {
      await openExecutionDetail(executionId);
    }
  })();
});
</script>

<template>
  <CreativeShell
    description="查看节点执行进度、失败原因，并重试独立失败分支"
    title="生成任务"
  >
    <template #actions><Button @click="load">刷新</Button></template>
    <div class="filter-bar">
      <Select
        v-model:value="query.status"
        allow-clear
        :options="[
          { label: '已创建', value: 'CREATED' },
          { label: '执行中', value: 'RUNNING' },
          { label: '部分成功', value: 'PARTIAL_SUCCESS' },
          { label: '取消中', value: 'CANCEL_REQUESTED' },
          { label: '已完成', value: 'SUCCEEDED' },
          { label: '失败', value: 'FAILED' },
          { label: '已取消', value: 'CANCELED' },
        ]"
        placeholder="任务状态"
      />
      <Button type="primary" @click="load">查询</Button>
    </div>
    <Table
      :columns="columns"
      :data-source="rows"
      :loading="loading"
      :pagination="{
        current: query.pageNo,
        pageSize: query.pageSize,
        showSizeChanger: true,
        total,
      }"
      row-key="id"
      @change="handleTableChange"
    >
      <template #bodyCell="{ column, record }">
        <template v-if="column.dataIndex === 'status'">
          <Tag :color="statusColor[record.status] || 'default'">
            {{ record.status }}
          </Tag>
        </template>
        <template v-else-if="column.dataIndex === 'progress'">
          <Progress :percent="executionProgress(record)" size="small" />
        </template>
        <template v-else-if="column.dataIndex === 'action'">
          <Space>
            <Button size="small" type="link" @click="openDetail(record)">
              详情
            </Button>
            <Button
              v-access:code="['fdmcreative:execution:cancel']"
              v-if="['CREATED', 'RUNNING'].includes(record.status)"
              danger
              size="small"
              type="link"
              @click="cancel(record)"
            >
              取消
            </Button>
          </Space>
        </template>
      </template>
    </Table>

    <Drawer v-model:open="drawerOpen" title="任务详情" :width="680">
      <Table
        :data-source="detail?.nodeRuns || []"
        :loading="detailLoading"
        :pagination="false"
        row-key="id"
        size="small"
      >
        <Table.Column data-index="nodeType" title="节点">
          <template #default="{ record }">
            {{ record.nodeType || record.nodeId }}
          </template>
        </Table.Column>
        <Table.Column data-index="status" title="状态">
          <template #default="{ record }">
            <Tag :color="statusColor[record.status] || 'default'">
              {{ record.status }}
            </Tag>
          </template>
        </Table.Column>
        <Table.Column data-index="attemptNo" title="尝试次数" />
        <Table.Column title="操作" :width="90">
          <template #default="{ record }">
            <Button
              v-access:code="['fdmcreative:execution:retry']"
              v-if="record.status === 'FAILED'"
              size="small"
              type="link"
              @click="retry(record.id)"
            >
              重试
            </Button>
          </template>
        </Table.Column>
      </Table>
    </Drawer>
  </CreativeShell>
</template>

<style scoped>
.filter-bar {
  display: flex;
  gap: 8px;
  padding: 12px;
  margin-bottom: 12px;
  background: #fff;
  border: 1px solid #e8edf4;
  border-radius: 10px;
}

.filter-bar :deep(.ant-select) {
  width: 180px;
}
</style>
