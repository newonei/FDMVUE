export type FilePreviewKind = 'image' | 'pdf';

/** 浏览器能直接打开的附件：PDF 和常见图片；其他格式仍只提供下载 */
export function filePreviewKind(name?: string): FilePreviewKind | undefined {
  if (/\.pdf$/i.test(name ?? '')) return 'pdf';
  if (/\.(png|jpe?g|gif|webp|bmp)$/i.test(name ?? '')) return 'image';
  return undefined;
}
