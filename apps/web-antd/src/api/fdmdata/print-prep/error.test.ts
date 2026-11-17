import { describe, expect, it } from 'vitest';

import { normalizePrintPrepError } from './error';

describe('print preparation gateway errors', () => {
  it('replaces nginx HTML with a backend recovery message', () => {
    const message = normalizePrintPrepError(
      '<html><head><title>502 Bad Gateway</title></head><body><center><h1>502 Bad Gateway</h1></center></body></html>',
      502,
    );
    expect(message).toContain('8090');
    expect(message).toContain('502');
    expect(message).not.toContain('<html>');
  });

  it('normalizes a gateway page embedded in a job error', () => {
    expect(normalizePrintPrepError('<html><h1>502 Bad Gateway</h1></html>')).toContain('Python');
  });

  it('does not advise resubmitting a generation on gateway timeout', () => {
    expect(normalizePrintPrepError('Gateway Timeout', 504)).toContain('避免重复提交');
  });

  it('preserves useful structured backend errors', () => {
    expect(normalizePrintPrepError('所选图片模型已不可用', 500)).toBe('所选图片模型已不可用');
  });
});
