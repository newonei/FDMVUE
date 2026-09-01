import { beforeEach, describe, expect, it, vi } from 'vitest';

import { prepareMyRelayApiKeyCcsImport } from './index';

const requestMocks = vi.hoisted(() => ({
  post: vi.fn(),
}));

vi.mock('#/api/request', () => ({ requestClient: requestMocks }));

describe('FDM Relay CC Switch import API', () => {
  beforeEach(() => vi.clearAllMocks());

  it('uses an explicit POST body instead of putting the key id in a URL', async () => {
    requestMocks.post.mockResolvedValueOnce(undefined);

    await prepareMyRelayApiKeyCcsImport({ id: 123 });

    expect(requestMocks.post).toHaveBeenCalledTimes(1);
    expect(requestMocks.post).toHaveBeenCalledWith(
      '/fdmrelay/api-key/ccs-import',
      { id: 123 },
    );
  });
});
