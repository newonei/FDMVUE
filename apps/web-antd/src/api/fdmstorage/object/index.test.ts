import { beforeEach, describe, expect, it, vi } from 'vitest';

import { FDM_OBJECT_UPLOAD_TIMEOUT, uploadFdmObject } from './index';

const requestMocks = vi.hoisted(() => ({
  upload: vi.fn(),
}));

vi.mock('#/api/request', () => ({ requestClient: requestMocks }));

describe('fDM object storage API', () => {
  beforeEach(() => requestMocks.upload.mockReset());

  it('uploads through the FDM-owned storage boundary', async () => {
    const file = new File(['asset'], 'asset.png', { type: 'image/png' });
    const onUploadProgress = vi.fn();
    requestMocks.upload.mockResolvedValueOnce({ url: '/files/asset.png' });

    await uploadFdmObject(
      { directory: 'fdmcreative/project-1', file },
      onUploadProgress,
    );

    expect(requestMocks.upload).toHaveBeenCalledWith(
      '/fdmstorage/object/upload',
      { directory: 'fdmcreative/project-1', file },
      {
        onUploadProgress,
        timeout: FDM_OBJECT_UPLOAD_TIMEOUT,
      },
    );
  });

  it('does not send an empty directory', async () => {
    const file = new File(['asset'], 'asset.png');
    requestMocks.upload.mockResolvedValueOnce('/files/asset.png');

    await uploadFdmObject({ directory: '  ', file });

    expect(requestMocks.upload).toHaveBeenCalledWith(
      '/fdmstorage/object/upload',
      { file },
      expect.any(Object),
    );
  });
});
