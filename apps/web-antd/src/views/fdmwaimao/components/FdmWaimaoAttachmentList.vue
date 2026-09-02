<script lang="ts" setup>
import type { FdmWaimaoAttachmentApi } from '#/api/fdmwaimao/attachment';

import { computed, reactive, ref, watch } from 'vue';

import { IconifyIcon } from '@vben/icons';
import { formatFileSize, getFileIcon } from '@vben/utils';

import {
  Alert,
  Button,
  Empty,
  message,
  Skeleton,
  Tag,
  Typography,
} from 'ant-design-vue';
import dayjs from 'dayjs';

import {
  getFdmWaimaoAttachmentDownloadUrl,
  getFdmWaimaoAttachmentList,
} from '#/api/fdmwaimao/attachment';

defineOptions({ name: 'FdmWaimaoAttachmentList' });

const props = withDefaults(
  defineProps<{
    attachments?: FdmWaimaoAttachmentApi.Attachment[];
    businessId?: string;
    businessType?: FdmWaimaoAttachmentApi.BusinessType;
    emptyText?: string;
    showStatus?: boolean;
  }>(),
  {
    attachments: undefined,
    businessId: undefined,
    businessType: undefined,
    emptyText: '暂无附件',
    showStatus: false,
  },
);

const downloadingIds = reactive(new Set<string>());
const loadedAttachments = ref<FdmWaimaoAttachmentApi.Attachment[]>([]);
const loading = ref(false);
const loadError = ref('');
let loadRequestVersion = 0;

const usesProvidedAttachments = computed(() => props.attachments !== undefined);
const attachmentList = computed(() =>
  usesProvidedAttachments.value
    ? (props.attachments ?? [])
    : loadedAttachments.value,
);

async function loadAttachments() {
  const version = ++loadRequestVersion;
  loadError.value = '';

  if (usesProvidedAttachments.value) {
    loadedAttachments.value = [];
    loading.value = false;
    return;
  }

  const businessId = props.businessId;
  const businessType = props.businessType;
  if (!businessId || !businessType) {
    loadedAttachments.value = [];
    loading.value = false;
    return;
  }

  loading.value = true;
  try {
    const result = await getFdmWaimaoAttachmentList(
      businessType,
      String(businessId),
    );
    if (version !== loadRequestVersion) return;
    loadedAttachments.value = Array.isArray(result) ? result : [];
  } catch {
    if (version !== loadRequestVersion) return;
    loadedAttachments.value = [];
    loadError.value = '附件读取失败，请稍后重试';
  } finally {
    if (version === loadRequestVersion) loading.value = false;
  }
}

watch(
  () => [props.attachments, props.businessId, props.businessType] as const,
  () => void loadAttachments(),
  { immediate: true },
);

function formatAttachmentSize(size?: number) {
  return typeof size === 'number' && Number.isFinite(size) && size >= 0
    ? formatFileSize(size)
    : '';
}

function formatAttachmentTime(value?: FdmWaimaoAttachmentApi.DateTimeValue) {
  if (value === undefined || value === null || value === '') return '';
  const parsed = dayjs(value);
  return parsed.isValid() ? parsed.format('YYYY-MM-DD HH:mm') : '';
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
    popup.document.body.style.cssText =
      'padding:24px;font:14px/1.6 system-ui,sans-serif;color:#475569;';
  } catch {
    // 空白窗口初始化失败不影响后续跳转，opener 已显式清除。
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
</script>

<template>
  <Skeleton v-if="loading" active :paragraph="{ rows: 2 }" />
  <Alert v-else-if="loadError" :message="loadError" show-icon type="warning">
    <template #action>
      <Button size="small" @click="loadAttachments">重试</Button>
    </template>
  </Alert>
  <div v-else-if="attachmentList.length" class="fdm-attachment-list">
    <div
      v-for="attachment in attachmentList"
      :key="attachment.id"
      class="fdm-attachment-list__item"
    >
      <span class="fdm-attachment-list__icon" aria-hidden="true">
        <IconifyIcon :icon="getFileIcon(attachment.fileName)" />
      </span>

      <div class="fdm-attachment-list__content">
        <Typography.Text
          class="fdm-attachment-list__name"
          :title="attachment.fileName"
        >
          {{ attachment.fileName }}
        </Typography.Text>
        <div class="fdm-attachment-list__meta">
          <span v-if="formatAttachmentSize(attachment.fileSize)">
            {{ formatAttachmentSize(attachment.fileSize) }}
          </span>
          <span v-if="attachment.uploaderName">
            {{ attachment.uploaderName }}
          </span>
          <span v-if="formatAttachmentTime(attachment.createTime)">
            {{ formatAttachmentTime(attachment.createTime) }}
          </span>
          <Tag
            v-if="showStatus"
            :color="attachment.status === 'BOUND' ? 'green' : 'orange'"
          >
            {{ attachment.status === 'BOUND' ? '已绑定' : '待保存' }}
          </Tag>
        </div>
      </div>

      <Button
        :loading="downloadingIds.has(attachment.id)"
        size="small"
        type="link"
        @click="downloadAttachment(attachment)"
      >
        下载
      </Button>
    </div>
  </div>
  <Empty
    v-else
    :description="emptyText"
    :image="Empty.PRESENTED_IMAGE_SIMPLE"
  />
</template>

<style scoped>
.fdm-attachment-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.fdm-attachment-list__item {
  display: flex;
  min-width: 0;
  align-items: center;
  gap: 12px;
  padding: 10px 12px;
  background: #fafafa;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
}

.fdm-attachment-list__icon {
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

.fdm-attachment-list__content {
  min-width: 0;
  flex: 1;
}

.fdm-attachment-list__name {
  display: block;
  overflow: hidden;
  font-weight: 500;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.fdm-attachment-list__meta {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px 12px;
  margin-top: 3px;
  font-size: 12px;
  color: #8c8c8c;
}
</style>
