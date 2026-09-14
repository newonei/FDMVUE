<script setup lang="ts">
import type { Ref } from 'vue';

import type { BusinessRecord, Contract, Directory } from '#/api/fdmplatform';

import { computed, inject } from 'vue';

import { Table, Tag } from 'ant-design-vue';

import { label } from '../data';
import { personLabel } from '../directory';
import { receiptFxDisplay } from '../finance/exchange-rates/model';
import { lineTarget } from './navigation';
import RelatedLink from './RelatedLink.vue';

const props = withDefaults(
  defineProps<{
    columns: { key: string; title: string; width?: number }[];
    contract?: Contract;
    data: BusinessRecord[];
    empty?: string;
    loading?: boolean;
  }>(),
  { contract: undefined, empty: '暂无记录，请按业务进度登记', loading: false },
);

const directory = inject<Ref<Directory | undefined>>('fdmPlatformDirectory');

const tableColumns = computed(() =>
  props.columns.map((column) => ({
    ...column,
    dataIndex: column.key,
    width: column.width ?? 140,
    ellipsis: true,
  })),
);
function cell(record: Record<string, unknown>, key: string) {
  const fxValue = receiptFxDisplay(record, key);
  if (fxValue !== undefined) return fxValue;
  let value: unknown = record;
  for (const part of key.split('.')) {
    value =
      value && typeof value === 'object'
        ? (value as Record<string, unknown>)[part]
        : undefined;
  }
  if (
    /userId$/i.test(key) ||
    ['actor_id', 'actorId', 'confirmedBy', 'uploadedBy'].includes(key)
  )
    return personLabel(directory?.value, value);
  if (key === 'departmentId')
    return (
      directory?.value?.departments.find(
        (item) => String(item.id) === String(value),
      )?.name ?? label(value)
    );
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
      <slot
        v-if="column.key === 'action' && $slots.action"
        name="action"
        :record="record"
      ></slot>
      <Tag
        v-else-if="column.key === 'status'"
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
      <RelatedLink
        v-else
        :target="lineTarget(contract, String(column.key), record)"
        :title="cell(record, String(column.key))"
      >
        {{ cell(record, String(column.key)) }}
      </RelatedLink>
    </template>
  </Table>
</template>
