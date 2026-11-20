<script setup lang="ts">
import type { Ref } from 'vue';

import type {
  AttachmentTarget,
  AttachmentView,
  ContractAttachment,
  Directory,
} from '#/api/fdmplatform';

import { computed, inject, onBeforeUnmount, reactive, ref, watch } from 'vue';

import { Upload } from '@vben/icons';
import { useUserStore } from '@vben/stores';
import { downloadFileFromBlobPart } from '@vben/utils';

import {
  Alert,
  Button,
  Empty,
  message,
  Select,
  Space,
  Table,
} from 'ant-design-vue';

import {
  downloadAttachment,
  newIdempotencyKey,
  renameAttachment,
  uploadAttachment,
} from '#/api/fdmplatform';
import {
  ATTACHMENT_ACCEPT,
  ATTACHMENT_FORMAT_TEXT,
  attachmentSize,
  submissionFilesError,
} from '#/api/fdmplatform/submission-files';

import { errorText } from '../data';
import { personLabel } from '../directory';
import { attachmentTime, previewMimeType } from './attachment-preview';
import AttachmentPreview from './AttachmentPreview.vue';
import { contractAttachmentCategories } from './contract-files';
import RenameFileDialog from './RenameFileDialog.vue';

const props = defineProps<{
  categories: string[];
  contractId: string;
  /** 打开时默认选中的资料分类（如回款单据默认「回款凭证」） */
  defaultCategory?: string;
  error: string;
  loading: boolean;
  target?: AttachmentTarget;
  variant?: 'purchase';
  view?: AttachmentView;
}>();
const emit = defineEmits<{ busy: [value: boolean]; refresh: [] }>();
const category = ref<string>();
/** 单据详情提供的人员目录，用于显示上传人；其它入口没有时不显示该列 */
const injectedDirectory = inject<Ref<Directory | undefined> | undefined>(
  'fdmPlatformDirectory',
  undefined,
);
const directory = computed(() => injectedDirectory?.value);
const preview = ref<InstanceType<typeof AttachmentPreview>>();
interface PendingFile {
  file: File;
  key: string;
  error?: string;
}
const selectedFiles = ref<PendingFile[]>([]);
const selectedBytes = computed(() =>
  selectedFiles.value.reduce((total, item) => total + item.file.size, 0),
);
const fileInput = ref<HTMLInputElement>();
const uploading = ref(false);
const TRANSFER_IDLE_TIMEOUT = 45_000;
const transfers = reactive(
  new Map<
    string,
    {
      action: 'download' | 'preview';
      controller: AbortController;
      loaded: number;
      timeout?: number;
    }
  >(),
);
const operationError = ref('');
const progress = ref<{
  done: number;
  failed: number;
  success: number;
  total: number;
}>();
let contextSequence = 0;
const userStore = useUserStore();
const renaming = ref<ContractAttachment>();
const renameOpen = ref(false);
const renameKey = ref('');
watch(uploading, (value) => emit('busy', value), { flush: 'sync' });
onBeforeUnmount(() => {
  contextSequence++;
  cancelTransfers();
  emit('busy', false);
});
watch(
  [
    () => props.contractId,
    () => props.target?.targetKind,
    () => props.target?.targetId,
  ],
  () => {
    contextSequence++;
    cancelTransfers();
    preview.value?.close();
    selectedFiles.value = [];
    progress.value = undefined;
    operationError.value = '';
    uploading.value = false;
  },
);
const categoryLabels = contractAttachmentCategories;
watch(
  () => props.categories,
  (values) => {
    if (category.value && values.includes(category.value)) return;
    if (props.defaultCategory && values.includes(props.defaultCategory))
      category.value = props.defaultCategory;
    else category.value = values.length === 1 ? values[0] : undefined;
  },
  { immediate: true },
);
function addFiles(files: File[]) {
  if (uploading.value || !props.view?.enabled || props.categories.length === 0)
    return;
  const existing = new Set(
    selectedFiles.value.map(({ file }) =>
      JSON.stringify([file.name, file.size, file.lastModified]),
    ),
  );
  const added = files.filter((file) => {
    const identity = JSON.stringify([file.name, file.size, file.lastModified]);
    if (existing.has(identity)) return false;
    existing.add(identity);
    return true;
  });
  const error = submissionFilesError([
    ...selectedFiles.value.map((item) => item.file),
    ...added,
  ]);
  operationError.value = error;
  if (error) return;
  selectedFiles.value.push(
    ...added.map((file) => ({ file, key: newIdempotencyKey() })),
  );
  progress.value = undefined;
}
function chooseFile(event: Event) {
  const input = event.target as HTMLInputElement;
  addFiles([...(input.files ?? [])]);
  input.value = '';
}
function removeFile(key: string) {
  if (!uploading.value) {
    selectedFiles.value = selectedFiles.value.filter(
      (item) => item.key !== key,
    );
    operationError.value = '';
  }
}
function changeCategory() {
  selectedFiles.value = selectedFiles.value.map((item) => ({
    file: item.file,
    key: newIdempotencyKey(),
  }));
  progress.value = undefined;
}
/** 也可把文件直接拖到上传区，效果同「选择文件」 */
const dragging = ref(false);
function dropFile(event: DragEvent) {
  dragging.value = false;
  addFiles([...(event.dataTransfer?.files ?? [])]);
}
async function upload() {
  if (
    uploading.value ||
    selectedFiles.value.length === 0 ||
    !category.value ||
    !props.view?.enabled
  )
    return;
  const context = contextSequence;
  const contractId = props.contractId;
  const target = props.target ? { ...props.target } : undefined;
  const selectedCategory = category.value;
  const pending = [...selectedFiles.value];
  uploading.value = true;
  operationError.value = '';
  progress.value = { done: 0, failed: 0, success: 0, total: pending.length };
  try {
    for (const item of pending) {
      if (context !== contextSequence) return;
      item.error = undefined;
      try {
        await uploadAttachment(
          contractId,
          item.file,
          selectedCategory,
          item.key,
          target,
        );
        if (context !== contextSequence) return;
        selectedFiles.value = selectedFiles.value.filter(
          (entry) => entry.key !== item.key,
        );
        progress.value!.success++;
      } catch (error) {
        if (context !== contextSequence) return;
        item.error = errorText(error);
        progress.value!.failed++;
      }
      progress.value!.done++;
    }
    const result = progress.value!;
    if (result.success > 0) {
      message.success(
        `已上传 ${result.success} 个附件${target ? '到当前单据' : ''}`,
      );
      emit('refresh');
    }
    if (result.failed > 0)
      operationError.value = `${result.failed} 个附件上传失败，失败文件已保留，可重试。`;
  } finally {
    if (context === contextSequence) uploading.value = false;
  }
}
/** 上传人或可上传该分类资料的人可以改名，最终以服务端校验为准 */
function canRename(item: ContractAttachment) {
  return (
    props.categories.includes(item.category) ||
    String(item.uploadedBy) === String(userStore.userInfo?.id ?? '')
  );
}
function startRename(item: ContractAttachment) {
  renaming.value = item;
  renameKey.value = newIdempotencyKey();
  renameOpen.value = true;
}
async function saveRename(name: string) {
  if (!renaming.value) return;
  await renameAttachment(
    props.contractId,
    renaming.value.id,
    name,
    renameKey.value,
  );
  message.success('文件名称已修改');
  emit('refresh');
}
function cancelTransfer(id: string) {
  const transfer = transfers.get(id);
  if (!transfer) return;
  window.clearTimeout(transfer.timeout);
  transfers.delete(id);
  transfer.controller.abort();
}
function cancelTransfers() {
  for (const id of transfers.keys()) cancelTransfer(id);
}
async function fetchFile(
  item: ContractAttachment,
  action: 'download' | 'preview',
) {
  if (transfers.has(item.id)) return;
  const transfer = reactive({
    action,
    controller: new AbortController(),
    loaded: 0,
    timeout: undefined as number | undefined,
  });
  transfers.set(item.id, transfer);
  const { signal } = transfer.controller;
  operationError.value = '';
  const resetTimeout = () => {
    window.clearTimeout(transfer.timeout);
    transfer.timeout = window.setTimeout(() => {
      cancelTransfer(item.id);
      operationError.value = `「${item.name}」长时间未收到数据，请重试。`;
    }, TRANSFER_IDLE_TIMEOUT);
  };
  resetTimeout();
  try {
    const blob = await downloadAttachment(props.contractId, item.id, {
      signal,
      onDownloadProgress: ({ loaded }) => {
        if (signal.aborted || loaded <= transfer.loaded) return;
        transfer.loaded = loaded;
        resetTimeout();
      },
    });
    if (signal.aborted) return;
    if (!(blob instanceof Blob) || blob.size === 0) {
      throw new Error('服务未返回有效文件，请重试。');
    }
    if (action === 'preview') preview.value?.show(blob, item.name);
    else saveFile(blob, item.name);
  } catch (error) {
    if (!signal.aborted) {
      const label = action === 'preview' ? '预览' : '下载';
      operationError.value = `「${item.name}」${label}失败：${errorText(error)}`;
    }
  } finally {
    window.clearTimeout(transfer.timeout);
    if (!signal.aborted) transfers.delete(item.id);
  }
}
function saveFile(blob: Blob, fileName: string) {
  downloadFileFromBlobPart({ source: blob, fileName });
}
function transferLabel(item: ContractAttachment) {
  const transfer = transfers.get(item.id);
  if (!transfer) return '';
  const action = transfer.action === 'preview' ? '正在读取' : '正在下载';
  return transfer.loaded > 0
    ? `${action} ${attachmentSize(transfer.loaded)} / ${attachmentSize(Number(item.size))}`
    : `${action}…`;
}
</script>

