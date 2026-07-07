<script lang="ts" setup>
import type { TableColumnsType } from 'ant-design-vue';

import type {
  AssessmentBatch,
  AssessmentInstance,
  AssessmentTemplate,
  Employee,
} from '../../shared/model';

import type { FdmPerformanceAssessmentApi } from '#/api/fdmperformance/assessment';
import type { SystemUserApi } from '#/api/system/user';

import { computed, onMounted, reactive, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';

import { useAccess } from '@vben/access';

import {
  Button,
  Card,
  DatePicker,
  Empty,
  Input,
  message,
  Modal,
  Progress,
  Select,
  Space,
  Statistic,
  Table,
  Tag,
} from 'ant-design-vue';

import {
  adjustFdmPerformanceAssessmentGrade,
  confirmFdmPerformanceAssessmentIndicators,
  confirmFdmPerformanceAssessmentResult,
  deleteFdmPerformanceAssessmentInstance,
  getFdmPerformanceAssessmentBatch,
  getFdmPerformanceAssessmentChangeLogPage,
  getFdmPerformanceAssessmentInstancePage,
  getFdmPerformanceAssessmentTaskPage,
  jumpFdmPerformanceAssessmentTask,
  publishFdmPerformanceAssessmentResult,
  recordFdmPerformanceAssessmentInterview,
  remindFdmPerformanceAssessmentTasks,
  skipFdmPerformanceAssessmentTask,
  startFdmPerformanceAssessmentScoring,
  submitFdmPerformanceAssessmentHrReview,
  submitFdmPerformanceAssessmentResultObjection,
  transferFdmPerformanceAssessmentTasks,
} from '#/api/fdmperformance/assessment';
import { getFdmPerformanceTemplate } from '#/api/fdmperformance/template';
import { getSimpleUserList } from '#/api/system/user';

import {
  mapApiBatch,
  mapApiInstance,
  mapApiTemplate,
} from '../../shared/api-adapter';
import { batchStatusMetaMap, instanceStatusMetaMap } from '../../shared/model';
import PerformanceShell from '../../shared/PerformanceShell.vue';
import { usePerformancePath } from '../../shared/route';

defineOptions({ name: 'FdmPerformanceBatchDetail' });

type ManagedAssessmentInstance = AssessmentInstance & { employee?: Employee };

const route = useRoute();
const router = useRouter();
const { hasAccessByCodes } = useAccess();
const { performancePath } = usePerformancePath();

const activeTab = ref('people');
const keyword = ref('');
const statusFilter = ref<string>();
const selectedRowKeys = ref<number[]>([]);
const apiLoading = ref(false);
const reminding = ref(false);
const apiBatch = ref<AssessmentBatch>();
const apiTemplateMap = ref(new Map<number, AssessmentTemplate>());
const apiRows = ref<ManagedAssessmentInstance[]>([]);
const simpleUsers = ref<SystemUserApi.User[]>([]);
const interviewModalOpen = ref(false);
const interviewInstanceId = ref<number>();
const interviewConclusion = ref('已完成绩效沟通，后续动作同步到行动计划');
const objectionModalOpen = ref(false);
const objectionInstanceId = ref<number>();
const objectionText = ref(
  '对评分结果有异议，需要绩效管理员复核评分依据和等级系数。',
);
const gradeAdjustModalOpen = ref(false);
const gradeAdjustSubmitting = ref(false);
const gradeAdjustRecord = ref<ManagedAssessmentInstance>();
const gradeAdjustForm = reactive<{
  ccUserIds: number[];
  gradeName: string;
  reason: string;
  reviewDeadline?: string;
  supervisorUserId?: number;
}>({
  ccUserIds: [],
  gradeName: 'B',
  reason: '',
  reviewDeadline: undefined,
  supervisorUserId: undefined,
});
const transferModalOpen = ref(false);
const transferSubmitting = ref(false);
const transferRecord = ref<ManagedAssessmentInstance>();
const transferForm = reactive<{
  reason: string;
  toUserId?: number;
}>({
  reason: '',
  toUserId: undefined,
});
const jumpModalOpen = ref(false);
const jumpSubmitting = ref(false);
const jumpRecord = ref<ManagedAssessmentInstance>();
const jumpForm = reactive<{
  assigneeUserId?: number;
  reason: string;
  targetNodeKey?: string;
}>({
  assigneeUserId: undefined,
  reason: '',
  targetNodeKey: undefined,
});
const performanceGradeOptions = [
  { coefficient: 2, label: 'A+ · 系数 2.00', value: 'A+' },
  { coefficient: 1.5, label: 'A · 系数 1.50', value: 'A' },
  { coefficient: 1, label: 'B · 系数 1.00', value: 'B' },
  { coefficient: 0.8, label: 'C+ · 系数 0.80', value: 'C+' },
  { coefficient: 0, label: 'C · 系数 0.00', value: 'C' },
];
const flowJumpOptions = [
  {
    label: '指标确认',
    nodeKey: 'Performance_Indicator_Confirm',
    taskType: 1,
    value: 'Performance_Indicator_Confirm',
  },
  {
    label: '执行中',
    nodeKey: 'Performance_Executing',
    taskType: undefined,
    value: 'Performance_Executing',
  },
  {
    label: '员工自评',
    nodeKey: 'Performance_Self_Score',
    taskType: 2,
    value: 'Performance_Self_Score',
  },
  {
    label: '主管评分',
    nodeKey: 'Performance_Manager_Score',
    taskType: 3,
    value: 'Performance_Manager_Score',
  },
  {
    label: '人事审核',
    nodeKey: 'Performance_Hr_Approve',
    taskType: 4,
    value: 'Performance_Hr_Approve',
  },
];

const tabs = [
  { key: 'people', label: '考核人员' },
  { key: 'interview', label: '面谈' },
  { key: 'confirm', label: '结果确认' },
  { key: 'grade', label: '等级和系数' },
  { key: 'analysis', label: '考核分析' },
];

const batch = computed(() => apiBatch.value);
const rows = computed(() => apiRows.value);
const canAdjustGrade = computed(() =>
  hasAccessByCodes(['fdmperformance:assessment:cancel']),
);
const canManagePeople = computed(() => canAdjustGrade.value);
const jumpTargetOptions = computed(() =>
  flowJumpOptions.map((item) => ({
    label: item.label,
    value: item.value,
  })),
);
const templateDescription = computed(() => {
  const templates = [...apiTemplateMap.value.values()];
  if (templates.length === 0) return '查看考核执行详情';
  if (templates.length === 1) return `考评表：${templates[0]!.name}`;
  return `考评表：${templates[0]!.name} 等 ${templates.length} 张`;
});
const filteredRows = computed(() => {
  const text = keyword.value.trim();
  return rows.value.filter((item) => {
    const textMatched =
      !text ||
      [
        item.employee?.name,
        item.employee?.dept,
        item.employee?.post,
        item.nodeName,
      ]
        .filter(Boolean)
        .some((value) => value!.includes(text));
    const statusMatched =
      !statusFilter.value || item.status === statusFilter.value;
    return textMatched && statusMatched;
  });
});
const completed = computed(
  () => rows.value.filter((item) => isResultProcessed(item)).length,
);
const pendingPublishRows = computed(() =>
  filteredRows.value.filter((item) => item.status === 'pendingPublish'),
);
const pendingReviewRows = computed(() =>
  filteredRows.value.filter((item) => item.status === 'hrReview'),
);
const pendingConfirmRows = computed(() =>
  filteredRows.value.filter(
    (item) => item.resultVisible && !item.resultConfirmed,
  ),
);
const gradeRows = computed(() =>
  filteredRows.value.map((item) => ({
    ...item,
    coefficient: item.grade
      ? (resolvePerformanceCoefficient(item.grade) ?? '-')
      : '-',
    reviewStatusLabel: getReviewStatusLabel(item),
    visible: getResultVisibleLabel(item),
    /*
      ? '已公示'
        ? '待公示'
        : '处理中',
    */
  })),
);
const userOptions = computed(() =>
  simpleUsers.value
    .filter((user) => user.id !== undefined && user.id !== null)
    .map((user) => ({
      label: resolveUserOptionLabel(user),
      value: Number(user.id),
    })),
);
const analysisRows = computed(() => {
  const grouped = new Map<string, typeof rows.value>();
  filteredRows.value.forEach((item) => {
    const dept = item.employee?.dept || '未分组';
    grouped.set(dept, [...(grouped.get(dept) || []), item]);
  });
  return [...grouped.entries()].map(([dept, items]) => {
    const total = Math.max(items.length, 1);
    return {
      confirmRate: Math.round(
        (items.filter((item) => item.progress >= 2).length / total) * 100,
      ),
      count: items.length,
      dept,
      resultRate: Math.round(
        (items.filter((item) => isResultProcessed(item)).length / total) * 100,
      ),
      scoreRate: Math.round(
        (items.filter(
          (item) =>
            item.selfScore !== undefined ||
            item.supervisorScore !== undefined ||
            item.finalScore !== undefined,
        ).length /
          total) *
          100,
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
  { dataIndex: 'currentExecutor', title: '当前执行人', width: 160 },
  { dataIndex: 'stayTime', title: '停留时间', width: 120 },
  { dataIndex: 'result', title: '考核结果', width: 120 },
  { dataIndex: 'grade', title: '绩效等级', width: 100 },
  { dataIndex: 'action', fixed: 'right', title: '操作', width: 470 },
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
  { dataIndex: 'finalScore', title: '考核总分', width: 120 },
  { dataIndex: 'systemGradeName', title: '默认等级', width: 120 },
  { dataIndex: 'grade', title: '当前等级', width: 120 },
  { dataIndex: 'coefficient', title: '绩效系数', width: 120 },
  { dataIndex: 'reviewStatus', title: '绩效复盘', width: 120 },
  { dataIndex: 'visible', title: '结果状态', width: 140 },
  { dataIndex: 'action', fixed: 'right', title: '操作', width: 140 },
];
const analysisColumns: TableColumnsType = [
  { dataIndex: 'dept', title: '部门信息', width: 180 },
  { dataIndex: 'count', title: '参与人数', width: 120 },
  { dataIndex: 'confirmRate', title: '指标确认', width: 240 },
  { dataIndex: 'scoreRate', title: '评分完成', width: 240 },
  { dataIndex: 'resultRate', title: '结果处理', width: 240 },
];

const statusOptions = Object.entries(instanceStatusMetaMap).map(
  ([value, meta]) => ({
    label: meta.label,
    value,
  }),
);
const rowSelection = computed(() => ({
  selectedRowKeys: selectedRowKeys.value,
  onChange: (keys: (number | string)[]) => {
    selectedRowKeys.value = keys.map(Number);
  },
}));

function isResultProcessed(item: Record<string, any>) {
  return item.resultVisible || item.status === 'finished';
}

function getInstanceMeta(status: unknown) {
  return (
    instanceStatusMetaMap[status as keyof typeof instanceStatusMetaMap] || {
      color: 'default',
      label: '未知',
    }
  );
}

function getBatchMeta(status: unknown) {
  return (
    batchStatusMetaMap[status as keyof typeof batchStatusMetaMap] || {
      color: 'default',
      label: '未知',
    }
  );
}

function getTemplateName(templateId?: number) {
  return templateId ? apiTemplateMap.value.get(templateId)?.name || '-' : '-';
}

function resolveUserDisplayName(userId?: number) {
  if (!userId) return '-';
  const user = simpleUsers.value.find((item) => Number(item.id) === userId);
  return user?.nickname || user?.username || `用户${userId}`;
}

function resolveUserOptionLabel(user: SystemUserApi.User) {
  return `${user.nickname || user.username || `用户${user.id}`} · ${
    user.deptName || '未分配部门'
  }`;
}

function parseLocalDateTime(value?: string) {
  if (!value) return undefined;
  const date = new Date(value.includes('T') ? value : value.replace(' ', 'T'));
  return Number.isNaN(date.getTime()) ? undefined : date;
}

function formatStayDuration(createTime?: string) {
  const date = parseLocalDateTime(createTime);
  if (!date) return '-';
  const diff = Math.max(Date.now() - date.getTime(), 0);
  const day = Math.floor(diff / 86_400_000);
  const hour = Math.floor((diff % 86_400_000) / 3_600_000);
  const minute = Math.floor((diff % 3_600_000) / 60_000);
  if (day > 0) return `${day}天${hour}小时`;
  if (hour > 0) return `${hour}小时${minute}分钟`;
  return `${Math.max(minute, 1)}分钟`;
}

function buildPendingTaskMap(tasks: FdmPerformanceAssessmentApi.Task[]) {
  const map = new Map<number, FdmPerformanceAssessmentApi.Task>();
  tasks.forEach((task) => {
    const instanceId = Number(task.instanceId || 0);
    if (instanceId > 0 && !map.has(instanceId)) {
      map.set(instanceId, task);
    }
  });
  return map;
}

function getProgressText(record: Record<string, any>) {
  return `${record.progress}/${
    record.progressTotal || record.flowSnapshot?.length || 8
  }`;
}

function hasPendingTask(record: Record<string, any>) {
  return Boolean(record.pendingTaskId && record.pendingTaskAssigneeUserId);
}

function resolvePerformanceCoefficient(grade?: string) {
  const option = performanceGradeOptions.find((item) => item.value === grade);
  if (option) return option.coefficient;
  if (grade === '卓越') return 2;
  if (grade === '优秀') return 1.5;
  if (grade === '平均') return 1;
  if (grade === '及格') return 0.8;
  if (grade === '不及格') return 0;
  return undefined;
}

function getReviewStatusLabel(
  item: Pick<AssessmentInstance, 'reviewRequired' | 'reviewStatus'>,
) {
  if (!item.reviewRequired) return '未触发';
  const statusMap: Record<number, string> = {
    1: '待确认',
    2: '已完成',
    3: '已取消',
  };
  return statusMap[Number(item.reviewStatus || 0)] || '待确认';
}

function getReviewStatusColor(
  item: Pick<AssessmentInstance, 'reviewRequired' | 'reviewStatus'>,
) {
  if (!item.reviewRequired) return 'default';
  const colorMap: Record<number, string> = {
    1: 'orange',
    2: 'green',
    3: 'default',
  };
  return colorMap[Number(item.reviewStatus || 0)] || 'orange';
}

function getResultVisibleLabel(item: Record<string, any>) {
  if (item.resultVisible) return '已公示';
  if (item.status === 'pendingPublish') return '待公示';
  return '处理中';
}

function getResultConfirmStatusColor(item: Record<string, any>) {
  if (item.resultObjection) return 'red';
  if (item.resultConfirmed) return 'green';
  if (item.resultVisible) return 'blue';
  if (item.status === 'hrReview') return 'orange';
  return 'default';
}

function getResultConfirmStatusLabel(item: Record<string, any>) {
  if (item.resultObjection) return '结果异议';
  if (item.resultConfirmed) return '已确认';
  if (item.resultVisible) return '待确认';
  if (item.status === 'hrReview') return '待审核';
  return '处理中';
}

function getGradeColor(grade?: string) {
  if (grade === 'C') return 'red';
  if (grade === 'C+') return 'orange';
  if (grade === 'A' || grade === 'A+') return 'green';
  return 'blue';
}

async function ensureSimpleUsers() {
  if (simpleUsers.value.length > 0) return;
  simpleUsers.value = await getSimpleUserList();
}

async function openGradeAdjust(record: Record<string, any>) {
  await ensureSimpleUsers();
  const currentRecord = record as AssessmentInstance & { employee?: Employee };
  gradeAdjustRecord.value = currentRecord;
  gradeAdjustForm.gradeName = currentRecord.grade || 'B';
  gradeAdjustForm.reason = currentRecord.gradeAdjustReason || '';
  gradeAdjustForm.supervisorUserId = currentRecord.reviewSupervisorUserId;
  gradeAdjustForm.ccUserIds = (currentRecord.reviewCcUserIds || '')
    .split(',')
    .map((item) => Number(item.trim()))
    .filter((item) => Number.isFinite(item) && item > 0);
  gradeAdjustForm.reviewDeadline = currentRecord.reviewDeadline;
  gradeAdjustModalOpen.value = true;
}

function confirmDeleteInstance(record: Record<string, any>) {
  Modal.confirm({
    cancelText: '取消',
    content: `确认删除 ${record.employee?.name || '该被考核人'} 的考核记录吗？删除后评分、待办、结果和调整记录将同步删除，无法恢复。`,
    okText: '删除',
    okType: 'danger',
    title: '删除被考核人记录',
    async onOk() {
      await deleteFdmPerformanceAssessmentInstance(record.id);
      selectedRowKeys.value = selectedRowKeys.value.filter(
        (id) => id !== record.id,
      );
      message.success('已删除被考核人记录');
      await loadApiData();
    },
  });
}

async function saveGradeAdjust() {
  if (!gradeAdjustRecord.value) return;
  if (gradeAdjustForm.gradeName === 'C' && !gradeAdjustForm.supervisorUserId) {
    message.warning('C 级绩效复盘必须指定主管确认人');
    return;
  }
  gradeAdjustSubmitting.value = true;
  try {
    await adjustFdmPerformanceAssessmentGrade({
      ccUserIds:
        gradeAdjustForm.gradeName === 'C' ? gradeAdjustForm.ccUserIds : [],
      gradeName: gradeAdjustForm.gradeName,
      instanceId: gradeAdjustRecord.value.id,
      reason: gradeAdjustForm.reason,
      reviewDeadline:
        gradeAdjustForm.gradeName === 'C'
          ? gradeAdjustForm.reviewDeadline
          : undefined,
      supervisorUserId:
        gradeAdjustForm.gradeName === 'C'
          ? gradeAdjustForm.supervisorUserId
          : undefined,
    });
    gradeAdjustModalOpen.value = false;
    await loadApiData();
    message.success('绩效等级已调整');
  } finally {
    gradeAdjustSubmitting.value = false;
  }
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
  const targets = rows.value.filter(
    (item) => item.status === 'indicatorConfirm',
  );
  await Promise.all(
    targets.map((item) => confirmFdmPerformanceAssessmentIndicators(item.id)),
  );
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
  const ids =
    selectedRowKeys.value.length > 0
      ? selectedRowKeys.value
      : pendingReviewRows.value.map((item) => item.id);
  await Promise.all(
    ids
      .filter(
        (id) =>
          rows.value.find((item) => item.id === id)?.status === 'hrReview',
      )
      .map((id) => submitFdmPerformanceAssessmentHrReview({ instanceId: id })),
  );
  await loadApiData();
  selectedRowKeys.value = [];
  message.success('已批量审核可处理人员');
}

function resolveBatchActionSourceIds(
  targetIds: number[] | undefined,
  fallbackIds: number[],
) {
  if (targetIds && targetIds.length > 0) return targetIds;
  if (selectedRowKeys.value.length > 0) return selectedRowKeys.value;
  return fallbackIds;
}

async function publishSelected(targetIds?: number[]) {
  if (!batch.value) return;
  const sourceIds = resolveBatchActionSourceIds(
    targetIds,
    pendingPublishRows.value.map((item) => item.id),
  );
  const ids = sourceIds.filter(
    (id) =>
      rows.value.find((item) => item.id === id)?.status === 'pendingPublish',
  );
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
  const sourceIds = resolveBatchActionSourceIds(
    targetIds,
    filteredRows.value.map((item) => item.id),
  );
  const ids = [
    ...new Set(
      sourceIds.filter((id) => rows.value.some((item) => item.id === id)),
    ),
  ];
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
  objectionText.value =
    '对评分结果有异议，需要绩效管理员复核评分依据和等级系数。';
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

async function openTransfer(record: Record<string, any>) {
  if (!batch.value) return;
  if (!hasPendingTask(record)) {
    message.warning('当前人员没有可转交的待办任务');
    return;
  }
  await ensureSimpleUsers();
  transferRecord.value = record as ManagedAssessmentInstance;
  transferForm.toUserId = undefined;
  transferForm.reason = '';
  transferModalOpen.value = true;
}

async function saveTransfer() {
  if (!batch.value || !transferRecord.value) return;
  if (!transferForm.toUserId) {
    message.warning('请选择新的执行人');
    return;
  }
  if (!transferRecord.value.pendingTaskAssigneeUserId) {
    message.warning('当前待办缺少原执行人，无法转交');
    return;
  }
  transferSubmitting.value = true;
  try {
    const count = await transferFdmPerformanceAssessmentTasks({
      batchId: batch.value.id,
      fromUserId: transferRecord.value.pendingTaskAssigneeUserId,
      instanceId: transferRecord.value.id,
      reason: transferForm.reason,
      taskId: transferRecord.value.pendingTaskId,
      toUserId: transferForm.toUserId,
    });
    transferModalOpen.value = false;
    await loadApiData();
    message.success(count > 0 ? '流程已转交' : '没有匹配到可转交的待办');
  } finally {
    transferSubmitting.value = false;
  }
}

function confirmSkip(record: Record<string, any>) {
  if (!hasPendingTask(record)) {
    message.warning('当前人员没有可跳过的待办任务');
    return;
  }
  const currentRecord = record as ManagedAssessmentInstance;
  Modal.confirm({
    content: `将跳过 ${currentRecord.employee?.name || '该人员'} 的当前节点：${
      currentRecord.pendingTaskNodeName || currentRecord.nodeName
    }。跳过后系统会按流程进入下一节点。`,
    okText: '确认跳过',
    onOk: async () => {
      await skipFdmPerformanceAssessmentTask({
        instanceId: currentRecord.id,
        reason: '绩效管理员跳过当前节点',
        taskId: currentRecord.pendingTaskId,
      });
      await loadApiData();
      message.success('当前节点已跳过');
    },
    title: '跳过当前节点',
  });
}

async function openJump(record: Record<string, any>) {
  await ensureSimpleUsers();
  const currentRecord = record as ManagedAssessmentInstance;
  jumpRecord.value = currentRecord;
  jumpForm.targetNodeKey =
    currentRecord.pendingTaskNodeKey || flowJumpOptions[0]?.value;
  jumpForm.assigneeUserId = currentRecord.pendingTaskAssigneeUserId;
  jumpForm.reason = '';
  jumpModalOpen.value = true;
}

async function saveJump() {
  if (!jumpRecord.value || !jumpForm.targetNodeKey) {
    message.warning('请选择要跳转的流程节点');
    return;
  }
  const target = flowJumpOptions.find(
    (item) => item.value === jumpForm.targetNodeKey,
  );
  if (!target) {
    message.warning('目标流程节点无效');
    return;
  }
  jumpSubmitting.value = true;
  try {
    await jumpFdmPerformanceAssessmentTask({
      assigneeUserId: jumpForm.assigneeUserId,
      instanceId: jumpRecord.value.id,
      reason: jumpForm.reason,
      targetNodeKey: target.nodeKey,
      targetNodeName: target.label,
      targetTaskType: target.taskType,
    });
    jumpModalOpen.value = false;
    await loadApiData();
    message.success('流程节点已调整');
  } finally {
    jumpSubmitting.value = false;
  }
}

function canStartScoring() {
  return rows.value.some((item) =>
    ['executing', 'indicatorConfirm'].includes(item.status),
  );
}

function canConfirmIndicators() {
  return rows.value.some((item) => item.status === 'indicatorConfirm');
}

async function loadApiData() {
  const batchId = Number(route.params.id);
  if (!batchId) return;
  apiLoading.value = true;
  try {
    const shouldLoadUsers = simpleUsers.value.length === 0;
    const [batchResp, instancePage, processLogPage, pendingTaskPage, users] =
      await Promise.all([
        getFdmPerformanceAssessmentBatch(batchId),
        getFdmPerformanceAssessmentInstancePage({
          batchId,
          pageNo: 1,
          pageSize: -1,
        }),
        getFdmPerformanceAssessmentChangeLogPage({
          batchId,
          pageNo: 1,
          pageSize: -1,
        }),
        getFdmPerformanceAssessmentTaskPage({
          batchId,
          pageNo: 1,
          pageSize: -1,
          status: 0,
        }),
        shouldLoadUsers
          ? getSimpleUserList()
          : Promise.resolve(simpleUsers.value),
      ]);
    simpleUsers.value = users;
    const processLogMap = buildProcessLogMap(processLogPage.list || []);
    const pendingTaskMap = buildPendingTaskMap(pendingTaskPage.list || []);
    apiRows.value = instancePage.list.map((item) => {
      const mapped = mapApiInstance({
        ...item,
        ...processLogMap.get(item.id),
      });
      const pendingTask = pendingTaskMap.get(item.id);
      const pendingTaskAssigneeUserId = pendingTask?.assigneeUserId
        ? Number(pendingTask.assigneeUserId)
        : undefined;
      return {
        ...mapped,
        currentExecutor: pendingTaskAssigneeUserId
          ? resolveUserDisplayName(pendingTaskAssigneeUserId)
          : '-',
        employee: {
          dept: item.deptName || '-',
          id: Number(item.userId || 0),
          name: item.userName || resolveUserDisplayName(item.userId),
          post: item.postName || '-',
        },
        pendingTaskAssigneeName: pendingTaskAssigneeUserId
          ? resolveUserDisplayName(pendingTaskAssigneeUserId)
          : undefined,
        pendingTaskAssigneeUserId,
        pendingTaskCreateTime: pendingTask?.createTime,
        pendingTaskId: pendingTask?.id,
        pendingTaskNodeKey: pendingTask?.nodeKey,
        pendingTaskNodeName: pendingTask?.nodeName,
        pendingTaskType: pendingTask?.taskType,
        stayTime: pendingTask
          ? formatStayDuration(pendingTask.createTime)
          : '-',
      };
    });
    apiBatch.value = mapApiBatch(batchResp, apiRows.value);
    const templateIds = [
      ...new Set(
        [
          ...(batchResp.templateIds || []),
          ...instancePage.list.map((item) => Number(item.templateId || 0)),
        ]
          .map(Number)
          .filter((item) => Number.isFinite(item) && item > 0),
      ),
    ];
    if (templateIds.length > 0) {
      const templateResponses = await Promise.all(
        templateIds.map((templateId) => getFdmPerformanceTemplate(templateId)),
      );
      apiTemplateMap.value = new Map(
        templateResponses.map((item) => [
          Number(item.id),
          mapApiTemplate(item),
        ]),
      );
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
    Pick<
      FdmPerformanceAssessmentApi.Instance,
      'interviewRecords' | 'resultObjections'
    >
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
      <Button @click="router.push(performancePath('/batches'))">
        返回列表
      </Button>
      <Button :loading="reminding" @click="() => remindSelected()">
        DING催办
      </Button>
      <Button :disabled="!canConfirmIndicators()" @click="confirmIndicators">
        确认指标
      </Button>
      <Button :disabled="!canStartScoring()" @click="startScoring">
        发起评分
      </Button>
      <Button
        :disabled="pendingReviewRows.length === 0"
        @click="approveSelected"
      >
        批量审核
      </Button>
      <Button
        :disabled="pendingPublishRows.length === 0"
        type="primary"
        @click="() => publishSelected()"
      >
        公示结果
      </Button>
    </template>

    <template v-if="batch">
      <div class="summary-grid">
        <Card><Statistic :value="rows.length" title="参与人员" /></Card>
        <Card>
          <Statistic
            :value="rows.filter((item) => item.status === 'selfScore').length"
            title="待自评"
          />
        </Card>
        <Card>
          <Statistic
            :value="
              rows.filter((item) => item.status === 'supervisorScore').length
            "
            title="待主管评分"
          />
        </Card>
        <Card><Statistic :value="completed" title="结果已公示" /></Card>
      </div>

      <Card>
        <div class="batch-title">
          <Space>
            <strong>{{ batch.name }}</strong>
            <Tag :color="getBatchMeta(batch.status).color">
              {{ getBatchMeta(batch.status).label }}
            </Tag>
          </Space>
          <Progress
            :percent="Math.round((completed / Math.max(rows.length, 1)) * 100)"
          />
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
          <Input
            v-model:value="keyword"
            allow-clear
            placeholder="搜索被考核人、部门、岗位"
          />
          <Select
            v-model:value="statusFilter"
            allow-clear
            :options="statusOptions"
            placeholder="筛选状态"
          />
          <span>已选 {{ selectedRowKeys.length }} 人</span>
          <span>待公示 {{ pendingPublishRows.length }} 人，待确认
            {{ pendingConfirmRows.length }} 人</span>
        </div>

        <Table
          v-if="activeTab === 'people'"
          :columns="peopleColumns"
          :data-source="filteredRows"
          :loading="apiLoading"
          :pagination="{ pageSize: 10 }"
          :row-selection="rowSelection"
          :scroll="{ x: 1500 }"
          row-key="id"
        >
          <template #bodyCell="{ column, record }">
            <template v-if="column.dataIndex === 'employee'">
              <div class="employee-cell">
                <strong>{{ record.employee?.name }}</strong>
                <span>{{ record.employee?.post || '-' }}</span>
              </div>
            </template>
            <template v-else-if="column.dataIndex === 'dept'">
              {{ record.employee?.dept }}
            </template>
            <template v-else-if="column.dataIndex === 'template'">
              {{ getTemplateName(record.templateId || batch.templateId) }}
            </template>
            <template v-else-if="column.dataIndex === 'progress'">
              {{ getProgressText(record) }}
            </template>
            <template v-else-if="column.dataIndex === 'nodeName'">
              <Tag :color="getInstanceMeta(record.status).color">
                {{ record.nodeName }}
              </Tag>
            </template>
            <template v-else-if="column.dataIndex === 'currentExecutor'">
              <Space>
                <span>{{ record.currentExecutor || '-' }}</span>
                <Tag v-if="record.pendingTaskNodeName" color="blue">
                  {{ record.pendingTaskNodeName }}
                </Tag>
              </Space>
            </template>
            <template v-else-if="column.dataIndex === 'stayTime'">
              {{ record.stayTime || '-' }}
            </template>
            <template v-else-if="column.dataIndex === 'result'">
              {{ record.finalScore ?? '-' }}
            </template>
            <template v-else-if="column.dataIndex === 'grade'">
              {{ record.grade ?? '-' }}
            </template>
            <template v-else-if="column.dataIndex === 'action'">
              <Space wrap>
                <Button
                  v-if="record.status === 'selfScore'"
                  size="small"
                  type="link"
                  @click="openScore(record.id, 'self')"
                >
                  自评
                </Button>
                <Button
                  v-if="record.status === 'supervisorScore'"
                  size="small"
                  type="link"
                  @click="openScore(record.id, 'supervisor')"
                >
                  主管评分
                </Button>
                <Button
                  v-if="record.status === 'hrReview'"
                  size="small"
                  type="link"
                  @click="approveReview(record.id)"
                >
                  审核通过
                </Button>
                <Button
                  v-if="record.status === 'pendingPublish'"
                  size="small"
                  type="link"
                  @click="publishSelected([record.id])"
                >
                  公示结果
                </Button>
                <Button
                  v-if="record.resultVisible && !record.resultConfirmed"
                  size="small"
                  type="link"
                  @click="confirmResult(record.id)"
                >
                  确认结果
                </Button>
                <Button
                  size="small"
                  type="link"
                  @click="
                    router.push(
                      performancePath(
                        `/batches/${batch.id}/instances/${record.id}`,
                      ),
                    )
                  "
                >
                  查看
                </Button>
                <Button
                  v-if="canManagePeople && hasPendingTask(record)"
                  :loading="reminding"
                  size="small"
                  type="link"
                  @click="() => remindSelected([record.id])"
                >
                  催办
                </Button>
                <Button
                  v-if="canManagePeople && hasPendingTask(record)"
                  size="small"
                  type="link"
                  @click="openTransfer(record)"
                >
                  转交
                </Button>
                <Button
                  v-if="canManagePeople"
                  size="small"
                  type="link"
                  @click="openJump(record)"
                >
                  跳转流程
                </Button>
                <Button
                  v-if="canManagePeople && hasPendingTask(record)"
                  danger
                  size="small"
                  type="link"
                  @click="confirmSkip(record)"
                >
                  跳过
                </Button>
                <Button
                  v-if="canManagePeople"
                  size="small"
                  type="link"
                  @click="openGradeAdjust(record)"
                >
                  调级
                </Button>
                <Button
                  v-if="canManagePeople && isResultProcessed(record)"
                  danger
                  size="small"
                  type="link"
                  @click="confirmDeleteInstance(record)"
                >
                  删除
                </Button>
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
            <template v-if="column.dataIndex === 'employee'">
              {{ record.employee?.name }}
            </template>
            <template v-else-if="column.dataIndex === 'dept'">
              {{ record.employee?.dept }}
            </template>
            <template v-else-if="column.dataIndex === 'status'">
              <Tag :color="getResultConfirmStatusColor(record)">
                {{ getResultConfirmStatusLabel(record) }}
                <!--
                :color="record.interviewRecords?.length ? 'green' : 'default'"
              >
                {{
                  record.interviewRecords?.length
                    ? `已面谈 ${record.interviewRecords.length} 次`
                    : '未面谈'
                }}
                -->
              </Tag>
            </template>
            <template v-else-if="column.dataIndex === 'action'">
              <Space>
                <Button
                  :loading="reminding"
                  size="small"
                  type="link"
                  @click="() => remindSelected([record.id])"
                >
                  DING催办
                </Button>
                <Button
                  size="small"
                  type="link"
                  @click="openInterviewRecord(record.id)"
                >
                  记录面谈
                </Button>
                <Button
                  size="small"
                  type="link"
                  @click="
                    router.push(
                      performancePath(
                        `/batches/${batch.id}/instances/${record.id}`,
                      ),
                    )
                  "
                >
                  查看
                </Button>
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
            <template v-if="column.dataIndex === 'employee'">
              {{ record.employee?.name }}
            </template>
            <template v-else-if="column.dataIndex === 'dept'">
              {{ record.employee?.dept }}
            </template>
            <template v-else-if="column.dataIndex === 'status'">
              <Tag
                :color="
                  record.resultObjection
                    ? 'red'
                    : record.resultConfirmed
                      ? 'green'
                      : record.resultVisible
                        ? 'blue'
                        : record.status === 'hrReview'
                          ? 'orange'
                          : 'default'
                "
              >
                {{
                  record.resultObjection
                    ? '结果异议'
                    : record.resultConfirmed
                      ? '已确认'
                      : record.resultVisible
                        ? '待确认'
                        : record.status === 'hrReview'
                          ? '待审核'
                          : '处理中'
                }}
              </Tag>
            </template>
            <template v-else-if="column.dataIndex === 'finalScore'">
              {{ record.finalScore ?? '-' }}
            </template>
            <template v-else-if="column.dataIndex === 'grade'">
              {{ record.grade ?? '-' }}
            </template>
            <template v-else-if="column.dataIndex === 'action'">
              <Space>
                <Button
                  v-if="record.status === 'hrReview'"
                  size="small"
                  type="link"
                  @click="approveReview(record.id)"
                >
                  审核通过
                </Button>
                <Button
                  v-if="record.status === 'pendingPublish'"
                  size="small"
                  type="link"
                  @click="publishSelected([record.id])"
                >
                  公示结果
                </Button>
                <Button
                  v-if="
                    record.resultVisible &&
                    !record.resultConfirmed &&
                    !record.resultObjection
                  "
                  size="small"
                  type="link"
                  @click="confirmResult(record.id)"
                >
                  确认结果
                </Button>
                <Button
                  v-if="
                    record.resultVisible &&
                    !record.resultConfirmed &&
                    !record.resultObjection
                  "
                  danger
                  size="small"
                  type="link"
                  @click="openObjection(record.id)"
                >
                  提交异议
                </Button>
                <Button
                  size="small"
                  type="link"
                  @click="
                    router.push(
                      performancePath(
                        `/batches/${batch.id}/instances/${record.id}`,
                      ),
                    )
                  "
                >
                  查看
                </Button>
              </Space>
            </template>
          </template>
        </Table>

        <div v-else-if="activeTab === 'grade'" class="grade-section">
          <div class="grade-grid">
            <div><strong>A+</strong><span>卓越等级 / 系数 2.00</span></div>
            <div><strong>A</strong><span>优秀等级 / 系数 1.50</span></div>
            <div><strong>B</strong><span>默认等级 / 系数 1.00</span></div>
            <div><strong>C+</strong><span>待提升 / 系数 0.80</span></div>
            <div><strong>C</strong><span>需绩效复盘 / 系数 0.00</span></div>
          </div>
          <Table
            :columns="gradeColumns"
            :data-source="gradeRows"
            :pagination="{ pageSize: 10 }"
            :row-selection="rowSelection"
            row-key="id"
          >
            <template #bodyCell="{ column, record }">
              <template v-if="column.dataIndex === 'employee'">
                {{ record.employee?.name }}
              </template>
              <template v-else-if="column.dataIndex === 'dept'">
                {{ record.employee?.dept }}
              </template>
              <template v-else-if="column.dataIndex === 'finalScore'">
                {{ record.finalScore ?? '-' }}
              </template>
              <template v-else-if="column.dataIndex === 'systemGradeName'">
                {{ record.systemGradeName || 'B' }}
              </template>
              <template v-else-if="column.dataIndex === 'grade'">
                <Space>
                  <Tag :color="getGradeColor(record.grade)">
                    {{ record.grade || 'B' }}
                  </Tag>
                  <Tag v-if="record.gradeAdjusted" color="orange">人工调整</Tag>
                </Space>
              </template>
              <template v-else-if="column.dataIndex === 'reviewStatus'">
                <Tag :color="getReviewStatusColor(record)">
                  {{ record.reviewStatusLabel }}
                </Tag>
              </template>
              <template v-else-if="column.dataIndex === 'visible'">
                <Tag :color="record.resultVisible ? 'green' : 'default'">
                  {{ record.visible }}
                </Tag>
              </template>
              <template v-else-if="column.dataIndex === 'action'">
                <Button
                  v-if="canAdjustGrade"
                  size="small"
                  type="link"
                  @click="openGradeAdjust(record)"
                >
                  调整等级
                </Button>
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

    <Modal
      v-model:open="interviewModalOpen"
      title="记录面谈"
      @ok="saveInterviewRecord"
    >
      <div class="score-form">
        <span>面谈结论</span>
        <Input.TextArea v-model:value="interviewConclusion" :rows="4" />
      </div>
    </Modal>

    <Modal
      v-model:open="objectionModalOpen"
      title="提交结果异议"
      @ok="saveObjection"
    >
      <div class="score-form">
        <span>异议说明</span>
        <Input.TextArea v-model:value="objectionText" :rows="4" />
      </div>
    </Modal>

    <Modal
      v-model:open="transferModalOpen"
      :confirm-loading="transferSubmitting"
      title="流程转交"
      @ok="saveTransfer"
    >
      <Space direction="vertical" class="modal-form">
        <div>
          <strong>被考核人</strong>
          <span>{{ transferRecord?.employee?.name || '-' }}</span>
        </div>
        <div>
          <strong>当前节点</strong>
          <span>
            {{
              transferRecord?.pendingTaskNodeName ||
              transferRecord?.nodeName ||
              '-'
            }}
          </span>
        </div>
        <div>
          <strong>当前执行人</strong>
          <span>
            {{
              transferRecord?.pendingTaskAssigneeName ||
              transferRecord?.currentExecutor ||
              '-'
            }}
          </span>
        </div>
        <div>
          <strong>转交给</strong>
          <Select
            v-model:value="transferForm.toUserId"
            :options="userOptions"
            allow-clear
            option-filter-prop="label"
            placeholder="请选择新的执行人"
            show-search
          />
        </div>
        <div>
          <strong>转交原因</strong>
          <Input.TextArea
            v-model:value="transferForm.reason"
            :rows="3"
            placeholder="请输入转交原因，便于后续追溯"
          />
        </div>
      </Space>
    </Modal>

    <Modal
      v-model:open="jumpModalOpen"
      :confirm-loading="jumpSubmitting"
      title="跳转流程节点"
      @ok="saveJump"
    >
      <Space direction="vertical" class="modal-form">
        <div>
          <strong>被考核人</strong>
          <span>{{ jumpRecord?.employee?.name || '-' }}</span>
        </div>
        <div>
          <strong>当前节点</strong>
          <span>
            {{ jumpRecord?.pendingTaskNodeName || jumpRecord?.nodeName || '-' }}
          </span>
        </div>
        <div>
          <strong>目标节点</strong>
          <Select
            v-model:value="jumpForm.targetNodeKey"
            :options="jumpTargetOptions"
            placeholder="请选择要跳转到的流程节点"
          />
        </div>
        <div>
          <strong>指定执行人</strong>
          <Select
            v-model:value="jumpForm.assigneeUserId"
            :options="userOptions"
            allow-clear
            option-filter-prop="label"
            placeholder="不选则按流程默认规则分配"
            show-search
          />
        </div>
        <div>
          <strong>跳转原因</strong>
          <Input.TextArea
            v-model:value="jumpForm.reason"
            :rows="3"
            placeholder="请输入跳转原因，便于后续追溯"
          />
        </div>
      </Space>
    </Modal>

    <Modal
      v-model:open="gradeAdjustModalOpen"
      :confirm-loading="gradeAdjustSubmitting"
      title="调整绩效等级"
      @ok="saveGradeAdjust"
    >
      <Space direction="vertical" class="modal-form">
        <div>
          <strong>被考核人</strong>
          <span>{{ gradeAdjustRecord?.employee?.name || '-' }}</span>
        </div>
        <div>
          <strong>当前得分</strong>
          <span>{{ gradeAdjustRecord?.finalScore ?? '-' }}</span>
        </div>
        <div>
          <strong>绩效等级</strong>
          <Select
            v-model:value="gradeAdjustForm.gradeName"
            :options="performanceGradeOptions"
          />
        </div>
        <div>
          <strong>调整原因</strong>
          <Input.TextArea
            v-model:value="gradeAdjustForm.reason"
            :rows="3"
            placeholder="请输入等级调整原因"
          />
        </div>
        <template v-if="gradeAdjustForm.gradeName === 'C'">
          <div>
            <strong>主管确认人</strong>
            <Select
              v-model:value="gradeAdjustForm.supervisorUserId"
              :options="userOptions"
              allow-clear
              option-filter-prop="label"
              placeholder="请选择主管确认人"
              show-search
            />
          </div>
          <div>
            <strong>抄送人员</strong>
            <Select
              v-model:value="gradeAdjustForm.ccUserIds"
              :options="userOptions"
              allow-clear
              mode="multiple"
              option-filter-prop="label"
              placeholder="请选择抄送人员"
              show-search
            />
          </div>
          <div>
            <strong>截止时间</strong>
            <DatePicker
              v-model:value="gradeAdjustForm.reviewDeadline"
              show-time
              value-format="YYYY-MM-DDTHH:mm:ss"
              placeholder="请选择复盘确认截止时间"
              style="width: 100%"
            />
          </div>
        </template>
      </Space>
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
  cursor: pointer;
  background: transparent;
  border: 0;
}

.tab-row button.active {
  font-weight: 600;
  color: #1677ff;
}

.tab-row button.active::after {
  position: absolute;
  right: 0;
  bottom: -1px;
  left: 0;
  height: 2px;
  content: '';
  background: #1677ff;
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

.employee-cell {
  display: grid;
  gap: 4px;
}

.employee-cell span {
  font-size: 12px;
  color: #64748b;
}

.grade-section {
  display: grid;
  gap: 14px;
}

.grade-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
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

.modal-form {
  width: 100%;
}

.modal-form :deep(.ant-space-item) {
  width: 100%;
}

.modal-form > div {
  display: grid;
  grid-template-columns: 96px minmax(0, 1fr);
  gap: 12px;
  align-items: start;
}

.modal-form :deep(.ant-space-item > div) {
  display: grid;
  grid-template-columns: 96px minmax(0, 1fr);
  gap: 12px;
  align-items: start;
}

.modal-form :deep(.ant-picker),
.modal-form :deep(.ant-select) {
  width: 100%;
  min-width: 0;
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
