<script setup lang="ts">
import type {
  CustomerListTier,
  CustomerOverview,
} from '#/api/fdmplatform/customers';

import { computed } from 'vue';

import { currencyLabel, moneyShort } from './model';

const props = defineProps<{
  active: 'ALL' | CustomerListTier;
  loading?: boolean;
  overview?: CustomerOverview;
}>();
const emit = defineEmits<{ select: [value: 'ALL' | CustomerListTier] }>();

function share(count: number) {
  const total = props.overview?.total ?? 0;
  return total ? `${((count / total) * 100).toFixed(1)}%` : '0%';
}
function count(value?: number) {
  return value === undefined ? '—' : value.toLocaleString('en-US');
}

const cards = computed(() => {
  const view = props.overview;
  const tiers = view?.tiers;
  const activeDays = view?.activeDays ?? 90;
  const followDays = view?.followDays ?? 365;
  const receivables = (view?.receivables ?? []).map(
    (item) => `${currencyLabel(item.currency)} ${moneyShort(item.amount)}`,
  );
  return [
    {
      key: 'ALL' as const,
      label: '全部客户',
      value: count(view?.total),
      sub: view
        ? `启用 ${count(view.activeCount)} · 停用 ${count(view.inactiveCount)}`
        : '',
      title: '',
    },
    {
      key: 'ACTIVE' as const,
      label: '活跃客户',
      dot: 'active',
      value: count(tiers?.ACTIVE),
      sub: `近 ${activeDays} 天有新签约 · 占 ${share(tiers?.ACTIVE ?? 0)}`,
      title: '',
    },
    {
      key: 'FOLLOW' as const,
      label: '需跟进',
      dot: 'follow',
      value: count(tiers?.FOLLOW),
      sub: `${activeDays + 1}–${followDays} 天没有新签约 · 占 ${share(tiers?.FOLLOW ?? 0)}`,
      title: '',
    },
    {
      key: 'SLEEP' as const,
      label: '沉睡客户',
      dot: 'sleep',
      value: count(tiers?.SLEEP),
      sub: `超过 1 年没有新签约 · 占 ${share(tiers?.SLEEP ?? 0)}`,
      title: tiers?.NONE ? `另有 ${tiers.NONE} 个客户还没有合同` : '',
    },
    {
      key: 'NEW' as const,
      label: '今年新客户',
      dot: 'new',
      value: count(view?.newThisYear),
      sub: view
        ? `首单在 ${view.asOf.slice(0, 4)} 年 · 近 ${activeDays} 天 ${count(view.newRecent90)} 家`
        : '',
      title: '',
    },
    {
      key: 'RECEIVABLE' as const,
      label: '有未回款',
      dot: 'owed',
      value: count(view?.receivableCustomers),
      sub:
        receivables.length > 0
          ? `合计 ${receivables.slice(0, 2).join(' · ')}`
          : '',
      title:
        receivables.length > 0
          ? `${receivables.join('\n')}\n金智客户取金智「按客户汇总」的客户未回款额；新系统合同按合同额减回款计算。币种不同的金额分开合计。`
          : '',
    },
  ];
});
const distribution = computed(() => {
  const tiers = props.overview?.tiers;
  const total = props.overview?.total ?? 0;
  if (!tiers || !total) return [];
  const labels = { ACTIVE: '活跃', FOLLOW: '需跟进', SLEEP: '沉睡' };
  return (['ACTIVE', 'FOLLOW', 'SLEEP'] as const).map((key) => ({
    key,
    label: `${labels[key]} ${share(tiers[key])}`,
    width: `${(tiers[key] / total) * 100}%`,
  }));
});

function pick(key: 'ALL' | CustomerListTier) {
  emit('select', props.active === key && key !== 'ALL' ? 'ALL' : key);
}
</script>

<template>
  <div class="overview-cards" :class="{ 'is-loading': loading && !overview }">
    <button
      v-for="card in cards"
      :key="card.key"
      type="button"
      class="overview-card"
      :class="{ selected: active === card.key }"
      :aria-pressed="active === card.key"
      :title="card.title || undefined"
      @click="pick(card.key)"
    >
      <span class="card-label">
        <span v-if="card.dot" class="card-dot" :class="card.dot"></span>
        {{ card.label }}
      </span>
      <span class="card-value">{{ card.value }}</span>
      <span class="card-sub">{{ card.sub }}</span>
      <span
        v-if="card.key === 'ALL' && distribution.length"
        class="distribution"
        :title="distribution.map((item) => item.label).join(' · ')"
      >
        <span
          v-for="item in distribution"
          :key="item.key"
          :class="`segment ${item.key.toLowerCase()}`"
          :style="{ width: item.width }"
        ></span>
      </span>
    </button>
  </div>
</template>

<style scoped>
.overview-cards {
  display: grid;
  grid-template-columns: repeat(6, minmax(0, 1fr));
  gap: 12px;
}

.overview-cards.is-loading {
  opacity: 0.6;
}

.overview-card {
  display: flex;
  flex-direction: column;
  gap: 2px;
  align-items: flex-start;
  min-width: 0;
  min-height: 108px;
  padding: 14px 16px;
  font: inherit;
  color: inherit;
  text-align: left;
  cursor: pointer;
  background: hsl(var(--card));
  border: 1px solid hsl(var(--border));
  border-radius: 8px;
}

.overview-card:hover,
.overview-card:focus-visible {
  outline: none;
  border-color: hsl(var(--primary));
}

.overview-card.selected {
  background: hsl(var(--primary) / 6%);
  border-color: hsl(var(--primary));
  box-shadow: inset 0 0 0 1px hsl(var(--primary));
}

.card-label {
  display: flex;
  gap: 6px;
  align-items: center;
  font-size: 13px;
  color: hsl(var(--muted-foreground));
}

.card-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
}

.card-dot.active,
.segment.active {
  background: hsl(var(--primary));
}

.card-dot.follow,
.segment.follow {
  background: hsl(var(--warning));
}

.card-dot.sleep,
.segment.sleep {
  background: #c9cdd3;
}

.card-dot.new {
  background: hsl(var(--success));
}

.card-dot.owed {
  background: hsl(var(--destructive));
}

.card-value {
  font-size: 26px;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
  line-height: 34px;
  color: hsl(var(--foreground));
}

.card-sub {
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  font-size: 12px;
  color: hsl(var(--muted-foreground));
  white-space: nowrap;
}

.distribution {
  display: flex;
  width: 100%;
  height: 6px;
  margin-top: 8px;
  overflow: hidden;
  background: hsl(var(--border));
  border-radius: 3px;
}

.segment {
  display: block;
  height: 100%;
}

@media (max-width: 1280px) {
  .overview-cards {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }
}

@media (max-width: 640px) {
  .overview-cards {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}
</style>
