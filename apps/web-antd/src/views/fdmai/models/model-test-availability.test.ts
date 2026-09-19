import type { FdmAiApi } from '#/api/fdmai';

import { describe, expect, it } from 'vitest';

import { getModelTestAvailability } from './model-test-availability';

const model: FdmAiApi.ModelDefinition = {
  id: 1, code: 'grok-image', name: '图片模型', modality: 'IMAGE', capabilities: ['TEXT_TO_IMAGE'],
  enabled: true, currency: 'USD', unitPrice: 1, parameterSchema: '{}',
};
const provider: FdmAiApi.ProviderAccount = {
  id: 2, name: 'Grok 接入', adapterCode: 'xai-grok', baseUrl: 'https://example.test/v1',
  enabled: true, platform: false, tenantId: 1, configuration: {}, credentialConfigured: true,
};
const route: FdmAiApi.RouteDefinition = {
  id: 3, routeKey: 'model.image', modelId: model.id, providerAccountId: provider.id,
  providerModel: 'grok-imagine-image', enabled: true, platform: false, tenantId: 1, providerOptions: {},
};
const base = {
  canViewPlatform: true, model, models: [model], providers: [provider], routes: [route],
};

describe('model test route availability', () => {
  it('reports the disabled provider even while both model and route are enabled', () => {
    expect(getModelTestAvailability({ ...base, providers: [{ ...provider, enabled: false }] }))
      .toEqual({ status: 'unavailable', reason: '服务商「Grok 接入」已停用，请先在服务商接入中启用' });
  });

  it('does not fall back to a working platform route when any tenant route masks it', () => {
    const platformProvider = { ...provider, id: 20, platform: true, tenantId: 0 };
    const platformRoute = { ...route, id: 30, providerAccountId: 20, platform: true, tenantId: 0 };
    expect(getModelTestAvailability({
      ...base, providers: [provider, platformProvider], routes: [{ ...route, enabled: false }, platformRoute],
    })).toEqual({ status: 'unavailable', reason: '当前租户调用路由已停用，请先恢复路由' });
    expect(getModelTestAvailability({
      ...base, providers: [{ ...provider, enabled: false }, platformProvider], routes: [route, platformRoute],
    }).status).toBe('unavailable');
  });

  it('allows the next enabled tenant route instead of rejecting an entire model for one disabled route', () => {
    expect(getModelTestAvailability({ ...base, routes: [{ ...route, enabled: false }, { ...route, id: 4 }] }).status)
      .toBe('available');
  });

  it('defers unseen platform sources to the server without treating them as missing', () => {
    expect(getModelTestAvailability({ ...base, canViewPlatform: false, routes: [] }).status).toBe('unknown');
    expect(getModelTestAvailability({ ...base, routes: [] }).status).toBe('unavailable');
    expect(getModelTestAvailability({ ...base, providers: [] }).status).toBe('unknown');
  });

  it('continues to reject known disabled tenant configuration when platform visibility is absent', () => {
    expect(getModelTestAvailability({ ...base, canViewPlatform: false, providers: [{ ...provider, enabled: false }] }).status)
      .toBe('unavailable');
  });

  it('rejects deleted or disabled models', () => {
    expect(getModelTestAvailability({ ...base, model: undefined }).reason).toContain('模型已删除或不可见');
    expect(getModelTestAvailability({ ...base, model: { ...model, enabled: false } }).reason).toContain('模型已停用');
  });

  it('checks the exact scene route and rejects a changed model instead of silently testing a replacement', () => {
    expect(getModelTestAvailability({ ...base, routeKey: 'other.scene' }).status).toBe('unavailable');
    const replacement = { ...model, id: 10 };
    expect(getModelTestAvailability({
      ...base, routeKey: route.routeKey, models: [model, replacement], routes: [{ ...route, modelId: replacement.id }],
    }).reason).toContain('此场景的模型已变更');
  });

  it('preserves long string identifiers without Number rounding', () => {
    const modelId = '2100893368351428609' as unknown as number;
    const providerId = '2100893368351428611' as unknown as number;
    const longModel = { ...model, id: modelId };
    expect(getModelTestAvailability({
      ...base, model: longModel, models: [longModel], providers: [{ ...provider, id: providerId }],
      routes: [{ ...route, modelId, providerAccountId: providerId }],
    }).status).toBe('available');
  });
});
