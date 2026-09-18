import type { FdmReqApi, FdmReqStatus } from '#/api/fdmreq';

export const FDMREQ_STATUS_OPTIONS: Array<{
  label: string;
  value: FdmReqStatus;
}> = [
  { label: '待分析', value: 'PENDING_ANALYSIS' },
  { label: 'AI 分析中', value: 'ANALYZING' },
  { label: '待补充', value: 'PENDING_SUPPLEMENT' },
  { label: '待审核', value: 'PENDING_CONFIRM' },
  { label: '待实现', value: 'APPROVED_PENDING_DEV' },
  { label: '实现中', value: 'DEVELOPING' },
  { label: '测试中', value: 'TESTING' },
  { label: '交付检查中', value: 'PUSHED_CHECKING' },
  { label: '待验收', value: 'PENDING_ACCEPTANCE' },
  { label: '已完成', value: 'COMPLETED' },
  { label: '已完成', value: 'ACCEPTED' },
  { label: '已阻塞', value: 'BLOCKED' },
  { label: '已取消', value: 'CANCELLED' },
];

export const FDMREQ_GROUPS = [
  { key: 'all', label: '全部需求', statuses: [] as string[] },
  {
    key: 'analysis',
    label: '需求分析',
    statuses: ['PENDING_ANALYSIS', 'ANALYZING', 'PENDING_SUPPLEMENT'],
  },
  { key: 'review', label: '待审核', statuses: ['PENDING_CONFIRM'] },
  { key: 'queued', label: '待实现', statuses: ['APPROVED_PENDING_DEV'] },
  {
    key: 'working',
    label: '执行中',
    statuses: ['DEVELOPING', 'TESTING', 'PUSHED_CHECKING'],
  },
  { key: 'acceptance', label: '待验收', statuses: ['PENDING_ACCEPTANCE'] },
  { key: 'blocked', label: '需处理', statuses: ['BLOCKED'] },
  {
    key: 'done',
    label: '已结束',
    statuses: ['COMPLETED', 'ACCEPTED', 'CANCELLED'],
  },
];

const STATUS_COLORS: Partial<Record<FdmReqStatus, string>> = {
  ANALYZING: 'processing',
  PENDING_SUPPLEMENT: 'orange',
  PENDING_CONFIRM: 'gold',
  APPROVED_PENDING_DEV: 'cyan',
  DEVELOPING: 'processing',
  TESTING: 'blue',
  PUSHED_CHECKING: 'purple',
  PENDING_ACCEPTANCE: 'orange',
  COMPLETED: 'success',
  ACCEPTED: 'success',
  BLOCKED: 'error',
};

const STATUS_META: Record<string, { color: string; label: string }> =
  Object.fromEntries(
    FDMREQ_STATUS_OPTIONS.map((option) => [
      option.value,
      {
        color: STATUS_COLORS[option.value] ?? 'default',
        label: option.label,
      },
    ]),
  );

const STATUS_HINTS: Record<string, string> = {
  PENDING_ANALYSIS: '等待 AI 生成方案',
  ANALYZING: 'AI 正在梳理范围与实现方案',
  PENDING_SUPPLEMENT: '请补充信息，帮助 AI 继续分析',
  PENDING_CONFIRM: '请审核当前方案，确认后进入实现队列',
  APPROVED_PENDING_DEV: '已通过审核，等待自动任务领取',
  DEVELOPING: '正在按已审核方案实现',
  TESTING: '正在运行检查和测试',
  PUSHED_CHECKING: '正在整理交付结果',
  PENDING_ACCEPTANCE: '请检查实现结果与测试报告',
  BLOCKED: '执行遇到问题，需要人工处理',
  COMPLETED: '需求已验收完成',
  ACCEPTED: '需求已验收完成',
  CANCELLED: '需求已取消，历史记录保留',
};

export function getFdmReqStatusMeta(status?: string) {
  return (
    STATUS_META[String(status ?? '')] ?? {
      color: 'default',
      label: status || '未知状态',
    }
  );
}

export function getFdmReqStatusHint(status?: string) {
  return STATUS_HINTS[status ?? ''] ?? '查看详情了解进展';
}

