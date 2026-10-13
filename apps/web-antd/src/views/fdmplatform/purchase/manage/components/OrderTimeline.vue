<script setup lang="ts">
import type { PurchaseInvoice } from '#/api/fdmplatform/procurement';
import type { PurchaseReturn, StockIn } from '#/api/fdmplatform/warehouse';

import { computed } from 'vue';

import { Empty, Tag } from 'ant-design-vue';
import BigNumber from 'bignumber.js';

import {
  financeStatus,
  invoiceStates,
} from '../../../finance/procurement/model';

/**
 * 采购单「时间线」（金智同款）：付款记录、付款发票、入库单、退货单按时间倒序列在一起，
 * 每条显示类型、金额和状态；点一条跳到对应页签。
 */
const props = defineProps<{
  currency?: string;
  invoices: PurchaseInvoice[];
  payments: Array<Record<string, unknown>>;
  returns: PurchaseReturn[];
  stockIns: StockIn[];
}>();
const emit = defineEmits<{ open: [tab: string] }>();

interface Entry {
  key: string;
  kind: string;
  tab: string;
  title: string;
  time: string;
  amount?: string;
  tags: Array<{ color?: string; label: string }>;
}
function money(value: unknown) {
  const number = new BigNumber(String(value ?? ''));
  return number.isFinite()
    ? `${props.currency ?? ''} ${number.toFormat(2)}`.trim()
    : undefined;
}
const entries = computed<Entry[]>(() => {
  const list: Entry[] = [];
  for (const row of props.payments) {
    const state = invoiceStates[String(row.invoiceState ?? '')];
    list.push({
      key: `pay-${row.id}`,
      kind: '付款记录',
      tab: 'payments',
      title: `${String(row.paidAt ?? '')} ${String(row.code ?? '')}`.trim(),
      time: String(row.createdAt ?? row.paidAt ?? ''),
      amount: money(row.amount),
      tags: [
        { label: financeStatus(row.status) },
        ...(state ? [{ color: state.color, label: state.label }] : []),
      ],
    });
  }
  for (const row of props.invoices) {
    list.push({
      key: `inv-${row.id}`,
      kind: '付款发票',
      tab: 'invoices',
      title: row.invoiceNo ?? row.file?.name ?? '发票',
      time: row.createdAt,
      amount: money(row.amount),
      tags: [
        row.status === 'VALID'
          ? { color: 'success', label: '有效' }
          : { label: '已作废' },
        ...(row.paymentCode ? [{ label: `付款 ${row.paymentCode}` }] : []),
      ],
    });
  }
  for (const row of props.stockIns) {
    list.push({
      key: `in-${row.id}`,
      kind: '入库单',
      tab: 'stock',
      title: `${row.code} · ${row.warehouseName}`,
      time: row.createdAt,
      amount: money(row.amount),
      tags: [
        row.status === 'VOIDED'
          ? { label: '已作废' }
          : {
              color: 'success',
              label: row.directShip ? '已入库·直发' : '已入库',
            },
      ],
    });
  }
  for (const row of props.returns) {
    list.push({
      key: `ret-${row.id}`,
      kind: '采购退货单',
      tab: 'stock',
      title: row.code,
      time: String((row as unknown as Record<string, unknown>).createdAt ?? ''),
      tags: [],
    });
  }
  return list.toSorted((a, b) => b.time.localeCompare(a.time));
});
function when(value: string) {
  return value ? value.replace('T', ' ').slice(0, 16) : '';
}
</script>

<template>
  <div class="timeline">
    <Empty
      v-if="entries.length === 0"
      description="还没有下属单据，可从右上角「下属单据新建」登记"
    />
    <button
      v-for="entry in entries"
      :key="entry.key"
      type="button"
      class="entry"
      @click="emit('open', entry.tab)"
    >
      <div class="line">
        <Tag color="blue">{{ entry.kind }}</Tag>
        <b>{{ entry.title }}</b>
        <span v-if="entry.amount" class="amount">{{ entry.amount }}</span>
      </div>
      <div class="meta">
        <span>创建时间：{{ when(entry.time) }}</span>
        <Tag v-for="tag in entry.tags" :key="tag.label" :color="tag.color">
          {{ tag.label }}
        </Tag>
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

.amount {
  margin-left: auto;
  font-variant-numeric: tabular-nums;
}

.meta {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  align-items: center;
  font-size: 12px;
  color: hsl(var(--muted-foreground));
}
</style>
