<script lang="ts" setup>
import type { TableColumnsType } from 'ant-design-vue';

import type { JixiaoApi } from '#/api/fdmperformance';
import type { SystemUserApi } from '#/api/system/user';

import {
  computed,
  onBeforeUnmount,
  onMounted,
  reactive,
  ref,
  watch,
} from 'vue';
import { onBeforeRouteLeave, onBeforeRouteUpdate, useRoute } from 'vue-router';

import { Undo2 } from '@vben/icons';
import { useMediaQuery } from '@vueuse/core';

import {
  Alert,
  Button,
  Descriptions,
  message,
  Modal,
  Select,
  Space,
  Steps,
  Table,
  Tag,
  Textarea,
} from 'ant-design-vue';

import {
  completeIndicatorAction,
  confirmEmployeeResult,
  confirmIndicatorTask,
  getInstance,
  getReturnableTaskNodes,
  getScoreDraft,
  returnTask,
  saveScoreDraft,
  submitHrReview,
  submitManagerScore,
  submitSelfScore,
  submitSupervisorScore,
  transferTask,
} from '#/api/fdmperformance';
import { getSimpleUserList } from '#/api/system/user';

import { INSTANCE_STATUS_MAP } from '../../shared/constants';
import { formatPerformanceDateTime } from '../../shared/format';
import PerformanceShell from '../../shared/PerformanceShell.vue';
import { hasAction } from '../../shared/workspace';
import {
  activeScoreStage,
  applyScoreDraft,
  scoreDraftPayload,
  scoreRowsFromInstance,
  type ScoreRow,
} from './score-model';
import ScoreFields from './ScoreFields.vue';
import SelfScoreAttachmentPanel from './SelfScoreAttachmentPanel.vue';

defineOptions({ name: 'FdmPerformanceInstanceDetail' });

const props = defineProps<{
  id?: number | string;
}>();
const route = useRoute();
const isNarrow = useMediaQuery('(max-width: 900px)');
const loading = ref(false);
const submitting = ref(false);
const selfScoreAttachmentHasError = ref(false);
const selfScoreAttachmentUploading = ref(false);
const transferring = ref(false);
const transferVisible = ref(false);
const returning = ref(false);
const returnNodesLoading = ref(false);
const returnVisible = ref(false);
const instance = ref<JixiaoApi.Instance>();
const users = ref<SystemUserApi.User[]>([]);
const returnableNodes = ref<JixiaoApi.TaskReturnNode[]>([]);
const transferForm = reactive({
  assigneeUserId: undefined as number | undefined,
  reason: '',
});
const returnForm = reactive({
  reason: '',
  targetTaskDefinitionKey: undefined as string | undefined,
});
const scoreRows = ref<ScoreRow[]>([]);
const scorePanel = ref<HTMLDivElement>();
const draftReason = ref('');
const savingDraft = ref(false);
const draftSaveFailed = ref(false);
const draftLoadFailed = ref(false);
const draftSavedAt = ref<JixiaoApi.DateTimeValue>();
const savedSnapshot = ref('');
const loadError = ref('');
let latestLoadId = 0;
const scoreStage = computed(() => activeScoreStage(instance.value));
const currentDraft = computed(() =>
  instance.value
    ? scoreDraftPayload(instance.value, scoreRows.value, draftReason.value)
    : undefined,
);
const draftSnapshot = computed(() =>
  JSON.stringify(currentDraft.value || null),
);
const hasUnsavedChanges = computed(
  () =>
    !!scoreStage.value &&
    savedSnapshot.value !== '' &&
    savedSnapshot.value !== draftSnapshot.value,
);
const canSaveDraft = computed(
  () =>
    !!instance.value &&
    hasAction(instance.value, 'SAVE_SCORE_DRAFT') &&
    !!scoreStage.value &&
    !draftLoadFailed.value,
);
const completedScoreCount = computed(
  () =>
    currentDraft.value?.items.filter(
      (item) =>
        item.score !== undefined &&
        Number.isFinite(item.score) &&
        item.score >= 0 &&
        item.score <= SCORE_MAX,
    ).length || 0,
);
const scoreResultLabel = computed(() =>
  instance.value?.result?.publicStatus === 1 || instance.value?.publicTime
    ? '已公布综合分'
    : instance.value?.currentTaskKey === 'JIXIAO_EMPLOYEE_CONFIRM'
      ? '待确认综合分'
      : '综合分（待审核 / 待公布）',
);

type ProcessStepStatus = 'error' | 'finish' | 'process' | 'wait';

