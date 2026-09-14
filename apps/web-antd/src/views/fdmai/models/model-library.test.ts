import type { FdmAiApi } from '#/api/fdmai';

import { describe, expect, it } from 'vitest';

import {
  filterLibraryModels,
  findProviderModelConnection,
  getChannelCatalogDiff,
  getModelChannels,
  limitModelSelection,
  modelSaveRequest,
  sameModelLibraryId,
  selectLibraryModelIds,
} from './model-library';

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
