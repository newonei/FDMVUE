<script lang="ts" setup>
import type { TableColumnsType, TablePaginationConfig } from 'ant-design-vue';

import type { FdmCreativeApi } from '#/api/fdmcreative';

import { computed, onMounted, reactive, ref } from 'vue';
import { useRoute } from 'vue-router';

import {
  Alert,
  Button,
  Descriptions,
  Drawer,
  Progress,
  Select,
  Space,
  Table,
  Tag,
  Tooltip,
} from 'ant-design-vue';

import {
  cancelCreativeExecution,
  getCreativeExecution,
  getCreativeExecutionPage,
  retryCreativeNode,
} from '#/api/fdmcreative';

import CreativeShell from '../shared/CreativeShell.vue';
import {
  executionFailureSummary,
  executionScopeLabel,
  executionTaskSummary,
  formatNodeTaskConfig,
  nodeFailureDetail,
  nodeTaskLabel,
  nodeTaskSummary,
} from './execution-task-detail';

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
  { dataIndex: 'taskContent', title: '任务内容', width: 330 },
  { dataIndex: 'status', title: '状态', width: 120 },
  { dataIndex: 'progress', title: '进度', width: 180 },
  { dataIndex: 'failure', title: '失败原因', width: 260 },
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

const failedNodeRuns = computed(() =>
  (detail.value?.nodeRuns ?? []).filter((nodeRun) =>
    Boolean(nodeFailureDetail(nodeRun)),
  ),
);

const startNodeLabel = computed(() => {
  const execution = detail.value;
  if (!execution?.startNodeId) return '—';
  const nodeRun = execution.nodeRuns?.find(
    (item) => item.nodeId === execution.startNodeId,
  );
  return nodeRun ? nodeTaskLabel(nodeRun) : execution.startNodeId;
});

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
  await load();
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

function taskSummary(record: Record<string, unknown>) {
  return executionTaskSummary(record as unknown as FdmCreativeApi.Execution);
}

function failureSummary(record: Record<string, unknown>) {
  return executionFailureSummary(record as unknown as FdmCreativeApi.Execution);
}

function nodeLabel(record: FdmCreativeApi.NodeRun) {
  return nodeTaskLabel(record);
}

