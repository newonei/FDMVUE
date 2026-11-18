<script lang="ts" setup>
import type { TableColumnsType, TablePaginationConfig } from 'ant-design-vue';

import type { FdmMcpApi } from '#/api/fdmmcp';

import { onBeforeUnmount, onMounted, reactive, ref } from 'vue';

import {
  Alert,
  Button,
  Descriptions,
  Drawer,
  Input,
  Select,
  Skeleton,
  Table,
  Tabs,
  Tag,
} from 'ant-design-vue';

import {
  getMcpApiCatalogCoverage,
  getMcpApiCatalogDetail,
  getMcpApiCatalogPage,
} from '#/api/fdmmcp';

import { API_OPERATION_STATUS_META, TOOL_RISK_META } from '../data';

const filters = reactive<{
  keyword: string;
  module: string;
  risk?: FdmMcpApi.ToolRisk;
  status?: FdmMcpApi.ApiOperationStatus;
}>({ keyword: '', module: '' });
const rows = ref<FdmMcpApi.ApiOperation[]>([]);
const total = ref(0);
const pageNo = ref(1);
const pageSize = ref(20);
const loading = ref(false);
const loadFailed = ref(false);
const coverage = ref<FdmMcpApi.ApiCatalogCoverage>();
const coverageLoading = ref(false);
const coverageFailed = ref(false);

const detailOpen = ref(false);
const detailLoading = ref(false);
const detailFailed = ref(false);
const detail = ref<FdmMcpApi.ApiOperation>();
const selectedOperationId = ref('');
let listRequestId = 0;
let detailRequestId = 0;
let coverageRequestId = 0;

const columns: TableColumnsType<FdmMcpApi.ApiOperation> = [
  { key: 'title', title: '接口', width: 250 },
  { dataIndex: 'module', key: 'module', title: '模块', width: 140 },
  { key: 'route', title: '请求', width: 330 },
  { key: 'risk', title: '类型', width: 100 },
  { key: 'status', title: '覆盖状态', width: 180 },
  { key: 'permissions', title: '权限要求', width: 260 },
  { fixed: 'right', key: 'action', title: '操作', width: 90 },
];

const statusOptions = Object.entries(API_OPERATION_STATUS_META).map(
  ([value, meta]) => ({ label: meta.label, value }),
);
const riskOptions = Object.entries(TOOL_RISK_META).map(([value, meta]) => ({
  label: meta.label,
  value,
}));
const coverageItems = [
  { key: 'total', label: '接口总数' },
  { key: 'ready', label: '已支持' },
  { key: 'adapterRequired', label: '需要适配' },
  { key: 'excluded', label: '已排除' },
] as const;

async function loadPage() {
  const requestId = ++listRequestId;
  loading.value = true;
  loadFailed.value = false;
  try {
    const result = await getMcpApiCatalogPage({
      keyword: filters.keyword.trim() || undefined,
      module: filters.module.trim() || undefined,
      pageNo: pageNo.value,
      pageSize: pageSize.value,
      risk: filters.risk,
      status: filters.status,
    });
    if (requestId !== listRequestId) return;
    rows.value = result.list;
    total.value = result.total;
  } catch {
    if (requestId !== listRequestId) return;
    rows.value = [];
    total.value = 0;
    loadFailed.value = true;
  } finally {
    if (requestId === listRequestId) loading.value = false;
  }
}

async function loadCoverage() {
  const requestId = ++coverageRequestId;
  coverageLoading.value = true;
  coverageFailed.value = false;
  try {
    const result = await getMcpApiCatalogCoverage();
    if (requestId === coverageRequestId) coverage.value = result;
  } catch {
    if (requestId !== coverageRequestId) return;
    coverage.value = undefined;
    coverageFailed.value = true;
  } finally {
    if (requestId === coverageRequestId) coverageLoading.value = false;
  }
}

function search() {
  pageNo.value = 1;
  loadPage();
}

function reset() {
  filters.keyword = '';
  filters.module = '';
  filters.risk = undefined;
  filters.status = undefined;
  search();
}

function changePage(pagination: TablePaginationConfig) {
  pageNo.value = pagination.current ?? 1;
  pageSize.value = pagination.pageSize ?? 20;
  loadPage();
}

async function refresh() {
  await Promise.all([loadCoverage(), loadPage()]);
}

