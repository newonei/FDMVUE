<script lang="ts" setup>
import type { TableColumnsType } from 'ant-design-vue';

import type { JinZhiDocumentApi } from '#/api/fdmdingtalk/jinzhi-document';

import { computed, onMounted, reactive, ref } from 'vue';

import { Page } from '@vben/common-ui';

import { useClipboard } from '@vueuse/core';
import {
  Alert,
  Button,
  Card,
  Collapse,
  Descriptions,
  Drawer,
  Empty,
  Input,
  InputNumber,
  message,
  Pagination,
  Progress,
  Radio,
  Select,
  Space,
  Statistic,
  Table,
  Tabs,
  Tag,
  Tooltip,
} from 'ant-design-vue';

import {
  getJinZhiDocumentCatalog,
  getJinZhiDocumentPage,
  probeJinZhiDocumentTypes,
} from '#/api/fdmdingtalk/jinzhi-document';

defineOptions({ name: 'FdmDingtalkJinzhiDiscovery' });

interface TablePage {
  current?: number;
  pageSize?: number;
}

type ProbeMode = 'catalog' | 'range';

const MAX_TYPES_PER_RUN = 500;
const PROBE_BATCH_SIZE = 10;
const PROBE_BATCH_DELAY_MS = 250;
const PAYMENT_RELATED_TYPES = new Set([171, 198]);

const STATUS_META: Record<
  JinZhiDocumentApi.ProbeStatus,
  { color: string; label: string }
> = {
  EMPTY: { color: 'default', label: '可访问但暂无数据' },
  ERROR: { color: 'error', label: '探测失败' },
  FORBIDDEN: { color: 'orange', label: '无权限' },
  FOUND: { color: 'success', label: '发现单据' },
  RATE_LIMITED: { color: 'warning', label: '触发限流' },
  UNSUPPORTED: { color: 'default', label: '明确不支持' },
};

const catalogLoading = ref(false);
const probeRunning = ref(false);
const stopRequested = ref(false);
const drawerOpen = ref(false);
const pageLoading = ref(false);
const drawerTab = ref('overview');
const probeMode = ref<ProbeMode>('range');
const rangeStart = ref(1);
const rangeEnd = ref(300);
const processedCount = ref(0);
const probeTotal = ref(0);
const keyword = ref('');
const statusFilter = ref<JinZhiDocumentApi.ProbeStatus>();
const catalog = ref<JinZhiDocumentApi.CatalogItem[]>([]);
const results = ref<JinZhiDocumentApi.ProbeResult[]>([]);
const selected = ref<JinZhiDocumentApi.ProbeResult>();
const documentPage = ref<JinZhiDocumentApi.DocumentPage>();
const { copy } = useClipboard({ legacy: true });

const resultPagination = reactive({
  current: 1,
  pageSize: 20,
  showSizeChanger: true,
  showTotal: (total: number) => `共 ${total} 个 datatype`,
});
const documentPagination = reactive({
  current: 1,
  pageSize: 10,
  total: 0,
});

const catalogColumns: TableColumnsType<JinZhiDocumentApi.CatalogItem> = [
  { dataIndex: 'documentName', title: '单据类型' },
  { dataIndex: 'dataType', title: 'datatype', width: 120 },
  { dataIndex: 'editable', title: '可编辑', width: 110 },
  { dataIndex: 'action', fixed: 'right', title: '操作', width: 190 },
];
const catalogPagination = {
  pageSize: 20,
  showSizeChanger: true,
  showTotal: (total: number) => `共 ${total} 个已知 datatype`,
};

const columns: TableColumnsType<JinZhiDocumentApi.ProbeResult> = [
  { dataIndex: 'dataType', fixed: 'left', title: 'datatype', width: 100 },
  { dataIndex: 'documentName', title: '单据名称', width: 150 },
  { dataIndex: 'editable', title: '可编辑', width: 100 },
  { dataIndex: 'status', title: '探测结果', width: 160 },
  { dataIndex: 'totalCount', title: '记录数', width: 95 },
  { dataIndex: 'fields', title: '返回字段', width: 320 },
  { dataIndex: 'approvalFields', title: '疑似审核字段', width: 220 },
  { dataIndex: 'error', title: '说明', width: 260 },
  { dataIndex: 'action', fixed: 'right', title: '操作', width: 160 },
];
const fieldColumns: TableColumnsType<{
  field: string;
  key: string;
  sample: string;
}> = [
  { dataIndex: 'key', title: '字段 Key', width: 210 },
  { dataIndex: 'field', title: '字段名称', width: 210 },
  { dataIndex: 'sample', title: '脱敏样例' },
];

