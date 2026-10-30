<script setup lang="ts">
import { computed, onBeforeUnmount, ref } from 'vue';

import { Button, message, Modal } from 'ant-design-vue';

import { errorText } from '../data';
import { filePreviewKind } from './file-preview';

/** PDF / 图片附件直接在弹窗里查看，不用先下载；其他格式不显示按钮。待上传的本地文件传 file。 */
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
    // 下载接口常返回 octet-stream，PDF 需标明类型浏览器才会内嵌显示
    url.value = URL.createObjectURL(
      kind.value === 'pdf'
        ? new Blob([blob], { type: 'application/pdf' })
        : blob,
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
      <img
        v-if="kind === 'image' && url"
        :src="url"
        :alt="name"
        class="file-preview-image"
      />
      <iframe
        v-else-if="url"
        :src="url"
        :title="name"
        class="file-preview-pdf"
      ></iframe>
    </Modal>
  </template>
</template>

<style scoped>
.file-preview-image {
  display: block;
  max-width: 100%;
  height: auto;
  margin: 0 auto;
}

.file-preview-pdf {
  width: 100%;
  height: 75vh;
  border: 0;
}
</style>
