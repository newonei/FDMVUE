<script lang="ts" setup>
import type { TableColumnsType } from 'ant-design-vue';

import type {
  AssessmentBatch,
  AssessmentInstance,
  AssessmentTemplate,
  Employee,
  FlowStage,
  Indicator,
  ScoreSummary,
} from '../../shared/model';

import type { FdmPerformanceAssessmentApi } from '#/api/fdmperformance/assessment';
import type { SystemUserApi } from '#/api/system/user';

import { computed, h, onMounted, reactive, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';

import { useAccess } from '@vben/access';
import { useUserStore } from '@vben/stores';

import {
  Button,
  Card,
  Dropdown,
  Empty,
  Input,
  InputNumber,
  Menu,
  message,
  Modal,
  Progress,
  Select,
  Space,
  Table,
  Tag,
  Upload,
} from 'ant-design-vue';

import {
  confirmFdmPerformanceAssessmentGradeReview,
  confirmFdmPerformanceAssessmentIndicators,
  confirmFdmPerformanceAssessmentResult,
  confirmMyFdmPerformanceAssessmentIndicators,
  confirmMyFdmPerformanceAssessmentResult,
  getFdmPerformanceAssessmentBatch,
  getFdmPerformanceAssessmentInstance,
  getFdmPerformanceAssessmentTaskPage,
  getMyFdmPerformanceAssessmentInstance,
  jumpFdmPerformanceAssessmentTask,
  publishFdmPerformanceAssessmentResult,
  recordFdmPerformanceAssessmentInterview,
  skipFdmPerformanceAssessmentTask,
  submitFdmPerformanceAssessmentHrReview,
  submitFdmPerformanceAssessmentScore,
  submitMyFdmPerformanceAssessmentScore,
  transferFdmPerformanceAssessmentTasks,
} from '#/api/fdmperformance/assessment';
import { getFdmPerformanceTemplate } from '#/api/fdmperformance/template';
import { uploadFile } from '#/api/infra/file';
import { getSimpleUserList } from '#/api/system/user';

import {
  buildApiScoreItems,
  extractFlowStagesFromSimpleNode,
  mapApiBatch,
  mapApiInstance,
  mapApiTemplate,
  mapApiTemplateIndicators,
} from '../../shared/api-adapter';
import { instanceStatusMetaMap } from '../../shared/model';
import PerformanceShell from '../../shared/PerformanceShell.vue';
import { usePerformancePath } from '../../shared/route';

defineOptions({ name: 'FdmPerformanceInstanceDetail' });

type ScoreType = 'self' | 'supervisor';

interface DimensionGroup {
  dimensionId?: number;
  dimensionType?: number;
  dimensionWeight?: number;
  indicators: Indicator[];
  name: string;
}

interface ScoreSummaryCard extends ScoreSummary {
  cardType?: 'final';
}

interface GradeReviewInterviewForm {
  entryDate: string;
  improvementTarget: string;
  interviewee: string;
  interviewer: string;
  missedIndicators: string;
  position: string;
  reasonAnalysis: string;
  supportNeeded: string;
  workCompletion: string;
}

interface GradeReviewRecord {
  form?: GradeReviewInterviewForm;
  rawComment?: string;
  task: FdmPerformanceAssessmentApi.Task;
  title: string;
}

type ScrollTarget = HTMLElement | { $el?: HTMLElement };

const DEDUCTION_DIMENSION_TYPE = 4;
const GRADE_REVIEW_REQUIRED_FIELDS: Array<
  [keyof GradeReviewInterviewForm, string]
> = [
  ['interviewee', '被访谈人'],
  ['entryDate', '入职时间'],
  ['position', '岗位'],
  ['interviewer', '访谈人'],
  ['workCompletion', '本月工作完成情况'],
  ['reasonAnalysis', '主要原因分析'],
  ['missedIndicators', '主要未达标指标'],
  ['improvementTarget', '下月改进方向与目标'],
  ['supportNeeded', '需要获得的帮助'],
];
const CORE_FLOW_STAGES: FlowStage[] = [
  {
    id: 'Performance_Indicator_Create',
    name: '指标制定',
    owner: '考评表管理员',
  },
  { id: 'Performance_Indicator_Confirm', name: '指标确认', owner: '被考核人' },
  { id: 'Performance_Executing', name: '执行中', owner: '被考核人' },
  { id: 'Performance_Self_Score', name: '员工自评', owner: '被考核人' },
  { id: 'Performance_Manager_Score', name: '主管评分', owner: '直接主管' },
  { id: 'Performance_Hr_Approve', name: '人事审核', owner: '绩效管理员' },
  { id: 'Performance_Result_Confirm', name: '结果确认', owner: '被考核人' },
];
const CORE_FLOW_STAGE_ALIASES: Record<string, string[]> = {
  Performance_Executing: ['执行'],
  Performance_Hr_Approve: ['人事审核', '审批', '审核'],
  Performance_Indicator_Confirm: ['指标确认'],
  Performance_Indicator_Create: ['指标制定'],
  Performance_Manager_Score: ['主管评分', '上级评分', '直接主管评分'],
  Performance_Result_Confirm: ['结果确认'],
  Performance_Self_Score: ['自评', '员工自评'],
};
const FLOW_JUMPABLE_NODE_KEYS = new Set([
  'Performance_Executing',
  'Performance_Hr_Approve',
  'Performance_Indicator_Confirm',
  'Performance_Manager_Score',
  'Performance_Self_Score',
]);

const route = useRoute();
const router = useRouter();
const { hasAccessByCodes } = useAccess();
const userStore = useUserStore();
const { performancePath } = usePerformancePath();

const apiLoading = ref(false);
const submittingScore = ref(false);
const reviewRemark = ref('');
const interviewModalOpen = ref(false);
const interviewConclusion = ref('已完成绩效沟通，后续动作同步到行动计划');
const nodeComment = ref('');
const flowActionLoading = ref(false);
const transferModalOpen = ref(false);
const transferTargetUserId = ref<number>();
const transferReason = ref('');
const gradeReviewForm = reactive<GradeReviewInterviewForm>(
  createEmptyGradeReviewForm(),
);
const gradeReviewSubmitting = ref(false);
const flowCardRef = ref<null | ScrollTarget>(null);
const processRecordRef = ref<null | ScrollTarget>(null);

const scoreInputs = reactive<Record<number, number>>({});
const scoreComments = reactive<Record<number, string>>({});
const scoreAttachments = reactive<Record<number, string>>({});

const apiBatch = ref<AssessmentBatch>();
const apiInstance = ref<AssessmentInstance>();
const apiEmployee = ref<Employee>();
const apiTemplate = ref<AssessmentTemplate>();
const apiTemplateIndicators = ref<Indicator[]>([]);
const apiTasks = ref<FdmPerformanceAssessmentApi.Task[]>([]);
const simpleUsers = ref<SystemUserApi.User[]>([]);

const batch = computed(() => apiBatch.value);
const instance = computed(() => apiInstance.value);
const employee = computed(() => apiEmployee.value);
const template = computed(() => apiTemplate.value);
const templateIndicators = computed(() => apiTemplateIndicators.value);
const isMyMode = computed(() => route.query.source === 'my');

const requestedScoreType = computed<ScoreType | undefined>(() => {
  if (route.query.scoreType === 'supervisor') return 'supervisor';
  if (route.query.scoreType === 'self') return 'self';
  return undefined;
});
const activeScoreType = computed<ScoreType>(() => {
  if (requestedScoreType.value) return requestedScoreType.value;
  return instance.value?.status === 'supervisorScore' ? 'supervisor' : 'self';
});
const activeScoreTask = computed(() =>
  getPendingScoreTask(activeScoreType.value),
);
const currentUserId = computed(() => Number(userStore.userInfo?.id || 0));
const pendingTasks = computed(() => {
  const instanceId = instance.value?.id;
  return apiTasks.value.filter(
    (task) => task.status === 0 && task.instanceId === instanceId,
  );
});
const pendingGradeReviewTask = computed(() =>
  pendingTasks.value.find((task) => [6, 7].includes(Number(task.taskType))),
);
const currentPendingTask = computed(
  () => activeScoreTask.value || pendingTasks.value[0],
);
const canConfirmGradeReview = computed(
  () =>
    Boolean(pendingGradeReviewTask.value) &&
    Number(pendingGradeReviewTask.value?.assigneeUserId) ===
      currentUserId.value,
);
const gradeReviewRecords = computed<GradeReviewRecord[]>(() =>
  apiTasks.value
    .filter(
      (task) =>
        [6, 7].includes(Number(task.taskType)) &&
        Number(task.status) === 1 &&
        Boolean(task.finishComment),
    )
    .toSorted(
      (left, right) => Number(left.taskType || 0) - Number(right.taskType || 0),
    )
    .map((task) => {
      const form = parseGradeReviewForm(task.finishComment);
      return {
        form,
        rawComment: form ? undefined : task.finishComment,
        task,
        title: getTaskTypeLabel(task.taskType),
      };
    }),
);
const canOperateFlow = computed(() =>
  hasAccessByCodes(['fdmperformance:assessment:cancel']),
);
const canManageFlow = computed(
  () =>
    !isMyMode.value &&
    canOperateFlow.value &&
    Boolean(currentPendingTask.value) &&
    !['canceled', 'finished'].includes(String(instance.value?.status || '')),
);
const canShowAdminMoreMenu = computed(
  () => !isMyMode.value && canOperateFlow.value && Boolean(instance.value),
);
const isActiveScoreStatus = computed(
  () =>
    (activeScoreType.value === 'self' &&
      instance.value?.status === 'selfScore') ||
    (activeScoreType.value === 'supervisor' &&
      instance.value?.status === 'supervisorScore'),
);
const scoreEditorVisible = computed(() =>
  Boolean(instance.value && isActiveScoreStatus.value),
);
const canScore = computed(() => {
  if (!instance.value || !activeScoreTask.value || !isActiveScoreStatus.value)
    return false;
  if (
    !currentUserId.value ||
    Number(activeScoreTask.value.assigneeUserId) !== currentUserId.value
  )
    return false;
  return true;
});
const scoreEditorReadonlyText = computed(() => {
  if (!scoreEditorVisible.value || canScore.value) return '';
  if (!activeScoreTask.value)
    return '当前评分节点未生成待办任务，请检查流程配置或回退流程后重新处理。';
  return `当前待办处理人：${getUserDisplayName(activeScoreTask.value.assigneeUserId)}，当前账号不能提交评分；管理员可先进行流程转交。`;
});
const scoreActionLabel = computed(() =>
  activeScoreType.value === 'self' ? '提交自评' : '提交主管评分',
);

const transferUserOptions = computed(() =>
  simpleUsers.value
    .filter((user) => user.id !== undefined && user.id !== null)
    .map((user) => ({
      label: user.nickname || user.username || `用户${user.id}`,
      value: Number(user.id),
    })),
);

const flowStages = computed(() => {
  const stages = instance.value?.flowSnapshot?.length
    ? instance.value.flowSnapshot
    : extractFlowStagesFromSimpleNode(template.value?.flowNode);
  return normalizeFlowStagesForDisplay(stages);
});
const currentFlowIndex = computed(() =>
  Math.min(
    Math.max((instance.value?.progress || 1) - 1, 0),
    Math.max(flowStages.value.length - 1, 0),
  ),
);
const scorePercent = computed(() =>
  Math.round(
    ((currentFlowIndex.value + 1) / Math.max(flowStages.value.length, 1)) * 100,
  ),
);
const flowItems = computed(() =>
  flowStages.value.map((stage, index) => {
    const stepNo = index + 1;
    const progress = instance.value?.progress || 1;
    let prefix = '待处理';
    if (stepNo < progress) {
      prefix = '已完成';
    } else if (stepNo === progress) {
      prefix = '当前节点';
    }
    return {
      description: `${prefix} · ${stage.owner}`,
      title: stage.name,
    };
  }),
);

const scoreSummaries = computed(() => instance.value?.scoreSummaries || []);
const historySummaries = computed(() =>
  scoreSummaries.value.toSorted(compareScoreSummary),
);
const calculatedFinalScore = computed(() =>
  calculateSummaryFinalScore(scoreSummaries.value),
);
const scoreSummaryCards = computed<ScoreSummaryCard[]>(() => {
  const finalScore = instance.value?.finalScore;
  const cards: ScoreSummaryCard[] = [];
  const summaryFinalScore = calculatedFinalScore.value;
  if (finalScore !== undefined && finalScore !== null) {
    cards.push({
      cardType: 'final',
      nodeName: '绩效总分',
      scoreWeight: undefined,
      totalScore: finalScore,
    });
  } else if (
    scoreSummaries.value.length > 1 &&
    summaryFinalScore !== undefined
  ) {
    cards.push({
      cardType: 'final',
      comment: hasSummaryWeight(scoreSummaries.value)
        ? '按评分节点权重汇总'
        : '取最后评分节点总分',
      nodeName: '绩效总分',
      scoreWeight: undefined,
      totalScore: summaryFinalScore,
    });
  }
  return [...cards, ...scoreSummaries.value];
});

const dimensionGroups = computed<DimensionGroup[]>(() => {
  const groupMap = new Map<string, DimensionGroup>();
  templateIndicators.value.forEach((indicator) => {
    const key = String(
      indicator.dimensionId || indicator.dimension || 'default',
    );
    const current = groupMap.get(key) || {
      dimensionId: indicator.dimensionId,
      dimensionType: indicator.dimensionType,
      dimensionWeight: indicator.dimensionWeight,
      indicators: [],
      name: indicator.dimension || '未分组指标',
    };
    current.indicators.push(indicator);
    groupMap.set(key, current);
  });
  return [...groupMap.values()];
});

const currentNodeTotal = computed(() =>
  Number(
    templateIndicators.value
      .reduce(
        (sum, indicator) =>
          sum + normalizeIndicatorScore(indicator, scoreInputs[indicator.id]),
        0,
      )
      .toFixed(2),
  ),
);

const scoreColumns = computed<TableColumnsType>(() => {
  const columns: TableColumnsType = [
    { dataIndex: 'name', fixed: 'left', title: '指标名称', width: 180 },
    { dataIndex: 'standard', title: '考核标准', width: 360 },
    { dataIndex: 'weight', title: '权重/上限', width: 120 },
    { dataIndex: 'remark', title: '备注', width: 220 },
    { dataIndex: 'attachment', title: '附件', width: 150 },
  ];
  historySummaries.value.forEach((summary) => {
    columns.push({
      children: [
        {
          dataIndex: getSummaryScoreColumnKey(summary),
          title: '评分',
          width: 100,
        },
        {
          dataIndex: getSummaryCommentColumnKey(summary),
          title: '说明',
          width: 240,
        },
      ],
      title: getSummaryLabel(summary),
    });
  });
  if (scoreEditorVisible.value) {
    columns.push(
      {
        dataIndex: 'currentScore',
        title: renderRequiredTitle('当前评分'),
        width: 150,
      },
      {
        dataIndex: 'scoreComment',
        title: renderRequiredTitle('评分说明'),
        width: 260,
      },
    );
  }
  return columns;
});

const scoreTableScrollX = computed(() => {
  const baseWidth = 1030;
  const historyWidth = historySummaries.value.length * 340;
  const editorWidth = scoreEditorVisible.value ? 410 : 0;
  return Math.max(1280, baseWidth + historyWidth + editorWidth);
});

function getInstanceMeta(status: unknown) {
  return (
    instanceStatusMetaMap[status as keyof typeof instanceStatusMetaMap] || {
      color: 'default',
      label: '未知',
    }
  );
}

function getScoreTaskType(type: ScoreType) {
  return type === 'self' ? 2 : 3;
}

function getPendingScoreTask(type: ScoreType) {
  const instanceId = instance.value?.id;
  const taskType = getScoreTaskType(type);
  return apiTasks.value.find(
    (task) =>
      task.status === 0 &&
      task.instanceId === instanceId &&
      task.taskType === taskType,
  );
}

function getUserDisplayName(userId?: number) {
  if (!userId) return '-';
  const user = simpleUsers.value.find(
    (item) => Number(item.id) === Number(userId),
  );
  return user?.nickname || user?.username || `用户${userId}`;
}

function getFlowStageStatus(index: number) {
  if (index < currentFlowIndex.value) return 'done';
  if (index === currentFlowIndex.value) return 'active';
  return 'pending';
}

function getFlowStageOwner(stage: { owner?: string }, index: number) {
  if (
    index === currentFlowIndex.value &&
    currentPendingTask.value?.assigneeUserId
  ) {
    return getUserDisplayName(currentPendingTask.value.assigneeUserId);
  }
  return stage.owner || flowItems.value[index]?.description || '-';
}

function getTaskTypeLabel(taskType?: number) {
  const labelMap: Record<number, string> = {
    1: '指标确认',
    2: '员工自评',
    3: '主管评分',
    4: '人事审核',
    5: '结果确认',
    6: '绩效复盘员工确认',
    7: '绩效复盘主管确认',
  };
  return taskType ? labelMap[taskType] || `任务${taskType}` : '-';
}

function getGradeReviewStatusText() {
  if (!instance.value?.reviewRequired) return '未触发';
  const statusMap: Record<number, string> = {
    1: '待确认',
    2: '已完成',
    3: '已取消',
  };
  return statusMap[Number(instance.value.reviewStatus || 0)] || '待确认';
}

function getGradeReviewStatusColor() {
  if (!instance.value?.reviewRequired) return 'default';
  const colorMap: Record<number, string> = {
    1: 'orange',
    2: 'green',
    3: 'default',
  };
  return colorMap[Number(instance.value.reviewStatus || 0)] || 'orange';
}

function getConfirmTimeText(value?: string) {
  return value || '待确认';
}

function getReviewCcUserNames(value?: string) {
  const userIds = (value || '')
    .split(',')
    .map((item) => Number(item.trim()))
    .filter((item) => Number.isFinite(item) && item > 0);
  if (userIds.length === 0) return '-';
  return userIds.map((userId) => getUserDisplayName(userId)).join('、');
}

function createEmptyGradeReviewForm(): GradeReviewInterviewForm {
  return {
    entryDate: '',
    improvementTarget: '',
    interviewee: '',
    interviewer: '',
    missedIndicators: '',
    position: '',
    reasonAnalysis: '',
    supportNeeded: '',
    workCompletion: '',
  };
}

function resetGradeReviewForm() {
  Object.assign(gradeReviewForm, createEmptyGradeReviewForm());
  fillGradeReviewDefaults();
}

function fillGradeReviewDefaults() {
  if (!gradeReviewForm.interviewee && employee.value?.name) {
    gradeReviewForm.interviewee = employee.value.name;
  }
  if (
    !gradeReviewForm.position &&
    employee.value?.post &&
    employee.value.post !== '-'
  ) {
    gradeReviewForm.position = employee.value.post;
  }
  const currentUserFallback = currentUserId.value
    ? `用户${currentUserId.value}`
    : '';
  const currentUserName = getUserDisplayName(currentUserId.value);
  if (
    currentUserName &&
    currentUserName !== '-' &&
    (!gradeReviewForm.interviewer ||
      gradeReviewForm.interviewer === currentUserFallback)
  ) {
    gradeReviewForm.interviewer = currentUserName;
  }
}

function validateGradeReviewForm() {
  fillGradeReviewDefaults();
  const missingField = GRADE_REVIEW_REQUIRED_FIELDS.find(([key]) => {
    const value = gradeReviewForm[key];
    return !String(value || '').trim();
  });
  if (missingField) {
    message.warning(`请填写${missingField[1]}`);
    return false;
  }
  return true;
}

function buildGradeReviewCommentSummary() {
  return `C级绩效面谈表：${gradeReviewForm.interviewee}`;
}

function parseGradeReviewForm(
  comment?: string,
): GradeReviewInterviewForm | undefined {
  if (!comment) return undefined;
  try {
    const parsed = JSON.parse(comment) as Partial<GradeReviewInterviewForm>;
    if (!parsed || typeof parsed !== 'object') return undefined;
    if (!('workCompletion' in parsed) && !('reasonAnalysis' in parsed)) {
      return undefined;
    }
    return {
      ...createEmptyGradeReviewForm(),
      ...parsed,
    };
  } catch {
    return undefined;
  }
}

function getCoreFlowStageIndex(stage: FlowStage) {
  const id = String(stage.id || '');
  const name = String(stage.name || '');
  const exactIndex = CORE_FLOW_STAGES.findIndex((item) => item.id === id);
  if (exactIndex !== -1) return exactIndex;
  return CORE_FLOW_STAGES.findIndex((item) =>
    (CORE_FLOW_STAGE_ALIASES[item.id] || [item.name]).some((alias) =>
      name.includes(alias),
    ),
  );
}

function normalizeFlowStagesForDisplay(stages: FlowStage[] = []) {
  const result = CORE_FLOW_STAGES.map((stage) => ({ ...stage }));
  const extraStages: FlowStage[] = [];
  stages.forEach((stage) => {
    const coreIndex = getCoreFlowStageIndex(stage);
    if (coreIndex !== -1) {
      const coreStage = result[coreIndex];
      if (!coreStage) {
        extraStages.push(stage);
        return;
      }
      result[coreIndex] = {
        ...coreStage,
        ...stage,
        id: coreStage.id,
        name: stage.name || coreStage.name,
        owner: stage.owner || coreStage.owner,
      };
      return;
    }
    extraStages.push(stage);
  });
  if (extraStages.length > 0) {
    const hrIndex = result.findIndex(
      (stage) => stage.id === 'Performance_Hr_Approve',
    );
    result.splice(hrIndex === -1 ? result.length : hrIndex, 0, ...extraStages);
  }
  return result;
}

function getSummaryColumnKey(summary: ScoreSummary) {
  return `summary_${summary.taskId || summary.nodeKey || summary.scorerRoleType || 'score'}`;
}

function getSummaryScoreColumnKey(summary: ScoreSummary) {
  return `${getSummaryColumnKey(summary)}_score`;
}

function getSummaryCommentColumnKey(summary: ScoreSummary) {
  return `${getSummaryColumnKey(summary)}_comment`;
}

function getScoreSummaryOrder(summary: ScoreSummary) {
  if (summary.scorerRoleType === 1 || summary.taskType === 2) return 20;
  if (summary.scorerRoleType === 2 || summary.taskType === 3) return 30;
  if (summary.taskType === 4) return 40;
  return summary.taskType || 99;
}

function compareScoreSummary(left: ScoreSummary, right: ScoreSummary) {
  const orderDiff = getScoreSummaryOrder(left) - getScoreSummaryOrder(right);
  if (orderDiff !== 0) return orderDiff;
  return Number(left.taskId || 0) - Number(right.taskId || 0);
}

function getSummaryNodeName(summary: ScoreSummary) {
  if (summary.nodeName) return summary.nodeName;
  if (summary.scorerRoleType === 1 || summary.taskType === 2) return '员工自评';
  if (summary.scorerRoleType === 2 || summary.taskType === 3) return '主管评分';
  return '评分';
}

function getSummaryUserName(summary: ScoreSummary) {
  if (summary.scorerRoleType === 1 || summary.taskType === 2) {
    return employee.value?.name || getUserDisplayName(summary.scorerUserId);
  }
  return getUserDisplayName(summary.scorerUserId);
}

function getSummaryLabel(summary: ScoreSummary) {
  const userName = getSummaryUserName(summary);
  if (userName && userName !== '-')
    return `${getSummaryNodeName(summary)}-${userName}`;
  const roleNodeNameMap: Record<number, string> = {
    1: '自评',
    2: '主管评分',
  };
  const nodeName =
    summary.nodeName ||
    roleNodeNameMap[Number(summary.scorerRoleType)] ||
    '评分';
  return summary.scorerUserId
    ? `${nodeName}-用户${summary.scorerUserId}`
    : nodeName;
}

function getSummaryByColumnKey(columnKey: string) {
  return historySummaries.value.find((item) => {
    const baseKey = getSummaryColumnKey(item);
    return (
      baseKey === columnKey ||
      getSummaryScoreColumnKey(item) === columnKey ||
      getSummaryCommentColumnKey(item) === columnKey
    );
  });
}

function getSummaryHistory(record: Record<string, any>, columnKey: string) {
  const summary = getSummaryByColumnKey(columnKey);
  if (!summary) return undefined;
  const historyKey = String(
    summary.taskId || summary.nodeKey || summary.scorerRoleType || 'score',
  );
  return instance.value?.indicatorScores?.[record.id]?.histories?.[historyKey];
}

function getSummaryScore(record: Record<string, any>, columnKey: string) {
  const history = getSummaryHistory(record, columnKey);
  return history?.score ?? '-';
}

function getSummaryComment(record: Record<string, any>, columnKey: string) {
  const history = getSummaryHistory(record, columnKey);
  return history?.comment || '';
}

function isSummaryScoreColumn(columnKey: string) {
  return columnKey.startsWith('summary_') && columnKey.endsWith('_score');
}

function isSummaryCommentColumn(columnKey: string) {
  return columnKey.startsWith('summary_') && columnKey.endsWith('_comment');
}

function getActiveScoreHistoryKey() {
  const task = activeScoreTask.value;
  return task
    ? String(task.id || task.nodeKey || getScoreTaskType(activeScoreType.value))
    : String(getScoreTaskType(activeScoreType.value));
}

function getDimensionTitle(group: DimensionGroup) {
  const weightText = group.dimensionWeight ? ` ${group.dimensionWeight}%` : '';
  return `${group.name}${weightText}`;
}

function isDeductionIndicator(indicator: Pick<Indicator, 'dimensionType'>) {
  return indicator.dimensionType === DEDUCTION_DIMENSION_TYPE;
}

function normalizeIndicatorScore(
  indicator: Pick<Indicator, 'dimensionType'>,
  score?: number,
) {
  const value = Number(score || 0);
  return isDeductionIndicator(indicator) ? -Math.abs(value) : value;
}

function hasSummaryWeight(summaries: ScoreSummary[]) {
  return summaries.some(
    (summary) =>
      summary.scoreWeight !== undefined && summary.scoreWeight !== null,
  );
}

function calculateSummaryFinalScore(summaries: ScoreSummary[]) {
  const scoredSummaries = summaries.filter(
    (summary) =>
      summary.totalScore !== undefined && summary.totalScore !== null,
  );
  if (scoredSummaries.length === 0) return undefined;
  if (!hasSummaryWeight(scoredSummaries)) {
    return scoredSummaries.at(-1)?.totalScore;
  }
  const total = scoredSummaries.reduce(
    (sum, summary) =>
      sum +
      (Number(summary.totalScore || 0) * Number(summary.scoreWeight || 0)) /
        100,
    0,
  );
  return Number(total.toFixed(2));
}

function isScoreCommentRequired(indicator: Pick<Indicator, 'dimensionType'>) {
  return ![3, 4].includes(Number(indicator.dimensionType || 0));
}

function renderRequiredTitle(label: string) {
  return h('span', { class: 'required-column-title' }, [
    h('span', { class: 'required-marker' }, '*'),
    label,
  ]);
}

function getAttachmentCount(value?: string) {
  return (value || '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean).length;
}

function initScoreDraft() {
  Object.keys(scoreInputs).forEach((key) =>
    Reflect.deleteProperty(scoreInputs, key),
  );
  Object.keys(scoreComments).forEach((key) =>
    Reflect.deleteProperty(scoreComments, key),
  );
  Object.keys(scoreAttachments).forEach((key) =>
    Reflect.deleteProperty(scoreAttachments, key),
  );

  const type = activeScoreType.value;
  const historyKey = getActiveScoreHistoryKey();
  templateIndicators.value.forEach((indicator) => {
    const state = instance.value?.indicatorScores?.[indicator.id];
    scoreInputs[indicator.id] = state?.[type] ?? state?.final ?? 0;
    scoreComments[indicator.id] = state?.histories?.[historyKey]?.comment || '';
    scoreAttachments[indicator.id] = state?.attachmentIds || '';
  });
  const currentSummary = scoreSummaries.value.find(
    (item) => item.taskId === activeScoreTask.value?.id,
  );
  nodeComment.value = currentSummary?.comment || '';
}

function goBack() {
  router.push(
    isMyMode.value
      ? performancePath('/my')
      : performancePath(`/batches/${batch.value?.id || ''}`),
  );
}

function scrollTargetIntoView(target: null | ScrollTarget) {
  const element = target instanceof HTMLElement ? target : target?.$el;
  element?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function openTemplateEditor(step: 'basic' | 'flow' | 'indicators') {
  if (!template.value?.id) {
    message.warning('当前考评表信息未加载完成');
    return;
  }
  router.push({
    path: performancePath(`/templates/${template.value.id}/edit`),
    query: { step },
  });
}

function scrollToFlowActions() {
  scrollTargetIntoView(flowCardRef.value);
  message.info('可在流程区域转交、跳过当前节点，或点击可回退节点调整流程');
}

function scrollToProcessRecords() {
  scrollTargetIntoView(processRecordRef.value);
}

function resetFlowToIndicatorConfirm() {
  const targetIndex = flowStages.value.findIndex(
    (stage) => stage.id === 'Performance_Indicator_Confirm',
  );
  const targetStage = flowStages.value[targetIndex];
  if (!targetStage) {
    message.warning('未找到指标确认节点，无法重置流程');
    return;
  }
  jumpToFlowStage(targetStage, targetIndex);
}

async function confirmIndicators() {
  if (!instance.value) return;
  const request = isMyMode.value
    ? confirmMyFdmPerformanceAssessmentIndicators
    : confirmFdmPerformanceAssessmentIndicators;
  await request(instance.value.id);
  await loadApiData();
  message.success('指标已确认');
}

async function ensureSimpleUsers() {
  if (simpleUsers.value.length > 0) return;
  simpleUsers.value = await getSimpleUserList();
}

async function openTransferModal() {
  if (!currentPendingTask.value) {
    message.warning('当前没有可转交的待办');
    return;
  }
  await ensureSimpleUsers();
  transferTargetUserId.value = undefined;
  transferReason.value = '';
  transferModalOpen.value = true;
}

async function submitTransfer() {
  if (!instance.value || !batch.value || !currentPendingTask.value) return;
  if (!currentPendingTask.value.assigneeUserId) {
    message.warning('当前待办没有处理人，不能转交');
    return;
  }
  if (!transferTargetUserId.value) {
    message.warning('请选择接收人');
    return;
  }
  flowActionLoading.value = true;
  try {
    const count = await transferFdmPerformanceAssessmentTasks({
      batchId: batch.value.id,
      fromUserId: Number(currentPendingTask.value.assigneeUserId),
      instanceId: instance.value.id,
      reason: transferReason.value,
      taskId: currentPendingTask.value.id,
      toUserId: transferTargetUserId.value,
    });
    transferModalOpen.value = false;
    await loadApiData();
    if (count > 0) {
      message.success('流程已转交');
    } else {
      message.warning('没有可转交的待办，可能已被处理');
    }
  } finally {
    flowActionLoading.value = false;
  }
}

function skipCurrentTask() {
  if (!instance.value || !currentPendingTask.value) {
    message.warning('当前没有可跳过的待办');
    return;
  }
  Modal.confirm({
    content: `将跳过当前节点「${currentPendingTask.value.nodeName || getTaskTypeLabel(currentPendingTask.value.taskType)}」，并自动流转到下一节点。`,
    okText: '确认跳过',
    onOk: async () => {
      flowActionLoading.value = true;
      try {
        await skipFdmPerformanceAssessmentTask({
          instanceId: instance.value!.id,
          reason: '流程管理员跳过当前节点',
          taskId: currentPendingTask.value!.id,
        });
        await loadApiData();
        message.success('当前节点已跳过');
      } finally {
        flowActionLoading.value = false;
      }
    },
    title: '跳过当前流程节点',
  });
}

function isJumpableFlowStage(stage: FlowStage) {
  return (
    canManageFlow.value && FLOW_JUMPABLE_NODE_KEYS.has(String(stage.id || ''))
  );
}

function getFlowStageTaskType(stage: FlowStage) {
  const taskTypeMap: Record<string, number> = {
    Performance_Hr_Approve: 4,
    Performance_Indicator_Confirm: 1,
    Performance_Manager_Score: 3,
    Performance_Self_Score: 2,
  };
  return taskTypeMap[String(stage.id || '')];
}

function jumpToFlowStage(stage: FlowStage, index: number) {
  if (!instance.value || !isJumpableFlowStage(stage)) return;
  if (index === currentFlowIndex.value) {
    message.info('当前已经在该流程节点');
    return;
  }
  Modal.confirm({
    content: `将流程跳转到「${stage.name}」。目标节点及之后已有评分和结果会失效，需要重新处理。`,
    okText: '确认跳转',
    onOk: async () => {
      flowActionLoading.value = true;
      try {
        await jumpFdmPerformanceAssessmentTask({
          instanceId: instance.value!.id,
          reason: `流程管理员跳转至${stage.name}`,
          targetNodeKey: stage.id,
          targetNodeName: stage.name,
          targetTaskType: getFlowStageTaskType(stage),
        });
        await loadApiData();
        message.success('流程已跳转');
      } finally {
        flowActionLoading.value = false;
      }
    },
    title: `跳转到${stage.name}`,
  });
}

async function submitScore() {
  if (!instance.value || !canScore.value) return;
  const missingComment = templateIndicators.value.find(
    (indicator) =>
      isScoreCommentRequired(indicator) && !scoreComments[indicator.id]?.trim(),
  );
  if (missingComment) {
    message.warning(`请填写「${missingComment.name}」的评分说明`);
    return;
  }
  submittingScore.value = true;
  try {
    const request = isMyMode.value
      ? submitMyFdmPerformanceAssessmentScore
      : submitFdmPerformanceAssessmentScore;
    await request({
      comment: nodeComment.value,
      instanceId: instance.value.id,
      items: buildApiScoreItems(
        templateIndicators.value,
        { ...scoreInputs },
        { ...scoreComments },
        { ...scoreAttachments },
      ),
      scorerRoleType: activeScoreType.value === 'self' ? 1 : 2,
      taskId: activeScoreTask.value?.id,
    });
    await loadApiData();
    message.success('评分已提交');
  } finally {
    submittingScore.value = false;
  }
}

async function approveReview() {
  if (!instance.value) return;
  await submitFdmPerformanceAssessmentHrReview({
    comment: reviewRemark.value,
    instanceId: instance.value.id,
  });
  await loadApiData();
  message.success('审核已通过');
}

async function publish() {
  if (!batch.value || !instance.value) return;
  await publishFdmPerformanceAssessmentResult(batch.value.id, [
    instance.value.id,
  ]);
  await loadApiData();
  message.success('结果已公示');
}

async function confirmResult() {
  if (!instance.value) return;
  const request = isMyMode.value
    ? confirmMyFdmPerformanceAssessmentResult
    : confirmFdmPerformanceAssessmentResult;
  await request(instance.value.id);
  await loadApiData();
  message.success('结果已确认');
}

async function submitGradeReviewConfirm() {
  if (!pendingGradeReviewTask.value) return;
  if (!validateGradeReviewForm()) return;
  gradeReviewSubmitting.value = true;
  try {
    await confirmFdmPerformanceAssessmentGradeReview({
      comment: buildGradeReviewCommentSummary(),
      reviewFormJson: JSON.stringify({ ...gradeReviewForm }),
      taskId: pendingGradeReviewTask.value.id,
    });
    resetGradeReviewForm();
    await loadApiData();
    message.success('绩效复盘已确认');
  } finally {
    gradeReviewSubmitting.value = false;
  }
}

async function saveInterviewRecord() {
  if (!instance.value) return;
  await recordFdmPerformanceAssessmentInterview({
    conclusion: interviewConclusion.value,
    instanceId: instance.value.id,
  });
  await loadApiData();
  interviewModalOpen.value = false;
  message.success('面谈记录已保存');
}

async function handleIndicatorUpload(indicatorId: number, options: any) {
  try {
    const result = (await uploadFile({
      directory: 'fdmperformance/score',
      file: options.file as File,
    })) as { id?: number; path?: string; url?: string };
    const value = String(result.id || result.url || result.path || '');
    if (value) {
      scoreAttachments[indicatorId] = [scoreAttachments[indicatorId], value]
        .filter(Boolean)
        .join(',');
    }
    options.onSuccess?.(result, options.file);
    message.success('附件已上传');
  } catch (error) {
    options.onError?.(error);
    message.error('附件上传失败');
  }
}

async function loadApiData() {
  const batchId = Number(route.params.batchId);
  const instanceId = Number(route.params.instanceId);
  if (!batchId || !instanceId) return;
  apiLoading.value = true;
  try {
    const instanceRequest = isMyMode.value
      ? getMyFdmPerformanceAssessmentInstance
      : getFdmPerformanceAssessmentInstance;
    const [batchResp, instanceResp, taskPage] = await Promise.all([
      getFdmPerformanceAssessmentBatch(batchId),
      instanceRequest(instanceId),
      getFdmPerformanceAssessmentTaskPage({
        instanceId,
        pageNo: 1,
        pageSize: -1,
      }),
    ]);
    apiTasks.value = taskPage.list || [];
    apiBatch.value = mapApiBatch(batchResp);
    apiInstance.value = mapApiInstance(instanceResp);
    apiEmployee.value = {
      dept: instanceResp.deptName || '-',
      id: Number(instanceResp.userId || 0),
      name: instanceResp.userName || `用户${instanceResp.userId}`,
      post: instanceResp.postName || '-',
    };
    const templateId = Number(
      instanceResp.templateId || batchResp.templateIds?.[0] || 0,
    );
    if (templateId) {
      const templateResp = await getFdmPerformanceTemplate(templateId);
      apiTemplate.value = mapApiTemplate(templateResp);
      apiTemplateIndicators.value = mapApiTemplateIndicators(templateResp);
      apiBatch.value.templateId = templateId;
    }
    initScoreDraft();
    void ensureSimpleUsers().catch(() => undefined);
  } finally {
    apiLoading.value = false;
  }
}

onMounted(loadApiData);
watch(
  () => [route.params.batchId, route.params.instanceId, route.query.source],
  loadApiData,
);
watch([activeScoreType, templateIndicators, instance], initScoreDraft);
watch([employee, currentUserId, simpleUsers], fillGradeReviewDefaults, {
  immediate: true,
});
</script>

<template>
  <PerformanceShell
    :description="
      batch && template
        ? `${batch.name} · ${template.name}`
        : '单人绩效考核工作台'
    "
    :title="employee ? `${employee.name}的绩效考核` : '考核详情'"
  >
    <template #actions>
      <Button @click="goBack">
        {{ isMyMode ? '返回我的绩效' : '返回批次' }}
      </Button>
      <Button
        v-if="instance?.status === 'indicatorConfirm'"
        @click="confirmIndicators"
      >
        确认指标
      </Button>
      <Button
        v-if="canScore"
        :loading="submittingScore"
        type="primary"
        @click="submitScore"
      >
        {{ scoreActionLabel }}
      </Button>
      <Button
        v-if="instance?.status === 'hrReview'"
        type="primary"
        @click="approveReview"
      >
        人事审核通过
      </Button>
      <Button
        v-if="instance?.status === 'pendingPublish'"
        type="primary"
        @click="publish"
      >
        公示结果
      </Button>
      <Button
        v-if="
          instance?.resultVisible &&
          !instance?.resultConfirmed &&
          !instance?.resultObjection
        "
        type="primary"
        @click="confirmResult"
      >
        确认结果
      </Button>
      <Button
        v-if="canConfirmGradeReview"
        :loading="gradeReviewSubmitting"
        type="primary"
        @click="submitGradeReviewConfirm"
      >
        确认绩效复盘
      </Button>
      <Dropdown
        v-if="canShowAdminMoreMenu"
        :trigger="['click']"
        placement="bottomRight"
      >
        <Button>...</Button>
        <template #overlay>
          <Menu>
            <Menu.Item key="rules" @click="openTemplateEditor('basic')">
              考核规则
            </Menu.Item>
            <Menu.Item key="flow" @click="scrollToFlowActions">
              调整流程
            </Menu.Item>
            <Menu.Item
              key="reset"
              :disabled="!canManageFlow"
              @click="resetFlowToIndicatorConfirm"
            >
              重置流程
            </Menu.Item>
            <Menu.Item
              key="indicators"
              @click="openTemplateEditor('indicators')"
            >
              调整指标
            </Menu.Item>
            <Menu.Item key="records" @click="scrollToProcessRecords">
              记录
            </Menu.Item>
          </Menu>
        </template>
      </Dropdown>
    </template>

    <template v-if="batch && instance && employee">
      <div class="summary-grid">
        <Card>
          <div class="metric-card">
            <span>被考核人</span><strong>{{ employee.name }}</strong>
          </div>
        </Card>
        <Card>
          <div class="metric-card">
            <span>部门/岗位</span><strong>{{ employee.dept }} / {{ employee.post }}</strong>
          </div>
        </Card>
        <Card>
          <div class="metric-card">
            <span>考核结果</span><strong>{{ instance.finalScore ?? '-' }}</strong>
          </div>
        </Card>
        <Card>
          <div class="metric-card">
            <span>绩效等级</span><strong>{{ instance.grade ?? '-' }}</strong>
          </div>
        </Card>
      </div>

      <Card ref="flowCardRef" :loading="apiLoading" class="flow-card">
        <div class="instance-head">
          <Space>
            <Tag :color="getInstanceMeta(instance.status).color">
              {{ getInstanceMeta(instance.status).label }}
            </Tag>
            <span>{{ instance.nodeName }}</span>
            <span>{{ instance.currentExecutor || '暂无待处理人' }}</span>
          </Space>
          <Progress :percent="scorePercent" />
        </div>
        <div v-if="canManageFlow" class="flow-toolbar">
          <span>
            当前待办：{{
              currentPendingTask?.nodeName ||
              getTaskTypeLabel(currentPendingTask?.taskType)
            }}
          </span>
          <Space>
            <Button :loading="flowActionLoading" @click="openTransferModal">
              流程转交
            </Button>
            <Button
              danger
              :loading="flowActionLoading"
              @click="skipCurrentTask"
            >
              跳过节点
            </Button>
          </Space>
        </div>
        <div class="flow-node-list">
          <template
            v-for="(stage, index) in flowStages"
            :key="stage.id || index"
          >
            <div
              class="flow-node-card"
              :class="[
                `flow-node-card--${getFlowStageStatus(index)}`,
                { 'flow-node-card--clickable': isJumpableFlowStage(stage) },
              ]"
              @click="jumpToFlowStage(stage, index)"
            >
              <span class="flow-node-dot">{{ index + 1 }}</span>
              <strong>{{ stage.name }}</strong>
              <em>{{ getFlowStageOwner(stage, index) }}</em>
            </div>
            <span v-if="index < flowStages.length - 1" class="flow-node-arrow">›</span>
          </template>
        </div>
      </Card>

      <div v-if="scoreSummaryCards.length" class="score-summary-grid">
        <Card
          v-for="card in scoreSummaryCards"
          :key="`${card.cardType || 'node'}-${card.taskId || card.nodeKey || card.nodeName}`"
          :class="{ 'final-score-card': card.cardType === 'final' }"
        >
          <div class="score-summary-card">
            <span>{{ card.nodeName || '评分节点' }}</span>
            <strong>{{ card.totalScore ?? '-' }}</strong>
            <em v-if="card.scoreWeight">节点权重 {{ card.scoreWeight }}%</em>
            <em v-else-if="card.comment">{{ card.comment }}</em>
          </div>
        </Card>
      </div>

      <Card
        v-if="instance.reviewRequired"
        class="grade-review-card"
        title="绩效复盘"
      >
        <div class="grade-review-grid">
          <div>
            <span>当前等级</span>
            <strong>{{ instance.grade || '-' }}</strong>
          </div>
          <div>
            <span>复盘状态</span>
            <Tag :color="getGradeReviewStatusColor()">
              {{ getGradeReviewStatusText() }}
            </Tag>
          </div>
          <div>
            <span>截止时间</span>
            <strong>{{ instance.reviewDeadline || '-' }}</strong>
          </div>
          <div>
            <span>员工确认</span>
            <strong>
              {{ getUserDisplayName(instance.reviewEmployeeUserId) }}
              · {{ getConfirmTimeText(instance.reviewEmployeeConfirmTime) }}
            </strong>
          </div>
          <div>
            <span>主管确认</span>
            <strong>
              {{ getUserDisplayName(instance.reviewSupervisorUserId) }}
              · {{ getConfirmTimeText(instance.reviewSupervisorConfirmTime) }}
            </strong>
          </div>
          <div>
            <span>抄送人员</span>
            <strong>{{
              getReviewCcUserNames(instance.reviewCcUserIds)
            }}</strong>
          </div>
        </div>
        <div class="grade-review-reason">
          <span>复盘原因</span>
          <p>{{ instance.reviewReason || '-' }}</p>
        </div>
        <div v-if="gradeReviewRecords.length" class="grade-review-records">
          <div
            v-for="record in gradeReviewRecords"
            :key="record.task.id"
            class="grade-review-record"
          >
            <div class="grade-review-record-head">
              <strong>{{ record.title }}</strong>
              <span>
                {{ getUserDisplayName(record.task.assigneeUserId) }}
                · {{ getConfirmTimeText(record.task.finishTime) }}
              </span>
            </div>
            <div v-if="record.form" class="grade-review-readonly">
              <div>
                <span>被访谈人</span><strong>{{ record.form.interviewee || '-' }}</strong>
              </div>
              <div>
                <span>入职时间</span><strong>{{ record.form.entryDate || '-' }}</strong>
              </div>
              <div>
                <span>岗位</span><strong>{{ record.form.position || '-' }}</strong>
              </div>
              <div>
                <span>访谈人</span><strong>{{ record.form.interviewer || '-' }}</strong>
              </div>
              <div class="grade-review-readonly-block">
                <span>一、你觉得你的本月工作完成情况如何</span>
                <p>{{ record.form.workCompletion || '-' }}</p>
              </div>
              <div class="grade-review-readonly-block">
                <span>二、你觉得主要原因是什么（原因分析：客观 + 主观）</span>
                <p>{{ record.form.reasonAnalysis || '-' }}</p>
              </div>
              <div class="grade-review-readonly-block">
                <span>三、本月绩效评级为C，主要未达标指标有哪些（告诉被访谈人）</span>
                <p>{{ record.form.missedIndicators || '-' }}</p>
              </div>
              <div class="grade-review-readonly-block">
                <span>四、下个月，你觉得怎么做才能不得C（改进方向与目标）</span>
                <p>{{ record.form.improvementTarget || '-' }}</p>
              </div>
              <div class="grade-review-readonly-block">
                <span>五、你需要获得怎样的帮助（辅导措施）</span>
                <p>{{ record.form.supportNeeded || '-' }}</p>
              </div>
            </div>
            <p v-else class="grade-review-legacy-comment">
              {{ record.rawComment }}
            </p>
          </div>
        </div>
        <div v-if="canConfirmGradeReview" class="grade-review-confirm">
          <div class="grade-review-form-title">C级绩效面谈表</div>
          <div class="grade-review-form-meta">
            <label>
              <span><span class="required-marker">*</span>被访谈人</span>
              <Input v-model:value="gradeReviewForm.interviewee" />
            </label>
            <label>
              <span><span class="required-marker">*</span>入职时间</span>
              <Input
                v-model:value="gradeReviewForm.entryDate"
                placeholder="请填写入职时间"
              />
            </label>
            <label>
              <span><span class="required-marker">*</span>岗位</span>
              <Input v-model:value="gradeReviewForm.position" />
            </label>
            <label>
              <span><span class="required-marker">*</span>访谈人</span>
              <Input v-model:value="gradeReviewForm.interviewer" />
            </label>
          </div>
          <label class="grade-review-form-item">
            <span>
              <span class="required-marker">*</span>
              一、你觉得你的本月工作完成情况如何
            </span>
            <Input.TextArea
              v-model:value="gradeReviewForm.workCompletion"
              :rows="3"
            />
          </label>
          <label class="grade-review-form-item">
            <span>
              <span class="required-marker">*</span>
              二、你觉得主要原因是什么（原因分析：客观 + 主观）
            </span>
            <Input.TextArea
              v-model:value="gradeReviewForm.reasonAnalysis"
              :rows="3"
            />
          </label>
          <label class="grade-review-form-item">
            <span>
              <span class="required-marker">*</span>
              三、本月绩效评级为C，主要未达标指标有哪些（告诉被访谈人）
            </span>
            <Input.TextArea
              v-model:value="gradeReviewForm.missedIndicators"
              :rows="3"
            />
          </label>
          <label class="grade-review-form-item">
            <span>
              <span class="required-marker">*</span>
              四、下个月，你觉得怎么做才能不得C（改进方向与目标）
            </span>
            <Input.TextArea
              v-model:value="gradeReviewForm.improvementTarget"
              :rows="3"
            />
          </label>
          <label class="grade-review-form-item">
            <span>
              <span class="required-marker">*</span>
              五、你需要获得怎样的帮助（辅导措施）
            </span>
            <Input.TextArea
              v-model:value="gradeReviewForm.supportNeeded"
              :rows="3"
            />
          </label>
          <Button
            class="grade-review-submit"
            :loading="gradeReviewSubmitting"
            type="primary"
            @click="submitGradeReviewConfirm"
          >
            确认绩效复盘
          </Button>
        </div>
        <div v-else-if="pendingGradeReviewTask" class="grade-review-pending">
          当前待确认人：{{
            getUserDisplayName(pendingGradeReviewTask.assigneeUserId)
          }}
        </div>
      </Card>

      <Card v-if="scoreEditorVisible" class="node-score-card">
        <div class="node-score-head">
          <div>
            <strong>{{ scoreActionLabel }}</strong>
            <span>当前输入值按贡献分计算，输入 35 即贡献 35 分。</span>
          </div>
          <div>
            <span>当前节点总分</span>
            <strong>{{ currentNodeTotal }}</strong>
          </div>
        </div>
        <div v-if="scoreEditorReadonlyText" class="score-editor-warning">
          {{ scoreEditorReadonlyText }}
        </div>
        <Input.TextArea
          v-model:value="nodeComment"
          :disabled="!canScore"
          :rows="3"
          placeholder="请输入本次评分总评"
        />
      </Card>

      <Card
        v-for="group in dimensionGroups"
        :key="`${group.dimensionId || group.name}`"
        class="dimension-card"
      >
        <template #title>
          <Space>
            <span>{{ getDimensionTitle(group) }}</span>
            <Tag>
              {{
                group.dimensionType === 3
                  ? '加分项'
                  : group.dimensionType === 4
                    ? '扣分项'
                    : '量化指标 100%'
              }}
            </Tag>
          </Space>
        </template>
        <Table
          :columns="scoreColumns"
          :data-source="group.indicators"
          :loading="apiLoading"
          :pagination="false"
          :scroll="{ x: scoreTableScrollX }"
          row-key="id"
          size="small"
        >
          <template #bodyCell="{ column, record }">
            <template v-if="column.dataIndex === 'standard'">
              <div class="multi-line">{{ record.standard || '-' }}</div>
            </template>
            <template v-else-if="column.dataIndex === 'weight'">
              <strong>{{ record.weight || '-'
                }}{{ record.weight ? '%' : '' }}</strong>
            </template>
            <template v-else-if="column.dataIndex === 'remark'">
              {{ record.tags?.join(' / ') || '-' }}
            </template>
            <template v-else-if="column.dataIndex === 'attachment'">
              <Space direction="vertical" size="small">
                <span>{{
                    getAttachmentCount(
                      scoreAttachments[record.id] ||
                        instance.indicatorScores?.[record.id]?.attachmentIds,
                    )
                  }}
                  个附件</span>
                <Upload
                  v-if="canScore"
                  :custom-request="
                    (options) => handleIndicatorUpload(record.id, options)
                  "
                  :show-upload-list="false"
                >
                  <Button size="small">上传附件</Button>
                </Upload>
              </Space>
            </template>
            <template
              v-else-if="isSummaryScoreColumn(String(column.dataIndex))"
            >
              <strong>{{
                getSummaryScore(record, String(column.dataIndex))
              }}</strong>
            </template>
            <template
              v-else-if="isSummaryCommentColumn(String(column.dataIndex))"
            >
              <div class="summary-comment-cell">
                {{ getSummaryComment(record, String(column.dataIndex)) || '-' }}
              </div>
            </template>
            <template v-else-if="column.dataIndex === 'currentScore'">
              <InputNumber
                v-if="scoreEditorVisible"
                v-model:value="scoreInputs[record.id]"
                :disabled="!canScore"
                :max="120"
                :min="0"
                :precision="2"
                addon-after="分"
              />
              <span v-else>
                {{
                  instance.indicatorScores?.[record.id]?.final ??
                  instance.indicatorScores?.[record.id]?.supervisor ??
                  instance.indicatorScores?.[record.id]?.self ??
                  '-'
                }}
              </span>
            </template>
            <template v-else-if="column.dataIndex === 'scoreComment'">
              <div v-if="scoreEditorVisible" class="required-field-cell">
                <span
                  v-if="isScoreCommentRequired(record)"
                  class="required-marker"
                  >*</span>
                <Input.TextArea
                  v-model:value="scoreComments[record.id]"
                  :disabled="!canScore"
                  :placeholder="
                    isScoreCommentRequired(record)
                      ? '请输入评分说明(必填)'
                      : '请输入评分说明(选填)'
                  "
                  :rows="3"
                />
              </div>
              <span v-else>{{
                instance.indicatorScores?.[record.id]?.scoreComment || '-'
              }}</span>
            </template>
          </template>
        </Table>
      </Card>

      <Card ref="processRecordRef" title="过程记录">
        <div class="record-list">
          <div>
            <strong>指标确认</strong>
            <span>{{
              instance.progress >= 2 ? '被考核人已收到指标确认任务' : '未开始'
            }}</span>
          </div>
          <div>
            <strong>自评</strong>
            <span>{{
              instance.selfScore !== undefined
                ? `${instance.selfScore} 分`
                : '待被考核人提交'
            }}</span>
          </div>
          <div>
            <strong>主管评分</strong>
            <span>{{
              instance.supervisorScore !== undefined
                ? `${instance.supervisorScore} 分`
                : '待直接主管评分'
            }}</span>
          </div>
          <div>
            <strong>人事审核</strong>
            <Input.TextArea
              v-model:value="reviewRemark"
              :rows="3"
              placeholder="填写审核备注"
            />
          </div>
          <div>
            <strong>面谈记录</strong>
            <Space direction="vertical">
              <span>{{
                instance.interviewRecords?.length
                  ? `${instance.interviewRecords.length} 条记录`
                  : '暂未记录面谈'
              }}</span>
              <Button size="small" @click="interviewModalOpen = true">
                记录面谈
              </Button>
            </Space>
          </div>
          <div v-if="instance.resultObjection">
            <strong>结果异议</strong>
            <span>{{ instance.resultObjection }}</span>
          </div>
        </div>
      </Card>
    </template>
    <Empty v-else description="未找到该考核记录" />

    <Modal
      v-model:open="transferModalOpen"
      :confirm-loading="flowActionLoading"
      title="流程转交"
      @ok="submitTransfer"
    >
      <Space direction="vertical" class="modal-form">
        <div>
          <strong>当前节点</strong>
          <span>{{
            currentPendingTask?.nodeName ||
            getTaskTypeLabel(currentPendingTask?.taskType)
          }}</span>
        </div>
        <div>
          <strong>原处理人</strong>
          <span>{{
            getUserDisplayName(currentPendingTask?.assigneeUserId)
          }}</span>
        </div>
        <Select
          v-model:value="transferTargetUserId"
          :options="transferUserOptions"
          allow-clear
          option-filter-prop="label"
          placeholder="请选择接收人"
          show-search
        />
        <Input.TextArea
          v-model:value="transferReason"
          :rows="3"
          placeholder="请输入转交原因（选填）"
        />
      </Space>
    </Modal>

    <Modal
      v-model:open="interviewModalOpen"
      title="记录面谈"
      @ok="saveInterviewRecord"
    >
      <Input.TextArea v-model:value="interviewConclusion" :rows="4" />
    </Modal>
  </PerformanceShell>
</template>

<style scoped>
.summary-grid,
.score-summary-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 14px;
}

.metric-card,
.score-summary-card {
  display: grid;
  gap: 6px;
}

.metric-card span,
.score-summary-card span,
.node-score-head span,
.record-list span {
  color: #64748b;
}

.metric-card strong {
  font-size: 22px;
  font-weight: 650;
  color: #111827;
}

.score-summary-card strong {
  font-size: 28px;
  font-weight: 700;
  color: #111827;
}

.score-summary-card em {
  font-style: normal;
  color: #64748b;
}

.final-score-card {
  background: linear-gradient(135deg, #1677ff, #3b82f6);
}

.final-score-card span,
.final-score-card strong,
.final-score-card em {
  color: #fff;
}

.flow-card {
  overflow: hidden;
}

.instance-head,
.node-score-head {
  display: grid;
  grid-template-columns: minmax(280px, 1fr) minmax(240px, 420px);
  gap: 24px;
  align-items: center;
  margin-bottom: 22px;
}

.flow-toolbar {
  display: flex;
  gap: 16px;
  align-items: center;
  justify-content: space-between;
  padding: 12px 14px;
  margin-bottom: 18px;
  background: #f8fafc;
  border: 1px solid #eef2f7;
  border-radius: 8px;
}

.flow-toolbar > span {
  font-weight: 500;
  color: #475569;
}

.flow-node-list {
  display: flex;
  gap: 14px;
  align-items: center;
  padding-bottom: 4px;
  overflow-x: auto;
}

.flow-node-card {
  display: grid;
  grid-template-columns: 28px minmax(120px, 1fr);
  gap: 2px 10px;
  align-items: center;
  min-width: 170px;
  padding: 12px;
  background: #fff;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
}

.flow-node-card strong {
  font-weight: 650;
  color: #111827;
}

.flow-node-card em {
  grid-column: 2;
  font-style: normal;
  color: #64748b;
}

.flow-node-card--active {
  background: #eff6ff;
  border-color: #1677ff;
}

.flow-node-card--clickable {
  cursor: pointer;
}

.flow-node-card--clickable:hover {
  background: #f8fbff;
  border-color: #4096ff;
}

.flow-node-card--done .flow-node-dot {
  color: #fff;
  background: #52c41a;
}

.flow-node-card--active .flow-node-dot {
  color: #fff;
  background: #1677ff;
}

.flow-node-dot {
  display: inline-grid;
  place-items: center;
  width: 24px;
  height: 24px;
  color: #64748b;
  background: #f1f5f9;
  border-radius: 999px;
}

.flow-node-arrow {
  font-size: 26px;
  color: #cbd5e1;
}

.modal-form {
  width: 100%;
}

.modal-form > div {
  display: grid;
  grid-template-columns: 88px minmax(0, 1fr);
  gap: 12px;
}

.node-score-card,
.dimension-card {
  overflow: hidden;
}

.node-score-head > div {
  display: grid;
  gap: 4px;
}

.node-score-head > div:last-child {
  justify-items: end;
}

.node-score-head strong {
  font-size: 20px;
  color: #111827;
}

.score-editor-warning {
  padding: 10px 12px;
  margin-bottom: 12px;
  color: #ad6800;
  background: #fff7e6;
  border: 1px solid #ffd591;
  border-radius: 6px;
}

.required-column-title {
  display: inline-flex;
  gap: 2px;
  align-items: center;
}

.required-field-cell {
  display: flex;
  gap: 4px;
  align-items: flex-start;
}

.required-marker {
  font-weight: 600;
  line-height: 1;
  color: #ff4d4f;
}

.required-field-cell .required-marker {
  padding-top: 6px;
}

.summary-comment-cell {
  color: #64748b;
  white-space: pre-wrap;
}

.multi-line {
  max-width: 520px;
  white-space: pre-wrap;
}

.record-list {
  display: grid;
  gap: 16px;
}

.record-list > div {
  display: grid;
  grid-template-columns: 140px minmax(0, 1fr);
  gap: 16px;
  align-items: start;
  padding-bottom: 14px;
  border-bottom: 1px solid #f1f5f9;
}

.grade-review-card {
  border-color: #ffd591;
}

.grade-review-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 14px;
}

.grade-review-grid > div,
.grade-review-reason {
  display: grid;
  gap: 6px;
}

.grade-review-grid span,
.grade-review-reason span,
.grade-review-pending {
  color: #64748b;
}

.grade-review-grid strong {
  font-weight: 650;
  color: #111827;
}

.grade-review-reason {
  padding-top: 14px;
  margin-top: 14px;
  border-top: 1px solid #f1f5f9;
}

.grade-review-reason p {
  margin: 0;
  color: #111827;
  white-space: pre-wrap;
}

.grade-review-confirm {
  display: grid;
  gap: 12px;
  padding: 16px;
  margin-top: 14px;
  background: #fffdf7;
  border: 1px solid #ffe7ba;
  border-radius: 8px;
}

.grade-review-form-title,
.grade-review-record-head strong {
  font-weight: 650;
  color: #111827;
}

.grade-review-form-meta {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 12px;
}

.grade-review-form-meta label,
.grade-review-form-item {
  display: grid;
  gap: 6px;
  color: #334155;
}

.grade-review-form-item {
  line-height: 1.5;
}

.grade-review-submit {
  justify-self: end;
}

.grade-review-records {
  display: grid;
  gap: 12px;
  margin-top: 14px;
}

.grade-review-record {
  padding: 14px;
  background: #f8fafc;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
}

.grade-review-record-head {
  display: flex;
  gap: 12px;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 12px;
}

.grade-review-record-head span,
.grade-review-readonly span,
.grade-review-legacy-comment {
  color: #64748b;
}

.grade-review-readonly {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 12px;
}

.grade-review-readonly > div {
  display: grid;
  gap: 4px;
}

.grade-review-readonly strong,
.grade-review-readonly p {
  color: #111827;
}

.grade-review-readonly-block {
  grid-column: 1 / -1;
}

.grade-review-readonly p,
.grade-review-legacy-comment {
  margin: 0;
  white-space: pre-wrap;
}

.grade-review-pending {
  margin-top: 14px;
}

@media (max-width: 960px) {
  .summary-grid,
  .score-summary-grid,
  .grade-review-grid,
  .grade-review-confirm,
  .grade-review-form-meta,
  .grade-review-readonly,
  .instance-head,
  .flow-toolbar,
  .node-score-head,
  .record-list > div {
    grid-template-columns: 1fr;
  }

  .flow-toolbar {
    flex-direction: column;
    align-items: stretch;
  }

  .node-score-head > div:last-child {
    justify-items: start;
  }
}
</style>