const SCORE_MAX = 100;
const managerScoreEnabled = computed(
  () => instance.value?.managerScoreEnabled === true,
);
const scoreSummary = computed(() => {
  const sum = (
    field: keyof Pick<
      ScoreRow,
      'managerScore' | 'selfScore' | 'supervisorScore'
    >,
  ) => {
    const values = scoreRows.value
      .map((row) => row[field])
      .filter(
        (score): score is number => score !== undefined && score !== null,
      );
    if (values.length === 0) return undefined;
    return Number(values.reduce((total, score) => total + score, 0).toFixed(2));
  };

  return {
    manager: sum('managerScore'),
    self: sum('selfScore'),
    supervisor: sum('supervisorScore'),
  };
});
const managerRelationInvalid = computed(() => {
  const detail = instance.value;
  const managerUserId = detail?.superiorSupervisorUserId;
  return (
    managerUserId !== undefined &&
    managerUserId !== null &&
    (managerUserId === detail?.userId ||
      managerUserId === detail?.supervisorUserId)
  );
});
const managerRelationWarning = computed(() => {
  const detail = instance.value;
  if (!detail || !managerRelationInvalid.value) return '';
  const repeatedRole =
    detail.superiorSupervisorUserId === detail.userId
      ? '被考核人本人'
      : '直属主管';
  return `主管上级“${detail.superiorSupervisorUserName || '-'}”与${repeatedRole}重复。为防止同一人重复或给自己评分，本实例不会进入上级评分节点；请修正考评表人员关系后重新发起考核。`;
});
const indicatorColumns = computed<TableColumnsType>(() => {
  const columns: TableColumnsType = [
    { dataIndex: 'name', title: '指标与标准', width: 260 },
    { dataIndex: 'weight', title: '权重 / 基准分', width: 110 },
    {
      dataIndex: 'scores',
      title: '各阶段评分与说明',
      width: managerScoreEnabled.value ? 520 : 360,
    },
    { dataIndex: 'actionPlan', title: '行动计划', width: 130 },
  ];
  return columns;
});

const actionPlanIndicators = computed(() =>
  (instance.value?.indicators || []).filter((item) => item.actionPlanEnabled),
);
const pendingActionPlanIndicators = computed(() =>
  actionPlanIndicators.value.filter((item) => item.actionPlanStatus !== 1),
);
const canScore = computed(() => !!scoreStage.value);
const canApproveCurrent = computed(() => {
  const detail = instance.value;
  if (!detail?.currentTaskId || detail.status !== 1) return false;
  return (['INDICATOR_CONFIRM', 'EMPLOYEE_CONFIRM', 'HR_REVIEW'] as const).some(
    (action) =>
      detail.currentTaskKey === `JIXIAO_${action}` && hasAction(detail, action),
  );
});
const canEditSelfScore = computed(
  () => scoreStage.value?.action === 'SELF_SCORE',
);
const canEditSupervisorScore = computed(
  () => scoreStage.value?.action === 'SUPERVISOR_SCORE',
);
const canEditManagerScore = computed(
  () => scoreStage.value?.action === 'MANAGER_SCORE',
);
const canTransfer = computed(
  () =>
    !!instance.value &&
    hasAction(instance.value, 'TRANSFER') &&
    instance.value?.status === 1 &&
    !!instance.value?.currentTaskId,
);
const userOptions = computed(() =>
  users.value.map((user) => ({
    label: `${user.nickname || user.username} (${user.username || user.id})`,
    value: user.id!,
  })),
);
const returnNodeOptions = computed(() =>
  returnableNodes.value.map((node) => ({
    label: node.name,
    value: node.taskDefinitionKey,
  })),
);

const processSteps = computed(() => {
  const detail = instance.value;
  const steps = [
    {
      description: detail?.userName || '被考核人',
      key: 'JIXIAO_INDICATOR_CONFIRM',
      title: '指标确认',
    },
    {
      description: detail?.userName || '被考核人',
      key: 'JIXIAO_SELF_SCORE',
      title: '员工自评',
    },
    {
      description: detail?.supervisorUserName || '直接主管',
      key: 'JIXIAO_SUPERVISOR_SCORE',
      title: '主管评分',
    },
  ];
  if (managerScoreEnabled.value) {
    steps.push({
      description: detail?.superiorSupervisorUserName || '主管上级',
      key: 'JIXIAO_MANAGER_SCORE',
      title: '上级评分',
    });
  }
  steps.push(
    {
      description: detail?.userName || '被考核人',
      key: 'JIXIAO_EMPLOYEE_CONFIRM',
      title: '员工确认',
    },
    {
      description: '人事',
      key: 'JIXIAO_HR_REVIEW',
      title: '人事审核',
    },
    {
      description: detail?.publicTime ? '已公示' : '待人事公示',
      key: 'JIXIAO_RESULT_PUBLISH',
      title: '结果公示',
    },
  );
  return steps;
});

const currentProcessStep = computed(() => {
  const detail = instance.value;
  const taskKey = detail?.currentTaskKey || '';
  const taskIndex = processSteps.value.findIndex(
    (step) => step.key === taskKey,
  );
  if (taskIndex !== -1) {
    return taskIndex;
  }
  if (detail?.result?.publicStatus === 1 || detail?.publicTime) {
    return processSteps.value.length - 1;
  }
  if (detail?.status === 2) {
    return processSteps.value.findIndex(
      (step) => step.key === 'JIXIAO_RESULT_PUBLISH',
    );
  }
  return 0;
});

