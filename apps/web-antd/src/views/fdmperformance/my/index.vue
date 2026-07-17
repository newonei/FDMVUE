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
  Tag,
  Textarea,
} from 'ant-design-vue';

import {
  confirmReview,
  getMyInstancePage,
  getMyPendingReviews,
  getMyPendingSupervisorReviews,
  getMyResults,
  submitReview,
} from '#/api/fdmperformance';

import {
  GRADE_OPTIONS,
  INSTANCE_STATUS_MAP,
  TASK_LABELS,
} from '../shared/constants';
import PerformanceShell from '../shared/PerformanceShell.vue';

defineOptions({ name: 'FdmPerformanceMy' });

type ReviewMode = 'confirm' | 'submit';

const route = useRoute();
const router = useRouter();
const loading = ref(false);
const reviewOpen = ref(false);
const reviewMode = ref<ReviewMode>('submit');
const activeReview = ref<JixiaoApi.Review>();
const supervisorReviews = ref<JixiaoApi.Review[]>([]);
const employeeReviews = ref<JixiaoApi.Review[]>([]);
const instances = ref<JixiaoApi.Instance[]>([]);
const results = ref<JixiaoApi.Result[]>([]);
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
  { dataIndex: 'currentTaskName', title: '当前节点', width: 160 },
  { dataIndex: 'supervisorUserName', title: '主管', width: 150 },
  { dataIndex: 'finalScore', title: '主管汇总分', width: 120 },
  { dataIndex: 'status', title: '状态', width: 100 },
  { dataIndex: 'action', fixed: 'right', title: '操作', width: 90 },
];

const resultColumns: TableColumnsType = [
  { dataIndex: 'publicTime', title: '公示时间' },
  { dataIndex: 'supervisorUserName', title: '主管' },
  { dataIndex: 'finalScore', title: '最终分' },
  { dataIndex: 'grade', title: '等级' },
  { dataIndex: 'employeeConfirmed', title: '确认状态' },
];

function instanceStatus(status?: number): { color: string; text: string } {
  return INSTANCE_STATUS_MAP[status ?? 1] ?? { color: 'default', text: '-' };
}

function gradeColor(grade?: string) {
  if (grade === 'C') return 'red';
  if (grade === 'C+') return 'orange';
  return 'blue';
}

async function load() {
  loading.value = true;
  try {
    const [myInstances, myResults, supervisorPending, employeePending] =
      await Promise.all([
        getMyInstancePage({ pageNo: 1, pageSize: 10 }),
        getMyResults(),
        getMyPendingSupervisorReviews(),
        getMyPendingReviews(),
      ]);
    instances.value = myInstances.list;
    results.value = myResults;
    supervisorReviews.value = supervisorPending || [];
    employeeReviews.value = employeePending || [];
    syncRouteReviewAction();
  } finally {
    loading.value = false;
  }
}

function openInstance(record: JixiaoApi.Instance) {
  router.push(
    `/fdmperformance/batches/${record.batchId}/instances/${record.id}`,
  );
}

function openReview(review: JixiaoApi.Review, mode: ReviewMode) {
  if (!review.id) return;
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
  await load();
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
      await load();
    },
    title: '确认绩效复盘',
  });
}

watch(
  () => [route.query.reviewId, route.query.reviewAction],
  syncRouteReviewAction,
);

onMounted(load);
</script>

<template>
  <PerformanceShell title="我的绩效">
    <div
      v-for="review in supervisorReviews"
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

    <div class="panel">
      <div class="panel-head"><strong>当前考核</strong></div>
      <Table
        class="performance-compact-table"
        :columns="instanceColumns"
        :data-source="instances"
        :loading="loading"
        :pagination="false"
        row-key="id"
        size="small"
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
          <template v-else-if="column.dataIndex === 'status'">
            <Tag :color="instanceStatus(record.status).color">
              {{ instanceStatus(record.status).text }}
            </Tag>
          </template>
          <template v-else-if="column.dataIndex === 'action'">
            <Button size="small" type="link" @click="openInstance(record)">
              处理
            </Button>
          </template>
        </template>
      </Table>
    </div>

    <div class="panel">
      <div class="panel-head"><strong>已公示结果</strong></div>
      <Table
        class="performance-compact-table"
        :columns="resultColumns"
        :data-source="results"
        :loading="loading"
        :pagination="false"
        row-key="id"
        size="small"
      >
        <template #bodyCell="{ column, record }">
          <template v-if="column.dataIndex === 'grade'">
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
          </template>
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
