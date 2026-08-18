<script lang="ts" setup>
import type { DashboardQueryState } from '../composables/use-dashboard-query-state';

import type { JixiaoDashboardApi } from '#/api/fdmperformance/dashboard';
import type { SystemDeptApi } from '#/api/system/dept';

import { computed } from 'vue';

import {
  Button,
  Checkbox,
  DatePicker,
  Input,
  Segmented,
  Select,
  TreeSelect,
} from 'ant-design-vue';

import { PERIOD_OPTIONS } from '../../shared/constants';

const props = defineProps<{
  departments: SystemDeptApi.Dept[];
  hideUserName?: boolean;
  loading?: boolean;
  modelValue: DashboardQueryState;
  options: JixiaoDashboardApi.FilterOptions | null;
}>();

const emit = defineEmits<{
  periodTypeChange: [value: JixiaoDashboardApi.PeriodType];
  query: [];
  reset: [];
  'update:modelValue': [value: DashboardQueryState];
}>();

const periodOptions = computed(() =>
  (props.options?.periods || []).filter(
    (item) => item.periodType === props.modelValue.periodType,
  ),
);

const periodPicker = computed<
  | undefined
  | {
      format: string;
      picker: 'month' | 'quarter' | 'year';
      valueFormat: string;
    }
>(() => {
  switch (props.modelValue.periodType) {
    case 'MONTH': {
      return {
        format: 'YYYY年MM月',
        picker: 'month',
        valueFormat: 'YYYY-MM',
      };
    }
    case 'QUARTER': {
      return {
        format: 'YYYY年第Q季度',
        picker: 'quarter',
        valueFormat: 'YYYY-[Q]Q',
      };
    }
    case 'YEAR': {
      return {
        format: 'YYYY年度',
        picker: 'year',
        valueFormat: 'YYYY',
      };
    }
    default: {
      return undefined;
    }
  }
});

const templateOptions = computed(() =>
  (props.options?.templates || [])
    .filter((item) => item.periodType === props.modelValue.periodType)
    .map((item) => ({
      label: `${item.templateName} (${item.resultCount} 结果人次)`,
      value: item.templateId,
    })),
);

function update(patch: Partial<DashboardQueryState>) {
  emit('update:modelValue', { ...props.modelValue, ...patch });
}

function changePeriodType(value: number | string) {
  const periodType = value as JixiaoDashboardApi.PeriodType;
  update({ endPeriodKey: '', periodType, startPeriodKey: '', templateId: undefined });
  emit('periodTypeChange', periodType);
}

function toggleGradeGroup(grades: string[]) {
  const current = props.modelValue.grades;
  const selected = grades.every((grade) => current.includes(grade));
  update({
    grades: selected
      ? current.filter((grade) => !grades.includes(grade))
      : [...new Set([...current, ...grades])],
  });
}

function selectPeriodKey(value: unknown) {
  return typeof value === 'string' ? value : '';
}

function selectId(value: unknown): JixiaoDashboardApi.Id | undefined {
  return typeof value === 'string' || typeof value === 'number'
    ? value
    : undefined;
}

function selectGrades(value: unknown) {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string')
    : [];
}

function selectPublicStatus(value: unknown): 0 | 1 | undefined {
  if (value === 0 || value === '0') return 0;
  if (value === 1 || value === '1') return 1;
  return undefined;
}

function filterTemplateOption(input: string, option?: { label?: unknown }) {
  return String(option?.label || '').includes(input);
}
</script>

