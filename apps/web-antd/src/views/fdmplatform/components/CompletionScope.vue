<script setup lang="ts">
import type { CompletionScope } from '../documents/completion-scope';

import { Button, Space } from 'ant-design-vue';

defineProps<{ pendingTotal?: number }>();
const emit = defineEmits<{ change: [value: CompletionScope] }>();
const scope = defineModel<CompletionScope>({ required: true });
const options: { label: string; value: CompletionScope }[] = [
  { value: 'current', label: '当前业务' },
  { value: 'pending', label: '待补齐历史单据' },
  { value: 'all', label: '全部' },
];
function choose(value: CompletionScope) {
  if (value === scope.value) return;
  scope.value = value;
  emit('change', value);
}
</script>
<template>
  <Space
    v-if="(pendingTotal ?? 0) > 0 || scope !== 'current'"
    :size="0"
    class="completion-scope"
    title="金智导入后仍需补齐资料的单据单独排队，不混入日常办理列表"
  >
    <Button
      v-for="option in options"
      :key="option.value"
      :type="scope === option.value ? 'primary' : 'default'"
      :aria-pressed="scope === option.value"
      @click="choose(option.value)"
    >
      {{ option.label
      }}{{
        option.value === 'pending' && pendingTotal ? ` ${pendingTotal}` : ''
      }}
    </Button>
  </Space>
</template>
