<script lang="ts" setup>
import type {
  SkillVisibility,
  SkillVisibilityScope,
} from '#/api/fdmskill/community';

import { computed } from 'vue';

import { Button, FormItem, Select } from 'ant-design-vue';

import { visibilityLabels } from './model';

const props = defineProps<{
  departments: { label: string; value: string }[];
  disabled: boolean;
  error: string;
  loading: boolean;
}>();
const emit = defineEmits<{ retry: [] }>();
const visibility = defineModel<SkillVisibility>({ required: true });
const scopes = (['PRIVATE', 'DEPARTMENTS', 'COMPANY'] as const).map(
  (value) => ({
    label: visibilityLabels[value],
    value,
  }),
);
const scope = computed<SkillVisibilityScope>({
  get: () => visibility.value.scope,
  set: (value) => {
    visibility.value = { scope: value, departmentIds: [] };
  },
});
const departmentIds = computed({
  get: () => visibility.value.departmentIds,
  set: (value) => {
    visibility.value = { scope: 'DEPARTMENTS', departmentIds: value };
  },
});
const options = computed(() => {
  const available = new Set(props.departments.map(({ value }) => value));
  return [
    ...props.departments,
    ...departmentIds.value
      .filter((id) => !available.has(id))
      .map((id) => ({ label: `未列出的部门（${id}）`, value: id })),
  ];
});
</script>

<template>
  <FormItem label="可见范围" required>
    <Select
      v-model:value="scope"
      :options="scopes"
      :disabled="disabled"
      aria-label="可见范围"
    />
  </FormItem>
  <FormItem v-if="scope === 'DEPARTMENTS'" label="指定部门" required>
    <Select
      v-model:value="departmentIds"
      mode="multiple"
      option-filter-prop="label"
      placeholder="搜索并选择一个或多个部门"
      aria-label="指定部门"
      :options="options"
      :loading="loading"
      :disabled="disabled || loading || !!error"
    />
    <div v-if="error" role="alert" class="mt-2 text-sm text-red-600">
      {{ error }}
      <Button
        type="link"
        size="small"
        :disabled="disabled"
        @click="emit('retry')"
      >
        重试
      </Button>
    </div>
    <div v-else class="mt-2 text-xs text-gray-500">
      仅所选部门的成员可见。需要包含下级部门时，请一并选中。
    </div>
  </FormItem>
</template>
