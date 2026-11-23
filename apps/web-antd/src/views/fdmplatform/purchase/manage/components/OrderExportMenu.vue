<script setup lang="ts">
import { computed } from 'vue';

import { Button, Dropdown, Menu } from 'ant-design-vue';

const props = defineProps<{
  disabled?: boolean;
  ready: boolean;
  saving: boolean;
  unconfirmed: boolean;
}>();
const emit = defineEmits<{
  export: [format: 'PDF' | 'XLSX'];
  files: [];
  notReady: [];
}>();
const items = computed(() => [
  ...(props.ready
    ? [
        {
          key: 'PDF',
          label: props.unconfirmed ? '导出未确认稿（PDF）' : '导出为 PDF',
        },
        {
          key: 'XLSX',
          label: props.unconfirmed ? '导出未确认稿（Excel）' : '导出为 Excel',
        },
        { type: 'divider' as const },
      ]
    : []),
  { key: 'files', label: '导出记录与盖章件' },
]);
function pick(key: string) {
  if (key === 'files') emit('files');
  else if (key === 'PDF' || key === 'XLSX') emit('export', key);
}
</script>

<template>
  <Dropdown :disabled="disabled || saving" :trigger="['click']">
    <Button :loading="saving" @click="!ready && emit('notReady')">导出</Button>
    <template #overlay>
      <Menu
        :items="items"
        @click="(info: { key: string | number }) => pick(String(info.key))"
      />
    </template>
  </Dropdown>
</template>
