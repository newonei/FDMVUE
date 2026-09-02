<script lang="ts" setup>
import type { AiModelOption } from '../types';

import { computed } from 'vue';

import { Select, Tag } from 'ant-design-vue';

defineOptions({ name: 'FdmAiGenerationModelPicker' });

const props = withDefaults(
  defineProps<{
    disabled?: boolean;
    loading?: boolean;
    models: readonly AiModelOption[];
    modelValue?: string;
  }>(),
  {
    disabled: false,
    loading: false,
    modelValue: undefined,
  },
);

const emit = defineEmits<{
  'update:modelValue': [value: string | undefined];
}>();

const options = computed(() =>
  props.models.map((model) => ({
    label: `${model.name} · ${model.code}`,
    value: String(model.id),
  })),
);

const selected = computed(() =>
  props.models.find((item) => String(item.id) === props.modelValue),
);
</script>

<template>
  <div class="ai-model-picker">
    <Select
      :disabled="disabled"
      :loading="loading"
      :options="options"
      placeholder="请选择支持结构化输出的模型"
      show-search
      :value="modelValue"
      @update:value="
        emit('update:modelValue', $event ? String($event) : undefined)
      "
    />
    <div v-if="selected" class="ai-model-picker__capabilities">
      <Tag
        v-for="capability in selected.capabilities"
        :key="capability"
        :color="
          capability.toUpperCase() === 'STRUCTURED_OUTPUT'
            ? 'purple'
            : 'default'
        "
      >
        {{ capability }}
      </Tag>
    </div>
  </div>
</template>

<style scoped>
.ai-model-picker {
  display: grid;
  gap: 7px;
}

.ai-model-picker__capabilities {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}
</style>