const resultCounts = computed(() => ({
  empty: results.value.filter((item) => item.status === 'EMPTY').length,
  errors: results.value.filter((item) =>
    ['ERROR', 'FORBIDDEN', 'RATE_LIMITED'].includes(item.status),
  ).length,
  found: results.value.filter((item) => item.status === 'FOUND').length,
}));

const filteredResults = computed(() => {
  const normalizedKeyword = keyword.value.trim().toLowerCase();
  return results.value.filter((item) => {
    if (statusFilter.value && item.status !== statusFilter.value) return false;
    if (!normalizedKeyword) return true;
    return [
      item.dataType,
      item.documentName,
      ...Object.keys(item.fieldNames ?? {}),
      ...Object.values(item.fieldNames ?? {}),
    ]
      .filter(Boolean)
      .some((value) => String(value).toLowerCase().includes(normalizedKeyword));
  });
});

const fieldRows = computed(() => {
  const fieldNames =
    documentPage.value?.fieldNames ?? selected.value?.fieldNames ?? {};
  const sample = documentPage.value?.data?.[0] ?? selected.value?.sample ?? {};
  return Object.entries(fieldNames).map(([key, field]) => ({
    field,
    key,
    sample: compactValue(sample[key]),
  }));
});

const probePercent = computed(() => {
  if (!probeTotal.value) return 0;
  return Math.round((processedCount.value / probeTotal.value) * 100);
});

function isPaymentRelated(dataType: number) {
  return PAYMENT_RELATED_TYPES.has(dataType);
}

function resolveEditable(dataType: number, editable?: boolean) {
  return (
    editable ??
    catalog.value.find((item) => item.dataType === dataType)?.editable
  );
}

function editableMeta(editable?: boolean) {
  if (editable === true) return { color: 'success', label: '✓ 可编辑' };
  if (editable === false) return { color: 'error', label: '✕ 不可编辑' };
  return { color: 'default', label: '未知' };
}

function statusMeta(status: JinZhiDocumentApi.ProbeStatus) {
  return STATUS_META[status] ?? { color: 'default', label: status };
}

function fieldSummary(value: unknown) {
  const record = value as JinZhiDocumentApi.ProbeResult;
  const entries = Object.entries(record.fieldNames ?? {});
  if (!entries.length) return '-';
  const text = entries
    .slice(0, 4)
    .map(([key, label]) => `${label || key}(${key})`)
    .join('、');
  return entries.length > 4 ? `${text} 等 ${entries.length} 个字段` : text;
}

function isSensitiveKey(key: string) {
  return /(?:account|bank|card|mobile|phone|tel|idcard|identity|银行卡|银行账号|收款账号|账户号码|开户|手机号|电话|身份证)/i.test(
    key,
  );
}

function maskText(value: string, force = false) {
  if (!value) return value;
  if (force) {
    if (value.length <= 4) return '****';
    return `${'*'.repeat(Math.min(12, value.length - 4))}${value.slice(-4)}`;
  }
  return value.replace(/(?<!\d)\d{11,19}(?!\d)/g, (match) => {
    return `${'*'.repeat(Math.min(12, match.length - 4))}${match.slice(-4)}`;
  });
}

function sanitize(value: unknown, key = ''): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => sanitize(item, key));
  }
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(
        ([childKey, child]) => [childKey, sanitize(child, childKey)],
      ),
    );
  }
  if (typeof value === 'string') {
    return maskText(value, isSensitiveKey(key));
  }
  if (typeof value === 'number' && isSensitiveKey(key)) {
    return maskText(String(value), true);
  }
  return value;
}

function safeJson(value: unknown) {
  if (value === undefined || value === null) return '-';
  try {
    return JSON.stringify(sanitize(value), null, 2);
  } catch {
    return String(value);
  }
}

function compactValue(value: unknown) {
  if (value === undefined || value === null || value === '') return '-';
  const text =
    typeof value === 'object' ? safeJson(value) : String(sanitize(value));
  return text.length > 160 ? `${text.slice(0, 160)}…` : text;
}

