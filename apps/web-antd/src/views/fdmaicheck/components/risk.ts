import type { FdmAiCheckApi } from '#/api/fdmaicheck';

export const SEVERITY_LABELS: Record<FdmAiCheckApi.Severity, string> = {
  HIGH: '高风险',
  WARNING: '需核对',
  INFO: '提示',
  NONE: '无风险',
};

export const SEVERITY_COLORS: Record<FdmAiCheckApi.Severity, string> = {
  HIGH: 'red',
  WARNING: 'orange',
  INFO: 'blue',
  NONE: 'green',
};

export const STATUS_LABELS: Record<FdmAiCheckApi.FindingStatus, string> = {
  OPEN: '待处理',
  RESOLVED: '已处理',
  FALSE_POSITIVE: '误报',
  IGNORED: '已忽略',
};

/** AI 没有检查时给人看的原因；SUCCEEDED 返回空。 */
export function aiStatusText(status?: string) {
  switch (status) {
    case 'FAILED': {
      return 'AI 检查未完成，只保留了规则检查结果';
    }
    case 'NOT_CONFIGURED': {
      return '这家公司还没有放行 AI 单据检查的模型，只做了规则检查';
    }
    case 'TOO_LARGE': {
      return '单据资料较多，只做了规则检查';
    }
    case 'UNAVAILABLE': {
      return 'AI 服务暂不可用，只做了规则检查';
    }
    default: {
      return '';
    }
  }
}

/** 列表里只标出需要留意的等级；无风险和提示不占位置。 */
export function listTagVisible(level?: FdmAiCheckApi.Severity) {
  return level === 'HIGH' || level === 'WARNING';
}

/** 待处理的排在前面，同状态按严重程度从高到低。 */
export function sortFindings(findings: FdmAiCheckApi.Finding[]) {
  const rank: Record<string, number> = { HIGH: 0, WARNING: 1, INFO: 2 };
  return findings.toSorted(
    (a, b) =>
      Number(a.status !== 'OPEN') - Number(b.status !== 'OPEN') ||
      (rank[a.severity] ?? 9) - (rank[b.severity] ?? 9) ||
      a.id - b.id,
  );
}

/** 标为误报、忽略时必须填理由。 */
export function needsReason(status: FdmAiCheckApi.FindingStatus) {
  return status === 'FALSE_POSITIVE' || status === 'IGNORED';
}
