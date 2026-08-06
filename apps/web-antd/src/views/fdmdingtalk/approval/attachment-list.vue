<script lang="ts" setup>
import type { DingTalkApprovalApi } from '#/api/fdmdingtalk/approval';

import { computed } from 'vue';

import { IconifyIcon } from '@vben/icons';
import { getFileNameFromUrl, isImage } from '@vben/utils';

import { Button, Image, message, Tag, Typography } from 'ant-design-vue';

import { getDingTalkApprovalAttachmentDownloadUrl } from '#/api/fdmdingtalk/approval';

defineOptions({ name: 'DingTalkApprovalAttachmentList' });

const props = withDefaults(
  defineProps<{
    attachments?: DingTalkApprovalApi.Attachment[];
    images?: string[];
    processInstanceId: string;
  }>(),
  {
    attachments: () => [],
    images: () => [],
  },
);

const attachmentList = computed(() => {
  const result: DingTalkApprovalApi.Attachment[] = [];
  const seen = new Set<string>();

  for (const attachment of props.attachments) {
    const key =
      attachment.fileId?.trim() ||
      attachment.downloadUrl?.trim() ||
      `${attachment.fileName || ''}-${result.length}`;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(attachment);
  }

  for (const [index, imageUrl] of props.images.entries()) {
    const downloadUrl = imageUrl?.trim();
    if (!downloadUrl || seen.has(downloadUrl)) continue;
    seen.add(downloadUrl);
    result.push({
      downloadUrl,
      fileName: fileNameFromUrl(downloadUrl) || `审批图片 ${index + 1}`,
      fileType: 'image',
    });
  }

  return result;
});

function safeHttpUrl(value?: string) {
  const candidate = value?.trim();
  if (!candidate) return undefined;
  try {
    const url = new URL(candidate);
    if (
      !['http:', 'https:'].includes(url.protocol) ||
      url.username ||
      url.password
    ) {
      return undefined;
    }
    return url.href;
  } catch {
    return undefined;
  }
}

function fileNameFromUrl(url: string) {
  try {
    return getFileNameFromUrl(url);
  } catch {
    return '';
  }
}

function attachmentName(
  attachment: DingTalkApprovalApi.Attachment,
  index: number,
) {
  return (
    attachment.fileName?.trim() ||
    (attachment.downloadUrl ? fileNameFromUrl(attachment.downloadUrl) : '') ||
    attachment.fileId?.trim() ||
    `附件 ${index + 1}`
  );
}

function attachmentType(attachment: DingTalkApprovalApi.Attachment) {
  const explicitType = attachment.fileType?.trim();
  if (explicitType) return explicitType;
  const name = attachment.fileName?.trim() || '';
  const extension = name.match(/\.([^.]+)$/)?.[1];
  return extension?.toUpperCase() || '';
}

function attachmentSize(size?: number | string) {
  if (size === undefined || size === '') return '';
  const numericSize = typeof size === 'number' ? size : Number(size.trim());
  if (!Number.isFinite(numericSize) || numericSize < 0) return '';
  if (numericSize < 1024) return `${numericSize} B`;
  const units = ['KB', 'MB', 'GB', 'TB'];
  let currentSize = numericSize / 1024;
  let unitIndex = 0;
  while (currentSize >= 1024 && unitIndex < units.length - 1) {
    currentSize /= 1024;
    unitIndex += 1;
  }
  const digits = currentSize >= 100 ? 0 : currentSize >= 10 ? 1 : 2;
  return `${currentSize.toFixed(digits)} ${units[unitIndex]}`;
}

function isImageAttachment(attachment: DingTalkApprovalApi.Attachment) {
  const type = attachment.fileType?.trim().toLowerCase() || '';
  if (
    type.startsWith('image/') ||
    /^image$|^(bmp|gif|jpe?g|png|svg|webp)$/.test(type)
  ) {
    return true;
  }
  const name = attachment.fileName?.trim() || '';
  return !!name && isImage(name);
}

function canDownload(attachment: DingTalkApprovalApi.Attachment) {
  return !!(safeHttpUrl(attachment.downloadUrl) || attachment.fileId?.trim());
}

