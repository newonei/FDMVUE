<script setup lang="ts">
import type { RelatedDocGroup, RelatedDocRow } from './contract-related-docs';

import { computed } from 'vue';

import { Button, Table, Tag } from 'ant-design-vue';

import './compact-tables.css';

/** 合同详情下属单据页签的内容：一类单据一张表，点单号打开原来的详情 */
const props = defineProps<{
  disabled?: boolean;
  group: RelatedDocGroup;
}>();
const emit = defineEmits<{ more: []; open: [row: RelatedDocRow] }>();

const columns = computed(() => [
  { key: 'code', title: '单号', width: 180 },
  ...props.group.columns.map((title, index) => ({
    key: `c${index}`,
    title,
    width: 150,
    ellipsis: true,
  })),
  { key: 'status', title: '状态', width: 110 },
]);
const cell = (row: RelatedDocRow, key: string) =>
  row.cells[Number(key.slice(1))] ?? '';
</script>

<template>
  <div class="related-docs">
    <div class="related-head">
      <span class="muted">
        共 {{ group.total }} 张{{
          group.total > group.rows.length
            ? `，这里列出前 ${group.rows.length} 张`
            : ''
        }}
      </span>
      <Button
        v-if="group.kind"
        size="small"
        :disabled="disabled"
        @click="emit('more')"
      >
        全部{{ group.title }} / 办理
      </Button>
    </div>
    <Table
      class="fdm-business-table"
      size="small"
      table-layout="fixed"
      :columns="columns"
      :data-source="group.rows"
      row-key="id"
      :pagination="false"
      :scroll="{ x: Math.max(700, columns.length * 150) }"
    >
      <template #bodyCell="{ column, record }">
        <Button
          v-if="column.key === 'code'"
          type="link"
          :class="{ voided: (record as RelatedDocRow).voided }"
          :disabled="disabled"
          :title="(record as RelatedDocRow).code"
          @click="emit('open', record as RelatedDocRow)"
        >
          {{ (record as RelatedDocRow).code }}
        </Button>
        <Tag
          v-else-if="column.key === 'status'"
          v-show="(record as RelatedDocRow).status"
          :color="(record as RelatedDocRow).voided ? 'default' : 'blue'"
        >
          {{ (record as RelatedDocRow).status }}
        </Tag>
        <span
          v-else
          class="fdm-cell-line"
          :title="cell(record as RelatedDocRow, String(column.key))"
          >{{ cell(record as RelatedDocRow, String(column.key)) }}</span>
      </template>
    </Table>
  </div>
</template>

<style scoped>
.related-docs {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.related-head {
  display: flex;
  gap: 12px;
  align-items: center;
  justify-content: space-between;
}

.muted {
  color: var(--ant-color-text-secondary);
}

.voided {
  text-decoration: line-through;
}
</style>
