import type { ModelScene } from './scenarios';

import type { FdmAiApi } from '#/api/fdmai';

import { describe, expect, it } from 'vitest';

import { resolveScene, sceneCandidates } from './scenarios';

const imageScene: ModelScene = {
  capability: 'TEXT_TO_IMAGE',
  description: '根据文字生成图片',
  icon: 'ant-design:picture-outlined',
  id: 'image',
  modality: 'IMAGE',
  routeKey: 'creative.image.generate.default',
  title: '图片生成',
};

function model(
  id = 1,
  overrides: Partial<FdmAiApi.ModelDefinition> = {},
): FdmAiApi.ModelDefinition {
  return {
    capabilities: ['TEXT_TO_IMAGE'],
    code: `image-${id}`,
    enabled: true,
    id,
    modality: 'IMAGE',
    name: `图片模型 ${id}`,
    ...overrides,
  };
}

function provider(
  id = 1,
  overrides: Partial<FdmAiApi.ProviderAccount> = {},
): FdmAiApi.ProviderAccount {
  return {
    adapterCode: 'image-adapter',
    baseUrl: 'https://provider.example.test',
    configuration: {},
    credentialConfigured: true,
    enabled: true,
    id,
    name: `服务商 ${id}`,
    platform: true,
    tenantId: 1,
    ...overrides,
  };
}

function route(
  id: number | string,
  overrides: Partial<FdmAiApi.RouteDefinition> = {},
): FdmAiApi.RouteDefinition {
  return {
    enabled: true,
    // Preserve string IDs emitted for Java long values without Number conversion.
    id: id as number,
    modelId: 1,
    platform: true,
    providerAccountId: 1,
    providerModel: 'upstream-image',
    providerOptions: {},
    routeKey: imageScene.routeKey,
    tenantId: 1,
    ...overrides,
  };
}

describe('resolveScene', () => {
  it('keeps a disabled tenant override from exposing an available platform route', () => {
    const tenantRoute = route(20, { enabled: false, platform: false });
    const result = resolveScene(
      imageScene,
      [route(1), tenantRoute],
      [model()],
      [provider()],
    );

    expect(result.route).toBe(tenantRoute);
    expect(result.issue).toBe('场景配置已停用');
    expect(result.configured).toBe(false);
  });

  it('chooses the first route by ID whose route, model, and provider are enabled', () => {
    const selected = route(10, { modelId: 3, providerAccountId: 3 });
    const result = resolveScene(
      imageScene,
      [
        route(20, { modelId: 3, providerAccountId: 3 }),
        route(1, { enabled: false }),
        route(2, { modelId: 2 }),
        route(3, { providerAccountId: 2 }),
        route(4, { modelId: 99 }),
        route(5, { providerAccountId: 99 }),
        selected,
      ],
      [model(), model(2, { enabled: false }), model(3)],
      [provider(), provider(2, { enabled: false }), provider(3)],
    );

    expect(result.route).toBe(selected);
    expect(result.model?.id).toBe(3);
    expect(result.provider?.id).toBe(3);
    expect(result.configured).toBe(true);
    expect(result.issue).toBe('');
  });

  it.each<{ label: string; overrides: Partial<FdmAiApi.ModelDefinition> }>([
    { label: 'missing capability', overrides: { capabilities: ['IMAGE_EDIT'] } },
    { label: 'different modality', overrides: { modality: 'TEXT' } },
  ])('reports $label on the selected route without pretending another model is selected', ({ overrides }) => {
    const selected = route(1);
    const incompatibleModel = model(1, overrides);
    const result = resolveScene(
      imageScene,
      [route(2, { modelId: 2 }), selected],
      [incompatibleModel, model(2)],
      [provider()],
    );

    expect(result.route).toBe(selected);
    expect(result.model).toBe(incompatibleModel);
    expect(result.issue).toBe('模型不支持此场景');
    expect(result.configured).toBe(false);
  });

  it('sorts adjacent long string IDs exactly beyond JavaScript integer precision', () => {
    const selected = route('9223372036854775806');
    const result = resolveScene(
      imageScene,
      [route('10000000000000000000'), route('9223372036854775807'), selected],
      [model()],
      [provider()],
    );

    expect(result.route).toBe(selected);
    expect(result.configured).toBe(true);
  });

  it('resolves numeric IDs against equivalent string references', () => {
    const selected = route(1, {
      modelId: '1' as unknown as number,
      providerAccountId: '1' as unknown as number,
    });
    const result = resolveScene(imageScene, [selected], [model()], [provider()]);

    expect(result.configured).toBe(true);
    expect(result.model?.id).toBe(1);
    expect(result.provider?.id).toBe(1);
  });

  it('does not reuse a route configured for a different scene', () => {
    const result = resolveScene(
      imageScene,
      [route(1, { routeKey: 'creative.image.edit.default' })],
      [model()],
      [provider()],
    );

    expect(result.route).toBeUndefined();
    expect(result.issue).toBe('尚未配置场景模型');
    expect(result.configured).toBe(false);
  });
});

describe('sceneCandidates', () => {
  it('offers only enabled compatible models backed by enabled routes and providers', () => {
    const available = route(1, { routeKey: 'imported.image.model' });
    const result = sceneCandidates(
      imageScene,
      [
        available,
        route(2, { enabled: false }),
        route(3, { providerAccountId: 2 }),
        route(4, { providerAccountId: 99 }),
        route(5, { modelId: 2 }),
        route(6, { modelId: 3 }),
        route(7, { modelId: 4 }),
      ],
      [
        model(),
        model(2, { enabled: false }),
        model(3, { capabilities: ['IMAGE_EDIT'] }),
        model(4, { modality: 'VIDEO' }),
      ],
      [provider(), provider(2, { enabled: false })],
    );

    expect(result).toHaveLength(1);
    expect(result[0]?.route).toBe(available);
  });

  it('deduplicates an account and upstream pair while retaining distinct accounts and models', () => {
    const first = route(9);
    const otherAccount = route(11, { providerAccountId: 2 });
    const otherUpstream = route(12, { providerModel: 'upstream-image-pro' });
    const result = sceneCandidates(
      imageScene,
      [route(10), otherUpstream, otherAccount, first],
      [model()],
      [provider(), provider(2)],
    );

    expect(result.map((item) => item.route)).toEqual([
      first,
      otherAccount,
      otherUpstream,
    ]);
  });

  it('preserves distinct logical models sharing the same account and upstream', () => {
    const result = sceneCandidates(
      imageScene,
      [route(1), route(2, { modelId: 2 })],
      [model(), model(2)],
      [provider()],
    );

    expect(result.map((item) => item.model.id)).toEqual([1, 2]);
  });
});
