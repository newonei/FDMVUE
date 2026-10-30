<script setup lang="ts">
import { computed } from 'vue';

import { pct } from '../shared';

/**
 * 指标卡：大数字 + 与上期对比。lowerIsBetter 时下降显示为绿色（例如残次、逾期）。
 */
const props = defineProps<{
  change?: null | number;
  hint?: string;
  label: string;
  lowerIsBetter?: boolean;
  tone?: 'danger' | 'default' | 'warning';
  unit?: string;
  value: string;
}>();
const emit = defineEmits<{ open: [] }>();

const trend = computed(() => {
  if (props.change === null || props.change === undefined) return null;
  const up = props.change > 0;
  const flat = Math.abs(props.change) < 0.0005;
  let arrow = up ? '↑' : '↓';
  let cls = up === !props.lowerIsBetter ? 'text-success' : 'text-destructive';
  if (flat) {
    arrow = '→';
    cls = 'text-muted-foreground';
  }
  return { arrow, cls, text: pct(Math.abs(props.change)) };
});
</script>

<template>
  <button
    class="group flex min-w-0 flex-col gap-2 rounded-xl border bg-card p-4 text-left shadow-sm transition hover:-translate-y-0.5 hover:shadow-md" :class="[
      tone === 'danger' ? 'border-destructive/40' : tone === 'warning' ? 'border-warning/50' : 'border-border',
    ]"
    type="button"
    @click="emit('open')"
  >
    <span class="text-sm text-muted-foreground">{{ label }}</span>
    <span class="flex items-baseline gap-1">
      <span class="text-3xl font-bold tabular-nums tracking-tight">{{ value }}</span>
      <span v-if="unit" class="text-sm text-muted-foreground">{{ unit }}</span>
    </span>
    <span class="flex min-h-5 flex-wrap items-center gap-x-2 text-xs">
      <span v-if="trend" :class="trend.cls" class="font-semibold tabular-nums">{{ trend.arrow }} {{ trend.text }}</span>
      <span v-if="trend" class="text-muted-foreground">较上期</span>
      <span v-if="hint" :class="tone === 'danger' ? 'text-destructive' : tone === 'warning' ? 'text-warning' : 'text-muted-foreground'">{{ hint }}</span>
    </span>
  </button>
</template>
