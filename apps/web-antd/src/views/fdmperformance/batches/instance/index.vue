<script lang="ts" setup>
import type { TableColumnsType } from 'ant-design-vue';

import type { JixiaoApi } from '#/api/fdmperformance';
import type { SystemUserApi } from '#/api/system/user';

import { computed, onMounted, reactive, ref } from 'vue';
import { useRoute } from 'vue-router';

import { useAccess } from '@vben/access';
import { Undo2 } from '@vben/icons';
import { useUserStore } from '@vben/stores';

import {
  Alert,
  Button,
  Descriptions,
  InputNumber,
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
  returnTask,
  submitHrReview,
  submitManagerScore,
  submitSelfScore,
  submitSupervisorScore,
  transferTask,
} from '#/api/fdmperformance';
import { getSimpleUserList } from '#/api/system/user';

import { INSTANCE_STATUS_MAP } from '../../shared/constants';
import PerformanceShell from '../../shared/PerformanceShell.vue';

defineOptions({ name: 'FdmPerformanceInstanceDetail' });

const route = useRoute();
const { hasAccessByCodes } = useAccess();
const userStore = useUserStore();
const loading = ref(false);
const submitting = ref(false);
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
const PERFORMANCE_HR_CODES = ['fdmperformance:hr'];
type ScoreRow = {
  indicator: JixiaoApi.InstanceIndicator;
  managerComment?: string;
  managerScore?: number;
  selfComment?: string;
  selfScore?: number;
  supervisorComment?: string;
  supervisorScore?: number;
};
const scoreRows = ref<ScoreRow[]>([]);

type ProcessStepStatus = 'error' | 'finish' | 'process' | 'wait';

const SCORE_MAX = 100;
const managerScoreEnabled = computed(
  () => instance.value?.managerScoreEnabled === true,
);
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
    { dataIndex: 'dimensionName', fixed: 'left', title: '维度', width: 120 },
    { dataIndex: 'name', fixed: 'left', title: '指标', width: 180 },
    { dataIndex: 'standard', title: '考核标准', width: 260 },
    { dataIndex: 'weight', title: '权重/基准分', width: 120 },
    { dataIndex: 'actionPlan', title: '行动计划', width: 180 },
    { dataIndex: 'selfScore', title: '员工自评(50%)', width: 130 },
    { dataIndex: 'selfComment', title: '自评说明', width: 220 },
    {
      dataIndex: 'supervisorScore',
      title: managerScoreEnabled.value ? '主管评分(40%)' : '主管评分(50%)',
      width: 130,
    },
    { dataIndex: 'supervisorComment', title: '主管说明', width: 220 },
  ];
  if (managerScoreEnabled.value) {
    columns.push(
      { dataIndex: 'managerScore', title: '上级评分(10%)', width: 130 },
      { dataIndex: 'managerComment', title: '上级说明', width: 220 },
    );
  }
  return columns;
});

