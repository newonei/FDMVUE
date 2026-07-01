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
  message,
} from 'ant-design-vue';

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
  instanceStatusMetaMap,
} from '../../shared/model';
import { usePerformancePath } from '../../shared/route';

defineOptions({ name: 'FdmPerformanceInstanceDetail' });

const route = useRoute();
const router = useRouter();
const { performancePath } = usePerformancePath();

const scoreModalOpen = ref(false);
const scoreType = ref<'self' | 'supervisor'>('self');
const scoreTaskId = ref<number>();
const scoreInputs = reactive<Record<number, number>>({});
const reviewRemark = ref('');
const interviewModalOpen = ref(false);
const interviewConclusion = ref('已完成绩效沟通，后续动作同步到行动计划');
const apiLoading = ref(false);
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
const flowStages = computed(() => {
  if (instance.value?.flowSnapshot?.length) {
    return instance.value.flowSnapshot;
  }
  return extractFlowStagesFromSimpleNode(template.value?.flowNode);
});
const currentFlowIndex = computed(() =>
  Math.min(Math.max((instance.value?.progress || 1) - 1, 0), Math.max(flowStages.value.length - 1, 0)),
);
const scorePercent = computed(() =>
  Math.round(((currentFlowIndex.value + 1) / Math.max(flowStages.value.length, 1)) * 100),
);

const scoreColumns: TableColumnsType = [
  { dataIndex: 'name', title: '指标名称', width: 220 },
  { dataIndex: 'dimension', title: '指标类型', width: 120 },
  { dataIndex: 'standard', title: '考核标准' },
  { dataIndex: 'weight', title: '权重', width: 100 },
  { dataIndex: 'scoreMode', title: '评分方式', width: 120 },
  { dataIndex: 'score', title: '当前分', width: 120 },
];

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

function getInstanceMeta(status: unknown) {
  return instanceStatusMetaMap[status as keyof typeof instanceStatusMetaMap] || { color: 'default', label: '未知' };
}

function getScoreTaskType(type: 'self' | 'supervisor') {
  return type === 'self' ? 2 : 3;
}

function getPendingScoreTask(type: 'self' | 'supervisor') {
  const instanceId = instance.value?.id;
  const taskType = getScoreTaskType(type);
  return apiTasks.value.find((task) => task.status === 0 && task.instanceId === instanceId && task.taskType === taskType);
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

function openScore(type: 'self' | 'supervisor') {
  scoreType.value = type;
  scoreTaskId.value = getPendingScoreTask(type)?.id;
  Object.keys(scoreInputs).forEach((key) => delete scoreInputs[Number(key)]);
  templateIndicators.value.forEach((indicator) => {
    scoreInputs[indicator.id] =
      instance.value?.indicatorScores?.[indicator.id]?.[type] ??
      instance.value?.indicatorScores?.[indicator.id]?.final ??
      (type === 'self' ? 90 : 92);
  });
  scoreModalOpen.value = true;
}

async function submitScore() {
  if (!instance.value) return;
  const request = isMyMode.value ? submitMyFdmPerformanceAssessmentScore : submitFdmPerformanceAssessmentScore;
  await request({
    instanceId: instance.value.id,
    items: buildApiScoreItems(templateIndicators.value, { ...scoreInputs }),
    scorerRoleType: scoreType.value === 'self' ? 1 : 2,
    taskId: scoreTaskId.value,
  });
  await loadApiData();
  scoreModalOpen.value = false;
  message.success('评分已提交');
}

async function approveReview() {
  if (!instance.value) return;
  await submitFdmPerformanceAssessmentHrReview({
    comment: reviewRemark.value,
    instanceId: instance.value.id,
  });
  await loadApiData();
  message.success(reviewRemark.value ? '审核已通过并记录备注' : '审核已通过');
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
  } finally {
    apiLoading.value = false;
  }
}

onMounted(loadApiData);
watch(() => [route.params.batchId, route.params.instanceId], loadApiData);
</script>

