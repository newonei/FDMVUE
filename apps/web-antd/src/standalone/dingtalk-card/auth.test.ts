import { beforeEach, describe, expect, it, vi } from 'vitest';

import { requestCardAuthCode } from './auth';

const { authCode } = vi.hoisted(() => ({ authCode: vi.fn() }));
vi.mock('dingtalk-jsapi/platform', () => ({}));
vi.mock('dingtalk-jsapi/api/runtime/permission/requestAuthCode', () => ({
  requestAuthCode$: authCode,
}));

describe('standalone DingTalk native auth', () => {
  beforeEach(() => {
    authCode.mockReset();
  });

  it('loads only the native unsigned auth API and requests a code for the configured enterprise', async () => {
    authCode.mockResolvedValue({ code: 'one-time-code' });
    expect(await requestCardAuthCode('ding-corp', 'app-client')).toBe(
      'one-time-code',
    );
    expect(authCode).toHaveBeenCalledWith({ corpId: 'ding-corp' });
  });

  it('does not expose a raw native error or its sensitive debug payload', async () => {
    authCode.mockRejectedValue(new Error('raw-sdk-secret'));
    await expect(
      requestCardAuthCode('ding-corp', 'app-client'),
    ).rejects.toThrow('钉钉免登失败');
  });

  it('does not exchange an empty native code for a system session', async () => {
    authCode.mockResolvedValue({ code: '' });
    await expect(
      requestCardAuthCode('ding-corp', 'app-client'),
    ).rejects.toThrow('钉钉免登失败');
  });
});