const currentProcessTitle = computed(
  () => processSteps.value[currentProcessStep.value]?.title || '-',
);
const isCompletedInstance = computed(() => instance.value?.status === 2);
const canReturn = computed(
  () =>
    !!instance.value &&
    hasAction(instance.value, 'RETURN') &&
    (isCompletedInstance.value ||
      (instance.value?.status === 1 && !!instance.value?.currentTaskId)),
);
const returnWarning = computed(() =>
  isCompletedInstance.value
    ? '回退后将撤销公示并创建修订流程，旧流程历史仍会保留；已填写的评分和说明将保留并在对应节点自动带出，最终分、等级、确认和复盘状态将重新处理，指标行动计划不受影响。'
    : '回退后，已填写的评分和说明将保留并在对应节点自动带出；流程提交状态和最终结果将按回退节点重新处理，指标行动计划不受影响。',
);

function statusMeta(status?: number): { color: string; text: string } {
  return INSTANCE_STATUS_MAP[status ?? 1] ?? { color: 'default', text: '-' };
}

function processStepStatus(index: number): ProcessStepStatus {
  const detail = instance.value;
  if (!detail) {
    return 'wait';
  }
  const current = currentProcessStep.value;
  if (detail.status === 3) {
    if (index < current) return 'finish';
    if (index === current) return 'error';
    return 'wait';
  }
  if (detail.result?.publicStatus === 1 || detail.publicTime) {
    return 'finish';
  }
  if (index < current) return 'finish';
  if (index === current) return 'process';
  return 'wait';
}

function baselineScore(record: Record<string, any> | ScoreRow) {
  const row = record as ScoreRow;
  return Number(row.indicator.weight || 0);
}

function scoreValue(row: ScoreRow, taskKey: string) {
  if (taskKey === 'JIXIAO_SELF_SCORE') return row.selfScore;
  if (taskKey === 'JIXIAO_MANAGER_SCORE') return row.managerScore;
  return row.supervisorScore;
}

function scoreComment(row: ScoreRow, taskKey: string) {
  if (taskKey === 'JIXIAO_SELF_SCORE') return row.selfComment;
  if (taskKey === 'JIXIAO_MANAGER_SCORE') return row.managerComment;
  return row.supervisorComment;
}

function focusScoreInput(indicatorId?: number) {
  if (indicatorId === undefined) return;
  scorePanel.value
    ?.querySelector<HTMLInputElement>(`#performance-score-${indicatorId}`)
    ?.focus();
}

function validateScoreRows(taskKey: string) {
  for (const row of scoreRows.value) {
    const value = scoreValue(row, taskKey);
    if (value === null || value === undefined) {
      message.warning(
        `请填写「${row.indicator.name || '指标'}」评分，0 分需明确输入`,
      );
      focusScoreInput(row.indicator.id);
      return false;
    }
    const score = Number(value);
    if (!Number.isFinite(score) || score < 0 || score > SCORE_MAX) {
      message.warning(
        `${row.indicator.name || '指标'}评分必须在 0-${SCORE_MAX} 分之间`,
      );
      focusScoreInput(row.indicator.id);
      return false;
    }
  }
  return true;
}

async function load(discardLocal = false) {
  const requestId = ++latestLoadId;
  loading.value = true;
  loadError.value = '';
  try {
    const routeInstanceId = route.params.instanceId;
    const rawInstanceId =
      props.id ??
      (Array.isArray(routeInstanceId) ? routeInstanceId[0] : routeInstanceId);
    const id = Number(rawInstanceId);
    if (!Number.isSafeInteger(id) || id <= 0) {
      message.error('考核实例 ID 无效');
      return;
    }
    const detail = await getInstance(id);
    if (requestId !== latestLoadId) return;
    const preserveLocal =
      !discardLocal &&
      hasUnsavedChanges.value &&
      detail.id === instance.value?.id &&
      detail.currentTaskId === instance.value?.currentTaskId &&
      !!activeScoreStage(detail);
    let rows = scoreRowsFromInstance(detail);
    let draft: JixiaoApi.ScoreDraft | null | undefined;
    draftLoadFailed.value = false;
    if (
      !preserveLocal &&
      activeScoreStage(detail) &&
      hasAction(detail, 'SAVE_SCORE_DRAFT')
    ) {
      try {
        draft = await getScoreDraft(detail.id!, detail.currentTaskId!);
      } catch {
        if (requestId === latestLoadId) draftLoadFailed.value = true;
      }
    }
    if (requestId !== latestLoadId) return;
    if (preserveLocal) {
      rows = rows.map((row) => ({
        ...row,
        ...scoreRows.value.find((old) => old.indicator.id === row.indicator.id),
        indicator: row.indicator,
      }));
    } else {
      const applied = applyScoreDraft(detail, rows, draft);
      draftReason.value = applied ? draft?.reason || '' : '';
      draftSavedAt.value = applied ? draft?.updateTime : undefined;
    }
    instance.value = detail;
    scoreRows.value = rows;
    if (!preserveLocal) savedSnapshot.value = draftSnapshot.value;
    await loadReturnableNodes(true);
  } catch {
    if (requestId === latestLoadId) {
      loadError.value =
        '考核详情加载失败，可能已无查看权限。请重试或返回可用入口。';
      if (!hasUnsavedChanges.value) {
        instance.value = undefined;
        scoreRows.value = [];
      }
    }
  } finally {
    if (requestId === latestLoadId) loading.value = false;
  }
}

