export const MAX_SUBMISSION_FILES = 10;
export const MAX_ATTACHMENT_BYTES = 20 * 1024 * 1024;
export const MAX_SUBMISSION_BYTES = 50 * 1024 * 1024;
export const ATTACHMENT_ACCEPT =
  '.pdf,.png,.jpg,.jpeg,.webp,.xlsx,.xls,.docx,.doc,.csv,.txt';

type FileInfo = Pick<File, 'name' | 'size'>;
const extensions = new Set(
  ATTACHMENT_ACCEPT.split(',').map((value) => value.slice(1)),
);

export function submissionFilesError(files: readonly FileInfo[]): string {
  if (files.length > MAX_SUBMISSION_FILES) return '每次最多添加 10 个附件';
  let total = 0;
  for (const file of files) {
    if (
      !file.name.trim() ||
      file.name.length > 180 ||
      file.name.includes('/') ||
      file.name.includes('\\') ||
      [...file.name].some((character) => (character.codePointAt(0) ?? 32) < 32)
    )
      return `附件文件名不合法：${file.name}`;
    if (!extensions.has(file.name.split('.').at(-1)?.toLowerCase() ?? ''))
      return `不支持 ${file.name} 的文件格式，请选择 PDF、图片、Word、Excel、CSV 或 TXT`;
    if (
      !Number.isFinite(file.size) ||
      file.size <= 0 ||
      file.size > MAX_ATTACHMENT_BYTES
    )
      return `${file.name} 大小须大于 0 且不超过 20 MB`;
    total += file.size;
  }
  return total > MAX_SUBMISSION_BYTES
    ? '本次附件总大小不能超过 50 MB，请减少文件或压缩后重试'
    : '';
}

export function attachmentSize(size: number): string {
  return size >= 1024 * 1024
    ? `${(size / (1024 * 1024)).toFixed(1)} MB`
    : `${Math.max(0.1, size / 1024).toFixed(1)} KB`;
}

export function submissionFormData(
  request: unknown,
  files: readonly File[],
  categories?: readonly string[],
): FormData {
  const error = submissionFilesError(files);
  if (error) throw new Error(error);
  if (categories && categories.length !== files.length)
    throw new Error('附件分类数量与文件数量不一致');
  const form = new FormData();
  form.append(
    'request',
    new Blob([JSON.stringify(request)], { type: 'application/json' }),
  );
  for (const file of files) form.append('files', file, file.name);
  if (categories)
    form.append(
      'fileCategories',
      new Blob([JSON.stringify(categories)], { type: 'application/json' }),
    );
  return form;
}