<template>
  <div
    class="attachment-stack"
    :class="{ 'purchase-attachments': variant === 'purchase' }"
  >
    <div v-if="variant === 'purchase'" class="purchase-heading">
      <h3>补充附件</h3>
      <p>报价、图纸、沟通资料等，统一保存在本采购单下。</p>
    </div>
    <Alert
      v-if="error || operationError"
      type="error"
      show-icon
      :message="error || operationError"
    />
    <Alert
      v-if="view && !view.enabled"
      type="warning"
      show-icon
      message="系统文件存储暂不可用，请检查基础设施中的文件配置。附件上传复用系统当前存储。"
    />
    <input
      v-if="view?.enabled && categories.length"
      ref="fileInput"
      type="file"
      multiple
      :accept="ATTACHMENT_ACCEPT"
      hidden
      :aria-label="
        variant === 'purchase' ? '选择采购单补充附件' : '选择合同附件'
      "
      :disabled="uploading"
      @change="chooseFile"
    />
    <div
      v-if="variant === 'purchase' && view?.enabled && categories.length"
      class="purchase-upload"
    >
      <button
        type="button"
        class="purchase-dropzone"
        :class="{ dragging: dragging && !uploading }"
        :disabled="uploading"
        @click="fileInput?.click()"
        @dragover.prevent="dragging = !uploading"
        @dragleave.prevent="dragging = false"
        @drop.prevent="dropFile"
      >
        <Upload class="size-6" aria-hidden="true" />
        <strong>{{
          selectedFiles.length ? '继续添加文件' : '点击选择文件，或拖拽到这里'
        }}</strong>
        <span>
          {{ ATTACHMENT_FORMAT_TEXT }}，支持多选；每次最多 10 个，合计不超过 1
          GB
        </span>
      </button>
      <div class="purchase-upload-actions">
        <label class="purchase-category">
          <span>资料分类</span>
          <Select
            v-model:value="category"
            aria-label="补充附件资料分类"
            :options="
              categories.map((value) => ({
                value,
                label: categoryLabels[value] ?? value,
              }))
            "
            placeholder="选择资料分类"
            :disabled="uploading"
            @change="changeCategory"
          />
        </label>
        <Space v-if="selectedFiles.length" wrap>
          <span role="status" class="text-muted-foreground text-xs">
            待上传 {{ selectedFiles.length }} 个文件，共
            {{ attachmentSize(selectedBytes) }}
          </span>
          <Button
            type="primary"
            :loading="uploading"
            :disabled="!category"
            :title="!category ? '请先选择资料分类' : undefined"
            @click="upload"
          >
            {{ uploading ? '上传中' : `上传（${selectedFiles.length}）` }}
          </Button>
        </Space>
      </div>
    </div>
    <div
      v-if="variant !== 'purchase'"
      class="attachment-toolbar"
      :class="{ dragging: dragging && !uploading }"
      @dragover.prevent="dragging = Boolean(view?.enabled && categories.length)"
      @dragleave.prevent="dragging = false"
      @drop.prevent="dropFile"
    >
      <Space v-if="view?.enabled && categories.length" wrap>
        <Select
          v-model:value="category"
          :options="
            categories.map((value) => ({
              value,
              label: categoryLabels[value] ?? value,
            }))
          "
          placeholder="资料分类"
          style="width: 150px"
          :disabled="uploading"
          @change="changeCategory"
        />
        <Button :disabled="uploading" @click="fileInput?.click()">
          <template #icon>
            <Upload class="mr-1 inline-block size-4" aria-hidden="true" />
          </template>
          {{ selectedFiles.length ? '继续选择文件' : '选择文件' }}
        </Button>
        <span
          class="inline-block align-middle"
          :class="{ 'text-muted-foreground': !selectedFiles.length }"
          role="status"
        >
          {{
            selectedFiles.length
              ? `待上传 ${selectedFiles.length} 个文件，共 ${attachmentSize(selectedBytes)}`
              : '可多选文件，也可将文件拖到这里'
          }}
        </span>
        <Button
          type="primary"
          :loading="uploading"
          :disabled="!selectedFiles.length || !category"
          :title="!category ? '请先选择资料分类' : undefined"
          @click="upload"
        >
          {{
            uploading
              ? '上传中'
              : `上传${selectedFiles.length ? `（${selectedFiles.length}）` : ''}`
          }}
        </Button>
      </Space>
      <span v-else class="text-muted-foreground text-sm">
        {{ target ? '附件与当前单据关联保存' : '合同资料' }}
      </span>
      <Button :loading="loading" :disabled="uploading" @click="emit('refresh')">
        刷新
      </Button>
    </div>
    <div
      v-if="variant !== 'purchase' && view?.enabled && categories.length"
      class="text-muted-foreground text-xs"
    >
      {{ ATTACHMENT_FORMAT_TEXT }}；每次最多 10 个，合计不超过 1 GB。
    </div>
    <ul
      v-if="selectedFiles.length"
      class="attachment-pending"
      aria-label="待上传文件"
    >
      <li v-for="item in selectedFiles" :key="item.key">
        <div class="pending-file-info">
          <span class="pending-file-name" :title="item.file.name">{{
            item.file.name
          }}</span>
          <span class="text-muted-foreground">{{
            attachmentSize(item.file.size)
          }}</span>
          <span v-if="item.error" class="text-red-500" role="alert">{{
            item.error
          }}</span>
        </div>
        <Button
          type="link"
          size="small"
          :disabled="uploading"
          :aria-label="`移除 ${item.file.name}`"
          @click="removeFile(item.key)"
        >
          移除
        </Button>
      </li>
    </ul>
    <div v-if="progress" role="status" class="text-muted-foreground text-sm">
      {{ uploading ? '上传进度' : '本次上传结果' }}：{{ progress.done }}/{{
        progress.total
      }}
      个，成功 {{ progress.success }} 个，失败 {{ progress.failed }} 个
    </div>
    <div class="attachment-list-heading">
      <span class="text-sm font-medium" role="status">
        已上传附件：{{ view?.items.length ?? 0 }} 个
      </span>
      <Button
        v-if="variant === 'purchase'"
        size="small"
        :loading="loading"
        :disabled="uploading"
        @click="emit('refresh')"
      >
        刷新
      </Button>
    </div>
    <Table
      :data-source="view?.items ?? []"
      row-key="id"
      size="small"
      :loading="loading"
      :pagination="{ pageSize: 10, hideOnSinglePage: true, size: 'small' }"
      :columns="
        variant === 'purchase'
          ? [
              { title: '附件名称', key: 'name' },
              { title: '文件信息', key: 'info', width: 210 },
              { title: '操作', key: 'action', width: 160 },
            ]
          : [
              { title: '附件名称', key: 'name', ellipsis: true },
              { title: '分类', key: 'category', width: 110 },
              { title: '大小', key: 'size', width: 90 },
              ...(directory
                ? [{ title: '上传人', key: 'uploadedBy', width: 110 }]
                : []),
              { title: '上传时间', key: 'createdAt', width: 140 },
              {
                title: '操作',
                key: 'action',
                width: 160,
                fixed: 'right' as const,
              },
            ]
      "
      :scroll="variant === 'purchase' ? undefined : { x: 720 }"
    >
      <template #emptyText>
        <Empty
          :description="
            variant === 'purchase'
              ? view?.enabled && categories.length
                ? '暂无补充附件，可在上方选择或拖入文件'
                : '暂无当前身份可读取的补充附件'
              : '暂无当前身份可读取的附件'
          "
        />
      </template>
      <template #bodyCell="{ column, record }">
        <span
          v-if="column.key === 'name'"
          class="attachment-file-name"
          :title="record.name"
        >
          {{ record.name }}
        </span>
        <div v-else-if="column.key === 'info'" class="attachment-file-meta">
          <span>
            {{ categoryLabels[record.category] ?? record.category }} ·
            {{ attachmentSize(Number(record.size)) }}
          </span>
          <span>
            {{ attachmentTime(record.createdAt) }}
            <template v-if="directory">
              · {{ personLabel(directory, record.uploadedBy) }}</template>
          </span>
        </div>
        <span v-else-if="column.key === 'category'">{{
          categoryLabels[record.category] ?? record.category
        }}</span>
        <span v-else-if="column.key === 'size'">
          {{ attachmentSize(Number(record.size)) }}
        </span>
        <span v-else-if="column.key === 'uploadedBy'">
          {{ personLabel(directory, record.uploadedBy) }}
        </span>
        <span v-else-if="column.key === 'createdAt'">
          {{ attachmentTime(record.createdAt) }}
        </span>
        <Space v-else-if="column.key === 'action'" :size="0" wrap>
          <Button
            v-if="previewMimeType(record.name)"
            type="link"
            size="small"
            :disabled="transfers.has(record.id)"
            :loading="transfers.get(record.id)?.action === 'preview'"
            @click="fetchFile(record as ContractAttachment, 'preview')"
          >
            预览
          </Button>
          <Button
            v-if="canRename(record as ContractAttachment)"
            type="link"
            size="small"
            @click="startRename(record as ContractAttachment)"
          >
            改名
          </Button>
          <Button
            type="link"
            size="small"
            :disabled="transfers.has(record.id)"
            :loading="transfers.get(record.id)?.action === 'download'"
            @click="fetchFile(record as ContractAttachment, 'download')"
          >
            下载
          </Button>
          <template v-if="transfers.has(record.id)">
            <span class="text-muted-foreground text-xs" role="status">{{
              transferLabel(record as ContractAttachment)
            }}</span>
            <Button type="link" size="small" @click="cancelTransfer(record.id)">
              取消
            </Button>
          </template>
        </Space>
      </template>
    </Table>
    <AttachmentPreview ref="preview" @download="saveFile" />
    <RenameFileDialog
      v-model:open="renameOpen"
      :name="renaming?.name"
      :save="saveRename"
    />
  </div>
