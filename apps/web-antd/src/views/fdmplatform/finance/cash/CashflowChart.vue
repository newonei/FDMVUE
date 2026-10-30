<script setup lang="ts">
import type { Decimal } from '#/api/fdmplatform';

import { computed } from 'vue';

import BigNumber from 'bignumber.js';

import { moneyShort, rmb } from './model';

/**
 * 每月收款与付款并排，同一刻度；悬停看当月收、付与净额。
 * 传入 24 个月时只画后 12 个月，前 12 个月用于悬停里的上年同月对比。
 */
const props = defineProps<{
  height?: number;
  inflow: Decimal[];
  months: string[];
  outflow: Decimal[];
}>();

const number = (value: Decimal | undefined) => {
  const parsed = new BigNumber(value ?? 0);
  return parsed.isFinite() ? parsed : new BigNumber(0);
};
const offset = computed(() => Math.max(0, props.months.length - 12));
const slots = computed(() => {
  const shown = props.months.slice(offset.value);
  const peak = BigNumber.max(
    1,
    ...shown.flatMap((_, index) => [
      number(props.inflow[offset.value + index]),
      number(props.outflow[offset.value + index]),
    ]),
  );
  const percent = (value: BigNumber) =>
    value.isGreaterThan(0)
      ? Math.max(2, value.dividedBy(peak).multipliedBy(100).toNumber())
      : 0;
  return shown.map((month, index) => {
    const at = offset.value + index;
    const inflow = number(props.inflow[at]);
    const outflow = number(props.outflow[at]);
    const lastYear = at >= 12 ? number(props.inflow[at - 12]) : undefined;
    const lines = [
      month,
      `收款 ${rmb(inflow.toString())}`,
      `付款 ${rmb(outflow.toString())}`,
      `净额 ${inflow.minus(outflow).isNegative() ? '-' : ''}${rmb(inflow.minus(outflow).abs().toString())}`,
    ];
    if (lastYear) lines.push(`上年同月收款 ${rmb(lastYear.toString())}`);
    return {
      key: month,
      label: `${Number(month.slice(5))}月`,
      in: percent(inflow),
      out: percent(outflow),
      net: inflow.minus(outflow),
      current: index === shown.length - 1,
      title: lines.join('\n'),
    };
  });
});
</script>

<template>
  <div class="cashflow" role="img" aria-label="近 12 个月收款与付款">
    <div class="legend" aria-hidden="true">
      <span><i class="in"></i>收款</span>
      <span><i class="out"></i>付款</span>
      <span class="note">人民币 · 悬停看净额</span>
    </div>
    <div class="plot" :style="{ height: `${height ?? 120}px` }">
      <div
        v-for="slot in slots"
        :key="slot.key"
        class="slot"
        :class="{ current: slot.current }"
        :title="slot.title"
      >
        <span class="bar in" :style="{ height: `${slot.in}%` }"></span>
        <span class="bar out" :style="{ height: `${slot.out}%` }"></span>
      </div>
    </div>
    <div class="labels" aria-hidden="true">
      <span
        v-for="slot in slots"
        :key="slot.key"
        :class="{ negative: slot.net.isNegative() }"
        :title="`净额 ${moneyShort(slot.net.toString())}`"
        >{{ slot.label }}</span>
    </div>
  </div>
</template>

<style scoped>
.legend {
  display: flex;
  gap: 12px;
  align-items: center;
  margin-bottom: 6px;
  font-size: 12px;
  color: hsl(var(--muted-foreground));
}

.legend span {
  display: inline-flex;
  gap: 4px;
  align-items: center;
}

.legend i {
  display: inline-block;
  width: 10px;
  height: 10px;
  border-radius: 2px;
}

.legend .note {
  margin-left: auto;
}

.plot {
  display: flex;
  gap: 8px;
  align-items: flex-end;
  border-bottom: 1px solid hsl(var(--border));
}

.slot {
  display: flex;
  flex: 1;
  gap: 2px;
  align-items: flex-end;
  justify-content: center;
  height: 100%;
  border-radius: 4px 4px 0 0;
}

.slot:hover {
  background: hsl(var(--accent));
}

.bar {
  display: block;
  flex: 1;
  max-width: 14px;
  border-radius: 2px 2px 0 0;
}

.in,
.legend .in {
  background: hsl(var(--primary));
}

.out,
.legend .out {
  background: hsl(var(--warning) / 75%);
}

.current .bar {
  opacity: 0.65;
}

.labels {
  display: flex;
  gap: 8px;
  margin-top: 4px;
}

.labels span {
  flex: 1;
  font-size: 11px;
  color: hsl(var(--muted-foreground));
  text-align: center;
}

.labels span.negative {
  color: hsl(var(--destructive));
}
</style>
