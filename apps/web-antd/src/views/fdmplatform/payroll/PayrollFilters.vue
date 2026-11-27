<script setup lang="ts">
import type { PayrollFilters } from './payroll-filters';

import { computed, reactive, ref, useId, watch } from 'vue';

import { ChevronDown, Search } from '@vben/icons';

import { currentMonth, monthOffset, validMonth } from './model';
import {
  minimumPayrollMonth,
  payrollMonthRange,
  payrollPeriodDraft,
  payrollRangeError,
  quarterOf,
} from './payroll-filters';

const props = defineProps<{ initialMonth?: string }>();
const model = defineModel<PayrollFilters>({ required: true });

const maximumMonth = currentMonth();
const maximumYear = Number(maximumMonth.slice(0, 4));
const years = Array.from(
  { length: maximumYear - Number(minimumPayrollMonth.slice(0, 4)) + 1 },
  (_, index) => maximumYear - index,
);

const draft = reactive(payrollPeriodDraft(model.value, maximumMonth));
const employeeName = ref(model.value.employeeName);
const errorId = useId();
const attempted = ref(false);
const range = computed(() => payrollMonthRange(draft, maximumMonth));
const error = computed(() =>
  attempted.value ? payrollRangeError(range.value, maximumMonth) : '',
);
const quarterCount = computed(() =>
  draft.year === maximumYear ? quarterOf(maximumMonth) : 4,
);

watch(
  quarterCount,
  (count) => {
    draft.quarter = Math.min(draft.quarter, count);
  },
  { flush: 'sync' },
);

watch(model, (next) => {
  if (
    next.startMonth !== range.value.startMonth ||
    next.endMonth !== range.value.endMonth
  ) {
    Object.assign(draft, payrollPeriodDraft(next, maximumMonth));
  }
  employeeName.value = next.employeeName;
  attempted.value = false;
});

function applyFilters() {
  attempted.value = true;
  if (error.value) return;
  model.value = { ...range.value, employeeName: employeeName.value.trim() };
}

function resetFilters() {
  const requested = props.initialMonth ?? '';
  const fallback = monthOffset(maximumMonth, -1);
  const initialMonth =
    validMonth(requested) &&
    requested >= minimumPayrollMonth &&
    requested <= maximumMonth
      ? requested
      : fallback;
  const initial = { endMonth: initialMonth, startMonth: initialMonth };
  Object.assign(draft, payrollPeriodDraft(initial, maximumMonth));
  employeeName.value = '';
  attempted.value = false;
  model.value = { ...initial, employeeName: '' };
}
</script>

<template>
  <form
    class="filter-form"
    role="search"
    aria-label="薪酬人员和时间筛选"
    novalidate
    @submit.prevent="applyFilters"
  >
    <div class="filter-controls">
      <label class="filter-field name-field">
        <span>员工姓名</span>
        <input
          v-model="employeeName"
          maxlength="128"
          placeholder="全部员工"
          type="search"
        />
      </label>
      <label class="filter-field">
        <span>时间类型</span>
        <select v-model="draft.mode">
          <option value="month">月度</option>
          <option value="quarter">季度</option>
          <option value="year">年度</option>
          <option value="range">自选月份</option>
        </select>
        <ChevronDown :size="13" aria-hidden="true" />
      </label>
      <label v-if="draft.mode === 'month'" class="filter-field">
        <span>工资月份</span>
        <input
          v-model="draft.month"
          :aria-describedby="error ? errorId : undefined"
          :aria-invalid="Boolean(error)"
          :max="maximumMonth"
          :min="minimumPayrollMonth"
          type="month"
        />
      </label>
      <label
        v-if="draft.mode === 'quarter' || draft.mode === 'year'"
        class="filter-field"
      >
        <span>年度</span>
        <select v-model.number="draft.year">
          <option v-for="year in years" :key="year" :value="year">
            {{ year }} 年
          </option>
        </select>
        <ChevronDown :size="13" aria-hidden="true" />
      </label>
      <label v-if="draft.mode === 'quarter'" class="filter-field">
        <span>季度</span>
        <select v-model.number="draft.quarter">
          <option
            v-for="quarter in quarterCount"
            :key="quarter"
            :value="quarter"
          >
            第 {{ quarter }} 季度
          </option>
        </select>
        <ChevronDown :size="13" aria-hidden="true" />
      </label>
      <template v-if="draft.mode === 'range'">
        <label class="filter-field">
          <span>开始月份</span>
          <input
            v-model="draft.startMonth"
            :aria-describedby="error ? errorId : undefined"
            :aria-invalid="Boolean(error)"
            :max="maximumMonth"
            :min="minimumPayrollMonth"
            type="month"
          />
        </label>
        <label class="filter-field">
          <span>结束月份</span>
          <input
            v-model="draft.endMonth"
            :aria-describedby="error ? errorId : undefined"
            :aria-invalid="Boolean(error)"
            :max="maximumMonth"
            :min="minimumPayrollMonth"
            type="month"
          />
        </label>
      </template>
      <div class="filter-actions">
        <button class="apply-button" type="submit">
          <Search :size="15" aria-hidden="true" />
          查询
        </button>
        <button class="reset-button" type="button" @click="resetFilters">
          重置
        </button>
      </div>
    </div>
    <p v-if="error" :id="errorId" class="filter-error" role="alert">
      {{ error }}
    </p>
  </form>
</template>

<style scoped>
.filter-form {
  margin-bottom: 14px;
}

.filter-controls,
.filter-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 9px;
  align-items: center;
}

.filter-field {
  position: relative;
  display: inline-flex;
  gap: 9px;
  align-items: center;
  max-width: 100%;
  min-height: 37px;
  padding-inline: 10px;
  font-size: 12px;
  color: var(--muted);
  background: var(--panel);
  border: 1px solid var(--line);
  border-radius: 6px;
}

.filter-field span {
  white-space: nowrap;
}

.filter-field input,
.filter-field select {
  min-width: 0;
  padding: 3px 0;
  font: inherit;
  font-size: 13px;
  color: var(--ink);
  background: transparent;
  border: 0;
}

.name-field input {
  width: 10rem;
}

.filter-field input::placeholder {
  color: var(--muted);
}

.filter-field select {
  padding-right: 18px;
  appearance: none;
  cursor: pointer;
}

.filter-field option {
  color: var(--ink);
  background: var(--panel);
}

.filter-field svg {
  position: absolute;
  right: 9px;
  pointer-events: none;
}

.filter-actions button {
  display: inline-flex;
  gap: 6px;
  align-items: center;
  justify-content: center;
  min-height: 37px;
  padding-inline: 12px;
  font: inherit;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  border: 1px solid var(--line);
  border-radius: 6px;
}

.apply-button {
  color: #fff;
  background: var(--accent);
}

.apply-button:hover {
  background: var(--accent-dark);
}

.reset-button {
  color: var(--ink);
  background: var(--panel);
}

.reset-button:hover {
  background: var(--subtle);
}

.filter-field input:focus-visible,
.filter-field select:focus-visible,
.filter-actions button:focus-visible {
  outline: 2px solid var(--accent-text);
  outline-offset: 2px;
}

.filter-error {
  margin: 6px 0 0;
  font-size: 12px;
  color: var(--accent-text);
}
</style>
