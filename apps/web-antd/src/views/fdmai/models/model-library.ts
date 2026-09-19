import type { FdmAiApi } from '#/api/fdmai';

export const MODEL_IMPORT_LIMIT = 100;

const CAPABILITY_MODALITIES: Record<
  FdmAiApi.Capability,
  FdmAiApi.Modality
> = {
  CHAT: 'TEXT',
  EMBEDDING: 'EMBEDDING',
  FIRST_FRAME_TO_VIDEO: 'VIDEO',
  FIRST_LAST_FRAME_TO_VIDEO: 'VIDEO',
  IMAGE_EDIT: 'IMAGE',
  IMAGE_INPUT: 'TEXT',
  IMAGE_TO_IMAGE: 'IMAGE',
  MULTI_REFERENCE: 'IMAGE',
  RERANK: 'RERANK',
  STRUCTURED_OUTPUT: 'TEXT',
  TEXT_TO_AUDIO: 'AUDIO',
  TEXT_TO_IMAGE: 'IMAGE',
  TEXT_TO_MUSIC: 'MUSIC',
  TEXT_TO_VIDEO: 'VIDEO',
};

/** A name is a review hint, never evidence that the current channel implements its API. */
export function inferProviderModelType(id: string):
  | { capabilities: FdmAiApi.Capability[]; modality: FdmAiApi.Modality }
  | undefined {
  const rules: Array<[RegExp, FdmAiApi.Modality, FdmAiApi.Capability]> = [
    [
      /(?:^|[^a-z0-9])(?:sora|seedance|veo|kling|hailuo|runway|luma|text-to-video|image-to-video|video-generation|grok-imagine-video)(?:[^a-z0-9]|$)/i,
      'VIDEO',
      'TEXT_TO_VIDEO',
    ],
    [
      /(?:^|[^a-z0-9])(?:gpt-image|dall-e|dalle|seedream|imagen|flux|stable-diffusion|sdxl|midjourney|recraft|ideogram|qwen-image|wanx|grok-imagine-image|grok-2-image)(?:[^a-z0-9]|$)/i,
      'IMAGE',
      'TEXT_TO_IMAGE',
    ],
    [
      /(?:^|[^a-z0-9])(?:rerank|reranker)(?:[^a-z0-9]|$)/i,
      'RERANK',
      'RERANK',
    ],
    [
      /(?:^|[^a-z0-9])(?:embedding|embeddings|embed|bge-m3)(?:[^a-z0-9]|$)/i,
      'EMBEDDING',
      'EMBEDDING',
    ],
    [
      /(?:^|[^a-z0-9])(?:suno|udio|music-generation|text-to-music)(?:[^a-z0-9]|$)/i,
      'MUSIC',
      'TEXT_TO_MUSIC',
    ],
    [
      /(?:^|[^a-z0-9])(?:tts|text-to-speech|speech-generation|voice-generation)(?:[^a-z0-9]|$)/i,
      'AUDIO',
      'TEXT_TO_AUDIO',
    ],
    [
      /(?:^|[^a-z0-9])(?:gpt-[0-9]|chatgpt|o[134](?:[^a-z0-9]|$)|codex(?:[^a-z0-9]|$)|grok-(?:[0-9]|build(?:[^a-z0-9]|$)))/i,
      'TEXT',
      'CHAT',
    ],
    [
      /(?:^|[^a-z0-9])(?:claude|gemini|deepseek|qwen|llama|mistral|command-r|glm|kimi|moonshot)(?:[^a-z0-9]|$|[0-9])/i,
      'TEXT',
      'CHAT',
    ],
  ];
  const rule = rules.find(([pattern]) => pattern.test(id.trim()));
  return rule ? { capabilities: [rule[2]], modality: rule[1] } : undefined;
}

type ProviderModelAdapter = Pick<
  FdmAiApi.AdapterDescriptor,
  'capabilities' | 'modalities'
>;

