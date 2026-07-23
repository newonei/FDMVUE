<script lang="ts" setup>
import type { TableColumnsType } from 'ant-design-vue';

import type { FdmRelayApi } from '#/api/relay';

import { computed, onMounted, reactive, ref } from 'vue';

import { confirm, Page } from '@vben/common-ui';
import { IconifyIcon } from '@vben/icons';

import { useClipboard } from '@vueuse/core';
import {
  Alert,
  Button,
  Card,
  Checkbox,
  Col,
  DatePicker,
  Descriptions,
  Form,
  Input,
  InputNumber,
  message,
  Modal,
  Progress,
  Row,
  Select,
  Statistic,
  Switch,
  Table,
  Tabs,
  Tag,
} from 'ant-design-vue';

import { TableAction } from '#/adapter/vxe-table';
import {
  getRelayApiKeyPage,
  getRelayConfig,
  getRelayUsagePage,
  getRelayUsageStats,
  getRelayUserPage,
  revokeRelayApiKey,
  rotateRelayApiKey,
  saveRelayConfig,
  syncRelayUser,
  testRelayConnection,
  updateRelayUserStatus,
} from '#/api/relay';

defineOptions({ name: 'FdmRelayAdmin' });

interface TablePage {
  current?: number;
  pageSize?: number;
}

const activeTab = ref('overview');
const initialLoading = ref(false);

const configLoading = ref(false);
const configSaving = ref(false);
const connectionTesting = ref(false);
const hasAdminApiKey = ref(false);
const configured = ref(false);
const configUpdateTime = ref<string>();
const connectionResult = ref<FdmRelayApi.ConnectionTestResult>();
const configForm = reactive<FdmRelayApi.ConfigSaveRequest>({
  enabled: true,
  adminBaseUrl: '',
  publicBaseUrl: '',
  mode: 'USER_JWT',
  adminApiKey: '',
  connectTimeoutMillis: 10_000,
  readTimeoutMillis: 60_000,
  defaultBalance: 0,
  defaultConcurrency: 1,
  defaultRpmLimit: 60,
  defaultGroupId: undefined,
  defaultQuota: 0,
  defaultExpiresInDays: 30,
  defaultRateLimit5h: 0,
  defaultRateLimit1d: 0,
  defaultRateLimit7d: 0,
});

const statsLoading = ref(false);
const stats = ref<FdmRelayApi.UsageStats>({});

const userLoading = ref(false);
const users = ref<FdmRelayApi.UserBinding[]>([]);
const userQuery = reactive({
  keyword: '',
  provisionStatus: undefined as string | undefined,
  remoteStatus: undefined as string | undefined,
});
const userPagination = reactive({
  current: 1,
  pageSize: 10,
  total: 0,
  showSizeChanger: true,
  showTotal: (total: number) => `共 ${total} 条`,
});

const keyLoading = ref(false);
const keys = ref<FdmRelayApi.ApiKey[]>([]);
const keyQuery = reactive({
  keyword: '',
  status: undefined as string | undefined,
  userId: undefined as number | undefined,
});
const keyPagination = reactive({
  current: 1,
  pageSize: 10,
  total: 0,
  showSizeChanger: true,
  showTotal: (total: number) => `共 ${total} 条`,
});

const usageLoading = ref(false);
const usageLogs = ref<FdmRelayApi.UsageLog[]>([]);
const usageQuery = reactive({
  keyword: '',
  model: '',
  statusCode: undefined as number | undefined,
  createTime: undefined as [string, string] | undefined,
});
const usagePagination = reactive({
  current: 1,
  pageSize: 10,
  total: 0,
  showSizeChanger: true,
  showTotal: (total: number) => `共 ${total} 条`,
});

const secretModalOpen = ref(false);
const secretAcknowledged = ref(false);
const secretResult = ref<FdmRelayApi.ApiKeySecretResult>();
const { copy } = useClipboard({ legacy: true });

