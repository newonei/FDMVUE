import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { runInNewContext } from 'node:vm';

import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  captureWorkbenchLogin,
  completeWorkbenchLogin,
  exchangeWorkbenchTicket,
  getWorkbenchPermissions,
  parseWorkbenchFragment,
  takeWorkbenchCredentials,
  WORKBENCH_LOGIN_ERROR,
} from './workbench-login';

const ticket = 'T'.repeat(43);
const verifier = 'V'.repeat(43);
const fragment = `#ticket=${ticket}&verifier=${verifier}`;
const credentials = { ticket, codeVerifier: verifier };
const session = {
  accessToken: 'new-web-access',
  refreshToken: 'new-web-refresh',
  userId: 42,
  tenantId: 7,
  expiresTime: Date.now() + 60_000,
};

const ok = (data: unknown) => Response.json({ code: 0, data });

describe('workbench handoff bootstrap', () => {
  beforeEach(() => captureWorkbenchLogin({}));

  it('removes the fragment before analytics and exposes an in-memory handoff only once', () => {
    const html = readFileSync(
      resolve(process.cwd(), 'apps/web-antd/index.html'),
      'utf8',
    );
    const script = html.match(/<script>([\s\S]*?)<\/script>/)?.[1];
    expect(script).toBeTruthy();
    const replaceState = vi.fn();
    const browser = {
      location: { pathname: '/auth/workbench', hash: fragment },
      history: { replaceState },
    };
    runInNewContext(script!, { window: browser });
    expect(replaceState).toHaveBeenCalledExactlyOnceWith(
      null,
      '',
      '/auth/workbench',
    );
    captureWorkbenchLogin(browser as Pick<Window, '__takeWorkbenchLogin'>);
    expect(browser).not.toHaveProperty('__takeWorkbenchLogin');
    expect(takeWorkbenchCredentials()).toEqual(credentials);
    expect(() => takeWorkbenchCredentials()).toThrow(WORKBENCH_LOGIN_ERROR);
    expect(html.indexOf(script!)).toBeLessThan(html.indexOf('hm.baidu.com'));
    expect(html).toContain(
      "HM_ID && window.location.pathname !== '/auth/workbench'",
    );
  });

  it('leaves ordinary application hashes unchanged', () => {
    const html = readFileSync(
      resolve(process.cwd(), 'apps/web-antd/index.html'),
      'utf8',
    );
    const browser = {
      location: { pathname: '/dashboard', hash: '#detail' },
      history: { replaceState: vi.fn() },
    };
    runInNewContext(html.match(/<script>([\s\S]*?)<\/script>/)![1]!, {
      window: browser,
    });
    expect(browser.history.replaceState).not.toHaveBeenCalled();
    expect(browser).not.toHaveProperty('__takeWorkbenchLogin');
  });

  it.each([
    '',
    '#ticket=short&verifier=short',
    `${fragment}&ticket=${ticket}`,
    `${fragment}&redirect=https://example.com`,
    `#ticket=${ticket}&verifier=${'V'.repeat(42)}`,
    `#ticket=${ticket}&verifier=${'V'.repeat(129)}`,
    `#ticket=${ticket}%0A&verifier=${verifier}`,
    `#ticket=${'T'.repeat(5000)}&verifier=${verifier}`,
  ])('rejects malformed handoffs without returning their values', (value) => {
    expect(() => parseWorkbenchFragment(value)).toThrow(WORKBENCH_LOGIN_ERROR);
  });
});

