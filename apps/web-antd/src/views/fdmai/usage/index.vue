<script lang="ts" setup>
import type { TableColumnsType } from 'ant-design-vue';

import type { FdmAiApi } from '#/api/fdmai';

import { computed, onMounted, reactive, ref } from 'vue';

import { formatDateTime } from '@vben/utils';

import { useClipboard } from '@vueuse/core';
import {
  Alert,
  Button,
  Descriptions,
  Drawer,
  Empty,
  Input,
  message,
  Progress,
  Select,
  Space,
  Statistic,
  Table,
  Tabs,
  Tag,
  Timeline,
  Tooltip,
} from 'ant-design-vue';

import {
  cancelFdmAiInvocation,
  getFdmAiAdapters,
  getFdmAiInvocationDetail,
  getFdmAiInvocationPage,
  getFdmAiModels,
} from '#/api/fdmai';

import AiCenterShell from '../shared/AiCenterShell.vue';

defineOptions({ name: 'FdmAiUsage' });

interface TablePage {
  current?: number;
  pageSize?: number;
}

const STATUS_OPTIONS = [
  'CREATED',
  'QUEUED',
  'SUBMITTING',
  'WAITING_PROVIDER',
  'RUNNING',
  'RESULT_RECEIVED',
  'DOWNLOADING',
  'SUCCEEDED',
  'FAILED',
  'SUBMISSION_UNKNOWN',
  'CANCEL_REQUESTED',
  'CANCELING',
  'CANCELED',
];
const STATUS_LABELS: Record<string, string> = {
  CANCELED: '已取消',
  CANCELING: '取消中',
  CANCEL_REQUESTED: '等待取消',
  CREATED: '已创建',
  DOWNLOADING: '归档下载中',
  FAILED: '失败',
  QUEUED: '排队中',
  RESULT_RECEIVED: '结果已接收',
  RUNNING: '运行中',
  SUBMISSION_UNKNOWN: '提交状态未知',
  SUBMITTING: '提交中',
  SUCCEEDED: '成功',
  WAITING_PROVIDER: '等待服务商',
};

const loading = ref(false);
const detailLoading = ref(false);
const cancelling = ref(false);
const detailOpen = ref(false);
const detailTab = ref('overview');
const rows = ref<FdmAiApi.InvocationPageItem[]>([]);
const models = ref<FdmAiApi.ModelDefinition[]>([]);
const adapters = ref<FdmAiApi.AdapterDescriptor[]>([]);
const detail = ref<FdmAiApi.InvocationDetail>();
const query = reactive<{
  keyword?: string;
  logicalModelId?: number;
  providerCode?: string;
  status?: string;
}>({
  keyword: '',
  logicalModelId: undefined,
  providerCode: undefined,
  status: undefined,
});
const pagination = reactive({
  current: 1,
  pageSize: 20,
  showSizeChanger: true,
  showTotal: (total: number) => `共 ${total} 条`,
  total: 0,
});
const { copy } = useClipboard({ legacy: true });

const columns: TableColumnsType<FdmAiApi.InvocationPageItem> = [
  { dataIndex: 'id', fixed: 'left', title: '调用编号', width: 220 },
  { dataIndex: 'createdAt', title: '发起时间', width: 180 },
  { dataIndex: 'caller', title: '调用方 / 业务', width: 180 },
  { dataIndex: 'logicalModelId', title: '模型', width: 160 },
  { dataIndex: 'providerCode', title: '服务商 / 上游模型', width: 230 },
  { dataIndex: 'modality', title: '请求模式', width: 105 },
  { dataIndex: 'capability', title: '请求动作', width: 180 },
  { dataIndex: 'requestSummary', title: '请求信息', width: 240 },
  { dataIndex: 'status', title: '状态', width: 180 },
  { dataIndex: 'duration', title: '耗时', width: 110 },
  { dataIndex: 'result', title: '结果', width: 240 },
  { dataIndex: 'action', fixed: 'right', title: '操作', width: 90 },
];
const attemptColumns: TableColumnsType<FdmAiApi.InvocationAttempt> = [
  { dataIndex: 'attemptNo', title: '次数', width: 70 },
  { dataIndex: 'status', title: '状态', width: 120 },
  { dataIndex: 'providerTaskId', title: '服务商任务', width: 190 },
  { dataIndex: 'failureCode', title: '失败码', width: 150 },
  { dataIndex: 'retryable', title: '可重试', width: 90 },
  { dataIndex: 'startedAt', title: '开始时间', width: 180 },
  { dataIndex: 'finishedAt', title: '结束时间', width: 180 },
];