const userColumns: TableColumnsType<FdmRelayApi.UserBinding> = [
  { title: '系统用户', key: 'user', width: 180, fixed: 'left' },
  { title: 'Sub2API 映射', key: 'mapping', width: 220 },
  { title: '远端状态', key: 'remoteStatus', width: 110 },
  { title: '开通状态', key: 'provisionStatus', width: 110 },
  { title: '额度', key: 'balance', width: 180 },
  { title: '并发 / RPM', key: 'limits', width: 130 },
  { title: '最后同步', key: 'lastSyncTime', width: 180 },
  {
    title: '错误',
    dataIndex: 'lastErrorCode',
    key: 'lastErrorCode',
    width: 180,
  },
  { title: '操作', key: 'action', width: 150, fixed: 'right' },
];

const keyColumns: TableColumnsType<FdmRelayApi.ApiKey> = [
  { title: '用户', key: 'user', width: 160, fixed: 'left' },
  { title: '名称', dataIndex: 'name', key: 'name', width: 150 },
  { title: '密钥', key: 'maskedKey', width: 190 },
  { title: '状态', key: 'status', width: 100 },
  { title: '组', key: 'group', width: 100 },
  { title: '额度', key: 'quota', width: 170 },
  { title: '限流(5h/1d/7d)', key: 'rateLimit', width: 180 },
  { title: '过期时间', key: 'expiresAt', width: 180 },
  { title: '最后调用', key: 'lastUsedAt', width: 180 },
  { title: '同步状态', key: 'provisionStatus', width: 110 },
  { title: '操作', key: 'action', width: 150, fixed: 'right' },
];

const usageColumns: TableColumnsType<FdmRelayApi.UsageLog> = [
  { title: '时间', key: 'createdAt', width: 180, fixed: 'left' },
  { title: '用户', key: 'user', width: 150 },
  { title: 'Key', key: 'key', width: 150 },
  { title: '模型', dataIndex: 'model', key: 'model', width: 160 },
  { title: '类型', dataIndex: 'requestType', key: 'requestType', width: 120 },
  { title: '输入 Token', key: 'inputTokens', width: 120 },
  { title: '输出 Token', key: 'outputTokens', width: 120 },
  { title: '总 Token', key: 'totalTokens', width: 120 },
  { title: '费用', key: 'cost', width: 110 },
  { title: '耗时', key: 'latency', width: 110 },
  { title: '状态码', key: 'statusCode', width: 100 },
  { title: '请求 ID', dataIndex: 'requestId', key: 'requestId', width: 220 },
];

const overviewCards = computed(() => [
  {
    title: '请求总数',
    value: stats.value.requestCount ?? 0,
    suffix: '次',
    icon: 'lucide:send',
  },
  {
    title: 'Token 总量',
    value:
      stats.value.totalTokens ??
      (stats.value.inputTokens ?? stats.value.promptTokens ?? 0) +
        (stats.value.outputTokens ?? stats.value.completionTokens ?? 0),
    suffix: '',
    icon: 'lucide:binary',
  },
  {
    title: '累计费用',
    value: stats.value.totalCost ?? 0,
    prefix: '¥',
    precision: 4,
    icon: 'lucide:badge-dollar-sign',
  },
  {
    title: '已用额度',
    value: stats.value.quotaUsed ?? stats.value.usedQuota ?? 0,
    suffix: '',
    icon: 'lucide:gauge',
  },
]);

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

function formatTime(value?: string) {
  return value || '-';
}

function normalizeStatus(value: unknown) {
  return String(value ?? '').toUpperCase();
}

function statusColor(value: unknown) {
  const status = normalizeStatus(value);
  if (
    ['1', 'ACTIVE', 'AVAILABLE', 'ENABLED', 'SUCCESS', 'SYNCED'].includes(
      status,
    )
  ) {
    return 'success';
  }
  if (['0', 'DISABLED', 'ERROR', 'FAILED', 'REVOKED'].includes(status)) {
    return 'error';
  }
  if (['PENDING', 'SYNCING', 'UNKNOWN'].includes(status)) return 'warning';
  return 'default';
}

function statusText(value: unknown) {
  if (value === undefined || value === null || value === '') return '未知';
  const status = normalizeStatus(value);
  const labels: Record<string, string> = {
    '0': '停用',
    '1': '启用',
    ACTIVE: '启用',
    AVAILABLE: '可用',
    DISABLED: '停用',
    ENABLED: '启用',
    ERROR: '异常',
    FAILED: '失败',
    PENDING: '待同步',
    REVOKED: '已吊销',
    SUCCESS: '成功',
    SYNCED: '已同步',
    SYNCING: '同步中',
  };
  return labels[status] ?? String(value);
}

