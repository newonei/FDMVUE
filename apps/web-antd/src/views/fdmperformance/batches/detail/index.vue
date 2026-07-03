<script lang="ts" setup>
import type { TableColumnsType } from 'ant-design-vue';

import { computed, onMounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';

import {
  Button,
  Card,
  Empty,
  Input,
  Modal,
  Progress,
  Select,
  Space,
  Statistic,
  Table,
  Tag,
  message,
} from 'ant-design-vue';

import {
  confirmFdmPerformanceAssessmentIndicators,
  confirmFdmPerformanceAssessmentResult,
  getFdmPerformanceAssessmentBatch,
  getFdmPerformanceAssessmentChangeLogPage,
  getFdmPerformanceAssessmentInstancePage,
  publishFdmPerformanceAssessmentResult,
  recordFdmPerformanceAssessmentInterview,
  remindFdmPerformanceAssessmentTasks,
  startFdmPerformanceAssessmentScoring,
  submitFdmPerformanceAssessmentHrReview,
  submitFdmPerformanceAssessmentResultObjection,
  type FdmPerformanceAssessmentApi,
} from '#/api/fdmperformance/assessment';
import { getFdmPerformanceTemplate } from '#/api/fdmperformance/template';

import PerformanceShell from '../../shared/PerformanceShell.vue';
import {
  mapApiBatch,
  mapApiInstance,
  mapApiTemplate,
} from '../../shared/api-adapter';
import {
  type AssessmentBatch,
  type AssessmentInstance,
  type AssessmentTemplate,
  type Employee,
  batchStatusMetaMap,
  instanceStatusMetaMap,
} from '../../shared/model';
import { usePerformancePath } from '../../shared/route';

defineOptions({ name: 'FdmPerformanceBatchDetail' });

const route = useRoute();
const router = useRouter();
const { performancePath } = usePerformancePath();

const activeTab = ref('people');
const keyword = ref('');
const statusFilter = ref<string>();
const selectedRowKeys = ref<number[]>([]);
const apiLoading = ref(false);
const reminding = ref(false);
const apiBatch = ref<AssessmentBatch>();
const apiTemplateMap = ref(new Map<number, AssessmentTemplate>());
const apiRows = ref<(AssessmentInstance & { employee?: Employee })[]>([]);
const interviewModalOpen = ref(false);
const interviewInstanceId = ref<number>();
const interviewConclusion = ref('已完成绩效沟通，后续动作同步到行动计划');
const objectionModalOpen = ref(false);
const objectionInstanceId = ref<number>();
const objectionText = ref('对评分结果有异议，需要绩效管理员复核评分依据和等级系数。');

const tabs = [
  { key: 'people', label: '考核人员' },
  { key: 'interview', label: '面谈' },
  { key: 'confirm', label: '结果确认' },
  { key: 'grade', label: '等级和系数' },
  { key: 'analysis', label: '考核分析' },
];

const batch = computed(() => apiBatch.value);
const rows = computed(() => apiRows.value);
const templateDescription = computed(() => {
  const templates = Array.from(apiTemplateMap.value.values());
  if (templates.length === 0) return '查看考核执行详情';
  if (templates.length === 1) return `考评表：${templates[0]!.name}`;
  return `考评表：${templates[0]!.name} 等 ${templates.length} 张`;
});
const filteredRows = computed(() => {
  const text = keyword.value.trim();
  return rows.value.filter((item) => {
    const textMatched =
      !text ||
      [item.employee?.name, item.employee?.dept, item.employee?.post, item.nodeName]
        .filter(Boolean)
        .some((value) => value!.includes(text));
    const statusMatched = !statusFilter.value || item.status === statusFilter.value;
    return textMatched && statusMatched;
  });
});
const completed = computed(() => rows.value.filter((item) => isResultProcessed(item)).length);
const pendingPublishRows = computed(() => filteredRows.value.filter((item) => item.status === 'pendingPublish'));
const pendingReviewRows = computed(() => filteredRows.value.filter((item) => item.status === 'hrReview'));
const pendingConfirmRows = computed(() =>
  filteredRows.value.filter((item) => item.resultVisible && !item.resultConfirmed),
);
const gradeRows = computed(() =>
  filteredRows.value.map((item) => ({
    ...item,
    coefficient: item.grade ? (resolvePerformanceCoefficient(item.grade) ?? '-') : '-',
    visible: item.resultVisible ? '已公示' : item.status === 'pendingPublish' ? '待公示' : '处理中',
  })),
);
const analysisRows = computed(() => {
  const grouped = new Map<string, typeof rows.value>();
  filteredRows.value.forEach((item) => {
    const dept = item.employee?.dept || '未分组';
    grouped.set(dept, [...(grouped.get(dept) || []), item]);
  });
  return Array.from(grouped.entries()).map(([dept, items]) => {
    const total = Math.max(items.length, 1);
    return {
      confirmRate: Math.round((items.filter((item) => item.progress >= 2).length / total) * 100),
      count: items.length,
      dept,
      resultRate: Math.round((items.filter((item) => isResultProcessed(item)).length / total) * 100),
      scoreRate: Math.round(
        (items.filter((item) => item.selfScore !== undefined || item.supervisorScore !== undefined || item.finalScore !== undefined).length / total) * 100,
      ),
    };
  });
});

const peopleColumns: TableColumnsType = [
  { dataIndex: 'employee', title: '被考核人', width: 180 },
  { dataIndex: 'dept', title: '部门', width: 160 },
  { dataIndex: 'template', title: '考评表', width: 260 },
  { dataIndex: 'progress', title: '考核进度', width: 120 },
  { dataIndex: 'nodeName', title: '当前流程', width: 160 },
  { dataIndex: 'currentExecutor', title: '当前执行人', width: 140 },
  { dataIndex: 'stayTime', title: '停留时间', width: 120 },
  { dataIndex: 'result', title: '考核结果', width: 120 },
  { dataIndex: 'grade', title: '绩效等级', width: 100 },
  { dataIndex: 'action', fixed: 'right', title: '操作', width: 240 },
];
const interviewColumns: TableColumnsType = [
  { dataIndex: 'employee', title: '被考核人', width: 180 },
  { dataIndex: 'dept', title: '部门', width: 160 },
  { dataIndex: 'status', title: '面谈状态', width: 140 },
  { dataIndex: 'nodeName', title: '当前流程', width: 160 },
  { dataIndex: 'currentExecutor', title: '当前执行人', width: 140 },
  { dataIndex: 'action', fixed: 'right', title: '操作', width: 220 },
];
const confirmColumns: TableColumnsType = [
  { dataIndex: 'employee', title: '被考核人', width: 180 },
  { dataIndex: 'dept', title: '部门', width: 160 },
  { dataIndex: 'status', title: '确认状态', width: 140 },
  { dataIndex: 'finalScore', title: '考核结果', width: 120 },
  { dataIndex: 'grade', title: '绩效等级', width: 120 },
  { dataIndex: 'action', fixed: 'right', title: '操作', width: 220 },
];
const gradeColumns: TableColumnsType = [
  { dataIndex: 'employee', title: '被考核人', width: 180 },
  { dataIndex: 'dept', title: '部门', width: 160 },
  { dataIndex: 'finalScore', title: '考核结果', width: 120 },
  { dataIndex: 'grade', title: '绩效等级', width: 120 },
  { dataIndex: 'coefficient', title: '绩效系数', width: 120 },
  { dataIndex: 'visible', title: '结果状态', width: 140 },
];
const analysisColumns: TableColumnsType = [
  { dataIndex: 'dept', title: '部门信息', width: 180 },
  { dataIndex: 'count', title: '参与人数', width: 120 },
  { dataIndex: 'confirmRate', title: '指标确认', width: 240 },
  { dataIndex: 'scoreRate', title: '评分完成', width: 240 },
  { dataIndex: 'resultRate', title: '结果处理', width: 240 },
];

const statusOptions = Object.entries(instanceStatusMetaMap).map(([value, meta]) => ({
  label: meta.label,
  value,
}));
const rowSelection = computed(() => ({
  selectedRowKeys: selectedRowKeys.value,
  onChange: (keys: (number | string)[]) => {
    selectedRowKeys.value = keys.map(Number);
  },
}));

function isResultProcessed(item: AssessmentInstance) {
  return item.resultVisible || item.status === 'finished';
}

function getInstanceMeta(status: unknown) {
  return instanceStatusMetaMap[status as keyof typeof instanceStatusMetaMap] || { color: 'default', label: '未知' };
}

function getBatchMeta(status: unknown) {
  return batchStatusMetaMap[status as keyof typeof batchStatusMetaMap] || { color: 'default', label: '未知' };
}

function getTemplateName(templateId?: number) {
  return templateId ? apiTemplateMap.value.get(templateId)?.name || '-' : '-';
}

function resolvePerformanceCoefficient(grade?: string) {
  if (grade === '卓越') return 2;
  if (grade === '优秀') return 1.5;
  if (grade === '平均') return 1;
  if (grade === '及格') return 0.8;
  if (grade === '不及格') return 0;
  return undefined;
}

function openScore(instanceId: number, type: 'self' | 'supervisor') {
  if (!batch.value) return;
  router.push({
    path: performancePath(`/batches/${batch.value.id}/instances/${instanceId}`),
    query: { scoreType: type },
  });
}

async function confirmIndicators() {
  if (!batch.value) return;
  const targets = rows.value.filter((item) => item.status === 'indicatorConfirm');
  await Promise.all(targets.map((item) => confirmFdmPerformanceAssessmentIndicators(item.id)));
  await loadApiData();
  message.success('指标已确认，进入执行中');
}

async function startScoring() {
  if (!batch.value) return;
  await startFdmPerformanceAssessmentScoring(batch.value.id);
  await loadApiData();
  message.success('已发起评分');
}

async function approveReview(instanceId: number) {
  await submitFdmPerformanceAssessmentHrReview({ instanceId });
  await loadApiData();
  message.success('人事审核已通过');
}

async function approveSelected() {
  const ids = selectedRowKeys.value.length
    ? selectedRowKeys.value
    : pendingReviewRows.value.map((item) => item.id);
  await Promise.all(
    ids
      .filter((id) => rows.value.find((item) => item.id === id)?.status === 'hrReview')
      .map((id) => submitFdmPerformanceAssessmentHrReview({ instanceId: id })),
  );
  await loadApiData();
  selectedRowKeys.value = [];
  message.success('已批量审核可处理人员');
}

async function publishSelected(targetIds?: number[]) {
  if (!batch.value) return;
  const sourceIds = targetIds?.length
    ? targetIds
    : selectedRowKeys.value.length ? selectedRowKeys.value : pendingPublishRows.value.map((item) => item.id);
  const ids = sourceIds.filter((id) => rows.value.find((item) => item.id === id)?.status === 'pendingPublish');
  if (ids.length === 0) {
    message.info('暂无可公示的已审核人员');
    return;
  }
  await publishFdmPerformanceAssessmentResult(batch.value.id, ids);
  await loadApiData();
  selectedRowKeys.value = [];
  message.success('已公示选中人员结果');
}

async function remindSelected(targetIds?: number[]) {
  if (!batch.value) return;
  const sourceIds = targetIds?.length
    ? targetIds
    : selectedRowKeys.value.length ? selectedRowKeys.value : filteredRows.value.map((item) => item.id);
  const ids = [...new Set(sourceIds.filter((id) => rows.value.some((item) => item.id === id)))];
  if (ids.length === 0) {
    message.info('暂无可催办人员');
    return;
  }
  reminding.value = true;
  try {
    const count = await remindFdmPerformanceAssessmentTasks({
      batchId: batch.value.id,
      instanceIds: ids,
      message: '绩效待办催办',
    });
    if (count === 0) {
      message.info('当前暂无待催办任务');
      return;
    }
    message.success(`已发送 ${count} 条 DING 催办`);
  } finally {
    reminding.value = false;
  }
}

function openInterviewRecord(instanceId: number) {
  interviewInstanceId.value = instanceId;
  interviewConclusion.value = '已完成绩效沟通，后续动作同步到行动计划';
  interviewModalOpen.value = true;
}

async function saveInterviewRecord() {
  if (!interviewInstanceId.value) return;
  await recordFdmPerformanceAssessmentInterview({
    conclusion: interviewConclusion.value,
    instanceId: interviewInstanceId.value,
  });
  await loadApiData();
  message.success('面谈记录已保存');
  interviewModalOpen.value = false;
}

function openObjection(instanceId: number) {
  objectionInstanceId.value = instanceId;
  objectionText.value = '对评分结果有异议，需要绩效管理员复核评分依据和等级系数。';
  objectionModalOpen.value = true;
}

async function saveObjection() {
  if (!objectionInstanceId.value) return;
  await submitFdmPerformanceAssessmentResultObjection({
    instanceId: objectionInstanceId.value,
    reason: objectionText.value,
  });
  await loadApiData();
  objectionModalOpen.value = false;
  message.success('已提交结果异议');
}

async function confirmResult(instanceId: number) {
  await confirmFdmPerformanceAssessmentResult(instanceId);
  await loadApiData();
  message.success('结果已确认');
}

function canStartScoring() {
  return rows.value.some((item) => ['executing', 'indicatorConfirm'].includes(item.status));
}

function canConfirmIndicators() {
  return rows.value.some((item) => item.status === 'indicatorConfirm');
}

async function loadApiData() {
  const batchId = Number(route.params.id);
  if (!batchId) return;
  apiLoading.value = true;
  try {
    const [batchResp, instancePage, processLogPage] = await Promise.all([
      getFdmPerformanceAssessmentBatch(batchId),
      getFdmPerformanceAssessmentInstancePage({
        batchId,
        pageNo: 1,
        pageSize: 100,
      }),
      getFdmPerformanceAssessmentChangeLogPage({
        batchId,
        pageNo: 1,
        pageSize: -1,
      }),
    ]);
    const processLogMap = buildProcessLogMap(processLogPage.list || []);
    apiRows.value = instancePage.list.map((item) => ({
      ...mapApiInstance({
        ...item,
        ...(processLogMap.get(item.id) || {}),
      }),
      employee: {
        dept: item.deptName || '-',
        id: Number(item.userId || 0),
        name: item.userName || `用户${item.userId}`,
        post: item.postName || '-',
      },
    }));
    apiBatch.value = mapApiBatch(batchResp, apiRows.value);
    const templateIds = [
      ...new Set(
        [...(batchResp.templateIds || []), ...instancePage.list.map((item) => Number(item.templateId || 0))]
          .map(Number)
          .filter((item) => Number.isFinite(item) && item > 0),
      ),
    ];
    if (templateIds.length) {
      const templateResponses = await Promise.all(templateIds.map((templateId) => getFdmPerformanceTemplate(templateId)));
      apiTemplateMap.value = new Map(templateResponses.map((item) => [Number(item.id), mapApiTemplate(item)]));
    } else {
      apiTemplateMap.value = new Map();
    }
  } finally {
    apiLoading.value = false;
  }
}

function buildProcessLogMap(logs: FdmPerformanceAssessmentApi.ChangeLog[]) {
  const result = new Map<
    number,
    Pick<FdmPerformanceAssessmentApi.Instance, 'interviewRecords' | 'resultObjections'>
  >();
  logs.forEach((log) => {
    if (!log.instanceId) return;
    const current = result.get(log.instanceId) || {};
    if (log.operationType === 'INTERVIEW') {
      current.interviewRecords = [...(current.interviewRecords || []), log];
    }
    if (log.operationType === 'RESULT_OBJECTION') {
      current.resultObjections = [...(current.resultObjections || []), log];
    }
    result.set(log.instanceId, current);
  });
  return result;
}

onMounted(loadApiData);
watch(() => route.params.id, loadApiData);
</script>

<template>
  <PerformanceShell
    :description="templateDescription"
    :title="batch?.name || '考核详情'"
  >
    <template #actions>
      <Button @click="router.push(performancePath('/batches'))">返回列表</Button>
      <Button :loading="reminding" @click="() => remindSelected()">DING催办</Button>
      <Button :disabled="!canConfirmIndicators()" @click="confirmIndicators">确认指标</Button>
      <Button :disabled="!canStartScoring()" @click="startScoring">发起评分</Button>
      <Button :disabled="pendingReviewRows.length === 0" @click="approveSelected">批量审核</Button>
      <Button :disabled="pendingPublishRows.length === 0" type="primary" @click="() => publishSelected()">公示结果</Button>
    </template>

    <template v-if="batch">
      <div class="summary-grid">
        <Card><Statistic :value="rows.length" title="参与人员" /></Card>
        <Card><Statistic :value="rows.filter((item) => item.status === 'selfScore').length" title="待自评" /></Card>
        <Card><Statistic :value="rows.filter((item) => item.status === 'supervisorScore').length" title="待主管评分" /></Card>
        <Card><Statistic :value="completed" title="结果已公示" /></Card>
      </div>

      <Card>
        <div class="batch-title">
          <Space>
            <strong>{{ batch.name }}</strong>
            <Tag :color="getBatchMeta(batch.status).color">{{ getBatchMeta(batch.status).label }}</Tag>
          </Space>
          <Progress :percent="Math.round((completed / Math.max(rows.length, 1)) * 100)" />
        </div>

        <div class="tab-row">
          <button
            v-for="item in tabs"
            :key="item.key"
            :class="{ active: activeTab === item.key }"
            type="button"
            @click="activeTab = item.key"
          >
            {{ item.label }}
          </button>
        </div>

        <div class="filter-row">
          <Input v-model:value="keyword" allow-clear placeholder="搜索被考核人、部门、岗位" />
          <Select
            v-model:value="statusFilter"
            allow-clear
            :options="statusOptions"
            placeholder="筛选状态"
          />
          <span>已选 {{ selectedRowKeys.length }} 人</span>
          <span>待公示 {{ pendingPublishRows.length }} 人，待确认 {{ pendingConfirmRows.length }} 人</span>
        </div>

        <Table
          v-if="activeTab === 'people'"
          :columns="peopleColumns"
          :data-source="filteredRows"
          :loading="apiLoading"
          :pagination="{ pageSize: 10 }"
          :row-selection="rowSelection"
          row-key="id"
        >
          <template #bodyCell="{ column, record }">
            <template v-if="column.dataIndex === 'employee'">{{ record.employee?.name }}</template>
            <template v-else-if="column.dataIndex === 'dept'">{{ record.employee?.dept }}</template>
            <template v-else-if="column.dataIndex === 'template'">{{ getTemplateName(record.templateId || batch.templateId) }}</template>
            <template v-else-if="column.dataIndex === 'progress'">{{ record.progress }}/8</template>
            <template v-else-if="column.dataIndex === 'nodeName'">
              <Tag :color="getInstanceMeta(record.status).color">{{ record.nodeName }}</Tag>
            </template>
            <template v-else-if="column.dataIndex === 'result'">{{ record.finalScore ?? '-' }}</template>
            <template v-else-if="column.dataIndex === 'grade'">{{ record.grade ?? '-' }}</template>
            <template v-else-if="column.dataIndex === 'action'">
              <Space>
                <Button v-if="record.status === 'selfScore'" size="small" type="link" @click="openScore(record.id, 'self')">自评</Button>
                <Button v-if="record.status === 'supervisorScore'" size="small" type="link" @click="openScore(record.id, 'supervisor')">主管评分</Button>
                <Button v-if="record.status === 'hrReview'" size="small" type="link" @click="approveReview(record.id)">审核通过</Button>
                <Button v-if="record.status === 'pendingPublish'" size="small" type="link" @click="publishSelected([record.id])">公示结果</Button>
                <Button v-if="record.resultVisible && !record.resultConfirmed" size="small" type="link" @click="confirmResult(record.id)">确认结果</Button>
                <Button size="small" type="link" @click="router.push(performancePath(`/batches/${batch.id}/instances/${record.id}`))">查看</Button>
              </Space>
            </template>
          </template>
        </Table>

        <Table
          v-else-if="activeTab === 'interview'"
          :columns="interviewColumns"
          :data-source="filteredRows"
          :loading="apiLoading"
          :pagination="{ pageSize: 10 }"
          :row-selection="rowSelection"
          row-key="id"
        >
          <template #bodyCell="{ column, record }">
            <template v-if="column.dataIndex === 'employee'">{{ record.employee?.name }}</template>
            <template v-else-if="column.dataIndex === 'dept'">{{ record.employee?.dept }}</template>
            <template v-else-if="column.dataIndex === 'status'">
              <Tag :color="record.interviewRecords?.length ? 'green' : 'default'">
                {{ record.interviewRecords?.length ? `已面谈 ${record.interviewRecords.length} 次` : '未面谈' }}
              </Tag>
            </template>
            <template v-else-if="column.dataIndex === 'action'">
              <Space>
                <Button :loading="reminding" size="small" type="link" @click="() => remindSelected([record.id])">DING催办</Button>
                <Button size="small" type="link" @click="openInterviewRecord(record.id)">记录面谈</Button>
                <Button size="small" type="link" @click="router.push(performancePath(`/batches/${batch.id}/instances/${record.id}`))">查看</Button>
              </Space>
            </template>
          </template>
        </Table>

        <Table
          v-else-if="activeTab === 'confirm'"
          :columns="confirmColumns"
          :data-source="filteredRows"
          :loading="apiLoading"
          :pagination="{ pageSize: 10 }"
          :row-selection="rowSelection"
          row-key="id"
        >
          <template #bodyCell="{ column, record }">
            <template v-if="column.dataIndex === 'employee'">{{ record.employee?.name }}</template>
            <template v-else-if="column.dataIndex === 'dept'">{{ record.employee?.dept }}</template>
            <template v-else-if="column.dataIndex === 'status'">
              <Tag :color="record.resultObjection ? 'red' : record.resultConfirmed ? 'green' : record.resultVisible ? 'blue' : record.status === 'hrReview' ? 'orange' : 'default'">
                {{ record.resultObjection ? '结果异议' : record.resultConfirmed ? '已确认' : record.resultVisible ? '待确认' : record.status === 'hrReview' ? '待审核' : '处理中' }}
              </Tag>
            </template>
            <template v-else-if="column.dataIndex === 'finalScore'">{{ record.finalScore ?? '-' }}</template>
            <template v-else-if="column.dataIndex === 'grade'">{{ record.grade ?? '-' }}</template>
            <template v-else-if="column.dataIndex === 'action'">
              <Space>
                <Button v-if="record.status === 'hrReview'" size="small" type="link" @click="approveReview(record.id)">审核通过</Button>
                <Button v-if="record.status === 'pendingPublish'" size="small" type="link" @click="publishSelected([record.id])">公示结果</Button>
                <Button v-if="record.resultVisible && !record.resultConfirmed && !record.resultObjection" size="small" type="link" @click="confirmResult(record.id)">确认结果</Button>
                <Button v-if="record.resultVisible && !record.resultConfirmed && !record.resultObjection" danger size="small" type="link" @click="openObjection(record.id)">提交异议</Button>
                <Button size="small" type="link" @click="router.push(performancePath(`/batches/${batch.id}/instances/${record.id}`))">查看</Button>
              </Space>
            </template>
          </template>
        </Table>

        <div v-else-if="activeTab === 'grade'" class="grade-section">
          <div class="grade-grid">
            <div><strong>卓越</strong><span>111-120 分 / 系数 2.00</span></div>
            <div><strong>优秀</strong><span>101-110 分 / 系数 1.50</span></div>
            <div><strong>平均</strong><span>91-100 分 / 系数 1.00</span></div>
            <div><strong>及格</strong><span>81-90 分 / 系数 0.80</span></div>
            <div><strong>不及格</strong><span>0-80 分 / 系数 0</span></div>
          </div>
          <Table
            :columns="gradeColumns"
            :data-source="gradeRows"
            :pagination="{ pageSize: 10 }"
            :row-selection="rowSelection"
            row-key="id"
          >
            <template #bodyCell="{ column, record }">
              <template v-if="column.dataIndex === 'employee'">{{ record.employee?.name }}</template>
              <template v-else-if="column.dataIndex === 'dept'">{{ record.employee?.dept }}</template>
              <template v-else-if="column.dataIndex === 'finalScore'">{{ record.finalScore ?? '-' }}</template>
              <template v-else-if="column.dataIndex === 'grade'">{{ record.grade ?? '-' }}</template>
              <template v-else-if="column.dataIndex === 'visible'">
                <Tag :color="record.resultVisible ? 'green' : 'default'">{{ record.visible }}</Tag>
              </template>
            </template>
          </Table>
        </div>

        <Table
          v-else-if="activeTab === 'analysis'"
          :columns="analysisColumns"
          :data-source="analysisRows"
          :pagination="false"
          row-key="dept"
        >
          <template #bodyCell="{ column, record }">
            <template v-if="column.dataIndex === 'confirmRate'">
              <Progress :percent="record.confirmRate" size="small" />
            </template>
            <template v-else-if="column.dataIndex === 'scoreRate'">
              <Progress :percent="record.scoreRate" size="small" />
            </template>
            <template v-else-if="column.dataIndex === 'resultRate'">
              <Progress :percent="record.resultRate" size="small" />
            </template>
          </template>
        </Table>

        <Empty v-else description="当前暂无数据" />
      </Card>
    </template>
    <Empty v-else description="未找到考核批次" />

    <Modal v-model:open="interviewModalOpen" title="记录面谈" @ok="saveInterviewRecord">
      <div class="score-form">
        <span>面谈结论</span>
        <Input.TextArea v-model:value="interviewConclusion" :rows="4" />
      </div>
    </Modal>

    <Modal v-model:open="objectionModalOpen" title="提交结果异议" @ok="saveObjection">
      <div class="score-form">
        <span>异议说明</span>
        <Input.TextArea v-model:value="objectionText" :rows="4" />
      </div>
    </Modal>
  </PerformanceShell>
</template>

<style scoped>
.summary-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 14px;
}

