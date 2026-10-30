import { describe, expect, it, vi } from 'vitest';

import { CardApiError, createCardApi } from './api';

function response(data: unknown, code = 0) {
  return Response.json({ code, data, msg: code ? '禁止访问' : undefined });
}

describe('standalone card detail API', () => {
  it('reads a work-notification record from its own authorized endpoint', async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValue(response({ id: 1, content: '独立通知记录' }));
    await createCardApi('/admin-api', fetcher).detail(
      1,
      'token',
      1,
      'work-notification',
    );
    expect(fetcher.mock.calls[0]?.[0]).toBe(
      '/admin-api/fdmdingtalk/work-notification/my-detail?id=1',
    );
  });
  it('resolves the exact current hostname without a default tenant fallback', async () => {
    const fetcher = vi.fn().mockResolvedValue(response({ id: 1 }));
    const api = createCardApi('/admin-api/', fetcher);
    expect(await api.resolveTenant('web.hbfdm.com')).toBe(1);
    expect(fetcher.mock.calls[0]?.[0]).toBe(
      '/admin-api/system/tenant/get-by-website?website=web.hbfdm.com',
    );
    expect(fetcher.mock.calls[0]?.[1].headers).not.toHaveProperty('tenant-id');
  });

  it('fails closed when the hostname is not mapped to a tenant', async () => {
    const api = createCardApi(
      '/admin-api',
      vi.fn().mockResolvedValue(response(null)),
    );
    await expect(api.resolveTenant('unknown.example')).rejects.toThrow(
      '当前域名未绑定企业',
    );
  });

  it('uses a bearer header and tenant header rather than URL credentials or admin stores', async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValue(response({ id: 42, title: '通知' }));
    const api = createCardApi('/admin-api', fetcher);
    await api.detail(1, 'private-access-token', 42);
    expect(fetcher.mock.calls[0]?.[0]).toBe(
      '/admin-api/fdmdingtalk/interactive-card/my-detail?id=42',
    );
    expect(fetcher.mock.calls[0]?.[1]).toMatchObject({
      headers: {
        'tenant-id': '1',
        Authorization: 'Bearer private-access-token',
      },
      credentials: 'omit',
      cache: 'no-store',
    });
    expect(fetcher.mock.calls[0]?.[0]).not.toContain('private-access-token');
  });

  it('sends only the fresh DingTalk auth code and enterprise ID in the login body', async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValue(response({ accessToken: 'token' }));
    const api = createCardApi('/admin-api', fetcher);
    await api.login(1, 'ding-corp', 'one-time-code');
    expect(fetcher.mock.calls[0]?.[1]).toMatchObject({
      method: 'POST',
      body: JSON.stringify({ corpId: 'ding-corp', code: 'one-time-code' }),
    });
    expect(fetcher.mock.calls[0]?.[1].headers).not.toHaveProperty(
      'Authorization',
    );
  });

  it.each([401, 403])(
    'preserves authorization failure %s for the caller to handle without returning data',
    async (code) => {
      const api = createCardApi(
        '/admin-api',
        vi.fn().mockResolvedValue(response({ title: 'must-not-show' }, code)),
      );
      await expect(api.detail(1, 'token', 42)).rejects.toMatchObject({ code });
    },
  );

  it('handles HTTP-level login expiry with the same typed error', async () => {
    const api = createCardApi(
      '/admin-api',
      vi.fn().mockResolvedValue(new Response('', { status: 401 })),
    );
    await expect(api.detail(1, 'token', 42)).rejects.toBeInstanceOf(
      CardApiError,
    );
  });
});
