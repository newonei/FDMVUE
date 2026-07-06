import type {
  AssessmentBatch,
  AssessmentInstance,
  AssessmentTemplate,
  BatchStatus,
  FlowStage,
  Indicator,
  IndicatorScoreState,
  InstanceStatus,
  InterviewRecord,
  ParticipantScope,
  ScoreSummary,
} from './model';

import type { FdmPerformanceAssessmentApi } from '#/api/fdmperformance/assessment';
import type { FdmPerformanceTemplateApi } from '#/api/fdmperformance/template';

import { defaultTemplateFlowNode } from './model';

const periodTypeTextMap: Record<number, string> = {
  1: '月度',
  2: '季度',
  3: '半年度',
  4: '年度',
  5: '试用期',
  6: '日',
  99: '自定义',
};

const batchStatusMap: Record<number, BatchStatus> = {
  [-1]: 'canceled',
  10: 'indicatorConfirm',
  20: 'executing',
  30: 'scoring',
  40: 'hrReview',
  45: 'pendingPublish',
  50: 'resultVisible',
  100: 'finished',
};

const instanceStatusMap: Record<number, InstanceStatus> = {
  [-1]: 'canceled',
  10: 'indicatorConfirm',
  20: 'executing',
  30: 'selfScore',
  40: 'supervisorScore',
  50: 'hrReview',
  55: 'pendingPublish',
  60: 'resultVisible',
  100: 'finished',
};

const instanceRoleScoreKeyMap: Record<number, keyof IndicatorScoreState> = {
  1: 'self',
  2: 'supervisor',
};

export function apiPeriodTypeToText(periodType?: number) {
  return periodTypeTextMap[periodType || 1] || '月度';
}

export function apiPeriodTextToType(periodType?: string) {
  return (
    Number(
      Object.entries(periodTypeTextMap).find(
        ([, label]) => label === periodType,
      )?.[0],
    ) || 1
  );
}

export function apiPeriodKeyToText(periodKey?: string) {
  if (!periodKey) return '';
  const match = /^(\d{4})-(\d{2})$/.exec(periodKey);
  return match ? `${match[1]}年${match[2]}月` : periodKey;
}

export function periodTextToApiKey(periodText: string) {
  const match = /^(\d{4})年(\d{2})月$/.exec(periodText);
  return match ? `${match[1]}-${match[2]}` : periodText;
}

export function mapApiTemplate(
  template:
    | FdmPerformanceTemplateApi.SimpleTemplate
    | FdmPerformanceTemplateApi.Template,
): AssessmentTemplate {
  const fullTemplate = template as FdmPerformanceTemplateApi.Template;
  const dimensions = fullTemplate.dimensions || [];
  const participants = (fullTemplate.participants || []).map((item) =>
    Number(item.userId),
  );
  const launchRule = fullTemplate.launchRuleJson
    ? safeParse<{ participantScope?: Partial<ParticipantScope> }>(
        fullTemplate.launchRuleJson,
        {},
      )
    : {};
  return {
    admins: (fullTemplate.managerUserIds || []).map((id) => `用户${id}`),
    autoLaunch: Boolean(fullTemplate.autoLaunch),
    customDimensions: dimensions.map((item) => item.name),
    flowNode: fullTemplate.simpleFlowJson
      ? safeParse(fullTemplate.simpleFlowJson, defaultTemplateFlowNode)
      : defaultTemplateFlowNode,
    group: fullTemplate.groupName || '未分类考评表',
    id: Number(template.id || 0),
    indicatorIds: dimensions.flatMap((dimension) =>
      (dimension.indicators || []).map((indicator) =>
        Number(indicator.id || indicator.indicatorId || 0),
      ),
    ),
    name: template.name,
    participantScope: normalizeParticipantScope(
      launchRule.participantScope,
      participants,
    ),
    participants,
    periodType: apiPeriodTypeToText(template.periodType),
    scoringRule: buildScoringRule(dimensions),
    status: template.status === 1 ? 'enabled' : 'draft',
    updatedAt: fullTemplate.updateTime || '',
  };
}

function normalizeParticipantScope(
  scope: Partial<ParticipantScope> | undefined,
  participantIds: number[],
): ParticipantScope {
  const mode = ['department', 'people', 'role', 'userGroup'].includes(
    scope?.mode || '',
  )
    ? (scope?.mode as ParticipantScope['mode'])
    : 'people';
  const peopleIds =
    Array.isArray(scope?.peopleIds) && scope.peopleIds.length > 0
      ? scope.peopleIds.map(Number).filter((id) => Number.isFinite(id))
      : participantIds;
  return {
    deptNames: Array.isArray(scope?.deptNames)
      ? scope.deptNames.filter(Boolean)
      : [],
    mode,
    peopleIds,
    roleNames: Array.isArray(scope?.roleNames)
      ? scope.roleNames.filter(Boolean)
      : [],
    userGroupNames: Array.isArray(scope?.userGroupNames)
      ? scope.userGroupNames.filter(Boolean)
      : [],
  };
}

