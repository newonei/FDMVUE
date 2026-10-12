<script setup lang="ts">
import type { StockTxn } from '#/api/fdmplatform/warehouse';

import { Table } from 'ant-design-vue';

import { money, qty } from './model';
import { txnLabel } from './return-model';

import './warehouse-pages.css';

defineProps<{
  loading: boolean;
  page: number;
  rows: StockTxn[];
  total: number;
}>();
const emit = defineEmits<{ page: [value: number] }>();

const columns = [
  { title: '日期', key: 'date', width: 100 },
  { title: '单据', key: 'doc', width: 160 },
  { title: '仓库', key: 'warehouse', width: 100 },
  { title: '产品', key: 'product', width: 220 },
  { title: '入 / 出', key: 'quantity', width: 100, align: 'right' as const },
  { title: '结存', key: 'after', width: 90, align: 'right' as const },
  { title: '成本', key: 'amount', width: 120, align: 'right' as const },
  { title: '合同 / 往来', key: 'contract', width: 200 },
];
</script>

<template>
  <div class="warehouse-page txn-table">
    <Table
      class="fdm-business-table"
      size="small"
      table-layout="fixed"
      row-key="id"
      :data-source="rows"
      :loading="loading"
      :scroll="{ x: 1090 }"
      :columns="columns"
      :pagination="{
        current: page,
        pageSize: 20,
        total,
        showSizeChanger: false,
        showTotal: (count: number) => `共 ${count} 条`,
      }"
      @change="(pagination) => emit('page', pagination.current ?? 1)"
    >
      <template #emptyText>还没有出入库记录</template>
      <template #bodyCell="{ column, record }">
        <span v-if="column.key === 'date'" class="num">{{
          record.occurredOn
        }}</span>
        <div v-else-if="column.key === 'doc'" class="cell">
          <span class="mono">{{ record.docCode }}</span>
          <span class="muted">{{ txnLabel(record as StockTxn) }}</span>
        </div>
        <span v-else-if="column.key === 'warehouse'">{{
          record.warehouseName
        }}</span>
        <span v-else-if="column.key === 'product'" class="ellipsis">{{
          record.productName
        }}</span>
        <b
          v-else-if="column.key === 'quantity'"
          class="num"
          :class="record.type === 'IN' ? 'in' : 'out'"
          >{{ record.type === 'IN' ? '+' : '−' }}{{ qty(record.quantity) }}</b>
        <span v-else-if="column.key === 'after'" class="num">{{
          qty(record.onHandAfter)
        }}</span>
        <span v-else-if="column.key === 'amount'" class="num">{{
          money(record.amount)
        }}</span>
        <div v-else-if="column.key === 'contract'" class="cell">
          <span>{{ record.contractCode ?? '—' }}</span>
          <span class="muted ellipsis">{{ record.partner }}</span>
        </div>
      </template>
    </Table>
  </div>
</template>

<style scoped>
.txn-table {
  padding: 0;
}
</style>
