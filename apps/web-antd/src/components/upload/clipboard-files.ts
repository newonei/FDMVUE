export const FILE_PASTE_HINT = '点击此处后按 Ctrl+V / ⌘V 粘贴截图或文件';

export function takePastedFiles(event: ClipboardEvent): File[] {
  const data = event.clipboardData;
  if (event.defaultPrevented || !data) return [];

  const files = [...data.files];
  if (files.length === 0) {
    for (const item of data.items ?? []) {
      if (item.kind !== 'file') continue;
      const file = item.getAsFile();
      if (file) files.push(file);
    }
  }

  if (files.length > 0) {
    event.preventDefault();
    event.stopPropagation();
  }
  return files;
}
