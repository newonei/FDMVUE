<script setup lang="ts">
import type { BusinessDocumentFile } from '#/api/fdmplatform/business-documents';

import { ref, watch } from 'vue';

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
import { attachmentSize } from '#/api/fdmplatform/submission-files';

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

async function load() {
  loading.value = true;
  error.value = '';
  try {
    const result = await getBusinessDocumentFiles(props.orderId);
    items.value = result.items;
    canUpload.value = result.enabled && result.canUpload;
  } catch (error_) {
    error.value = errorText(error_);
  } finally {
    loading.value = false;
  }
}
async function pick(event: Event) {
  const target = event.target as HTMLInputElement;
  const file = target.files?.[0];
  target.value = '';
  if (!file) return;
  uploading.value = true;
  error.value = '';
  try {
    const document = await getBusinessDocument(props.orderId);
    await uploadBusinessDocumentFile(props.orderId, file, {
      expectedVersion: document.version,
      idempotencyKey: crypto.randomUUID(),
    });
    message.success('附件已上传');
    await load();
  } catch (error_) {
    error.value = errorText(error_);
  } finally {
    uploading.value = false;
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
watch(() => props.orderId, load, { immediate: true });
</script>

<template>
  <div class="files">
    <Alert v-if="error" type="error" :message="error" show-icon />
    <div class="bar">
      <input ref="input" type="file" hidden @change="pick" />
      <Button
        :disabled="!canUpload"
        :loading="uploading"
        @click="input?.click()"
      >
        上传附件
      </Button>
      <span class="muted">不关联合同的采购单，附件保存在本采购单下</span>
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
  gap: 10px;
  align-items: center;
}

.muted {
  font-size: 12px;
  color: hsl(var(--muted-foreground));
}
</style>
