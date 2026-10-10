<script setup lang="ts">
import { InputNumber } from 'ant-design-vue';

/** 大号计数器：左右 − / + 按钮，中间可以直接输入，适合车间里单手点。 */
const props = withDefaults(
  defineProps<{
    id: string;
    label: string;
    max?: number;
    precision?: number;
    size?: 'large' | 'medium';
    step?: number;
    tone?: 'danger' | 'primary';
  }>(),
  { max: undefined, precision: 0, size: 'large', step: 1, tone: 'primary' },
);
const value = defineModel<null | number | undefined>({ required: true });

function change(delta: number) {
  const next = Math.max(0, (value.value ?? 0) + delta);
  value.value = props.max === undefined ? next : Math.min(props.max, next);
}
</script>

<template>
  <div class="flex items-center justify-between gap-3">
    <button
      :aria-label="`${label}减 ${step}`"
      :class="size === 'large' ? 'size-16 text-3xl' : 'size-14 text-2xl'"
      class="shrink-0 rounded-xl border-2 border-foreground bg-card font-bold text-foreground"
      type="button"
      @click="change(-step)"
    >
      −
    </button>
    <InputNumber
      :id="id"
      :value="value ?? undefined"
      :aria-label="label"
      :bordered="false"
      :class="[
        size === 'large' ? 'workbench-counter-lg' : 'workbench-counter-md',
        tone === 'danger' ? 'workbench-counter-danger' : 'workbench-counter-primary',
      ]"
      :controls="false"
      :max="max"
      :min="0"
      :precision="precision"
      class="min-w-0 flex-1"
      inputmode="decimal"
      @change="(v) => (value = (v as null | number | undefined) ?? null)"
    />
    <button
      :aria-label="`${label}加 ${step}`"
      :class="size === 'large' ? 'size-16 text-3xl' : 'size-14 text-2xl'"
      class="shrink-0 rounded-xl border-2 border-foreground bg-card font-bold text-foreground"
      type="button"
      @click="change(step)"
    >
      +
    </button>
  </div>
</template>

<style scoped>
.workbench-counter-lg :deep(input) {
  height: 64px;
  font-size: 44px;
  font-weight: 900;
  text-align: center;
}

.workbench-counter-md :deep(input) {
  height: 56px;
  font-size: 34px;
  font-weight: 900;
  text-align: center;
}

.workbench-counter-primary :deep(input) {
  color: hsl(var(--primary));
}

.workbench-counter-danger :deep(input) {
  color: hsl(var(--destructive));
}
</style>
