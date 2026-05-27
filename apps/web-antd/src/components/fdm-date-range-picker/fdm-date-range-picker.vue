<script lang="ts" setup>
import type { FdmDateRange } from './date-range';

import { computed, ref, watch } from 'vue';

import { Button, DatePicker, Popover } from 'ant-design-vue';

import {
  FDM_DATE_FORMAT,
  FDM_DATE_RANGE_GROUPS,
  findDateRangePreset,
  getDateRangeDays,
  getYesterdayDateRange,
  normalizeDateRange,
} from './date-range';

defineOptions({ inheritAttrs: false, name: 'FdmDateRangePicker' });

const props = withDefaults(
  defineProps<{
    allowClear?: boolean;
    disabled?: boolean;
    modelValue?: FdmDateRange;
    placeholder?: string;
    value?: FdmDateRange;
  }>(),
  {
    allowClear: false,
    disabled: false,
    placeholder: '选择日期范围',
  },
);

const emits = defineEmits<{
  change: [value: FdmDateRange | undefined];
  confirm: [value: FdmDateRange | undefined];
  'update:modelValue': [value: FdmDateRange | undefined];
  'update:value': [value: FdmDateRange | undefined];
}>();

const open = ref(false);
const selectedRange = ref<FdmDateRange>(
  normalizeDateRange(props.value ?? props.modelValue) ?? getYesterdayDateRange(),
);
const pendingRange = ref<FdmDateRange>([...selectedRange.value]);

const selectedPreset = computed(() => findDateRangePreset(selectedRange.value));
const pendingPreset = computed(() => findDateRangePreset(pendingRange.value));
const pendingDays = computed(() => getDateRangeDays(pendingRange.value));

const triggerLabel = computed(() => {
  if (!selectedRange.value) return props.placeholder;
  return (
    selectedPreset.value?.label ??
    `${selectedRange.value[0]} ~ ${selectedRange.value[1]}`
  );
});

watch(
  () => props.value ?? props.modelValue,
  (value) => {
    const normalized =
      normalizeDateRange(value as FdmDateRange | undefined) ??
      getYesterdayDateRange();
    selectedRange.value = normalized;
    pendingRange.value = [...normalized];
  },
  { immediate: true },
);

function handleOpenChange(nextOpen: boolean) {
  open.value = nextOpen;
  if (nextOpen) {
    pendingRange.value = [...selectedRange.value];
  }
}

function updateRange(value: FdmDateRange | undefined) {
  const normalized = normalizeDateRange(value) ?? getYesterdayDateRange();
  selectedRange.value = normalized;
  pendingRange.value = [...normalized];
  emits('update:value', normalized);
  emits('update:modelValue', normalized);
  emits('change', normalized);
}

function selectPreset(range: FdmDateRange) {
  updateRange(range);
}

function handlePickerChange(value?: FdmDateRange) {
  updateRange(value);
}

function confirmRange() {
  const normalized = normalizeDateRange(pendingRange.value);
  updateRange(normalized);
  emits('confirm', selectedRange.value);
  open.value = false;
}
</script>