const modelOptions = computed(() =>
  models.value.map((item) => ({
    label: `${item.name} · ${item.code}`,
    value: item.id,
  })),
);
const providerOptions = computed(() =>
  adapters.value.map((item) => ({ label: item.name, value: item.code })),
);
const currentPageSuccess = computed(
  () => rows.value.filter((row) => row.status === 'SUCCEEDED').length,
);
const currentPageExceptions = computed(
  () =>
    rows.value.filter((row) =>
      ['FAILED', 'SUBMISSION_UNKNOWN'].includes(row.status),
    ).length,
);

function compactParams<T extends Record<string, unknown>>(values: T) {
  return Object.fromEntries(
    Object.entries(values).filter(
      ([, value]) => value !== undefined && value !== null && value !== '',
    ),
  );
}

function statusLabel(status?: string) {
  return STATUS_LABELS[String(status || '').toUpperCase()] || status || '未知';
}

function statusColor(status?: string) {
  const normalized = String(status || '').toUpperCase();
  if (normalized === 'SUCCEEDED') return 'success';
  if (normalized === 'FAILED') return 'error';
  if (normalized === 'SUBMISSION_UNKNOWN') return 'orange';
  if (normalized === 'CANCELED') return 'default';
  if (normalized.startsWith('CANCEL')) return 'warning';
  if (['DOWNLOADING', 'RESULT_RECEIVED', 'RUNNING'].includes(normalized))
    return 'processing';
  return 'blue';
}

function formatTime(value?: FdmAiApi.DateTimeValue) {
  if (value === undefined || value === null || value === '') return '-';
  const normalized =
    typeof value === 'string' && /^\d{13}$/.test(value) ? Number(value) : value;
  return formatDateTime(normalized) || '-';
}

function timestamp(value?: FdmAiApi.DateTimeValue) {
  if (value === undefined || value === null || value === '') return undefined;
  const normalized =
    typeof value === 'string' && /^\d{13}$/.test(value) ? Number(value) : value;
  const result = new Date(normalized).getTime();
  return Number.isNaN(result) ? undefined : result;
}

function durationText(
  startedAt?: FdmAiApi.DateTimeValue,
  finishedAt?: FdmAiApi.DateTimeValue,
  durationMillis?: number,
) {
  if (durationMillis !== undefined && durationMillis !== null) {
    if (durationMillis < 1000) return `${durationMillis} ms`;
    if (durationMillis < 60_000) {
      return `${(durationMillis / 1000).toFixed(1)} 秒`;
    }
    return `${(durationMillis / 60_000).toFixed(1)} 分钟`;
  }
  const started = timestamp(startedAt);
  const finished = timestamp(finishedAt);
  if (started === undefined || finished === undefined) return '-';
  const millis = Math.max(0, finished - started);
  if (millis < 1000) return `${millis} ms`;
  if (millis < 60_000) return `${(millis / 1000).toFixed(1)} 秒`;
  return `${(millis / 60_000).toFixed(1)} 分钟`;
}

function modelName(id?: number) {
  if (!id) return '-';
  const model = models.value.find((item) => item.id === id);
  return model ? `${model.name} · ${model.code}` : `#${id}`;
}

function businessText(record: unknown) {
  const row = record as FdmAiApi.InvocationPageItem;
  const business = [row.businessType, row.businessId]
    .filter(Boolean)
    .join(' / ');
  return business ? `${row.caller || '-'} · ${business}` : row.caller || '-';
}

function money(value?: FdmAiApi.NumericValue, currency = 'CNY') {
  if (value === undefined || value === null || value === '') return '-';
  return `${currency} ${Number(value).toFixed(6)}`;
}

