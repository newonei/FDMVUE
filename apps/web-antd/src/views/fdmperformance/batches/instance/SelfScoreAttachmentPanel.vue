<script lang="ts" setup>
import type { UploadRequestOption } from 'ant-design-vue/lib/vc-upload/interface';

import type { JixiaoApi } from '#/api/fdmperformance';

import { computed, reactive, ref, watch } from 'vue';

import { IconifyIcon } from '@vben/icons';
import { formatFileSize } from '@vben/utils';

import { Button, message, Progress, Tag, Upload } from 'ant-design-vue';

import {
  deleteSelfScoreAttachment,
  getSelfScoreAttachmentDownloadUrl,
  getSelfScoreAttachmentList,
  uploadSelfScoreAttachment,
} from '#/api/fdmperformance';

type UploadTaskStatus = 'error' | 'uploading';

interface UploadTask {
  errorMessage?: string;
  file: File;
  percent: number;
  status: UploadTaskStatus;
  uid: string;
}

defineOptions({ name: 'FdmPerformanceSelfScoreAttachmentPanel' });

const props = withDefaults(
  defineProps<{
    editable?: boolean;
    instanceId: number | string;
    taskId?: string;
  }>(),
  { editable: false },
);

const emit = defineEmits<{
  errorChange: [hasError: boolean];
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

const attachments = ref<JixiaoApi.SelfScoreAttachment[]>([]);
const attachmentLoading = ref(false);
const deletingIds = reactive(new Set<string>());
const downloadingIds = reactive(new Set<string>());
const uploadTasks = ref<UploadTask[]>([]);
let reservedUploadCount = 0;
let reservedUploadBytes = 0;

const uploading = computed(() =>
  uploadTasks.value.some((task) => task.status === 'uploading'),
);
const hasUploadError = computed(() =>
  uploadTasks.value.some((task) => task.status === 'error'),
);
const canUpload = computed(
  () => props.editable && !!props.taskId && !attachmentLoading.value,
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
watch(
  () => props.instanceId,
  () => {
    uploadTasks.value = [];
    reservedUploadCount = 0;
    reservedUploadBytes = 0;
    void loadAttachments();
  },
  { immediate: true },
);

function normalizedInstanceId() {
  const value = Number(props.instanceId);
  return Number.isSafeInteger(value) && value > 0 ? value : undefined;
}

function nextTaskId() {
  return (
    globalThis.crypto?.randomUUID?.() ??
    `self-score-attachment-${Date.now()}-${Math.random().toString(36).slice(2)}`
  );
}

function fileExtension(fileName: string) {
  const match = fileName.toLowerCase().match(/\.([^.]+)$/);
  return match?.[1] ?? '';
}

function readableSize(size?: number) {
  return size === undefined || size === null || size < 0
    ? ''
    : formatFileSize(size);
}

async function loadAttachments() {
  const instanceId = normalizedInstanceId();
  if (!instanceId) {
    attachments.value = [];
    return;
  }
  attachmentLoading.value = true;
  try {
    attachments.value = await getSelfScoreAttachmentList(instanceId);
  } catch {
    attachments.value = [];
    message.error('员工自评附件加载失败，请稍后重试');
  } finally {
    attachmentLoading.value = false;
  }
}

function beforeUpload(file: File) {
  if (!canUpload.value) {
    message.warning('只有当前员工自评步骤可以上传附件');
    return Upload.LIST_IGNORE;
  }
  if (
    attachments.value.length + uploadTasks.value.length + reservedUploadCount >=
    MAX_ATTACHMENT_COUNT
  ) {
    message.error(`员工自评最多上传 ${MAX_ATTACHMENT_COUNT} 个附件`);
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
  const attachmentBytes = attachments.value.reduce(
    (total, attachment) => total + Math.max(0, attachment.fileSize ?? 0),
    0,
  );
  const taskBytes = uploadTasks.value.reduce(
    (total, task) => total + Math.max(0, task.file.size),
    0,
  );
  if (
    attachmentBytes + taskBytes + reservedUploadBytes + file.size >
    MAX_TOTAL_SIZE_BYTES
  ) {
    message.error('员工自评附件总大小不能超过 100 MB');
    return Upload.LIST_IGNORE;
  }
  reservedUploadCount += 1;
  reservedUploadBytes += file.size;
  return true;
}

function removeTask(task: UploadTask) {
  uploadTasks.value = uploadTasks.value.filter((item) => item.uid !== task.uid);
}

function normalizeAttachment(
  result: JixiaoApi.SelfScoreAttachment,
  file: File,
): JixiaoApi.SelfScoreAttachment {
  if (!result || !result.id) {
    throw new Error('附件上传响应缺少附件 ID');
  }
  return {
    ...result,
    fileName: String(result.fileName || file.name),
    fileSize: result.fileSize ?? file.size,
    id: String(result.id),
    instanceId: String(result.instanceId || props.instanceId),
    mimeType: result.mimeType || file.type || undefined,
  };
}

async function performUpload(task: UploadTask, request?: UploadRequestOption) {
  const instanceId = normalizedInstanceId();
  const taskId = props.taskId;
  if (!instanceId || !taskId) {
    task.status = 'error';
    task.errorMessage = '当前员工自评任务已失效，请刷新页面后重试';
    request?.onError?.(new Error(task.errorMessage));
    return;
  }
  task.status = 'uploading';
  task.errorMessage = undefined;
  task.percent = 0;
  try {
    const result = await uploadSelfScoreAttachment(
      task.file,
      instanceId,
      taskId,
      (event) => {
        if (!event?.total) return;
        task.percent = Math.min(
          99,
          Math.round((event.loaded / event.total) * 100),
        );
        request?.onProgress?.({ percent: task.percent });
      },
    );
    const attachment = normalizeAttachment(result, task.file);
    task.percent = 100;
    request?.onSuccess?.(attachment);
    removeTask(task);
    if (!attachments.value.some((item) => item.id === attachment.id)) {
      attachments.value = [...attachments.value, attachment];
    }
    message.success(`${attachment.fileName} 已上传`);
  } catch (error) {
    const normalizedError =
      error instanceof Error ? error : new Error('附件上传失败，请稍后重试');
    task.status = 'error';
    task.errorMessage = normalizedError.message || '附件上传失败，请稍后重试';
    request?.onError?.(normalizedError);
    message.error(`${task.file.name} 上传失败`);
  }
}

function customRequest(request: UploadRequestOption) {
  const file = request.file as File;
  reservedUploadCount = Math.max(0, reservedUploadCount - 1);
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

function retryUpload(task: UploadTask) {
  if (!canUpload.value || task.status !== 'error') return;
  void performUpload(task);
}

async function removeAttachment(attachment: JixiaoApi.SelfScoreAttachment) {
  const instanceId = normalizedInstanceId();
  const taskId = props.taskId;
  if (
    !instanceId ||
    !taskId ||
    !props.editable ||
    deletingIds.has(attachment.id)
  ) {
    return;
  }
  deletingIds.add(attachment.id);
  try {
    await deleteSelfScoreAttachment(attachment.id, instanceId, taskId);
    attachments.value = attachments.value.filter(
      (item) => item.id !== attachment.id,
    );
    message.success('附件已删除');
  } catch {
    message.error('附件删除失败，请稍后重试');
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

async function downloadAttachment(attachment: JixiaoApi.SelfScoreAttachment) {
  if (downloadingIds.has(attachment.id)) return;
  const popup = createDownloadPopup();
  if (!popup) return;
  downloadingIds.add(attachment.id);
  try {
    const downloadUrl = await getSelfScoreAttachmentDownloadUrl(attachment.id);
    popup.location.replace(safeDownloadUrl(downloadUrl));
  } catch {
    popup.close();
    message.error('附件下载地址获取失败，请稍后重试');
  } finally {
    downloadingIds.delete(attachment.id);
  }
}
</script>

<template>
  <section class="self-score-attachments">
    <div class="self-score-attachments__header">
      <div>
        <h3>员工自评附件</h3>
        <p>自评佐证资料会保留在本考核实例中，后续流程可查看并下载。</p>
      </div>
      <Tag v-if="attachments.length" color="blue">
        {{ attachments.length }} 个附件
      </Tag>
    </div>

    <Upload.Dragger
      v-if="editable"
      :accept="ACCEPT"
      :before-upload="beforeUpload"
      :custom-request="customRequest"
      :disabled="!canUpload || remainingCount === 0"
      multiple
      :show-upload-list="false"
    >
      <p class="ant-upload-drag-icon">
        <IconifyIcon icon="lucide:cloud-upload" />
      </p>
      <p class="ant-upload-text">点击或拖拽上传自评佐证材料</p>
      <p class="ant-upload-hint">
        最多 20 个，单个不超过 20 MB、合计不超过 100 MB；支持常用文档、图片和
        ZIP 压缩包
      </p>
    </Upload.Dragger>

    <div v-if="editable" class="self-score-attachments__summary">
      <span>已上传 {{ attachments.length }} / {{ MAX_ATTACHMENT_COUNT }}</span>
      <span v-if="uploading" class="self-score-attachments__uploading">
        正在上传，请完成后再提交自评
      </span>
      <span v-if="hasUploadError" class="self-score-attachments__error">
        存在上传失败的文件，请重试或移除
      </span>
    </div>

    <div v-if="uploadTasks.length" class="self-score-attachments__list">
      <div
        v-for="task in uploadTasks"
        :key="task.uid"
        class="self-score-attachments__item"
      >
        <div class="self-score-attachments__file">
          <IconifyIcon icon="lucide:file-up" />
          <span :title="task.file.name">{{ task.file.name }}</span>
          <small>{{ readableSize(task.file.size) }}</small>
        </div>
        <div class="self-score-attachments__actions">
          <Progress
            v-if="task.status === 'uploading'"
            :percent="task.percent"
            :show-info="false"
            size="small"
          />
          <template v-else>
            <span class="self-score-attachments__error">{{
              task.errorMessage
            }}</span>
            <Button size="small" type="link" @click="retryUpload(task)"
              >重试</Button
            >
            <Button size="small" type="link" @click="removeTask(task)"
              >移除</Button
            >
          </template>
        </div>
      </div>
    </div>

    <div v-if="attachments.length" class="self-score-attachments__list">
      <div
        v-for="attachment in attachments"
        :key="attachment.id"
        class="self-score-attachments__item"
      >
        <div class="self-score-attachments__file">
          <IconifyIcon icon="lucide:paperclip" />
          <span :title="attachment.fileName">{{ attachment.fileName }}</span>
          <small>{{ readableSize(attachment.fileSize) }}</small>
          <small v-if="attachment.uploaderName"
            >上传人：{{ attachment.uploaderName }}</small
          >
        </div>
        <div class="self-score-attachments__actions">
          <Button
            :loading="downloadingIds.has(attachment.id)"
            size="small"
            type="link"
            @click="downloadAttachment(attachment)"
          >
            下载
          </Button>
          <Button
            v-if="editable"
            danger
            :loading="deletingIds.has(attachment.id)"
            size="small"
            type="link"
            @click="removeAttachment(attachment)"
          >
            删除
          </Button>
        </div>
      </div>
    </div>

    <div
      v-else-if="!uploadTasks.length && !attachmentLoading"
      class="self-score-attachments__empty"
    >
      暂无员工自评附件
    </div>
  </section>
</template>

<style scoped>
.self-score-attachments {
  min-width: 0;
}

.self-score-attachments__header {
  display: flex;
  gap: 16px;
  align-items: flex-start;
  justify-content: space-between;
  margin-bottom: 12px;
}

.self-score-attachments__header h3 {
  margin: 0 0 4px;
  font-size: 15px;
  font-weight: 600;
  color: #1f2937;
}

.self-score-attachments__header p {
  margin: 0;
  font-size: 13px;
  color: #64748b;
}

.self-score-attachments__summary {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  margin-top: 8px;
  font-size: 13px;
  color: #64748b;
}

.self-score-attachments__uploading {
  color: #1677ff;
}

.self-score-attachments__error {
  color: #d9363e;
}

.self-score-attachments__list {
  display: grid;
  gap: 8px;
  margin-top: 12px;
}

.self-score-attachments__item {
  display: flex;
  gap: 12px;
  align-items: center;
  justify-content: space-between;
  padding: 8px 10px;
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  border-radius: 6px;
}

.self-score-attachments__file {
  display: flex;
  flex: 1;
  gap: 8px;
  align-items: center;
  min-width: 0;
  color: #334155;
}

.self-score-attachments__file > span {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.self-score-attachments__file small {
  flex: none;
  color: #94a3b8;
}

.self-score-attachments__actions {
  display: flex;
  flex: none;
  gap: 4px;
  align-items: center;
  min-width: 132px;
}

.self-score-attachments__actions :deep(.ant-progress) {
  min-width: 96px;
}

.self-score-attachments__empty {
  padding: 18px;
  color: #94a3b8;
  text-align: center;
  background: #f8fafc;
  border: 1px dashed #cbd5e1;
  border-radius: 6px;
}

@media (max-width: 640px) {
  .self-score-attachments__item {
    align-items: flex-start;
    flex-direction: column;
  }

  .self-score-attachments__actions {
    min-width: 0;
  }
}
</style>
