<script setup lang="ts">
import { computed, ref, watch } from 'vue';

import { Alert, Input, Modal } from 'ant-design-vue';

import { errorText } from '../data';
import { renamedFileName, splitFileName } from './file-name';

/** 附件改名弹窗：只编辑名称部分，扩展名固定显示在输入框后面 */
const props = defineProps<{
  name?: string;
  open: boolean;
  /** 保存新名称；返回的 Promise 失败时保留弹窗并显示原因 */
  save: (name: string) => unknown;
}>();
const emit = defineEmits<{ 'update:open': [value: boolean] }>();
const base = ref('');
const error = ref('');
const saving = ref(false);
const extension = computed(() => splitFileName(props.name ?? '').extension);

watch(
  () => props.open,
  (open) => {
    if (!open) return;
    base.value = splitFileName(props.name ?? '').base;
    error.value = '';
  },
  { immediate: true },
);

async function confirm() {
  const result = renamedFileName(props.name ?? '', base.value);
  if (!result.name) {
    error.value = result.error ?? '';
    return;
  }
  if (result.name === props.name) {
    emit('update:open', false);
    return;
  }
  saving.value = true;
  error.value = '';
  try {
    await props.save(result.name);
    emit('update:open', false);
  } catch (error_) {
    error.value = errorText(error_);
  } finally {
    saving.value = false;
  }
}
</script>

<template>
  <Modal
    :open="open"
    title="修改文件名称"
    ok-text="保存"
    :confirm-loading="saving"
    :z-index="2100"
    destroy-on-close
    @cancel="emit('update:open', false)"
    @ok="confirm"
  >
    <Input
      v-model:value="base"
      :addon-after="extension || undefined"
      :maxlength="180"
      aria-label="文件名称"
      placeholder="请输入文件名称"
      @press-enter="confirm"
    />
    <p class="rename-hint">只修改显示和下载时的名称，扩展名与文件内容不变。</p>
    <Alert v-if="error" type="error" show-icon :message="error" />
  </Modal>
</template>

<style scoped>
.rename-hint {
  margin: 8px 0;
  font-size: 12px;
  color: var(--ant-color-text-secondary);
}
</style>
