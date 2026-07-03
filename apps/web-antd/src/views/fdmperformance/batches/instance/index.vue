<script lang="ts" setup>
import type { TableColumnsType } from 'ant-design-vue';

import { computed, onMounted, reactive, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';

import {
  Button,
  Card,
  Empty,
  Input,
  InputNumber,
  Modal,
  Progress,
  Space,
  Steps,
  Table,
  Tag,
  Upload,
  message,
} from 'ant-design-vue';

import { uploadFile } from '#/api/infra/file';
import {
  confirmFdmPerformanceAssessmentIndicators,
  confirmFdmPerformanceAssessmentResult,
  confirmMyFdmPerformanceAssessmentIndicators,
  confirmMyFdmPerformanceAssessmentResult,
  getFdmPerformanceAssessmentBatch,
  getFdmPerformanceAssessmentInstance,
  getFdmPerformanceAssessmentTaskPage,
  getMyFdmPerformanceAssessmentInstance,
  publishFdmPerformanceAssessmentResult,
  recordFdmPerformanceAssessmentInterview,
  submitFdmPerformanceAssessmentHrReview,
  submitFdmPerformanceAssessmentScore,
  submitMyFdmPerformanceAssessmentScore,
  type FdmPerformanceAssessmentApi,
} from '#/api/fdmperformance/assessment';
import { getFdmPerformanceTemplate } from '#/api/fdmperformance/template';

import PerformanceShell from '../../shared/PerformanceShell.vue';
import {
  buildApiScoreItems,
  extractFlowStagesFromSimpleNode,
  mapApiBatch,
  mapApiInstance,
  mapApiTemplate,
  mapApiTemplateIndicators,
} from '../../shared/api-adapter';
import {
  type AssessmentBatch,
  type AssessmentInstance,
  type AssessmentTemplate,
  type Employee,
  type Indicator,
  type ScoreSummary,
  instanceStatusMetaMap,
} from '../../shared/model';
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

const DEDUCTION_DIMENSION_TYPE = 4;

const route = useRoute();
const router = useRouter();
const { performancePath } = usePerformancePath();

const apiLoading = ref(false);
const submittingScore = ref(false);
const reviewRemark = ref('');
const interviewModalOpen = ref(false);
const interviewConclusion = ref('已完成绩效沟通，后续动作同步到行动计划');
const nodeComment = ref('');

const scoreInputs = reactive<Record<number, number>>({});
const scoreComments = reactive<Record<number, string>>({});
const scoreAttachments = reactive<Record<number, string>>({});

const apiBatch = ref<AssessmentBatch>();
const apiInstance = ref<AssessmentInstance>();
const apiEmployee = ref<Employee>();
const apiTemplate = ref<AssessmentTemplate>();
const apiTemplateIndicators = ref<Indicator[]>([]);
const apiTasks = ref<FdmPerformanceAssessmentApi.Task[]>([]);

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
const activeScoreTask = computed(() => getPendingScoreTask(activeScoreType.value));
const canScore = computed(() => {
  if (!instance.value || !activeScoreTask.value) return false;
  return (
    (activeScoreType.value === 'self' && instance.value.status === 'selfScore') ||
    (activeScoreType.value === 'supervisor' && instance.value.status === 'supervisorScore')
  );
});
const scoreActionLabel = computed(() => activeScoreType.value === 'self' ? '提交自评' : '提交主管评分');

const flowStages = computed(() => {
  if (instance.value?.flowSnapshot?.length) return instance.value.flowSnapshot;
  return extractFlowStagesFromSimpleNode(template.value?.flowNode);
});
const currentFlowIndex = computed(() =>
  Math.min(Math.max((instance.value?.progress || 1) - 1, 0), Math.max(flowStages.value.length - 1, 0)),
);
const scorePercent = computed(() =>
  Math.round(((currentFlowIndex.value + 1) / Math.max(flowStages.value.length, 1)) * 100),
);
const flowItems = computed(() =>
  flowStages.value.map((stage, index) => {
    const stepNo = index + 1;
    const progress = instance.value?.progress || 1;
    const prefix = stepNo < progress ? '已完成' : stepNo === progress ? '当前节点' : '待处理';
    return {
      description: `${prefix} · ${stage.owner}`,
      title: stage.name,
    };
  }),
);

const scoreSummaries = computed(() => instance.value?.scoreSummaries || []);
const historySummaries = computed(() => scoreSummaries.value);
const scoreSummaryCards = computed<ScoreSummaryCard[]>(() => {
  const finalScore = instance.value?.finalScore;
  const cards: ScoreSummaryCard[] = [];
  if (finalScore !== undefined && finalScore !== null) {
    cards.push({
      cardType: 'final',
      nodeName: '绩效总分',
      scoreWeight: undefined,
      totalScore: finalScore,
    });
  }
  return [...cards, ...scoreSummaries.value];
});

const dimensionGroups = computed<DimensionGroup[]>(() => {
  const groupMap = new Map<string, DimensionGroup>();
  templateIndicators.value.forEach((indicator) => {
    const key = String(indicator.dimensionId || indicator.dimension || 'default');
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
  return Array.from(groupMap.values());
});

const currentNodeTotal = computed(() =>
  Number(
    templateIndicators.value
      .reduce((sum, indicator) => sum + normalizeIndicatorScore(indicator, scoreInputs[indicator.id]), 0)
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
      dataIndex: getSummaryColumnKey(summary),
      title: getSummaryLabel(summary),
      width: 150,
    });
  });
  columns.push(
    { dataIndex: 'currentScore', title: '当前评分', width: 150 },
    { dataIndex: 'scoreComment', title: '评分说明', width: 260 },
  );
  return columns;
});

