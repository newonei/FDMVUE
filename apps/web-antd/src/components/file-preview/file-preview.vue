<script lang="ts" setup>
import { computed, defineAsyncComponent, ref, shallowRef, watch } from 'vue';

import { Alert, Button, Image, Spin } from 'ant-design-vue';

import { convertOfficePreview } from '#/api/file-preview';

import { resolvePreview } from './formats';

defineOptions({ name: 'FilePreview' });
const SpreadsheetPreview = defineAsyncComponent(() => import('./spreadsheet-preview.vue').then((module) => module.default));
const props = defineProps<{
  downloadable?: boolean;
  fileName?: string;
  fileType?: string;
  url: string;
}>();
const format = computed(() => resolvePreview(props.fileName || props.url, props.fileType));
const displayUrl = ref('');
const text = ref('');
const loading = ref(false);
const previewError = ref('');
const retry = ref(0);
const MAX_OFFICE_BYTES = 50 * 1024 * 1024;
const MAX_TEXT_BYTES = 2 * 1024 * 1024;
const textTruncated = ref(false);
const spreadsheetBlob = shallowRef<Blob>();
const forceLayout = ref(false);
const spreadsheetExtensions = new Set(['xls', 'xlsx', 'xlsm', 'xlt', 'xltx', 'xltm', 'ods', 'csv', 'tsv']);
const isSpreadsheet = computed(() => spreadsheetExtensions.has(format.value.extension));
const container = ref<HTMLElement>();
let source: { blob: Blob; key: string } | undefined;

watch(() => [props.url, props.fileName, props.fileType], () => {
  forceLayout.value = false;
  source = undefined;
}, { flush: 'sync' });

async function toggleFullscreen() {
  if (document.fullscreenElement === container.value) await document.exitFullscreen();
  else await container.value?.requestFullscreen?.();
}

watch(
  () => [props.url, props.fileName, props.fileType, retry.value, forceLayout.value] as const,
  async ([url], _previous, onCleanup) => {
    const controller = new AbortController();
    let objectUrl = '';
    onCleanup(() => {
      controller.abort();
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    });
    previewError.value = '';
    text.value = '';
    textTruncated.value = false;
    loading.value = false;
    displayUrl.value = '';
    spreadsheetBlob.value = undefined;
    const { kind, extension } = format.value;
    if (!url || kind === 'unsupported') return;
    if (!/^(https?:|blob:|\/)/i.test(url)) {
      previewError.value = '文件预览地址无效';
      return;
    }
    if (['image', 'audio', 'video'].includes(kind)) {
      displayUrl.value = url;
      return;
    }
    loading.value = true;
    try {
      const key = JSON.stringify([url, props.fileName, props.fileType]);
      let blob = source?.key === key ? source.blob : undefined;
      if (!blob) {
        const response = await fetch(url, { signal: controller.signal });
        if (!response.ok) throw new Error(`文件读取失败（HTTP ${response.status}）`);
        if ((kind === 'office' || isSpreadsheet.value) && Number(response.headers.get('content-length')) > MAX_OFFICE_BYTES) {
          throw new Error('Office 文件在线预览最大支持 50 MB，请拆分文件后预览');
        }
        blob = await response.blob();
      }
      if (controller.signal.aborted) return;
      if (kind === 'office' || isSpreadsheet.value) {
        if (blob.size > MAX_OFFICE_BYTES) throw new Error('Office 文件在线预览最大支持 50 MB，请拆分文件后预览');
        source = { blob, key };
      }
      if (isSpreadsheet.value && !forceLayout.value) {
        spreadsheetBlob.value = blob;
        return;
      }
      if (kind === 'text' && !forceLayout.value) {
        textTruncated.value = blob.size > MAX_TEXT_BYTES;
        const buffer = await blob.slice(0, MAX_TEXT_BYTES).arrayBuffer();
        const bytes = new Uint8Array(buffer);
        let encoding = 'utf-8';
        if (bytes[0] === 0xff && bytes[1] === 0xfe) encoding = 'utf-16le';
        else if (bytes[0] === 0xfe && bytes[1] === 0xff) encoding = 'utf-16be';
        let content: string;
        try { content = new TextDecoder(encoding, { fatal: true }).decode(buffer); }
        catch { content = new TextDecoder('gb18030').decode(buffer); }
        if (!controller.signal.aborted) text.value = content;
        return;
      }
      if (kind === 'office' || (isSpreadsheet.value && forceLayout.value)) {
        if (blob.size > MAX_OFFICE_BYTES) throw new Error('Office 文件在线预览最大支持 50 MB，请拆分文件后预览');
        blob = await convertOfficePreview(new File([blob], `preview.${extension}`), controller.signal);
        if (controller.signal.aborted) return;
        if (!blob.type.toLowerCase().includes('application/pdf')) throw new Error('文档转换未返回有效的 PDF，请重试');
      }
      objectUrl = URL.createObjectURL(new Blob([blob], { type: 'application/pdf' }));
      displayUrl.value = objectUrl;
    } catch (error) {
      if (!controller.signal.aborted) {
        const detail = error as { message?: string; msg?: string };
        previewError.value = detail?.msg || detail?.message || '文件预览失败，请重试';
      }
    } finally {
      if (!controller.signal.aborted) loading.value = false;
    }
  },
  { immediate: true },
);
</script>

