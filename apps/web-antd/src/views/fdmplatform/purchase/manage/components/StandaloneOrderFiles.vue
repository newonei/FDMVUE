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

const items = ref<BusinessDocumentFile[]>([]);
const canUpload = ref(false);
const loading = ref(false);
const uploading = ref(false);
const error = ref('');
const input = ref<HTMLInputElement>();
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
  if (uploading.value || !canUpload.value || files.length === 0) return;
  const validation = submissionFilesError([
    ...queue.value.map((item) => item.file),
    ...files,
  ]);
  if (validation) {
    error.value = validation;
    return;
  }
  queue.value.push(
    ...files.map((file) => ({
      error: '',
      file,
      key: newIdempotencyKey(),
      status: 'pending' as const,
    })),
  );
  error.value = '';
}
function removeQueuedFile(key: string) {
  if (uploading.value) return;
  queue.value = queue.value.filter((item) => item.key !== key);
  error.value = '';
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
watch(
  () => props.orderId,
  () => {
    contextVersion++;
    items.value = [];
    queue.value = [];
    progress.value = { completed: 0, failed: 0, total: 0 };
    uploading.value = false;
    canUpload.value = false;
    void load();
  },
  { immediate: true },
);
onBeforeUnmount(() => {
  contextVersion++;
});
</script>

<template>
  <div class="files">
    <Alert v-if="error" type="error" :message="error" show-icon />
    <div class="bar">
      <input
        ref="input"
        type="file"
        :accept="ATTACHMENT_ACCEPT"
        multiple
        hidden
        :disabled="uploading || !canUpload"
        @change="pick"
      />
      <Button :disabled="!canUpload || uploading" @click="input?.click()">
        {{ queue.length ? '继续选择' : '选择文件' }}
      </Button>
      <Button
        type="primary"
        :disabled="!canUpload || queue.length === 0"
        :loading="uploading"
        @click="upload"
      >
        上传<span v-if="queue.length">（{{ queue.length }} 个）</span>
      </Button>
      <Button :disabled="uploading" :loading="loading" @click="load">
        刷新
      </Button>
      <span>已上传附件共 {{ items.length }} 个</span>
    </div>
    <span class="muted">
      不关联合同的采购单，附件保存在本采购单下。支持 AI、PLT
      等设计文件，每次最多 10 个，单个及单次总大小不超过 1 GB。
    </span>
    <div v-if="queue.length" class="queue">
      <span>待上传 {{ queue.length }} 个文件，共 {{ queueSize }}</span>
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
    <div v-if="progress.total" role="status">
      {{ uploading ? '上传进度' : '本次上传结果' }}：{{
        progress.completed + progress.failed
      }}/{{ progress.total }}，成功 {{ progress.completed }} 个，失败
      {{ progress.failed }} 个<span v-if="!uploading && progress.failed">
        ；失败文件已保留，可点击上传重试。
      </span>
    </div>
    <Table
      size="small"
      row-key="id"
      :data-source="items"
      :loading="loading"
      :pagination="false"
      :columns="[
        { title: '文件', key: 'name', ellipsis: true },
        { title: '大小', key: 'size', width: 90 },
        { title: '上传时间', key: 'createdAt', width: 140 },
        { title: '操作', key: 'action', width: 160 },
      ]"
    >
      <template #emptyText>还没有附件</template>
      <template #bodyCell="{ column, record }">
        <span v-if="column.key === 'name'" :title="record.name">
          {{ record.name }}
        </span>
        <span v-else-if="column.key === 'size'">
          {{ attachmentSize(Number(record.size)) }}
        </span>
        <span v-else-if="column.key === 'createdAt'">
          {{ attachmentTime(record.createdAt) }}
        </span>
        <Space v-else-if="column.key === 'action'" :size="0">
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
  </div>
</template>

<style scoped>
.files {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.bar {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  align-items: center;
}

.queue {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.queued-file {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  align-items: center;
}

.file-name {
  overflow-wrap: anywhere;
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