function getInstanceMeta(status: unknown) {
  return instanceStatusMetaMap[status as keyof typeof instanceStatusMetaMap] || { color: 'default', label: '未知' };
}

function getScoreTaskType(type: ScoreType) {
  return type === 'self' ? 2 : 3;
}

function getPendingScoreTask(type: ScoreType) {
  const instanceId = instance.value?.id;
  const taskType = getScoreTaskType(type);
  return apiTasks.value.find((task) => task.status === 0 && task.instanceId === instanceId && task.taskType === taskType);
}

function getSummaryColumnKey(summary: ScoreSummary) {
  return `summary_${summary.taskId || summary.nodeKey || summary.scorerRoleType || 'score'}`;
}

function getSummaryLabel(summary: ScoreSummary) {
  const nodeName = summary.nodeName || (summary.scorerRoleType === 1 ? '自评' : summary.scorerRoleType === 2 ? '主管评分' : '评分');
  return summary.scorerUserId ? `${nodeName}-用户${summary.scorerUserId}` : nodeName;
}

function getSummaryScore(record: Record<string, any>, columnKey: string) {
  const summary = historySummaries.value.find((item) => getSummaryColumnKey(item) === columnKey);
  if (!summary) return '-';
  const historyKey = String(summary.taskId || summary.nodeKey || summary.scorerRoleType || 'score');
  return instance.value?.indicatorScores?.[record.id]?.histories?.[historyKey]?.score ?? '-';
}

function getDimensionTitle(group: DimensionGroup) {
  const weightText = group.dimensionWeight ? ` ${group.dimensionWeight}%` : '';
  return `${group.name}${weightText}`;
}

function isDeductionIndicator(indicator: Pick<Indicator, 'dimensionType'>) {
  return indicator.dimensionType === DEDUCTION_DIMENSION_TYPE;
}

function normalizeIndicatorScore(indicator: Pick<Indicator, 'dimensionType'>, score?: number) {
  const value = Number(score || 0);
  return isDeductionIndicator(indicator) ? -Math.abs(value) : value;
}

function isScoreCommentRequired(indicator: Pick<Indicator, 'dimensionType'>) {
  return ![3, 4].includes(Number(indicator.dimensionType || 0));
}

function getAttachmentCount(value?: string) {
  return (value || '').split(',').map((item) => item.trim()).filter(Boolean).length;
}

function initScoreDraft() {
  Object.keys(scoreInputs).forEach((key) => delete scoreInputs[Number(key)]);
  Object.keys(scoreComments).forEach((key) => delete scoreComments[Number(key)]);
  Object.keys(scoreAttachments).forEach((key) => delete scoreAttachments[Number(key)]);

  const type = activeScoreType.value;
  templateIndicators.value.forEach((indicator) => {
    const state = instance.value?.indicatorScores?.[indicator.id];
    scoreInputs[indicator.id] = state?.[type] ?? state?.final ?? 0;
    scoreComments[indicator.id] = state?.scoreComment || '';
    scoreAttachments[indicator.id] = state?.attachmentIds || '';
  });
  const currentSummary = scoreSummaries.value.find((item) => item.taskId === activeScoreTask.value?.id);
  nodeComment.value = currentSummary?.comment || '';
}

