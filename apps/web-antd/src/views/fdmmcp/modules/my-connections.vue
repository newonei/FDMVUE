<script lang="ts" setup>
import type { FdmMcpApi } from '#/api/fdmmcp';

import { computed, onMounted, ref } from 'vue';

import { formatDateTime } from '@vben/utils';

import { useClipboard } from '@vueuse/core';
import {
  Alert,
  Button,
  Empty,
  Input,
  message,
  Popconfirm,
  Spin,
  Table,
  Tag,
} from 'ant-design-vue';

import { getMyMcpOverview, revokeMyMcpConnection } from '#/api/fdmmcp';

import { scopeLabel, TOOL_RISK_META } from '../data';

defineOptions({ name: 'FdmMcpMyConnections' });

const loading = ref(false);
const overview = ref<FdmMcpApi.MyOverview>();
const { copy } = useClipboard({ legacy: true });

const readTools = computed(
  () => overview.value?.tools.filter((tool) => tool.risk === 'READ') ?? [],
);
const writeTools = computed(
  () => overview.value?.tools.filter((tool) => tool.risk !== 'READ') ?? [],
);

const toolColumns = [
  { title: '能力', dataIndex: 'title', key: 'title', width: 180 },
  { title: '类型', dataIndex: 'risk', key: 'risk', width: 100 },
  { title: '说明', dataIndex: 'description', key: 'description' },
];

async function load() {
  loading.value = true;
  try {
    overview.value = await getMyMcpOverview();
  } finally {
    loading.value = false;
  }
}

async function handleCopy() {
  if (!overview.value?.serverUrl) return;
  await copy(overview.value.serverUrl);
  message.success('已复制 MCP 地址');
}

async function handleRevoke(connection: FdmMcpApi.Connection) {
  await revokeMyMcpConnection(connection.clientId);
  message.success(`已撤销 ${connection.clientName} 的授权`);
  await load();
}

function formatTime(value?: FdmMcpApi.DateTime) {
  return value ? formatDateTime(value as any) : '—';
}

onMounted(load);
</script>

<template>
  <Spin :spinning="loading">
    <div class="flex flex-col gap-4">
      <Alert
        v-if="overview && !overview.enabled"
        type="info"
        show-icon
        message="AI 连接（MCP）服务尚未启用"
        description="管理员启用后，即可在 WorkBuddy、ChatGPT 等 AI 客户端中以你的身份使用 FDM 数据。"
      />

      <section v-if="overview?.serverUrl">
        <h3 class="mb-2 text-sm font-semibold">连接地址</h3>
        <div class="flex gap-2">
          <Input :value="overview.serverUrl" readonly />
          <Button @click="handleCopy">复制</Button>
        </div>
        <p class="mt-2 mb-0 text-xs text-muted-foreground">
          在 WorkBuddy 或 ChatGPT 中添加 MCP
          服务器并填写此地址。首次连接会跳转钉钉登录， 并请你确认授权范围；AI
          只能使用你在 FDM 中已有权限的数据和操作，任何写入都会先给你预览确认。
        </p>
      </section>

      <section>
        <h3 class="mb-2 text-sm font-semibold">已授权的 AI 客户端</h3>
        <Empty
          v-if="!overview?.connections.length"
          description="还没有授权任何 AI 客户端"
        />
        <div
          v-for="connection in overview?.connections ?? []"
          :key="connection.id"
          class="mb-2 flex items-start justify-between gap-3 rounded border border-border p-3"
        >
          <div class="min-w-0 flex-1">
            <div class="flex items-center gap-2 font-medium">
              {{ connection.clientName }}
              <Tag v-if="!connection.clientEnabled" color="default">
                已被管理员停用
              </Tag>
            </div>
            <div class="mt-1 flex flex-wrap gap-1">
              <Tag v-for="scope in connection.scopes" :key="scope" color="blue">
                {{ scopeLabel(scope) }}
              </Tag>
            </div>
            <div class="mt-1 text-xs text-muted-foreground">
              授权于 {{ formatTime(connection.grantedTime) }} · 最近使用
              {{ formatTime(connection.lastUsedTime) }}
            </div>
          </div>
          <Popconfirm
            :title="`撤销后 ${connection.clientName} 将立即无法访问 FDM，需要重新登录授权。确认撤销？`"
            @confirm="handleRevoke(connection)"
          >
            <Button danger size="small">撤销授权</Button>
          </Popconfirm>
        </div>
      </section>

      <section v-if="overview?.enabled">
        <h3 class="mb-1 text-sm font-semibold">
          AI 可以帮你做的事（共 {{ overview.tools.length }} 项）
        </h3>
        <p class="mb-2 text-xs text-muted-foreground">
          由你当前的 FDM 权限决定，权限变化后立即生效。只读
          {{ readTools.length }} 项； 写入
          {{ writeTools.length }} 项需要在授权时额外勾选“修改”。
        </p>
        <Table
          :columns="toolColumns"
          :data-source="overview.tools"
          :pagination="false"
          row-key="name"
          size="small"
        >
          <template #bodyCell="{ column, record }">
            <template v-if="column.key === 'risk'">
              <Tag
                :color="TOOL_RISK_META[(record as FdmMcpApi.Tool).risk].color"
              >
                {{ TOOL_RISK_META[(record as FdmMcpApi.Tool).risk].label }}
              </Tag>
            </template>
          </template>
        </Table>
      </section>
    </div>
  </Spin>
</template>
