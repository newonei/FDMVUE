<script setup lang="ts">
import type { BusinessRecord } from '#/api/fdmplatform';

import { computed } from 'vue';

import { Empty } from 'ant-design-vue';

import { label } from '../data';
import { nativeMoney } from '../documents/migration-display';

/**
 * 合同订单「时间线」（金智同款）：采购申请、采购单、发货、回款、开票按时间倒序列在一起，
 * 每条显示类型、金额和状态；点一条跳到对应部门页签或打开采购单。
 */
const props = defineProps<{
  invoices: BusinessRecord[];
  orders: BusinessRecord[];
  receipts: BusinessRecord[];
  requests: BusinessRecord[];
  shipments: BusinessRecord[];
}>();
const emit = defineEmits<{
  open: [tab: string];
  openOrder: [orderId: string];
}>();

interface Entry {
  key: string;
  kind: string;
  title: string;
  time: string;
  amount?: string;
  status?: string;
  tab?: string;
  orderId?: string;
}
function time(record: BusinessRecord, ...keys: string[]) {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === 'string' && value) return value;
  }
  return '';
}
function text(value: unknown) {
  return typeof value === 'string' || typeof value === 'number'
    ? String(value)
    : '';
}
const entries = computed<Entry[]>(() => {
  const list: Entry[] = [];
  for (const row of props.requests)
    list.push({
      key: `req-${text(row.id)}`,
      kind: '采购申请单',
      title: text(row.code) || text(row.name) || '采购申请',
      time: time(row, 'createdAt', 'requestedAt', 'requiredDate'),
      status: label(row.assignmentStatus ?? row.status),
      tab: 'purchase',
    });
  for (const row of props.orders)
    list.push({
      key: `po-${text(row.id)}`,
      kind: '采购单',
      title: `${text(row.code) || '采购单'} · ${text(row.supplierName) || '供应商未注明'}`,
      time: time(row, 'createdAt', 'orderedAt', 'orderDate'),
      amount: nativeMoney(row.amount, row.currency),
      status: label(row.status),
      orderId: text(row.id),
    });
  for (const row of props.shipments)
    list.push({
      key: `ship-${text(row.id)}`,
      kind: row.kind === 'RETURN' ? '销售退货' : '发货记录',
      title: `数量 ${text(row.quantity)}`,
      time: time(row, 'createdAt', 'occurredAt', 'shippedDate'),
      tab: 'delivery',
    });
  for (const row of props.receipts)
    list.push({
      key: `rec-${text(row.id)}`,
      kind: '回款记录',
      title: `${time(row, 'receivedAt') || '日期未填'} · ${label(row.kind)}`,
      time: time(row, 'createdAt', 'receivedAt'),
      amount: nativeMoney(row.amount, row.currency),
      status: label(row.status),
      tab: 'finance',
    });
  for (const row of props.invoices)
    list.push({
      key: `inv-${text(row.id)}`,
      kind: '开票记录',
      title: text(row.invoiceNumber) || '发票号未填',
      time: time(row, 'createdAt', 'issuedAt'),
      amount: nativeMoney(row.amount, row.currency),
      status: label(row.status),
      tab: 'finance',
    });
  return list.toSorted((a, b) => b.time.localeCompare(a.time));
});
function pick(entry: Entry) {
  if (entry.orderId) emit('openOrder', entry.orderId);
  else if (entry.tab) emit('open', entry.tab);
}
</script>

<template>
  <div class="timeline">
    <Empty
      v-if="entries.length === 0"
      description="还没有下属单据，可从右上角「下属单据新建」办理"
    />
    <button
      v-for="entry in entries"
      :key="entry.key"
      type="button"
      class="entry"
      @click="pick(entry)"
    >
      <div class="line">
        <span class="kind">{{ entry.kind }}</span>
        <b>{{ entry.title }}</b>
        <span v-if="entry.amount" class="amount">{{ entry.amount }}</span>
      </div>
      <div class="meta">
        <span>{{
          entry.time ? entry.time.replace('T', ' ').slice(0, 16) : '时间未记录'
        }}</span>
        <span v-if="entry.status" class="status">{{ entry.status }}</span>
      </div>
    </button>
  </div>
</template>

<style scoped>
.timeline {
  display: flex;
  flex-direction: column;
}

.entry {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 12px 14px;
  color: inherit;
  text-align: left;
  cursor: pointer;
  background: none;
  border: 0;
  border-bottom: 1px solid hsl(var(--border));
}

.entry:hover {
  background: hsl(var(--accent));
}

.line {
  display: flex;
  gap: 8px;
  align-items: center;
}

.kind {
  padding: 0 6px;
  font-size: 12px;
  line-height: 20px;
  color: hsl(var(--primary));
  background: hsl(var(--primary) / 10%);
  border-radius: 4px;
}

.amount {
  margin-left: auto;
  font-variant-numeric: tabular-nums;
}

.meta {
  display: flex;
  gap: 10px;
  font-size: 12px;
  color: hsl(var(--muted-foreground));
}

.status {
  padding: 0 6px;
  background: hsl(var(--accent));
  border-radius: 4px;
}
</style>