</template>

<style scoped>
.attachment-stack {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.purchase-attachments {
  padding: 16px;
  border: 1px solid hsl(var(--border));
  border-radius: 10px;
}

.purchase-heading h3 {
  margin: 0;
  font-size: 14px;
  font-weight: 600;
}

.purchase-heading p {
  margin: 4px 0 0;
  font-size: 12px;
  color: hsl(var(--muted-foreground));
}

.purchase-upload {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.purchase-dropzone {
  display: flex;
  flex-direction: column;
  gap: 8px;
  align-items: center;
  justify-content: center;
  width: 100%;
  padding: 20px 16px;
  color: hsl(var(--muted-foreground));
  cursor: pointer;
  background: hsl(var(--muted) / 35%);
  border: 1px dashed hsl(var(--border));
  border-radius: 8px;
  transition:
    background 0.15s,
    border-color 0.15s;
}

.purchase-dropzone strong {
  font-size: 13px;
  font-weight: 500;
  color: hsl(var(--foreground));
}

.purchase-dropzone > span {
  font-size: 12px;
}

.purchase-dropzone:not(:disabled):hover,
.purchase-dropzone.dragging,
.purchase-dropzone:focus-visible {
  background: hsl(var(--primary) / 5%);
  border-color: hsl(var(--primary));
}

.purchase-dropzone:disabled {
  cursor: default;
  opacity: 0.6;
}

.purchase-upload-actions,
.attachment-list-heading {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  align-items: center;
  justify-content: space-between;
}

.purchase-category {
  display: flex;
  gap: 8px;
  align-items: center;
  font-size: 12px;
  color: hsl(var(--muted-foreground));
}

.purchase-category :deep(.ant-select) {
  width: 150px;
}

.attachment-file-name {
  overflow-wrap: anywhere;
}

.attachment-file-meta {
  display: flex;
  flex-direction: column;
  gap: 4px;
  font-size: 12px;
  color: hsl(var(--muted-foreground));
}

.attachment-toolbar {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
  justify-content: space-between;
}

.attachment-toolbar.dragging {
  outline: 1px dashed #1677ff;
  outline-offset: 2px;
  background: #e6f4ff;
}

.attachment-pending {
  padding: 8px 12px;
  margin: 0;
  list-style: none;
  border: 1px solid hsl(var(--border));
  border-radius: 6px;
}

.attachment-pending > li {
  display: flex;
  gap: 12px;
  align-items: flex-start;
  justify-content: space-between;
  padding: 4px 0;
}

.pending-file-info {
  display: flex;
  flex-wrap: wrap;
  gap: 4px 12px;
  min-width: 0;
}

.pending-file-name {
  overflow-wrap: anywhere;
}
</style>
