import type { FdmAiApi } from '#/api/fdmai';

export const MODEL_IMPORT_LIMIT = 100;

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
