/** 改名只改名称部分，扩展名保持不变（文件内容和类型不会因改名而变化） */
export function splitFileName(name: string) {
  const index = name.lastIndexOf('.');
  return index > 0
    ? { base: name.slice(0, index), extension: name.slice(index) }
    : { base: name, extension: '' };
}

export function renamedFileName(original: string, base: string) {
  const value = base.trim();
  if (!value) return { error: '文件名称不能为空' };
  if (
    /[/\\]/.test(value) ||
    [...value].some((c) => (c.codePointAt(0) ?? 32) < 32)
  )
    return { error: '文件名称不能包含斜杠或控制字符' };
  const name = `${value}${splitFileName(original).extension}`;
  if (name.length > 180) return { error: '文件名称不能超过 180 字' };
  return { name };
}

/** 待上传的本地文件改名：生成同内容的新 File，提交时按新名称上传 */
export function renameLocalFile(file: File, name: string) {
  return new File([file], name, {
    lastModified: file.lastModified,
    type: file.type,
  });
}
