import { webcrypto } from 'node:crypto';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { convertOfficePreview } from './file-preview';

const mocks = vi.hoisted(() => ({
  access: {
    accessToken: 'test-token',
    tenantId: 1,
    visitTenantId: null as null | number,
  },
  upload: vi.fn(),
}));
vi.mock('@vben/stores', () => ({ useAccessStore: () => mocks.access }));
vi.mock('#/api/request', () => ({ requestClient: { upload: mocks.upload } }));

let sequence = 0;
function file(value = 'document', ext = 'docx') {
  return new File([value], `test.${ext}`);
}
function convert(value = file()) {
  return convertOfficePreview(value, new AbortController().signal);
}

beforeEach(() => {
  mocks.access.accessToken = `session-${++sequence}`;
  mocks.access.tenantId = 1;
  mocks.access.visitTenantId = null;
  mocks.upload
    .mockReset()
    .mockResolvedValue(new Blob(['%PDF preview'], { type: 'application/pdf' }));
  vi.stubGlobal('crypto', webcrypto);
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('office preview session cache', () => {
  it('reuses authorized identical bytes even when the source filename changes', async () => {
    const result = await convert();
    expect(await convert(new File(['document'], 'new-name.docx'))).toBe(result);
    expect(mocks.upload).toHaveBeenCalledTimes(1);
    await convert(file('changed'));
    await convert(file('document', 'pptx'));
    expect(mocks.upload).toHaveBeenCalledTimes(3);
  });
  it('isolates tenants, visited tenants and login sessions', async () => {
    await convert();
    mocks.access.visitTenantId = 2;
    await convert();
    mocks.access.tenantId = 3;
    await convert();
    mocks.access.accessToken = 'other-user';
    await convert();
    expect(mocks.upload).toHaveBeenCalledTimes(4);
  });
  it('expires results after ten minutes', async () => {
    const now = Date.now();
    vi.spyOn(Date, 'now').mockReturnValue(now);
    await convert();
    vi.mocked(Date.now).mockReturnValue(now + 600_001);
    await convert();
    expect(mocks.upload).toHaveBeenCalledTimes(2);
  });
  it('does not cache failed or non-PDF responses', async () => {
    mocks.upload.mockRejectedValueOnce(new Error('busy'));
    await expect(convert()).rejects.toThrow('busy');
    mocks.upload.mockResolvedValueOnce(
      new Blob(['error'], { type: 'application/json' }),
    );
    await convert();
    await convert();
    expect(mocks.upload).toHaveBeenCalledTimes(3);
  });
  it('does not return a result after the tenant changes during conversion', async () => {
    mocks.upload.mockImplementationOnce(async () => {
      mocks.access.visitTenantId = 9;
      return new Blob(['%PDF other tenant'], { type: 'application/pdf' });
    });
    await expect(convert()).rejects.toThrow('登录或租户已切换');
    await convert();
    expect(mocks.upload).toHaveBeenCalledTimes(2);
  });
  it('honors cancellation before a cache hit and works without Web Crypto', async () => {
    await convert();
    const controller = new AbortController();
    controller.abort();
    await expect(
      convertOfficePreview(file(), controller.signal),
    ).rejects.toThrow('aborted');
    expect(mocks.upload).toHaveBeenCalledTimes(1);
    vi.stubGlobal('crypto', undefined);
    await convert();
    expect(mocks.upload).toHaveBeenCalledTimes(2);
  });
  it('evicts old results when the byte budget is exceeded', async () => {
    mocks.upload.mockImplementation(
      async () =>
        new Blob([new Uint8Array(25 * 1024 * 1024)], {
          type: 'application/pdf',
        }),
    );
    await convert(file('one'));
    await convert(file('two'));
    await convert(file('one'));
    expect(mocks.upload).toHaveBeenCalledTimes(3);
  });
});
