<script setup lang="ts">
import type { BusinessDocumentFile } from '#/api/fdmplatform/business-documents';

import { computed, onBeforeUnmount, ref, watch } from 'vue';

import { downloadFileFromBlobPart } from '@vben/utils';

import { Alert, Button, message, Space, Table } from 'ant-design-vue';

import {
  downloadBusinessDocumentFile,
  getBusinessDocument,
  getBusinessDocumentFiles,
  renameBusinessDocumentFile,
  uploadBusinessDocumentFile,
} from '#/api/fdmplatform/business-documents';
import { newIdempotencyKey } from '#/api/fdmplatform/idempotency';
import {
  ATTACHMENT_ACCEPT,
  ATTACHMENT_FORMAT_TEXT,
  attachmentSize,
  submissionFilesError,
} from '#/api/fdmplatform/submission-files';

import { attachmentTime } from '../../../components/attachment-preview';
import FilePreviewButton from '../../../components/FilePreviewButton.vue';
import RenameFileDialog from '../../../components/RenameFileDialog.vue';
import { errorText } from '../../../data';

/**
 * 不关联合同的采购单附件：存在独立采购单自己的单据附件里，不走合同附件
 * （合同附件按合同编号存取，独立采购单没有合同）。
 */
const props = defineProps<{ orderId: string }>();
const emit = defineEmits<{ busy: [value: boolean] }>();

const items = ref<BusinessDocumentFile[]>([]);
const canUpload = ref(false);
const loading = ref(false);
const uploading = ref(false);
const error = ref('');
const input = ref<HTMLInputElement>();
const dragDepth = ref(0);
const selectionNotice = ref('');
type QueuedFile = {
  error: string;
  expectedVersion?: number;
  file: File;
  key: string;
  status: 'failed' | 'pending' | 'uploading';
};
const queue = ref<QueuedFile[]>([]);
const progress = ref({ completed: 0, failed: 0, total: 0 });
const queueSize = computed(() =>
  attachmentSize(
    queue.value.reduce((total, item) => total + item.file.size, 0),
  ),
);
let contextVersion = 0;

async function load() {
  const version = contextVersion;
  const orderId = props.orderId;
  loading.value = true;
  error.value = '';
  try {
    const result = await getBusinessDocumentFiles(orderId);
    if (version !== contextVersion) return;
    items.value = result.items;
    canUpload.value = result.enabled && result.canUpload;
  } catch (error_) {
    if (version !== contextVersion) return;
    error.value = errorText(error_);
  } finally {
    if (version === contextVersion) loading.value = false;
  }
}
function pick(event: Event) {
  const target = event.target as HTMLInputElement;
  const files = [...(target.files ?? [])];
  target.value = '';
  addFiles(files);
}
function addFiles(files: File[]) {
  if (uploading.value || !canUpload.value || files.length === 0) return;
  const fingerprint = (file: File) =>
    `${file.name}\0${file.size}\0${file.lastModified}`;
  const known = new Set(queue.value.map((item) => fingerprint(item.file)));
  const added = files.filter((file) => {
    const key = fingerprint(file);
    if (known.has(key)) return false;
    known.add(key);
    return true;
  });
  selectionNotice.value = '';
  const validation = submissionFilesError([
    ...queue.value.map((item) => item.file),
    ...added,
  ]);
  if (validation) {
    error.value = validation;
    return;
  }
  queue.value.push(
    ...added.map((file) => ({
      error: '',
      file,
      key: newIdempotencyKey(),
      status: 'pending' as const,
    })),
  );
  error.value = '';
  const duplicates = files.length - added.length;
  if (duplicates) selectionNotice.value = `已跳过 ${duplicates} 个重复文件`;
}
function dragEnter() {
  if (!uploading.value && canUpload.value) dragDepth.value++;
}
function dragLeave() {
  dragDepth.value = Math.max(0, dragDepth.value - 1);
}
function dragOver(event: DragEvent) {
  if (event.dataTransfer) {
    event.dataTransfer.dropEffect =
      !uploading.value && canUpload.value ? 'copy' : 'none';
  }
}
function drop(event: DragEvent) {
  dragDepth.value = 0;
  addFiles([...(event.dataTransfer?.files ?? [])]);
}
function removeQueuedFile(key: string) {
  if (uploading.value) return;
  queue.value = queue.value.filter((item) => item.key !== key);
  error.value = '';
  selectionNotice.value = '';
}
async function uploadQueuedFile(
  item: QueuedFile,
  orderId: string,
  version: number,
): Promise<boolean> {
  for (let attempt = 0; attempt < 2; attempt++) {
    if (version !== contextVersion) return false;
    if (item.expectedVersion === undefined) {
      const document = await getBusinessDocument(orderId);
      if (version !== contextVersion) return false;
      item.expectedVersion = document.version;
    }
    try {
      // The version is part of the server fingerprint. An uncertain result must
      // replay both the original key and body, even if later files changed it.
      await uploadBusinessDocumentFile(orderId, item.file, {
        expectedVersion: item.expectedVersion,
        idempotencyKey: item.key,
      });
      return version === contextVersion;
    } catch (error_) {
      if (
        attempt === 0 &&
        version === contextVersion &&
        errorText(error_).includes('单据已变化，请刷新')
      ) {
        // A definite version rejection made no change; refresh once with a new
        // operation key. Network and unknown failures retain the original body.
        item.key = newIdempotencyKey();
        delete item.expectedVersion;
        continue;
      }
      throw error_;
    }
  }
  return false;
}
async function upload() {
  if (uploading.value || !canUpload.value || queue.value.length === 0) return;
  const validation = submissionFilesError(queue.value.map((item) => item.file));
  if (validation) {
    error.value = validation;
    return;
  }
  const version = contextVersion;
  const orderId = props.orderId;
  const batch = [...queue.value];
  uploading.value = true;
  error.value = '';
  selectionNotice.value = '';
  progress.value = { completed: 0, failed: 0, total: batch.length };
  try {
    for (const item of batch) {
      if (version !== contextVersion) return;
      item.status = 'uploading';
      item.error = '';
      try {
        if (!(await uploadQueuedFile(item, orderId, version))) return;
        progress.value.completed++;
        queue.value = queue.value.filter((entry) => entry.key !== item.key);
      } catch (error_) {
        if (version !== contextVersion) return;
        item.status = 'failed';
        item.error = errorText(error_);
        progress.value.failed++;
      }
    }
    if (progress.value.completed > 0) {
      message.success(`已成功上传 ${progress.value.completed} 个附件`);
    }
    await load();
  } finally {
    if (version === contextVersion) uploading.value = false;
  }
}
async function download(file: BusinessDocumentFile) {
  try {
    const blob = await downloadBusinessDocumentFile(props.orderId, file.id);
    downloadFileFromBlobPart({ source: blob, fileName: file.name });
  } catch (error_) {
    error.value = errorText(error_);
  }
}
const renaming = ref<BusinessDocumentFile>();
const renameOpen = ref(false);
const renameKey = ref('');
function startRename(file: BusinessDocumentFile) {
  renaming.value = file;
  renameKey.value = newIdempotencyKey();
  renameOpen.value = true;
}
async function saveRename(name: string) {
  if (!renaming.value) return;
  await renameBusinessDocumentFile(
    props.orderId,
    renaming.value.id,
    name,
    renameKey.value,
  );
  message.success('文件名称已修改');
  await load();
}
watch(uploading, (value) => emit('busy', value), {
  flush: 'sync',
  immediate: true,
});
watch(
  () => props.orderId,
  () => {
    contextVersion++;
    items.value = [];
    queue.value = [];
    dragDepth.value = 0;
    selectionNotice.value = '';
    progress.value = { completed: 0, failed: 0, total: 0 };
    uploading.value = false;
    canUpload.value = false;
    void load();
  },
  { immediate: true },
);
onBeforeUnmount(() => {
  contextVersion++;
  emit('busy', false);
});
</script>

