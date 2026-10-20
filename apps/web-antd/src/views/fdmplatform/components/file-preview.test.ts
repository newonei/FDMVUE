import { describe, expect, it } from 'vitest';

import { filePreviewKind } from './file-preview';

describe('filePreviewKind', () => {
  it('previews PDF and common images regardless of case', () => {
    expect(filePreviewKind('PI.PDF')).toBe('pdf');
    expect(filePreviewKind('报关单.pdf')).toBe('pdf');
    expect(filePreviewKind('logo.JPG')).toBe('image');
    expect(filePreviewKind('scan.webp')).toBe('image');
  });

  it('leaves other files download-only', () => {
    expect(filePreviewKind('合同.docx')).toBeUndefined();
    expect(filePreviewKind('pdf')).toBeUndefined();
    expect(filePreviewKind(undefined)).toBeUndefined();
  });
});