export interface ProviderModelSupport {
  reason:
    | 'adapter-unavailable'
    | 'backend-blocked'
    | 'capability-unsupported'
    | 'classification-incomplete'
    | 'modality-unsupported'
    | 'supported';
  status: 'supported' | 'unknown' | 'unsupported';
  unsupportedCapabilities: FdmAiApi.Capability[];
}

/** Classification describes the model; adapter support only controls whether it can be connected. */
export function getProviderModelSupport(
  model: Pick<
    FdmAiApi.ProviderModelInfo,
    'capabilities' | 'importable' | 'modality'
  >,
  adapter?: ProviderModelAdapter,
): ProviderModelSupport {
  if (model.importable === false) {
    return {
      reason: 'backend-blocked',
      status: 'unsupported',
      unsupportedCapabilities: [],
    };
  }
  if (!adapter?.modalities?.length || !adapter.capabilities?.length) {
    return {
      reason: 'adapter-unavailable',
      status: 'unknown',
      unsupportedCapabilities: [],
    };
  }
  if (
    !model.modality ||
    !model.capabilities?.length ||
    model.capabilities.some(
      (capability) => CAPABILITY_MODALITIES[capability] !== model.modality,
    ) ||
    (model.modality === 'TEXT' &&
      !model.capabilities.some(
        (capability) => capability === 'CHAT' || capability === 'STRUCTURED_OUTPUT',
      ))
  ) {
    return {
      reason: 'classification-incomplete',
      status: 'unknown',
      unsupportedCapabilities: [],
    };
  }
  const unsupportedCapabilities = model.capabilities.filter(
    (capability) => !adapter.capabilities.includes(capability),
  );
  if (!adapter.modalities.includes(model.modality)) {
    return {
      reason: 'modality-unsupported',
      status: 'unsupported',
      unsupportedCapabilities,
    };
  }
  if (unsupportedCapabilities.length > 0) {
    return {
      reason: 'capability-unsupported',
      status: 'unsupported',
      unsupportedCapabilities,
    };
  }
  return {
    reason: 'supported',
    status: 'supported',
    unsupportedCapabilities: [],
  };
}

/** A model awaiting confirmation can be imported after review; unsupported models cannot. */
export function getProviderModelImportStatus(
  model: FdmAiApi.ProviderModelInfo & { userConfirmed?: boolean },
  adapter?: ProviderModelAdapter,
): 'pending' | 'ready' | 'unsupported' {
  const support = getProviderModelSupport(model, adapter);
  if (support.status === 'unsupported') return 'unsupported';
  if (
    support.status !== 'supported' ||
    ((model.requiresConfirmation || model.classificationSource === 'FALLBACK') &&
      !model.userConfirmed)
  ) {
    return 'pending';
  }
  return 'ready';
}

/** Keep Java long IDs as strings; coercing them to Number can lose precision. */
export function sameModelLibraryId(left: unknown, right: unknown) {
  return (
    left !== null &&
    left !== undefined &&
    right !== null &&
    right !== undefined &&
    String(left) === String(right)
  );
}

export function selectLibraryModelIds(
  keys: Array<number | string>,
  visibleModels: Pick<FdmAiApi.ModelDefinition, 'id'>[],
) {
  const visible = new Set(visibleModels.map((model) => String(model.id)));
  return [...new Set(keys.map(String))].filter((id) => visible.has(id));
}

export function filterLibraryModels(
  models: FdmAiApi.ModelDefinition[],
  filter: {
    keyword: string;
    modality?: FdmAiApi.Modality;
    providerAccountId?: number | string;
    status: 'all' | 'disabled' | 'enabled';
  },
  routes: FdmAiApi.RouteDefinition[] = [],
) {
  const keyword = filter.keyword.trim().toLocaleLowerCase();
  const channelModels =
    filter.providerAccountId == null
      ? undefined
      : new Set(
          routes
            .filter((route) =>
              sameModelLibraryId(
                route.providerAccountId,
                filter.providerAccountId,
              ),
            )
            .map((route) => String(route.modelId)),
        );
  return models.filter(
    (model) =>
      (!channelModels || channelModels.has(String(model.id))) &&
      (!keyword ||
        `${model.name} ${model.code}`.toLocaleLowerCase().includes(keyword)) &&
      (!filter.modality || model.modality === filter.modality) &&
      (filter.status === 'all' ||
        model.enabled === (filter.status === 'enabled')),
  );
}

