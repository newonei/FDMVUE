export type PreviewKind = 'audio' | 'image' | 'office' | 'pdf' | 'text' | 'unsupported' | 'video';

const types: Record<string, string> = {
  bmp: 'image/bmp', gif: 'image/gif', jpeg: 'image/jpeg', jpg: 'image/jpeg',
  png: 'image/png', svg: 'image/svg+xml', webp: 'image/webp', avif: 'image/avif',
  pdf: 'application/pdf', doc: 'application/msword', dot: 'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  docm: 'application/vnd.ms-word.document.macroEnabled.12',
  dotx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.template',
  dotm: 'application/vnd.ms-word.template.macroEnabled.12',
  xls: 'application/vnd.ms-excel', xlt: 'application/vnd.ms-excel',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  xlsm: 'application/vnd.ms-excel.sheet.macroEnabled.12',
  xltx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.template',
  xltm: 'application/vnd.ms-excel.template.macroEnabled.12',
  ppt: 'application/vnd.ms-powerpoint', pot: 'application/vnd.ms-powerpoint', pps: 'application/vnd.ms-powerpoint',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  pptm: 'application/vnd.ms-powerpoint.presentation.macroEnabled.12',
  potx: 'application/vnd.openxmlformats-officedocument.presentationml.template',
  potm: 'application/vnd.ms-powerpoint.template.macroEnabled.12',
  ppsx: 'application/vnd.openxmlformats-officedocument.presentationml.slideshow',
  ppsm: 'application/vnd.ms-powerpoint.slideshow.macroEnabled.12',
  odt: 'application/vnd.oasis.opendocument.text', ods: 'application/vnd.oasis.opendocument.spreadsheet',
  odp: 'application/vnd.oasis.opendocument.presentation', rtf: 'application/rtf',
  mp4: 'video/mp4', m4v: 'video/mp4', mov: 'video/quicktime', webm: 'video/webm', ogv: 'video/ogg',
  aac: 'audio/aac', flac: 'audio/flac', m4a: 'audio/mp4', mp3: 'audio/mpeg', wav: 'audio/wav', ogg: 'audio/ogg',
};
const textExtensions = new Set(['txt', 'csv', 'tsv', 'md', 'json', 'xml', 'log', 'yaml', 'yml', 'html', 'htm', 'css', 'js', 'ts', 'sql']);
const officeExtensions = new Set(Object.keys(types).filter((ext) => types[ext]!.startsWith('application/') && ext !== 'pdf'));

export function fileExtension(name: string): string {
  const path = name.split(/[?#]/)[0] ?? '';
  const base = path.split(/[\\/]/).at(-1) ?? '';
  const dot = base.lastIndexOf('.');
  return dot < 0 ? '' : base.slice(dot + 1).toLowerCase();
}

export function previewMimeType(name: string): string | undefined {
  const ext = fileExtension(name);
  return textExtensions.has(ext) ? 'text/plain' : types[ext];
}

export function resolvePreview(name: string, declaredType = ''): { extension: string; kind: PreviewKind } {
  const declared = declaredType.trim().toLowerCase().replace(/^\./, '');
  const ext = fileExtension(name) || (declared.includes('/') ? '' : declared) ||
    Object.keys(types).find((key) => types[key]!.toLowerCase() === declared) || '';
  const mime = types[ext]?.toLowerCase() || declared;
  let kind: PreviewKind = 'unsupported';
  if (officeExtensions.has(ext)) kind = 'office';
  else if (textExtensions.has(ext) || mime.startsWith('text/')) kind = 'text';
  else if (ext === 'pdf' || mime === 'application/pdf') kind = 'pdf';
  else if (mime.startsWith('image/')) kind = 'image';
  else if (mime.startsWith('video/')) kind = 'video';
  else if (mime.startsWith('audio/')) kind = 'audio';
  return { extension: ext, kind };
}