async function loadReturnableNodes(silent = false) {
  returnableNodes.value = [];
  if (!canReturn.value || !instance.value?.id) return;
  returnNodesLoading.value = true;
  try {
    returnableNodes.value = await getReturnableTaskNodes(instance.value.id);
  } catch (error) {
    if (!silent) throw error;
  } finally {
    returnNodesLoading.value = false;
  }
}

function isReturnableStep(taskDefinitionKey: string) {
  return returnableNodes.value.some(
    (node) => node.taskDefinitionKey === taskDefinitionKey,
  );
}

async function openReturnFromStep(taskDefinitionKey: string) {
  if (!isReturnableStep(taskDefinitionKey)) return;
  await openReturn(taskDefinitionKey);
}

function canCompleteAction(indicator: JixiaoApi.InstanceIndicator) {
  return (
    indicator.actionPlanEnabled === true &&
    indicator.actionPlanStatus !== 1 &&
    [1, 2].includes(instance.value?.status ?? 0) &&
    !!instance.value &&
    hasAction(instance.value, 'COMPLETE_ACTION_PLAN')
  );
}

function completeAction(indicator: JixiaoApi.InstanceIndicator) {
  if (!indicator.id || !canCompleteAction(indicator)) return;
  Modal.confirm({
    cancelText: '取消',
    content: `确认已经完成指标“${indicator.name || '-'}”对应的行动项？`,
    okText: '确认完成',
    onOk: async () => {
      await completeIndicatorAction({ instanceIndicatorId: indicator.id! });
      message.success('行动项已完成');
      await load();
    },
    title: '完成绩效行动项',
  });
}

function taskReq() {
  if (!instance.value?.id || !instance.value.currentTaskId) {
    message.warning('当前没有可处理的 BPM 任务');
    return;
  }
  return {
    instanceId: instance.value.id,
    taskId: instance.value.currentTaskId,
  };
}

async function approveCurrent() {
  if (!canApproveCurrent.value || submitting.value) return;
  const req = taskReq();
  if (!req) return;
  submitting.value = true;
  try {
    if (instance.value?.currentTaskKey === 'JIXIAO_INDICATOR_CONFIRM') {
      await confirmIndicatorTask(req);
    } else if (instance.value?.currentTaskKey === 'JIXIAO_HR_REVIEW') {
      await submitHrReview({ ...req, approved: true });
    } else if (instance.value?.currentTaskKey === 'JIXIAO_EMPLOYEE_CONFIRM') {
      await confirmEmployeeResult(req);
    }
    message.success('已提交');
    await load();
  } finally {
    submitting.value = false;
  }
}

async function submitScore() {
  if (
    !canScore.value ||
    draftLoadFailed.value ||
    loading.value ||
    submitting.value ||
    savingDraft.value
  )
    return;
  const req = taskReq();
  if (!req || !instance.value) return;
  const taskKey = instance.value.currentTaskKey || '';
  if (!validateScoreRows(taskKey)) return;
  if (taskKey === 'JIXIAO_SELF_SCORE' && selfScoreAttachmentUploading.value) {
    message.warning('自评附件仍在上传，请完成后再提交评分');
    return;
  }
  if (taskKey === 'JIXIAO_SELF_SCORE' && selfScoreAttachmentHasError.value) {
    message.warning('存在上传失败的自评附件，请重试或移除后再提交评分');
    return;
  }
  const items = scoreRows.value.map((row) => {
    return {
      comment: scoreComment(row, taskKey),
      instanceIndicatorId: row.indicator.id!,
      score: Number(scoreValue(row, taskKey)),
    };
  });
  submitting.value = true;
  try {
    if (instance.value.currentTaskKey === 'JIXIAO_SELF_SCORE') {
      await submitSelfScore({
        ...req,
        items,
        ...(draftReason.value.trim()
          ? { reason: draftReason.value.trim() }
          : {}),
      });
    } else if (instance.value.currentTaskKey === 'JIXIAO_SUPERVISOR_SCORE') {
      await submitSupervisorScore({
        ...req,
        items,
        ...(draftReason.value.trim()
          ? { reason: draftReason.value.trim() }
          : {}),
      });
    } else if (instance.value.currentTaskKey === 'JIXIAO_MANAGER_SCORE') {
      await submitManagerScore({
        ...req,
        items,
        ...(draftReason.value.trim()
          ? { reason: draftReason.value.trim() }
          : {}),
      });
    }
    message.success('评分已提交');
    savedSnapshot.value = draftSnapshot.value;
    await load(true);
  } finally {
    submitting.value = false;
  }
}

async function openTransfer() {
  if (!canTransfer.value || !instance.value?.currentTaskId) return;
  if (!(await confirmLeave())) return;
  transferForm.assigneeUserId = undefined;
  transferForm.reason = '';
  transferVisible.value = true;
  if (users.value.length === 0) {
    users.value = await getSimpleUserList();
  }
}