function buildProbeTypes() {
  if (probeMode.value === 'catalog') {
    return catalog.value.map((item) => item.dataType);
  }
  const start = Math.trunc(Number(rangeStart.value));
  const end = Math.trunc(Number(rangeEnd.value));
  if (!Number.isFinite(start) || !Number.isFinite(end) || start < 1) {
    throw new Error('datatype 范围必须是大于 0 的整数');
  }
  if (end < start) throw new Error('结束值不能小于起始值');
  if (end - start + 1 > MAX_TYPES_PER_RUN) {
    throw new Error(`单次最多探测 ${MAX_TYPES_PER_RUN} 个 datatype`);
  }
  return Array.from({ length: end - start + 1 }, (_, index) => start + index);
}

function mergeResults(items: JinZhiDocumentApi.ProbeResult[]) {
  const merged = new Map(results.value.map((item) => [item.dataType, item]));
  items.forEach((item) => merged.set(item.dataType, item));
  results.value = [...merged.values()].sort(
    (left, right) => Number(left.dataType) - Number(right.dataType),
  );
}

function wait(milliseconds: number) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function loadCatalog() {
  catalogLoading.value = true;
  try {
    catalog.value = (await getJinZhiDocumentCatalog()) ?? [];
  } finally {
    catalogLoading.value = false;
  }
}

async function runProbeTypes(dataTypes: number[], resetResults: boolean) {
  if (!dataTypes.length) {
    message.warning('没有可探测的 datatype');
    return;
  }

  if (resetResults) results.value = [];
  resultPagination.current = 1;
  processedCount.value = 0;
  probeTotal.value = dataTypes.length;
  stopRequested.value = false;
  probeRunning.value = true;
  let foundCount = 0;
  try {
    for (
      let offset = 0;
      offset < dataTypes.length;
      offset += PROBE_BATCH_SIZE
    ) {
      if (stopRequested.value) break;
      const batch = dataTypes.slice(offset, offset + PROBE_BATCH_SIZE);
      const batchResult = await probeJinZhiDocumentTypes({ dataTypes: batch });
      mergeResults(batchResult ?? []);
      foundCount +=
        batchResult?.filter((item) => item.status === 'FOUND').length ?? 0;
      processedCount.value += batch.length;
      if (batchResult?.some((item) => item.status === 'RATE_LIMITED')) {
        message.warning('钉钉已返回限流，探测已自动停止，请稍后从断点继续');
        break;
      }
      if (offset + PROBE_BATCH_SIZE < dataTypes.length) {
        await wait(PROBE_BATCH_DELAY_MS);
      }
    }
    if (stopRequested.value) message.info('已停止探测');
    else if (processedCount.value === probeTotal.value) {
      message.success(`探测完成，发现 ${foundCount} 个有数据类型`);
    }
  } finally {
    probeRunning.value = false;
  }
}

async function runProbe() {
  let dataTypes: number[];
  try {
    dataTypes = buildProbeTypes();
  } catch (error) {
    message.warning(error instanceof Error ? error.message : '探测范围无效');
    return;
  }
  await runProbeTypes(dataTypes, true);
}

async function runCatalogProbe(value: unknown) {
  const record = value as JinZhiDocumentApi.CatalogItem;
  await runProbeTypes([record.dataType], false);
}

function stopProbe() {
  stopRequested.value = true;
}

async function copyDataType(dataType: number) {
  await copy(String(dataType));
  message.success(`已复制 datatype ${dataType}`);
}

async function loadDocumentPage() {
  if (!selected.value) return;
  pageLoading.value = true;
  try {
    documentPage.value = await getJinZhiDocumentPage({
      dataType: selected.value.dataType,
      pageNo: documentPagination.current,
      pageSize: documentPagination.pageSize,
    });
    documentPagination.total = documentPage.value?.totalCount ?? 0;
  } finally {
    pageLoading.value = false;
  }
}

async function openDocuments(value: unknown) {
  const record = value as JinZhiDocumentApi.ProbeResult;
  selected.value = record;
  documentPage.value = undefined;
  documentPagination.current = 1;
  drawerTab.value = 'overview';
  drawerOpen.value = true;
  await loadDocumentPage();
}

