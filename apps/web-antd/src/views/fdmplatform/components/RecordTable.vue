<script setup lang="ts">
import type { BusinessRecord } from '#/api/fdmplatform';

import { computed } from 'vue';

import { Table, Tag } from 'ant-design-vue';

import { label } from '../data';

const props = withDefaults(
  defineProps<{
    columns: { key: string; title: string; width?: number }[];
    data: BusinessRecord[];
    empty?: string;
    loading?: boolean;
  }>(),
  { empty: '暂无记录，请按业务进度登记', loading: false },
);
const tableColumns = computed(() =>
  props.columns.map((column) => ({
    ...column,
    dataIndex: column.key,
    width: column.width ?? 140,
    ellipsis: true,
  })),
);
function cell(record: Record<string, unknown>, key: string) {
  let value: unknown = record;
  for (const part of key.split('.')) {
    value =
      value && typeof value === 'object'
        ? (value as Record<string, unknown>)[part]
        : undefined;
  }
  if (Array.isArray(value))
    return (
      value
        .map((item) =>
          typeof item === 'object'
            ? String(item.name ?? item.message ?? item.id ?? '')
            : label(item),
        )
        .join('；') || '—'
    );
  if (value && typeof value === 'object')
    return Object.entries(value as Record<string, unknown>)
      .map(([name, entry]) => `${name}: ${label(entry)}`)
      .join('；');
  return label(value);
}
</script>

<template>
  <Table
    :columns="tableColumns"
    :data-source="data"
    row-key="id"
    :loading="loading"
    :scroll="{ x: Math.max(700, columns.length * 140) }"
    :pagination="
      data.length > 10 ? { pageSize: 10, showSizeChanger: true } : false
    "
    :locale="{ emptyText: empty }"
    size="small"
  >
    <template #bodyCell="{ column, record }">
      <Tag
        v-if="column.key === 'status'"
        :color="
          ['CONFIRMED', 'APPROVED', 'COMPLETED', 'ACTIVE'].includes(
            String(record.status),
          )
            ? 'green'
            : undefined
        "
      >
        {{ cell(record, String(column.key)) }}
      </Tag>
      <span v-else :title="cell(record, String(column.key))">{{
        cell(record, String(column.key))
      }}</span>
    </template>
  </Table>
</template>