async function submitTransfer() {
  if (!canTransfer.value) return;
  if (!instance.value?.id || !instance.value.currentTaskId) return;
  if (!transferForm.assigneeUserId) {
    message.warning('请选择转交人');
    return;
  }
  const reason = transferForm.reason.trim();
  if (!reason) {
    message.warning('请填写转交原因');
    return;
  }
  transferring.value = true;
  try {
    await transferTask({
      assigneeUserId: transferForm.assigneeUserId,
      instanceId: instance.value.id,
      reason,
      taskId: instance.value.currentTaskId,
    });
    message.success('已转交');
    transferVisible.value = false;
    await load();
  } finally {
    transferring.value = false;
  }
}

async function openReturn(targetTaskDefinitionKey?: string) {
  if (!canReturn.value) return;
  if (!(await confirmLeave())) return;
  await loadReturnableNodes();
  if (returnableNodes.value.length === 0) {
    message.warning('当前节点没有可回退的历史步骤');
    return;
  }
  if (targetTaskDefinitionKey && !isReturnableStep(targetTaskDefinitionKey)) {
    return;
  }
  returnForm.targetTaskDefinitionKey =
    targetTaskDefinitionKey ||
    (returnableNodes.value.length === 1
      ? returnableNodes.value[0]?.taskDefinitionKey
      : undefined);
  returnForm.reason = '';
  returnVisible.value = true;
}

async function submitReturn() {
  if (!canReturn.value) return;
  if (!instance.value?.id) return;
  if (instance.value.status === 1 && !instance.value.currentTaskId) return;
  if (!returnForm.targetTaskDefinitionKey) {
    message.warning('请选择回退节点');
    return;
  }
  const reason = returnForm.reason.trim();
  if (!reason) {
    message.warning('请填写回退原因');
    return;
  }
  returning.value = true;
  try {
    const reopeningCompletedProcess = instance.value.status === 2;
    await returnTask({
      instanceId: instance.value.id,
      reason,
      targetTaskDefinitionKey: returnForm.targetTaskDefinitionKey,
      taskId: instance.value.currentTaskId || undefined,
    });
    message.success(
      reopeningCompletedProcess ? '已撤销原结果并创建修订流程' : '流程已回退',
    );
    returnVisible.value = false;
    await load();
  } finally {
    returning.value = false;
  }
}

async function saveDraft() {
  const payload = currentDraft.value;
  if (
    !canSaveDraft.value ||
    !payload ||
    loading.value ||
    savingDraft.value ||
    submitting.value
  )
    return;
  const invalid = payload.items.find(
    (item) =>
      item.score !== undefined &&
      (!Number.isFinite(item.score) ||
        item.score < 0 ||
        item.score > SCORE_MAX),
  );
  if (invalid) {
    message.warning(`评分必须在 0-${SCORE_MAX} 分之间，未完成项可以留空暂存`);
    focusScoreInput(invalid.instanceIndicatorId);
    return;
  }
  const snapshot = draftSnapshot.value;
  savingDraft.value = true;
  draftSaveFailed.value = false;
  try {
    const saved = await saveScoreDraft(payload);
    if (
      instance.value?.id === payload.instanceId &&
      instance.value.currentTaskId === payload.taskId
    ) {
      savedSnapshot.value = snapshot;
      draftSavedAt.value = saved.updateTime;
    }
    message.success('评分草稿已保存，尚未提交');
  } catch {
    draftSaveFailed.value = true;
  } finally {
    savingDraft.value = false;
  }
}

function draftTimeLabel(value?: JixiaoApi.DateTimeValue) {
  return formatPerformanceDateTime(value);
}

function confirmLeave() {
  if (!hasUnsavedChanges.value) return true;
  return new Promise<boolean>((resolve) => {
    Modal.confirm({
      title: '评分尚未保存',
      content: '离开会丢失本次未保存的评分和说明。你可以取消后先暂存草稿。',
      okText: '放弃修改并离开',
      cancelText: '继续编辑',
      onOk: () => {
        resolve(true);
      },
      onCancel: () => resolve(false),
    });
  });
}
function warnBeforeUnload(event: BeforeUnloadEvent) {
  if (!hasUnsavedChanges.value) return;
  event.preventDefault();
  event.returnValue = '';
}
onBeforeRouteLeave(confirmLeave);
onBeforeRouteUpdate(confirmLeave);
watch(
  () => props.id ?? route.params.instanceId,
  () => {
    void load(true);
  },
);
onMounted(() => {
  window.addEventListener('beforeunload', warnBeforeUnload);
  void load();
});
onBeforeUnmount(() => {
  latestLoadId += 1;
  window.removeEventListener('beforeunload', warnBeforeUnload);
});
</script>