<template>
  <PerformanceShell
    :description="batch && template ? `${batch.name} · ${template.name}` : '单人考核详情'"
    :title="employee ? `${employee.name}的绩效考核` : '考核详情'"
  >
    <template #actions>
      <Button @click="goBack">{{ isMyMode ? '返回我的绩效' : '返回批次' }}</Button>
      <Button v-if="instance?.status === 'indicatorConfirm'" @click="confirmIndicators">确认指标</Button>
      <Button v-if="instance?.status === 'selfScore'" type="primary" @click="openScore('self')">提交自评</Button>
      <Button v-if="instance?.status === 'supervisorScore'" type="primary" @click="openScore('supervisor')">主管评分</Button>
      <Button v-if="instance?.status === 'hrReview'" type="primary" @click="approveReview">人事审核通过</Button>
      <Button v-if="instance?.status === 'pendingPublish'" type="primary" @click="publish">公示结果</Button>
      <Button v-if="instance?.resultVisible && !instance?.resultConfirmed && !instance?.resultObjection" type="primary" @click="confirmResult">确认结果</Button>
    </template>

    <template v-if="batch && instance && employee">
      <div class="summary-grid">
        <Card><div class="metric-card"><span>部门</span><strong>{{ employee.dept }}</strong></div></Card>
        <Card><div class="metric-card"><span>岗位</span><strong>{{ employee.post }}</strong></div></Card>
        <Card><div class="metric-card"><span>考核结果</span><strong>{{ instance.finalScore ?? '-' }}</strong></div></Card>
        <Card><div class="metric-card"><span>绩效等级</span><strong>{{ instance.grade ?? '-' }}</strong></div></Card>
      </div>

      <Card :loading="apiLoading">
        <div class="instance-head">
          <Space>
            <Tag :color="getInstanceMeta(instance.status).color">{{ getInstanceMeta(instance.status).label }}</Tag>
            <span>{{ instance.nodeName }}</span>
            <span>{{ instance.currentExecutor || '无待处理人' }}</span>
          </Space>
          <Progress :percent="scorePercent" />
        </div>
        <Steps :current="currentFlowIndex" :items="flowItems" size="small" />
      </Card>

      <Card title="考核指标与评分">
        <Table
          :columns="scoreColumns"
          :data-source="templateIndicators"
          :loading="apiLoading"
          :pagination="false"
          row-key="id"
          size="small"
        >
          <template #bodyCell="{ column, record }">
            <template v-if="column.dataIndex === 'weight'">
              {{ record.weight }}%
            </template>
            <template v-else-if="column.dataIndex === 'score'">
              {{
                instance.indicatorScores?.[record.id]?.final
                  ?? instance.indicatorScores?.[record.id]?.supervisor
                  ?? instance.indicatorScores?.[record.id]?.self
                  ?? '-'
              }}
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
            <span>{{ instance.selfScore ? `${instance.selfScore} 分，工作情况已提交` : '待被考核人提交' }}</span>
          </div>
          <div>
            <strong>主管评分</strong>
            <span>{{ instance.supervisorScore ? `${instance.supervisorScore} 分，主管点评已提交` : '待直接主管评分' }}</span>
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

    <Modal v-model:open="scoreModalOpen" :title="scoreType === 'self' ? '提交自评' : '提交主管评分'" width="760px" @ok="submitScore">
      <div class="score-list">
        <div v-for="indicator in templateIndicators" :key="indicator.id" class="score-row">
          <div>
            <strong>{{ indicator.name }}</strong>
            <span>{{ indicator.dimension }} · 权重 {{ indicator.weight }}%</span>
          </div>
          <InputNumber v-model:value="scoreInputs[indicator.id]" :max="120" :min="0" addon-after="分" />
        </div>
      </div>
    </Modal>

    <Modal v-model:open="interviewModalOpen" title="记录面谈" @ok="saveInterviewRecord">
      <Input.TextArea v-model:value="interviewConclusion" :rows="4" />
    </Modal>
  </PerformanceShell>
</template>

<style scoped>
.summary-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 14px;
}

.metric-card {
  display: grid;
  gap: 6px;
}

.metric-card span {
  color: #64748b;
}

.metric-card strong {
  color: #111827;
  font-size: 22px;
  font-weight: 650;
}

.instance-head {
  display: grid;
  grid-template-columns: minmax(280px, 1fr) minmax(240px, 420px);
  gap: 24px;
  align-items: center;
  margin-bottom: 22px;
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

.record-list span {
  color: #64748b;
}

.score-list {
  display: grid;
  gap: 12px;
}

.score-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 180px;
  gap: 16px;
  align-items: center;
  padding: 12px;
  background: #f8fafc;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
}

.score-row > div {
  display: grid;
  gap: 4px;
}

.score-row span {
  color: #64748b;
  font-size: 12px;
}

@media (max-width: 960px) {
  .summary-grid,
  .instance-head,
  .record-list > div,
  .score-row {
    grid-template-columns: 1fr;
  }
}
</style>