.batch-title {
  display: grid;
  grid-template-columns: minmax(260px, 1fr) minmax(260px, 420px);
  gap: 24px;
  align-items: center;
  margin-bottom: 12px;
}

.tab-row {
  display: flex;
  flex-wrap: wrap;
  gap: 22px;
  margin-bottom: 16px;
  border-bottom: 1px solid #edf0f4;
}

.tab-row button {
  position: relative;
  min-height: 42px;
  padding: 0;
  color: #374151;
  background: transparent;
  border: 0;
  cursor: pointer;
}

.tab-row button.active {
  color: #1677ff;
  font-weight: 600;
}

.tab-row button.active::after {
  position: absolute;
  right: 0;
  bottom: -1px;
  left: 0;
  height: 2px;
  background: #1677ff;
  content: '';
}

.filter-row {
  display: grid;
  grid-template-columns: minmax(220px, 320px) minmax(160px, 220px) auto auto;
  gap: 12px;
  align-items: center;
  margin-bottom: 14px;
}

.filter-row span {
  color: #64748b;
}

.grade-section {
  display: grid;
  gap: 14px;
}

.grade-grid {
  display: grid;
  grid-template-columns: repeat(5, minmax(0, 1fr));
  gap: 12px;
  padding: 24px 0;
}

.grade-grid div {
  display: grid;
  gap: 6px;
  padding: 18px;
  text-align: center;
  background: #f8fafc;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
}

.score-form {
  display: grid;
  gap: 10px;
}

@media (max-width: 960px) {
  .summary-grid,
  .batch-title,
  .filter-row,
  .grade-grid {
    grid-template-columns: 1fr;
  }
}
</style>