export function displayValue(value: unknown) {
  if (Array.isArray(value)) return value.length > 0 ? value.join('、') : '无';
  return String(value ?? '').trim() || '无';
}

export function canReviewVersion(
  requirement: FdmReqApi.Requirement | undefined,
  version: FdmReqApi.RequirementVersion | undefined,
) {
  return (
    requirement?.status === 'PENDING_CONFIRM' &&
    version?.id !== undefined &&
    version.id === requirement.currentVersionId &&
    !!version.contentJson?.trim() &&
    !requiresManualHandling(version.contentJson)
  );
}

export function filterRequirements(
  rows: FdmReqApi.Requirement[],
  group: string,
  keyword: string,
  status?: string,
) {
  const statuses =
    FDMREQ_GROUPS.find((item) => item.key === group)?.statuses ?? [];
  const query = keyword.trim().toLocaleLowerCase();
  return rows.filter(
    (row) =>
      (!statuses.length || statuses.includes(row.status)) &&
      (!status || row.status === status) &&
      (!query ||
        `${row.reqNo} ${row.title} ${row.rawDescription ?? ''}`
          .toLocaleLowerCase()
          .includes(query)),
  );
}

export function safeExternalUrl(value: unknown) {
  if (typeof value !== 'string') return undefined;
  try {
    const url = new URL(value);
    return ['http:', 'https:'].includes(url.protocol) ? url.href : undefined;
  } catch {
    return undefined;
  }
}