<template>
  <section class="files" aria-label="补充附件">
    <div class="section-head">
      <div>
        <h3>补充附件</h3>
        <p class="muted">报价、图纸、沟通资料等，统一保存在本采购单下。</p>
      </div>
      <Button
        size="small"
        :disabled="uploading"
        :loading="loading"
        @click="load"
      >
        刷新
      </Button>
    </div>
    <Alert v-if="error" type="error" :message="error" show-icon />
    <input
      ref="input"
      type="file"
      aria-label="选择采购单补充附件"
      :accept="ATTACHMENT_ACCEPT"
      multiple
      hidden
      :disabled="uploading || !canUpload"
      @change="pick"
    />
    <button
      type="button"
      class="dropzone"
      :class="{ 'is-dragging': dragDepth > 0 }"
      :disabled="!canUpload || uploading"
      @click="input?.click()"
      @dragenter.prevent="dragEnter"
      @dragleave.prevent="dragLeave"
      @dragover.prevent="dragOver"
      @drop.prevent="drop"
    >
      <svg
        class="upload-icon"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="1.5"
        aria-hidden="true"
      >
        <path
          d="M12 16V4m-4 4 4-4 4 4M4 15v4a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-4"
        />
      </svg>
      <span class="dropzone-copy">
        <span class="dropzone-title">
          <span class="select-link">{{
            queue.length ? '继续选择' : '选择文件'
          }}</span>
          <span>，或将文件拖到这里</span>
        </span>
        <span class="muted">
          {{ ATTACHMENT_FORMAT_TEXT }}；每次最多 10 个，单个及合计不超过 1 GB。
        </span>
      </span>
    </button>
    <span v-if="selectionNotice" role="status" class="muted">{{
      selectionNotice
    }}</span>
    <div v-if="queue.length" class="queue">
      <div class="queue-head">
        <div class="queue-summary">
          <span>待上传 {{ queue.length }} 个文件</span>
          <span class="muted">· 共 {{ queueSize }}</span>
        </div>
        <Button
          type="primary"
          :disabled="!canUpload"
          :loading="uploading"
          @click="upload"
        >
          上传（{{ queue.length }} 个）
        </Button>
      </div>
      <div v-for="item in queue" :key="item.key" class="queued-file">
        <span class="file-name" :title="item.file.name">{{
          item.file.name
        }}</span>
        <span class="muted">{{ attachmentSize(item.file.size) }}</span>
        <span v-if="item.status === 'uploading'">上传中</span>
        <span v-else-if="item.status === 'failed'" class="failed">
          上传失败：{{ item.error }}
        </span>
        <span v-else class="muted">待上传</span>
        <Button
          type="link"
          size="small"
          :disabled="uploading"
          @click="removeQueuedFile(item.key)"
        >
          移除
        </Button>
      </div>
    </div>
    <div v-if="progress.total" role="status" class="upload-result">
      {{ uploading ? '上传进度' : '本次上传结果' }}：{{
        progress.completed + progress.failed
      }}/{{ progress.total }}，成功 {{ progress.completed }} 个，失败
      {{ progress.failed }} 个<span v-if="!uploading && progress.failed">
        ；失败文件已保留，可点击上传重试。
      </span>
    </div>
    <div class="uploaded-head">已上传附件共 {{ items.length }} 个</div>
    <Table
      class="attachment-table"
      size="small"
      table-layout="fixed"
      row-key="id"
      :data-source="items"
      :loading="loading"
      :pagination="false"
      :columns="[
        { title: '附件名称', key: 'name' },
        { title: '文件信息', key: 'info', width: 155 },
        { title: '操作', key: 'action', width: 145 },
      ]"
    >
      <template #emptyText>
        {{
          canUpload
            ? '暂无补充附件，可在上方添加报价、图纸等资料'
            : '暂无补充附件'
        }}
      </template>
      <template #bodyCell="{ column, record }">
        <span
          v-if="column.key === 'name'"
          class="file-name"
          :title="record.name"
        >
          {{ record.name }}
        </span>
        <div v-else-if="column.key === 'info'" class="file-info">
          <span>{{ attachmentSize(Number(record.size)) }}</span>
          <span class="muted">{{ attachmentTime(record.createdAt) }}</span>
        </div>
        <Space v-else-if="column.key === 'action'" :size="0" :wrap="true">
          <FilePreviewButton
            :name="record.name"
            size="small"
            :load="() => downloadBusinessDocumentFile(orderId, record.id)"
          />
          <Button
            v-if="canUpload"
            type="link"
            size="small"
            @click="startRename(record as BusinessDocumentFile)"
          >
            改名
          </Button>
          <Button
            type="link"
            size="small"
            @click="download(record as BusinessDocumentFile)"
          >
            下载
          </Button>
        </Space>
      </template>
    </Table>
    <RenameFileDialog
      v-model:open="renameOpen"
      :name="renaming?.name"
      :save="saveRename"
    />
  </section>
