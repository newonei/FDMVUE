<script lang="ts" setup>
import type { TableColumnsType } from 'ant-design-vue';

import type { FdmRelayApi } from '#/api/relay';

import { computed, onMounted, reactive, ref } from 'vue';

import { confirm, Page } from '@vben/common-ui';
import { IconifyIcon } from '@vben/icons';
import { formatDateTime } from '@vben/utils';

import { useClipboard } from '@vueuse/core';
import {
  Alert,
  Button,
  Card,
  Checkbox,
  Col,
  DatePicker,
  Descriptions,
  Empty,
  Form,
  Input,
  InputNumber,
  message,
  Modal,
  Progress,
  Row,
  Select,
  Statistic,
  Table,
  Tabs,
  Tag,
} from 'ant-design-vue';

import { TableAction } from '#/adapter/vxe-table';
import {
  createMyRelayApiKey,
  getMyRelayApiKeyPage,
  getMyRelayUsagePage,
  getMyRelayUsageSummary,
  getRelayPublicInfo,
  revokeMyRelayApiKey,
  rotateMyRelayApiKey,
} from '#/api/relay';

import { buildWorkBuddyModelPrompt } from './workbuddy-prompt';

defineOptions({ name: 'FdmRelayDeveloper' });

interface TablePage {
  current?: number;
  pageSize?: number;
}

const activeTab = ref('keys');
const initialLoading = ref(false);
const publicInfoLoading = ref(false);
const publicInfo = ref<FdmRelayApi.PublicInfo>({ publicBaseUrl: '' });
const summaryLoading = ref(false);
const summary = ref<FdmRelayApi.UsageStats>({});
const relayAvailable = computed(
  () =>
    publicInfo.value.available ??
    Boolean(publicInfo.value.enabled && publicInfo.value.configured),
);

const keyLoading = ref(false);
const keys = ref<FdmRelayApi.ApiKey[]>([]);
const keyQuery = reactive({
  name: '',
  status: undefined as string | undefined,
});
const keyPagination = reactive({
  current: 1,
  pageSize: 10,
  total: 0,
  showSizeChanger: true,
  showTotal: (total: number) => `共 ${total} 条`,
});
const keyFilterOptions = computed(() =>
  keys.value.map((key) => ({
    label: `${key.name} · ${maskedKey(key)}`,
    value: key.id,
  })),
);

const usageLoading = ref(false);
const usageLogs = ref<FdmRelayApi.UsageLog[]>([]);
const usageQuery = reactive({
  apiKeyId: undefined as number | undefined,
  model: '',
  createTime: undefined as [string, string] | undefined,
});
const usagePagination = reactive({
  current: 1,
  pageSize: 10,
  total: 0,
  showSizeChanger: true,
  showTotal: (total: number) => `共 ${total} 条`,
});

const createModalOpen = ref(false);
const createSubmitting = ref(false);
const createRequestId = ref('');
const createForm = reactive({
  name: '',
  expiresInDays: undefined as number | undefined,
  ipWhitelistText: '',
  ipBlacklistText: '',
});

const secretModalOpen = ref(false);
const secretAcknowledged = ref(false);
const secretResult = ref<FdmRelayApi.ApiKeySecretResult>();
const { copy } = useClipboard({ legacy: true });

const keyColumns: TableColumnsType<FdmRelayApi.ApiKey> = [
  { title: '名称', dataIndex: 'name', key: 'name', width: 160, fixed: 'left' },
  { title: 'API Key', key: 'maskedKey', width: 210 },
  { title: '状态', key: 'status', width: 100 },
  { title: '额度', key: 'quota', width: 200 },
  { title: '限流(5h/1d/7d)', key: 'rateLimit', width: 180 },
  { title: '过期时间', key: 'expiresAt', width: 180 },
  { title: '最后调用', key: 'lastUsedAt', width: 180 },
  { title: '创建时间', key: 'createTime', width: 180 },
  { title: '操作', key: 'action', width: 150, fixed: 'right' },
];