export function parseJson(value?: string): unknown {
  if (!value) return undefined;
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

const SECTION_LABELS: Record<string, string> = {
  summary: '方案概述',
  title: '标题',
  problem: '当前问题',
  goal: '目标',
  goals: '目标',
  solution: '实现方案',
  proposalText: '实现方案',
  scope: '修改范围',
  inScope: '范围内',
  outOfScope: '本次不涉及',
  steps: '实现步骤',
  implementation: '实现方式',
  implementationPlan: '实现计划',
  acceptanceCriteria: '验收标准',
  acceptance: '验收标准',
  testPlan: '测试计划',
  tests: '测试检查',
  risks: '风险与影响',
  riskLevel: '风险等级',
  rollback: '回退方案',
  rollbackPlan: '回退方案',
  assumptions: '前提条件',
  questions: '待澄清问题',
  files: '涉及文件',
  repository: '代码仓库',
  repositories: '涉及仓库',
  path: '路径',
  description: '说明',
  name: '名称',
  reason: '原因',
  expected: '预期结果',
  command: '命令',
  status: '状态',
  automationEligible: '适合自动实现',
};

export function readableValue(value: unknown, depth = 0): string {
  if (value === null || value === undefined) return '未提供';
  if (depth > 8) return '内容层级过深，请查看原始记录';
  if (Array.isArray(value))
    return value
      .map((item, index) => `${index + 1}. ${readableValue(item, depth + 1)}`)
      .join('\n');
  if (typeof value === 'object')
    return Object.entries(value)
      .map(
        ([key, item]) =>
          `${SECTION_LABELS[key] ?? key}：${readableValue(item, depth + 1)}`,
      )
      .join('\n');
  if (typeof value === 'boolean') return value ? '是' : '否';
  return String(value);
}

export function proposalSections(content?: string) {
  const parsed = parseJson(content);
  if (!parsed) return [];
  if (typeof parsed !== 'object' || Array.isArray(parsed))
    return [{ title: '实现方案', body: readableValue(parsed) }];
  return Object.entries(parsed).map(([key, value]) => ({
    title: SECTION_LABELS[key] ?? key,
    body: readableValue(value),
  }));
}

export function eventMessage(event: FdmReqApi.RequirementEvent) {
  const parsed = parseJson(event.payloadJson);
  if (parsed && typeof parsed === 'object' && 'message' in parsed)
    return readableValue(parsed.message);
  if (
    typeof parsed === 'string' &&
    [
      'BOT_CALLBACK',
      'PROPOSAL_REJECTED',
      'SUPPLEMENT_ADDED',
      'ANALYSIS_CLARIFICATION',
    ].includes(event.eventType ?? '')
  )
    return parsed;
  return '';
}

const EVENT_LABELS: Record<string, string> = {
  CREATED: '提交需求',
  REQUIREMENT_CREATED: '提交需求',
  ANALYSIS_CLAIMED: 'AI 开始分析',
  ANALYSIS_COMPLETED: 'AI 完成分析',
  PROPOSAL_WRITTEN: '生成新方案',
  PROPOSAL_CREATED: '生成新方案',
  VERSION_CREATED: '生成新方案',
  APPROVED: '审核通过',
  REJECTED: '方案已退回',
  SUPPLEMENTED: '补充需求说明',
  REANALYSIS_REQUESTED: '重新分析',
  RETRIED: '重新进入执行队列',
  RETRY_REQUESTED: '请求重试',
  CLARIFICATION_REQUESTED: 'AI 请求补充信息',
  CANCELLED: '取消需求',
  TASK_CREATED: '创建执行任务',
  TASK_CLAIMED: '领取执行任务',
  TASK_CALLBACK: '更新执行进展',
  TASK_HEARTBEAT: '执行任务在线',
  REPORT_CREATED: '提交测试报告',
  COMPLETED: '验收完成',
  UPDATED: '更新需求',
  REQUIREMENT_CANCELLED: '取消需求',
  PROPOSAL_REJECTED: '方案已退回',
  INFORMATION_ADDED: '补充需求说明',
  WORK_RETRIED: '重新进入执行队列',
  WORK_CLAIMED: '领取自动任务',
  WORK_BLOCKED: '执行遇到阻塞',
  LEASE_EXPIRED: '任务领取超时',
  REQUIREMENT_UPDATED: '更新需求',
  REQUIREMENT_DELETED: '取消需求',
  APPROVAL_CONFIRMED: '审核通过',
  REQUIREMENT_COMPLETED: '验收完成',
  START_DEV: '审核通过并等待实现',
  START_DEV_IDEMPOTENT: '已在实现队列',
  BOT_CALLBACK: '更新执行进展',
  TEST_REPORT_CREATED: '提交测试报告',
  BOT_CALLBACK_IGNORED: '忽略过期任务进展',
};

export function eventLabel(event: FdmReqApi.RequirementEvent) {
  return (
    EVENT_LABELS[event.eventType ?? ''] ??
    (event.toStatus
      ? `状态更新为${getFdmReqStatusMeta(event.toStatus).label}`
      : '记录更新')
  );
}

export function requiresManualHandling(content?: string) {
  const parsed = parseJson(content);
  return (
    !!parsed &&
    typeof parsed === 'object' &&
    'automationEligible' in parsed &&
    parsed.automationEligible === false
  );
}

/** Server wall-clock values use Asia/Shanghai; offset timestamps are converted explicitly. */
export function formatFdmReqTime(value: unknown): string {
  if (Array.isArray(value)) {
    if (value.length < 3 || !value.every((item) => Number.isFinite(item)))
      return '—';
    const [year, month, day, hour = 0, minute = 0, second = 0] =
      value as number[];
    const pad = (part: number | undefined) =>
      String(part ?? 0).padStart(2, '0');
    return `${year}-${pad(month)}-${pad(day)} ${pad(hour)}:${pad(minute)}:${pad(second)}`;
  }
  if (value === undefined || value === null || value === '') return '—';
  if (typeof value === 'string') {
    const text = value.trim();
    if (/^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?$/.test(text)) {
      return text.replace('T', ' ').split('.')[0] ?? '—';
    }
    if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text;
    if (/^\d+$/.test(text)) value = Number(text);
    else if (/^\d{4}-\d{2}-\d{2}T.*(?:Z|[+-]\d{2}:?\d{2})$/.test(text))
      value = Date.parse(text);
    else return '—';
  }
  if (typeof value !== 'number' || !Number.isFinite(value)) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Asia/Shanghai',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hourCycle: 'h23',
    })
      .formatToParts(date)
      .map((part) => [part.type, part.value]),
  );
  return `${parts.year}-${parts.month}-${parts.day} ${parts.hour}:${parts.minute}:${parts.second}`;
}
