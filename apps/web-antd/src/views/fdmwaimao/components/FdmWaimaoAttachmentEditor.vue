<script lang="ts" setup>
import type { UploadRequestOption } from 'ant-design-vue/lib/vc-upload/interface';

import type { FdmWaimaoAttachmentApi } from '#/api/fdmwaimao/attachment';

import { computed, onBeforeUnmount, reactive, ref, watch } from 'vue';

import { IconifyIcon } from '@vben/icons';
import { formatFileSize, getFileIcon } from '@vben/utils';

import {
  Button,
  message,
  Progress,
  Tag,
  Typography,
  Upload,
} from 'ant-design-vue';

import {
  deletePendingFdmWaimaoAttachment,
  getFdmWaimaoAttachmentDownloadUrl,
  uploadFdmWaimaoAttachment,
} from '#/api/fdmwaimao/attachment';

type UploadTaskStatus = 'error' | 'uploading';

interface UploadTask {
  errorMessage?: string;
  file: File;
  percent: number;
  status: UploadTaskStatus;
  uid: string;
}

defineOptions({ name: 'FdmWaimaoAttachmentEditor' });

const props = withDefaults(
  defineProps<{
    businessType: FdmWaimaoAttachmentApi.BusinessType;
    disabled?: boolean;
    modelValue: FdmWaimaoAttachmentApi.Attachment[];
  }>(),
  {
    disabled: false,
  },
);

const emit = defineEmits<{
  errorChange: [hasError: boolean];
  'update:modelValue': [attachments: FdmWaimaoAttachmentApi.Attachment[]];
  uploadingChange: [uploading: boolean];
}>();

const MAX_ATTACHMENT_COUNT = 20;
const MAX_ATTACHMENT_SIZE_BYTES = 20 * 1024 * 1024;
const MAX_TOTAL_SIZE_BYTES = 100 * 1024 * 1024;
const ALLOWED_EXTENSIONS = [
  'pdf',
  'doc',
  'docx',
  'xls',
  'xlsx',
  'ppt',
  'pptx',
  'txt',
  'csv',
  'jpg',
  'jpeg',
  'png',
  'webp',
  'zip',
] as const;
const ACCEPT = ALLOWED_EXTENSIONS.map((extension) => `.${extension}`).join(',');

const uploadTasks = ref<UploadTask[]>([]);
const deletingIds = reactive(new Set<string>());
const downloadingIds = reactive(new Set<string>());
const cleanupRequestedIds = new Set<string>();
let reservedUploadCount = 0;
let reservedUploadBytes = 0;
let disposed = false;

// Keep a local shadow so concurrently completed uploads cannot overwrite each
// other while the parent v-model update is still waiting for Vue's next flush.
const attachments = ref<FdmWaimaoAttachmentApi.Attachment[]>([
  ...(props.modelValue ?? []),
]);
watch(
  () => props.modelValue,
  (value) => {
    attachments.value = [...(value ?? [])];
  },
);
const uploading = computed(() =>
  uploadTasks.value.some((task) => task.status === 'uploading'),
);
const hasUploadError = computed(() =>
  uploadTasks.value.some((task) => task.status === 'error'),
);
const attachmentIds = computed(() =>
  attachments.value.map((attachment) => attachment.id),
);
const remainingCount = computed(() =>
  Math.max(
    0,
    MAX_ATTACHMENT_COUNT - attachments.value.length - uploadTasks.value.length,
  ),
);

watch(uploading, (value) => emit('uploadingChange', value), {
  immediate: true,
});
watch(hasUploadError, (value) => emit('errorChange', value), {
  immediate: true,
});

function nextTaskId() {
  return (
    globalThis.crypto?.randomUUID?.() ??
    `fdmwaimao-attachment-${Date.now()}-${Math.random().toString(36).slice(2)}`
  );
}

function fileExtension(fileName: string) {
  const match = fileName.toLowerCase().match(/\.([^.]+)$/);
  return match?.[1] ?? '';
}

