<script setup lang="ts">
import { Button, Dropdown, Menu } from 'ant-design-vue';

/**
 * 采购单右上角「导出」（金智同款）：PDF、Word、Excel 都按金智采购单模板生成，每次导出存一版。
 * 下单资料没确认时不能导出，点了会提示去确认。
 */
defineProps<{ disabled?: boolean; ready: boolean; saving: boolean }>();
const emit = defineEmits<{
  export: [format: 'DOCX' | 'PDF' | 'XLSX'];
  files: [];
  notReady: [];
}>();
const items = [
  { key: 'PDF', label: '导出为 PDF' },
  { key: 'DOCX', label: '导出为 Word' },
  { key: 'XLSX', label: '导出为 Excel' },
  { type: 'divider' as const },
  { key: 'files', label: '导出记录与盖章件' },
];
function pick(key: string) {
  if (key === 'files') emit('files');
  else emit('export', key as 'DOCX' | 'PDF' | 'XLSX');
}
</script>

<template>
  <Dropdown :disabled="disabled || saving" :trigger="['click']">
    <Button :loading="saving" @click="!ready && emit('notReady')">导出</Button>
    <template #overlay>
      <Menu
        v-if="ready"
        :items="items"
        @click="(info: { key: string | number }) => pick(String(info.key))"
      />
      <Menu
        v-else
        :items="[{ key: 'files', label: '导出记录与盖章件' }]"
        @click="emit('files')"
      />
    </template>
  </Dropdown>
</template>