const usageColumns: TableColumnsType<FdmRelayApi.UsageLog> = [
  { title: '时间', key: 'createdAt', width: 180, fixed: 'left' },
  { title: 'API Key', key: 'key', width: 150 },
  { title: '模型', dataIndex: 'model', key: 'model', width: 170 },
  {
    title: '请求类型',
    dataIndex: 'requestType',
    key: 'requestType',
    width: 130,
  },
  { title: '输入 Token', key: 'inputTokens', width: 120 },
  { title: '输出 Token', key: 'outputTokens', width: 120 },
  { title: '总 Token', key: 'totalTokens', width: 120 },
  { title: '费用', key: 'cost', width: 110 },
  { title: '耗时', key: 'latency', width: 110 },
  { title: '状态码', key: 'statusCode', width: 100 },
  { title: '请求 ID', dataIndex: 'requestId', key: 'requestId', width: 220 },
];

const summaryCards = computed(() => [
  {
    title: '请求数',
    value: summary.value.requestCount ?? 0,
    suffix: '次',
    icon: 'lucide:send',
  },
  {
    title: 'Token 用量',
    value:
      summary.value.totalTokens ??
      (summary.value.inputTokens ?? summary.value.promptTokens ?? 0) +
        (summary.value.outputTokens ?? summary.value.completionTokens ?? 0),
    icon: 'lucide:binary',
  },
  {
    title: '累计费用',
    value: summary.value.totalCost ?? 0,
    prefix: '¥',
    precision: 4,
    icon: 'lucide:badge-dollar-sign',
  },
  {
    title: '我的余额',
    value: summary.value.balance ?? 0,
    prefix: '$',
    precision: 4,
    icon: 'lucide:gauge',
  },
]);

const apiOrigin = computed(() =>
  String(publicInfo.value.publicBaseUrl || '').replace(/\/+$/, ''),
);
const apiBaseUrl = computed(() =>
  apiOrigin.value ? `${apiOrigin.value}/v1` : '',
);
const chatCompletionUrl = computed(() =>
  apiBaseUrl.value ? `${apiBaseUrl.value}/chat/completions` : '',
);
const secretApiBaseUrl = computed(() => {
  const origin = String(secretResult.value?.publicBaseUrl || '').replace(
    /\/+$/,
    '',
  );
  return origin ? `${origin}/v1` : apiBaseUrl.value;
});
const modelLabels = computed(() =>
  (publicInfo.value.models ?? []).map((model) =>
    typeof model === 'string' ? model : model.label || model.name,
  ),
);
const curlExample = computed(
  () => `curl ${chatCompletionUrl.value || '<API_BASE_URL>/chat/completions'} \\
  -H "Authorization: Bearer <YOUR_API_KEY>" \\
  -H "Content-Type: application/json" \\
  -d '{
    "model": "<MODEL_NAME>",
    "messages": [{"role": "user", "content": "你好"}]
  }'`,
);

function compactParams(values: Record<string, unknown>) {
  return Object.fromEntries(
    Object.entries(values).filter(([, value]) => {
      if (value === undefined || value === null || value === '') return false;
      return !Array.isArray(value) || value.length > 0;
    }),
  );
}

function formatNumber(value?: number) {
  return Number(value ?? 0).toLocaleString('zh-CN');
}

function formatMoney(value?: number) {
  return `¥${Number(value ?? 0).toFixed(4)}`;
}

function formatTime(value?: FdmRelayApi.DateTimeValue) {
  if (value === undefined || value === null || value === '') return '-';
  const normalized =
    typeof value === 'string' && /^\d{13}$/.test(value) ? Number(value) : value;
  return formatDateTime(normalized) || '-';
}

function normalizeStatus(value: unknown) {
  return String(value ?? '').toUpperCase();
}

