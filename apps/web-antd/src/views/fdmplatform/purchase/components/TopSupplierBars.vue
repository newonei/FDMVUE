<script setup lang="ts">
import type { SupplierRanking } from '#/api/fdmplatform/supplier-stats';

import { computed } from 'vue';

import BigNumber from 'bignumber.js';

import { moneyShort } from '../../trade/customers/model';

const props = defineProps<{
  currency?: string;
  suppliers: SupplierRanking[];
}>();
const emit = defineEmits<{ select: [supplier: SupplierRanking] }>();
const rows = computed(() => {
  const max = BigNumber.max(
    1,
    ...props.suppliers.map((row) => new BigNumber(row.amount)),
  );
  return props.suppliers.map((row) => ({
    ...row,
    width: `${new BigNumber(row.amount).dividedBy(max).multipliedBy(100).toFixed(1)}%`,
  }));
});
</script>

<template>
  <ol class="top">
    <li v-for="row in rows" :key="row.id ?? row.name">
      <button
        type="button"
        class="row"
        :title="`${row.name} · ${row.orders} 张采购单`"
        @click="emit('select', row)"
      >
        <span class="name">{{ row.name }}</span>
        <span class="track"><span :style="{ width: row.width }"></span></span>
        <span class="value">{{ moneyShort(row.amount, currency) }}</span>
      </button>
    </li>
    <li v-if="suppliers.length === 0" class="empty">近 12 个月还没有采购</li>
  </ol>
</template>

<style scoped>
.top {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 0;
  margin: 0;
  list-style: none;
}

.row {
  display: grid;
  grid-template-columns: minmax(0, 9em) minmax(0, 1fr) auto;
  gap: 8px;
  align-items: center;
  width: 100%;
  padding: 2px 0;
  font: inherit;
  font-size: 12px;
  color: inherit;
  text-align: left;
  cursor: pointer;
  background: transparent;
  border: 0;
}

.row:hover .name,
.row:focus-visible .name {
  color: hsl(var(--primary));
}

.row:focus-visible {
  outline: 2px solid hsl(var(--primary));
  outline-offset: 2px;
}

.name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.track {
  height: 8px;
  overflow: hidden;
  background: hsl(var(--accent));
  border-radius: 4px;
}

.track span {
  display: block;
  height: 100%;
  background: hsl(var(--primary));
  border-radius: 4px;
}

.value {
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}

.empty {
  font-size: 12px;
  color: hsl(var(--muted-foreground));
}
</style>
