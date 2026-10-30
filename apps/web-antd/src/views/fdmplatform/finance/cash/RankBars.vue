<script setup lang="ts">
import type { RankRow } from './model';

import { computed } from 'vue';

import BigNumber from 'bignumber.js';

import { moneyShort } from './model';

/** 横向排行：客户、供应商或账户，按同一最大值等比；点击行发出 select。 */
const props = defineProps<{
  clickable?: boolean;
  empty?: string;
  rows: RankRow[];
  tone?: 'in' | 'out';
}>();
const emit = defineEmits<{ select: [row: RankRow] }>();
const shown = computed(() => {
  const max = BigNumber.max(
    1,
    ...props.rows.map((row) => new BigNumber(row.amount)),
  );
  return props.rows.map((row) => ({
    ...row,
    width: `${BigNumber.max(0, new BigNumber(row.amount)).dividedBy(max).multipliedBy(100).toFixed(1)}%`,
  }));
});
</script>

<template>
  <ol class="rank" :class="tone ?? 'in'">
    <li v-for="row in shown" :key="row.key">
      <component
        :is="clickable ? 'button' : 'div'"
        :type="clickable ? 'button' : undefined"
        class="row"
        :class="{ clickable, muted: row.muted }"
        :title="[row.name, row.hint].filter(Boolean).join(' · ')"
        @click="clickable && emit('select', row)"
      >
        <span class="name">{{ row.name }}</span>
        <span class="track"><span :style="{ width: row.width }"></span></span>
        <span class="value">{{ moneyShort(row.amount) }}</span>
      </component>
    </li>
    <li v-if="rows.length === 0" class="empty">{{ empty ?? '暂无数据' }}</li>
  </ol>
</template>

<style scoped>
.rank {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 0;
  margin: 0;
  list-style: none;
}

.row {
  display: grid;
  grid-template-columns: minmax(0, 10em) minmax(0, 1fr) auto;
  gap: 8px;
  align-items: center;
  width: 100%;
  padding: 2px 0;
  font: inherit;
  font-size: 12px;
  color: inherit;
  text-align: left;
  background: transparent;
  border: 0;
}

.row.clickable {
  cursor: pointer;
}

.row.clickable:hover .name,
.row.clickable:focus-visible .name {
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

.muted .name {
  color: hsl(var(--muted-foreground));
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
  border-radius: 4px;
}

.in .track span {
  background: hsl(var(--primary));
}

.out .track span {
  background: hsl(var(--warning) / 75%);
}

.muted .track span {
  opacity: 0.5;
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
