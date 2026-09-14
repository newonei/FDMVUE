import { describe, expect, it } from 'vitest';

import {
  MAX_ATTACHMENT_BYTES,
  MAX_SUBMISSION_BYTES,
  submissionFilesError,
  submissionFormData,
} from './submission-files';

describe('business document attachment submission', () => {
  it('accepts supported multiple files and rejects empty, oversized and unsafe names before submitting', () => {
    expect(
      submissionFilesError([
        { name: '合同.PDF', size: 100 },
        { name: '产品资料.xlsx', size: 200 },
      ]),
    ).toBe('');
    expect(submissionFilesError([{ name: 'empty.pdf', size: 0 }])).toContain(
      '大于 0',
    );
    expect(
      submissionFilesError([
        { name: 'large.pdf', size: MAX_ATTACHMENT_BYTES + 1 },
      ]),
    ).toContain('20 MB');
    expect(submissionFilesError([{ name: '../合同.pdf', size: 1 }])).toContain(
      '文件名',
    );
    expect(submissionFilesError([{ name: 'program.exe', size: 1 }])).toContain(
      '文件格式',
    );
  });

  it('bounds the entire submission count and total without rejecting a valid boundary', () => {
    expect(
      submissionFilesError(
        Array.from({ length: 11 }, (_, i) => ({ name: `${i}.txt`, size: 1 })),
      ),
    ).toContain('10 个');
    expect(
      submissionFilesError(
        [20, 20, 10].map((n, i) => ({
          name: `${i}.pdf`,
          size: n * 1024 * 1024,
        })),
      ),
    ).toBe('');
    expect(
      submissionFilesError([
        { name: '1.pdf', size: MAX_ATTACHMENT_BYTES },
        { name: '2.pdf', size: MAX_ATTACHMENT_BYTES },
        {
          name: '3.pdf',
          size: MAX_SUBMISSION_BYTES - 2 * MAX_ATTACHMENT_BYTES + 1,
        },
      ]),
    ).toContain('50 MB');
  });

  it('sends the original command as JSON and preserves repeated file parts in order', async () => {
    const first = new File(['contract'], '合同.txt', { type: 'text/plain' });
    const second = new File(['invoice'], '发票.txt', { type: 'text/plain' });
    const command = {
      idempotencyKey: 'stable-key',
      payload: { name: '带附件采购申请' },
    };
    const form = submissionFormData(command, [first, second]);
    const request = form.get('request') as Blob;
    expect(request.type).toBe('application/json');
    expect(JSON.parse(await request.text())).toEqual(command);
    const files = form.getAll('files') as File[];
    expect(files.map((file) => file.name)).toEqual(['合同.txt', '发票.txt']);
    expect(await Promise.all(files.map((file) => file.text()))).toEqual([
      'contract',
      'invoice',
    ]);
    expect(form.has('files[0]')).toBe(false);
    expect(command).toEqual({
      idempotencyKey: 'stable-key',
      payload: { name: '带附件采购申请' },
    });
  });

  it('preserves the command and files on retry and binds customs categories by the same order', async () => {
    const files = [new File(['a'], 'a.txt'), new File(['b'], 'b.txt')];
    const data = { idempotencyKey: 'retry-same-command' };
    const categories = ['CONTRACT', 'SUPPLEMENT'];
    const before = submissionFormData(data, files, categories);
    const retried = submissionFormData(data, files, categories);
    expect(await (before.get('request') as Blob).text()).toEqual(
      await (retried.get('request') as Blob).text(),
    );
    expect(
      JSON.parse(await (retried.get('fileCategories') as Blob).text()),
    ).toEqual(categories);
    expect(retried.getAll('files')).toHaveLength(2);
    expect(files).toHaveLength(2);
    expect(() => submissionFormData(data, files, ['SUPPLEMENT'])).toThrow(
      '分类数量',
    );
  });
});
