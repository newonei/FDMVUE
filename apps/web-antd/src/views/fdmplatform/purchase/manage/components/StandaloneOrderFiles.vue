<script setup lang="ts">
import type { BusinessDocumentFile } from '#/api/fdmplatform/business-documents';

import { ref, watch } from 'vue';

import { downloadFileFromBlobPart } from '@vben/utils';

import { Alert, Button, message, Table } from 'ant-design-vue';

import {
  downloadBusinessDocumentFile,
  getBusinessDocument,
  getBusinessDocumentFiles,
  uploadBusinessDocumentFile,
} from '#/api/fdmplatform/business-documents';

import FilePreviewButton from '../../../components/FilePreviewButton.vue';
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
        { title: '文件', key: 'name' },
        { title: '上传时间', dataIndex: 'createdAt' },
      ]"
    >
      <template #emptyText>还没有附件</template>
      <template #bodyCell="{ column, record }">
        <template v-if="column.key === 'name'">
          <Button
            type="link"
            size="small"
            @click="download(record as BusinessDocumentFile)"
          >
            {{ record.name }}
          </Button>
          <FilePreviewButton
            size="small"
            :name="record.name"
            :load="() => downloadBusinessDocumentFile(orderId, record.id)"
          />
        </template>
      </template>
    </Table>
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
