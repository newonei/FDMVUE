import type { FdmAiApi } from '#/api/fdmai';

import { describe, expect, it } from 'vitest';

import {
  filterLibraryModels,
  findProviderModelConnection,
  getChannelCatalogDiff,
  getModelChannels,
  getProviderModelImportStatus,
  getProviderModelSupport,
  inferProviderModelType,
  limitModelSelection,
  modelSaveRequest,
  sameModelLibraryId,
  selectLibraryModelIds,
} from './model-library';

const textAdapter = {
  capabilities: ['CHAT'],
  modalities: ['TEXT'],
} satisfies Pick<FdmAiApi.AdapterDescriptor, 'capabilities' | 'modalities'>;

function model(id: number, enabled = true): FdmAiApi.ModelDefinition {
  return {
    capabilities: ['TEXT_TO_IMAGE', 'IMAGE_TO_IMAGE'],
    code: `image-${id}`,
    currency: 'USD',
    enabled,
    id,
    modality: 'IMAGE',
    name: `图片模型 ${id}`,
    parameterSchema: '{"quality":{"default":"high"}}',
    unitPrice: 0.025,
  };
}

function route(
  modelId: number,
  providerAccountId: number,
  enabled = true,
): FdmAiApi.RouteDefinition {
  return {
    enabled,
    id: modelId,
    modelId,
    platform: true,
    providerAccountId,
    providerModel: 'same-upstream-model',
    providerOptions: {},
    routeKey: `route-${modelId}`,
    tenantId: 0,
  };
}

function provider(id: number, enabled = true): FdmAiApi.ProviderAccount {
  return {
    id,
    enabled,
    name: `渠道 ${id}`,
    adapterCode: 'openai-compatible-text',
    baseUrl: 'https://example.test/v1',
    configuration: {},
    credentialConfigured: true,
    platform: true,
    tenantId: 0,
  };
}

