import { formatDateTime } from '@vben/utils';

export { previewMimeType } from '#/components/file-preview/formats';

/** 附件上传时间：兼容毫秒与 ISO，统一按用户所选时区显示。 */
export function attachmentTime(value?: null | number | string) {
  return formatDateTime(value ?? undefined) || '—';
}