<template>
  <div class="ec-date-range-select" :class="$attrs.class" :style="$attrs.style">
    <Popover
      :open="open"
      trigger="click"
      overlay-class-name="ec-shop-daily-date-range-popover"
      placement="bottomLeft"
      @open-change="handleOpenChange"
    >
      <template #content>
        <div class="ec-date-range-panel">
          <div class="ec-date-range-title">查询范围</div>

          <div class="ec-date-range-presets">
            <template
              v-for="group in FDM_DATE_RANGE_GROUPS"
              :key="group.label"
            >
              <div class="ec-date-range-group-label">{{ group.label }}</div>
              <button
                v-for="preset in group.presets"
                :key="preset.key"
                class="ec-date-range-preset"
                :class="{
                  'is-active': pendingPreset?.key === preset.key,
                }"
                type="button"
                @click="selectPreset(preset.getRange())"
              >
                {{ preset.label }}
              </button>
            </template>
          </div>

          <div class="ec-date-range-subtitle">时间范围</div>
          <div class="ec-date-range-picker-row">
            <DatePicker.RangePicker
              v-model:value="pendingRange"
              :allow-clear="allowClear"
              :format="FDM_DATE_FORMAT"
              :value-format="FDM_DATE_FORMAT"
              class="ec-date-range-picker"
              @change="handlePickerChange"
            />
            <span class="ec-date-range-days">{{ pendingDays }} 天</span>
          </div>

          <div class="ec-date-range-footer">
            <Button type="primary" @click="confirmRange">确定</Button>
          </div>
        </div>
      </template>

      <button
        class="ec-date-range-trigger"
        :class="{ 'is-disabled': disabled }"
        :disabled="disabled"
        type="button"
      >
        <span class="truncate">{{ triggerLabel }}</span>
        <span class="ec-date-range-arrow"></span>
      </button>
    </Popover>
  </div>
</template>

<style scoped>
.ec-date-range-select {
  display: inline-block;
  width: 100%;
}

.ec-date-range-trigger {
  display: inline-flex;
  min-height: 32px;
  width: 100%;
  min-width: 180px;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  border: 1px solid hsl(var(--border));
  border-radius: 6px;
  background: hsl(var(--background));
  padding: 4px 12px;
  color: hsl(var(--foreground));
  line-height: 22px;
  text-align: left;
  transition:
    border-color 0.2s,
    box-shadow 0.2s;
}

.ec-date-range-trigger:hover,
.ec-date-range-trigger:focus {
  border-color: #1677ff;
  box-shadow: 0 0 0 2px rgb(22 119 255 / 10%);
  outline: none;
}

.ec-date-range-trigger.is-disabled {
  cursor: not-allowed;
  background: hsl(var(--muted));
  color: hsl(var(--muted-foreground));
}

.ec-date-range-arrow {
  width: 8px;
  height: 8px;
  flex-shrink: 0;
  border-right: 1px solid currentcolor;
  border-bottom: 1px solid currentcolor;
  transform: translateY(-2px) rotate(45deg);
}

.ec-date-range-panel {
  width: min(430px, calc(100vw - 40px));
  padding: 18px 18px 14px;
}

.ec-date-range-title,
.ec-date-range-subtitle {
  color: hsl(var(--muted-foreground));
  font-size: 14px;
  font-weight: 600;
}

.ec-date-range-presets {
  display: grid;
  grid-template-columns: 72px 1fr 1fr;
  row-gap: 16px;
  align-items: center;
  margin-top: 24px;
}

.ec-date-range-group-label {
  color: hsl(var(--muted-foreground));
  font-size: 16px;
}

.ec-date-range-preset {
  min-height: 28px;
  border: 0;
  border-radius: 4px;
  background: transparent;
  color: hsl(var(--foreground));
  cursor: pointer;
  font-size: 16px;
  text-align: left;
}

.ec-date-range-preset:hover,
.ec-date-range-preset.is-active {
  color: #1677ff;
}

.ec-date-range-subtitle {
  margin-top: 18px;
}

.ec-date-range-picker-row {
  display: flex;
  align-items: center;
  gap: 16px;
  margin-top: 12px;
}

.ec-date-range-picker {
  width: 286px;
}

.ec-date-range-days {
  min-width: 42px;
  color: hsl(var(--foreground));
}

.ec-date-range-footer {
  display: flex;
  justify-content: flex-end;
  margin-top: 20px;
  padding-top: 20px;
  border-top: 1px solid hsl(var(--border));
}

:global(.ec-shop-daily-date-range-popover .ant-popover-inner) {
  border-radius: 8px;
}

:global(.ec-shop-daily-date-range-popover .ant-popover-inner-content) {
  padding: 0;
}
</style>
