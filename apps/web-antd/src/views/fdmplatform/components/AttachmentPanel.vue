<script setup lang="ts">
import type { Ref } from 'vue';

import type {
  AttachmentTarget,
  AttachmentView,
  ContractAttachment,
  Directory,
} from '#/api/fdmplatform';

import { computed, inject, onBeforeUnmount, ref, watch } from 'vue';

import { Upload } from '@vben/icons';
import { useUserStore } from '@vben/stores';

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
const previewing = ref<ContractAttachment>();
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
const downloading = ref('');
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
  emit('busy', false);
});
watch(
  () => [props.contractId, props.target?.targetKind, props.target?.targetId],
  () => {
    contextSequence++;
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
async function fetchFile(item: ContractAttachment) {
  downloading.value = item.id;
  operationError.value = '';
  try {
    return await downloadAttachment(props.contractId, item.id);
  } catch (error) {
    operationError.value = errorText(error);
  } finally {
    downloading.value = '';
  }
}
async function show(item: ContractAttachment) {
  const blob = await fetchFile(item);
  if (!blob) return;
  previewing.value = item;
  preview.value?.show(blob, item.name);
}
async function download(item: ContractAttachment) {
  const blob = await fetchFile(item);
  if (!blob) return;
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = item.name;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
</script>

<template>
  <div class="attachment-stack">
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
      aria-label="选择合同附件"
      :disabled="uploading"
      @change="chooseFile"
    />
    <div
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
      v-if="view?.enabled && categories.length"
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
    <div class="text-sm font-medium" role="status">
      已上传附件：{{ view?.items.length ?? 0 }} 个
    </div>
    <Table
      :data-source="view?.items ?? []"
      row-key="id"
      size="small"
      :loading="loading"
      :pagination="{ pageSize: 10, hideOnSinglePage: true, size: 'small' }"
      :columns="[
        { title: '附件名称', key: 'name', ellipsis: true },
        { title: '分类', key: 'category', width: 110 },
        { title: '大小', key: 'size', width: 90 },
        ...(directory
          ? [{ title: '上传人', key: 'uploadedBy', width: 110 }]
          : []),
        { title: '上传时间', key: 'createdAt', width: 140 },
        { title: '操作', key: 'action', width: 160, fixed: 'right' as const },
      ]"
      :scroll="{ x: 720 }"
    >
      <template #emptyText>
        <Empty description="暂无当前身份可读取的附件" />
      </template>
      <template #bodyCell="{ column, record }">
        <span v-if="column.key === 'name'" :title="record.name">
          {{ record.name }}
        </span>
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
        <Space v-else-if="column.key === 'action'" :size="0">
          <Button
            v-if="previewMimeType(record.name)"
            type="link"
            size="small"
            :disabled="downloading === record.id"
            @click="show(record as ContractAttachment)"
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
            :disabled="downloading === record.id"
            @click="download(record as ContractAttachment)"
          >
            下载
          </Button>
        </Space>
      </template>
    </Table>
    <AttachmentPreview
      ref="preview"
      @download="previewing && download(previewing)"
    />
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
