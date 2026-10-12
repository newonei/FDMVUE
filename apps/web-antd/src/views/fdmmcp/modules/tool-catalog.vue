<script lang="ts" setup>
import type { FdmMcpApi } from '#/api/fdmmcp';

import { onMounted, ref } from 'vue';

import { Table, Tag } from 'ant-design-vue';

import { getMcpToolList } from '#/api/fdmmcp';

import { scopeLabel, TOOL_RISK_META } from '../data';

const loading = ref(false);
const tools = ref<FdmMcpApi.Tool[]>([]);

const columns = [
  { title: '工具', dataIndex: 'title', key: 'title', width: 200 },
  { title: '类型', dataIndex: 'risk', key: 'risk', width: 100 },
  { title: '授权范围', dataIndex: 'scopes', key: 'scopes', width: 160 },
  {
    title: '所需权限',
    dataIndex: 'permissions',
    key: 'permissions',
    width: 280,
  },
  { title: '说明', dataIndex: 'description', key: 'description' },
];

onMounted(async () => {
  loading.value = true;
  try {
    tools.value = await getMcpToolList();
  } finally {
    loading.value = false;
  }
});
</script>

<template>
  <div>
    <p class="mb-2 text-xs text-muted-foreground">
      用户连接 AI
      后，只会看到同时满足“授权范围”和“所需权限”的工具。调整角色菜单权限即可控制
      AI 能力。
    </p>
    <Table
      :columns="columns"
      :data-source="tools"
      :loading="loading"
      :pagination="false"
      row-key="name"
      size="small"
    >
      <template #bodyCell="{ column, record }">
        <template v-if="column.key === 'title'">
          <div>{{ record.title }}</div>
          <div class="font-mono text-xs text-muted-foreground">
            {{ record.name }}
          </div>
        </template>
        <template v-else-if="column.key === 'risk'">
          <Tag :color="TOOL_RISK_META[(record as FdmMcpApi.Tool).risk].color">
            {{ TOOL_RISK_META[(record as FdmMcpApi.Tool).risk].label }}
          </Tag>
        </template>
        <template v-else-if="column.key === 'scopes'">
          {{
            (record as FdmMcpApi.Tool).scopes
              .map((s) => scopeLabel(s))
              .join(' + ')
          }}
        </template>
        <template v-else-if="column.key === 'permissions'">
          <div
            v-for="permission in (record as FdmMcpApi.Tool).permissions"
            :key="permission"
            class="font-mono text-xs"
          >
            {{ permission }}
          </div>
          <div
            v-if="(record as FdmMcpApi.Tool).anyPermissions.length"
            class="font-mono text-xs text-muted-foreground"
          >
            任一：{{ (record as FdmMcpApi.Tool).anyPermissions.join(' / ') }}
          </div>
        </template>
      </template>
    </Table>
  </div>
</template>