<template>
  <PerformanceShell title="单人考核详情">
    <Alert v-if="loadError" :message="loadError" show-icon type="error"
      ><template #action
        ><Button size="small" :loading="loading" @click="load()"
          >重试</Button
        ></template
      ></Alert
    >
    <div v-if="instance" class="process-panel">
      <div class="process-head">
        <div>
          <strong
            >{{ instance.userName }} · {{ instance.periodKey }} 绩效考核</strong
          >
          <span> 当前：{{ currentProcessTitle }} </span>
          <span>
            当前处理人：{{ instance.currentTaskAssigneeUserName || '-' }}
          </span>
        </div>
        <Space size="small">
          <Button
            v-if="canReturn && returnableNodes.length"
            :loading="returnNodesLoading"
            @click="openReturn()"
          >
            <template #icon><Undo2 :size="15" /></template>
            回退
          </Button>
          <Button
            v-if="canTransfer"
            :loading="transferring"
            @click="openTransfer"
          >
            转交
          </Button>
          <Tag :color="statusMeta(instance.status).color">
            {{ statusMeta(instance.status).text }}
          </Tag>
        </Space>
      </div>
      <Alert
        v-if="managerRelationInvalid"
        class="manager-relation-alert"
        :message="managerRelationWarning"
        show-icon
        type="warning"
      />
      <div class="process-scroll">
        <Steps
          :current="currentProcessStep"
          :direction="isNarrow ? 'vertical' : 'horizontal'"
          class="process-steps"
          size="small"
        >
          <Steps.Step
            v-for="(step, index) in processSteps"
            :key="step.key"
            :description="step.description"
            :class="{
              'process-step-returnable': isReturnableStep(step.key),
            }"
            :status="processStepStatus(index)"
            :title="step.title"
            @click="openReturnFromStep(step.key)"
          />
        </Steps>
      </div>
    </div>

    <div class="detail-panel">
      <Descriptions
        v-if="instance"
        bordered
        size="small"
        :column="{ xs: 1, sm: 2, lg: 3 }"
      >
        <Descriptions.Item label="被考核人">
          {{ instance.userName }}
        </Descriptions.Item>
        <Descriptions.Item label="主管">
          {{ instance.supervisorUserName }}
        </Descriptions.Item>
        <Descriptions.Item label="主管上级">
          {{ instance.superiorSupervisorUserName || '-' }}
          <Tag v-if="managerRelationInvalid" color="warning">关系无效</Tag>
        </Descriptions.Item>
        <Descriptions.Item label="发起人">
          {{ instance.creatorUserName || '-' }}
        </Descriptions.Item>
        <Descriptions.Item label="截止日期">
          {{ instance.endDate || '未设置' }}
        </Descriptions.Item>
        <Descriptions.Item label="当前处理人">
          {{ instance.currentTaskAssigneeUserName || '-' }}
        </Descriptions.Item>
        <Descriptions.Item label="状态">
          <Tag :color="statusMeta(instance.status).color">
            {{ statusMeta(instance.status).text }}
          </Tag>
        </Descriptions.Item>
        <Descriptions.Item label="员工自评汇总（50%）">
          {{ scoreSummary.self ?? '-' }}
        </Descriptions.Item>
        <Descriptions.Item
          :label="
            managerScoreEnabled ? '主管评分汇总（40%）' : '主管评分汇总（50%）'
          "
        >
          {{ scoreSummary.supervisor ?? '-' }}
        </Descriptions.Item>
        <Descriptions.Item
          v-if="managerScoreEnabled"
          label="上级评分汇总（10%）"
        >
          {{ scoreSummary.manager ?? '-' }}
        </Descriptions.Item>
        <Descriptions.Item :label="scoreResultLabel">
          {{ instance.finalScore ?? '-' }}
        </Descriptions.Item>
        <Descriptions.Item v-if="instance.result?.grade" label="绩效等级">{{
          instance.result.grade
        }}</Descriptions.Item>
      </Descriptions>
    </div>

    <div ref="scorePanel" class="detail-panel">
      <div class="score-heading">
        <h2>指标与评分</h2>
        <span v-if="canScore"
          >已填 {{ completedScoreCount }} / {{ scoreRows.length }} 项 · 每项
          0—100 分</span
        >
      </div>
      <Alert
        v-if="instance?.currentTaskId && !canScore && !canApproveCurrent"
        class="action-alert"
        message="当前为查看模式。只有本节点指定处理人可以评分或确认。"
        show-icon
        type="info"
      />
      <Alert
        v-if="draftLoadFailed"
        class="action-alert"
        message="草稿加载失败。请先重试，避免覆盖之前保存的内容。"
        show-icon
        type="warning"
        ><template #action
          ><Button size="small" :loading="loading" @click="load()"
            >重新加载草稿</Button
          ></template
        ></Alert
      >
      <Alert
        v-if="pendingActionPlanIndicators.length"
        class="action-alert"
        :message="`还有 ${pendingActionPlanIndicators.length} 个指标行动项待完成。行动计划与考核流程并行，不影响员工自评和后续节点。`"
        show-icon
        type="info"
      />
      <Table
        v-if="!isNarrow"
        :columns="indicatorColumns"
        :data-source="scoreRows"
        :loading="loading"
        :pagination="false"
        :scroll="{ x: managerScoreEnabled ? 1020 : 860 }"
        row-key="indicator.id"
        size="small"
      >
        <template #bodyCell="{ column, record }">
          <template v-if="column.dataIndex === 'dimensionName'">
            {{ record.indicator.dimensionName || '-' }}
          </template>
          <template v-else-if="column.dataIndex === 'name'">
            <strong>{{ record.indicator.name || '-' }}</strong>
            <div class="indicator-meta">
              {{ record.indicator.dimensionName || '-' }}
            </div>
            <div class="standard-cell">
              {{ record.indicator.standard || '-' }}
            </div>
          </template>
          <template v-else-if="column.dataIndex === 'standard'">
            <div class="standard-cell">
              {{ record.indicator.standard || '-' }}
            </div>
          </template>
          <template v-else-if="column.dataIndex === 'weight'">
            {{ baselineScore(record) }}% / 基准{{ baselineScore(record) }}分
          </template>
          <template v-else-if="column.dataIndex === 'actionPlan'">
            <Tag v-if="!record.indicator.actionPlanEnabled">不参与</Tag>
            <Space v-else>
              <Tag
                :color="
                  record.indicator.actionPlanStatus === 1 ? 'green' : 'orange'
                "
              >
                {{
                  record.indicator.actionPlanStatus === 1 ? '已完成' : '待完成'
                }}
              </Tag>
              <Button
                v-if="canCompleteAction(record.indicator)"
                size="small"
                type="link"
                @click="completeAction(record.indicator)"
              >
                完成
              </Button>
            </Space>
          </template>
          <template v-else-if="column.dataIndex === 'scores'">
            <ScoreFields
              :row="record as ScoreRow"
              :self-editable="canEditSelfScore"
              :supervisor-editable="canEditSupervisorScore"
              :manager-editable="canEditManagerScore"
              :manager-enabled="managerScoreEnabled"
              :disabled="
                loading || submitting || savingDraft || draftLoadFailed
              "
              @update:row="Object.assign(record, $event)"
            />
          </template>
        </template>
      </Table>
      <div v-else class="indicator-cards">
        <article
          v-for="row in scoreRows"
          :key="row.indicator.id"
          class="indicator-card"
        >
          <div class="score-heading">
            <h3>{{ row.indicator.name }}</h3>
            <Tag
              >{{ baselineScore(row) }}% / 基准 {{ baselineScore(row) }} 分</Tag
            >
          </div>
          <p class="indicator-meta">
            {{ row.indicator.dimensionName || '未分维度' }}
          </p>
          <p class="standard-cell">
            {{ row.indicator.standard || '暂无考核标准' }}
          </p>
          <ScoreFields
            :row="row"
            :self-editable="canEditSelfScore"
            :supervisor-editable="canEditSupervisorScore"
            :manager-editable="canEditManagerScore"
            :manager-enabled="managerScoreEnabled"
            :disabled="loading || submitting || savingDraft || draftLoadFailed"
            @update:row="Object.assign(row, $event)"
          />
          <div v-if="row.indicator.actionPlanEnabled" class="indicator-action">
            <Tag
              :color="row.indicator.actionPlanStatus === 1 ? 'green' : 'orange'"
              >行动计划：{{
                row.indicator.actionPlanStatus === 1 ? '已完成' : '待完成'
              }}</Tag
            ><Button
              v-if="canCompleteAction(row.indicator)"
              size="small"
              type="link"
              @click="completeAction(row.indicator)"
              >完成</Button
            >
          </div>
        </article>
      </div>
    </div>

    <div v-if="instance?.id" class="detail-panel">
      <SelfScoreAttachmentPanel
        :editable="
          canEditSelfScore &&
          !!instance.currentTaskId &&
          !loading &&
          !submitting
        "
        :instance-id="instance.id"
        :task-id="instance.currentTaskId"
        @error-change="selfScoreAttachmentHasError = $event"
        @uploading-change="selfScoreAttachmentUploading = $event"
      />
    </div>

    <div
      v-if="instance?.currentTaskId && (canScore || canApproveCurrent)"
      class="detail-panel"
    >
      <label v-if="canScore" class="draft-reason"
        >本次评分说明（可选）<Textarea
          v-model:value="draftReason"
          :disabled="submitting || savingDraft || loading || draftLoadFailed"
          :maxlength="500"
          :rows="2"
          placeholder="补充本次评分或提交说明"
      /></label>
      <Alert
        v-if="draftSaveFailed"
        class="action-alert"
        message="草稿保存失败，本页修改仍保留，请重试暂存。"
        show-icon
        type="error"
      />
      <div class="action-panel">
        <div class="draft-status" aria-live="polite">
          <span v-if="canScore && hasUnsavedChanges">有未保存修改</span
          ><span v-else-if="canScore && draftSavedAt"
            >草稿已保存 · {{ draftTimeLabel(draftSavedAt) }}</span
          >
        </div>
        <Space>
          <Button
            v-if="canSaveDraft"
            :loading="savingDraft"
            :disabled="submitting || loading"
            @click="saveDraft"
            >暂存草稿</Button
          >
          <Button
            v-if="canScore"
            :loading="submitting"
            :disabled="savingDraft || loading || draftLoadFailed"
            type="primary"
            @click="submitScore"
          >
            提交评分
          </Button>
          <Button
            v-else-if="canApproveCurrent"
            :loading="submitting"
            type="primary"
            @click="approveCurrent"
          >
            {{
              instance.currentTaskKey === 'JIXIAO_INDICATOR_CONFIRM'
                ? '确认指标'
                : instance.currentTaskKey === 'JIXIAO_EMPLOYEE_CONFIRM'
                  ? '确认考核结果'
                  : '审核通过'
            }}
          </Button>
        </Space>
      </div>
    </div>

    <Modal
      v-model:open="transferVisible"
      title="转交流程"
      :confirm-loading="transferring"
      @ok="submitTransfer"
    >
      <Space direction="vertical" class="transfer-form">
        <Alert
          message="仅能转交给有本条考核查看权且符合当前节点资格的人员。下方通讯录仅供查找，是否可接收由提交时再次核验。"
          show-icon
          type="info"
        />
        <Select
          v-model:value="transferForm.assigneeUserId"
          :options="userOptions"
          allow-clear
          option-filter-prop="label"
          placeholder="请选择转交人"
          show-search
        />
        <Textarea
          v-model:value="transferForm.reason"
          :rows="3"
          placeholder="请填写转交原因"
        />
      </Space>
    </Modal>

    <Modal
      v-model:open="returnVisible"
      :title="isCompletedInstance ? '重新打开考核流程' : '回退考核流程'"
      :confirm-loading="returning"
      ok-text="确认回退"
      @ok="submitReturn"
    >
      <Space direction="vertical" class="return-form" size="middle">
        <Alert :message="returnWarning" show-icon type="warning" />
        <Select
          v-model:value="returnForm.targetTaskDefinitionKey"
          :options="returnNodeOptions"
          placeholder="请选择回退节点"
        />
        <Textarea
          v-model:value="returnForm.reason"
          :maxlength="500"
          :rows="4"
          placeholder="请填写回退原因，例如：员工自评分填写错误，需退回修改"
          show-count
        />
      </Space>
    </Modal>
  </PerformanceShell>
