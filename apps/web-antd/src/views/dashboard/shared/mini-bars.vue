<script lang="ts" setup>
import { computed } from 'vue';

/**
 * 卡片里的逐期小柱图：比折线更容易看出哪个月高、哪个月低。
 * 最后一根是本期，用强调色；前面的用弱化色。
 */
const props = withDefaults(
  defineProps<{
    height?: number;
    label?: string;
    values: number[];
  }>(),
  { height: 40, label: '' },
);

const bars = computed(() => {
  const values = props.values.map((value) => Math.max(0, value));
  const max = Math.max(...values, 0);
  return values.map((value, index) => ({
    current: index === values.length - 1,
    // 有值的柱子至少露出一截，避免看起来像没数据
    height: max > 0 && value > 0 ? Math.max(6, (value / max) * 100) : 0,
    key: index,
  }));
});
</script>

<template>
  <div
    v-if="bars.length > 1"
    :aria-label="label || undefined"
    class="mini-bars"
    role="img"
    :style="{ height: `${height}px` }"
  >
    <span
      v-for="bar in bars"
      :key="bar.key"
      class="mini-bars__bar"
      :class="{ 'mini-bars__bar--current': bar.current }"
    >
      <span :style="{ height: `${bar.height}%` }"></span>
    </span>
  </div>
</template>

<style scoped>
.mini-bars {
  display: flex;
  gap: 2px;
  align-items: flex-end;
  width: 100%;
}

.mini-bars__bar {
  display: flex;
  flex: 1;
  align-items: flex-end;
  height: 100%;
  background: hsl(var(--accent) / 60%);
  border-radius: 3px 3px 0 0;
}

.mini-bars__bar > span {
  width: 100%;
  background: var(--line-accent, var(--board-accent, #2a78d6));
  border-radius: 3px 3px 0 0;
  opacity: 0.38;
}

.mini-bars__bar--current > span {
  opacity: 1;
}
</style>
