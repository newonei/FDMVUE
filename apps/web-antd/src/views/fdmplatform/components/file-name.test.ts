import { describe, expect, it } from 'vitest';

import { renamedFileName, renameLocalFile, splitFileName } from './file-name';

describe('attachment rename', () => {
  it('only edits the base name and keeps the original extension', () => {
    expect(splitFileName('报价单.final.pdf')).toEqual({
      base: '报价单.final',
      extension: '.pdf',
    });
    expect(renamedFileName('报价单.pdf', ' 供应商报价 ')).toEqual({
      name: '供应商报价.pdf',
    });
    expect(renamedFileName('报价单.pdf', '  ').error).toContain('不能为空');
    expect(renamedFileName('报价单.pdf', 'a/b').error).toContain('斜杠');
  });

  it('renames a queued local file without changing its content or type', async () => {
    const file = new File(['abc'], 'old.txt', { type: 'text/plain' });
    const renamed = renameLocalFile(file, 'new.txt');
    expect(renamed.name).toBe('new.txt');
    expect(renamed.type).toBe('text/plain');
    expect(await renamed.text()).toBe('abc');
  });
});
