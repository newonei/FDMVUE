<script setup lang="ts">
import type { TableColumnsType } from 'ant-design-vue';

import type { FdmcaiwuEcProfitApi } from '#/api/fdmcaiwu/ec-profit';

import { computed } from 'vue';

import { Button, Table, Tag } from 'ant-design-vue';

import {
  aggregateReadyReports,
  buildYearMonths,
  formatMetric,
  METRIC_GROUPS,
} from '../model';

const props = defineProps<{
  loading: boolean;
  reports: FdmcaiwuEcProfitApi.Report[];
  year: number;
}>();
const emit = defineEmits<{ detail: [id: number] }>();
const months = computed(() => buildYearMonths(props.year, props.reports));
const total = computed(() => aggregateReadyReports(props.reports));
const rows = METRIC_GROUPS.flatMap((group) =>
  group.metrics.map((metric) => ({ ...metric, group: group.title })),
);
const columns = computed<TableColumnsType>(() => [
  {
    title: '指标',
    dataIndex: 'label',
    key: 'label',
    width: 170,
    fixed: 'left',
  },
  ...months.value.map((month) => ({
    title: month.label,
    key: month.month,
    width: 132,
    align: 'right' as const,
  })),
  {
    title: '全年合计',
    key: 'total',
    width: 155,
    align: 'right',
    fixed: 'right',
  },
]);

function reportFor(month: string) {
  return months.value.find((item) => item.month === month)?.report;
}
</script>

<template>
  <div class="space-y-4">
    <div
      class="flex flex-wrap items-center gap-3 text-xs text-muted-foreground"
    >
      <span>人民币 / 元 · 仅已就绪月报参与合计</span>
      <span>比例根据全年金额重新计算</span>
      <span>点击已建月份查看店铺明细</span>
    </div>
    <Table
      :columns="columns"
      :data-source="rows"
      :loading="loading"
      :pagination="false"
      :scroll="{ x: 1909 }"
      row-key="key"
      bordered
      size="small"
    >
      <template #headerCell="{ column }">
        <div
          v-if="reportFor(String(column.key))"
          class="flex flex-col items-end gap-1"
        >
          <Button
            size="small"
            type="link"
            class="!px-0"
            @click="emit('detail', reportFor(String(column.key))!.id)"
          >
            {{ column.title }}
          </Button>
          <Tag
            class="!mr-0"
            :color="
              reportFor(String(column.key))?.status === 'READY'
                ? 'success'
                : 'orange'
            "
          >
            {{
              reportFor(String(column.key))?.status === 'READY'
                ? '已就绪'
                : '待导入'
            }}
          </Tag>
        </div>
        <div
          v-else-if="String(column.key).startsWith(`${year}-`)"
          class="flex flex-col items-end gap-1"
        >
          <span>{{ column.title }}</span>
          <span class="text-xs font-normal text-muted-foreground">未建单</span>
        </div>
        <span v-else>{{ column.title }}</span>
      </template>
      <template #bodyCell="{ column, record }">
        <div v-if="column.key === 'label'" class="flex items-center gap-2">
          <span class="shrink-0 text-xs text-muted-foreground">{{
            record.group
          }}</span>
          <span
            :class="
              record.key === 'grossProfit' || record.key === 'grossMargin'
                ? 'font-semibold'
                : ''
            "
            >{{ record.label }}</span
          >
        </div>
        <span
          v-else-if="column.key === 'total'"
          class="font-semibold tabular-nums"
        >
          {{
            formatMetric(total[record.key as keyof typeof total], record.rate)
          }}
        </span>
        <span v-else class="tabular-nums">
          {{
            reportFor(String(column.key))?.status === 'READY'
              ? formatMetric(
                  reportFor(String(column.key))?.summary?.[
                    record.key as keyof FdmcaiwuEcProfitApi.Metric
                  ],
                  record.rate,
                )
              : '—'
          }}
        </span>
      </template>
    </Table>
  </div>
</template>