function safeJson(value: unknown) {
  if (value === undefined || value === null) return '-';
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

function isCancelable(status?: string) {
  return !['CANCELED', 'FAILED', 'SUBMISSION_UNKNOWN', 'SUCCEEDED'].includes(
    String(status || '').toUpperCase(),
  );
}

function isImage(output: FdmAiApi.InvocationOutput) {
  return (
    output.type?.toUpperCase() === 'IMAGE' ||
    output.mimeType?.startsWith('image/')
  );
}

function isVideo(output: FdmAiApi.InvocationOutput) {
  return (
    output.type?.toUpperCase() === 'VIDEO' ||
    output.mimeType?.startsWith('video/')
  );
}

function isImageResult(record: unknown) {
  const row = record as FdmAiApi.InvocationPageItem;
  return row.modality === 'IMAGE' && Boolean(row.resultUrl);
}

function isVideoResult(record: unknown) {
  const row = record as FdmAiApi.InvocationPageItem;
  return row.modality === 'VIDEO' && Boolean(row.resultUrl);
}

async function loadReferences() {
  [models.value, adapters.value] = await Promise.all([
    getFdmAiModels(),
    getFdmAiAdapters(),
  ]);
}

async function load(reset = false) {
  if (reset) pagination.current = 1;
  loading.value = true;
  try {
    const data = await getFdmAiInvocationPage({
      pageNo: pagination.current,
      pageSize: pagination.pageSize,
      ...compactParams(query),
    });
    rows.value = data?.list ?? [];
    pagination.total = data?.total ?? 0;
  } finally {
    loading.value = false;
  }
}

function resetQuery() {
  Object.assign(query, {
    keyword: '',
    logicalModelId: undefined,
    providerCode: undefined,
    status: undefined,
  });
  void load(true);
}

function handlePageChange(page: TablePage) {
  pagination.current = page.current ?? 1;
  pagination.pageSize = page.pageSize ?? 20;
  void load();
}

async function openDetail(record: unknown) {
  const invocation = record as FdmAiApi.InvocationPageItem;
  detailOpen.value = true;
  detailTab.value = 'overview';
  detailLoading.value = true;
  detail.value = undefined;
  try {
    detail.value = await getFdmAiInvocationDetail(invocation.id);
  } finally {
    detailLoading.value = false;
  }
}

async function refreshDetail() {
  if (!detail.value?.id) return;
  detailLoading.value = true;
  try {
    detail.value = await getFdmAiInvocationDetail(detail.value.id);
  } finally {
    detailLoading.value = false;
  }
}

async function cancelInvocation() {
  if (!detail.value?.id) return;
  cancelling.value = true;
  try {
    await cancelFdmAiInvocation(detail.value.id);
    message.success('已提交取消请求');
    await Promise.all([load(), refreshDetail()]);
  } finally {
    cancelling.value = false;
  }
}

async function copyInvocationId(id?: string) {
  if (!id) return;
  await copy(id);
  message.success('调用编号已复制');
}

onMounted(async () => {
  await Promise.all([loadReferences(), load(true)]);
});
</script>

<template>
  <AiCenterShell
    description="查询每一次模型调用的状态、服务商尝试、事件、输出和用量"
    title="调用记录"
  >
    <template #actions>
      <Button :loading="loading" @click="load()">刷新记录</Button>
    </template>

    <div class="statistics">
      <Statistic title="调用总数" :value="pagination.total" />
      <Statistic title="本页成功" :value="currentPageSuccess" />
      <Statistic title="本页异常" :value="currentPageExceptions" />
    </div>

    <div class="filter-bar">
      <Input
        v-model:value="query.keyword"
        allow-clear
        class="keyword"
        placeholder="调用编号、调用方、业务引用或错误"
        @press-enter="load(true)"
      />
      <Select
        v-model:value="query.status"
        allow-clear
        :options="
          STATUS_OPTIONS.map((value) => ({
            label: statusLabel(value),
            value,
          }))
        "
        placeholder="调用状态"
      />
      <Select
        v-model:value="query.logicalModelId"
        allow-clear
        option-filter-prop="label"
        :options="modelOptions"
        placeholder="模型"
        show-search
      />
      <Select
        v-model:value="query.providerCode"
        allow-clear
        :options="providerOptions"
        placeholder="服务商"
      />
      <Button type="primary" @click="load(true)">查询</Button>
      <Button @click="resetQuery">重置</Button>
    </div>

    <Table
      :columns="columns"
      :data-source="rows"
      :loading="loading"
      :pagination="pagination"
      row-key="id"
      :scroll="{ x: 2260 }"
      @change="handlePageChange"
    >
      <template #bodyCell="{ column, record }">
        <template v-if="column.dataIndex === 'id'">
          <Tooltip :title="record.id">
            <button
              class="invocation-id"
              type="button"
              @click="copyInvocationId(record.id)"
            >
              {{ record.id }}
            </button>
          </Tooltip>
        </template>
        <template v-else-if="column.dataIndex === 'createdAt'">
          {{ formatTime(record.createdAt) }}
        </template>
        <template v-else-if="column.dataIndex === 'caller'">
          <Tooltip :title="businessText(record)">
            <span class="ellipsis">{{ businessText(record) }}</span>
          </Tooltip>
        </template>
        <template v-else-if="column.dataIndex === 'logicalModelId'">
          {{ modelName(record.logicalModelId) }}
        </template>
        <template v-else-if="column.dataIndex === 'providerCode'">
          <div>{{ record.providerCode || '-' }}</div>
          <small class="muted">{{ record.providerModel || '-' }}</small>
        </template>
        <template v-else-if="column.dataIndex === 'modality'">
          <Tag color="geekblue">{{ record.modality || '-' }}</Tag>
        </template>
        <template v-else-if="column.dataIndex === 'capability'">
          <Tag color="purple">{{ record.capability || '-' }}</Tag>
        </template>
        <template v-else-if="column.dataIndex === 'requestSummary'">
          <Tooltip :title="record.requestSummary || '-'">
            <span class="ellipsis">{{ record.requestSummary || '-' }}</span>
          </Tooltip>
        </template>
        <template v-else-if="column.dataIndex === 'status'">
          <div class="status-cell">
            <Tag :color="statusColor(record.status)">
              {{ statusLabel(record.status) }}
            </Tag>
            <Progress
              v-if="record.progress !== undefined && record.progress < 100"
              :percent="record.progress"
              :show-info="false"
              size="small"
            />
          </div>
        </template>
        <template v-else-if="column.dataIndex === 'duration'">
          {{
            durationText(
              record.createdAt,
              record.updatedAt,
              record.durationMillis,
            )
          }}
        </template>
        <template v-else-if="column.dataIndex === 'result'">
          <div v-if="record.resultUrl" class="result-cell">
            <img
              v-if="isImageResult(record)"
              alt="生成结果"
              class="result-thumbnail"
              :src="record.resultUrl"
            />
            <video
              v-else-if="isVideoResult(record)"
              class="result-thumbnail"
              muted
              :src="record.resultUrl"
            ></video>
            <a
              :href="record.resultUrl"
              rel="noopener noreferrer"
              target="_blank"
            >
              查看结果
            </a>
          </div>
          <Tooltip
            v-else
            :title="
              record.resultText || record.errorMessage || record.errorCode || ''
            "
          >
            <span
              :class="record.errorMessage ? 'error-text ellipsis' : 'ellipsis'"
            >
              {{
                record.resultText ||
                record.errorMessage ||
                record.errorCode ||
                '-'
              }}
            </span>
          </Tooltip>
        </template>
        <template v-else-if="column.dataIndex === 'action'">
          <Button
            v-access:code="['fdmai:invocation:query']"
            size="small"
            type="link"
            @click="openDetail(record)"
          >
            详情
          </Button>
        </template>
      </template>
    </Table>

    <Drawer
      v-model:open="detailOpen"
      :loading="detailLoading"
      placement="right"
      :title="`调用详情 · ${detail?.id || ''}`"
      :width="820"
    >
      <template #extra>
        <Space>
          <Button :loading="detailLoading" size="small" @click="refreshDetail">
            刷新
          </Button>
          <Button
            v-if="detail && isCancelable(detail.status)"
            v-access:code="['fdmai:invocation:cancel']"
            danger
            :loading="cancelling"
            size="small"
            @click="cancelInvocation"
          >
            取消调用
          </Button>
        </Space>
      </template>

      <template v-if="detail">
        <Alert
          v-if="detail.errorMessage || detail.errorCode"
          class="detail-alert"
          :description="detail.errorMessage"
          :message="detail.errorCode || '调用异常'"
          show-icon
          type="error"
        />

        <Tabs v-model:active-key="detailTab">
          <Tabs.TabPane key="overview" tab="概览">
            <Descriptions bordered :column="2" size="small">
              <Descriptions.Item label="调用编号" :span="2">
                <Space>
                  <code>{{ detail.id }}</code>
                  <Button
                    size="small"
                    type="link"
                    @click="copyInvocationId(detail.id)"
                  >
                    复制
                  </Button>
                </Space>
              </Descriptions.Item>
              <Descriptions.Item label="状态">
                <Tag :color="statusColor(detail.status)">
                  {{ statusLabel(detail.status) }}
                </Tag>
              </Descriptions.Item>
              <Descriptions.Item label="进度">
                <Progress :percent="detail.progress ?? 0" size="small" />
              </Descriptions.Item>
              <Descriptions.Item label="调用方">
                {{ detail.caller || '-' }}
              </Descriptions.Item>
              <Descriptions.Item label="业务引用">
                {{
                  [detail.businessType, detail.businessId]
                    .filter(Boolean)
                    .join(' / ') || '-'
                }}
              </Descriptions.Item>
              <Descriptions.Item label="模型">
                {{ modelName(detail.logicalModelId) }}
              </Descriptions.Item>
              <Descriptions.Item label="上游模型">
                {{ detail.providerModel || '-' }}
              </Descriptions.Item>
              <Descriptions.Item label="服务商">
                {{ detail.providerCode || '-' }}
              </Descriptions.Item>
              <Descriptions.Item label="服务商任务">
                {{ detail.externalTaskId || '-' }}
              </Descriptions.Item>
              <Descriptions.Item label="开始时间">
                {{ formatTime(detail.createdAt) }}
              </Descriptions.Item>
              <Descriptions.Item label="更新时间">
                {{ formatTime(detail.updatedAt) }}
              </Descriptions.Item>
              <Descriptions.Item label="输入用量">
                {{ detail.usage?.inputUnits ?? '-' }}
              </Descriptions.Item>
              <Descriptions.Item label="输出用量">
                {{ detail.usage?.outputUnits ?? '-' }}
              </Descriptions.Item>
              <Descriptions.Item label="预计成本">
                {{ money(detail.usage?.estimatedCost, detail.usage?.currency) }}
              </Descriptions.Item>
              <Descriptions.Item label="实际成本">
                {{ money(detail.usage?.costAmount, detail.usage?.currency) }}
              </Descriptions.Item>
            </Descriptions>
          </Tabs.TabPane>

          <Tabs.TabPane
            :tab="`尝试记录 (${detail.attempts.length})`"
            key="attempts"
          >
            <Table
              :columns="attemptColumns"
              :data-source="detail.attempts"
              :pagination="false"
              row-key="id"
              :scroll="{ x: 980 }"
              size="small"
            >
              <template #bodyCell="{ column, record }">
                <template v-if="column.dataIndex === 'status'">
                  <Tag :color="statusColor(record.status)">
                    {{ record.status }}
                  </Tag>
                </template>
                <template v-else-if="column.dataIndex === 'retryable'">
                  {{ record.retryable ? '是' : '否' }}
                </template>
                <template v-else-if="column.dataIndex === 'startedAt'">
                  {{ formatTime(record.startedAt) }}
                </template>
                <template v-else-if="column.dataIndex === 'finishedAt'">
                  {{ formatTime(record.finishedAt) }}
                </template>
              </template>
            </Table>
          </Tabs.TabPane>

          <Tabs.TabPane :tab="`事件 (${detail.events.length})`" key="events">
            <Timeline v-if="detail.events.length" class="event-timeline">
              <Timeline.Item
                v-for="event in detail.events"
                :key="event.sequence"
                :color="statusColor(event.status)"
              >
                <div class="event-heading">
                  <strong>#{{ event.sequence }} · {{ event.type }}</strong>
                  <span>{{ formatTime(event.occurredAt) }}</span>
                </div>
                <Tag v-if="event.status" :color="statusColor(event.status)">
                  {{ statusLabel(event.status) }}
                </Tag>
                <p v-if="event.message" class="event-message">
                  {{ event.message }}
                </p>
              </Timeline.Item>
            </Timeline>
            <Empty v-else description="暂无事件" />
          </Tabs.TabPane>

          <Tabs.TabPane :tab="`输出 (${detail.outputs.length})`" key="outputs">
            <div v-if="detail.outputs.length" class="outputs">
              <article
                v-for="(output, index) in detail.outputs"
                :key="`${output.type}-${index}`"
                class="output-card"
              >
                <div class="output-heading">
                  <Tag color="blue">{{ output.type }}</Tag>
                  <span>{{ output.mimeType || '-' }}</span>
                  <a
                    v-if="output.url"
                    :href="output.url"
                    rel="noopener noreferrer"
                    target="_blank"
                  >
                    打开原文件
                  </a>
                </div>
                <img
                  v-if="isImage(output) && output.url"
                  :alt="`输出 ${index + 1}`"
                  class="media-preview"
                  :src="output.url"
                />
                <video
                  v-else-if="isVideo(output) && output.url"
                  class="media-preview"
                  controls
                  :src="output.url"
                ></video>
                <pre v-else-if="output.text" class="text-output">{{
                  output.text
                }}</pre>
                <pre
                  v-if="output.metadata && Object.keys(output.metadata).length"
                  class="metadata"
                >
                  {{ safeJson(output.metadata) }}
                </pre>
              </article>
            </div>
            <Empty v-else description="暂无输出" />
          </Tabs.TabPane>

          <Tabs.TabPane key="request" tab="请求快照">
            <Alert
              class="detail-alert"
              message="请求快照不包含 API Key、Authorization 或服务商凭证明文。"
              show-icon
              type="info"
            />
            <pre class="request-json">{{
              safeJson(detail.requestSnapshot)
            }}</pre>
          </Tabs.TabPane>
        </Tabs>
      </template>
    </Drawer>
  </AiCenterShell>
</template>

<style scoped>
.statistics {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 12px;
}

.statistics :deep(.ant-statistic) {
  padding: 14px 18px;
  background: white;
  border: 1px solid #e7edf5;
  border-radius: 10px;
}

.filter-bar {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  align-items: center;
  padding: 12px;
  background: white;
  border: 1px solid #e7edf5;
  border-radius: 10px;
}

.filter-bar :deep(.ant-select) {
  width: 180px;
}

.filter-bar .keyword {
  width: 300px;
}

.invocation-id {
  display: block;
  max-width: 190px;
  overflow: hidden;
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  font-size: 11px;
  color: #2563eb;
  text-align: left;
  text-overflow: ellipsis;
  white-space: nowrap;
  cursor: pointer;
  background: transparent;
  border: 0;
}

.ellipsis {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.muted {
  color: #94a3b8;
}

.error-text {
  color: #dc2626;
}

.status-cell {
  display: grid;
  gap: 5px;
}

.result-cell {
  display: flex;
  gap: 8px;
  align-items: center;
}

.result-thumbnail {
  width: 44px;
  height: 44px;
  object-fit: cover;
  background: #e2e8f0;
  border-radius: 6px;
}

.detail-alert {
  margin-bottom: 12px;
}

.event-timeline {
  padding-top: 12px;
}

.event-heading,
.output-heading {
  display: flex;
  gap: 10px;
  align-items: center;
  justify-content: space-between;
  color: #64748b;
}

.event-message {
  margin: 7px 0 0;
  color: #475569;
}

.outputs {
  display: grid;
  gap: 12px;
}

.output-card {
  padding: 12px;
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  border-radius: 10px;
}

.output-heading {
  justify-content: flex-start;
  margin-bottom: 10px;
}

.output-heading a {
  margin-left: auto;
}

.media-preview {
  display: block;
  max-width: 100%;
  max-height: 420px;
  margin: 0 auto;
  border-radius: 8px;
}

.text-output,
.metadata,
.request-json {
  overflow: auto;
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  font-size: 12px;
  line-height: 1.6;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}

.text-output,
.request-json {
  padding: 12px;
  color: #334155;
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
}

.metadata {
  margin: 10px 0 0;
  color: #64748b;
}

@media (max-width: 720px) {
  .statistics {
    grid-template-columns: 1fr;
  }

  .filter-bar .keyword,
  .filter-bar :deep(.ant-select) {
    width: 100%;
  }
}
</style>
