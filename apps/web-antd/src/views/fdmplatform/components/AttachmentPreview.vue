<script setup lang="ts">
import { onBeforeUnmount, ref } from 'vue';

import { Button, Modal } from 'ant-design-vue';

import { FilePreview } from '#/components/file-preview';

import { previewMimeType } from './attachment-preview';

/** 单据附件复用全局预览：表格直接阅读，文档/演示文稿使用缓存版式预览。 */
const emit = defineEmits<{ download: [blob: Blob, name: string] }>();
const open = ref(false);
const url = ref('');
const name = ref('');
let source: Blob | undefined;

function revoke() {
  if (url.value) URL.revokeObjectURL(url.value);
  url.value = '';
  source = undefined;
}
function show(blob: Blob, fileName: string) {
  revoke();
  // 下载接口常返回 octet-stream，按扩展名补上类型浏览器才会内嵌显示
  const type = previewMimeType(fileName) ?? blob.type;
  url.value = URL.createObjectURL(
    blob.type === type ? blob : new Blob([blob], { type }),
  );
  source = blob;
  name.value = fileName;
  open.value = true;
}
function close() {
  open.value = false;
}
onBeforeUnmount(revoke);
defineExpose({ close, show });
</script>

<template>
  <Modal
    v-model:open="open"
    :title="name"
    :footer="null"
    :z-index="2100"
    width="96vw"
    :style="{ top: '20px' }"
    destroy-on-close
    @after-close="!open && revoke()"
  >
    <FilePreview v-if="url" :url="url" :file-name="name" downloadable />
    <div class="mt-3 text-right">
      <Button @click="source && emit('download', source, name)">下载</Button>
    </div>
  </Modal>
</template>