</template>

<style scoped>
.files {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 16px;
  border: 1px solid hsl(var(--border));
  border-radius: 10px;
}

.section-head,
.queue-head,
.queue-summary {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  align-items: center;
  justify-content: space-between;
}

.section-head h3 {
  margin: 0 0 4px;
  font-size: 14px;
  font-weight: 600;
}

.section-head p {
  margin: 0;
}

.dropzone {
  display: flex;
  gap: 14px;
  align-items: center;
  width: 100%;
  padding: 20px;
  text-align: left;
  cursor: pointer;
  background: hsl(var(--primary) / 3%);
  border: 1px dashed hsl(var(--primary) / 35%);
  border-radius: 8px;
  transition:
    background 0.15s,
    border-color 0.15s;
}

.dropzone:hover:not(:disabled),
.dropzone.is-dragging,
.dropzone:focus-visible {
  background: hsl(var(--primary) / 8%);
  border-color: hsl(var(--primary));
}

.dropzone:focus-visible {
  outline: 2px solid hsl(var(--primary) / 30%);
  outline-offset: 2px;
}

.dropzone:disabled {
  cursor: not-allowed;
  opacity: 0.55;
}

.upload-icon {
  flex-shrink: 0;
  width: 30px;
  height: 30px;
  color: hsl(var(--primary));
}

.dropzone-copy,
.file-info {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.dropzone-title {
  font-size: 14px;
}

.select-link {
  font-weight: 500;
  color: hsl(var(--primary));
}

.queue {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 12px;
  background: hsl(var(--muted) / 40%);
  border-radius: 8px;
}

.queued-file {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  align-items: center;
}

.file-name {
  min-width: 0;
  overflow-wrap: anywhere;
}

.queued-file > .file-name {
  flex: 1;
}

.upload-result {
  font-size: 12px;
}

.uploaded-head {
  margin-top: 4px;
  font-weight: 500;
}

.attachment-table :deep(.ant-table-cell) {
  vertical-align: middle;
}

.attachment-table :deep(.ant-btn-link) {
  padding-inline: 5px;
}

.failed {
  color: #ff4d4f;
  overflow-wrap: anywhere;
}

.muted {
  font-size: 12px;
  color: hsl(var(--muted-foreground));
}
</style>