</template>

<style scoped>
.process-panel {
  min-width: 0;
  padding: 14px;
  overflow: hidden;
  background: hsl(var(--card));
  border: 1px solid hsl(var(--border));
  border-radius: 8px;
}

.process-head {
  display: flex;
  gap: 12px;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 14px;
}

.process-head > div {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
  min-width: 0;
}

.process-head strong {
  font-size: 15px;
  font-weight: 650;
  color: hsl(var(--foreground));
}

.process-head span {
  font-size: 13px;
  color: hsl(var(--muted-foreground));
}

.process-scroll {
  padding-bottom: 4px;
  overflow: visible;
}

.manager-relation-alert {
  margin-bottom: 12px;
}

.transfer-form {
  width: 100%;
}

.transfer-form :deep(.ant-select) {
  width: 100%;
}

.return-form {
  width: 100%;
}

.return-form :deep(.ant-select) {
  width: 100%;
}

.process-steps {
  min-width: 0;
}

:deep(.process-steps.ant-steps-navigation) {
  padding-top: 0;
}

:deep(.process-steps .ant-steps-item-container) {
  min-height: 58px;
}

:deep(.process-steps .ant-steps-item-title) {
  font-weight: 600;
}

:deep(.process-steps .ant-steps-item-description) {
  max-width: 120px;
  color: #64748b;
  white-space: normal;
}

