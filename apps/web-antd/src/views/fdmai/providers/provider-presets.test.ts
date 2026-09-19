import type { FdmAiApi } from '#/api/fdmai';

import { describe, expect, it } from 'vitest';

import {
  applyProviderPreset,
  getProviderImageTransport,
  inferProviderPreset,
  parseProviderConfiguration,
  setProviderImageTransport,
} from './provider-presets';

function existingGateway(): FdmAiApi.ProviderSaveReq {
  return {
    adapterCode: 'openai-compatible-text',
    baseUrl: 'https://sub2api.example.com/v1',
    configuration: { requestTimeoutSeconds: 240 },
    credential: '',
    enabled: true,
    name: '团队 Sub2API',
    platform: false,
  };
}

describe('provider protocol presets', () => {
  it('keeps an existing gateway address, key and configuration when explicitly selecting Grok', () => {
    const form = existingGateway();
    const original = structuredClone(form);

    applyProviderPreset(form, 'xai-grok', true);

    expect(form).toEqual({ ...original, adapterCode: 'xai-grok' });
    expect(form.credential).toBe('');
  });

  it('does not redirect a key entered for an existing account', () => {
    const form = { ...existingGateway(), credential: 'replacement-key' };

    applyProviderPreset(form, 'xai-grok', true);

    expect(form.baseUrl).toBe('https://sub2api.example.com/v1');
    expect(form.credential).toBe('replacement-key');
  });

  it('uses the official xAI endpoint only when creating from the Grok preset', () => {
    const form = { ...existingGateway(), credential: 'new-account-key' };

    applyProviderPreset(form, 'xai-grok', false);

    expect(form.baseUrl).toBe('https://api.x.ai/v1');
    expect(form.adapterCode).toBe('xai-grok');
    expect(form.name).toBe('Grok / xAI');
  });

  it('recognizes an explicitly saved Grok protocol even on a Sub2API gateway', () => {
    expect(inferProviderPreset({ ...existingGateway(), adapterCode: 'xai-grok' })).toBe('xai-grok');
  });

  it('never switches a gateway protocol merely because its name mentions Grok', () => {
    const form = { ...existingGateway(), name: 'Sub2API Grok 图片与视频' };

    expect(inferProviderPreset(form)).toBe('sub2api');
    expect(form.adapterCode).toBe('openai-compatible-text');
  });
});

describe('provider image transport configuration', () => {
  it('defaults existing accounts to native Grok without enabling asynchronous storage', () => {
    const configurationJson = '{"requestTimeoutSeconds":240}';
    expect(getProviderImageTransport(configurationJson)).toBe('xai-native');
    expect(parseProviderConfiguration(configurationJson)).toEqual({ requestTimeoutSeconds: 240 });
  });

  it('loads an explicitly enabled Sub2API transport and preserves every other advanced setting', () => {
    const configuration = {
      imageTransport: 'sub2api-async',
      custom: { keep: true },
      timeout: 240,
    };
    expect(getProviderImageTransport(JSON.stringify(configuration))).toBe('sub2api-async');
    const updated = setProviderImageTransport(JSON.stringify(configuration), 'xai-native');
    expect(parseProviderConfiguration(updated)).toEqual({ ...configuration, imageTransport: 'xai-native' });
    expect(getProviderImageTransport(updated)).toBe('xai-native');
  });

  it('round-trips an explicit asynchronous selection without rewriting existing configuration', () => {
    const configuration = { imagePath: '/custom/images', internalNetwork: true };
    const updated = setProviderImageTransport(JSON.stringify(configuration), 'sub2api-async');
    expect(parseProviderConfiguration(updated)).toEqual({ ...configuration, imageTransport: 'sub2api-async' });
    expect(getProviderImageTransport(updated)).toBe('sub2api-async');
  });

  it('rejects malformed or non-object JSON instead of discarding it during selection', () => {
    for (const value of ['{', 'null', '[]', '"text"']) {
      expect(() => setProviderImageTransport(value, 'sub2api-async')).toThrow();
    }
  });

  it('keeps the selected transport, endpoint and key while switching an existing account preset', () => {
    const form = {
      ...existingGateway(),
      configuration: { imageTransport: 'sub2api-async', custom: { keep: true } },
    };
    const original = structuredClone(form);
    applyProviderPreset(form, 'xai-grok', true);
    applyProviderPreset(form, 'sub2api', true);
    expect(form).toEqual(original);
  });
});
