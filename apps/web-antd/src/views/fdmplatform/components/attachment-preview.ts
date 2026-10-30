import { formatDateTime } from '@vben/utils';

const PREVIEW_TYPES: Record<string, string> = {
  gif: 'image/gif',
  jpeg: 'image/jpeg',
  jpg: 'image/jpeg',
  pdf: 'application/pdf',
  png: 'image/png',
  txt: 'text/plain',
  webp: 'image/webp',
};

/** 可在线预览的附件返回浏览器内嵌显示所需的类型，其余返回 undefined */
export function previewMimeType(fileName: string): string | undefined {
  const index = fileName.lastIndexOf('.');
  return index === -1
    ? undefined
    : PREVIEW_TYPES[fileName.slice(index + 1).toLowerCase()];
}

/** 附件上传时间：兼容毫秒与 ISO，统一按用户所选时区显示。 */
export function attachmentTime(value?: null | number | string) {
  return formatDateTime(value ?? undefined) || '—';
}