:deep(.process-steps .process-step-returnable) {
  cursor: pointer;
}

:deep(.process-steps .process-step-returnable .ant-steps-item-title) {
  color: #1677ff;
}

.detail-panel {
  min-width: 0;
  padding: 14px;
  overflow: hidden;
  background: hsl(var(--card));
  border: 1px solid hsl(var(--border));
  border-radius: 8px;
}

.action-alert {
  margin-bottom: 12px;
}

.action-panel {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  align-items: center;
  justify-content: space-between;
}

.standard-cell,
.readonly-comment {
  color: hsl(var(--muted-foreground));
  white-space: pre-wrap;
}

.score-input {
  width: 100%;
}

:deep(.ant-table-cell .ant-input-number-group-wrapper) {
  width: 100%;
}

.score-heading {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: baseline;
  justify-content: space-between;
  margin-bottom: 14px;
}
.score-heading h2,
.score-heading h3 {
  margin: 0;
  font-size: 15px;
  font-weight: 600;
}
.score-heading span,
.indicator-meta,
.draft-status {
  font-size: 12px;
  color: hsl(var(--muted-foreground));
}
.indicator-meta {
  margin: 6px 0;
}
.indicator-cards {
  display: grid;
  gap: 16px;
}
.indicator-card {
  padding-bottom: 18px;
  border-bottom: 1px solid hsl(var(--border));
}
.indicator-card:last-child {
  padding-bottom: 0;
  border-bottom: 0;
}
.indicator-card .standard-cell {
  margin-bottom: 16px;
  white-space: pre-wrap;
}
.indicator-action {
  margin-top: 12px;
}
.draft-reason {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-bottom: 16px;
}
@media (max-width: 640px) {
  .process-head {
    align-items: flex-start;
    flex-direction: column;
  }
}
</style>