describe('model library', () => {
  it('separates pending models from unsupported models when filtering a provider directory', () => {
    const models: FdmAiApi.ProviderModelInfo[] = [
      { id: 'known-chat', metadata: {}, modality: 'TEXT', capabilities: ['CHAT'] },
      {
        id: 'unconfirmed-chat',
        metadata: {},
        modality: 'TEXT',
        capabilities: ['CHAT'],
        requiresConfirmation: true,
      },
      { id: 'unknown-model', metadata: {} },
      {
        id: 'image-only',
        metadata: {},
        modality: 'IMAGE',
        capabilities: ['TEXT_TO_IMAGE'],
        importable: false,
      },
    ];
    const idsWithStatus = (status: 'pending' | 'ready' | 'unsupported') =>
      models
        .filter(
          (model) => getProviderModelImportStatus(model, textAdapter) === status,
        )
        .map((model) => model.id);
    expect(idsWithStatus('ready')).toEqual(['known-chat']);
    expect(idsWithStatus('pending')).toEqual([
      'unconfirmed-chat',
      'unknown-model',
    ]);
    expect(idsWithStatus('unsupported')).toEqual(['image-only']);
  });

  it('allows a reviewed model without weakening an explicit unsupported result', () => {
    const model = {
      id: 'reviewed-chat',
      metadata: {},
      modality: 'TEXT',
      capabilities: ['CHAT'],
      requiresConfirmation: true,
      userConfirmed: true,
    } satisfies FdmAiApi.ProviderModelInfo & { userConfirmed: boolean };
    expect(getProviderModelImportStatus(model, textAdapter)).toBe('ready');
    expect(
      getProviderModelImportStatus({ ...model, importable: false }, textAdapter),
    ).toBe('unsupported');
    expect(getProviderModelImportStatus(model)).toBe('pending');
    expect(
      getProviderModelImportStatus({ ...model, capabilities: [] }, textAdapter),
    ).toBe('pending');
  });

  it('keeps a confirmed video classification while blocking import through a text and image adapter', () => {
    const video = {
      id: 'grok-imagine-video',
      metadata: {},
      modality: 'VIDEO',
      capabilities: ['TEXT_TO_VIDEO'],
      requiresConfirmation: true,
      userConfirmed: true,
    } satisfies FdmAiApi.ProviderModelInfo & { userConfirmed: boolean };
    const adapter = {
      capabilities: ['CHAT', 'TEXT_TO_IMAGE'],
      modalities: ['TEXT', 'IMAGE'],
    } satisfies Pick<FdmAiApi.AdapterDescriptor, 'capabilities' | 'modalities'>;

    expect(getProviderModelImportStatus(video, adapter)).toBe('unsupported');
    expect(getProviderModelSupport(video, adapter)).toEqual({
      reason: 'modality-unsupported',
      status: 'unsupported',
      unsupportedCapabilities: ['TEXT_TO_VIDEO'],
    });
    expect(video.modality).toBe('VIDEO');
    expect(video.capabilities).toEqual(['TEXT_TO_VIDEO']);
    expect(
      getProviderModelImportStatus(video, {
        capabilities: ['TEXT_TO_VIDEO'],
        modalities: ['VIDEO'],
      }),
    ).toBe('ready');
  });

  it('requires both adapter modality and selected capabilities to support importing video', () => {
    const video = {
      id: 'reference-video',
      metadata: {},
      modality: 'VIDEO',
      capabilities: ['TEXT_TO_VIDEO', 'FIRST_FRAME_TO_VIDEO'],
    } satisfies FdmAiApi.ProviderModelInfo;
    const textToVideoAdapter = {
      capabilities: ['TEXT_TO_VIDEO'],
      modalities: ['VIDEO'],
    } satisfies Pick<FdmAiApi.AdapterDescriptor, 'capabilities' | 'modalities'>;
    expect(getProviderModelSupport(video, textToVideoAdapter)).toEqual({
      reason: 'capability-unsupported',
      status: 'unsupported',
      unsupportedCapabilities: ['FIRST_FRAME_TO_VIDEO'],
    });
    expect(getProviderModelImportStatus(video, textToVideoAdapter)).toBe(
      'unsupported',
    );
    expect(
      getProviderModelImportStatus(video, {
        capabilities: ['TEXT_TO_VIDEO', 'FIRST_FRAME_TO_VIDEO'],
        modalities: ['TEXT'],
      }),
    ).toBe('unsupported');
  });

  it('does not let a manual confirmation override a backend import restriction', () => {
    const blocked = {
      id: 'blocked-video',
      metadata: {},
      modality: 'VIDEO',
      capabilities: ['TEXT_TO_VIDEO'],
      importable: false,
      userConfirmed: true,
    } satisfies FdmAiApi.ProviderModelInfo & { userConfirmed: boolean };
    const videoAdapter = {
      capabilities: ['TEXT_TO_VIDEO'],
      modalities: ['VIDEO'],
    } satisfies Pick<FdmAiApi.AdapterDescriptor, 'capabilities' | 'modalities'>;
    expect(getProviderModelImportStatus(blocked, videoAdapter)).toBe(
      'unsupported',
    );
    expect(getProviderModelSupport(blocked, videoAdapter).reason).toBe(
      'backend-blocked',
    );
    expect(getProviderModelImportStatus(blocked)).toBe('unsupported');
  });

  it('keeps confirmed classifications pending until adapter information is available', () => {
    const confirmed = {
      id: 'confirmed-chat',
      metadata: {},
      modality: 'TEXT',
      capabilities: ['CHAT'],
      userConfirmed: true,
    } satisfies FdmAiApi.ProviderModelInfo & { userConfirmed: boolean };
    expect(getProviderModelSupport(confirmed)).toEqual({
      reason: 'adapter-unavailable',
      status: 'unknown',
      unsupportedCapabilities: [],
    });
    expect(getProviderModelImportStatus(confirmed)).toBe('pending');
    expect(
      getProviderModelImportStatus(confirmed, {
        capabilities: ['CHAT'],
        modalities: [],
      }),
    ).toBe('pending');
    expect(
      getProviderModelImportStatus(confirmed, {
        capabilities: [],
        modalities: ['TEXT'],
      }),
    ).toBe('pending');
  });

  it('requires explicit confirmation for a fallback classification even if the backend omitted its flag', () => {
    const fallback = {
      id: 'unknown-future-model',
      metadata: {},
      modality: 'TEXT',
      capabilities: ['CHAT'],
      classificationSource: 'FALLBACK',
    } satisfies FdmAiApi.ProviderModelInfo;
    expect(getProviderModelImportStatus(fallback, textAdapter)).toBe('pending');
    expect(
      getProviderModelImportStatus(
        { ...fallback, userConfirmed: true },
        textAdapter,
      ),
    ).toBe('ready');
  });

  it('does not treat an input capability or a capability of another modality as a complete classification', () => {
    const multimodalAdapter = {
      capabilities: ['CHAT', 'IMAGE_INPUT', 'TEXT_TO_VIDEO'],
      modalities: ['TEXT', 'VIDEO'],
    } satisfies Pick<FdmAiApi.AdapterDescriptor, 'capabilities' | 'modalities'>;
    const incomplete = {
      id: 'incomplete-text',
      metadata: {},
      modality: 'TEXT',
      capabilities: ['IMAGE_INPUT'],
      userConfirmed: true,
    } satisfies FdmAiApi.ProviderModelInfo & { userConfirmed: boolean };
    expect(getProviderModelSupport(incomplete, multimodalAdapter).reason).toBe(
      'classification-incomplete',
    );
    expect(getProviderModelImportStatus(incomplete, multimodalAdapter)).toBe(
      'pending',
    );
    expect(
      getProviderModelImportStatus(
        { ...incomplete, capabilities: ['TEXT_TO_VIDEO'] },
        multimodalAdapter,
      ),
    ).toBe('pending');
    expect(
      getProviderModelImportStatus(
        { ...incomplete, capabilities: ['CHAT', 'IMAGE_INPUT'] },
        multimodalAdapter,
      ),
    ).toBe('ready');
  });

  it.each([
    ['grok-imagine-video', 'VIDEO', 'TEXT_TO_VIDEO'],
    ['xai/grok-imagine-video-1.5', 'VIDEO', 'TEXT_TO_VIDEO'],
    ['image-to-video-v2', 'VIDEO', 'TEXT_TO_VIDEO'],
    ['grok-imagine-image-2.0', 'IMAGE', 'TEXT_TO_IMAGE'],
    ['grok-imagine-image-quality', 'IMAGE', 'TEXT_TO_IMAGE'],
    ['grok-2-image', 'IMAGE', 'TEXT_TO_IMAGE'],
    ['grok-4.1-fast', 'TEXT', 'CHAT'],
    ['grok-build', 'TEXT', 'CHAT'],
    ['deepseek-v4-pro', 'TEXT', 'CHAT'],
    ['gpt-image-1', 'IMAGE', 'TEXT_TO_IMAGE'],
    ['qwen3-embedding', 'EMBEDDING', 'EMBEDDING'],
    ['bge-reranker-v2', 'RERANK', 'RERANK'],
    ['tts-1', 'AUDIO', 'TEXT_TO_AUDIO'],
    ['suno-v4', 'MUSIC', 'TEXT_TO_MUSIC'],
  ])('suggests a controlled classification for %s without using adapter support', (id, modality, capability) => {
    expect(inferProviderModelType(id)).toEqual({
      capabilities: [capability],
      modality,
    });
  });

  it('keeps a video name hint pending confirmation and prevents import through a text and image channel', () => {
    const hint = inferProviderModelType('grok-imagine-video');
    const hinted = {
      id: 'grok-imagine-video',
      metadata: {},
      ...hint,
      requiresConfirmation: true,
    } satisfies FdmAiApi.ProviderModelInfo;
    expect(hinted.modality).toBe('VIDEO');
    expect(
      getProviderModelImportStatus(hinted, {
        capabilities: ['CHAT', 'TEXT_TO_IMAGE'],
        modalities: ['TEXT', 'IMAGE'],
      }),
    ).toBe('unsupported');
    expect(
      getProviderModelImportStatus(hinted, {
        capabilities: ['TEXT_TO_VIDEO'],
        modalities: ['VIDEO'],
      }),
    ).toBe('pending');
  });

  it.each(['unknown-model', 'my-image-helper', 'image', 'acme-video', 'grok-imagine', 'mygrok-4'])('does not assume a model type for ambiguous ID %s', (id) => {
    expect(inferProviderModelType(id)).toBeUndefined();
  });

  it('filters models by channel routes while preserving explicitly requested disabled models', () => {
    const models = [model(1), model(2, false), model(3)];
    const routes = [route(1, 10), route(2, 10, false), route(3, 20)];
    expect(
      filterLibraryModels(
        models,
        { keyword: '', status: 'all', providerAccountId: '10' },
        routes,
      ),
    ).toEqual(models.slice(0, 2));
    expect(
      filterLibraryModels(
        models,
        { keyword: '', status: 'disabled', providerAccountId: 10 },
        routes,
      ),
    ).toEqual([models[1]]);
    expect(
      filterLibraryModels(
        models,
        { keyword: '', status: 'all', providerAccountId: '999' },
        routes,
      ),
    ).toEqual([]);
  });

  it('groups channel sources without merging different accounts or losing upstream aliases', () => {
    const channels = [provider(10, false), provider(20)];
    const routes = [
      route(1, 10, false),
      { ...route(1, 10), providerModel: 'alias-b' },
      { ...route(1, 10), providerModel: 'alias-b' },
      route(1, 20),
      route(1, 999),
    ];
    expect(getModelChannels('1', routes, channels)).toEqual([
      {
        provider: channels[0],
        upstreamModels: ['same-upstream-model', 'alias-b'],
        hasEnabledRoute: true,
      },
      {
        provider: channels[1],
        upstreamModels: ['same-upstream-model'],
        hasEnabledRoute: true,
      },
    ]);
    expect(getModelChannels(2, routes, channels)).toEqual([]);
  });

  it('compares a channel directory against only that account and counts each upstream ID once', () => {
    const models = [model(1), model(2, false), model(3), model(4)];
    const routes = [
      route(1, 10),
      { ...route(1, 10), id: 99 },
      { ...route(2, 10), providerModel: 'inactive' },
      { ...route(3, 10), providerModel: 'missing' },
      { ...route(4, 20), providerModel: 'other-account' },
    ];
    expect(
      getChannelCatalogDiff(
        '10',
        [
          'same-upstream-model',
          'same-upstream-model',
          'inactive',
          'other-account',
          'new',
        ],
        routes,
        models,
      ),
    ).toEqual({
      newIds: ['other-account', 'new'],
      connectedIds: ['same-upstream-model'],
      inactiveIds: ['inactive'],
      missingIds: ['missing'],
      localIds: ['same-upstream-model', 'inactive', 'missing'],
    });
    expect(models[1]?.enabled).toBe(false);
    expect(routes[3]?.enabled).toBe(true);
  });

  it('treats an empty successful directory as missing information without changing stored routes', () => {
    const models = [model(1)];
    const routes = [route(1, 10, false)];
    expect(getChannelCatalogDiff(10, [], routes, models)).toEqual({
      newIds: [],
      connectedIds: [],
      inactiveIds: [],
      missingIds: ['same-upstream-model'],
      localIds: ['same-upstream-model'],
    });
    expect(routes[0]?.enabled).toBe(false);
    expect(models[0]?.enabled).toBe(true);
  });
  it('keeps disabled models out of the default list while allowing explicit recovery lookup', () => {
    const models = [model(1), model(2, false)];
    expect(
      filterLibraryModels(models, { keyword: '', status: 'enabled' }),
    ).toEqual([models[0]]);
    expect(
      filterLibraryModels(models, { keyword: ' IMAGE-2 ', status: 'disabled' }),
    ).toEqual([models[1]]);
    expect(
      filterLibraryModels(models, {
        keyword: '图片模型',
        modality: 'TEXT',
        status: 'all',
      }),
    ).toEqual([]);
  });

  it('distinguishes the same upstream model on different provider accounts', () => {
    const models = [model(1), model(2, false)];
    const routes = [route(1, 10), route(2, 20)];
    const connection = findProviderModelConnection(
      20,
      'same-upstream-model',
      routes,
      models,
    );
    expect(connection?.model.id).toBe(2);
    expect(connection?.model.enabled).toBe(false);
    expect(
      findProviderModelConnection(30, 'same-upstream-model', routes, models),
    ).toBeUndefined();
  });

  it('recognizes an active connection even when an older matching route is disabled', () => {
    const models = [model(1), model(2)];
    const connection = findProviderModelConnection(
      10,
      'same-upstream-model',
      [route(1, 10, false), route(2, 10)],
      models,
    );
    expect(connection?.model.id).toBe(2);
    expect(connection?.route.enabled).toBe(true);
  });

  it('links and restores accounts and models when JSON APIs mix numeric and string IDs', () => {
    const wireModel = {
      ...model(42, false),
      id: '42',
    } as unknown as FdmAiApi.ModelDefinition;
    const wireRoute = {
      ...route(42, 10, false),
      providerAccountId: '10',
    } as unknown as FdmAiApi.RouteDefinition;
    const connection = findProviderModelConnection(
      10,
      'same-upstream-model',
      [wireRoute],
      [wireModel],
    );
    expect(connection?.model).toBe(wireModel);
    expect(connection?.route).toBe(wireRoute);
    expect(connection?.model.enabled).toBe(false);
    expect(
      findProviderModelConnection(
        '10',
        'same-upstream-model',
        [route(42, 10)],
        [wireModel],
      )?.model,
    ).toBe(wireModel);
    expect(sameModelLibraryId(undefined, undefined)).toBe(false);
  });

  it('selects mixed ID representations without rounding distinct Java long IDs', () => {
    const first = '9223372036854775806';
    const second = '9223372036854775807';
    const wireModels = [
      { id: 42 },
      { id: first },
      { id: second },
    ] as unknown as FdmAiApi.ModelDefinition[];
    expect(
      selectLibraryModelIds(['42', 42, first, second, 'stale'], wireModels),
    ).toEqual(['42', first, second]);
    expect(sameModelLibraryId(first, second)).toBe(false);
    const connection = findProviderModelConnection(
      '10',
      'same-upstream-model',
      [
        {
          ...route(42, 10),
          modelId: second,
        } as unknown as FdmAiApi.RouteDefinition,
      ],
      wireModels,
    );
    expect(connection?.model.id).toBe(second);
  });

  it('never selects a discovered model without an explicit selection and excludes stale IDs', () => {
    expect(limitModelSelection([], ['one', 'two'])).toEqual([]);
    expect(
      limitModelSelection(['connected', 'one', 'one', 'stale'], ['one', 'two']),
    ).toEqual(['one']);
  });

  it('caps an explicit bulk selection at 100 unique eligible models', () => {
    const ids = Array.from({ length: 150 }, (_, index) => `model-${index}`);
    expect(limitModelSelection(ids, ids)).toEqual(ids.slice(0, 100));
  });

  it('preserves pricing, schema and capabilities when stopping a model without mutating the source', () => {
    const original = model(1);
    const request = modelSaveRequest(original, false);
    expect(request).toMatchObject({
      capabilities: ['TEXT_TO_IMAGE', 'IMAGE_TO_IMAGE'],
      currency: 'USD',
      enabled: false,
      parameterSchema: original.parameterSchema,
      unitPrice: 0.025,
    });
    expect(request).not.toHaveProperty('id');
    expect(original.enabled).toBe(true);
    request.capabilities.push('IMAGE_EDIT');
    expect(original.capabilities).not.toContain('IMAGE_EDIT');
  });
});
