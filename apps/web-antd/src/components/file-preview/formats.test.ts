import { describe, expect, it } from 'vitest';

import { fileExtension, previewMimeType, resolvePreview } from './formats';

describe('file preview formats', () => {
  it.each(['doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'docm', 'xlsm', 'pptm', 'odt', 'ods', 'odp', 'rtf'])(
    'recognizes %s with generic storage MIME',
    (extension) => {
      expect(resolvePreview(`附件.${extension}`, 'application/octet-stream')).toEqual({ extension, kind: 'office' });
    },
  );

  it('handles signed URLs, Windows paths, uppercase extensions and MIME-only names', () => {
    expect(fileExtension('https://files.example.com/附件.DOCX?signature=x#page=1')).toBe('docx');
    expect(fileExtension('C:\\folder.ext\\附件.XLS')).toBe('xls');
    expect(fileExtension('https://example.com/folder.ext/file')).toBe('');
    expect(resolvePreview('opaque-id', 'application/vnd.ms-powerpoint')).toEqual({ extension: 'ppt', kind: 'office' });
    expect(resolvePreview('opaque-id', '.PDF')).toEqual({ extension: 'pdf', kind: 'pdf' });
  });

  it.each(['html', 'htm', 'xml', 'js', 'csv', 'md', 'json', 'txt'])(
    'treats %s as inert text',
    (extension) => {
      expect(resolvePreview(`附件.${extension}`).kind).toBe('text');
      expect(previewMimeType(`附件.${extension}`)).toBe('text/plain');
    },
  );

  it('preserves native media and unsupported format classification', () => {
    expect(resolvePreview('a.png').kind).toBe('image');
    expect(resolvePreview('a.pdf').kind).toBe('pdf');
    expect(resolvePreview('a.mp4').kind).toBe('video');
    expect(resolvePreview('a.mp3').kind).toBe('audio');
    expect(resolvePreview('a.zip').kind).toBe('unsupported');
    expect(resolvePreview('').kind).toBe('unsupported');
  });
});
