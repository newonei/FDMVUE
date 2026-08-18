import type { FdmCreativeApi } from '#/api/fdmcreative';

const SINGLE_PROMPT_INPUT_NODE_TYPES = new Set([
  'first-last-frame-to-video',
  'image-edit',
  'image-generate',
  'image-to-image',
  'image-to-video',
  'video-generate',
]);
const SINGLE_MEDIA_INPUT_PORTS = new Set([
  'first-last-frame-to-video:first-frame',
  'first-last-frame-to-video:last-frame',
  'image-crop:image',
  'image-edit:image',
  'image-resize:image',
  'image-split:image',
  'image-to-video:first-frame',
  'video-frame-extract:video',
  'video-normalize:video',
  'video-transition:first',
  'video-transition:second',
  'video-trim:video',
]);

export const EMPTY_WORKFLOW: FdmCreativeApi.WorkflowDefinition = {
  edges: [],
  nodes: [],
  schemaVersion: 1,
  viewport: { x: 0, y: 0, zoom: 1 },
};

export function isEditableTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false;
  return Boolean(
    target.closest('input, textarea, button, select, [contenteditable="true"]'),
  );
}
export function findWorkflowPort(
  definition: FdmCreativeApi.WorkflowDefinition,
  nodeId: string,
  portId: string,
) {
  return definition.nodes
    .find((node) => node.id === nodeId)
    ?.ports.find((port) => port.id === portId);
}

export function isPortTypeCompatible(
  sourceType: FdmCreativeApi.PortType,
  targetType: FdmCreativeApi.PortType,
) {
  if (sourceType === targetType) return true;
  const listCompatibility: Partial<
    Record<FdmCreativeApi.PortType, FdmCreativeApi.PortType[]>
  > = {
    'image-asset': ['image-list'],
    'video-asset': ['video-list'],
  };
  return listCompatibility[sourceType]?.includes(targetType) ?? false;
}

export function createsCycle(
  definition: Pick<FdmCreativeApi.WorkflowDefinition, 'edges'>,
  sourceNodeId: string,
  targetNodeId: string,
) {
  if (sourceNodeId === targetNodeId) return true;
  const adjacency = new Map<string, string[]>();
  for (const edge of definition.edges) {
    const targets = adjacency.get(edge.sourceNodeId) ?? [];
    targets.push(edge.targetNodeId);
    adjacency.set(edge.sourceNodeId, targets);
  }
  const pending = [targetNodeId];
  const visited = new Set<string>();
  while (pending.length > 0) {
    const current = pending.pop()!;
    if (current === sourceNodeId) return true;
    if (visited.has(current)) continue;
    visited.add(current);
    pending.push(...(adjacency.get(current) ?? []));
  }
  return false;
}

export interface ConnectionValidationInput {
  definition: FdmCreativeApi.WorkflowDefinition;
  sourceNodeId: string;
  sourcePortId: string;
  targetNodeId: string;
  targetPortId: string;
}

export interface AutoConnectTargetInput {
  definition: FdmCreativeApi.WorkflowDefinition;
  preferredTargetPortIds?: string[];
  sourceNodeId: string;
  sourcePortId: string;
  targetNodeId: string;
}