<template>
  <section class="dashboard-filters" aria-label="绩效看板筛选条件">
    <div class="filter-field filter-period-type">
      <label>周期类型</label>
      <Segmented
        :options="PERIOD_OPTIONS"
        :value="modelValue.periodType"
        @change="changePeriodType"
      />
    </div>

    <div class="filter-field">
      <label>开始周期</label>
      <DatePicker
        v-if="periodPicker"
        allow-clear
        :format="periodPicker.format"
        :picker="periodPicker.picker"
        placeholder="选择开始周期"
        :value="modelValue.startPeriodKey || undefined"
        :value-format="periodPicker.valueFormat"
        @update:value="update({ startPeriodKey: selectPeriodKey($event) })"
      />
      <Select
        v-else
        :loading="loading"
        :options="periodOptions.map((item) => ({ label: item.label, value: item.periodKey }))"
        :value="modelValue.startPeriodKey || undefined"
        placeholder="选择开始周期"
        show-search
        @update:value="update({ startPeriodKey: selectPeriodKey($event) })"
      />
    </div>

    <div class="filter-field">
      <label>结束周期</label>
      <DatePicker
        v-if="periodPicker"
        allow-clear
        :format="periodPicker.format"
        :picker="periodPicker.picker"
        placeholder="选择结束周期"
        :value="modelValue.endPeriodKey || undefined"
        :value-format="periodPicker.valueFormat"
        @update:value="update({ endPeriodKey: selectPeriodKey($event) })"
      />
      <Select
        v-else
        :loading="loading"
        :options="periodOptions.map((item) => ({ label: item.label, value: item.periodKey }))"
        :value="modelValue.endPeriodKey || undefined"
        placeholder="选择结束周期"
        show-search
        @update:value="update({ endPeriodKey: selectPeriodKey($event) })"
      />
    </div>

    <div class="filter-field">
      <label>部门</label>
      <TreeSelect
        allow-clear
        :field-names="{ children: 'children', label: 'name', value: 'id' }"
        :tree-data="departments"
        :tree-default-expand-all="false"
        :value="modelValue.deptId"
        placeholder="全部部门"
        show-search
        tree-node-filter-prop="name"
        @update:value="update({ deptId: selectId($event) })"
      />
      <Checkbox
        :checked="modelValue.includeChildDept"
        @update:checked="update({ includeChildDept: $event })"
      >
        包含子部门
      </Checkbox>
    </div>

    <div class="filter-field">
      <label>考评表</label>
      <Select
        allow-clear
        :filter-option="filterTemplateOption"
        :options="templateOptions"
        :value="modelValue.templateId"
        placeholder="全部考评表"
        show-search
        @update:value="update({ templateId: selectId($event) })"
      />
    </div>

    <div v-if="!hideUserName" class="filter-field">
      <label>被考核人昵称</label>
      <Input
        allow-clear
        :maxlength="50"
        :value="modelValue.userName"
        placeholder="模糊搜索昵称"
        @press-enter="emit('query')"
        @update:value="update({ userName: $event })"
      />
    </div>

    <div class="filter-field grade-filter">
      <label>等级</label>
      <Select
        allow-clear
        mode="multiple"
        :options="['A+', 'A', 'B', 'C+', 'C'].map((value) => ({ label: value, value }))"
        :value="modelValue.grades"
        placeholder="全部等级"
        @update:value="update({ grades: selectGrades($event) })"
      />
      <div class="grade-shortcuts">
        <Button size="small" type="link" @click="toggleGradeGroup(['A+', 'A'])">A档</Button>
        <Button size="small" type="link" @click="toggleGradeGroup(['B'])">B档</Button>
        <Button size="small" type="link" @click="toggleGradeGroup(['C+', 'C'])">C档</Button>
      </div>
    </div>

    <div v-if="options?.performanceHr" class="filter-field">
      <label>公示状态</label>
      <Select
        allow-clear
        :options="[
          { label: '已公示', value: 1 },
          { label: '未公示', value: 0 },
          { label: '全部', value: undefined },
        ]"
        :value="modelValue.publicStatus"
        placeholder="已公示"
        @update:value="update({ publicStatus: selectPublicStatus($event) })"
      />
    </div>

    <div class="filter-actions">
      <Button @click="emit('reset')">重置</Button>
      <Button :loading="loading" type="primary" @click="emit('query')">查询</Button>
    </div>
  </section>
</template>

<style scoped>
.dashboard-filters {
  display: grid;
  grid-template-columns: repeat(4, minmax(172px, 1fr));
  gap: 10px 12px;
  align-items: end;
  padding: 14px;
  background: #fff;
  border: 1px solid #edf0f4;
  border-radius: 8px;
}

.filter-field {
  display: grid;
  gap: 5px;
  min-width: 0;
}

.filter-field > label {
  font-size: 12px;
  color: #64748b;
}

.filter-period-type {
  grid-column: span 2;
}

.filter-field :deep(.ant-checkbox-wrapper) {
  margin-top: 2px;
  font-size: 12px;
  color: #64748b;
}

.grade-shortcuts {
  display: flex;
  gap: 4px;
}

.grade-shortcuts :deep(.ant-btn) {
  padding: 0;
}

.filter-actions {
  display: flex;
  gap: 8px;
  justify-content: flex-end;
}

@media (max-width: 1180px) {
  .dashboard-filters {
    grid-template-columns: repeat(3, minmax(172px, 1fr));
  }
}

@media (max-width: 840px) {
  .dashboard-filters {
    grid-template-columns: repeat(2, minmax(150px, 1fr));
  }

  .filter-period-type {
    grid-column: span 2;
  }
}

@media (max-width: 560px) {
  .dashboard-filters {
    grid-template-columns: 1fr;
  }

  .filter-period-type {
    grid-column: span 1;
  }

  .filter-actions {
    justify-content: stretch;
  }

  .filter-actions :deep(.ant-btn) {
    flex: 1;
  }
}
</style>