function isEnabledStatus(value: unknown) {
  return ['1', 'ACTIVE', 'AVAILABLE', 'ENABLED'].includes(
    normalizeStatus(value),
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

async function loadConfig() {
  configLoading.value = true;
  try {
    const data = await getRelayConfig();
    if (!data) return;
    Object.assign(configForm, {
      enabled: data.enabled ?? false,
      adminBaseUrl: data.adminBaseUrl ?? '',
      publicBaseUrl: data.publicBaseUrl ?? '',
      mode: data.mode ?? 'USER_JWT',
      adminApiKey: '',
      connectTimeoutMillis: data.connectTimeoutMillis ?? 10_000,
      readTimeoutMillis: data.readTimeoutMillis ?? 60_000,
      defaultBalance: data.defaultBalance ?? 0,
      defaultConcurrency: data.defaultConcurrency ?? 1,
      defaultRpmLimit: data.defaultRpmLimit ?? 60,
      defaultGroupId: data.defaultGroupId,
      defaultQuota: data.defaultQuota ?? 0,
      defaultExpiresInDays: data.defaultExpiresInDays ?? 30,
      defaultRateLimit5h: data.defaultRateLimit5h ?? 0,
      defaultRateLimit1d: data.defaultRateLimit1d ?? 0,
      defaultRateLimit7d: data.defaultRateLimit7d ?? 0,
    });
    hasAdminApiKey.value = Boolean(data.hasAdminApiKey);
    configured.value = Boolean(data.configured);
    configUpdateTime.value = data.updateTime;
  } finally {
    configLoading.value = false;
  }
}

async function handleSaveConfig() {
  if (!configForm.adminBaseUrl.trim() || !configForm.publicBaseUrl.trim()) {
    message.warning('请填写管理端地址和对外 API 地址');
    return;
  }
  if (!hasAdminApiKey.value && !configForm.adminApiKey?.trim()) {
    message.warning('首次配置必须填写 Sub2API 管理员 API Key');
    return;
  }
  configSaving.value = true;
  try {
    await saveRelayConfig({
      ...configForm,
      adminBaseUrl: configForm.adminBaseUrl.trim(),
      publicBaseUrl: configForm.publicBaseUrl.trim(),
      adminApiKey: configForm.adminApiKey?.trim() || undefined,
    });
    configForm.adminApiKey = '';
    message.success('中转站配置已保存');
    await loadConfig();
  } finally {
    configSaving.value = false;
    configForm.adminApiKey = '';
  }
}

async function handleTestConnection() {
  connectionTesting.value = true;
  try {
    connectionResult.value = await testRelayConnection();
    if (connectionResult.value.success) {
      message.success(connectionResult.value.message || '连接测试成功');
    } else {
      message.error(connectionResult.value.message || '连接测试失败');
    }
  } finally {
    connectionTesting.value = false;
  }
}

async function loadStats() {
  statsLoading.value = true;
  try {
    stats.value = (await getRelayUsageStats()) || {};
  } finally {
    statsLoading.value = false;
  }
}

async function loadUsers(reset = false) {
  if (reset) userPagination.current = 1;
  userLoading.value = true;
  try {
    const data = await getRelayUserPage({
      pageNo: userPagination.current,
      pageSize: userPagination.pageSize,
      ...compactParams(userQuery),
    });
    users.value = data?.list ?? [];
    userPagination.total = data?.total ?? 0;
  } finally {
    userLoading.value = false;
  }
}

function handleUserPageChange(page: TablePage) {
  userPagination.current = page.current ?? 1;
  userPagination.pageSize = page.pageSize ?? 10;
  void loadUsers();
}

async function handleSyncUser(row: Record<string, any>) {
  await syncRelayUser(row.id);
  message.success('用户同步完成');
  await Promise.all([loadUsers(), loadStats()]);
}

async function handleToggleUser(row: Record<string, any>) {
  const enabled = isEnabledStatus(row.remoteStatus);
  await confirm(`确认${enabled ? '停用' : '启用'}该用户的中转站访问？`);
  await updateRelayUserStatus({
    id: row.id,
    status: enabled ? 0 : 1,
  });
  message.success(`用户已${enabled ? '停用' : '启用'}`);
  await loadUsers();
}

async function loadKeys(reset = false) {
  if (reset) keyPagination.current = 1;
  keyLoading.value = true;
  try {
    const data = await getRelayApiKeyPage({
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

function showSecret(result: FdmRelayApi.ApiKeySecretResult) {
  secretResult.value = result;
  secretAcknowledged.value = false;
  secretModalOpen.value = true;
}

async function handleRotateKey(row: Record<string, any>) {
  await confirm(`确认轮换密钥“${row.name}”？旧密钥将按后端策略失效。`);
  const result = await rotateRelayApiKey(row.id);
  showSecret(result);
  await loadKeys();
}

async function handleRevokeKey(row: Record<string, any>) {
  await confirm(`确认吊销密钥“${row.name}”？吊销后无法恢复。`);
  await revokeRelayApiKey(row.id);
  message.success('密钥已吊销');
  await Promise.all([loadKeys(), loadStats()]);
}

async function copySecret() {
  if (!secretResult.value?.apiKey) return;
  await copy(secretResult.value.apiKey);
  message.success('API Key 已复制');
}

function closeSecretModal() {
  if (!secretAcknowledged.value) return;
  secretModalOpen.value = false;
  secretResult.value = undefined;
  secretAcknowledged.value = false;
}

async function loadUsage(reset = false) {
  if (reset) usagePagination.current = 1;
  usageLoading.value = true;
  try {
    const data = await getRelayUsagePage({
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
    await Promise.allSettled([
      loadConfig(),
      loadStats(),
      loadUsers(),
      loadKeys(),
      loadUsage(),
    ]);
  } finally {
    initialLoading.value = false;
  }
}

onMounted(refreshAll);
</script>

<template>
  <Page auto-content-height content-class="flex min-h-0 flex-1 flex-col !p-0">
    <div class="flex h-full min-h-0 flex-col px-4 pb-4">
      <header class="flex flex-wrap items-center justify-between gap-3 py-3">
        <div>
          <h2 class="mb-1 text-lg font-semibold text-foreground">中转站管理</h2>
          <p class="mb-0 text-xs text-muted-foreground">
            统一管理 Sub2API 连接、用户映射、API Key 和调用用量。
          </p>
        </div>
        <Button :loading="initialLoading" @click="refreshAll">
          <template #icon><IconifyIcon icon="lucide:refresh-cw" /></template>
          全部刷新
        </Button>
      </header>

      <Card class="min-h-0 flex-1" :body-style="{ padding: '0 16px 16px' }">
        <Tabs v-model:active-key="activeTab" destroy-inactive-tab-pane>
          <Tabs.TabPane key="overview" tab="概览">
            <Row :gutter="[16, 16]">
              <Col
                v-for="item in overviewCards"
                :key="item.title"
                :xs="24"
                :sm="12"
                :xl="6"
              >
                <Card :loading="statsLoading" size="small">
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

            <Row :gutter="[16, 16]" class="mt-4">
              <Col :xs="24" :xl="12">
                <Card title="连接状态" size="small">
                  <Descriptions :column="1" bordered size="small">
                    <Descriptions.Item label="功能状态">
                      <Tag :color="configForm.enabled ? 'success' : 'default'">
                        {{ configForm.enabled ? '启用' : '停用' }}
                      </Tag>
                    </Descriptions.Item>
                    <Descriptions.Item label="配置状态">
                      <Tag :color="configured ? 'success' : 'warning'">
                        {{ configured ? '已配置' : '待配置' }}
                      </Tag>
                    </Descriptions.Item>
                    <Descriptions.Item label="管理员 Key">
                      <Tag :color="hasAdminApiKey ? 'success' : 'warning'">
                        {{ hasAdminApiKey ? '已安全保存' : '未配置' }}
                      </Tag>
                    </Descriptions.Item>
                    <Descriptions.Item label="管理端地址">
                      <span class="break-all font-mono text-xs">
                        {{ configForm.adminBaseUrl || '-' }}
                      </span>
                    </Descriptions.Item>
                    <Descriptions.Item label="最后更新">
                      {{ formatTime(configUpdateTime) }}
                    </Descriptions.Item>
                  </Descriptions>
                  <div class="mt-3 flex justify-end gap-2">
                    <Button @click="activeTab = 'config'">前往配置</Button>
                    <Button
                      type="primary"
                      :loading="connectionTesting"
                      @click="handleTestConnection"
                    >
                      测试连接
                    </Button>
                  </div>
                </Card>
              </Col>
              <Col :xs="24" :xl="12">
                <Card title="额度与健康" size="small">
                  <div class="space-y-5 py-2">
                    <div>
                      <div class="mb-2 flex justify-between text-sm">
                        <span>额度使用</span>
                        <span>
                          {{ formatNumber(stats.quotaUsed ?? stats.usedQuota) }}
                          /
                          {{
                            formatNumber(
                              (stats.quotaUsed ?? stats.usedQuota ?? 0) +
                                (stats.quotaRemaining ??
                                  stats.remainingQuota ??
                                  0),
                            )
                          }}
                        </span>
                      </div>
                      <Progress
                        :percent="
                          quotaPercent(
                            stats.quotaUsed ?? stats.usedQuota,
                            (stats.quotaUsed ?? stats.usedQuota ?? 0) +
                              (stats.quotaRemaining ??
                                stats.remainingQuota ??
                                0),
                          )
                        "
                      />
                    </div>
                    <Descriptions :column="2" bordered size="small">
                      <Descriptions.Item label="成功请求">
                        {{ formatNumber(stats.successCount) }}
                      </Descriptions.Item>
                      <Descriptions.Item label="失败请求">
                        {{ formatNumber(stats.failedCount) }}
                      </Descriptions.Item>
                      <Descriptions.Item label="输入 Token">
                        {{
                          formatNumber(stats.inputTokens ?? stats.promptTokens)
                        }}
                      </Descriptions.Item>
                      <Descriptions.Item label="输出 Token">
                        {{
                          formatNumber(
                            stats.outputTokens ?? stats.completionTokens,
                          )
                        }}
                      </Descriptions.Item>
                    </Descriptions>
                  </div>
                </Card>
              </Col>
            </Row>
          </Tabs.TabPane>

          <Tabs.TabPane key="config" tab="连接配置">
            <Alert
              class="mb-4"
              message="管理员 API Key 只会提交到服务端安全保存，查询与编辑时永不回显；留空表示保留原 Key。"
              show-icon
              type="warning"
            />
            <Card :loading="configLoading" size="small">
              <Form :label-col="{ span: 7 }" :wrapper-col="{ span: 17 }">
                <Row :gutter="16">
                  <Col :xs="24" :lg="12">
                    <Form.Item label="功能状态" required>
                      <Switch
                        v-model:checked="configForm.enabled"
                        checked-children="启用"
                        un-checked-children="停用"
                      />
                    </Form.Item>
                    <Form.Item label="管理端地址" required>
                      <Input
                        v-model:value="configForm.adminBaseUrl"
                        allow-clear
                        placeholder="http://43.166.1.93:8080"
                      />
                    </Form.Item>
                    <Form.Item label="对外 API 地址" required>
                      <Input
                        v-model:value="configForm.publicBaseUrl"
                        allow-clear
                        placeholder="https://api.example.com/v1"
                      />
                    </Form.Item>
                    <Form.Item label="接入模式" required>
                      <Select
                        v-model:value="configForm.mode"
                        :options="[
                          { label: '用户 JWT（推荐）', value: 'USER_JWT' },
                          { label: '管理员桥接', value: 'ADMIN_BRIDGE' },
                        ]"
                      />
                    </Form.Item>
                    <Form.Item
                      label="管理员 API Key"
                      :required="!hasAdminApiKey"
                    >
                      <Input.Password
                        v-model:value="configForm.adminApiKey"
                        autocomplete="new-password"
                        placeholder="留空表示不修改当前 Key"
                      />
                      <div class="mt-1 text-xs text-muted-foreground">
                        当前状态：{{ hasAdminApiKey ? '已配置' : '未配置' }}
                      </div>
                    </Form.Item>
                    <Form.Item label="连接超时(ms)">
                      <InputNumber
                        v-model:value="configForm.connectTimeoutMillis"
                        class="w-full"
                        :min="1000"
                        :step="1000"
                      />
                    </Form.Item>
                    <Form.Item label="读取超时(ms)">
                      <InputNumber
                        v-model:value="configForm.readTimeoutMillis"
                        class="w-full"
                        :min="1000"
                        :step="1000"
                      />
                    </Form.Item>
                  </Col>
                  <Col :xs="24" :lg="12">
                    <Form.Item label="默认分组 ID">
                      <InputNumber
                        v-model:value="configForm.defaultGroupId"
                        class="w-full"
                        :min="1"
                      />
                    </Form.Item>
                    <Form.Item label="默认余额">
                      <InputNumber
                        v-model:value="configForm.defaultBalance"
                        class="w-full"
                        :min="0"
                      />
                    </Form.Item>
                    <Form.Item label="默认额度">
                      <InputNumber
                        v-model:value="configForm.defaultQuota"
                        class="w-full"
                        :min="0"
                      />
                    </Form.Item>
                    <Form.Item label="默认并发">
                      <InputNumber
                        v-model:value="configForm.defaultConcurrency"
                        class="w-full"
                        :min="1"
                      />
                    </Form.Item>
                    <Form.Item label="默认 RPM">
                      <InputNumber
                        v-model:value="configForm.defaultRpmLimit"
                        class="w-full"
                        :min="0"
                      />
                    </Form.Item>
                    <Form.Item label="默认有效天数">
                      <InputNumber
                        v-model:value="configForm.defaultExpiresInDays"
                        class="w-full"
                        :min="1"
                      />
                    </Form.Item>
                    <Form.Item label="默认限流(5h)">
                      <InputNumber
                        v-model:value="configForm.defaultRateLimit5h"
                        class="w-full"
                        :min="0"
                      />
                    </Form.Item>
                    <Form.Item label="默认限流(1d)">
                      <InputNumber
                        v-model:value="configForm.defaultRateLimit1d"
                        class="w-full"
                        :min="0"
                      />
                    </Form.Item>
                    <Form.Item label="默认限流(7d)">
                      <InputNumber
                        v-model:value="configForm.defaultRateLimit7d"
                        class="w-full"
                        :min="0"
                      />
                    </Form.Item>
                  </Col>
                </Row>
                <div class="flex flex-wrap justify-end gap-2 border-t pt-4">
                  <Button
                    :loading="connectionTesting"
                    @click="handleTestConnection"
                  >
                    测试已保存配置
                  </Button>
                  <Button
                    type="primary"
                    :loading="configSaving"
                    @click="handleSaveConfig"
                  >
                    保存配置
                  </Button>
                </div>
              </Form>
            </Card>
            <Alert
              v-if="connectionResult"
              class="mt-4"
              :message="
                connectionResult.message ||
                (connectionResult.success ? '连接正常' : '连接失败')
              "
              :description="
                [
                  connectionResult.version
                    ? `版本：${connectionResult.version}`
                    : '',
                  connectionResult.latencyMillis !== undefined
                    ? `延迟：${connectionResult.latencyMillis} ms`
                    : '',
                ]
                  .filter(Boolean)
                  .join('，')
              "
              show-icon
              :type="connectionResult.success ? 'success' : 'error'"
            />
          </Tabs.TabPane>

          <Tabs.TabPane key="users" tab="用户映射">
            <div class="mb-3 flex flex-wrap gap-2">
              <Input
                v-model:value="userQuery.keyword"
                allow-clear
                class="w-64"
                placeholder="用户名、昵称、邮箱"
                @press-enter="loadUsers(true)"
              />
              <Select
                v-model:value="userQuery.provisionStatus"
                allow-clear
                class="w-36"
                placeholder="开通状态"
                :options="[
                  { label: '已同步', value: 'SYNCED' },
                  { label: '待同步', value: 'PENDING' },
                  { label: '同步失败', value: 'FAILED' },
                ]"
              />
              <Select
                v-model:value="userQuery.remoteStatus"
                allow-clear
                class="w-32"
                placeholder="远端状态"
                :options="[
                  { label: '启用', value: 'ACTIVE' },
                  { label: '停用', value: 'DISABLED' },
                ]"
              />
              <Button type="primary" @click="loadUsers(true)">查询</Button>
              <Button
                @click="
                  Object.assign(userQuery, {
                    keyword: '',
                    provisionStatus: undefined,
                    remoteStatus: undefined,
                  });
                  loadUsers(true);
                "
              >
                重置
              </Button>
            </div>
            <Table
              :columns="userColumns"
              :data-source="users"
              :loading="userLoading"
              :pagination="userPagination"
              row-key="id"
              :scroll="{ x: 1500 }"
              size="middle"
              @change="handleUserPageChange"
            >
              <template #bodyCell="{ column, record }">
                <template v-if="column.key === 'user'">
                  <div class="font-medium">
                    {{
                      record.nickname ||
                      record.username ||
                      `用户 ${record.userId}`
                    }}
                  </div>
                  <div class="text-xs text-muted-foreground">
                    ID {{ record.userId
                    }}<span v-if="record.username">
                      · {{ record.username }}</span
                    >
                  </div>
                </template>
                <template v-else-if="column.key === 'mapping'">
                  <div>远端 ID：{{ record.remoteUserId || '-' }}</div>
                  <div class="truncate text-xs text-muted-foreground">
                    {{ record.shadowEmail || '-' }}
                  </div>
                </template>
                <template v-else-if="column.key === 'remoteStatus'">
                  <Tag :color="statusColor(record.remoteStatus)">
                    {{ statusText(record.remoteStatus) }}
                  </Tag>
                </template>
                <template v-else-if="column.key === 'provisionStatus'">
                  <Tag :color="statusColor(record.provisionStatus)">
                    {{ statusText(record.provisionStatus) }}
                  </Tag>
                </template>
                <template v-else-if="column.key === 'balance'">
                  <div>
                    {{ formatNumber(record.usedBalance) }} /
                    {{ formatNumber(record.balance) }}
                  </div>
                  <Progress
                    :percent="quotaPercent(record.usedBalance, record.balance)"
                    :show-info="false"
                    size="small"
                  />
                </template>
                <template v-else-if="column.key === 'limits'">
                  {{ record.concurrency ?? '-' }} / {{ record.rpmLimit ?? '-' }}
                </template>
                <template v-else-if="column.key === 'lastSyncTime'">
                  {{ formatTime(record.lastSyncTime) }}
                </template>
                <template v-else-if="column.key === 'lastErrorCode'">
                  <span
                    :class="
                      record.lastErrorCode
                        ? 'text-red-500'
                        : 'text-muted-foreground'
                    "
                  >
                    {{ record.lastErrorCode || '-' }}
                  </span>
                </template>
                <template v-else-if="column.key === 'action'">
                  <TableAction
                    :actions="[
                      {
                        label: '同步',
                        type: 'link',
                        auth: ['fdmrelay:user:sync'],
                        onClick: handleSyncUser.bind(null, record),
                      },
                      {
                        label: isEnabledStatus(record.remoteStatus)
                          ? '停用'
                          : '启用',
                        type: 'link',
                        danger: isEnabledStatus(record.remoteStatus),
                        auth: ['fdmrelay:user:update-status'],
                        onClick: handleToggleUser.bind(null, record),
                      },
                    ]"
                  />
                </template>
              </template>
            </Table>
          </Tabs.TabPane>

          <Tabs.TabPane key="keys" tab="全站密钥">
            <Alert
              class="mb-3"
              message="列表只显示掩码。创建或轮换后的完整 Key 只展示一次。"
              show-icon
              type="info"
            />
            <div class="mb-3 flex flex-wrap gap-2">
              <Input
                v-model:value="keyQuery.keyword"
                allow-clear
                class="w-60"
                placeholder="密钥名称、用户"
                @press-enter="loadKeys(true)"
              />
              <InputNumber
                v-model:value="keyQuery.userId"
                class="w-36"
                :min="1"
                placeholder="用户 ID"
              />
              <Select
                v-model:value="keyQuery.status"
                allow-clear
                class="w-32"
                placeholder="状态"
                :options="[
                  { label: '启用', value: 'ACTIVE' },
                  { label: '停用', value: 'DISABLED' },
                  { label: '已吊销', value: 'REVOKED' },
                ]"
              />
              <Button type="primary" @click="loadKeys(true)">查询</Button>
              <Button
                @click="
                  Object.assign(keyQuery, {
                    keyword: '',
                    status: undefined,
                    userId: undefined,
                  });
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
              :scroll="{ x: 1750 }"
              size="middle"
              @change="handleKeyPageChange"
            >
              <template #bodyCell="{ column, record }">
                <template v-if="column.key === 'user'">
                  <div>
                    {{
                      record.nickname ||
                      record.username ||
                      `用户 ${record.userId || '-'}`
                    }}
                  </div>
                  <div class="text-xs text-muted-foreground">
                    ID {{ record.userId || '-' }}
                  </div>
                </template>
                <template v-else-if="column.key === 'maskedKey'">
                  <span class="font-mono text-xs">{{ maskedKey(record) }}</span>
                </template>
                <template v-else-if="column.key === 'status'">
                  <Tag :color="statusColor(record.status)">
                    {{ statusText(record.status) }}
                  </Tag>
                </template>
                <template v-else-if="column.key === 'group'">
                  {{ record.groupName || record.groupId || '-' }}
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
                <template v-else-if="column.key === 'provisionStatus'">
                  <Tag :color="statusColor(record.provisionStatus)">
                    {{ statusText(record.provisionStatus) }}
                  </Tag>
                </template>
                <template v-else-if="column.key === 'action'">
                  <TableAction
                    :actions="[
                      {
                        label: '轮换',
                        type: 'link',
                        auth: ['fdmrelay:api-key:rotate'],
                        disabled: normalizeStatus(record.status) === 'REVOKED',
                        onClick: handleRotateKey.bind(null, record),
                      },
                      {
                        label: '吊销',
                        type: 'link',
                        danger: true,
                        auth: ['fdmrelay:api-key:revoke'],
                        disabled: normalizeStatus(record.status) === 'REVOKED',
                        onClick: handleRevokeKey.bind(null, record),
                      },
                    ]"
                  />
                </template>
              </template>
            </Table>
          </Tabs.TabPane>

          <Tabs.TabPane key="usage" tab="用量明细">
            <div class="mb-3 flex flex-wrap gap-2">
              <Input
                v-model:value="usageQuery.keyword"
                allow-clear
                class="w-56"
                placeholder="用户、Key、请求 ID"
                @press-enter="loadUsage(true)"
              />
              <Input
                v-model:value="usageQuery.model"
                allow-clear
                class="w-44"
                placeholder="模型"
              />
              <Select
                v-model:value="usageQuery.statusCode"
                allow-clear
                class="w-32"
                placeholder="状态码"
                :options="[
                  { label: '2xx', value: 200 },
                  { label: '4xx', value: 400 },
                  { label: '5xx', value: 500 },
                ]"
              />
              <DatePicker.RangePicker
                v-model:value="usageQuery.createTime"
                value-format="YYYY-MM-DD"
              />
              <Button type="primary" @click="loadUsage(true)">查询</Button>
              <Button
                @click="
                  Object.assign(usageQuery, {
                    keyword: '',
                    model: '',
                    statusCode: undefined,
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
              :scroll="{ x: 1700 }"
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
                <template v-else-if="column.key === 'user'">
                  {{
                    record.nickname || record.username || record.userId || '-'
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
                  {{ formatNumber(record.inputTokens ?? record.promptTokens) }}
                </template>
                <template v-else-if="column.key === 'outputTokens'">
                  {{
                    formatNumber(record.outputTokens ?? record.completionTokens)
                  }}
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
        </Tabs>
      </Card>
    </div>

    <Modal
      :closable="false"
      :footer="null"
      :mask-closable="false"
      :open="secretModalOpen"
      title="新 API Key（仅展示一次）"
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
        <Button type="primary" style="width: 100px" @click="copySecret">
          <template #icon><IconifyIcon icon="lucide:copy" /></template>
          复制
        </Button>
      </Input.Group>
      <div v-if="secretResult?.publicBaseUrl" class="mt-3 text-sm">
        API 地址：<span class="break-all font-mono">{{
          secretResult.publicBaseUrl
        }}</span>
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
