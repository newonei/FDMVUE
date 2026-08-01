<script lang="ts" setup>
import type { TableColumnsType } from 'ant-design-vue';

import type { FdmAiApi } from '#/api/fdmai';

import { computed, onMounted, ref } from 'vue';

import { Button, Statistic, Table, Tag } from 'ant-design-vue';

import { getFdmAiUsage } from '#/api/fdmai';

import AiCenterShell from '../shared/AiCenterShell.vue';

defineOptions({ name: 'FdmAiUsage' });

const loading = ref(false);
const rows = ref<FdmAiApi.UsageRecord[]>([]);
const columns: TableColumnsType = [
  { dataIndex: 'invocationId', title: '调用编号', width: 280 },
  { dataIndex: 'logicalModelId', title: '逻辑模型', width: 120 },
  { dataIndex: 'providerCode', title: '服务商', width: 180 },
  { dataIndex: 'status', title: '状态', width: 130 },
  { dataIndex: 'inputUnits', title: '输入用量', width: 110 },
  { dataIndex: 'outputUnits', title: '输出用量', width: 110 },
  { dataIndex: 'estimatedCost', title: '预计成本', width: 130 },
  { dataIndex: 'costAmount', title: '实际成本', width: 130 },
  { dataIndex: 'startedAt', title: '开始时间', width: 190 },
  { dataIndex: 'finishedAt', title: '结束时间', width: 190 },
];
const successCount = computed(
  () => rows.value.filter((row) => row.status === 'SUCCEEDED').length,
);
const failedCount = computed(
  () => rows.value.filter((row) => row.status === 'FAILED').length,
);

async function load() {
  loading.value = true;
  try {
    rows.value = await getFdmAiUsage();
  } finally {
    loading.value = false;
  }
}

function usageValue(row: Record<string, unknown>, key: string) {
  return row[key];
}

onMounted(load);
</script>

<template>
  <AiCenterShell
    description="记录模型、服务商、状态和时间，不在首版执行租户实际扣费"
    title="用量记录"
  >
    <template #actions><Button @click="load">刷新记录</Button></template>
    <div class="statistics">
      <Statistic title="调用总数" :value="rows.length" />
      <Statistic title="成功" :value="successCount" />
      <Statistic title="失败" :value="failedCount" />
    </div>
    <Table
      :columns="columns"
      :data-source="rows"
      :loading="loading"
      row-key="invocationId"
    >
      <template #bodyCell="{ column, record }">
        <template v-if="column.dataIndex === 'invocationId'">
          <code>{{ record.invocationId }}</code>
        </template>
        <template v-else-if="column.dataIndex === 'status'">
          <Tag
            :color="
              record.status === 'SUCCEEDED'
                ? 'green'
                : record.status === 'FAILED'
                  ? 'red'
                  : 'blue'
            "
          >
            {{ record.status }}
          </Tag>
        </template>
        <template
          v-else-if="
            column.dataIndex === 'estimatedCost' ||
            column.dataIndex === 'costAmount'
          "
        >
          <span
            v-if="usageValue(record, String(column.dataIndex)) !== undefined"
          >
            {{ record.currency || 'CNY' }}
            {{
              Number(usageValue(record, String(column.dataIndex))).toFixed(6)
            }}
          </span>
          <span v-else>--</span>
        </template>
        <template
          v-else-if="
            column.dataIndex === 'inputUnits' ||
            column.dataIndex === 'outputUnits'
          "
        >
          {{ usageValue(record, String(column.dataIndex)) ?? '--' }}
        </template>
      </template>
    </Table>
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

code {
  font-size: 11px;
  color: #475569;
}
</style>
