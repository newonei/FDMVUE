import type { FdmCreativeApi } from '#/api/fdmcreative';

type TaskConfig = Record<string, unknown>;

const DIAGNOSTIC_STATUSES = new Set(['BLOCKED', 'FAILED', 'SKIPPED']);

const SCOPE_LABELS: Record<string, string> = {
  DOWNSTREAM: '从当前节点向下运行',
  FULL: '完整画布运行',
  NODE: '仅运行当前节点',
};

export function executionScopeLabel(scope?: string) {
  return SCOPE_LABELS[scope ?? ''] ?? scope ?? '未记录执行范围';
}

export function nodeTaskLabel(nodeRun: FdmCreativeApi.NodeRun) {
  return nodeRun.nodeType?.trim() || nodeRun.nodeId;
}

export function parseNodeTaskConfig(inputJson?: string): TaskConfig {
  if (!inputJson?.trim()) return {};
  try {
    const parsed: unknown = JSON.parse(inputJson);
    if (!parsed || Array.isArray(parsed) || typeof parsed !== 'object')
      return {};
    return parsed as TaskConfig;
  } catch {
    return {};
  }
}

export function formatNodeTaskConfig(inputJson?: string) {
  const config = parseNodeTaskConfig(inputJson);
  return Object.keys(config).length > 0
    ? JSON.stringify(config, null, 2)
    : '该节点没有额外执行参数。';
}

export function nodeTaskSummary(nodeRun: FdmCreativeApi.NodeRun) {
  const config = parseNodeTaskConfig(nodeRun.inputJson);
  const image = objectValue(config.image);
  const video = objectValue(config.video);
  const summary: string[] = [];
  const prompt = textValue(config.prompt);
  const model = textValue(config.logicalModelId ?? config.modelId);
  const negativePrompt = textValue(config.negativePrompt);
  const width = textValue(config.width ?? image?.width);
  const height = textValue(config.height ?? image?.height);
  const outputCount = textValue(config.outputCount ?? image?.outputCount);
  const duration = textValue(config.durationSeconds ?? video?.durationSeconds);

  if (prompt) summary.push(`提示词：${shortText(prompt, 96)}`);
  if (model) summary.push(`模型：${model}`);
  if (width && height) summary.push(`尺寸：${width} × ${height}`);
  if (outputCount) summary.push(`数量：${outputCount}`);
  if (duration) summary.push(`时长：${duration} 秒`);
  if (negativePrompt)
    summary.push(`反向提示词：${shortText(negativePrompt, 64)}`);

  return summary.length > 0 ? summary.join(' · ') : '查看本节点的完整执行参数';
}

export function nodeFailureDetail(nodeRun: FdmCreativeApi.NodeRun) {
  const hasDiagnostic =
    DIAGNOSTIC_STATUSES.has(nodeRun.status) ||
    Boolean(nodeRun.errorCode?.trim() || nodeRun.errorMessage?.trim());
  if (!hasDiagnostic) return undefined;
  return {
    code: nodeRun.errorCode?.trim() || 'NODE_EXECUTION_FAILED',
    message:
      nodeRun.errorMessage?.trim() ||
      '系统未返回详细失败原因。请核对任务参数和上游节点结果后重试。',
  };
}

export function executionTaskSummary(execution: FdmCreativeApi.Execution) {
  const labels = (execution.nodeRuns ?? [])
    .map((nodeRun) => nodeTaskLabel(nodeRun))
    .filter((label) => label.length > 0);
  const target = execution.startNodeId
    ? `，起点：${execution.startNodeId}`
    : '';
  const configuredCount = execution.totalNodeCount ?? labels.length;
  const sample = labels.slice(0, 3).join('、');
  const remainder = labels.length > 3 ? ` 等 ${labels.length} 个节点` : '';
  const nodes = sample ? `；节点：${sample}${remainder}` : '';
  return `${executionScopeLabel(execution.scope)}${target}；共 ${configuredCount} 个节点${nodes}`;
}

export function executionFailureSummary(execution: FdmCreativeApi.Execution) {
  const failed = (execution.nodeRuns ?? [])
    .map((nodeRun) => ({ nodeRun, detail: nodeFailureDetail(nodeRun) }))
    .filter(
      (
        item,
      ): item is {
        detail: NonNullable<ReturnType<typeof nodeFailureDetail>>;
        nodeRun: FdmCreativeApi.NodeRun;
      } => Boolean(item.detail),
    );
  if (failed.length === 0) return undefined;

  const first = failed[0]!;
  return `${failed.length} 个节点异常：${nodeTaskLabel(first.nodeRun)} · ${first.detail.message}`;
}

function objectValue(value: unknown) {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as TaskConfig)
    : undefined;
}

function textValue(value: unknown) {
  if (typeof value === 'string') return value.trim() || undefined;
  if (typeof value === 'number' || typeof value === 'boolean')
    return String(value);
  return undefined;
}

function shortText(value: string, maximumLength: number) {
  const normalized = value.replaceAll(/\s+/g, ' ').trim();
  return normalized.length > maximumLength
    ? `${normalized.slice(0, maximumLength)}…`
    : normalized;
}
