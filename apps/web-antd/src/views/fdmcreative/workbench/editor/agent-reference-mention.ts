import type { FdmCreativeApi } from '#/api/fdmcreative';

/**
 * Presentation aliases are intentionally kept out of the payload sent to the Agent API. The
 * server only accepts a stable typed ID, while the UI can safely retain a friendly name locally.
 */
export interface AgentReferenceMention {
  alias: string;
  reference: FdmCreativeApi.AgentReference;
}

export function agentReferenceKey(reference: FdmCreativeApi.AgentReference) {
  return `${reference.type}:${reference.id}`;
}

export function createAgentReferenceMention(
  type: FdmCreativeApi.AgentReferenceType,
  id: number | string,
  alias: string,
): AgentReferenceMention {
  const normalizedId = String(id).trim();
  if (!normalizedId || normalizedId.length > 128) {
    throw new TypeError('Agent 引用 ID 无效');
  }
  return {
    alias: alias.trim() || normalizedId,
    reference: { id: normalizedId, type },
  };
}

export function displayAgentReferenceMention(
  mention: AgentReferenceMention,
) {
  const label = { ASSET: '资产', NODE: '画布节点', PROMPT: '提示词' }[
    mention.reference.type
  ];
  return `@${label} · ${mention.alias}`;
}
