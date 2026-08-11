import type { FdmCreativeApi } from '#/api/fdmcreative';

export const LOOP_RUN_ID_MARKER = '::loop::';

export interface LoopRunNodeId {
  baseNodeId: string;
  iteration?: number;
}

export function parseLoopRunNodeId(nodeId: string): LoopRunNodeId {
  const markerIndex = nodeId.lastIndexOf(LOOP_RUN_ID_MARKER);
  if (markerIndex <= 0) return { baseNodeId: nodeId };
  const iteration = Number(
    nodeId.slice(markerIndex + LOOP_RUN_ID_MARKER.length),
  );
  if (!Number.isInteger(iteration) || iteration < 1) {
    return { baseNodeId: nodeId };
  }
  return { baseNodeId: nodeId.slice(0, markerIndex), iteration };
}

export function canvasNodeIdForRun(nodeId: string) {
  return parseLoopRunNodeId(nodeId).baseNodeId;
}

const ACTIVE_STATUS_PRIORITY: FdmCreativeApi.NodeRunStatus[] = [
  'ARCHIVING_AI',
  'WAITING_AI',
  'RUNNING',
  'CANCEL_REQUESTED',
  'PENDING',
  'BLOCKED',
];

function aggregateStatus(runs: FdmCreativeApi.NodeRun[]) {
  if (runs.some((run) => run.status === 'FAILED')) return 'FAILED';
  if (runs.some((run) => run.status === 'CANCELED')) return 'CANCELED';
  for (const status of ACTIVE_STATUS_PRIORITY) {
    if (runs.some((run) => run.status === status)) return status;
  }
  if (runs.every((run) => run.status === 'SUCCEEDED')) return 'SUCCEEDED';
  if (runs.some((run) => run.status === 'SKIPPED')) return 'SKIPPED';
  if (runs.some((run) => run.status === 'STALE')) return 'STALE';
  return runs.at(-1)?.status ?? 'PENDING';
}

export function aggregateLoopNodeRuns(
  runs: FdmCreativeApi.NodeRun[],
): FdmCreativeApi.NodeRun[] {
  const groups = new Map<string, FdmCreativeApi.NodeRun[]>();
  for (const run of runs) {
    const baseNodeId = canvasNodeIdForRun(run.nodeId);
    const values = groups.get(baseNodeId) ?? [];
    values.push(run);
    groups.set(baseNodeId, values);
  }
  return [...groups.entries()].map(([baseNodeId, values]) => {
    values.sort((left, right) => {
      const leftIteration = parseLoopRunNodeId(left.nodeId).iteration ?? 0;
      const rightIteration = parseLoopRunNodeId(right.nodeId).iteration ?? 0;
      return leftIteration - rightIteration || left.id - right.id;
    });
    const status = aggregateStatus(values);
    const successful = values.filter((run) => run.status === 'SUCCEEDED');
    const representative =
      values.toReversed().find((run) => run.status === status) ??
      values.at(-1)!;
    const outputRepresentative = successful.at(-1) ?? representative;
    const failed = values.find((run) => run.status === 'FAILED');
    return {
      ...representative,
      errorCode: failed?.errorCode ?? representative.errorCode,
      errorMessage: failed?.errorMessage ?? representative.errorMessage,
      nodeId: baseNodeId,
      outputJson: outputRepresentative.outputJson ?? representative.outputJson,
      status,
    };
  });
}

export function loopRunLabel(run: FdmCreativeApi.NodeRun) {
  const parsed = parseLoopRunNodeId(run.nodeId);
  return parsed.iteration
    ? `${run.nodeType || parsed.baseNodeId} · 第 ${parsed.iteration} 轮`
    : run.nodeType || run.nodeId;
}