const actionPlanIndicators = computed(() =>
  (instance.value?.indicators || []).filter((item) => item.actionPlanEnabled),
);
const pendingActionPlanIndicators = computed(() =>
  actionPlanIndicators.value.filter((item) => item.actionPlanStatus !== 1),
);
const canScore = computed(() =>
  [
    'JIXIAO_MANAGER_SCORE',
    'JIXIAO_SELF_SCORE',
    'JIXIAO_SUPERVISOR_SCORE',
  ].includes(instance.value?.currentTaskKey || ''),
);
const canApproveCurrent = computed(() =>
  [
    'JIXIAO_EMPLOYEE_CONFIRM',
    'JIXIAO_HR_REVIEW',
    'JIXIAO_INDICATOR_CONFIRM',
  ].includes(instance.value?.currentTaskKey || ''),
);
const canEditSelfScore = computed(
  () => instance.value?.currentTaskKey === 'JIXIAO_SELF_SCORE',
);
const canEditSupervisorScore = computed(
  () => instance.value?.currentTaskKey === 'JIXIAO_SUPERVISOR_SCORE',
);
const canEditManagerScore = computed(
  () => instance.value?.currentTaskKey === 'JIXIAO_MANAGER_SCORE',
);
const isPerformanceAdmin = computed(() =>
  hasAccessByCodes(PERFORMANCE_HR_CODES),
);
const canTransfer = computed(
  () =>
    isPerformanceAdmin.value &&
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
      description: detail?.result?.grade
        ? `当前等级：${detail.result.grade}`
        : '默认 B / 可调整',
      key: 'JIXIAO_GRADE_ADJUST',
      title: '人事调级',
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
      (step) => step.key === 'JIXIAO_GRADE_ADJUST',
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
    isPerformanceAdmin.value &&
    (isCompletedInstance.value ||
      (instance.value?.status === 1 && !!instance.value?.currentTaskId)),
);
const returnWarning = computed(() =>
  isCompletedInstance.value
    ? '回退后将撤销公示并创建修订流程，旧流程历史仍会保留；目标节点之后的评分、等级、确认和复盘状态将失效，指标行动计划不受影响。'
    : '回退后，目标节点之后的评分和确认状态将失效；指标行动计划不受影响。',
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

function scoreOf(indicatorId?: number, scoreType?: string) {
  return instance.value?.scores?.find(
    (item) =>
      item.instanceIndicatorId === indicatorId && item.scoreType === scoreType,
  );
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

function validateScoreRows(taskKey: string) {
  for (const row of scoreRows.value) {
    const score = Number(scoreValue(row, taskKey) ?? 0);
    if (Number.isNaN(score) || score < 0 || score > SCORE_MAX) {
      message.warning(
        `${row.indicator.name || '指标'}评分必须在 0-${SCORE_MAX} 分之间`,
      );
      return false;
    }
  }
  return true;
}

async function load() {
  loading.value = true;
  try {
    const id = Number(route.params.instanceId);
    instance.value = await getInstance(id);
    scoreRows.value = [];
    for (const indicator of instance.value.indicators || []) {
      const selfScore = scoreOf(indicator.id, 'SELF');
      const supervisorScore = scoreOf(indicator.id, 'SUPERVISOR');
      const managerScore = scoreOf(indicator.id, 'MANAGER');
      scoreRows.value.push({
        indicator,
        managerComment: managerScore?.comment,
        managerScore: managerScore?.score,
        selfComment: selfScore?.comment,
        selfScore: selfScore?.score,
        supervisorComment: supervisorScore?.comment,
        supervisorScore: supervisorScore?.score,
      });
    }
    await loadReturnableNodes(true);
  } finally {
    loading.value = false;
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
    Number(userStore.userInfo?.id) === Number(instance.value?.userId)
  );
}

function completeAction(indicator: JixiaoApi.InstanceIndicator) {
  if (!indicator.id) return;
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
  const req = taskReq();
  if (!req || !instance.value) return;
  const taskKey = instance.value.currentTaskKey || '';
  if (!validateScoreRows(taskKey)) return;
  const items = scoreRows.value.map((row) => {
    return {
      comment: scoreComment(row, taskKey),
      instanceIndicatorId: row.indicator.id!,
      score: Number(scoreValue(row, taskKey) || 0),
    };
  });
  submitting.value = true;
  try {
    if (instance.value.currentTaskKey === 'JIXIAO_SELF_SCORE') {
      await submitSelfScore({ ...req, items });
    } else if (instance.value.currentTaskKey === 'JIXIAO_SUPERVISOR_SCORE') {
      await submitSupervisorScore({ ...req, items });
    } else if (instance.value.currentTaskKey === 'JIXIAO_MANAGER_SCORE') {
      await submitManagerScore({ ...req, items });
    }
    message.success('评分已提交');
    await load();
  } finally {
    submitting.value = false;
  }
}

async function openTransfer() {
  if (!instance.value?.currentTaskId) return;
  transferForm.assigneeUserId = undefined;
  transferForm.reason = '';
  transferVisible.value = true;
  if (users.value.length === 0) {
    users.value = await getSimpleUserList();
  }
}

async function submitTransfer() {
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

onMounted(load);
</script>

<template>
  <PerformanceShell title="单人考核详情">
    <div v-if="instance" class="process-panel">
      <div class="process-head">
        <div>
          <strong>考核流程</strong>
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
          class="process-steps"
          size="small"
          type="navigation"
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
      <Descriptions v-if="instance" bordered size="small" :column="3">
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
        <Descriptions.Item label="流程实例">
          {{ instance.processInstanceId || '-' }}
        </Descriptions.Item>
        <Descriptions.Item label="当前处理人">
          {{ instance.currentTaskAssigneeUserName || '-' }}
        </Descriptions.Item>
        <Descriptions.Item label="状态">
          <Tag :color="statusMeta(instance.status).color">
            {{ statusMeta(instance.status).text }}
          </Tag>
        </Descriptions.Item>
        <Descriptions.Item label="最终分">
          {{ instance.finalScore ?? '-' }}
        </Descriptions.Item>
      </Descriptions>
    </div>

    <div class="detail-panel">
      <Alert
        v-if="pendingActionPlanIndicators.length"
        class="action-alert"
        :message="`还有 ${pendingActionPlanIndicators.length} 个指标行动项待完成。行动计划与考核流程并行，不影响员工自评和后续节点。`"
        show-icon
        type="info"
      />
      <Table
        :columns="indicatorColumns"
        :data-source="scoreRows"
        :loading="loading"
        :pagination="false"
        :scroll="{ x: managerScoreEnabled ? 1770 : 1420 }"
        row-key="indicator.id"
        size="small"
      >
        <template #bodyCell="{ column, record }">
          <template v-if="column.dataIndex === 'dimensionName'">
            {{ record.indicator.dimensionName || '-' }}
          </template>
          <template v-else-if="column.dataIndex === 'name'">
            <strong>{{ record.indicator.name || '-' }}</strong>
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
          <template v-else-if="column.dataIndex === 'selfScore'">
            <InputNumber
              v-if="canEditSelfScore"
              v-model:value="record.selfScore"
              :max="SCORE_MAX"
              :min="0"
              class="score-input"
              addon-after="分"
            />
            <span v-else>{{ record.selfScore ?? '-' }}</span>
          </template>
          <template v-else-if="column.dataIndex === 'selfComment'">
            <Textarea
              v-if="canEditSelfScore"
              v-model:value="record.selfComment"
              :rows="2"
              placeholder="填写自评说明"
            />
            <span v-else class="readonly-comment">
              {{ record.selfComment || '-' }}
            </span>
          </template>
          <template v-else-if="column.dataIndex === 'supervisorScore'">
            <InputNumber
              v-if="canEditSupervisorScore"
              v-model:value="record.supervisorScore"
              :max="SCORE_MAX"
              :min="0"
              class="score-input"
              addon-after="分"
            />
            <span v-else>{{ record.supervisorScore ?? '-' }}</span>
          </template>
          <template v-else-if="column.dataIndex === 'supervisorComment'">
            <Textarea
              v-if="canEditSupervisorScore"
              v-model:value="record.supervisorComment"
              :rows="2"
              placeholder="填写主管说明"
            />
            <span v-else class="readonly-comment">
              {{ record.supervisorComment || '-' }}
            </span>
          </template>
          <template v-else-if="column.dataIndex === 'managerScore'">
            <InputNumber
              v-if="canEditManagerScore"
              v-model:value="record.managerScore"
              :max="SCORE_MAX"
              :min="0"
              class="score-input"
              addon-after="分"
            />
            <span v-else>{{ record.managerScore ?? '-' }}</span>
          </template>
          <template v-else-if="column.dataIndex === 'managerComment'">
            <Textarea
              v-if="canEditManagerScore"
              v-model:value="record.managerComment"
              :rows="2"
              placeholder="填写上级说明"
            />
            <span v-else class="readonly-comment">
              {{ record.managerComment || '-' }}
            </span>
          </template>
        </template>
      </Table>
    </div>

    <div
      v-if="instance?.currentTaskId && (canScore || canApproveCurrent)"
      class="detail-panel action-panel"
    >
      <Space>
        <Button
          v-if="canScore"
          :loading="submitting"
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
          提交当前节点
        </Button>
      </Space>
    </div>

    <Modal
      v-model:open="transferVisible"
      title="转交流程"
      :confirm-loading="transferring"
      @ok="submitTransfer"
    >
      <Space direction="vertical" class="transfer-form">
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
  background: #fff;
  border: 1px solid #edf0f4;
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
  color: #111827;
}

.process-head span {
  font-size: 13px;
  color: #64748b;
}

.process-scroll {
  padding-bottom: 4px;
  overflow: auto hidden;
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
  min-width: 980px;
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
  background: #fff;
  border: 1px solid #edf0f4;
  border-radius: 8px;
}

.action-alert {
  margin-bottom: 12px;
}

.action-panel {
  display: flex;
  justify-content: flex-end;
}

.standard-cell,
.readonly-comment {
  color: #475569;
  white-space: pre-wrap;
}

.score-input {
  width: 100%;
}

:deep(.ant-table-cell .ant-input-number-group-wrapper) {
  width: 100%;
}
</style>
