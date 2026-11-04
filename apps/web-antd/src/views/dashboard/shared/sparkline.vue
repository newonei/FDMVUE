<script lang="ts" setup>
import { computed } from 'vue';

/** 12 个点的小趋势：前面用弱化色，最后一个点（本期）用强调色。 */
const props = withDefaults(
  defineProps<{
    height?: number;
    label?: string;
    values: number[];
    width?: number;
  }>(),
  { height: 36, label: '', width: 120 },
);

const PAD = 4;

const points = computed(() => {
  const values = props.values;
  if (values.length < 2) return [];
  const max = Math.max(...values);
  const min = Math.min(0, ...values);
  const span = max - min || 1;
  const step = (props.width - PAD * 2) / (values.length - 1);
  return values.map((value, index) => ({
    x: PAD + index * step,
    y: PAD + (1 - (value - min) / span) * (props.height - PAD * 2),
  }));
});

const line = computed(() =>
  points.value.map((point) => `${point.x},${point.y}`).join(' '),
);
const area = computed(() => {
  if (points.value.length === 0) return '';
  const first = points.value[0]!;
  const last = points.value.at(-1)!;
  const bottom = props.height - PAD;
  return `M${first.x},${bottom} L${line.value.replaceAll(' ', ' L')} L${last.x},${bottom} Z`;
});
const lastPoint = computed(() => points.value.at(-1));
</script>

<template>
  <svg
    v-if="points.length"
    :aria-label="label || undefined"
    class="sparkline"
    :height="height"
    role="img"
    :viewBox="`0 0 ${width} ${height}`"
    :width="width"
  >
    <path class="sparkline__area" :d="area" />
    <polyline class="sparkline__line" :points="line" />
    <circle
      v-if="lastPoint"
      class="sparkline__dot"
      :cx="lastPoint.x"
      :cy="lastPoint.y"
      r="3"
    />
  </svg>
</template>

<style scoped>
.sparkline {
  display: block;
  overflow: visible;
}

.sparkline__area {
  opacity: 0.1;
  fill: var(--board-accent, #2a78d6);
}

.sparkline__line {
  opacity: 0.55;
  fill: none;
  stroke: var(--board-accent, #2a78d6);
  stroke-width: 1.75;
  stroke-linecap: round;
  stroke-linejoin: round;
}

.sparkline__dot {
  fill: var(--board-accent, #2a78d6);
  stroke: hsl(var(--card));
  stroke-width: 2;
}
</style>
