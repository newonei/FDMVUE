import { ref } from 'vue';

import { isImage } from '@vben/utils';

export interface FileSelectRule {
  /** 允许的扩展名（不带点），为空时不限制 */
  accept?: string[];
  maxSizeMb?: number;
}

export interface RejectedFile {
  file: File;
  reason: string;
}

export function toInputAccept(accept?: string[]) {
  return (accept ?? [])
    .map((item) => (item.includes('/') || item.startsWith('.') ? item : `.${item}`))
    .join(',');
}

export function validateFiles(files: File[], rule: FileSelectRule) {
  const accepted: File[] = [];
  const rejected: RejectedFile[] = [];
  for (const file of files) {
    if (rule.accept?.length && !isImage(file.name, rule.accept)) {
      rejected.push({ file, reason: '格式不支持' });
    } else if (rule.maxSizeMb && file.size > rule.maxSizeMb * 1024 * 1024) {
      rejected.push({ file, reason: `超过 ${rule.maxSizeMb}MB` });
    } else if (file.size <= 0) {
      rejected.push({ file, reason: '空文件' });
    } else {
      accepted.push(file);
    }
  }
  return { accepted, rejected };
}

export function describeRejectedFiles(rejected: RejectedFile[]) {
  const preview = rejected
    .slice(0, 3)
    .map((item) => `${item.file.name}（${item.reason}）`)
    .join('、');
  return rejected.length > 3
    ? `${preview} 等 ${rejected.length} 个文件未添加`
    : `${preview} 未添加`;
}

/** 以代码方式打开系统文件选择框 */
export function pickFiles(options: { accept?: string[]; multiple?: boolean }) {
  return new Promise<File[]>((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = toInputAccept(options.accept);
    input.multiple = !!options.multiple;
    input.style.display = 'none';
    const cleanup = () => input.remove();
    input.addEventListener('change', () => {
      resolve([...(input.files ?? [])]);
      cleanup();
    });
    input.addEventListener('cancel', () => {
      resolve([]);
      cleanup();
    });
    document.body.append(input);
    input.click();
  });
}

function readEntryFile(entry: FileSystemFileEntry) {
  return new Promise<File>((resolve, reject) => entry.file(resolve, reject));
}

function readDirectoryBatch(reader: FileSystemDirectoryReader) {
  return new Promise<FileSystemEntry[]>((resolve, reject) =>
    reader.readEntries(resolve, reject),
  );
}

async function collectEntryFiles(entry: FileSystemEntry): Promise<File[]> {
  if (entry.isFile) {
    return [await readEntryFile(entry as FileSystemFileEntry)];
  }
  if (!entry.isDirectory) return [];
  const reader = (entry as FileSystemDirectoryEntry).createReader();
  const files: File[] = [];
  // readEntries 每次最多返回 100 条，需要读到空为止
  for (;;) {
    const batch = await readDirectoryBatch(reader);
    if (batch.length === 0) break;
    for (const child of batch) {
      if (child.name.startsWith('.')) continue;
      files.push(...(await collectEntryFiles(child)));
    }
  }
  return files;
}

/** 读取拖入的文件，拖入文件夹时递归读取其中的文件 */
async function collectDroppedFiles(dataTransfer: DataTransfer) {
  // DataTransfer 在事件结束后失效，必须同步取出 entry
  const entries = [...dataTransfer.items]
    .filter((item) => item.kind === 'file')
    .map((item) => item.webkitGetAsEntry?.() ?? null);
  const fallbackFiles = [...dataTransfer.files];
  if (entries.length === 0 || entries.some((entry) => !entry)) {
    return fallbackFiles;
  }
  const nested = await Promise.all(
    entries.map((entry) => collectEntryFiles(entry as FileSystemEntry)),
  );
  return nested.flat();
}

function hasDraggedFiles(event: DragEvent) {
  return [...(event.dataTransfer?.types ?? [])].includes('Files');
}

/** 给任意元素加上拖放文件的能力：v-on="handlers" */
export function useFileDrop(options: {
  disabled?: () => boolean;
  onDrop: (files: File[]) => void;
}) {
  const dragging = ref(false);
  let depth = 0;

  const handlers = {
    dragenter(event: DragEvent) {
      if (!hasDraggedFiles(event) || options.disabled?.()) return;
      event.preventDefault();
      depth++;
      dragging.value = true;
    },
    dragover(event: DragEvent) {
      if (!hasDraggedFiles(event) || options.disabled?.()) return;
      event.preventDefault();
      if (event.dataTransfer) event.dataTransfer.dropEffect = 'copy';
    },
    dragleave(event: DragEvent) {
      if (!hasDraggedFiles(event)) return;
      depth = Math.max(0, depth - 1);
      if (depth === 0) dragging.value = false;
    },
    drop(event: DragEvent) {
      if (!hasDraggedFiles(event)) return;
      event.preventDefault();
      depth = 0;
      dragging.value = false;
      if (options.disabled?.() || !event.dataTransfer) return;
      void collectDroppedFiles(event.dataTransfer).then((files) => {
        if (files.length > 0) options.onDrop(files);
      });
    },
  };

  return { dragging, handlers };
}