function beforeUpload(file: File) {
  if (props.disabled) return Upload.LIST_IGNORE;
  if (!props.businessType) {
    message.error('附件业务类型不能为空');
    return Upload.LIST_IGNORE;
  }
  if (
    attachments.value.length + uploadTasks.value.length + reservedUploadCount >=
    MAX_ATTACHMENT_COUNT
  ) {
    message.error(`每张单据最多上传 ${MAX_ATTACHMENT_COUNT} 个附件`);
    return Upload.LIST_IGNORE;
  }
  if (
    !ALLOWED_EXTENSIONS.includes(
      fileExtension(file.name) as (typeof ALLOWED_EXTENSIONS)[number],
    )
  ) {
    message.error(`不支持 ${file.name} 的文件格式`);
    return Upload.LIST_IGNORE;
  }
  if (file.size > MAX_ATTACHMENT_SIZE_BYTES) {
    message.error(`${file.name} 超过 20 MB，无法上传`);
    return Upload.LIST_IGNORE;
  }
  const selectedBytes = attachments.value.reduce(
    (total, attachment) => total + Math.max(0, attachment.fileSize ?? 0),
    0,
  );
  const uploadingBytes = uploadTasks.value.reduce(
    (total, task) => total + Math.max(0, task.file.size),
    0,
  );
  if (
    selectedBytes + uploadingBytes + reservedUploadBytes + file.size >
    MAX_TOTAL_SIZE_BYTES
  ) {
    message.error('每张单据的附件总大小不能超过 100 MB');
    return Upload.LIST_IGNORE;
  }
  reservedUploadCount += 1;
  reservedUploadBytes += file.size;
  return true;
}

function removeTask(task: UploadTask) {
  uploadTasks.value = uploadTasks.value.filter((item) => item.uid !== task.uid);
}

function normalizeUploadedAttachment(
  result: FdmWaimaoAttachmentApi.Attachment,
  file: File,
): FdmWaimaoAttachmentApi.Attachment {
  if (!result || result.id === null || result.id === undefined) {
    throw new Error('附件上传响应缺少附件 ID');
  }
  const status = result.status;
  if (status !== 'PENDING' && status !== 'BOUND') {
    throw new Error('附件上传响应状态无法识别');
  }
  return {
    ...result,
    businessType: result.businessType || props.businessType,
    fileName: String(result.fileName || file.name),
    fileSize: result.fileSize ?? file.size,
    id: String(result.id),
    mimeType: result.mimeType || file.type || undefined,
    status,
  };
}

function requestPendingCleanup(id: string) {
  if (!id || cleanupRequestedIds.has(id)) return;
  cleanupRequestedIds.add(id);
  void deletePendingFdmWaimaoAttachment(id).catch(() => {
    cleanupRequestedIds.delete(id);
  });
}

async function performUpload(task: UploadTask, request?: UploadRequestOption) {
  task.status = 'uploading';
  task.errorMessage = undefined;
  task.percent = 0;
  let uploaded: FdmWaimaoAttachmentApi.Attachment | undefined;
  try {
    uploaded = await uploadFdmWaimaoAttachment(
      task.file,
      props.businessType,
      (event) => {
        if (!event.total) return;
        task.percent = Math.min(
          99,
          Math.round((event.loaded / event.total) * 100),
        );
        request?.onProgress?.({ percent: task.percent });
      },
    );
    const attachment = normalizeUploadedAttachment(uploaded, task.file);
    if (attachment.businessType !== props.businessType) {
      throw new Error('附件业务类型与当前单据不一致');
    }
    task.percent = 100;
    request?.onSuccess?.(attachment);
    removeTask(task);

    if (disposed) {
      if (attachment.status === 'PENDING') requestPendingCleanup(attachment.id);
      return;
    }
    if (!attachments.value.some((item) => item.id === attachment.id)) {
      const next = [...attachments.value, attachment];
      attachments.value = next;
      emit('update:modelValue', next);
    }
  } catch (error) {
    const normalizedError =
      error instanceof Error ? error : new Error('附件上传失败');
    if (uploaded?.id) requestPendingCleanup(String(uploaded.id));
    if (!disposed) {
      task.status = 'error';
      task.errorMessage = normalizedError.message || '上传失败，请重试';
      request?.onError?.(normalizedError);
      message.error(`${task.file.name} 上传失败`);
    }
  }
}

function customRequest(request: UploadRequestOption) {
  reservedUploadCount = Math.max(0, reservedUploadCount - 1);
  const file = request.file as File;
  reservedUploadBytes = Math.max(0, reservedUploadBytes - file.size);
  const task: UploadTask = {
    file,
    percent: 0,
    status: 'uploading',
    uid: nextTaskId(),
  };
  uploadTasks.value.push(task);
  void performUpload(task, request);
}

