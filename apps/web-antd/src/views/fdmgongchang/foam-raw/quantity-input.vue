<script setup lang="ts">
import { computed, ref } from 'vue';

import { InputNumber, Select } from 'ant-design-vue';

type Unit = 'bag' | 'kg' | 't';

const props = defineProps<{
  label: string;
  max?: number;
  packageWeight?: null | number;
  unit?: Unit;
}>();
const kilograms = defineModel<null | number>({ required: true });
const selectedUnit = ref<Unit>(props.unit ?? 'kg');
const options = computed(() => [
  { label: '公斤', value: 'kg' },
  { label: '吨', value: 't' },
  ...(props.packageWeight ? [{
    disabled: kilograms.value !== null && kilograms.value !== undefined
      && Math.abs(kilograms.value / props.packageWeight - Math.round(kilograms.value / props.packageWeight)) > 1e-6,
    label: '袋',
    value: 'bag',
  }] : []),
]);
const activeUnit = computed(() => selectedUnit.value === 'bag' && !props.packageWeight
  ? 'kg'
  : selectedUnit.value);
const multiplier = computed(() => {
  if (activeUnit.value === 't') return 1000;
  if (activeUnit.value === 'bag') return props.packageWeight ?? 1;
  return 1;
});
const displayValue = computed(() => {
  const value = kilograms.value;
  return value === null || value === undefined ? undefined : value / multiplier.value;
});
const displayMax = computed(() => {
  if (props.max === null || props.max === undefined) return undefined;
  const max = props.max / multiplier.value;
  return activeUnit.value === 'bag' ? Math.floor(max) : max;
});

function setQuantity(value: null | number | string) {
  kilograms.value = value === null || value === undefined
    ? null
    : Math.round(Number(value) * multiplier.value * 1000) / 1000;
}
</script>

<template>
  <div class="flex min-w-[9rem] items-center gap-1">
    <InputNumber
      :aria-label="label"
      :max="displayMax"
      :min="0"
      :precision="activeUnit === 'bag' ? 0 : activeUnit === 'kg' ? 3 : 6"
      :value="displayValue"
      class="min-w-0 flex-1"
      @update:value="setQuantity"
    />
    <Select
      :aria-label="`${label}单位`"
      :options="options"
      :value="activeUnit"
      class="w-[4.5rem] shrink-0"
      @change="(value) => selectedUnit = value as Unit"
    />
  </div>
</template>