export function mapApiTemplateIndicators(
  template?: FdmPerformanceTemplateApi.Template,
) {
  const dimensions = template?.dimensions || [];
  if (dimensions.length === 0) return [];
  return dimensions.flatMap((dimension) =>
    (dimension.indicators || []).map((indicator) =>
      mapApiTemplateIndicator(dimension, indicator),
    ),
  );
}

export function mapApiBatch(
  batch: FdmPerformanceAssessmentApi.Batch,
  instances: AssessmentInstance[] = [],
): AssessmentBatch & { finishedCount?: number; instanceCount?: number } {
  return {
    finishedCount: batch.finishedCount || 0,
    id: batch.id,
    instanceCount:
      batch.instanceCount || (instances.length > 0 ? instances.length : 0),
    instances,
    name: batch.name || `${apiPeriodKeyToText(batch.periodKey)}绩效考核`,
    period: apiPeriodKeyToText(batch.periodKey),
    status: batchStatusMap[Number(batch.status)] || 'indicatorConfirm',
    templateId: Number(batch.templateIds?.[0] || 0),
  };
}

export function mapApiInstance(
  instance: FdmPerformanceAssessmentApi.Instance,
): AssessmentInstance {
  const indicatorScores = buildIndicatorScores(instance.scores || []);
  const scoreSummaries = mapScoreSummaries(instance.scoreSummaries);
  return {
    currentExecutor: instance.currentNodeName,
    employeeId: Number(instance.userId || 0),
    finalScore: instance.finalScore,
    flowSnapshot: parseFlowSnapshotJson(instance.flowSnapshotJson),
    grade: instance.gradeName,
    gradeAdjusted: Boolean(instance.gradeAdjusted),
    gradeAdjustReason: instance.gradeAdjustReason,
    gradeAdjustTime: instance.gradeAdjustTime,
    gradeAdjustUserId: instance.gradeAdjustUserId,
    id: instance.id,
    indicatorScores,
    interviewRecords: mapChangeLogsToInterviewRecords(
      instance.interviewRecords,
    ),
    nodeName: instance.currentNodeName || '未开始',
    progress: instance.progressCurrent || 1,
    resultConfirmed: Boolean(instance.resultConfirmed),
    resultObjection:
      getLatestLogReason(instance.resultObjections, 'reason') ||
      (instance.currentNodeKey === 'Performance_Result_Objection'
        ? '已提交结果异议，等待绩效管理员处理'
        : undefined),
    resultVisible: Boolean(instance.resultVisible),
    reviewCcUserIds: instance.reviewCcUserIds,
    reviewDeadline: instance.reviewDeadline,
    reviewEmployeeConfirmTime: instance.reviewEmployeeConfirmTime,
    reviewEmployeeUserId: instance.reviewEmployeeUserId,
    reviewReason: instance.reviewReason,
    reviewRequired: Boolean(instance.reviewRequired),
    reviewStatus: instance.reviewStatus,
    reviewSupervisorConfirmTime: instance.reviewSupervisorConfirmTime,
    reviewSupervisorUserId: instance.reviewSupervisorUserId,
    scoreSummaries,
    selfScore: getRoleSummaryScore(scoreSummaries, 1, 2),
    status: instanceStatusMap[Number(instance.status)] || 'indicatorConfirm',
    stayTime: instance.resultVisibleTime ? '已公示' : '处理中',
    supervisorScore: getRoleSummaryScore(scoreSummaries, 2, 3),
    systemGradeName: instance.systemGradeName,
    templateId: Number(instance.templateId || 0) || undefined,
  };
}

function mapChangeLogsToInterviewRecords(
  logs?: FdmPerformanceAssessmentApi.ChangeLog[],
): InterviewRecord[] {
  return (logs || []).map((log) => ({
    conclusion: getLatestLogReason([log], 'conclusion') || log.reason || '',
    createdAt: log.createTime || '',
    id: log.id,
    owner: log.operatorUserId ? `用户${log.operatorUserId}` : '系统',
  }));
}

function getLatestLogReason(
  logs: FdmPerformanceAssessmentApi.ChangeLog[] | undefined,
  jsonKey: string,
) {
  const log = logs?.[0];
  if (!log) return undefined;
  const payload = log.afterJson
    ? safeParse<Record<string, unknown>>(log.afterJson, {})
    : {};
  const value = payload[jsonKey];
  return typeof value === 'string' && value.trim() ? value : log.reason;
}

export function buildApiScoreItems(
  indicators: Indicator[],
  scores: Record<number, number>,
  comments: Record<number, string> = {},
  attachmentIds: Record<number, string> = {},
): FdmPerformanceAssessmentApi.ScoreItemReq[] {
  return indicators.map((indicator) => ({
    attachmentIds: attachmentIds[indicator.id],
    dimensionId: Number(indicator.dimensionId || indicator.id),
    score: scores[indicator.id] ?? 0,
    scoreComment: comments[indicator.id],
    templateIndicatorId: Number(indicator.templateIndicatorId || indicator.id),
  }));
}