/** A logical model may have several routes on one channel, or sources on several channels. */
export function getModelChannels(
  modelId: number | string,
  routes: FdmAiApi.RouteDefinition[],
  providers: FdmAiApi.ProviderAccount[],
) {
  return providers.flatMap((provider) => {
    const sources = routes.filter(
      (route) =>
        sameModelLibraryId(route.modelId, modelId) &&
        sameModelLibraryId(route.providerAccountId, provider.id),
    );
    if (!sources.length) return [];
    return [
      {
        provider,
        upstreamModels: [
          ...new Set(sources.map((route) => route.providerModel)),
        ],
        hasEnabledRoute: sources.some((route) => route.enabled),
      },
    ];
  });
}

/** Compare only a successfully fetched directory. Missing entries are informational, never deletions. */
export function getChannelCatalogDiff(
  providerId: number | string | undefined,
  upstreamIds: string[],
  routes: FdmAiApi.RouteDefinition[],
  models: FdmAiApi.ModelDefinition[],
) {
  const modelIds = new Set(models.map((model) => String(model.id)));
  const localIds = [
    ...new Set(
      routes
        .filter(
          (route) =>
            sameModelLibraryId(route.providerAccountId, providerId) &&
            modelIds.has(String(route.modelId)),
        )
        .map((route) => route.providerModel),
    ),
  ];
  const returnedIds = [...new Set(upstreamIds)];
  const returned = new Set(returnedIds);
  const newIds: string[] = [];
  const connectedIds: string[] = [];
  const inactiveIds: string[] = [];
  for (const id of returnedIds) {
    const connection = findProviderModelConnection(
      providerId,
      id,
      routes,
      models,
    );
    if (!connection) newIds.push(id);
    else if (connection.model.enabled && connection.route.enabled)
      connectedIds.push(id);
    else inactiveIds.push(id);
  }
  return {
    newIds,
    connectedIds,
    inactiveIds,
    missingIds: localIds.filter((id) => !returned.has(id)),
    localIds,
  };
}

export function findProviderModelConnection(
  providerAccountId: number | string | undefined,
  providerModel: string,
  routes: FdmAiApi.RouteDefinition[],
  models: FdmAiApi.ModelDefinition[],
) {
  const connections = routes
    .filter(
      (route) =>
        sameModelLibraryId(route.providerAccountId, providerAccountId) &&
        sameModelLibraryId(route.providerModel, providerModel),
    )
    .map((route) => ({
      model: models.find((model) =>
        sameModelLibraryId(model.id, route.modelId),
      ),
      route,
    }))
    .filter(
      (
        connection,
      ): connection is {
        model: FdmAiApi.ModelDefinition;
        route: FdmAiApi.RouteDefinition;
      } => Boolean(connection.model),
    );
  return (
    connections.find(({ model, route }) => model.enabled && route.enabled) ??
    connections[0]
  );
}

/** Select only explicitly eligible IDs; never retain hidden, stale or connected IDs. */
export function limitModelSelection(
  keys: Array<number | string>,
  eligible: string[],
) {
  const allowed = new Set(eligible.map(String));
  return [...new Set(keys.map(String))]
    .filter((key) => allowed.has(key))
    .slice(0, MODEL_IMPORT_LIMIT);
}

export function modelSaveRequest(
  model: FdmAiApi.ModelDefinition,
  enabled = model.enabled,
): FdmAiApi.ModelSaveReq {
  return {
    capabilities: [...model.capabilities],
    code: model.code,
    currency: model.currency,
    enabled,
    modality: model.modality,
    name: model.name,
    parameterSchema: model.parameterSchema,
    unitPrice: model.unitPrice,
  };
}
