import type { FdmCreativeApi } from '#/api/fdmcreative';

const IMAGE_PORT_TYPES = new Set<FdmCreativeApi.PortType>([
  'image-asset',
  'image-list',
]);

export interface ConnectedImageReference {
  assetId?: number;
  bindingKey: string;
  edgeId: string;
  key: string;
  mimeType?: string;
  name: string;
  sourceNodeId: string;
  sourceNodeName: string;
  sourcePortId: string;
  targetPortId: string;
  url?: string;
}

export interface PromptReferenceBinding {
  alias: string;
  bindingKey: string;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

export function normalizePromptReferenceBindings(
  value: unknown,
): PromptReferenceBinding[] {
  const source = Array.isArray(value) ? value : [];
  const aliases = new Set<string>();
  const bindingKeys = new Set<string>();
  const result: PromptReferenceBinding[] = [];
  for (const item of source) {
    const record = asRecord(item);
    const alias = typeof record.alias === 'string' ? record.alias : '';
    const bindingKey =
      typeof record.bindingKey === 'string' ? record.bindingKey : '';
    if (
      !/^图片[1-9]\d*$/.test(alias) ||
      !bindingKey ||
      aliases.has(alias) ||
      bindingKeys.has(bindingKey)
    ) {
      continue;
    }
    aliases.add(alias);
    bindingKeys.add(bindingKey);
    result.push({ alias, bindingKey });
  }
  return result;
}

export function reconcilePromptReferenceBindings(
  activeBindingKeys: Iterable<string>,
  storedBindings: PromptReferenceBinding[],
) {
  const result = normalizePromptReferenceBindings(storedBindings);
  const knownKeys = new Set(result.map((binding) => binding.bindingKey));
  let nextNumber = result.reduce((maximum, binding) => {
    const number = Number(binding.alias.replace('图片', ''));
    return Number.isInteger(number) ? Math.max(maximum, number) : maximum;
  }, 0);
  for (const bindingKey of activeBindingKeys) {
    if (!bindingKey || knownKeys.has(bindingKey)) continue;
    nextNumber += 1;
    result.push({ alias: `图片${nextNumber}`, bindingKey });
    knownKeys.add(bindingKey);
  }
  return result;
}

function positiveId(value: unknown) {
  return typeof value === 'number' && Number.isInteger(value) && value > 0
    ? value
    : undefined;
}

/**
 * Mirrors the server-side input order: target-port declaration order first,
 * then workflow edge order. This keeps @图片N aligned with referenceUrls[N - 1].
 */
export function resolveConnectedImageReferences(
  definition: FdmCreativeApi.WorkflowDefinition,
  targetNodeId: string,
  projectAssets: FdmCreativeApi.CreativeAsset[],
  generatedAssetsByNodeId: ReadonlyMap<
    string,
    FdmCreativeApi.CreativeAsset[]
  > = new Map(),
): ConnectedImageReference[] {
  const target = definition.nodes.find((node) => node.id === targetNodeId);
  if (!target) return [];

  const nodeById = new Map(definition.nodes.map((node) => [node.id, node]));
  const assetById = new Map(projectAssets.map((asset) => [asset.id, asset]));
  const targetPortOrder = new Map(
    target.ports.map((port, index) => [port.id, index]),
  );
  const edgeOrder = new Map(
    definition.edges.map((edge, index) => [edge.id, index]),
  );

  const incoming = definition.edges
    .filter((edge) => edge.targetNodeId === targetNodeId)
    .filter((edge) => {
      const source = nodeById.get(edge.sourceNodeId);
      const sourcePort = source?.ports.find(
        (port) => port.id === edge.sourcePortId && port.direction === 'OUTPUT',
      );
      const targetPort = target.ports.find(
        (port) => port.id === edge.targetPortId && port.direction === 'INPUT',
      );
      return Boolean(
        sourcePort &&
        targetPort &&
        IMAGE_PORT_TYPES.has(sourcePort.type) &&
        IMAGE_PORT_TYPES.has(targetPort.type),
      );
    })
    .sort((left, right) => {
      const portDifference =
        (targetPortOrder.get(left.targetPortId) ?? Number.MAX_SAFE_INTEGER) -
        (targetPortOrder.get(right.targetPortId) ?? Number.MAX_SAFE_INTEGER);
      return (
        portDifference ||
        (edgeOrder.get(left.id) ?? Number.MAX_SAFE_INTEGER) -
          (edgeOrder.get(right.id) ?? Number.MAX_SAFE_INTEGER)
      );
    });

  return incoming.flatMap((edge) => {
    const source = nodeById.get(edge.sourceNodeId);
    if (!source) return [];

    const configuredAsset = assetById.get(
      positiveId(source.config.assetId) ?? -1,
    );
    const assets = configuredAsset
      ? [configuredAsset]
      : (generatedAssetsByNodeId.get(source.id) ?? []).filter(
          (asset) => asset.kind === 'IMAGE',
        );

    if (assets.length === 0) {
      return [
        {
          bindingKey: `EDGE:${edge.id}:0`,
          edgeId: edge.id,
          key: `${edge.id}:pending`,
          name: source.name,
          sourceNodeId: source.id,
          sourceNodeName: source.name,
          sourcePortId: edge.sourcePortId,
          targetPortId: edge.targetPortId,
        },
      ];
    }

    return assets.map((asset, assetIndex) => ({
      assetId: asset.id,
      bindingKey: `EDGE:${edge.id}:${assetIndex}`,
      edgeId: edge.id,
      key: `${edge.id}:${asset.id}`,
      mimeType: asset.mimeType,
      name: asset.name,
      sourceNodeId: source.id,
      sourceNodeName: source.name,
      sourcePortId: edge.sourcePortId,
      targetPortId: edge.targetPortId,
      url: asset.url,
    }));
  });
}

export function invalidPromptImageReferenceNumbers(
  prompt: string,
  validReferenceNumbers: Iterable<number> | number,
) {
  const valid =
    typeof validReferenceNumbers === 'number'
      ? new Set(
          Array.from(
            { length: validReferenceNumbers },
            (_, index) => index + 1,
          ),
        )
      : new Set(validReferenceNumbers);
  const invalid = new Set<number>();
  for (const match of prompt.matchAll(/@图片(\d+)/g)) {
    const index = Number(match[1]);
    if (!Number.isInteger(index) || index < 1 || !valid.has(index)) {
      invalid.add(index);
    }
  }
  return [...invalid];
}