function handleResultPageChange(page: TablePage) {
  resultPagination.current = page.current ?? 1;
  resultPagination.pageSize = page.pageSize ?? 20;
}

function handleDocumentPageChange(page: number, pageSize: number) {
  documentPagination.current = page;
  documentPagination.pageSize = pageSize;
  void loadDocumentPage();
}

onMounted(() => {
  void loadCatalog();
});
</script>

<template>
  <Page auto-content-height title="金智单据类型探测器">
    <Alert
      class="mb-4"
      show-icon
      type="warning"
      message="金智 CRM 暂未公开“枚举全部 datatype”的接口"
    >
      <template #description>
        <div>
          范围探测会对每个 datatype 仅读取第 1
          条样本；空结果只表示当前账号下暂无记录，不能据此判定类型不存在。所有样本均由后端先脱敏，页面不会提供原文开关。
          <a
            href="https://open.dingtalk.com/document/development/obtain-the-data-list"
            rel="noopener noreferrer"
            target="_blank"
          >
            查看钉钉“获取数据列表”文档
          </a>
        </div>
      </template>
    </Alert>

    <Card class="probe-card" title="探测范围">
      <div class="probe-form">
        <Radio.Group v-model:value="probeMode" button-style="solid">
          <Radio.Button value="range">按数值范围</Radio.Button>
          <Radio.Button value="catalog">
            已知目录（{{ catalog.length }}）
          </Radio.Button>
        </Radio.Group>
        <template v-if="probeMode === 'range'">
          <InputNumber
            v-model:value="rangeStart"
            :disabled="probeRunning"
            :min="1"
            :precision="0"
            addon-before="起始"
          />
          <span>—</span>
          <InputNumber
            v-model:value="rangeEnd"
            :disabled="probeRunning"
            :min="1"
            :precision="0"
            addon-before="结束"
          />
          <span class="muted">单次最多 {{ MAX_TYPES_PER_RUN }} 个</span>
        </template>
        <span v-else class="muted">
          仅探测当前已收录的类型，适合先验证应用权限
        </span>
        <Button
          v-access:code="['fdmdingtalk:jinzhi-document:probe']"
          :disabled="catalogLoading || probeRunning"
          type="primary"
          @click="runProbe"
        >
          开始探测
        </Button>
        <Button v-if="probeRunning" danger @click="stopProbe">停止</Button>
      </div>
      <Progress
        v-if="probeRunning || processedCount"
        class="probe-progress"
        :percent="probePercent"
        :status="stopRequested ? 'exception' : 'active'"
      />
    </Card>

    <Card class="catalog-card" title="已知 datatype 目录">
      <Alert
        class="mb-3"
        description="“可编辑”仅表示该类型在参考目录中支持编辑接口，不代表本探测页面会修改业务单据；本页面只读取并展示脱敏数据。"
        message="费用报销（198）和付款记录（171）已标记为付款相关，后续用于生成付款清单。"
        show-icon
        type="info"
      />
      <Table
        :columns="catalogColumns"
        :data-source="catalog"
        :loading="catalogLoading"
        :pagination="catalogPagination"
        row-key="dataType"
        :scroll="{ x: 760 }"
        size="small"
      >
        <template #bodyCell="{ column, record }">
          <template v-if="column.dataIndex === 'documentName'">
            <Space wrap>
              <a
                v-if="record.docUrl"
                :href="record.docUrl"
                rel="noopener noreferrer"
                target="_blank"
              >
                {{ record.documentName }}
              </a>
              <span v-else>{{ record.documentName }}</span>
              <Tag v-if="isPaymentRelated(record.dataType)" color="gold">
                付款相关
              </Tag>
            </Space>
          </template>
          <template v-else-if="column.dataIndex === 'dataType'">
            <button
              class="datatype-button"
              type="button"
              @click="copyDataType(record.dataType)"
            >
              {{ record.dataType }}
            </button>
          </template>
          <template v-else-if="column.dataIndex === 'editable'">
            <Tag :color="editableMeta(record.editable).color">
              {{ editableMeta(record.editable).label }}
            </Tag>
          </template>
          <template v-else-if="column.dataIndex === 'action'">
            <Space>
              <Button
                size="small"
                type="link"
                @click="copyDataType(record.dataType)"
              >
                复制 datatype
              </Button>
              <Button
                v-access:code="['fdmdingtalk:jinzhi-document:probe']"
                :disabled="probeRunning"
                size="small"
                type="link"
                @click="runCatalogProbe(record)"
              >
                单个探测
              </Button>
            </Space>
          </template>
        </template>
      </Table>
    </Card>

    <div class="statistics">
      <Statistic title="已探测" :value="results.length" />
      <Statistic title="发现单据" :value="resultCounts.found" />
      <Statistic title="可访问但为空" :value="resultCounts.empty" />
      <Statistic title="异常/无权限" :value="resultCounts.errors" />
    </div>

    <Card title="探测结果">
      <div class="filter-bar">
        <Input
          v-model:value="keyword"
          allow-clear
          placeholder="搜索 datatype、单据名或字段"
        />
        <Select
          v-model:value="statusFilter"
          allow-clear
          :options="
            Object.entries(STATUS_META).map(([value, meta]) => ({
              label: meta.label,
              value,
            }))
          "
          placeholder="全部探测状态"
        />
      </div>
      <Table
        :columns="columns"
        :data-source="filteredResults"
        :loading="probeRunning"
        :pagination="resultPagination"
        row-key="dataType"
        :scroll="{ x: 1565 }"
        @change="handleResultPageChange"
      >
        <template #bodyCell="{ column, record }">
          <template v-if="column.dataIndex === 'dataType'">
            <button
              class="datatype-button"
              type="button"
              @click="copyDataType(record.dataType)"
            >
              {{ record.dataType }}
            </button>
          </template>
          <template v-else-if="column.dataIndex === 'documentName'">
            <Space wrap>
              <a
                v-if="record.docUrl"
                :href="record.docUrl"
                rel="noopener noreferrer"
                target="_blank"
              >
                {{ record.documentName || '待识别' }}
              </a>
              <span v-else>{{ record.documentName || '待识别' }}</span>
              <Tag v-if="isPaymentRelated(record.dataType)" color="gold">
                付款相关
              </Tag>
            </Space>
          </template>
          <template v-else-if="column.dataIndex === 'editable'">
            <Tag
              :color="
                editableMeta(resolveEditable(record.dataType, record.editable))
                  .color
              "
            >
              {{
                editableMeta(resolveEditable(record.dataType, record.editable))
                  .label
              }}
            </Tag>
          </template>
          <template v-else-if="column.dataIndex === 'status'">
            <Tag :color="statusMeta(record.status).color">
              {{ statusMeta(record.status).label }}
            </Tag>
          </template>
          <template v-else-if="column.dataIndex === 'totalCount'">
            {{ record.totalCount ?? '-' }}
          </template>
          <template v-else-if="column.dataIndex === 'fields'">
            <Tooltip :title="fieldSummary(record)">
              <span class="ellipsis">{{ fieldSummary(record) }}</span>
            </Tooltip>
          </template>
          <template v-else-if="column.dataIndex === 'approvalFields'">
            <Space v-if="record.candidateApprovalFields?.length" wrap>
              <Tag
                v-for="field in record.candidateApprovalFields"
                :key="field"
                color="blue"
              >
                {{ record.fieldNames?.[field] || field }}
              </Tag>
            </Space>
            <span v-else>-</span>
          </template>
          <template v-else-if="column.dataIndex === 'error'">
            <Tooltip :title="record.errorMessage || record.errorCode || '-'">
              <span class="ellipsis error-text">
                {{ record.errorMessage || record.errorCode || '-' }}
              </span>
            </Tooltip>
          </template>
          <template v-else-if="column.dataIndex === 'action'">
            <Space>
              <Button
                size="small"
                type="link"
                @click="copyDataType(record.dataType)"
              >
                复制
              </Button>
              <Button
                v-if="['EMPTY', 'FOUND'].includes(record.status)"
                v-access:code="['fdmdingtalk:jinzhi-document:query']"
                size="small"
                type="link"
                @click="openDocuments(record)"
              >
                浏览单据
              </Button>
            </Space>
          </template>
        </template>
      </Table>
    </Card>

    <Drawer
      v-model:open="drawerOpen"
      :title="`金智单据 · datatype ${selected?.dataType || ''}`"
      :width="900"
    >
      <Tabs v-model:active-key="drawerTab">
        <Tabs.TabPane key="overview" tab="概览">
          <Descriptions v-if="selected" bordered :column="2" size="small">
            <Descriptions.Item label="datatype">
              <Space>
                <code>{{ selected.dataType }}</code>
                <Button
                  size="small"
                  type="link"
                  @click="copyDataType(selected.dataType)"
                >
                  复制
                </Button>
              </Space>
            </Descriptions.Item>
            <Descriptions.Item label="单据名称">
              {{ selected.documentName || '待识别' }}
            </Descriptions.Item>
            <Descriptions.Item label="探测状态">
              <Tag :color="statusMeta(selected.status).color">
                {{ statusMeta(selected.status).label }}
              </Tag>
            </Descriptions.Item>
            <Descriptions.Item label="记录总数">
              {{ documentPage?.totalCount ?? selected.totalCount ?? '-' }}
            </Descriptions.Item>
            <Descriptions.Item label="样本 msgid">
              {{ selected.sampleMsgId || '-' }}
            </Descriptions.Item>
            <Descriptions.Item label="字段数量">
              {{
                Object.keys(
                  documentPage?.fieldNames || selected.fieldNames || {},
                ).length
              }}
            </Descriptions.Item>
          </Descriptions>
        </Tabs.TabPane>

        <Tabs.TabPane :tab="`字段 (${fieldRows.length})`" key="fields">
          <Table
            :columns="fieldColumns"
            :data-source="fieldRows"
            :pagination="false"
            row-key="key"
            size="small"
          />
        </Tabs.TabPane>

        <Tabs.TabPane key="sample" tab="脱敏样本">
          <Alert
            class="mb-3"
            message="此处数据已由后端脱敏，前端还会再次遮罩账号、银行卡、手机号和身份证号。"
            show-icon
            type="info"
          />
          <pre class="json-view">{{ safeJson(selected?.sample) }}</pre>
        </Tabs.TabPane>

        <Tabs.TabPane
          :tab="`分页浏览 (${documentPagination.total})`"
          key="documents"
        >
          <div v-if="pageLoading" class="drawer-loading">正在读取单据…</div>
          <template v-else-if="documentPage?.data?.length">
            <Collapse>
              <Collapse.Panel
                v-for="(record, index) in documentPage.data"
                :key="String(record.msgid || record.id || index)"
                :header="`第 ${(documentPagination.current - 1) * documentPagination.pageSize + index + 1} 条 · ${record.msgid || record.id || '无 msgid'}`"
              >
                <pre class="json-view">{{ safeJson(record) }}</pre>
              </Collapse.Panel>
            </Collapse>
            <Pagination
              class="document-pagination"
              :current="documentPagination.current"
              :page-size="documentPagination.pageSize"
              :show-size-changer="true"
              :total="documentPagination.total"
              @change="handleDocumentPageChange"
            />
          </template>
          <Empty v-else description="该 datatype 当前没有可浏览的单据" />
        </Tabs.TabPane>
      </Tabs>
    </Drawer>
  </Page>