function retryTask(task: UploadTask) {
  if (props.disabled || task.status !== 'error') return;
  void performUpload(task);
}

async function removePendingAttachment(
  attachment: FdmWaimaoAttachmentApi.Attachment,
) {
  if (
    props.disabled ||
    attachment.status !== 'PENDING' ||
    deletingIds.has(attachment.id)
  ) {
    return;
  }
  deletingIds.add(attachment.id);
  cleanupRequestedIds.add(attachment.id);
  try {
    await deletePendingFdmWaimaoAttachment(attachment.id);
    const next = attachments.value.filter((item) => item.id !== attachment.id);
    attachments.value = next;
    emit('update:modelValue', next);
  } catch {
    cleanupRequestedIds.delete(attachment.id);
    message.error('待保存附件删除失败，请稍后重试');
  } finally {
    deletingIds.delete(attachment.id);
  }
}

function createDownloadPopup() {
  const popup = window.open('about:blank', '_blank');
  if (!popup) {
    message.warning('浏览器阻止了下载窗口，请允许弹窗后重试');
    return undefined;
  }
  popup.opener = null;
  try {
    popup.document.title = '正在获取附件';
    popup.document.body.textContent = '正在获取安全下载地址，请稍候…';
  } catch {
    // 空白窗口初始化失败不影响后续跳转。
  }
  return popup;
}

function safeDownloadUrl(value: string) {
  const parsed = new URL(value, window.location.origin);
  if (
    !['http:', 'https:'].includes(parsed.protocol) ||
    parsed.username ||
    parsed.password
  ) {
    throw new Error('Unsafe attachment download URL');
  }
  return parsed.href;
}

async function downloadAttachment(
  attachment: FdmWaimaoAttachmentApi.Attachment,
) {
  if (downloadingIds.has(attachment.id)) return;
  const popup = createDownloadPopup();
  if (!popup) return;
  downloadingIds.add(attachment.id);
  try {
    const downloadUrl = await getFdmWaimaoAttachmentDownloadUrl(attachment.id);
    popup.location.replace(safeDownloadUrl(downloadUrl));
  } catch {
    popup.close();
    message.error('附件下载地址获取失败，请稍后重试');
  } finally {
    downloadingIds.delete(attachment.id);
  }
}

onBeforeUnmount(() => {
  disposed = true;
  for (const attachment of attachments.value) {
    if (attachment.status === 'PENDING') {
      requestPendingCleanup(attachment.id);
    }
  }
});

defineExpose({ attachmentIds, hasUploadError, uploading });
</script>

