<script lang="ts" setup>
import type { TableColumnsType } from 'ant-design-vue';

import type { JixiaoApi } from '#/api/fdmperformance';

import { computed, onMounted, ref } from 'vue';
import { useRoute } from 'vue-router';

import {
  Button,
  Descriptions,
  InputNumber,
  message,
  Space,
  Steps,
  Table,
  Tag,
  Textarea,
} from 'ant-design-vue';

import {
  confirmEmployeeResult,
  confirmIndicatorTask,
  getInstance,
  submitHrReview,
  submitSelfScore,
  submitSupervisorScore,
} from '#/api/fdmperformance';

import { INSTANCE_STATUS_MAP, TASK_LABELS } from '../../shared/constants';
import PerformanceShell from '../../shared/PerformanceShell.vue';

defineOptions({ name: 'FdmPerformanceInstanceDetail' });

const route = useRoute();
const loading = ref(false);
const submitting = ref(false);
const instance = ref<JixiaoApi.Instance>();
const scoreRows = ref<
  Array<{
    indicator: JixiaoApi.InstanceIndicator;
    selfComment?: string;
    selfScore?: number;
    supervisorComment?: string;
    supervisorScore?: number;
  }>
>([]);
const bpmStepKeys = [
  'JIXIAO_INDICATOR_CONFIRM',
  'JIXIAO_SELF_SCORE',
  'JIXIAO_SUPERVISOR_SCORE',
  'JIXIAO_EMPLOYEE_CONFIRM',
  'JIXIAO_HR_REVIEW',
];

type ProcessStepStatus = 'error' | 'finish' | 'process' | 'wait';

const indicatorColumns: TableColumnsType = [
  { dataIndex: 'dimensionName', fixed: 'left', title: '维度', width: 120 },
  { dataIndex: 'name', fixed: 'left', title: '指标', width: 180 },
  { dataIndex: 'standard', title: '考核标准', width: 260 },
  { dataIndex: 'weight', title: '权重', width: 80 },
  { dataIndex: 'selfScore', title: '员工自评', width: 120 },
  { dataIndex: 'selfComment', title: '自评说明', width: 220 },
  { dataIndex: 'supervisorScore', title: '主管评分', width: 120 },
  { dataIndex: 'supervisorComment', title: '主管说明', width: 220 },
];

const canScore = computed(() =>
  ['JIXIAO_SELF_SCORE', 'JIXIAO_SUPERVISOR_SCORE'].includes(
    instance.value?.currentTaskKey || '',
  ),
);
const canEditSelfScore = computed(
  () => instance.value?.currentTaskKey === 'JIXIAO_SELF_SCORE',
);
const canEditSupervisorScore = computed(
  () => instance.value?.currentTaskKey === 'JIXIAO_SUPERVISOR_SCORE',
);

const processSteps = computed(() => {
  const detail = instance.value;
  return [
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
  ];
});

const currentProcessStep = computed(() => {
  const detail = instance.value;
  const taskIndex = bpmStepKeys.indexOf(detail?.currentTaskKey || '');
  if (taskIndex !== -1) {
    return taskIndex;
  }
  if (detail?.result?.publicStatus === 1 || detail?.publicTime) {
    return processSteps.value.length - 1;
  }
  if (detail?.status === 2) {
    return 5;
  }
  return 0;
});

const currentProcessTitle = computed(
  () => processSteps.value[currentProcessStep.value]?.title || '-',
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

async function load() {
  loading.value = true;
  try {
    const id = Number(route.params.instanceId);
    instance.value = await getInstance(id);
    scoreRows.value = [];
    for (const indicator of instance.value.indicators || []) {
      const selfScore = scoreOf(indicator.id, 'SELF');
      const supervisorScore = scoreOf(indicator.id, 'SUPERVISOR');
      scoreRows.value.push({
        indicator,
        selfComment: selfScore?.comment,
        selfScore: selfScore?.score,
        supervisorComment: supervisorScore?.comment,
        supervisorScore: supervisorScore?.score,
      });
    }
  } finally {
    loading.value = false;
  }
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
  const isSelfScore = instance.value.currentTaskKey === 'JIXIAO_SELF_SCORE';
  const items = scoreRows.value.map((row) => {
    const score = isSelfScore ? row.selfScore : row.supervisorScore;
    const comment = isSelfScore ? row.selfComment : row.supervisorComment;
    return {
      comment,
      instanceIndicatorId: row.indicator.id!,
      score: Number(score || 0),
    };
  });
  submitting.value = true;
  try {
    if (instance.value.currentTaskKey === 'JIXIAO_SELF_SCORE') {
      await submitSelfScore({ ...req, items });
    } else if (instance.value.currentTaskKey === 'JIXIAO_SUPERVISOR_SCORE') {
      await submitSupervisorScore({ ...req, items });
    }
    message.success('评分已提交');
    await load();
  } finally {
    submitting.value = false;
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
          <span>
            当前：{{
              instance.currentTaskKey
                ? TASK_LABELS[instance.currentTaskKey] || currentProcessTitle
                : currentProcessTitle
            }}
          </span>
        </div>
        <Tag :color="statusMeta(instance.status).color">
          {{ statusMeta(instance.status).text }}
        </Tag>
      </div>
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
            :status="processStepStatus(index)"
            :title="step.title"
          />
        </Steps>
      </div>
    </div>

    <div class="detail-panel">
      <Descriptions v-if="instance" bordered size="small" :column="3">
        <Descriptions.Item label="被考核人">
{{
          instance.userName
        }}
</Descriptions.Item>
        <Descriptions.Item label="主管">
{{
          instance.supervisorUserName
        }}
</Descriptions.Item>
        <Descriptions.Item label="主管上级">
          {{ instance.superiorSupervisorUserName || '-' }}
        </Descriptions.Item>
        <Descriptions.Item label="流程实例">
          {{ instance.processInstanceId || '-' }}
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
      <Table
        :columns="indicatorColumns"
        :data-source="scoreRows"
        :loading="loading"
        :pagination="false"
        :scroll="{ x: 1220 }"
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
            {{ record.indicator.weight || 0 }}%
          </template>
          <template v-else-if="column.dataIndex === 'selfScore'">
            <InputNumber
              v-if="canEditSelfScore"
              v-model:value="record.selfScore"
              :max="100"
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
              :max="100"
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
        </template>
      </Table>
    </div>

    <div v-if="instance?.currentTaskId" class="detail-panel action-panel">
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
          v-else
          :loading="submitting"
          type="primary"
          @click="approveCurrent"
        >
          提交当前节点
        </Button>
      </Space>
    </div>
  </PerformanceShell>
</template>

<style scoped>
.process-panel {
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

.detail-panel {
  padding: 14px;
  background: #fff;
  border: 1px solid #edf0f4;
  border-radius: 8px;
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
