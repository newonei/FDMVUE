<script setup lang="ts">
import { computed, ref } from 'vue';

import { downloadFileFromBlobPart } from '@vben/utils';

import { Alert, Button, Card, Space, Table, Tag } from 'ant-design-vue';

import {
  ATTACHMENT_ACCEPT,
  ATTACHMENT_LIMIT_TEXT,
  attachmentSize,
  submissionFilesError,
} from '#/api/fdmplatform/submission-files';

import { previewMimeType } from './attachment-preview';
import AttachmentPreview from './AttachmentPreview.vue';
import { renameLocalFile } from './file-name';
import RenameFileDialog from './RenameFileDialog.vue';

const props = withDefaults(
  defineProps<{ disabled?: boolean; files: File[]; title?: string }>(),
  { disabled: false, title: '附件' },
);
const emit = defineEmits<{ 'update:files': [files: File[]] }>();
const input = ref<HTMLInputElement>();
const error = ref('');
const dragging = ref(false);
const total = computed(() =>
  props.files.reduce((sum, file) => sum + file.size, 0),
);
const rows = computed(() =>
  props.files.map((file, index) => ({
    index,
    name: file.name,
    size: file.size,
  })),
);
function add(files: File[]) {
  if (props.disabled) return;
  const next = [...props.files, ...files];
  error.value = submissionFilesError(next);
  if (!error.value) emit('update:files', next);
}
function choose(event: Event) {
  const element = event.target as HTMLInputElement;
  add([...(element.files ?? [])]);
  element.value = '';
}
function drop(event: DragEvent) {
  dragging.value = false;
  add([...(event.dataTransfer?.files ?? [])]);
}
const preview = ref<InstanceType<typeof AttachmentPreview>>();
const previewing = ref<File>();
const renamingIndex = ref(-1);
const renameOpen = ref(false);
function show(index: number) {
  const file = props.files[index];
  if (!file) return;
  previewing.value = file;
  preview.value?.show(file, file.name);
}
function download(file?: File) {
  if (file) downloadFileFromBlobPart({ source: file, fileName: file.name });
}
function startRename(index: number) {
  renamingIndex.value = index;
  renameOpen.value = true;
}
function saveRename(name: string) {
  const index = renamingIndex.value;
  const file = props.files[index];
  if (!file || props.disabled) return;
  const next = [...props.files];
  next[index] = renameLocalFile(file, name);
  const problem = submissionFilesError(next);
  if (problem) throw new Error(problem);
  emit('update:files', next);
}
function remove(index: number) {
  if (props.disabled) return;
  emit(
    'update:files',
    props.files.filter((_, current) => current !== index),
  );
  error.value = '';
}
</script>

<template>
  <Card :title="title" size="small" class="creation-attachments">
    <div
      class="attachment-drop"
      :class="{ dragging: dragging && !disabled }"
      @dragover.prevent="dragging = true"
      @dragleave.prevent="dragging = false"
      @drop.prevent="drop"
    >
      <input
        ref="input"
        type="file"
        multiple
        :accept="ATTACHMENT_ACCEPT"
        aria-label="选择单据附件"
        class="file-input"
        :disabled="disabled"
        @change="choose"
      />
      <Button :disabled="disabled" @click="input?.click()">选择附件</Button>
      <span>支持多选，也可将文件拖到这里</span>
    </div>
    <p class="attachment-hint">
      支持 PDF、图片、Word、Excel、CSV、TXT。最多 10 个，单个和总计都不超过
      {{ ATTACHMENT_LIMIT_TEXT }}。附件将随单据保存上传，大文件会显示上传进度。
    </p>
    <Alert
      v-if="error"
      :message="error"
      type="error"
      show-icon
      class="attachment-error"
    />
    <Table
      v-if="files.length"
      :data-source="rows"
      row-key="index"
      :pagination="false"
      size="small"
      :columns="[
        { title: '文件名称', dataIndex: 'name' },
        { title: '大小', key: 'size', width: 100 },
        { title: '状态', key: 'status', width: 110 },
        { title: '操作', key: 'action', width: 210 },
      ]"
    >
      <template #bodyCell="{ column, record }">
        <span v-if="column.key === 'size'">{{
          attachmentSize(record.size)
        }}</span>
        <Tag
          v-else-if="column.key === 'status'"
          :color="disabled ? 'processing' : 'default'"
        >
          {{ disabled ? '正在保存' : '待保存' }}
        </Tag>
        <Space v-else-if="column.key === 'action'" :size="0">
          <Button
            v-if="previewMimeType(record.name)"
            type="link"
            size="small"
            @click="show(record.index)"
          >
            预览
          </Button>
          <Button
            type="link"
            size="small"
            :disabled="disabled"
            @click="startRename(record.index)"
          >
            改名
          </Button>
          <Button
            type="link"
            size="small"
            @click="download(files[record.index])"
          >
            下载
          </Button>
          <Button
            type="link"
            danger
            size="small"
            :disabled="disabled"
            @click="remove(record.index)"
          >
            移除
          </Button>
        </Space>
      </template>
    </Table>
    <div v-if="files.length" class="attachment-total">
      已选 {{ files.length }} 个附件，共 {{ attachmentSize(total) }}
    </div>
    <AttachmentPreview ref="preview" @download="download(previewing)" />
    <RenameFileDialog
      v-model:open="renameOpen"
      :name="files[renamingIndex]?.name"
      :save="saveRename"
    />
  </Card>
</template>

<style scoped>
.creation-attachments {
  width: 100%;
}

.attachment-drop {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  align-items: center;
  padding: 18px;
  background: #fafcff;
  border: 1px dashed #b9c9df;
  border-radius: 6px;
}

.attachment-drop.dragging {
  background: #e6f4ff;
  border-color: #1677ff;
}

.file-input {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip-path: inset(50%);
}

.attachment-hint {
  margin: 10px 0;
  font-size: 12px;
  line-height: 1.7;
  color: #64748b;
}

.attachment-error {
  margin: 10px 0;
}

.attachment-total {
  margin-top: 10px;
  color: #475569;
}
</style>
