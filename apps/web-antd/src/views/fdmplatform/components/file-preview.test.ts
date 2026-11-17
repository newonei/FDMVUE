import { describe, expect, it, vi } from 'vitest';

import { filePreviewKind } from './file-preview';

vi.mock(
  '#/components/file-preview/formats',
  () => import('../../../components/file-preview/formats'),
);

describe('filePreviewKind', () => {
  it('previews PDF and common images regardless of case', () => {
    expect(filePreviewKind('PI.PDF')).toBe('pdf');
    expect(filePreviewKind('报关单.pdf')).toBe('pdf');
    expect(filePreviewKind('logo.JPG')).toBe('image');
    expect(filePreviewKind('scan.webp')).toBe('image');
  });

  it('routes Office and text attachments to the shared preview', () => {
    expect(filePreviewKind('合同.docx')).toBe('office');
    expect(filePreviewKind('采购单.xls')).toBe('office');
    expect(filePreviewKind('汇报.pptx')).toBe('office');
    expect(filePreviewKind('明细.csv')).toBe('text');
  });

  it('does not mistake unknown file names for supported formats', () => {
    expect(filePreviewKind('压缩包.zip')).toBeUndefined();
    expect(filePreviewKind('pdf')).toBeUndefined();
    expect(filePreviewKind(undefined)).toBeUndefined();
  });
});
