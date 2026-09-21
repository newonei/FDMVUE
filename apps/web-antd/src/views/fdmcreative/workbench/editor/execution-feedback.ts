import type { FdmCreativeApi } from '#/api/fdmcreative';

export const EXECUTION_STATUS_LABEL: Record<
  FdmCreativeApi.ExecutionStatus,
  string
> = {
  CANCEL_REQUESTED: '取消中',
  CANCELED: '已取消',
  CREATED: '准备中',
  FAILED: '失败',
  PARTIAL_SUCCESS: '部分成功',
  RUNNING: '运行中',
  SUCCEEDED: '成功',
};

/** The scope contains work to execute, not the upstream inputs it reads. */
export function workflowRunNodeIds(
  definition: FdmCreativeApi.WorkflowDefinition,
  scope: FdmCreativeApi.ExecutionScope,
  startNodeId?: string,
) {
  const all = new Set(definition.nodes.map((node) => node.id));
  if (scope === 'FULL') return all;
  const selected = new Set<string>();
  if (!startNodeId || !all.has(startNodeId)) return selected;
  const queue = [startNodeId];
  for (let index = 0; index < queue.length; index += 1) {
    const id = queue[index]!;
    if (selected.has(id)) continue;
    selected.add(id);
    if (scope === 'DOWNSTREAM') {
      for (const edge of definition.edges) {
        if (edge.sourceNodeId === id && all.has(edge.targetNodeId)) {
          queue.push(edge.targetNodeId);
        }
      }
    }
  }
  return selected;
}

export function canRetryNode(
  execution: FdmCreativeApi.ExecutionDetail | undefined,
  run: FdmCreativeApi.NodeRun,
) {
  return Boolean(
    execution &&
    run.status === 'FAILED' &&
    !['CANCELED', 'CANCEL_REQUESTED'].includes(execution.status) &&
    execution.nodeRuns?.some(
      (item) => item.id === run.id && item.status === 'FAILED',
    ),
  );
}

/** Completion includes skipped/canceled nodes; it is deliberately not a success rate. */
export function taskProgress(execution: FdmCreativeApi.ExecutionDetail) {
  const total = execution.totalNodeCount ?? execution.nodeRuns?.length ?? 0;
  const completed = execution.nodeRuns?.length
    ? execution.nodeRuns.filter((run) =>
        ['SUCCEEDED', 'FAILED', 'CANCELED', 'SKIPPED', 'STALE'].includes(
          run.status,
        ),
      ).length
    : (execution.succeededNodeCount ?? 0) + (execution.failedNodeCount ?? 0);
  return {
    completed: Math.min(completed, total),
    percent: total ? Math.min(100, Math.round((completed / total) * 100)) : 0,
    total,
  };
}
