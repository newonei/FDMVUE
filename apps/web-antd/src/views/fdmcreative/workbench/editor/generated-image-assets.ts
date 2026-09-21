import type { FdmCreativeApi } from '#/api/fdmcreative';

import { canvasNodeIdForRun, parseLoopRunNodeId } from './loop-run';

type CreativeAsset = FdmCreativeApi.CreativeAsset;
type NodeRun = FdmCreativeApi.NodeRun;
type OutputReference = { assetId: number } | { url: string };

const FORWARDING_NODE_TYPES = new Set([
  'image-collection',
  'image-loop',
  'image-select',
]);
const NON_IMAGE_MEDIA_TYPES = new Set([
  'AUDIO',
  'DOCUMENT',
  'OTHER',
  'TEXT',
  'VIDEO',
]);

function positiveId(value: unknown): number | undefined {
  const parsed =
    typeof value === 'string' && /^[1-9]\d*$/.test(value)
      ? Number(value)
      : value;
  return typeof parsed === 'number' &&
    Number.isSafeInteger(parsed) &&
    parsed > 0
    ? parsed
    : undefined;
}

function text(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value : undefined;
}

function runsForCanvasReferences(nodeRuns: NodeRun[]): NodeRun[] {
  const loopNodes = new Map<
    string,
    { latestId: number; runIds: Set<number> }
  >();
  const lastSuccessful = new Map<string, NodeRun>();
  for (const run of nodeRuns) {
    const { baseNodeId, iteration } = parseLoopRunNodeId(run.nodeId);
    if (iteration === undefined) continue;
    const loop = loopNodes.get(baseNodeId) ?? {
      latestId: run.id,
      runIds: new Set<number>(),
    };
    loop.latestId = Math.max(loop.latestId, run.id);
    loop.runIds.add(run.id);
    loopNodes.set(baseNodeId, loop);
    if (run.status !== 'SUCCEEDED') continue;
    const previous = lastSuccessful.get(baseNodeId);
    if (!previous || run.id > previous.id) {
      lastSuccessful.set(baseNodeId, run);
    }
  }
  for (const run of nodeRuns) {
    const loop = loopNodes.get(run.nodeId);
    if (!loop || loop.runIds.has(run.id) || run.status !== 'SUCCEEDED')
      continue;
    const previous = lastSuccessful.get(run.nodeId);
    // A genuinely newer ordinary run wins, but an aggregate alias shares a
    // loop run's ID and must not be mistaken for a separate newer execution.
    if (run.id > loop.latestId && (!previous || run.id > previous.id)) {
      lastSuccessful.set(run.nodeId, run);
    }
  }
  // Downstream execution uses one result, not a collection of all iterations.
  return nodeRuns.filter((run) => {
    const baseNodeId = canvasNodeIdForRun(run.nodeId);
    return !loopNodes.has(baseNodeId) || lastSuccessful.get(baseNodeId) === run;
  });
}

/** Resolve archived images without depending on the asset page or task completion. */
export function resolveGeneratedImageAssets(
  projectId: number,
  nodeRuns: NodeRun[],
  projectAssets: CreativeAsset[],
): Map<string, CreativeAsset[]> {
  const result = new Map<string, CreativeAsset[]>();
  if (!positiveId(projectId)) return result;

  const knownAssetsById = new Map(
    projectAssets.map((asset) => [asset.id, asset]),
  );
  const imageAssets = projectAssets
    .filter(
      (asset) =>
        asset.projectId === projectId &&
        asset.kind === 'IMAGE' &&
        positiveId(asset.id),
    )
    .toSorted((left, right) => left.id - right.id);
  const imagesById = new Map(imageAssets.map((asset) => [asset.id, asset]));
  const imagesByUrl = new Map<string, CreativeAsset[]>();
  for (const asset of imageAssets) {
    if (!asset.url) continue;
    const matches = imagesByUrl.get(asset.url) ?? [];
    matches.push(asset);
    imagesByUrl.set(asset.url, matches);
  }

  const referencesByRun = new Map<NodeRun, OutputReference[]>();
  for (const run of nodeRuns) {
    const references: OutputReference[] = [];
    referencesByRun.set(run, references);
    let output: unknown;
    try {
      output = run.outputJson ? JSON.parse(run.outputJson) : undefined;
    } catch {
      continue;
    }

    const collect = (value: unknown, depth: number) => {
      if (!value || typeof value !== 'object' || depth > 32) return;
      if (Array.isArray(value)) {
        value.forEach((item) => collect(item, depth + 1));
        return;
      }
      const record = value as Record<string, unknown>;
      const kind = text(record.type ?? record.kind)?.toUpperCase();
      if (kind && NON_IMAGE_MEDIA_TYPES.has(kind)) return;
      const assetId = positiveId(record.assetId);
      const url = text(record.url);
      const mimeType = text(record.mimeType);
      const isImage = kind === 'IMAGE' || mimeType?.startsWith('image/');
      if (
        assetId &&
        url &&
        isImage &&
        !knownAssetsById.has(assetId) &&
        !imagesById.has(assetId)
      ) {
        // Only archived output carries an asset ID. A raw provider URL alone
        // must never become a project asset or an upstream reference.
        imagesById.set(assetId, {
          id: assetId,
          kind: 'IMAGE',
          mimeType,
          name:
            text(record.name) ?? `${canvasNodeIdForRun(run.nodeId)}-${assetId}`,
          projectId,
          sourceNodeRunId: FORWARDING_NODE_TYPES.has(run.nodeType ?? '')
            ? undefined
            : run.id,
          url,
        });
      }
      for (const [key, child] of Object.entries(record)) {
        if (key === 'assetId' && assetId) references.push({ assetId });
        if (key === 'url' && url) references.push({ url });
        collect(child, depth + 1);
      }
    };
    collect(output, 0);
  }

  for (const run of runsForCanvasReferences(nodeRuns)) {
    const nodeId = canvasNodeIdForRun(run.nodeId);
    const assets = result.get(nodeId) ?? [];
    const seen = new Set(assets.map((asset) => asset.id));
    const append = (asset?: CreativeAsset) => {
      if (asset && !seen.has(asset.id)) {
        assets.push(asset);
        seen.add(asset.id);
      }
    };
    const sourceAssets = imageAssets.filter(
      (asset) => asset.sourceNodeRunId === run.id,
    );
    const references = referencesByRun.get(run) ?? [];
    const appendReference = (reference: OutputReference) => {
      if ('assetId' in reference) append(imagesById.get(reference.assetId));
      else imagesByUrl.get(reference.url)?.forEach(append);
    };

    if (FORWARDING_NODE_TYPES.has(run.nodeType ?? '')) {
      // Collection/select outputs represent an explicit image order.
      references.forEach(appendReference);
      sourceAssets.forEach(append);
    } else {
      // Mirrors CreativeArtifactService.resolveNodeAssets: generated assets by
      // ID first, output asset IDs next, then URL references to real assets.
      sourceAssets.forEach(append);
      references
        .filter((reference) => 'assetId' in reference)
        .forEach(appendReference);
      references
        .filter((reference) => 'url' in reference)
        .forEach(appendReference);
    }
    if (assets.length > 0) result.set(nodeId, assets);
  }
  return result;
}