function createDownloadPopup() {
  const popup = window.open('about:blank', '_blank');
  if (!popup) {
    message.warning('浏览器阻止了新窗口，请允许弹窗后重试');
    return undefined;
  }

  popup.opener = null;
  try {
    const referrerPolicy = popup.document.createElement('meta');
    referrerPolicy.name = 'referrer';
    referrerPolicy.content = 'no-referrer';
    popup.document.head.append(referrerPolicy);
    popup.document.title = '正在获取附件';
    popup.document.body.textContent = '正在获取安全下载地址，请稍候…';
    popup.document.body.style.cssText =
      'padding:24px;font:14px/1.6 system-ui,sans-serif;color:#475569;';
  } catch {
    // 空白页初始化失败不影响后续导航，opener 已显式清除。
  }
  return popup;
}

function navigateDownloadPopup(popup: Window, url: string) {
  try {
    const link = popup.document.createElement('a');
    link.href = url;
    link.rel = 'noopener noreferrer';
    link.referrerPolicy = 'no-referrer';
    link.target = '_self';
    popup.document.body.append(link);
    link.click();
  } catch {
    popup.location.replace(url);
  }
}

async function downloadAttachment(attachment: DingTalkApprovalApi.Attachment) {
  const popup = createDownloadPopup();
  if (!popup) return;

  try {
    let downloadUrl = safeHttpUrl(attachment.downloadUrl);
    const fileId = attachment.fileId?.trim();
    if (!downloadUrl && fileId) {
      const result = await getDingTalkApprovalAttachmentDownloadUrl(
        props.processInstanceId,
        fileId,
      );
      downloadUrl = safeHttpUrl(result.downloadUrl);
    }
    if (!downloadUrl) {
      throw new Error('No safe attachment download URL');
    }
    navigateDownloadPopup(popup, downloadUrl);
  } catch {
    popup.close();
    message.error('附件下载地址获取失败，请稍后重试');
  }
}
</script>

<template>
  <div v-if="attachmentList.length" class="attachment-list">
    <div
      v-for="(attachment, index) in attachmentList"
      :key="`${attachment.fileId || attachment.downloadUrl || attachment.fileName}-${index}`"
      class="attachment-item"
    >
      <Image
        v-if="
          isImageAttachment(attachment) && safeHttpUrl(attachment.downloadUrl)
        "
        :height="42"
        :src="safeHttpUrl(attachment.downloadUrl)"
        :width="42"
        class="attachment-image"
      />
      <span v-else class="attachment-file-icon">
        <IconifyIcon icon="lucide:file-text" />
      </span>

      <div class="attachment-info">
        <Typography.Text
          class="attachment-name"
          :title="attachmentName(attachment, index)"
        >
          {{ attachmentName(attachment, index) }}
        </Typography.Text>
        <div class="attachment-meta">
          <Tag v-if="attachmentType(attachment)">
            {{ attachmentType(attachment) }}
          </Tag>
          <span v-if="attachmentSize(attachment.fileSize)">
            {{ attachmentSize(attachment.fileSize) }}
          </span>
        </div>
      </div>

      <Button
        :disabled="!canDownload(attachment)"
        size="small"
        type="link"
        @click="downloadAttachment(attachment)"
      >
        下载
      </Button>
    </div>
  </div>
  <span v-else class="attachment-empty">暂无附件</span>
</template>

<style scoped>
.attachment-list {
  display: grid;
  gap: 8px;
  width: 100%;
}

.attachment-item {
  display: flex;
  gap: 10px;
  align-items: center;
  min-width: 0;
  padding: 8px 10px;
  background: hsl(var(--muted) / 60%);
  border: 1px solid hsl(var(--border));
  border-radius: 6px;
}

.attachment-image,
.attachment-file-icon {
  flex: none;
  overflow: hidden;
  border-radius: 4px;
}

.attachment-file-icon {
  display: grid;
  width: 42px;
  height: 42px;
  font-size: 22px;
  color: hsl(var(--muted-foreground));
  background: hsl(var(--background));
  border: 1px solid hsl(var(--border));
  place-items: center;
}

.attachment-info {
  min-width: 0;
  flex: 1;
}

.attachment-name {
  display: block;
  overflow: hidden;
  font-weight: 500;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.attachment-meta {
  display: flex;
  gap: 6px;
  align-items: center;
  margin-top: 4px;
  font-size: 12px;
  color: hsl(var(--muted-foreground));
}

.attachment-meta :deep(.ant-tag) {
  margin-inline-end: 0;
}

.attachment-empty {
  color: hsl(var(--muted-foreground));
}
</style>
