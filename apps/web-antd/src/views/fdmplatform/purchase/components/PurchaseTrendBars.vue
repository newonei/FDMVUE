<script setup lang="ts">
import type { Decimal } from '#/api/fdmplatform';

import { computed } from 'vue';

import BigNumber from 'bignumber.js';

import { moneyShort } from '../../trade/customers/model';

/** Monthly purchase amounts drawn to one scale; the busiest month carries its value. */
const props = defineProps<{
  currency?: string;
  height?: number;
  monthly: Decimal[];
  months: string[];
}>();

const values = computed(() =>
  props.monthly.map((value) => {
    const number = new BigNumber(value);
    return number.isFinite() ? number : new BigNumber(0);
  }),
);
const peak = computed(() => BigNumber.max(0, ...values.value));
const bars = computed(() =>
  values.value.map((value, index) => {
    const month = props.months[index] ?? '';
    return {
      key: month || String(index),
      label: month ? `${Number(month.slice(5))}月` : '',
      percent: peak.value.isGreaterThan(0)
        ? Math.max(
            value.isGreaterThan(0) ? 3 : 0,
            value.dividedBy(peak.value).multipliedBy(100).toNumber(),
          )
        : 0,
      peak: value.isGreaterThan(0) && value.isEqualTo(peak.value),
      current: index === values.value.length - 1,
      title: `${month} ${moneyShort(value.toString(), props.currency)}`,
    };
  }),
);
</script>

<template>
  <div class="trend" role="img" :aria-label="`近 ${months.length} 个月采购额`">
    <div class="plot" :style="{ height: `${height ?? 96}px` }">
      <div v-for="bar in bars" :key="bar.key" class="slot" :title="bar.title">
        <span v-if="bar.peak" class="peak">{{
          moneyShort(peak.toString())
        }}</span>
        <span
          class="bar"
          :class="{ current: bar.current, top: bar.peak }"
          :style="{ height: `${bar.percent}%` }"
        ></span>
      </div>
    </div>
    <div class="labels" aria-hidden="true">
      <span v-for="bar in bars" :key="bar.key">{{ bar.label }}</span>
    </div>
  </div>
</template>

<style scoped>
.plot {
  display: flex;
  gap: 6px;
  align-items: flex-end;
  padding-top: 16px;
  border-bottom: 1px solid hsl(var(--border));
}

.slot {
  position: relative;
  display: flex;
  flex: 1;
  flex-direction: column;
  justify-content: flex-end;
  height: 100%;
}

.bar {
  display: block;
  background: hsl(var(--primary) / 28%);
  border-radius: 3px 3px 0 0;
}

.bar.top {
  background: hsl(var(--primary));
}

.bar.current {
  background: hsl(var(--primary) / 55%);
}

.peak {
  position: absolute;
  top: -16px;
  left: 50%;
  font-size: 11px;
  color: hsl(var(--primary));
  white-space: nowrap;
  transform: translateX(-50%);
}

.labels {
  display: flex;
  gap: 6px;
  margin-top: 4px;
}

.labels span {
  flex: 1;
  font-size: 11px;
  color: hsl(var(--muted-foreground));
  text-align: center;
}
</style>