export function validateWorkflowConnection(input: ConnectionValidationInput) {
  const { definition, sourceNodeId, sourcePortId, targetNodeId, targetPortId } =
    input;
  const source = findWorkflowPort(definition, sourceNodeId, sourcePortId);
  const target = findWorkflowPort(definition, targetNodeId, targetPortId);
  if (!source || !target) return false;
  if (source.direction !== 'OUTPUT' || target.direction !== 'INPUT')
    return false;
  if (!isPortTypeCompatible(source.type, target.type)) return false;
  const targetNode = definition.nodes.find((node) => node.id === targetNodeId);
  const alreadyHasTargetInput = definition.edges.some(
    (edge) =>
      edge.targetNodeId === targetNodeId && edge.targetPortId === targetPortId,
  );
  if (
    target.id === 'prompt' &&
    target.type === 'prompt-text' &&
    SINGLE_PROMPT_INPUT_NODE_TYPES.has(targetNode?.type ?? '') &&
    alreadyHasTargetInput
  ) {
    return false;
  }
  if (
    SINGLE_MEDIA_INPUT_PORTS.has(`${targetNode?.type ?? ''}:${target.id}`) &&
    alreadyHasTargetInput
  ) {
    return false;
  }
  if (
    definition.edges.some(
      (edge) =>
        edge.sourceNodeId === sourceNodeId &&
        edge.sourcePortId === sourcePortId &&
        edge.targetNodeId === targetNodeId &&
        edge.targetPortId === targetPortId,
    )
  ) {
    return false;
  }
  return !createsCycle(definition, sourceNodeId, targetNodeId);
}

/**
 * Resolves a node-body drop to the first valid input port. Preferred ids are
 * normally ordered by their distance from the pointer, while validation still
 * enforces type compatibility, scalar occupancy, duplicate and cycle rules.
 */
export function findAutoConnectTargetPort(input: AutoConnectTargetInput) {
  const {
    definition,
    preferredTargetPortIds = [],
    sourceNodeId,
    sourcePortId,
    targetNodeId,
  } = input;
  const targetNode = definition.nodes.find((node) => node.id === targetNodeId);
  if (!targetNode) return undefined;

  const preferredOrder = new Map(
    preferredTargetPortIds.map((portId, index) => [portId, index]),
  );
  const inputPorts = targetNode.ports
    .filter((port) => port.direction === 'INPUT')
    .map((port, index) => ({ index, port }))
    .toSorted((left, right) => {
      const leftPriority = preferredOrder.get(left.port.id);
      const rightPriority = preferredOrder.get(right.port.id);
      if (leftPriority !== undefined || rightPriority !== undefined) {
        return (
          (leftPriority ?? Number.MAX_SAFE_INTEGER) -
          (rightPriority ?? Number.MAX_SAFE_INTEGER)
        );
      }
      return left.index - right.index;
    });

  return inputPorts.find(({ port }) =>
    validateWorkflowConnection({
      definition,
      sourceNodeId,
      sourcePortId,
      targetNodeId,
      targetPortId: port.id,
    }),
  )?.port.id;
}

export function validateWorkflowDefinition(
  definition: FdmCreativeApi.WorkflowDefinition,
) {
  if (definition.schemaVersion !== 1 || definition.nodes.length > 300) {
    return false;
  }
  const nodeIds = new Set(definition.nodes.map((node) => node.id));
  if (nodeIds.size !== definition.nodes.length) return false;
  const edgeIds = new Set<string>();
  const accepted: FdmCreativeApi.WorkflowEdge[] = [];
  for (const edge of definition.edges) {
    if (
      edgeIds.has(edge.id) ||
      !nodeIds.has(edge.sourceNodeId) ||
      !nodeIds.has(edge.targetNodeId)
    ) {
      return false;
    }
    const partialDefinition = { ...definition, edges: accepted };
    if (
      !validateWorkflowConnection({ ...edge, definition: partialDefinition })
    ) {
      return false;
    }
    edgeIds.add(edge.id);
    accepted.push(edge);
  }
  return true;
}

export function planSummary(plan?: FdmCreativeApi.ContentPlan) {
  const items = plan?.items ?? [];
  return {
    imageCount: items
      .filter((item) => item.kind === 'IMAGE')
      .reduce((sum, item) => sum + (item.image?.outputCount ?? 1), 0),
    itemCount: items.length,
    videoCount: items.filter((item) => item.kind === 'VIDEO').length,
    videoDurationSeconds: items
      .filter((item) => item.kind === 'VIDEO')
      .reduce((sum, item) => sum + (item.video?.durationSeconds ?? 0), 0),
  };
}
