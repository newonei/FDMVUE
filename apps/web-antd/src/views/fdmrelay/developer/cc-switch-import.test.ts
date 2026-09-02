import { describe, expect, it } from 'vitest';

import {
  buildCcSwitchImportDeeplink,
  CC_SWITCH_CODEX_MODEL,
  CC_SWITCH_PROVIDER_NAME,
  CC_SWITCH_USAGE_QUERY_INTERVAL_MINUTES,
  CC_SWITCH_USAGE_SCRIPT,
} from './cc-switch-import';

function paramsFromDeeplink(deeplink: string) {
  return new URLSearchParams(deeplink.split('?')[1] || '');
}

describe('buildCcSwitchImportDeeplink', () => {
  it('builds a Codex provider import accepted by the CC Switch V1 protocol', () => {
    const apiKey = "sk-test-$&-$`-$'-$$";
    const deeplink = buildCcSwitchImportDeeplink({
      apiKey,
      baseUrl: 'https://api.example.com/',
    });
    const params = paramsFromDeeplink(deeplink);

    expect(deeplink).toMatch(/^ccswitch:\/\/v1\/import\?/);
    expect(params.get('resource')).toBe('provider');
    expect(params.get('app')).toBe('codex');
    expect(params.get('model')).toBe(CC_SWITCH_CODEX_MODEL);
    expect(params.get('name')).toBe(CC_SWITCH_PROVIDER_NAME);
    expect(params.get('homepage')).toBe('https://api.example.com');
    expect(params.get('endpoint')).toBe('https://api.example.com');
    expect(params.get('apiKey')).toBe(apiKey);
    expect(params.get('configFormat')).toBe('json');
    expect(params.get('usageEnabled')).toBe('true');
    expect(params.get('usageAutoInterval')).toBe(
      String(CC_SWITCH_USAGE_QUERY_INTERVAL_MINUTES),
    );
    expect(params.has('enabled')).toBe(false);
    expect(atob(params.get('usageScript') || '')).toBe(
      CC_SWITCH_USAGE_SCRIPT,
    );
  });

  it('URL-encodes a custom provider name without changing the API Key', () => {
    const params = paramsFromDeeplink(
      buildCcSwitchImportDeeplink({
        apiKey: 'sk-test+with/slash=',
        baseUrl: ' https://api.example.com/// ',
        providerName: 'FDM 中转站 & Codex',
      }),
    );

    expect(params.get('name')).toBe('FDM 中转站 & Codex');
    expect(params.get('apiKey')).toBe('sk-test+with/slash=');
    expect(params.get('endpoint')).toBe('https://api.example.com');
  });

  it('rejects an incomplete import instead of opening a broken deep link', () => {
    expect(() =>
      buildCcSwitchImportDeeplink({ apiKey: 'sk-test', baseUrl: '   ' }),
    ).toThrow('API base URL');
    expect(() =>
      buildCcSwitchImportDeeplink({
        apiKey: '',
        baseUrl: 'https://api.example.com',
      }),
    ).toThrow('API Key');
  });
});
