<script lang="ts" setup>
import type { TableColumnsType } from 'ant-design-vue';

import type { JixiaoApi } from '#/api/fdmperformance';

import { onMounted, reactive, ref } from 'vue';
import { useRouter } from 'vue-router';

import {
  Button,
  Drawer,
  Empty,
  Form,
  message,
  Space,
  Table,
  Tag,
  Textarea,
} from 'ant-design-vue';

import {
  getMyInstancePage,
  getMyPendingReview,
  getMyResults,
  submitReview,
} from '#/api/fdmperformance';

import {
  GRADE_OPTIONS,
  INSTANCE_STATUS_MAP,
  REVIEW_STATUS_MAP,
  TASK_LABELS,
} from '../shared/constants';
import PerformanceShell from '../shared/PerformanceShell.vue';

defineOptions({ name: 'FdmPerformanceMy' });

const router = useRouter();
const loading = ref(false);
const reviewOpen = ref(false);
const instances = ref<JixiaoApi.Instance[]>([]);
const results = ref<JixiaoApi.Result[]>([]);
const pendingReview = ref<JixiaoApi.Review>();
const reviewForm = reactive<JixiaoApi.ReviewSubmitReq>({
  improvementPlan: '',
  missedIndicators: '',
  reasonAnalysis: '',
  reviewId: 0,
  supportNeeded: '',
  workCompletion: '',
});

const instanceColumns: TableColumnsType = [
  { dataIndex: 'currentTaskName', title: '当前节点', width: 150 },
  { dataIndex: 'supervisorUserName', title: '主管', width: 150 },
  { dataIndex: 'finalScore', title: '主管汇总分', width: 120 },
  { dataIndex: 'status', title: '状态', width: 100 },
  { dataIndex: 'action', fixed: 'right', title: '操作', width: 100 },
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

async function load() {
  loading.value = true;
  try {
    const [myInstances, myResults, review] = await Promise.all([
      getMyInstancePage({ pageNo: 1, pageSize: 10 }),
      getMyResults(),
      getMyPendingReview(),
    ]);
    instances.value = myInstances.list;
    results.value = myResults;
    pendingReview.value = review;
  } finally {
    loading.value = false;
  }
}

function openInstance(record: JixiaoApi.Instance) {
  router.push(
    `/fdmperformance/batches/${record.batchId}/instances/${record.id}`,
  );
}

function openReview() {
  if (!pendingReview.value?.id) return;
  Object.assign(reviewForm, {
    improvementPlan: pendingReview.value.improvementPlan || '',
    missedIndicators: pendingReview.value.missedIndicators || '',
    reasonAnalysis: pendingReview.value.reasonAnalysis || '',
    reviewId: pendingReview.value.id,
    supportNeeded: pendingReview.value.supportNeeded || '',
    workCompletion: pendingReview.value.workCompletion || '',
  });
  reviewOpen.value = true;
}

async function submitReviewForm() {
  await submitReview(reviewForm);
  message.success('复盘已提交');
  reviewOpen.value = false;
  await load();
}

onMounted(load);
</script>

<template>
  <PerformanceShell title="我的绩效">
    <div v-if="pendingReview" class="review-banner">
      <div>
        <strong>C 级绩效复盘待提交</strong>
        <span>
          状态：{{ REVIEW_STATUS_MAP[pendingReview.status || 0]?.text }}
        </span>
      </div>
      <Button type="primary" @click="openReview">填写面谈表</Button>
    </div>

    <div class="panel">
      <div class="panel-head">
        <strong>当前考核</strong>
      </div>
      <Table
        :columns="instanceColumns"
        :data-source="instances"
        :loading="loading"
        :pagination="false"
        row-key="id"
      >
        <template #emptyText>
          <Empty description="暂无当前考核" />
        </template>
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
      <div class="panel-head">
        <strong>已公示结果</strong>
      </div>
      <Table
        :columns="resultColumns"
        :data-source="results"
        :loading="loading"
        :pagination="false"
        row-key="id"
      >
        <template #bodyCell="{ column, record }">
          <template v-if="column.dataIndex === 'grade'">
            <Tag :color="record.grade === 'C' ? 'red' : 'blue'">
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

    <Drawer v-model:open="reviewOpen" :width="640" title="C 级绩效面谈表">
      <Form layout="vertical">
        <Form.Item label="一、你觉得你的本月工作完成情况如何" required>
          <Textarea v-model:value="reviewForm.workCompletion" :rows="3" />
        </Form.Item>
        <Form.Item label="二、你觉得主要原因是什么（客观 + 主观）" required>
          <Textarea v-model:value="reviewForm.reasonAnalysis" :rows="3" />
        </Form.Item>
        <Form.Item label="三、本月主要未达标指标有哪些" required>
          <Textarea v-model:value="reviewForm.missedIndicators" :rows="3" />
        </Form.Item>
        <Form.Item label="四、下个月如何避免 C 级" required>
          <Textarea v-model:value="reviewForm.improvementPlan" :rows="3" />
        </Form.Item>
        <Form.Item label="五、你需要获得怎样的帮助" required>
          <Textarea v-model:value="reviewForm.supportNeeded" :rows="3" />
        </Form.Item>
      </Form>
      <template #footer>
        <Space>
          <Button @click="reviewOpen = false">取消</Button>
          <Button type="primary" @click="submitReviewForm">提交</Button>
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
  background: #fff7e6;
  border-color: #ffd591;
}

.review-banner div {
  display: grid;
  gap: 4px;
}

.panel-head {
  margin-bottom: 10px;
}
</style>