</template>

<style scoped>
.catalog-card,
.probe-card {
  margin-bottom: 14px;
}

.probe-form,
.filter-bar {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  align-items: center;
}

.probe-progress {
  margin-top: 12px;
}

.statistics {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 12px;
  margin-bottom: 14px;
}

.statistics :deep(.ant-statistic) {
  padding: 14px 18px;
  background: white;
  border: 1px solid #e7edf5;
  border-radius: 8px;
}

.filter-bar {
  margin-bottom: 12px;
}

.filter-bar :deep(.ant-input-affix-wrapper) {
  width: 320px;
}

.filter-bar :deep(.ant-select) {
  width: 210px;
}

.datatype-button {
  padding: 0;
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  color: #2563eb;
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
  color: #b45309;
}

.json-view {
  max-height: 560px;
  padding: 12px;
  overflow: auto;
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  font-size: 12px;
  line-height: 1.6;
  color: #334155;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
}

.drawer-loading {
  padding: 48px 0;
  color: #64748b;
  text-align: center;
}

.document-pagination {
  margin-top: 16px;
  text-align: right;
}

@media (max-width: 800px) {
  .statistics {
    grid-template-columns: repeat(2, 1fr);
  }

  .filter-bar :deep(.ant-input-affix-wrapper),
  .filter-bar :deep(.ant-select) {
    width: 100%;
  }
}
</style>
