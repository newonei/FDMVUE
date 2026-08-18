import type { FdmCreativeApi } from '#/api/fdmcreative';

/** Select only nodes returned by the authoritative server draft, never a client-side patch guess. */
export function firstRestorableAgentNode(
  draft: FdmCreativeApi.WorkflowDraft,
  affectedNodeIds: string[],
) {
  const nodes = new Set(draft.definition.nodes.map((node) => node.id));
  return affectedNodeIds.find((nodeId) => nodes.has(nodeId));
}
