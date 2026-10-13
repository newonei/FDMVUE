<script setup lang="ts">
/**
 * 单据详情右侧「摘要」金额卡片（金智同款）：两列小卡片，可带百分比和提醒色，点卡片跳到对应页签。
 */
export interface SummaryCard {
  key: string;
  label: string;
  value: string;
  percent?: number;
  alert?: boolean;
  tab?: string;
}
defineProps<{ cards: SummaryCard[]; title?: string }>();
const emit = defineEmits<{ open: [tab: string] }>();
</script>

<template>
  <section class="summary" :aria-label="title ?? '摘要'">
    <h3>{{ title ?? '摘要' }}</h3>
    <div class="cards">
      <button
        v-for="card in cards"
        :key="card.key"
        type="button"
        class="card"
        @click="card.tab && emit('open', card.tab)"
      >
        <span class="label">{{ card.label }}</span>
        <strong :class="{ alert: card.alert }">{{ card.value }}</strong>
        <span v-if="card.percent !== undefined" class="percent">{{ card.percent }}%</span>
      </button>
    </div>
    <slot></slot>
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

.card {
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

.card:hover {
  outline: 1px solid hsl(var(--primary) / 40%);
}

.label {
  font-size: 12px;
  color: hsl(var(--muted-foreground));
}

strong {
  font-size: 16px;
  font-variant-numeric: tabular-nums;
  overflow-wrap: anywhere;
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
</style>
