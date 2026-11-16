<script setup lang="ts">
import { computed, onBeforeUnmount, ref } from 'vue';

import { Button, message, Modal } from 'ant-design-vue';

import { FilePreview } from '#/components/file-preview';

import { errorText } from '../data';
import { previewMimeType } from './attachment-preview';
import { filePreviewKind } from './file-preview';

/** 单据附件在弹窗里查看，图片支持放大；待上传的本地文件传 file。 */
const props = withDefaults(
  defineProps<{
    disabled?: boolean;
    file?: Blob;
    load?: () => Promise<Blob>;
    name: string;
    size?: 'middle' | 'small';
    type?: 'default' | 'link';
  }>(),
  {
    disabled: false,
    file: undefined,
    load: undefined,
    size: undefined,
    type: 'link',
  },
);
const kind = computed(() => filePreviewKind(props.name));
const open = ref(false);
const loading = ref(false);
const url = ref('');
let sequence = 0;

function release() {
  if (url.value) URL.revokeObjectURL(url.value);
  url.value = '';
}
async function show() {
  if (!kind.value || loading.value) return;
  const run = ++sequence;
  loading.value = true;
  try {
    const blob = props.file ?? (await props.load?.());
    if (!blob) return;
    if (run !== sequence) return;
    release();
    // 下载接口常返回 octet-stream，补上文件类型供浏览器内嵌显示
    const mimeType = previewMimeType(props.name);
    url.value = URL.createObjectURL(
      blob.type === mimeType ? blob : new Blob([blob], { type: mimeType }),
    );
    open.value = true;
  } catch (error) {
    if (run === sequence) message.error(errorText(error));
  } finally {
    if (run === sequence) loading.value = false;
  }
}
function close() {
  open.value = false;
  release();
}
onBeforeUnmount(() => {
  sequence++;
  release();
});
</script>

<template>
  <template v-if="kind">
    <Button
      :type="type"
      :size="size"
      :disabled="disabled"
      :loading="loading"
      @click.stop="show"
    >
      预览
    </Button>
    <Modal
      :open="open"
      :title="name"
      :footer="null"
      width="min(1000px, 95vw)"
      destroy-on-close
      @cancel="close"
    >
      <FilePreview v-if="url" :url="url" :file-name="name" />
    </Modal>
  </template>
</template>