function statusColor(value: unknown) {
  const status = normalizeStatus(value);
  if (['1', 'ACTIVE', 'AVAILABLE', 'ENABLED', 'SUCCESS'].includes(status)) {
    return 'success';
  }
  if (['0', 'DISABLED', 'ERROR', 'FAILED', 'REVOKED'].includes(status)) {
    return 'error';
  }
  return 'warning';
}

function statusText(value: unknown) {
  const status = normalizeStatus(value);
  const labels: Record<string, string> = {
    '0': '停用',
    '1': '启用',
    ACTIVE: '启用',
    AVAILABLE: '可用',
    DISABLED: '停用',
    ENABLED: '启用',
    ERROR: '异常',
    EXPIRED: '已过期',
    FAILED: '失败',
    PENDING: '待同步',
    PROCESSING: '处理中',
    PROVISIONING: '开通中',
    REVOKED: '已吊销',
    REVOKING: '吊销中',
    SUCCEEDED: '成功',
  };
  return (
    labels[status] ??
    (value === undefined || value === null ? '未知' : String(value))
  );
}

function maskedKey(row: Record<string, any>) {
  if (row.maskedKey) return row.maskedKey;
  if (row.keyPrefix || row.keyLast4) {
    return `${row.keyPrefix || 'sk-'}••••••••${row.keyLast4 || ''}`;
  }
  return '-';
}

function quotaPercent(used?: number, total?: number) {
  if (!total || total <= 0) return 0;
  return Math.min(100, Math.round(((used ?? 0) / total) * 100));
}

function splitIpLines(value: string) {
  return [
    ...new Set(
      value
        .split(/[\n,，;；]+/)
        .map((item) => item.trim())
        .filter(Boolean),
    ),
  ];
}

function validateIpRules(values: string[], label: string) {
  if (values.length > 100) {
    message.warning(`${label}最多填写 100 项`);
    return false;
  }
  const invalid = values.find(
    (value) =>
      value.length > 64 || !/^[0-9A-Fa-f:.]+(?:\/[0-9]{1,3})?$/.test(value),
  );
  if (invalid) {
    message.warning(`${label}包含无效 IP/CIDR：${invalid}`);
    return false;
  }
  return true;
}

