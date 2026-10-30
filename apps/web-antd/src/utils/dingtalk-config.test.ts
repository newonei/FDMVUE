import { describe, expect, it, vi } from 'vitest';

import {
  resolveDingTalkLoginConfig,
  safeDingTalkRedirect,
} from './dingtalk-config';

const legacy = { corpId: 'legacy-corp', clientId: 'legacy-client' };

describe('dingTalk login configuration', () => {
  it('uses the current tenant configuration in preference to environment values', async () => {
    await expect(
      resolveDingTalkLoginConfig(
        async () => ({
          enabled: true,
          corpId: ' saved-corp ',
          clientId: ' saved-client ',
        }),
        legacy,
      ),
    ).resolves.toEqual({ corpId: 'saved-corp', clientId: 'saved-client' });
  });

  it('falls back only when an older server has no public configuration endpoint', async () => {
    const fetchConfig = vi
      .fn()
      .mockRejectedValue({ response: { status: 404 } });
    await expect(
      resolveDingTalkLoginConfig(fetchConfig, legacy),
    ).resolves.toEqual(legacy);
  });

  it.each([
    new Error('Network error'),
    { response: { status: 500 } },
    { data: { code: 404, msg: 'Application missing' } },
  ])(
    'does not hide network, server, or business errors with environment values',
    async (error) => {
      await expect(
        resolveDingTalkLoginConfig(vi.fn().mockRejectedValue(error), legacy),
      ).rejects.toBe(error);
    },
  );

  it('refuses login after the administrator disables the application', async () => {
    await expect(
      resolveDingTalkLoginConfig(
        async () => ({
          enabled: false,
          corpId: 'saved-corp',
          clientId: 'saved-client',
        }),
        legacy,
      ),
    ).rejects.toThrow('已停用');
  });

  it('does not combine incomplete saved configuration with another application', async () => {
    await expect(
      resolveDingTalkLoginConfig(
        async () => ({
          enabled: true,
          corpId: 'saved-corp',
          clientId: '',
        }),
        legacy,
      ),
    ).rejects.toThrow('未配置');
  });
});

describe('dingTalk login redirect', () => {
  it('rejects every ASCII control character both directly and after decoding', () => {
    const codes = [...Array.from({ length: 32 }, (_, index) => index), 127];
    for (const code of codes) {
      const path = `/detail${String.fromCodePoint(code)}page`;
      expect(safeDingTalkRedirect(path, '/workbench')).toBe('/workbench');
      expect(safeDingTalkRedirect(encodeURIComponent(path), '/workbench')).toBe(
        '/workbench',
      );
    }
    expect(safeDingTalkRedirect('/通知/详情?id=1')).toBe('/通知/详情?id=1');
  });

  it('retains a local detail URL and its query and hash', () => {
    expect(
      safeDingTalkRedirect(
        encodeURIComponent('/gongchang/orders?id=12#detail'),
      ),
    ).toBe('/gongchang/orders?id=12#detail');
  });

  it.each([
    'https://example.com',
    '//example.com',
    '%2F%2Fexample.com',
    String.raw`/\example.com`,
    '%2F%5Cexample.com',
    '/\n/example.com',
    '%E0%A4%A',
    'javascript:alert(1)',
    undefined,
    ['//example.com'],
  ])('uses a local fallback for invalid or external redirects: %s', (value) => {
    expect(safeDingTalkRedirect(value, '/workbench')).toBe('/workbench');
  });

  it('also rejects an external fallback', () => {
    expect(safeDingTalkRedirect(undefined, '//example.com')).toBe('/');
  });
});