async function openDetail(operationId: string) {
  const requestId = ++detailRequestId;
  selectedOperationId.value = operationId;
  detailOpen.value = true;
  detail.value = undefined;
  detailLoading.value = true;
  detailFailed.value = false;
  try {
    const result = await getMcpApiCatalogDetail(operationId);
    if (requestId === detailRequestId) detail.value = result;
  } catch {
    if (requestId === detailRequestId) detailFailed.value = true;
  } finally {
    if (requestId === detailRequestId) detailLoading.value = false;
  }
}

function formatSchema(schema: Record<string, unknown>) {
  return JSON.stringify(schema, null, 2);
}

onMounted(refresh);
onBeforeUnmount(() => {
  listRequestId++;
  detailRequestId++;
  coverageRequestId++;
});
</script>

<template>
  <div class="flex flex-col gap-4">
    <Alert
      type="info"
      show-icon
      message="此处展示当前服务的完整接口覆盖情况。AI 实际调用时，仍需同时满足用户权限和客户端授权，并经过原接口的数据权限与业务校验。"
    />

    <div class="grid grid-cols-2 gap-3 lg:grid-cols-4">
      <div
        v-for="item in coverageItems"
        :key="item.key"
        class="rounded-md border p-3"
      >
        <div class="text-xs text-muted-foreground">{{ item.label }}</div>
        <div class="mt-1 text-2xl font-semibold tabular-nums">
          {{ coverageLoading ? '…' : (coverage?.[item.key] ?? '—') }}
        </div>
      </div>
    </div>
    <div class="flex flex-wrap items-center justify-between gap-2">
      <span class="break-all text-xs text-muted-foreground">
        全目录统计 · 目录版本 {{ coverage?.catalogVersion ?? '—' }}
      </span>
      <Button :loading="loading || coverageLoading" @click="refresh">
        刷新目录
      </Button>
    </div>
    <Alert
      v-if="coverageFailed"
      type="warning"
      show-icon
      message="覆盖统计加载失败，请刷新重试。"
    />

    <form class="flex flex-wrap items-end gap-3" @submit.prevent="search">
      <label class="flex flex-col gap-1 text-xs text-muted-foreground">
        关键词
        <Input
          v-model:value="filters.keyword"
          class="w-64"
          allow-clear
          placeholder="搜索接口名称、路径或操作标识"
        />
      </label>
      <label class="flex flex-col gap-1 text-xs text-muted-foreground">
        模块
        <Input
          v-model:value="filters.module"
          class="w-44"
          allow-clear
          placeholder="输入模块名称"
        />
      </label>
      <label class="flex flex-col gap-1 text-xs text-muted-foreground">
        覆盖状态
        <Select
          v-model:value="filters.status"
          class="w-36"
          allow-clear
          :options="statusOptions"
          placeholder="全部状态"
        />
      </label>
      <label class="flex flex-col gap-1 text-xs text-muted-foreground">
        操作类型
        <Select
          v-model:value="filters.risk"
          class="w-36"
          allow-clear
          :options="riskOptions"
          placeholder="全部类型"
        />
      </label>
      <Button html-type="submit" type="primary" :loading="loading">
        查询
      </Button>
      <Button @click="reset">重置</Button>
    </form>

    <Table
      :columns="columns"
      :data-source="rows"
      :loading="loading"
      :pagination="{
        current: pageNo,
        pageSize,
        pageSizeOptions: ['10', '20', '50'],
        total,
        showSizeChanger: true,
        showTotal: (count: number) => `共 ${count} 个接口`,
      }"
      :scroll="{ x: 1350 }"
      row-key="operationId"
      size="small"
      @change="changePage"
    >
      <template #bodyCell="{ column, record }">
        <template v-if="column.key === 'title'">
          <div>{{ record.title }}</div>
          <div class="break-all font-mono text-xs text-muted-foreground">
            {{ record.operationId }}
          </div>
        </template>
        <template v-else-if="column.key === 'route'">
          <Tag>{{ record.method }}</Tag>
          <span class="break-all font-mono text-xs">{{ record.path }}</span>
        </template>
        <template v-else-if="column.key === 'risk'">
          <Tag
            :color="
              TOOL_RISK_META[(record as FdmMcpApi.ApiOperation).risk].color
            "
          >
            {{ TOOL_RISK_META[(record as FdmMcpApi.ApiOperation).risk].label }}
          </Tag>
        </template>
        <template v-else-if="column.key === 'status'">
          <Tag
            :color="
              API_OPERATION_STATUS_META[
                (record as FdmMcpApi.ApiOperation).status
              ].color
            "
          >
            {{
              API_OPERATION_STATUS_META[
                (record as FdmMcpApi.ApiOperation).status
              ].label
            }}
          </Tag>
          <div v-if="record.reason" class="mt-1 text-xs text-muted-foreground">
            {{ record.reason }}
          </div>
        </template>
        <template v-else-if="column.key === 'permissions'">
          <div
            v-for="permission in (record as FdmMcpApi.ApiOperation).permissions"
            :key="permission"
            class="break-all font-mono text-xs"
          >
            {{ permission }}
          </div>
          <div class="text-xs text-muted-foreground">
            {{
              record.conditionalAuthorization
                ? '含条件鉴权，执行时校验'
                : '执行时按原接口校验'
            }}
          </div>
        </template>
        <template v-else-if="column.key === 'action'">
          <Button
            size="small"
            type="link"
            @click="openDetail(record.operationId)"
          >
            查看详情
          </Button>
        </template>
      </template>
      <template #emptyText>
        <div v-if="loadFailed" class="py-6 text-sm text-muted-foreground">
          接口目录加载失败。
          <Button size="small" type="link" @click="loadPage">重试</Button>
        </div>
        <div v-else class="py-6 text-sm text-muted-foreground">
          没有符合当前条件的接口。
        </div>
      </template>
    </Table>
  </div>

  <Drawer v-model:open="detailOpen" title="接口详情" width="min(920px, 100vw)">
    <Skeleton v-if="detailLoading" active :paragraph="{ rows: 8 }" />
    <Alert
      v-else-if="detailFailed"
      type="error"
      message="接口详情加载失败。"
      show-icon
    >
      <template #action>
        <Button size="small" @click="openDetail(selectedOperationId)">
          重试
        </Button>
      </template>
    </Alert>
    <template v-else-if="detail">
      <Descriptions :column="1" bordered size="small">
        <Descriptions.Item label="接口名称">
          <span class="font-medium">{{ detail.title }}</span>
        </Descriptions.Item>
        <Descriptions.Item label="操作标识">
          <span class="break-all font-mono text-xs">{{
            detail.operationId
          }}</span>
        </Descriptions.Item>
        <Descriptions.Item label="模块">{{ detail.module }}</Descriptions.Item>
        <Descriptions.Item label="请求">
          <Tag>{{ detail.method }}</Tag>
          <span class="break-all font-mono text-xs">{{ detail.path }}</span>
        </Descriptions.Item>
        <Descriptions.Item label="说明">
          {{ detail.description || '—' }}
        </Descriptions.Item>
        <Descriptions.Item label="操作类型">
          <Tag :color="TOOL_RISK_META[detail.risk].color">
            {{ TOOL_RISK_META[detail.risk].label }}
          </Tag>
        </Descriptions.Item>
        <Descriptions.Item label="覆盖状态">
          <Tag :color="API_OPERATION_STATUS_META[detail.status].color">
            {{ API_OPERATION_STATUS_META[detail.status].label }}
          </Tag>
          <span v-if="detail.reason">{{ detail.reason }}</span>
        </Descriptions.Item>
        <Descriptions.Item label="权限要求">
          <div
            v-for="permission in detail.permissions"
            :key="permission"
            class="break-all font-mono text-xs"
          >
            {{ permission }}
          </div>
          <div class="text-xs text-muted-foreground">
            {{
              detail.conditionalAuthorization
                ? '含条件鉴权，具体数据访问权限在调用时校验。'
                : '调用时继续执行原接口权限、数据范围和业务校验。'
            }}
          </div>
        </Descriptions.Item>
        <Descriptions.Item label="请求格式">
          {{ detail.consumes.join('、') || '默认' }}
        </Descriptions.Item>
        <Descriptions.Item label="返回格式">
          {{ detail.produces.join('、') || '默认' }}
        </Descriptions.Item>
      </Descriptions>
      <Tabs class="mt-4">
        <Tabs.TabPane key="input" tab="请求参数 Schema">
          <pre
            class="max-h-[55vh] overflow-auto rounded-md bg-muted p-4 text-xs"
          ><code>{{ formatSchema(detail.inputSchema) }}</code></pre>
        </Tabs.TabPane>
        <Tabs.TabPane key="output" tab="响应结构 Schema">
          <pre
            class="max-h-[55vh] overflow-auto rounded-md bg-muted p-4 text-xs"
          ><code>{{ formatSchema(detail.outputSchema) }}</code></pre>
        </Tabs.TabPane>
      </Tabs>
    </template>
  </Drawer>
</template>
