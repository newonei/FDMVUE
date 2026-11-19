<script setup lang="ts">
import type { PayrollSlipField } from '#/api/fdmplatform/payroll';

import { computed } from 'vue';

const props = defineProps<{
  disabled?: boolean;
  options: PayrollSlipField[];
}>();

const selected = defineModel<string[]>({ required: true });

const groups = computed(() => {
  const grouped = new Map<string, PayrollSlipField[]>();
  for (const option of props.options) {
    const group = grouped.get(option.group) ?? [];
    group.push(option);
    grouped.set(option.group, group);
  }
  return grouped;
});
</script>

<template>
  <div class="slip-field-groups">
    <fieldset
      v-for="[label, groupOptions] in groups"
      :key="label"
      :disabled="disabled"
    >
      <legend>{{ label }}</legend>
      <div class="slip-field-options">
        <label v-for="option in groupOptions" :key="option.key">
          <input v-model="selected" :value="option.key" type="checkbox" />
          <span>{{ option.label }}</span>
        </label>
      </div>
    </fieldset>
  </div>
</template>

<style scoped>
.slip-field-groups {
  display: grid;
  gap: 10px;
}

fieldset {
  min-width: 0;
  padding: 0 10px 8px;
  margin: 0;
  border: 1px solid var(--line);
  border-radius: 8px;
}

legend {
  padding: 0 5px;
  font-size: 13px;
  font-weight: 650;
  color: var(--muted);
}

.slip-field-options {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(136px, 100%), 1fr));
  gap: 2px 10px;
}

.slip-field-options label {
  display: flex;
  gap: 7px;
  align-items: center;
  min-width: 0;
  min-height: 34px;
  font-size: 13px;
  cursor: pointer;
}

.slip-field-options input {
  flex: none;
  width: 16px;
  height: 16px;
  accent-color: var(--accent);
}

.slip-field-options input:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
}
</style>