function newRequestId() {
  if (typeof globalThis.crypto?.randomUUID === 'function') {
    return globalThis.crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replaceAll(/[xy]/g, (char) => {
    const random = Math.trunc(Math.random() * 16);
    const value = char === 'x' ? random : (random & 0x3) | 0x8;
    return value.toString(16);
  });
}

async function copyText(value: string, label: string) {
  if (!value) {
    message.warning(`暂无可复制的${label}`);
    return;
  }
  try {
    await copy(value);
    message.success(`${label}已复制`);
  } catch {
    message.error(`${label}复制失败，请手动复制`);
  }
}

async function copyWorkBuddyPrompt() {
  const apiKey = secretResult.value?.apiKey;
  if (!apiKey) {
    message.warning('暂无可配置的 API Key');
    return;
  }
  try {
    await copy(buildWorkBuddyModelPrompt(apiKey));
    message.success(
      'WorkBuddy 配置提示词已复制（包含 API Key，请仅发送给可信 AI）',
    );
  } catch {
    message.error('WorkBuddy 配置提示词复制失败，请重试');
  }
}

async function loadPublicInfo() {
  publicInfoLoading.value = true;
  try {
    publicInfo.value =
      (await getRelayPublicInfo()) ||
      ({ publicBaseUrl: '' } as FdmRelayApi.PublicInfo);
  } finally {
    publicInfoLoading.value = false;
  }
}

async function loadSummary() {
  summaryLoading.value = true;
  try {
    summary.value = (await getMyRelayUsageSummary()) || {};
  } finally {
    summaryLoading.value = false;
  }
}

async function loadKeys(reset = false) {
  if (reset) keyPagination.current = 1;
  keyLoading.value = true;
  try {
    const data = await getMyRelayApiKeyPage({
      pageNo: keyPagination.current,
      pageSize: keyPagination.pageSize,
      ...compactParams(keyQuery),
    });
    keys.value = data?.list ?? [];
    keyPagination.total = data?.total ?? 0;
  } finally {
    keyLoading.value = false;
  }
}

function handleKeyPageChange(page: TablePage) {
  keyPagination.current = page.current ?? 1;
  keyPagination.pageSize = page.pageSize ?? 10;
  void loadKeys();
}

function openCreateModal() {
  if (!createRequestId.value) {
    createRequestId.value = newRequestId();
    Object.assign(createForm, {
      name: '',
      expiresInDays: undefined,
      ipWhitelistText: '',
      ipBlacklistText: '',
    });
  }
  createModalOpen.value = true;
}

function showSecret(result: FdmRelayApi.ApiKeySecretResult) {
  secretResult.value = result;
  secretAcknowledged.value = false;
  secretModalOpen.value = true;
}

async function handleCreateKey() {
  const name = createForm.name.trim();
  if (!name) {
    message.warning('请输入密钥名称');
    return;
  }
  createSubmitting.value = true;
  try {
    const ipWhitelist = splitIpLines(createForm.ipWhitelistText);
    const ipBlacklist = splitIpLines(createForm.ipBlacklistText);
    if (
      !validateIpRules(ipWhitelist, 'IP 白名单') ||
      !validateIpRules(ipBlacklist, 'IP 黑名单')
    ) {
      return;
    }
    const result = await createMyRelayApiKey({
      requestId: createRequestId.value,
      name,
      expiresInDays: createForm.expiresInDays,
      ipWhitelist: ipWhitelist.length > 0 ? ipWhitelist : undefined,
      ipBlacklist: ipBlacklist.length > 0 ? ipBlacklist : undefined,
    });
    createModalOpen.value = false;
    showSecret(result);
    await Promise.all([loadKeys(true), loadSummary()]);
  } finally {
    createSubmitting.value = false;
  }
}

async function handleRotateKey(row: Record<string, any>) {
  await confirm(`确认轮换密钥“${row.name}”？旧密钥将按后端策略失效。`);
  const result = await rotateMyRelayApiKey(row.id);
  showSecret(result);
  await loadKeys();
}

async function handleRevokeKey(row: Record<string, any>) {
  await confirm(`确认吊销密钥“${row.name}”？吊销后无法恢复。`);
  await revokeMyRelayApiKey(row.id);
  message.success('密钥已吊销');
  await Promise.all([loadKeys(), loadSummary()]);
}

function closeSecretModal() {
  if (!secretAcknowledged.value) return;
  secretModalOpen.value = false;
  secretResult.value = undefined;
  secretAcknowledged.value = false;
  createRequestId.value = '';
}

async function loadUsage(reset = false) {
  if (reset) usagePagination.current = 1;
  usageLoading.value = true;
  try {
    const data = await getMyRelayUsagePage({
      pageNo: usagePagination.current,
      pageSize: usagePagination.pageSize,
      ...compactParams(usageQuery),
    });
    usageLogs.value = data?.list ?? [];
    usagePagination.total = data?.total ?? 0;
  } finally {
    usageLoading.value = false;
  }
}

function handleUsagePageChange(page: TablePage) {
  usagePagination.current = page.current ?? 1;
  usagePagination.pageSize = page.pageSize ?? 10;
  void loadUsage();
}

async function refreshAll() {
  initialLoading.value = true;
  try {
    const [publicInfoResult] = await Promise.allSettled([loadPublicInfo()]);
    await Promise.allSettled([loadKeys()]);
    if (publicInfoResult?.status === 'fulfilled' && relayAvailable.value) {
      await Promise.allSettled([loadSummary(), loadUsage()]);
    } else {
      summary.value = {};
      usageLogs.value = [];
      usagePagination.total = 0;
    }
  } finally {
    initialLoading.value = false;
  }
}

onMounted(refreshAll);
</script>

<template>
  <Page auto-content-height content-class="flex min-h-0 flex-1 flex-col !p-0">
    <div class="flex h-full min-h-0 flex-col px-4 pb-4">
      <header class="flex flex-wrap items-start justify-between gap-3 py-3">
        <div>
          <div class="mb-1 flex flex-wrap items-center gap-2">
            <h2 class="mb-0 text-lg font-semibold text-foreground">
              中转站API密钥
            </h2>
            <Tag :color="relayAvailable ? 'success' : 'warning'">
              {{ relayAvailable ? '服务可用' : '暂不可用' }}
            </Tag>
          </div>
          <p class="mb-0 text-xs text-muted-foreground">
            创建个人 API Key、查看调用用量并获取 OpenAI 兼容接入信息。
          </p>
        </div>
        <div class="flex flex-wrap gap-2">
          <Button :loading="initialLoading" @click="refreshAll">
            <template #icon><IconifyIcon icon="lucide:refresh-cw" /></template>
            刷新
          </Button>
          <Button
            v-access:code="['fdmrelay:self:create']"
            type="primary"
            :disabled="!relayAvailable"
            @click="openCreateModal"
          >
            <template #icon><IconifyIcon icon="lucide:key-round" /></template>
            创建 API Key
          </Button>
        </div>
      </header>

      <Alert
        v-if="!relayAvailable"
        class="mb-3"
        message="中转站尚未完成配置或当前已停用，请联系管理员。"
        show-icon
        type="warning"
      />

      <Row :gutter="[12, 12]" class="mb-3">
        <Col
          v-for="item in summaryCards"
          :key="item.title"
          :xs="24"
          :sm="12"
          :xl="6"
        >
          <Card :loading="summaryLoading" size="small">
            <Statistic
              :precision="item.precision"
              :prefix="item.prefix"
              :suffix="item.suffix"
              :title="item.title"
              :value="item.value"
            >
              <template #prefix>
                <IconifyIcon :icon="item.icon" class="mr-1" />
              </template>
            </Statistic>
          </Card>
        </Col>
      </Row>

      <Card class="min-h-0 flex-1" :body-style="{ padding: '0 16px 16px' }">
        <Tabs v-model:active-key="activeTab">
          <Tabs.TabPane key="keys" tab="我的 API Key">
            <Alert
              class="mb-3"
              message="完整 Key 仅在创建或轮换成功后展示一次；列表始终只显示掩码。"
              show-icon
              type="info"
            />
            <div class="mb-3 flex flex-wrap gap-2">
              <Input
                v-model:value="keyQuery.name"
                allow-clear
                class="w-60"
                placeholder="密钥名称"
                @press-enter="loadKeys(true)"
              />
              <Select
                v-model:value="keyQuery.status"
                allow-clear
                class="w-32"
                placeholder="状态"
                :options="[
                  { label: '启用', value: 'active' },
                  { label: '停用', value: 'disabled' },
                  { label: '已吊销', value: 'revoked' },
                  { label: '已过期', value: 'expired' },
                ]"
              />
              <Button type="primary" @click="loadKeys(true)">查询</Button>
              <Button
                @click="
                  Object.assign(keyQuery, { name: '', status: undefined });
                  loadKeys(true);
                "
              >
                重置
              </Button>
            </div>
            <Table
              :columns="keyColumns"
              :data-source="keys"
              :loading="keyLoading"
              :pagination="keyPagination"
              row-key="id"
              :scroll="{ x: 1450 }"
              size="middle"
              @change="handleKeyPageChange"
            >
              <template #emptyText>
                <Empty description="还没有 API Key">
                  <Button
                    v-access:code="['fdmrelay:self:create']"
                    type="primary"
                    :disabled="!relayAvailable"
                    @click="openCreateModal"
                  >
                    立即创建
                  </Button>
                </Empty>
              </template>
              <template #bodyCell="{ column, record }">
                <template v-if="column.key === 'maskedKey'">
                  <span class="font-mono text-xs">{{ maskedKey(record) }}</span>
                </template>
                <template v-else-if="column.key === 'status'">
                  <Tag :color="statusColor(record.status)">
                    {{ statusText(record.status) }}
                  </Tag>
                </template>
                <template v-else-if="column.key === 'quota'">
                  <div>
                    {{ formatNumber(record.usedQuota) }} /
                    {{ formatNumber(record.quota) }}
                  </div>
                  <Progress
                    :percent="quotaPercent(record.usedQuota, record.quota)"
                    :show-info="false"
                    size="small"
                  />
                </template>
                <template v-else-if="column.key === 'rateLimit'">
                  {{ record.rateLimit5h ?? '-' }} /
                  {{ record.rateLimit1d ?? '-' }} /
                  {{ record.rateLimit7d ?? '-' }}
                </template>
                <template v-else-if="column.key === 'expiresAt'">
                  {{ formatTime(record.expiresAt) }}
                </template>
                <template v-else-if="column.key === 'lastUsedAt'">
                  {{ formatTime(record.lastUsedAt) }}
                </template>
                <template v-else-if="column.key === 'createTime'">
                  {{ formatTime(record.createTime) }}
                </template>
                <template v-else-if="column.key === 'action'">
                  <TableAction
                    :actions="[
                      {
                        label: '轮换',
                        type: 'link',
                        auth: ['fdmrelay:self:rotate'],
                        disabled:
                          !relayAvailable ||
                          ['REVOKED', 'EXPIRED'].includes(
                            normalizeStatus(record.status),
                          ),
                        onClick: handleRotateKey.bind(null, record),
                      },
                      {
                        label: '吊销',
                        type: 'link',
                        danger: true,
                        auth: ['fdmrelay:self:revoke'],
                        disabled: normalizeStatus(record.status) === 'REVOKED',
                        onClick: handleRevokeKey.bind(null, record),
                      },
                    ]"
                  />
                </template>
              </template>
            </Table>
          </Tabs.TabPane>

          <Tabs.TabPane
            v-access:code="['fdmrelay:self:usage-query']"
            key="usage"
            tab="我的用量"
          >
            <div class="mb-3 flex flex-wrap gap-2">
              <Select
                v-model:value="usageQuery.apiKeyId"
                allow-clear
                class="w-60"
                option-filter-prop="label"
                :options="keyFilterOptions"
                placeholder="选择 API Key"
                show-search
              />
              <Input
                v-model:value="usageQuery.model"
                allow-clear
                class="w-48"
                placeholder="模型"
                @press-enter="loadUsage(true)"
              />
              <DatePicker.RangePicker
                v-model:value="usageQuery.createTime"
                value-format="YYYY-MM-DD"
              />
              <Button type="primary" @click="loadUsage(true)">查询</Button>
              <Button
                @click="
                  Object.assign(usageQuery, {
                    apiKeyId: undefined,
                    model: '',
                    createTime: undefined,
                  });
                  loadUsage(true);
                "
              >
                重置
              </Button>
            </div>
            <Table
              :columns="usageColumns"
              :data-source="usageLogs"
              :loading="usageLoading"
              :pagination="usagePagination"
              :row-key="
                (row: FdmRelayApi.UsageLog) =>
                  String(
                    row.id ?? row.requestId ?? `${row.userId}-${row.createdAt}`,
                  )
              "
              :scroll="{ x: 1550 }"
              size="middle"
              @change="handleUsagePageChange"
            >
              <template #bodyCell="{ column, record }">
                <template v-if="column.key === 'createdAt'">
                  {{
                    formatTime(
                      record.createdAt ||
                        record.createTime ||
                        record.requestTime,
                    )
                  }}
                </template>
                <template v-else-if="column.key === 'key'">
                  {{
                    record.keyName ||
                    record.keyPrefix ||
                    record.apiKeyId ||
                    record.keyId ||
                    '-'
                  }}
                </template>
                <template v-else-if="column.key === 'inputTokens'">
                  {{ formatNumber(record.promptTokens) }}
                </template>
                <template v-else-if="column.key === 'outputTokens'">
                  {{ formatNumber(record.completionTokens) }}
                </template>
                <template v-else-if="column.key === 'totalTokens'">
                  {{ formatNumber(record.totalTokens) }}
                </template>
                <template v-else-if="column.key === 'cost'">
                  {{ formatMoney(record.cost) }}
                </template>
                <template v-else-if="column.key === 'latency'">
                  {{
                    record.latencyMillis === undefined
                      ? '-'
                      : `${record.latencyMillis} ms`
                  }}
                </template>
                <template v-else-if="column.key === 'statusCode'">
                  <Tag
                    :color="
                      Number(record.statusCode) < 400 ? 'success' : 'error'
                    "
                  >
                    {{ record.statusCode ?? record.status ?? '-' }}
                  </Tag>
                </template>
              </template>
            </Table>
          </Tabs.TabPane>

          <Tabs.TabPane key="docs" tab="接入信息">
            <Card :loading="publicInfoLoading" size="small" title="服务端点">
              <Descriptions :column="1" bordered size="small">
                <Descriptions.Item label="API Base URL">
                  <div class="flex flex-wrap items-center gap-2">
                    <span class="break-all font-mono text-xs">{{
                      apiBaseUrl || '-'
                    }}</span>
                    <Button
                      size="small"
                      :disabled="!apiBaseUrl"
                      @click="copyText(apiBaseUrl, 'API 地址')"
                    >
                      <template #icon>
                        <IconifyIcon icon="lucide:copy" />
                      </template>
                      复制
                    </Button>
                  </div>
                </Descriptions.Item>
                <Descriptions.Item label="协议">
                  {{ publicInfo.protocol || 'OpenAI Compatible API' }}
                </Descriptions.Item>
                <Descriptions.Item label="接入模式">
                  {{
                    publicInfo.mode === 'ADMIN_BRIDGE'
                      ? '管理员桥接'
                      : '用户 JWT'
                  }}
                </Descriptions.Item>
                <Descriptions.Item
                  v-if="modelLabels.length > 0"
                  label="可用模型"
                >
                  <div class="flex flex-wrap gap-1">
                    <Tag v-for="model in modelLabels" :key="model">
                      {{ model }}
                    </Tag>
                  </div>
                </Descriptions.Item>
                <Descriptions.Item v-if="publicInfo.docsUrl" label="外部文档">
                  <a
                    :href="publicInfo.docsUrl"
                    rel="noopener noreferrer"
                    target="_blank"
                  >
                    {{ publicInfo.docsUrl }}
                  </a>
                </Descriptions.Item>
              </Descriptions>
            </Card>

            <Card class="mt-4" size="small" title="认证方式">
              <p class="text-sm text-muted-foreground">
                在请求头中设置
                <code class="rounded bg-muted px-1 py-0.5">
                  Authorization: Bearer &lt;YOUR_API_KEY&gt;
                </code>
                。 请勿把 API Key 提交到公开仓库或发送给他人。
              </p>
            </Card>

            <Card class="mt-4" size="small" title="cURL 示例">
              <div class="mb-2 flex justify-end">
                <Button
                  size="small"
                  @click="copyText(curlExample, 'cURL 示例')"
                >
                  <template #icon><IconifyIcon icon="lucide:copy" /></template>
                  复制示例
                </Button>
              </div>
              <pre
                class="overflow-x-auto rounded bg-slate-950 p-4 text-xs leading-6 text-slate-100"
              ><code>{{ curlExample }}</code></pre>
            </Card>
          </Tabs.TabPane>
        </Tabs>
      </Card>
    </div>

    <Modal
      v-model:open="createModalOpen"
      :cancel-button-props="{ disabled: createSubmitting }"
      :closable="!createSubmitting"
      :confirm-loading="createSubmitting"
      :keyboard="!createSubmitting"
      :mask-closable="false"
      ok-text="创建"
      title="创建 API Key"
      width="660px"
      @ok="handleCreateKey"
    >
      <Alert
        class="mb-4"
        message="额度、分组与限流由系统策略控制；你填写的有效期和 IP 规则仍会经过后端策略校验。"
        show-icon
        type="info"
      />
      <Form :label-col="{ span: 6 }" :wrapper-col="{ span: 18 }">
        <Form.Item label="名称" required>
          <Input
            v-model:value="createForm.name"
            :maxlength="64"
            placeholder="例如：本地开发、生产服务"
            show-count
          />
        </Form.Item>
        <Form.Item label="有效天数">
          <InputNumber
            v-model:value="createForm.expiresInDays"
            class="w-full"
            :max="3650"
            :min="1"
            placeholder="留空使用系统默认值"
          />
        </Form.Item>
        <Form.Item label="IP 白名单">
          <Input.TextArea
            v-model:value="createForm.ipWhitelistText"
            :rows="3"
            placeholder="每行一个 IP 或 CIDR；留空表示不限制"
          />
        </Form.Item>
        <Form.Item label="IP 黑名单">
          <Input.TextArea
            v-model:value="createForm.ipBlacklistText"
            :rows="3"
            placeholder="每行一个 IP 或 CIDR"
          />
        </Form.Item>
      </Form>
    </Modal>

    <Modal
      :closable="false"
      :footer="null"
      :keyboard="false"
      :mask-closable="false"
      :open="secretModalOpen"
      title="API Key 已生成（仅展示一次）"
      width="680px"
    >
      <Alert
        class="mb-4"
        message="请立即复制并安全保存。关闭后系统不会再次返回完整 Key。"
        show-icon
        type="warning"
      />
      <Input.Group compact>
        <Input
          :value="secretResult?.apiKey"
          readonly
          class="font-mono"
          style="width: calc(100% - 100px)"
        />
        <Button
          type="primary"
          style="width: 100px"
          @click="copyText(secretResult?.apiKey || '', 'API Key')"
        >
          <template #icon><IconifyIcon icon="lucide:copy" /></template>
          复制
        </Button>
      </Input.Group>
      <div class="mt-4 rounded border border-border p-3 text-sm">
        <div class="mb-1 font-medium">快速接入</div>
        <div class="break-all font-mono text-xs text-muted-foreground">
          {{ secretApiBaseUrl || '-' }}
        </div>
      </div>
      <div class="mt-4 rounded border border-border p-3 text-sm">
        <div class="font-medium">使用 AI 配置 WorkBuddy</div>
        <div class="mt-1 text-xs text-muted-foreground">
          自动将本次 API Key 填入配置提示词并复制，可直接发送给 AI。
        </div>
        <Button
          block
          class="mt-3"
          :disabled="!secretResult?.apiKey"
          @click="copyWorkBuddyPrompt"
        >
          <template #icon>
            <IconifyIcon icon="lucide:clipboard-copy" />
          </template>
          复制 WorkBuddy 配置提示词
        </Button>
      </div>
      <div class="mt-5 flex flex-wrap items-center justify-between gap-3">
        <Checkbox v-model:checked="secretAcknowledged">
          我已安全保存此 Key
        </Checkbox>
        <Button
          type="primary"
          :disabled="!secretAcknowledged"
          @click="closeSecretModal"
        >
          完成
        </Button>
      </div>
    </Modal>
  </Page>
</template>
