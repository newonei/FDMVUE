import type { FdmCreativeApi } from '#/api/fdmcreative';

/**
 * The UI never infers Agent state from a provider task. These groups are only a presentation of
 * the durable server-side Run state machine and keep recovery / refresh behavior deterministic.
 */
export const AGENT_ACTIVE_RUN_STATUSES = new Set<FdmCreativeApi.AgentRunStatus>([
  'APPLYING',
  'CANCEL_REQUESTED',
  'CREATED',
  'PLANNING',
]);

/** The server deliberately permits a retry only for a terminal planning failure. */
export const AGENT_RETRYABLE_RUN_STATUSES = new Set<FdmCreativeApi.AgentRunStatus>([
  'FAILED',
]);

export const AGENT_RUN_STATUS_LABEL: Record<
  FdmCreativeApi.AgentRunStatus,
  string
> = {
  APPLIED: '已应用',
  APPLYING: '正在应用',
  CANCELED: '已取消',
  CANCEL_REQUESTED: '取消中',
  CONFLICT: '草稿冲突',
  CREATED: '等待提交',
  FAILED: '规划失败',
  PLANNING: 'AI 正在规划',
  READY: '等待确认',
};

export const CANVAS_PATCH_OPERATION_LABEL: Record<
  FdmCreativeApi.CanvasPatchOperationType,
  string
> = {
  ADD_NODE: '新增节点',
  CONNECT: '新增连线',
  DELETE_NODE: '删除节点',
  DISCONNECT: '断开连线',
  MOVE_NODE: '移动节点',
  RENAME_NODE: '重命名节点',
  UPDATE_NODE_CONFIG: '更新节点配置',
};

export function isAgentRunActive(status?: FdmCreativeApi.AgentRunStatus) {
  return status !== undefined && AGENT_ACTIVE_RUN_STATUSES.has(status);
}

export function isAgentRunRetryable(status?: FdmCreativeApi.AgentRunStatus) {
  return status !== undefined && AGENT_RETRYABLE_RUN_STATUSES.has(status);
}

export function patchHasDestructiveOperation(
  patch?: FdmCreativeApi.CanvasPatch,
) {
  return Boolean(
    patch?.operations.some(
      (operation) =>
        operation.type === 'DELETE_NODE' || operation.type === 'DISCONNECT',
    ),
  );
}

/** Agent conversation / patch mutation is an EDIT operation; RUNNER can only execute applied work. */
export function canMutateAgent(
  role?: FdmCreativeApi.ProjectMemberRole,
) {
  return role === 'EDITOR' || role === 'OWNER';
}

export function canExecuteAgent(
  role?: FdmCreativeApi.ProjectMemberRole,
) {
  return role !== undefined && role !== 'VIEWER';
}

export function suggestedExecutionRequest(
  run: FdmCreativeApi.AgentRun,
):
  | undefined
  | {
      scope: Exclude<FdmCreativeApi.CanvasPatchSuggestedRunScope, 'NONE'>;
      startNodeId?: string;
    } {
  const scope = run.suggestedRunScope ?? run.patch?.suggestedRun?.scope;
  if (!scope || scope === 'NONE') return undefined;
  const startNodeId =
    run.suggestedStartNodeId ?? run.patch?.suggestedRun?.startNodeId;
  if (scope === 'NODE' && !startNodeId) return undefined;
  return { scope, startNodeId };
}