function mapApiTemplateIndicator(
  dimension: FdmPerformanceTemplateApi.Dimension,
  indicator: FdmPerformanceTemplateApi.TemplateIndicator,
): Indicator {
  const id = Number(indicator.id || indicator.indicatorId || 0);
  return {
    dimension: dimension.name,
    dimensionId: Number(dimension.id || id),
    dimensionType: Number(dimension.dimensionType || 1),
    dimensionWeight: Number(dimension.weight || 0),
    id,
    name: indicator.name,
    scoreMode: indicator.scoringMethod === 2 ? '评分组' : '手动评分',
    standard: indicator.standard || '',
    status: indicator.status === 1 ? 'stopped' : 'enabled',
    tags: [dimension.name],
    templateIndicatorId: id,
    weight: Number(indicator.weight || 0),
  };
}

function buildIndicatorScores(scores: FdmPerformanceAssessmentApi.Score[]) {
  const result: Record<number, IndicatorScoreState> = {};
  scores.forEach((score) => {
    const indicatorId = Number(score.templateIndicatorId || 0);
    if (!indicatorId) return;
    const key = instanceRoleScoreKeyMap[Number(score.scorerRoleType)];
    const historyKey = String(
      score.taskId || score.nodeKey || score.scorerRoleType || 'score',
    );
    const current = result[indicatorId] || {};
    result[indicatorId] = {
      ...current,
      attachmentIds: score.attachmentIds || current.attachmentIds,
      final: Number(score.score || 0),
      histories: {
        ...current.histories,
        [historyKey]: {
          comment: score.scoreComment,
          score: Number(score.score || 0),
        },
      },
      remark: score.scoreComment || current.remark,
      scoreComment: score.scoreComment || current.scoreComment,
      ...(key ? { [key]: Number(score.score || 0) } : {}),
    };
  });
  return result;
}

function mapScoreSummaries(
  scores?: FdmPerformanceAssessmentApi.ScoreSummary[],
): ScoreSummary[] {
  return (scores || []).map((item) => ({
    comment: item.comment,
    nodeKey: item.nodeKey,
    nodeName: item.nodeName,
    scoreWeight: item.scoreWeight,
    scorerRoleType: item.scorerRoleType,
    scorerUserId: item.scorerUserId,
    submitTime: item.submitTime,
    taskId: item.taskId,
    taskType: item.taskType,
    totalScore: item.totalScore,
  }));
}

function getRoleSummaryScore(
  scores: ScoreSummary[],
  scorerRoleType: number,
  taskType: number,
) {
  const matched = [...scores]
    .toReversed()
    .find(
      (item) =>
        item.scorerRoleType === scorerRoleType || item.taskType === taskType,
    );
  return matched?.totalScore;
}

function buildScoringRule(dimensions: FdmPerformanceTemplateApi.Dimension[]) {
  if (dimensions.length === 0) return '未配置评分规则';
  return dimensions
    .map((item) => `${item.name}${item.weight ? `${item.weight}%` : ''}`)
    .join(' + ');
}

interface ApiSimpleFlowNode {
  childNode?: ApiSimpleFlowNode;
  conditionNodes?: ApiSimpleFlowNode[];
  id?: number | string;
  name?: string;
  showText?: string;
}

export function extractFlowStagesFromSimpleNode(node?: unknown): FlowStage[] {
  if (!node || typeof node !== 'object') return [];
  const stages: FlowStage[] = [];
  const visit = (current?: ApiSimpleFlowNode) => {
    if (!current) return;
    const fallbackId = stages.length > 0 ? stages.length : 0;
    const id = String(current.id || current.name || fallbackId);
    if (!['EndEvent', 'StartUserNode'].includes(id)) {
      stages.push({
        id,
        name: current.name || '未命名节点',
        owner: current.showText || '按节点配置',
      });
    }
    current.conditionNodes?.forEach((item) => visit(item));
    visit(current.childNode);
  };
  visit(node as ApiSimpleFlowNode);
  return stages;
}

function normalizeFlowStages(items: unknown[]): FlowStage[] {
  return items
    .map((item, index) => {
      if (!item || typeof item !== 'object') return undefined;
      const row = item as Record<string, unknown>;
      return {
        id: String(row.id || row.nodeKey || index),
        name: String(row.name || row.nodeName || `节点${index + 1}`),
        owner: String(row.owner || row.showText || '按节点配置'),
      };
    })
    .filter(Boolean) as FlowStage[];
}

function parseFlowSnapshotJson(raw?: string): FlowStage[] | undefined {
  if (!raw) return undefined;
  const parsed = safeParse<unknown>(raw, undefined);
  if (!parsed) return undefined;
  if (Array.isArray(parsed)) {
    return normalizeFlowStages(parsed);
  }
  if (typeof parsed === 'object') {
    const row = parsed as Record<string, unknown>;
    if (Array.isArray(row.stages)) {
      return normalizeFlowStages(row.stages);
    }
    if (Array.isArray(row.nodes)) {
      return normalizeFlowStages(row.nodes);
    }
    const stages = extractFlowStagesFromSimpleNode(parsed);
    return stages.length > 0 ? stages : undefined;
  }
  return undefined;
}

function safeParse<T>(raw: string, fallback: T): T {
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}