<template>
  <div class="fdm-attachment-editor">
    <Upload.Dragger
      :accept="ACCEPT"
      :before-upload="beforeUpload"
      :custom-request="customRequest"
      :disabled="disabled || remainingCount === 0"
      multiple
      :show-upload-list="false"
    >
      <p class="ant-upload-drag-icon">
        <IconifyIcon icon="lucide:cloud-upload" />
      </p>
      <p class="ant-upload-text">点击或拖拽上传附件</p>
      <p class="ant-upload-hint">
        最多 20 个，单个不超过 20 MB、合计不超过 100 MB；支持常用文档、图片和
        ZIP 压缩包
      </p>
    </Upload.Dragger>

    <div class="fdm-attachment-editor__summary">
      <span>已选择 {{ attachments.length + uploadTasks.length }} / 20</span>
      <span v-if="uploading" class="fdm-attachment-editor__uploading">
        正在上传，请稍候
      </span>
      <span v-if="hasUploadError" class="fdm-attachment-editor__error">
        存在上传失败的文件，请重试或移除
      </span>
    </div>

    <div v-if="uploadTasks.length" class="fdm-attachment-editor__list">
      <div
        v-for="task in uploadTasks"
        :key="task.uid"
        class="fdm-attachment-editor__item"
      >
        <span class="fdm-attachment-editor__icon" aria-hidden="true">
          <IconifyIcon :icon="getFileIcon(task.file.name)" />
        </span>
        <div class="fdm-attachment-editor__content">
          <Typography.Text
            class="fdm-attachment-editor__name"
            :title="task.file.name"
          >
            {{ task.file.name }}
          </Typography.Text>
          <span class="fdm-attachment-editor__size">
            {{ formatFileSize(task.file.size) }}
          </span>
          <Progress
            :percent="task.percent"
            :show-info="task.status === 'uploading'"
            :status="task.status === 'error' ? 'exception' : 'active'"
            size="small"
          />
          <span v-if="task.errorMessage" class="fdm-attachment-editor__error">
            {{ task.errorMessage }}
          </span>
        </div>
        <div class="fdm-attachment-editor__actions">
          <Button
            v-if="task.status === 'error'"
            :disabled="disabled"
            size="small"
            type="link"
            @click="retryTask(task)"
          >
            重试
          </Button>
          <Button
            v-if="task.status === 'error'"
            danger
            :disabled="disabled"
            size="small"
            type="link"
            @click="removeTask(task)"
          >
            移除
          </Button>
        </div>
      </div>
    </div>

    <div v-if="attachments.length" class="fdm-attachment-editor__list">
      <div
        v-for="attachment in attachments"
        :key="attachment.id"
        class="fdm-attachment-editor__item"
      >
        <span class="fdm-attachment-editor__icon" aria-hidden="true">
          <IconifyIcon :icon="getFileIcon(attachment.fileName)" />
        </span>
        <div class="fdm-attachment-editor__content">
          <Typography.Text
            class="fdm-attachment-editor__name"
            :title="attachment.fileName"
          >
            {{ attachment.fileName }}
          </Typography.Text>
          <div class="fdm-attachment-editor__meta">
            <span v-if="attachment.fileSize !== undefined">
              {{ formatFileSize(attachment.fileSize) }}
            </span>
            <Tag :color="attachment.status === 'BOUND' ? 'green' : 'orange'">
              {{ attachment.status === 'BOUND' ? '已绑定' : '待保存' }}
            </Tag>
          </div>
        </div>
        <div class="fdm-attachment-editor__actions">
          <Button
            :loading="downloadingIds.has(attachment.id)"
            size="small"
            type="link"
            @click="downloadAttachment(attachment)"
          >
            下载
          </Button>
          <Button
            v-if="attachment.status === 'PENDING'"
            danger
            :disabled="disabled"
            :loading="deletingIds.has(attachment.id)"
            size="small"
            type="link"
            @click="removePendingAttachment(attachment)"
          >
            删除
          </Button>
          <span
            v-else
            class="fdm-attachment-editor__bound-hint"
            title="已绑定附件需要随业务单据更新"
          >
            <IconifyIcon icon="lucide:lock-keyhole" />
          </span>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.fdm-attachment-editor {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.fdm-attachment-editor :deep(.ant-upload-drag-icon) {
  margin-bottom: 8px;
  font-size: 36px;
  color: #1677ff;
}

.fdm-attachment-editor__summary {
  display: flex;
  flex-wrap: wrap;
  gap: 8px 16px;
  font-size: 12px;
  color: #8c8c8c;
}

.fdm-attachment-editor__uploading {
  color: #1677ff;
}

.fdm-attachment-editor__error {
  font-size: 12px;
  color: #ff4d4f;
}

.fdm-attachment-editor__list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.fdm-attachment-editor__item {
  display: flex;
  min-width: 0;
  align-items: center;
  gap: 12px;
  padding: 10px 12px;
  background: #fafafa;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
}

.fdm-attachment-editor__icon {
  display: inline-flex;
  flex: 0 0 36px;
  width: 36px;
  height: 36px;
  align-items: center;
  justify-content: center;
  font-size: 20px;
  color: #1677ff;
  background: #e6f4ff;
  border-radius: 8px;
}

.fdm-attachment-editor__content {
  min-width: 0;
  flex: 1;
}

.fdm-attachment-editor__name {
  display: block;
  overflow: hidden;
  font-weight: 500;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.fdm-attachment-editor__size {
  display: block;
  margin: 2px 0 4px;
  font-size: 12px;
  color: #8c8c8c;
}

.fdm-attachment-editor__meta {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  margin-top: 4px;
  font-size: 12px;
  color: #8c8c8c;
}

.fdm-attachment-editor__actions {
  display: flex;
  flex: 0 0 auto;
  align-items: center;
}

.fdm-attachment-editor__bound-hint {
  display: inline-flex;
  padding: 6px;
  color: #8c8c8c;
}
</style>