describe('workbench exchange transport', () => {
  it('posts exactly once without the prior browser identity or automatic redirects', async () => {
    const signal = new AbortController().signal;
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(ok(session));
    await expect(
      exchangeWorkbenchTicket(credentials, signal, fetcher),
    ).resolves.toEqual(session);
    expect(fetcher).toHaveBeenCalledExactlyOnceWith(
      '/admin-api/fdmmcp/portal/exchange',
      {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(credentials),
        credentials: 'omit',
        cache: 'no-store',
        redirect: 'error',
        referrerPolicy: 'no-referrer',
        signal,
      },
    );
  });

  it.each([
    () => new Response('sensitive upstream detail', { status: 401 }),
    () => Response.json({ code: 400, msg: 'ticket and token details' }),
    () => ok({ ...session, tenantId: 0 }),
    () => ok({ ...session, userId: '42' }),
    () => ok({ ...session, expiresTime: Date.now() - 1 }),
    () => ok({ ...session, refreshToken: '' }),
  ])('fails closed with fixed text and no refresh/replay', async (response) => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(response());
    await expect(
      exchangeWorkbenchTicket(
        credentials,
        new AbortController().signal,
        fetcher,
      ),
    ).rejects.toThrow(WORKBENCH_LOGIN_ERROR);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it('uses only the exchanged web token and tenant for permission loading', async () => {
    const permission = {
      user: { id: 42 },
      roles: ['employee'],
      permissions: ['view'],
      menus: [],
    };
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(ok(permission));
    const signal = new AbortController().signal;
    await expect(
      getWorkbenchPermissions(session, signal, fetcher),
    ).resolves.toEqual(permission);
    expect(fetcher).toHaveBeenCalledExactlyOnceWith(
      '/admin-api/system/auth/get-permission-info',
      {
        headers: {
          Accept: 'application/json',
          Authorization: 'Bearer new-web-access',
          'tenant-id': '7',
        },
        credentials: 'omit',
        cache: 'no-store',
        redirect: 'error',
        referrerPolicy: 'no-referrer',
        signal,
      },
    );
  });

  it('rejects a permission response for another employee', async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(
        ok({ user: { id: 99 }, roles: [], permissions: [], menus: [] }),
      );
    await expect(
      getWorkbenchPermissions(session, new AbortController().signal, fetcher),
    ).rejects.toThrow(WORKBENCH_LOGIN_ERROR);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
});

describe('workbench identity transition', () => {
  function fixture() {
    const events: string[] = [];
    const controller = new AbortController();
    return {
      events,
      controller,
      options: {
        signal: controller.signal,
        clearIdentity: vi.fn(() => {
          events.push('clear');
        }),
        credentials: vi.fn(() => {
          events.push('credentials');
          return credentials;
        }),
        exchange: vi.fn(async () => {
          events.push('exchange');
          return session;
        }),
        applySession: vi.fn(async () => {
          events.push('new-session-and-permissions');
        }),
        goHome: vi.fn(async () => {
          events.push('home');
        }),
      },
    };
  }

  it('clears the previous identity before exchange and navigates only after permissions load', async () => {
    const { events, options } = fixture();
    await completeWorkbenchLogin(options);
    expect(events).toEqual([
      'clear',
      'credentials',
      'exchange',
      'new-session-and-permissions',
      'home',
    ]);
    expect(options.exchange).toHaveBeenCalledExactlyOnceWith(credentials);
    expect(options.applySession).toHaveBeenCalledExactlyOnceWith(session);
  });

  it.each(['credentials', 'exchange', 'applySession'] as const)(
    'clears all identity on %s failure and never retries or redirects to login',
    async (stage) => {
      const { options } = fixture();
      options[stage].mockImplementation(() => {
        throw new Error('sensitive error');
      });
      await expect(completeWorkbenchLogin(options)).rejects.toThrow(
        WORKBENCH_LOGIN_ERROR,
      );
      expect(options.clearIdentity).toHaveBeenCalledTimes(2);
      expect(options.goHome).not.toHaveBeenCalled();
      expect(options.exchange.mock.calls.length).toBeLessThanOrEqual(1);
    },
  );

  it('discards a late exchange after the page closes', async () => {
    const { options, controller } = fixture();
    options.exchange.mockImplementation(async () => {
      controller.abort();
      return session;
    });
    await expect(completeWorkbenchLogin(options)).rejects.toThrow(
      WORKBENCH_LOGIN_ERROR,
    );
    expect(options.applySession).not.toHaveBeenCalled();
    expect(options.goHome).not.toHaveBeenCalled();
    expect(options.clearIdentity).toHaveBeenCalledTimes(2);
  });
});
