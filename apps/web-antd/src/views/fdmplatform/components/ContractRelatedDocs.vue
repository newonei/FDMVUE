<script setup lang="ts">
import type { RelatedDocGroup, RelatedDocRow } from './contract-related-docs';

import { computed } from 'vue';

import { Button, Table, Tag } from 'ant-design-vue';

import AiReviewStatus from '#/views/fdmaicheck/components/AiReviewStatus.vue';
import { useAiReviewStatuses } from '#/views/fdmaicheck/components/useAiReviewStatuses';

import {
  contractRecordAiCheckTypes,
  documentRowAiReviewTarget,
  procurementFinanceAiCheckTypes,
} from '../documents/ai-check-types';
import { canCancelReceipt } from '../documents/model';

import './compact-tables.css';

/** 合同详情下属单据页签的内容：一类单据一张表，点单号打开原来的详情 */
const props = defineProps<{
  disabled?: boolean;
  group: RelatedDocGroup;
}>();
const emit = defineEmits<{
  cancelReceipt: [row: RelatedDocRow];
  more: [];
  open: [row: RelatedDocRow];
}>();

function reviewTarget({ ref }: RelatedDocRow) {
  switch (ref.source) {
    case 'business': {
      return documentRowAiReviewTarget(
        ref.row,
        contractRecordAiCheckTypes[ref.kind],
      );
    }
    case 'finance': {
      return {
        docType: procurementFinanceAiCheckTypes[ref.record.type],
        docId: ref.record.standaloneId || ref.record.id,
      };
    }
    case 'stockIn': {
      return { docType: 'STOCK_IN' as const, docId: ref.stockIn.id };
    }
    case 'stockOut': {
      return { docType: 'STOCK_OUT' as const, docId: ref.stockOut.id };
    }
  }
}
const reviewTargets = computed(() => props.group.rows.map(reviewTarget));
const { statusFor } = useAiReviewStatuses(() => reviewTargets.value);
function reviewStatus(row: RelatedDocRow) {
  const { docType, docId } = reviewTarget(row);
  return docType
    ? statusFor(docType, docId)
    : { state: 'UNAVAILABLE' as const };
}
const columns = computed(() => [
  { key: 'code', title: '单号', width: 180 },
  ...props.group.columns.map((title, index) => ({
    key: `c${index}`,
    title,
    width: 150,
    ellipsis: true,
  })),
  { key: 'status', title: '状态', width: 110 },
  ...(reviewTargets.value.some(({ docType }) => docType)
    ? [{ key: 'aiReview', title: 'AI 审核', width: 180 }]
    : []),
  ...(props.group.kind === 'receipts'
    ? [{ key: 'action', title: '操作', width: 110, fixed: 'right' as const }]
    : []),
]);
function cancellable(row: RelatedDocRow) {
  return (
    row.ref.source === 'business' &&
    row.ref.kind === 'receipts' &&
    !row.ref.row.standaloneId &&
    !row.ref.row.blockReasons?.length &&
    canCancelReceipt(row.ref.row.record, row.ref.row.allowedActions)
  );
}
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
        <Button
          v-else-if="
            column.key === 'action' && cancellable(record as RelatedDocRow)
          "
          type="link"
          danger
          :disabled="disabled"
          @click="emit('cancelReceipt', record as RelatedDocRow)"
        >
          撤销登记
        </Button>
        <AiReviewStatus
          v-else-if="column.key === 'aiReview'"
          :status="reviewStatus(record as RelatedDocRow)"
        />
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
