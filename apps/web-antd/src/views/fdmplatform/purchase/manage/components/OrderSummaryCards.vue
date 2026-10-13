<script setup lang="ts">
import { computed } from 'vue';

import BigNumber from 'bignumber.js';

/**
 * 采购单右侧「摘要」（金智同款）：采购单总额、未付款、付款、收票、未收票、无需收票，
 * 以及入库进度。点卡片跳到对应的下属单据页签。
 */
const props = defineProps<{
  arrivalPercent?: number;
  currency?: string;
  invoiced?: unknown;
  noInvoice?: boolean;
  orderAmount?: unknown;
  paid?: unknown;
  unpaid?: unknown;
}>();
const emit = defineEmits<{ open: [tab: string] }>();

function amount(value: unknown) {
  const number = new BigNumber(String(value ?? ''));
  return number.isFinite() ? number : undefined;
}
function money(value?: BigNumber) {
  return value === undefined
    ? '—'
    : `${currencySign.value}${value.toFormat(2)}`;
}
const currencySign = computed(() =>
  !props.currency || props.currency === 'CNY' ? '¥' : `${props.currency} `,
);
function percent(part?: BigNumber, total?: BigNumber) {
  if (!part || !total || !total.gt(0)) return undefined;
  return Math.min(100, Math.round(part.div(total).times(100).toNumber()));
}
const total = computed(() => amount(props.orderAmount));
const paidAmount = computed(() => amount(props.paid));
const invoicedAmount = computed(
  () => amount(props.invoiced) ?? new BigNumber(0),
);
const cards = computed(() => {
  let uninvoiced: BigNumber | undefined;
  if (props.noInvoice) uninvoiced = new BigNumber(0);
  else {
    const gap = total.value?.minus(invoicedAmount.value);
    uninvoiced = gap?.abs().isLessThan(0.005) ? new BigNumber(0) : gap;
  }
  return [
    {
      key: 'total',
      label: '采购单总额',
      value: money(total.value),
      tab: 'details',
    },
    {
      key: 'unpaid',
      label: '未付款金额',
      value: money(amount(props.unpaid)),
      tab: 'payments',
      alert: amount(props.unpaid)?.gt(0),
    },
    {
      key: 'paid',
      label: '付款金额',
      value: money(paidAmount.value),
      tab: 'payments',
      percent: percent(paidAmount.value, total.value),
    },
    {
      key: 'invoiced',
      label: '收票金额',
      value: money(invoicedAmount.value),
      tab: 'invoices',
      percent: props.noInvoice
        ? undefined
        : percent(invoicedAmount.value, total.value),
    },
    {
      key: 'uninvoiced',
      label: '未收票金额',
      value: money(uninvoiced),
      tab: 'invoices',
      alert: !props.noInvoice && uninvoiced?.gt(0),
    },
    {
      key: 'noInvoice',
      label: '无需收票额',
      value: money(props.noInvoice ? total.value : new BigNumber(0)),
      tab: 'invoices',
    },
  ];
});
</script>

<template>
  <section class="summary" aria-label="摘要">
    <h3>摘要</h3>
    <div class="cards">
      <button
        v-for="card in cards"
        :key="card.key"
        type="button"
        class="card"
        @click="emit('open', card.tab)"
      >
        <span class="label">{{ card.label }}</span>
        <strong :class="{ alert: card.alert }">{{ card.value }}</strong>
        <span v-if="card.percent !== undefined" class="percent">{{ card.percent }}%</span>
      </button>
    </div>
    <button
      v-if="arrivalPercent !== undefined"
      type="button"
      class="arrival"
      @click="emit('open', 'stock')"
    >
      <span class="label">入库比例</span>
      <div class="bar"><i :style="{ width: `${arrivalPercent}%` }"></i></div>
      <span class="percent">{{ arrivalPercent }}%</span>
    </button>
  </section>
</template>

<style scoped>
.summary {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 14px;
  background: hsl(var(--card));
  border: 1px solid hsl(var(--border));
  border-radius: 8px;
}

h3 {
  padding-left: 8px;
  margin: 0;
  font-size: 14px;
  font-weight: 600;
  border-left: 3px solid hsl(var(--primary));
}

.cards {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
}

.card,
.arrival {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 10px 12px;
  color: inherit;
  text-align: left;
  cursor: pointer;
  background: hsl(var(--accent));
  border: 0;
  border-radius: 6px;
}

.card:hover,
.arrival:hover {
  outline: 1px solid hsl(var(--primary) / 40%);
}

.label {
  font-size: 12px;
  color: hsl(var(--muted-foreground));
}

strong {
  font-size: 16px;
  font-variant-numeric: tabular-nums;
}

strong.alert {
  color: hsl(var(--destructive));
}

.percent {
  position: absolute;
  right: 10px;
  bottom: 10px;
  font-size: 12px;
  color: hsl(var(--success, 142 71% 45%));
}

.arrival {
  flex-direction: row;
  align-items: center;
}

.bar {
  flex: 1;
  height: 6px;
  overflow: hidden;
  background: hsl(var(--border));
  border-radius: 3px;
}

.bar i {
  display: block;
  height: 100%;
  background: hsl(var(--primary));
}

.arrival .percent {
  position: static;
}
</style>
