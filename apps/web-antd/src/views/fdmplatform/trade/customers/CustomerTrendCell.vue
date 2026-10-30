<script setup lang="ts">
import type { CustomerStats } from '#/api/fdmplatform/customers';

import { computed } from 'vue';

import { moneyShort, recentTrend, sparkBars } from './model';

const props = defineProps<{ months?: string[]; stats?: CustomerStats }>();

const bars = computed(() =>
  sparkBars(props.stats?.monthly ?? [], props.months ?? []).map((bar) => ({
    ...bar,
    title: `${bar.month || '月份'}：${bar.empty ? '无签约' : moneyShort(bar.value.toString(), props.stats?.currency)}`,
  })),
);
const trend = computed(() =>
  props.stats ? recentTrend(props.stats, props.months?.[0]) : undefined,
);
</script>

<template>
  <div class="trend-cell">
    <span v-if="bars.length" class="bars" aria-hidden="true">
      <span
        v-for="(bar, index) in bars"
        :key="index"
        class="bar"
        :class="{ empty: bar.empty }"
        :style="{ height: `${bar.height}px` }"
        :title="bar.title"
      ></span>
    </span>
    <span class="figures">
      <span class="amount">{{
        stats?.contractCount
          ? moneyShort(stats.recent12Amount, stats.currency)
          : '—'
      }}</span>
      <span v-if="trend" class="trend" :class="trend.tone">{{
        trend.text
      }}</span>
    </span>
  </div>
</template>

<style scoped>
.trend-cell {
  display: flex;
  gap: 10px;
  align-items: center;
  min-width: 0;
}

.bars {
  display: flex;
  flex-shrink: 0;
  gap: 2px;
  align-items: flex-end;
  height: 24px;
}

.bar {
  display: block;
  width: 5px;
  background: hsl(var(--primary));
  border-radius: 1px;
}

.bar.empty {
  background: hsl(var(--border));
}

.figures {
  display: flex;
  flex-direction: column;
  gap: 2px;
  align-items: flex-end;
  min-width: 0;
  margin-left: auto;
}

.amount {
  font-weight: 500;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}

.trend {
  font-size: 12px;
  color: hsl(var(--muted-foreground));
  white-space: nowrap;
}

.trend.up {
  color: hsl(var(--success));
}

.trend.down {
  color: hsl(var(--destructive));
}
</style>
