import { previewMimeType } from './attachment-preview';

export type FilePreviewKind = 'image' | 'pdf' | 'text';

/** 与合同附件共用格式识别；其他格式仍只提供下载。 */
export function filePreviewKind(name?: string): FilePreviewKind | undefined {
  const type = previewMimeType(name ?? '');
  if (type === 'application/pdf') return 'pdf';
  if (type?.startsWith('image/')) return 'image';
  if (type === 'text/plain') return 'text';
  return undefined;
}
