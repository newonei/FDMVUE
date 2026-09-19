<script lang="ts" setup>
import type { TableColumnsType } from 'ant-design-vue';

import type { JixiaoApi } from '#/api/fdmperformance';

import { onMounted, reactive, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';

import {
  Button,
  Descriptions,
  Drawer,
  Empty,
  Form,
  message,
  Modal,
  Space,
  Table,
  Tabs,
  Tag,
  Textarea,
} from 'ant-design-vue';

import {
  acknowledgeResultAdjustment,
  confirmReview,
  getInstance,
  getMyInstancePage,
  getMyPendingReviews,
  getMyPendingSupervisorReviews,
  getMyResultPage,
  submitReview,
} from '#/api/fdmperformance';

import {
  GRADE_OPTIONS,
  INSTANCE_STATUS_MAP,
  PERFORMANCE_DEFAULT_PAGE_SIZE,
  PERFORMANCE_PAGE_SIZE_OPTIONS,
  TASK_LABELS,
} from '../shared/constants';
import { formatPerformanceDateTime } from '../shared/format';
import PerformanceShell from '../shared/PerformanceShell.vue';
import {
  actionLabel,
  canAcknowledgeAdjustment,
  canHandleReview,
  deadlineMeta,
} from '../shared/workspace';

defineOptions({ name: 'FdmPerformanceMy' });

type ReviewMode = 'confirm' | 'submit';

const route = useRoute();
const router = useRouter();
const activeTab = ref(
  ['current', 'history', 'reviews'].includes(String(route.query.tab))
    ? String(route.query.tab)
    : 'current',
);
const instanceLoading = ref(false);
const resultLoading = ref(false);
const acknowledgingResultId = ref<number>();
const reviewOpen = ref(false);
const reviewMode = ref<ReviewMode>('submit');
const activeReview = ref<JixiaoApi.Review>();
const supervisorReviews = ref<JixiaoApi.Review[]>([]);
const employeeReviews = ref<JixiaoApi.Review[]>([]);
const instances = ref<JixiaoApi.Instance[]>([]);
const results = ref<JixiaoApi.Result[]>([]);
const instanceTotal = ref(0);
const resultTotal = ref(0);
const instanceQuery = reactive({
  pageNo: 1,
  pageSize: PERFORMANCE_DEFAULT_PAGE_SIZE,
  status: 1,
  scope: 'SELF' as const,
});
const resultQuery = reactive({
  pageNo: 1,
  pageSize: PERFORMANCE_DEFAULT_PAGE_SIZE,
  publicStatus: 1,
  scope: 'SELF' as const,
});
const handledReviewRouteKey = ref('');
const reviewForm = reactive<JixiaoApi.ReviewSubmitReq>({
  improvementPlan: '',
  missedIndicators: '',
  reasonAnalysis: '',
  reviewId: 0,
  supportNeeded: '',
  workCompletion: '',
});

const instanceColumns: TableColumnsType = [
  { dataIndex: 'templateName', title: '考核名称', width: 180 },
  { dataIndex: 'currentTaskName', title: '当前节点', width: 160 },
  { dataIndex: 'periodKey', title: '考核周期', width: 130 },
  { dataIndex: 'supervisorUserName', title: '主管', width: 150 },
  { dataIndex: 'endDate', title: '截止时间', width: 180 },
  { dataIndex: 'finalScore', title: '待确认综合分', width: 120 },
  { dataIndex: 'status', title: '状态', width: 100 },
  { dataIndex: 'action', fixed: 'right', title: '操作', width: 90 },
];

const resultColumns: TableColumnsType = [
  { dataIndex: 'publicTime', title: '公示时间' },
  { dataIndex: 'periodKey', title: '考核周期' },
  { dataIndex: 'supervisorUserName', title: '主管' },
  { dataIndex: 'finalScore', title: '已公布综合分' },
  { dataIndex: 'grade', title: '等级' },
  { dataIndex: 'employeeConfirmed', title: '确认状态' },
  { dataIndex: 'action', title: '操作', width: 100 },
];

function instanceStatus(status?: number): { color: string; text: string } {
  return INSTANCE_STATUS_MAP[status ?? 1] ?? { color: 'default', text: '-' };
}

function gradeColor(grade?: string) {
  if (grade === 'C') return 'red';
  if (grade === 'C+') return 'orange';
  return 'blue';
}

function periodLabel(periodKey?: string) {
  if (!periodKey) return '-';
  const month = /^(\d{4})-(\d{2})$/.exec(periodKey);
  if (month) return `${month[1]}年${month[2]}月`;
  const quarter = /^(\d{4})-Q([1-4])$/.exec(periodKey);
  if (quarter) return `${quarter[1]}年第${quarter[2]}季度`;
  const halfYear = /^(\d{4})-H([12])$/.exec(periodKey);
  if (halfYear) {
    return `${halfYear[1]}年${halfYear[2] === '1' ? '上' : '下'}半年`;
  }
  if (/^\d{4}$/.test(periodKey)) return `${periodKey}年度`;
  return periodKey;
}

async function loadInstances() {
  instanceLoading.value = true;
  try {
    const data = await getMyInstancePage(instanceQuery);
    instances.value = data.list;
    instanceTotal.value = data.total;
  } finally {
    instanceLoading.value = false;
  }
}

async function loadResults() {
  resultLoading.value = true;
  try {
    const data = await getMyResultPage(resultQuery);
    results.value = data.list;
    resultTotal.value = data.total;
  } finally {
    resultLoading.value = false;
  }
}

async function acknowledgeAdjustment(record: JixiaoApi.Result) {
  if (!canAcknowledgeAdjustment(record)) return;
  Modal.confirm({
    title: '知悉等级调整',
    content: `当前已公布综合分为 ${record.finalScore ?? '—'}，等级为 ${record.grade || '—'}。确认后将记录你已知悉此结果。`,
    okText: '确认知悉',
    onOk: async () => {
      acknowledgingResultId.value = record.id;
      try {
        await acknowledgeResultAdjustment(record.id!);
        message.success('已记录知悉');
        await loadResults();
      } finally {
        acknowledgingResultId.value = undefined;
      }
    },
  });
}

async function loadReviews() {
  const [supervisorPending, employeePending] = await Promise.all([
    getMyPendingSupervisorReviews(),
    getMyPendingReviews(),
  ]);
  supervisorReviews.value = (supervisorPending || []).filter((review) =>
    canHandleReview(review, 'SUBMIT'),
  );
  employeeReviews.value = (employeePending || []).filter((review) =>
    canHandleReview(review, 'CONFIRM'),
  );
  syncRouteReviewAction();
}

async function load() {
  await Promise.all([loadInstances(), loadResults(), loadReviews()]);
}

function changeInstancePage(pagination: any) {
  const pageSizeChanged = instanceQuery.pageSize !== pagination.pageSize;
  instanceQuery.pageNo = pageSizeChanged ? 1 : pagination.current;
  instanceQuery.pageSize = pagination.pageSize;
  void loadInstances();
}

function changeResultPage(pagination: any) {
  const pageSizeChanged = resultQuery.pageSize !== pagination.pageSize;
  resultQuery.pageNo = pageSizeChanged ? 1 : pagination.current;
  resultQuery.pageSize = pagination.pageSize;
  void loadResults();
}

function openInstance(record: JixiaoApi.Instance) {
  router.push(
    `/fdmperformance/batches/${record.batchId}/instances/${record.id}`,
  );
}

async function openResult(record: JixiaoApi.Result) {
  if (!record.instanceId) return;
  const instance = await getInstance(record.instanceId);
  openInstance(instance);
}

function openReview(review: JixiaoApi.Review, mode: ReviewMode) {
  if (
    !review.id ||
    !canHandleReview(review, mode === 'submit' ? 'SUBMIT' : 'CONFIRM')
  )
    return;
  activeReview.value = review;
  reviewMode.value = mode;
  Object.assign(reviewForm, {
    improvementPlan: review.improvementPlan || '',
    missedIndicators: review.missedIndicators || '',
    reasonAnalysis: review.reasonAnalysis || '',
    reviewId: review.id,
    supportNeeded: review.supportNeeded || '',
    workCompletion: review.workCompletion || '',
  });
  reviewOpen.value = true;
}

function getRouteReviewId() {
  const value = Array.isArray(route.query.reviewId)
    ? route.query.reviewId[0]
    : route.query.reviewId;
  const id = Number(value);
  return Number.isFinite(id) ? id : undefined;
}

function getRouteReviewAction(): ReviewMode | undefined {
  const value = Array.isArray(route.query.reviewAction)
    ? route.query.reviewAction[0]
    : route.query.reviewAction;
  return value === 'submit' || value === 'confirm' ? value : undefined;
}

function syncRouteReviewAction() {
  const reviewId = getRouteReviewId();
  const action = getRouteReviewAction();
  if (!reviewId || !action) return;
  const routeKey = `${reviewId}:${action}`;
  if (handledReviewRouteKey.value === routeKey) return;
  const source =
    action === 'submit' ? supervisorReviews.value : employeeReviews.value;
  const review = source.find((item) => item.id === reviewId);
  if (review) {
    activeTab.value = 'reviews';
    handledReviewRouteKey.value = routeKey;
    openReview(review, action);
  }
}

function validateReviewForm() {
  const values = [
    reviewForm.workCompletion,
    reviewForm.reasonAnalysis,
    reviewForm.missedIndicators,
    reviewForm.improvementPlan,
    reviewForm.supportNeeded,
  ];
  if (values.some((value) => !value.trim())) {
    message.warning('请完整填写五项绩效复盘内容');
    return false;
  }
  return true;
}

async function submitReviewForm() {
  if (!validateReviewForm()) return;
  await submitReview(reviewForm);
  message.success('复盘已提交，等待员工确认');
  reviewOpen.value = false;
  await loadReviews();
}

function confirmActiveReview() {
  const review = activeReview.value;
  if (!review?.id) return;
  Modal.confirm({
    cancelText: '取消',
    content: '确认已查看并认可主管填写的绩效复盘内容？确认后复盘即完成。',
    okText: '确认复盘',
    onOk: async () => {
      await confirmReview({ reviewId: review.id! });
      message.success('绩效复盘已确认');
      reviewOpen.value = false;
      await loadReviews();
    },
    title: '确认绩效复盘',
  });
}

watch(
  () => [route.query.reviewId, route.query.reviewAction],
  syncRouteReviewAction,
);
watch(
  () => route.query.tab,
  (value) => {
    if (['current', 'history', 'reviews'].includes(String(value)))
      activeTab.value = String(value);
  },
);

onMounted(load);
</script>

<template>
  <PerformanceShell
    title="我的绩效"
    description="这里仅展示你作为被考核人的考核与成绩；评分他人的任务请前往工作台。"
  >
    <Tabs v-model:active-key="activeTab">
      <Tabs.TabPane key="current" tab="进行中" />
      <Tabs.TabPane key="history" tab="历史成绩" />
      <Tabs.TabPane
        key="reviews"
        :tab="`改进与复盘${employeeReviews.length + supervisorReviews.length ? `（${employeeReviews.length + supervisorReviews.length}）` : ''}`"
      />
    </Tabs>
    <Empty
      v-if="
        activeTab === 'reviews' &&
        !employeeReviews.length &&
        !supervisorReviews.length
      "
      description="暂无待处理复盘"
    />
    <div
      v-for="review in supervisorReviews"
      v-show="activeTab === 'reviews'"
      :key="`supervisor-${review.id}`"
      class="review-banner supervisor-banner"
    >
      <div>
        <strong>绩效复盘待填写</strong>
        <span>员工：{{ review.userName || '-' }}</span>
        <Tag :color="gradeColor(review.triggerGrade)">
          {{ review.triggerGrade || '-' }}
        </Tag>
      </div>
      <Button type="primary" @click="openReview(review, 'submit')">
        填写复盘
      </Button>
    </div>

    <div
      v-for="review in employeeReviews"
      v-show="activeTab === 'reviews'"
      :key="`employee-${review.id}`"
      class="review-banner employee-banner"
    >
      <div>
        <strong>绩效复盘待确认</strong>
        <span>主管：{{ review.supervisorUserName || '-' }}</span>
        <Tag :color="gradeColor(review.triggerGrade)">
          {{ review.triggerGrade || '-' }}
        </Tag>
      </div>
      <Button type="primary" @click="openReview(review, 'confirm')">
        查看并确认
      </Button>
    </div>

    <div v-if="activeTab === 'current'" class="panel">
      <div class="panel-head"><strong>当前考核</strong></div>
      <Table
        class="performance-compact-table"
        :columns="instanceColumns"
        :data-source="instances"
        :loading="instanceLoading"
        :pagination="{
          current: instanceQuery.pageNo,
          pageSize: instanceQuery.pageSize,
          pageSizeOptions: PERFORMANCE_PAGE_SIZE_OPTIONS,
          showSizeChanger: true,
          size: 'small',
          total: instanceTotal,
        }"
        row-key="id"
        size="small"
        @change="changeInstancePage"
      >
        <template #emptyText><Empty description="暂无当前考核" /></template>
        <template #bodyCell="{ column, record }">
          <template v-if="column.dataIndex === 'currentTaskName'">
            {{
              TASK_LABELS[record.currentTaskKey] ||
              record.currentTaskName ||
              '-'
            }}
          </template>
          <template v-else-if="column.dataIndex === 'periodKey'">
            {{ periodLabel(record.periodKey) }}
          </template>
          <template v-else-if="column.dataIndex === 'endDate'"
            ><Tag :color="deadlineMeta(record.endDate).color">{{
              deadlineMeta(record.endDate).text
            }}</Tag></template
          >
          <template v-else-if="column.dataIndex === 'status'">
            <Tag :color="instanceStatus(record.status).color">
              {{ instanceStatus(record.status).text }}
            </Tag>
          </template>
          <template v-else-if="column.dataIndex === 'action'">
            <Button size="small" type="link" @click="openInstance(record)">
              {{ actionLabel(record) }}
            </Button>
          </template>
        </template>
      </Table>
    </div>

    <div v-if="activeTab === 'history'" class="panel">
      <div class="panel-head"><strong>已公示结果</strong></div>
      <Table
        class="performance-compact-table"
        :columns="resultColumns"
        :data-source="results"
        :loading="resultLoading"
        :pagination="{
          current: resultQuery.pageNo,
          pageSize: resultQuery.pageSize,
          pageSizeOptions: PERFORMANCE_PAGE_SIZE_OPTIONS,
          showSizeChanger: true,
          size: 'small',
          total: resultTotal,
        }"
        row-key="id"
        size="small"
        @change="changeResultPage"
      >
        <template #emptyText><Empty description="暂无已公示结果" /></template>
        <template #bodyCell="{ column, record }">
          <template v-if="column.dataIndex === 'publicTime'">
            {{ formatPerformanceDateTime(record.publicTime) }}
          </template>
          <template v-else-if="column.dataIndex === 'periodKey'">
            {{ periodLabel(record.periodKey) }}
          </template>
          <template v-else-if="column.dataIndex === 'grade'">
            <Tag :color="gradeColor(record.grade)">
              {{
                GRADE_OPTIONS.find((item) => item.value === record.grade)
                  ?.label || record.grade
              }}
            </Tag>
          </template>
          <template v-else-if="column.dataIndex === 'employeeConfirmed'">
            <Tag :color="record.employeeConfirmed ? 'green' : 'orange'">
              {{ record.employeeConfirmed ? '已确认' : '待确认' }}
            </Tag>
            <Button
              v-if="canAcknowledgeAdjustment(record)"
              type="link"
              size="small"
              :loading="acknowledgingResultId === record.id"
              @click="acknowledgeAdjustment(record)"
              >知悉等级调整</Button
            >
          </template>
          <template v-else-if="column.dataIndex === 'action'"
            ><Button type="link" size="small" @click="openResult(record)"
              >查看详情</Button
            ></template
          >
        </template>
      </Table>
    </div>

    <Drawer
      v-model:open="reviewOpen"
      :title="reviewMode === 'submit' ? '填写绩效复盘' : '确认绩效复盘'"
      :width="680"
    >
      <Descriptions
        v-if="activeReview"
        bordered
        class="review-summary"
        :column="2"
        size="small"
      >
        <Descriptions.Item label="员工">
          {{ activeReview.userName || '-' }}
        </Descriptions.Item>
        <Descriptions.Item label="绩效等级">
          <Tag :color="gradeColor(activeReview.triggerGrade)">
            {{ activeReview.triggerGrade || '-' }}
          </Tag>
        </Descriptions.Item>
        <Descriptions.Item label="主管">
          {{ activeReview.supervisorUserName || '-' }}
        </Descriptions.Item>
        <Descriptions.Item label="状态">
          {{ reviewMode === 'submit' ? '待主管提交' : '待员工确认' }}
        </Descriptions.Item>
      </Descriptions>

      <Form layout="vertical">
        <Form.Item label="一、面谈中员工对本月工作完成情况的评价" required>
          <Textarea
            v-model:value="reviewForm.workCompletion"
            :disabled="reviewMode === 'confirm'"
            :rows="3"
          />
        </Form.Item>
        <Form.Item label="二、主要原因分析（客观 + 主观）" required>
          <Textarea
            v-model:value="reviewForm.reasonAnalysis"
            :disabled="reviewMode === 'confirm'"
            :rows="3"
          />
        </Form.Item>
        <Form.Item label="三、本月主要未达标指标" required>
          <Textarea
            v-model:value="reviewForm.missedIndicators"
            :disabled="reviewMode === 'confirm'"
            :rows="3"
          />
        </Form.Item>
        <Form.Item label="四、下个月改进方向与目标" required>
          <Textarea
            v-model:value="reviewForm.improvementPlan"
            :disabled="reviewMode === 'confirm'"
            :rows="3"
          />
        </Form.Item>
        <Form.Item label="五、主管提供的辅导与支持措施" required>
          <Textarea
            v-model:value="reviewForm.supportNeeded"
            :disabled="reviewMode === 'confirm'"
            :rows="3"
          />
        </Form.Item>
      </Form>

      <template #footer>
        <Space>
          <Button @click="reviewOpen = false">关闭</Button>
          <Button
            v-if="reviewMode === 'submit'"
            type="primary"
            @click="submitReviewForm"
          >
            提交给员工确认
          </Button>
          <Button v-else type="primary" @click="confirmActiveReview">
            确认复盘
          </Button>
        </Space>
      </template>
    </Drawer>
  </PerformanceShell>
</template>

<style scoped>
.panel,
.review-banner {
  padding: 14px;
  background: #fff;
  border: 1px solid #edf0f4;
  border-radius: 8px;
}

.review-banner {
  display: flex;
  gap: 12px;
  align-items: center;
  justify-content: space-between;
}

.supervisor-banner {
  border-left: 3px solid #1677ff;
}

.employee-banner {
  border-left: 3px solid #fa8c16;
}

.review-banner > div,
.panel-head {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  align-items: center;
}

.panel-head {
  margin-bottom: 12px;
}

.review-summary {
  margin-bottom: 16px;
}

@media (max-width: 720px) {
  .review-banner {
    flex-direction: column;
    align-items: flex-start;
  }
}
</style>
