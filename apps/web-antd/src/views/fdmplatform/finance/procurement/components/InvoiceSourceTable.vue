<script setup lang="ts">
import type { InvoiceSourceOrder } from '#/api/fdmplatform/procurement';

import { computed } from 'vue';

import {
  Button,
  Table,
  TableSummary,
  TableSummaryCell,
  TableSummaryRow,
} from 'ant-design-vue';
import BigNumber from 'bignumber.js';

/** 发票的来源采购单表：查看来源弹窗和发票详情共用；点单号打开采购单。 */
const props = defineProps<{
  currency?: string;
  orders: InvoiceSourceOrder[];
}>();
const emit = defineEmits<{ open: [order: InvoiceSourceOrder] }>();

function money(value: unknown) {
  const amount = new BigNumber(String(value ?? ''));
  return amount.isFinite() ? amount.toFormat(2) : '—';
}
function sum(field: 'allocatedAmount' | 'orderAmount') {
  let total = new BigNumber(0);
  for (const order of props.orders) {
    const value = new BigNumber(String(order[field] ?? ''));
    if (value.isFinite()) total = total.plus(value);
  }
  return total.toFormat(2);
}
const totals = computed(() => ({
  order: sum('orderAmount'),
  allocated: sum('allocatedAmount'),
}));
</script>

<template>
  <Table
    class="fdm-business-table"
    size="small"
    row-key="orderId"
    table-layout="fixed"
    :scroll="{ x: 1000 }"
    :data-source="orders"
    :pagination="
      orders.length > 20 ? { pageSize: 20, showSizeChanger: false } : false
    "
    :columns="[
      { title: '采购主题', dataIndex: 'subject', width: 220, ellipsis: true },
      { title: '采购单号', key: 'code', width: 170 },
      { title: '采购分类', dataIndex: 'category', width: 100 },
      {
        title: '供应商',
        dataIndex: 'supplierName',
        width: 180,
        ellipsis: true,
      },
      { title: '采购日期', dataIndex: 'purchaseDate', width: 110 },
      { title: '采购金额', key: 'orderAmount', width: 120, align: 'right' },
      { title: '本发票关联金额', key: 'allocated', width: 130, align: 'right' },
      { title: '所有人', dataIndex: 'ownerName', width: 90 },
    ]"
  >
    <template #bodyCell="{ column, record }">
      <Button
        v-if="column.key === 'code'"
        type="link"
        size="small"
        :disabled="record.missing"
        @click="emit('open', record as InvoiceSourceOrder)"
      >
        {{ record.orderCode || '查看采购单' }}
      </Button>
      <span v-else-if="column.key === 'orderAmount'" class="num">
        {{ money(record.orderAmount) }}
      </span>
      <span v-else-if="column.key === 'allocated'" class="num">
        {{ money(record.allocatedAmount) }}
      </span>
    </template>
    <template #summary>
      <TableSummary v-if="orders.length > 0">
        <TableSummaryRow class="sum-row">
          <TableSummaryCell :index="0" :col-span="5">
            关联采购金额合计（{{ orders.length }} 张）
          </TableSummaryCell>
          <TableSummaryCell :index="5" align="right">
            <span class="num">{{ totals.order }}</span>
          </TableSummaryCell>
          <TableSummaryCell :index="6" align="right">
            <span class="num">{{ currency ?? '' }} {{ totals.allocated }}</span>
          </TableSummaryCell>
          <TableSummaryCell :index="7" />
        </TableSummaryRow>
      </TableSummary>
    </template>
  </Table>
</template>

<style scoped>
.num {
  font-variant-numeric: tabular-nums;
}

.sum-row :deep(td) {
  font-weight: 600;
  background: hsl(var(--accent));
}
</style>
