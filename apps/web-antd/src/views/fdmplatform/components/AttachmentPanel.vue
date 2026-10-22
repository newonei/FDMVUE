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
import { attachmentSize } from '#/api/fdmplatform/submission-files';

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
const selectedFile = ref<File>();
const fileInput = ref<HTMLInputElement>();
const uploading = ref(false);
const downloading = ref('');
const operationError = ref('');
const uploadKey = ref('');
const userStore = useUserStore();
const renaming = ref<ContractAttachment>();
const renameOpen = ref(false);
const renameKey = ref('');
watch(uploading, (value) => emit('busy', value), { flush: 'sync' });
onBeforeUnmount(() => emit('busy', false));
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
function chooseFile(event: Event) {
  selectedFile.value = (event.target as HTMLInputElement).files?.[0];
  uploadKey.value = newIdempotencyKey();
}
async function upload() {
  if (!selectedFile.value || !category.value || !props.view?.enabled) return;
  uploading.value = true;
  operationError.value = '';
  try {
    await uploadAttachment(
      props.contractId,
      selectedFile.value,
      category.value,
      uploadKey.value || newIdempotencyKey(),
      props.target,
    );
    selectedFile.value = undefined;
    if (fileInput.value) fileInput.value.value = '';
    message.success(
      props.target
        ? '附件已保存到当前单据'
        : '附件已保存，可在业务表单选择引用',
    );
    emit('refresh');
  } catch (error) {
    operationError.value = errorText(error);
  } finally {
    uploading.value = false;
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
      hidden
      aria-label="选择合同附件"
      :disabled="uploading"
      @change="chooseFile"
    />
    <div class="attachment-toolbar">
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
          @change="uploadKey = newIdempotencyKey()"
        />
        <Button :disabled="uploading" @click="fileInput?.click()">
          <template #icon>
            <Upload class="mr-1 inline-block size-4" aria-hidden="true" />
          </template>
          {{ selectedFile ? '重新选择' : '选择文件' }}
        </Button>
        <span
          class="inline-block max-w-60 truncate align-middle"
          :class="{ 'text-muted-foreground': !selectedFile }"
          :title="selectedFile?.name"
          role="status"
        >
          {{ selectedFile?.name ?? '尚未选择文件' }}
        </span>
        <Button
          type="primary"
          :loading="uploading"
          :disabled="!selectedFile || !category"
          :title="!category ? '请先选择资料分类' : undefined"
          @click="upload"
        >
          上传
        </Button>
      </Space>
      <span v-else class="text-muted-foreground text-sm">
        {{ target ? '附件与当前单据关联保存' : '合同资料' }}
      </span>
      <Button :loading="loading" @click="emit('refresh')">刷新</Button>
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
</style>
