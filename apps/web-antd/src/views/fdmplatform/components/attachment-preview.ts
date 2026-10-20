import dayjs from 'dayjs';

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

/** 附件上传时间：后端返回 ISO 时间戳，界面统一显示到分钟 */
export function attachmentTime(value?: null | number | string) {
  return value ? dayjs(value).format('YYYY-MM-DD HH:mm') : '—';
}
