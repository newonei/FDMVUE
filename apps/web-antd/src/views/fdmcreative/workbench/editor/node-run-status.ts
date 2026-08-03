const NODE_RUN_STATUS_LABELS: Record<string, string> = {
  ARCHIVING_AI: '结果归档中',
  BLOCKED: '等待依赖',
  CANCEL_REQUESTED: '取消中',
  CANCELED: '已取消',
  FAILED: '失败',
  PARTIAL_SUCCESS: '部分完成',
  PENDING: '排队中',
  QUEUED: '排队中',
  RUNNING: '处理中',
  SKIPPED: '已跳过',
  STALE: '需更新',
  SUCCEEDED: '已完成',
  WAITING_AI: '模型生成中',
};

export function nodeRunStatusLabel(status?: string) {
  if (!status || status === 'IDLE') return '待运行';
  return NODE_RUN_STATUS_LABELS[status] ?? status;
}
