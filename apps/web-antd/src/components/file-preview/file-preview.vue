<script lang="ts" setup>
import { computed, ref, watch } from 'vue';

import { Alert, Image, Spin } from 'ant-design-vue';

defineOptions({ name: 'FilePreview' });

const props = defineProps<{
  downloadable?: boolean;
  fileName?: string;
  fileType?: string;
  url: string;
}>();

const IMAGE_EXTENSIONS = new Set(['bmp', 'gif', 'jpeg', 'jpg', 'png', 'svg', 'webp']);
const IFRAME_EXTENSIONS = new Set(['pdf', 'txt']);
const VIDEO_EXTENSIONS = new Set(['m4v', 'mov', 'mp4', 'ogg', 'webm']);
const AUDIO_EXTENSIONS = new Set(['aac', 'flac', 'm4a', 'mp3', 'wav']);

const declaredType = computed(() => props.fileType?.trim().toLowerCase().replace(/^\./, '') || '');
const extension = computed(() => {
  if (declaredType.value && !declaredType.value.includes('/')) {
    return declaredType.value;
  }
  const path = (props.fileName || props.url).split(/[?#]/)[0]!;
  const index = path.lastIndexOf('.');
  return index >= 0 ? path.slice(index + 1).toLowerCase() : '';
});
const previewType = computed(() => {
  if (declaredType.value.startsWith('image/')) return 'image';
  if (declaredType.value === 'application/pdf' || declaredType.value === 'text/plain') {
    return 'iframe';
  }
  if (declaredType.value.startsWith('video/')) return 'video';
  if (declaredType.value.startsWith('audio/')) return 'audio';
  if (IMAGE_EXTENSIONS.has(extension.value)) return 'image';
  if (IFRAME_EXTENSIONS.has(extension.value)) return 'iframe';
  if (VIDEO_EXTENSIONS.has(extension.value)) return 'video';
  if (AUDIO_EXTENSIONS.has(extension.value)) return 'audio';
  return 'unsupported';
});
const unsupportedTitle = computed(() =>
  props.downloadable
    ? '当前文件格式暂不支持在线预览，可使用下载功能查看'
    : '当前文件格式暂不支持在线预览，且当前账号没有下载权限'
);
const displayUrl = ref('');
const loading = ref(false);
const previewError = ref('');
watch(
  () => [props.url, previewType.value] as const,
  async ([url, type], _previous, onCleanup) => {
    const controller = new AbortController();
    let objectUrl = '';
    onCleanup(() => {
      controller.abort();
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    });
    previewError.value = '';
    loading.value = false;
    displayUrl.value = url;
    // 普通上传地址可能返回 attachment / octet-stream，PDF 转成本地 URL 后才能内嵌。
    if (type !== 'iframe' || !/^(https?:|\/)/i.test(url)) return;
    displayUrl.value = '';
    loading.value = true;
    try {
      const response = await fetch(url, { signal: controller.signal });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const blob = await response.blob();
      if (controller.signal.aborted) return;
      const mimeType = extension.value === 'txt' || declaredType.value === 'text/plain'
        ? 'text/plain'
        : 'application/pdf';
      objectUrl = URL.createObjectURL(new Blob([blob], { type: mimeType }));
      displayUrl.value = objectUrl;
    } catch {
      if (!controller.signal.aborted) previewError.value = '文件预览加载失败，请使用下载功能查看原文件';
    } finally {
      if (!controller.signal.aborted) loading.value = false;
    }
  },
  { immediate: true },
);
</script>

<template>
  <div
    class="flex min-h-[360px] items-center justify-center overflow-hidden rounded border border-solid border-border bg-accent"
  >
    <Spin v-if="loading" tip="正在加载文件…" />
    <Alert v-else-if="previewError" :message="previewError" show-icon type="warning" />
    <Image v-if="previewType === 'image'" class="h-[520px] w-full object-contain" :src="url" />
    <iframe
      v-else-if="previewType === 'iframe' && displayUrl"
      class="h-[620px] w-full border-0 bg-background"
      :src="displayUrl"
      title="文件在线预览"
    ></iframe>
    <video v-else-if="previewType === 'video'" class="h-[520px] w-full" controls :src="url">
      当前浏览器不支持视频预览
    </video>
    <audio v-else-if="previewType === 'audio'" class="w-[min(560px,90%)]" controls :src="url">
      当前浏览器不支持音频预览
    </audio>
    <Alert v-else-if="!loading && !previewError" :closable="false" :message="unsupportedTitle" show-icon type="info" />
  </div>
</template>