<template>
  <div ref="container" class="file-preview-shell flex min-h-[360px] w-full flex-col overflow-hidden rounded border border-solid border-border bg-background">
    <div v-if="format.kind !== 'unsupported'" class="flex w-full items-center justify-between gap-3 border-b border-border px-3 py-2 text-xs text-muted-foreground">
      <span class="min-w-0 truncate">{{ isSpreadsheet && !forceLayout ? '表格阅读' : '附件预览' }}</span>
      <div class="flex shrink-0 items-center gap-2">
        <Button v-if="isSpreadsheet && forceLayout" size="small" @click="forceLayout = false">返回表格</Button>
        <Button v-if="container?.requestFullscreen" size="small" @click="toggleFullscreen">全屏阅读</Button>
      </div>
    </div>
    <div v-if="loading" class="flex min-h-[360px] items-center justify-center">
      <Spin :tip="format.kind === 'office' && (!isSpreadsheet || forceLayout) ? '正在准备文档预览…' : '正在读取文件…'" />
    </div>
    <template v-else-if="previewError">
      <Alert :message="previewError" show-icon type="warning" />
      <Button class="mt-3" @click="retry++">重试</Button>
    </template>
    <SpreadsheetPreview v-else-if="spreadsheetBlob" :blob="spreadsheetBlob" :file-name="fileName || `preview.${format.extension}`" @fallback="forceLayout = true" />
    <Image v-else-if="format.kind === 'image' && displayUrl" class="h-[520px] w-full object-contain" :src="displayUrl" />
    <iframe v-else-if="(['pdf', 'office'].includes(format.kind) || forceLayout) && displayUrl" class="h-[74vh] min-h-[520px] w-full border-0 bg-background" :src="displayUrl" title="文件在线预览"></iframe>
    <template v-else-if="format.kind === 'text'">
      <Alert v-if="textTruncated" message="文件较大，仅展示前 2 MB 内容" type="info" class="w-full" />
      <pre class="m-0 max-h-[70vh] min-h-[360px] w-full overflow-auto whitespace-pre-wrap break-words bg-background p-4 text-sm">{{ text || '（空文件）' }}</pre>
    </template>
    <video v-else-if="format.kind === 'video' && displayUrl" class="h-[520px] w-full" controls :src="displayUrl">当前浏览器不支持该视频编码</video>
    <audio v-else-if="format.kind === 'audio' && displayUrl" class="w-[min(560px,90%)]" controls :src="displayUrl">当前浏览器不支持该音频编码</audio>
    <Alert v-else :closable="false" :message="downloadable ? '该格式暂不支持在线预览，可下载原文件查看' : '该格式暂不支持在线预览'" show-icon type="info" />
  </div>
</template>

<style scoped>
.file-preview-shell:fullscreen { overflow: auto; border-radius: 0; }
.file-preview-shell:fullscreen iframe { height: calc(100vh - 48px); }
.file-preview-shell:fullscreen :deep(.spreadsheet-frame) { height: calc(100vh - 235px); }
</style>