function nodeFailure(record: FdmCreativeApi.NodeRun) {
  return nodeFailureDetail(record);
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
        <template v-if="column.dataIndex === 'taskContent'">
          <Tooltip :title="taskSummary(record)">
            <div class="list-task-content">{{ taskSummary(record) }}</div>
          </Tooltip>
        </template>
        <template v-else-if="column.dataIndex === 'status'">
          <Tag :color="statusColor[record.status] || 'default'">
            {{ record.status }}
          </Tag>
        </template>
        <template v-else-if="column.dataIndex === 'progress'">
          <Progress :percent="executionProgress(record)" size="small" />
        </template>
        <template v-else-if="column.dataIndex === 'failure'">
          <Tooltip
            v-if="failureSummary(record)"
            :title="failureSummary(record)"
          >
            <div class="list-failure">{{ failureSummary(record) }}</div>
          </Tooltip>
          <span v-else class="muted-text">—</span>
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

    <Drawer v-model:open="drawerOpen" title="任务详情" :width="1080">
      <section v-if="detail" class="execution-detail">
        <Descriptions
          bordered
          size="small"
          title="任务概览"
          :column="{ xs: 1, sm: 2, lg: 3 }"
        >
          <Descriptions.Item label="任务编号">
            {{ detail.id }}
          </Descriptions.Item>
          <Descriptions.Item label="项目编号">
            {{ detail.projectId }}
          </Descriptions.Item>
          <Descriptions.Item label="任务状态">
            <Tag :color="statusColor[detail.status] || 'default'">
              {{ detail.status }}
            </Tag>
          </Descriptions.Item>
          <Descriptions.Item label="执行范围">
            {{ executionScopeLabel(detail.scope) }}
          </Descriptions.Item>
          <Descriptions.Item label="起始节点">
            {{ startNodeLabel }}
          </Descriptions.Item>
          <Descriptions.Item label="工作流版本">
            {{ detail.workflowRevisionId ?? '草稿' }} / 草稿 v{{
              detail.workflowDraftVersion ?? '—'
            }}
          </Descriptions.Item>
          <Descriptions.Item label="节点统计">
            共 {{ detail.totalNodeCount ?? 0 }} 个，成功
            {{ detail.succeededNodeCount ?? 0 }} 个， 异常
            {{ detail.failedNodeCount ?? 0 }} 个
          </Descriptions.Item>
          <Descriptions.Item label="开始时间">
            {{ detail.startedTime ?? '—' }}
          </Descriptions.Item>
          <Descriptions.Item label="完成时间">
            {{ detail.completedTime ?? '—' }}
          </Descriptions.Item>
        </Descriptions>

        <section v-if="failedNodeRuns.length" class="failure-section">
          <h3>失败原因</h3>
          <Alert
            v-for="nodeRun in failedNodeRuns"
            :key="nodeRun.id"
            :description="nodeFailure(nodeRun)?.message"
            :message="`${nodeLabel(nodeRun)} · ${nodeFailure(nodeRun)?.code}`"
            show-icon
            type="error"
          />
        </section>
      </section>

      <Table
        :data-source="detail?.nodeRuns || []"
        :loading="detailLoading"
        :pagination="false"
        row-key="id"
        size="small"
        :scroll="{ x: 1370 }"
      >
        <Table.Column data-index="nodeId" title="执行节点" :width="220">
          <template #default="{ record }">
            <div class="node-title">{{ nodeLabel(record) }}</div>
            <div class="node-meta">
              {{ record.nodeType || '未知节点类型' }} · {{ record.nodeId }}
            </div>
          </template>
        </Table.Column>
        <Table.Column title="任务内容" :width="350">
          <template #default="{ record }">
            <div class="node-task-summary">{{ nodeTaskSummary(record) }}</div>
            <details class="node-task-parameters">
              <summary>查看完整执行参数</summary>
              <pre>{{ formatNodeTaskConfig(record.inputJson) }}</pre>
            </details>
          </template>
        </Table.Column>
        <Table.Column data-index="status" title="状态" :width="120">
          <template #default="{ record }">
            <Tag :color="statusColor[record.status] || 'default'">
              {{ record.status }}
            </Tag>
          </template>
        </Table.Column>
        <Table.Column data-index="attemptNo" title="尝试次数" :width="100" />
        <Table.Column data-index="startedTime" title="开始时间" :width="170" />
        <Table.Column
          data-index="completedTime"
          title="完成时间"
          :width="170"
        />
        <Table.Column title="失败原因" :width="320">
          <template #default="{ record }">
            <template v-if="nodeFailure(record)">
              <div class="node-failure">
                <Tag color="error">{{ nodeFailure(record)?.code }}</Tag>
                <div>{{ nodeFailure(record)?.message }}</div>
              </div>
            </template>
            <span v-else class="muted-text">—</span>
          </template>
        </Table.Column>
        <Table.Column title="操作" :width="90" fixed="right">
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

.list-task-content,
.list-failure {
  display: -webkit-box;
  overflow: hidden;
  text-overflow: ellipsis;
  -webkit-line-clamp: 2;
  line-height: 1.55;
  color: #334155;
  -webkit-box-orient: vertical;
}

.list-failure {
  color: #c2410c;
}

.muted-text,
.node-meta {
  color: #94a3b8;
}

.execution-detail {
  margin-bottom: 20px;
}

.failure-section {
  display: grid;
  gap: 10px;
  margin-top: 20px;
}

.failure-section h3 {
  margin: 0;
  font-size: 15px;
}

.failure-section :deep(.ant-alert-description) {
  overflow-wrap: anywhere;
  white-space: pre-wrap;
}

.node-title {
  font-weight: 600;
  line-height: 1.5;
  color: #1e293b;
}

.node-meta {
  margin-top: 3px;
  font-size: 12px;
  line-height: 1.45;
}

.node-task-summary {
  line-height: 1.55;
  color: #334155;
  overflow-wrap: anywhere;
  white-space: pre-wrap;
}

.node-task-parameters {
  margin-top: 6px;
  color: #64748b;
}

.node-task-parameters summary {
  width: fit-content;
  color: #1677ff;
  cursor: pointer;
}

.node-task-parameters pre {
  max-height: 260px;
  padding: 10px;
  margin: 8px 0 0;
  overflow: auto;
  font-size: 12px;
  line-height: 1.55;
  color: #334155;
  overflow-wrap: anywhere;
  white-space: pre-wrap;
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  border-radius: 6px;
}

.node-failure {
  display: grid;
  gap: 6px;
  line-height: 1.55;
  color: #b91c1c;
  overflow-wrap: anywhere;
  white-space: pre-wrap;
}
</style>