function goBack() {
  router.push(isMyMode.value ? performancePath('/my') : performancePath(`/batches/${batch.value?.id || ''}`));
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

async function submitScore() {
  if (!instance.value || !canScore.value) return;
  const missingComment = templateIndicators.value.find(
    (indicator) => isScoreCommentRequired(indicator) && !scoreComments[indicator.id]?.trim(),
  );
  if (missingComment) {
    message.warning(`请填写「${missingComment.name}」的评分说明`);
    return;
  }
  submittingScore.value = true;
  try {
    const request = isMyMode.value ? submitMyFdmPerformanceAssessmentScore : submitFdmPerformanceAssessmentScore;
    await request({
      comment: nodeComment.value,
      instanceId: instance.value.id,
      items: buildApiScoreItems(templateIndicators.value, { ...scoreInputs }, { ...scoreComments }, { ...scoreAttachments }),
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
  await publishFdmPerformanceAssessmentResult(batch.value.id, [instance.value.id]);
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
    const result = await uploadFile({
      directory: 'fdmperformance/score',
      file: options.file as File,
    }) as { id?: number; path?: string; url?: string };
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
        status: 0,
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
    const templateId = Number(instanceResp.templateId || batchResp.templateIds?.[0] || 0);
    if (templateId) {
      const templateResp = await getFdmPerformanceTemplate(templateId);
      apiTemplate.value = mapApiTemplate(templateResp);
      apiTemplateIndicators.value = mapApiTemplateIndicators(templateResp);
      apiBatch.value.templateId = templateId;
    }
    initScoreDraft();
  } finally {
    apiLoading.value = false;
  }
}

onMounted(loadApiData);
watch(() => [route.params.batchId, route.params.instanceId, route.query.source], loadApiData);
watch([activeScoreType, templateIndicators, instance], initScoreDraft);
</script>

<template>
  <PerformanceShell
    :description="batch && template ? `${batch.name} · ${template.name}` : '单人绩效考核工作台'"
    :title="employee ? `${employee.name}的绩效考核` : '考核详情'"
  >
    <template #actions>
      <Button @click="goBack">{{ isMyMode ? '返回我的绩效' : '返回批次' }}</Button>
      <Button v-if="instance?.status === 'indicatorConfirm'" @click="confirmIndicators">确认指标</Button>
      <Button
        v-if="canScore"
        :loading="submittingScore"
        type="primary"
        @click="submitScore"
      >
        {{ scoreActionLabel }}
      </Button>
      <Button v-if="instance?.status === 'hrReview'" type="primary" @click="approveReview">人事审核通过</Button>
      <Button v-if="instance?.status === 'pendingPublish'" type="primary" @click="publish">公示结果</Button>
      <Button
        v-if="instance?.resultVisible && !instance?.resultConfirmed && !instance?.resultObjection"
        type="primary"
        @click="confirmResult"
      >
        确认结果
      </Button>
    </template>

    <template v-if="batch && instance && employee">
      <div class="summary-grid">
        <Card><div class="metric-card"><span>被考核人</span><strong>{{ employee.name }}</strong></div></Card>
        <Card><div class="metric-card"><span>部门/岗位</span><strong>{{ employee.dept }} / {{ employee.post }}</strong></div></Card>
        <Card><div class="metric-card"><span>考核结果</span><strong>{{ instance.finalScore ?? '-' }}</strong></div></Card>
        <Card><div class="metric-card"><span>绩效等级</span><strong>{{ instance.grade ?? '-' }}</strong></div></Card>
      </div>

      <Card :loading="apiLoading">
        <div class="instance-head">
          <Space>
            <Tag :color="getInstanceMeta(instance.status).color">{{ getInstanceMeta(instance.status).label }}</Tag>
            <span>{{ instance.nodeName }}</span>
            <span>{{ instance.currentExecutor || '暂无待处理人' }}</span>
          </Space>
          <Progress :percent="scorePercent" />
        </div>
        <Steps :current="currentFlowIndex" :items="flowItems" size="small" />
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

      <Card v-if="canScore" class="node-score-card">
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
        <Input.TextArea
          v-model:value="nodeComment"
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
            <Tag>{{ group.dimensionType === 3 ? '加分项' : group.dimensionType === 4 ? '扣分项' : '量化指标 100%' }}</Tag>
          </Space>
        </template>
        <Table
          :columns="scoreColumns"
          :data-source="group.indicators"
          :loading="apiLoading"
          :pagination="false"
          :scroll="{ x: 1280 }"
          row-key="id"
          size="small"
        >
          <template #bodyCell="{ column, record }">
            <template v-if="column.dataIndex === 'standard'">
              <div class="multi-line">{{ record.standard || '-' }}</div>
            </template>
            <template v-else-if="column.dataIndex === 'weight'">
              <strong>{{ record.weight || '-' }}{{ record.weight ? '%' : '' }}</strong>
            </template>
            <template v-else-if="column.dataIndex === 'remark'">
              {{ record.tags?.join(' / ') || '-' }}
            </template>
            <template v-else-if="column.dataIndex === 'attachment'">
              <Space direction="vertical" size="small">
                <span>{{ getAttachmentCount(scoreAttachments[record.id] || instance.indicatorScores?.[record.id]?.attachmentIds) }} 个附件</span>
                <Upload
                  v-if="canScore"
                  :custom-request="(options) => handleIndicatorUpload(record.id, options)"
                  :show-upload-list="false"
                >
                  <Button size="small">上传附件</Button>
                </Upload>
              </Space>
            </template>
            <template v-else-if="String(column.dataIndex).startsWith('summary_')">
              {{ getSummaryScore(record, String(column.dataIndex)) }}
            </template>
            <template v-else-if="column.dataIndex === 'currentScore'">
              <InputNumber
                v-if="canScore"
                v-model:value="scoreInputs[record.id]"
                :max="120"
                :min="0"
                :precision="2"
                addon-after="分"
              />
              <span v-else>
                {{
                  instance.indicatorScores?.[record.id]?.final
                    ?? instance.indicatorScores?.[record.id]?.supervisor
                    ?? instance.indicatorScores?.[record.id]?.self
                    ?? '-'
                }}
              </span>
            </template>
            <template v-else-if="column.dataIndex === 'scoreComment'">
              <Input.TextArea
                v-if="canScore"
                v-model:value="scoreComments[record.id]"
                :placeholder="isScoreCommentRequired(record) ? '请输入评分说明(必填)' : '请输入评分说明(选填)'"
                :rows="3"
              />
              <span v-else>{{ instance.indicatorScores?.[record.id]?.scoreComment || '-' }}</span>
            </template>
          </template>
        </Table>
      </Card>

      <Card title="过程记录">
        <div class="record-list">
          <div>
            <strong>指标确认</strong>
            <span>{{ instance.progress >= 2 ? '被考核人已收到指标确认任务' : '未开始' }}</span>
          </div>
          <div>
            <strong>自评</strong>
            <span>{{ instance.selfScore !== undefined ? `${instance.selfScore} 分` : '待被考核人提交' }}</span>
          </div>
          <div>
            <strong>主管评分</strong>
            <span>{{ instance.supervisorScore !== undefined ? `${instance.supervisorScore} 分` : '待直接主管评分' }}</span>
          </div>
          <div>
            <strong>人事审核</strong>
            <Input.TextArea v-model:value="reviewRemark" :rows="3" placeholder="填写审核备注" />
          </div>
          <div>
            <strong>面谈记录</strong>
            <Space direction="vertical">
              <span>{{ instance.interviewRecords?.length ? `${instance.interviewRecords.length} 条记录` : '暂未记录面谈' }}</span>
              <Button size="small" @click="interviewModalOpen = true">记录面谈</Button>
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

    <Modal v-model:open="interviewModalOpen" title="记录面谈" @ok="saveInterviewRecord">
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
  color: #111827;
  font-size: 22px;
  font-weight: 650;
}

.score-summary-card strong {
  color: #111827;
  font-size: 28px;
  font-weight: 700;
}

.score-summary-card em {
  color: #64748b;
  font-style: normal;
}

.final-score-card {
  background: linear-gradient(135deg, #1677ff, #3b82f6);
}

.final-score-card span,
.final-score-card strong,
.final-score-card em {
  color: #fff;
}

.instance-head,
.node-score-head {
  display: grid;
  grid-template-columns: minmax(280px, 1fr) minmax(240px, 420px);
  gap: 24px;
  align-items: center;
  margin-bottom: 22px;
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
  color: #111827;
  font-size: 20px;
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

@media (max-width: 960px) {
  .summary-grid,
  .score-summary-grid,
  .instance-head,
  .node-score-head,
  .record-list > div {
    grid-template-columns: 1fr;
  }

  .node-score-head > div:last-child {
    justify-items: start;
  }
}
</style>
