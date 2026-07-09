<script lang="ts" setup>
import type { TableColumnsType } from 'ant-design-vue';

import type { JixiaoApi } from '#/api/fdmperformance';

import { onMounted, reactive, ref } from 'vue';

import {
  Button,
  Drawer,
  Form,
  InputNumber,
  message,
  Modal,
  Popconfirm,
  Select,
  Space,
  Table,
  Tag,
  Textarea,
} from 'ant-design-vue';

import {
  adjustGrade,
  getResultPage,
  getReviewPage,
  publishResult,
} from '#/api/fdmperformance';

import { GRADE_OPTIONS, REVIEW_STATUS_MAP } from '../shared/constants';
import PerformanceShell from '../shared/PerformanceShell.vue';

defineOptions({ name: 'FdmPerformanceResults' });

const resultLoading = ref(false);
const reviewLoading = ref(false);
const adjustOpen = ref(false);
const reviewOpen = ref(false);
const results = ref<JixiaoApi.Result[]>([]);
const reviews = ref<JixiaoApi.Review[]>([]);
const activeReview = ref<JixiaoApi.Review>();
const resultTotal = ref(0);
const reviewTotal = ref(0);
const resultQuery = reactive({
  batchId: undefined as number | undefined,
  grade: undefined as string | undefined,
  pageNo: 1,
  pageSize: 10,
  publicStatus: undefined as number | undefined,
  userId: undefined as number | undefined,
});
const reviewQuery = reactive({
  pageNo: 1,
  pageSize: 10,
  status: undefined as number | undefined,
  userId: undefined as number | undefined,
});
const adjustForm = reactive<JixiaoApi.GradeAdjustReq>({
  grade: 'B',
  reason: '',
  resultId: 0,
});

const resultColumns: TableColumnsType = [
  { dataIndex: 'userName', title: '员工' },
  { dataIndex: 'supervisorUserName', title: '主管' },
  { dataIndex: 'finalScore', title: '最终分', width: 100 },
  { dataIndex: 'grade', title: '等级', width: 90 },
  { dataIndex: 'publicStatus', title: '公示状态', width: 100 },
  { dataIndex: 'publicTime', title: '公示时间', width: 180 },
  { dataIndex: 'employeeConfirmed', title: '确认', width: 90 },
  { dataIndex: 'action', fixed: 'right', title: '操作', width: 180 },
];

const reviewColumns: TableColumnsType = [
  { dataIndex: 'userName', title: '员工' },
  { dataIndex: 'supervisorUserName', title: '主管' },
  { dataIndex: 'bossUserName', title: '老板' },
  { dataIndex: 'generalManagerUserName', title: '总经理' },
  { dataIndex: 'status', title: '状态', width: 100 },
  { dataIndex: 'submittedTime', title: '提交时间', width: 180 },
  { dataIndex: 'action', fixed: 'right', title: '操作', width: 100 },
];

function reviewStatus(status?: number): { color: string; text: string } {
  return REVIEW_STATUS_MAP[status ?? 0] ?? { color: 'default', text: '-' };
}

async function loadResults() {
  resultLoading.value = true;
  try {
    const data = await getResultPage(resultQuery);
    results.value = data.list;
    resultTotal.value = data.total;
  } finally {
    resultLoading.value = false;
  }
}

async function loadReviews() {
  reviewLoading.value = true;
  try {
    const data = await getReviewPage(reviewQuery);
    reviews.value = data.list;
    reviewTotal.value = data.total;
  } finally {
    reviewLoading.value = false;
  }
}

function openAdjust(record: JixiaoApi.Result) {
  Object.assign(adjustForm, {
    grade: record.grade || 'B',
    reason: '',
    resultId: record.id,
  });
  adjustOpen.value = true;
}

async function submitAdjust() {
  if (!adjustForm.reason.trim()) {
    message.warning('请填写调整原因');
    return;
  }
  await adjustGrade(adjustForm);
  message.success('等级已调整');
  adjustOpen.value = false;
  await Promise.all([loadResults(), loadReviews()]);
}

async function submitPublish(record: JixiaoApi.Result) {
  if (!record.id) {
    return;
  }
  await publishResult({ resultId: record.id });
  message.success('结果已公示');
  await loadResults();
}

function openReview(record: JixiaoApi.Review) {
  activeReview.value = record;
  reviewOpen.value = true;
}

function changeResultPage(pagination: any) {
  resultQuery.pageNo = pagination.current;
  resultQuery.pageSize = pagination.pageSize;
  loadResults();
}

function changeReviewPage(pagination: any) {
  reviewQuery.pageNo = pagination.current;
  reviewQuery.pageSize = pagination.pageSize;
  loadReviews();
}

onMounted(() => {
  loadResults();
  loadReviews();
});
</script>

<template>
  <PerformanceShell title="结果与复盘">
    <div class="filter-bar">
      <InputNumber v-model:value="resultQuery.userId" placeholder="员工 ID" />
      <Select
        v-model:value="resultQuery.grade"
        allow-clear
        :options="GRADE_OPTIONS"
        placeholder="等级"
      />
      <Select
        v-model:value="resultQuery.publicStatus"
        allow-clear
        :options="[
          { label: '未公示', value: 0 },
          { label: '已公示', value: 1 },
        ]"
        placeholder="公示状态"
        style="width: 130px"
      />
      <Button type="primary" @click="loadResults">查询结果</Button>
    </div>

    <Table
      :columns="resultColumns"
      :data-source="results"
      :loading="resultLoading"
      :pagination="{
        current: resultQuery.pageNo,
        pageSize: resultQuery.pageSize,
        total: resultTotal,
      }"
      row-key="id"
      @change="changeResultPage"
    >
      <template #bodyCell="{ column, record }">
        <template v-if="column.dataIndex === 'grade'">
          <Tag :color="record.grade === 'C' ? 'red' : 'blue'">
            {{ record.grade }}
          </Tag>
        </template>
        <template v-else-if="column.dataIndex === 'publicStatus'">
          <Tag :color="record.publicStatus === 1 ? 'green' : 'orange'">
            {{ record.publicStatus === 1 ? '已公示' : '未公示' }}
          </Tag>
        </template>
        <template v-else-if="column.dataIndex === 'employeeConfirmed'">
          <Tag :color="record.employeeConfirmed ? 'green' : 'orange'">
            {{ record.employeeConfirmed ? '已确认' : '待确认' }}
          </Tag>
        </template>
        <template v-else-if="column.dataIndex === 'action'">
          <Space>
            <Button size="small" type="link" @click="openAdjust(record)">
              调整等级
            </Button>
            <Popconfirm
              v-if="record.publicStatus !== 1"
              title="确认公示该绩效结果？"
              @confirm="submitPublish(record)"
            >
              <Button size="small" type="link">公示</Button>
            </Popconfirm>
          </Space>
        </template>
      </template>
    </Table>

    <div class="section-head">
      <strong>C 级绩效复盘</strong>
      <Space>
        <Select
          v-model:value="reviewQuery.status"
          allow-clear
          :options="[
            { label: '待提交', value: 0 },
            { label: '已提交', value: 1 },
            { label: '已关闭', value: 2 },
          ]"
          placeholder="状态"
          style="width: 130px"
          @change="loadReviews"
        />
      </Space>
    </div>

    <Table
      :columns="reviewColumns"
      :data-source="reviews"
      :loading="reviewLoading"
      :pagination="{
        current: reviewQuery.pageNo,
        pageSize: reviewQuery.pageSize,
        total: reviewTotal,
      }"
      row-key="id"
      @change="changeReviewPage"
    >
      <template #bodyCell="{ column, record }">
        <template v-if="column.dataIndex === 'status'">
          <Tag :color="reviewStatus(record.status).color">
            {{ reviewStatus(record.status).text }}
          </Tag>
        </template>
        <template v-else-if="column.dataIndex === 'action'">
          <Button size="small" type="link" @click="openReview(record)">
查看
</Button>
        </template>
      </template>
    </Table>

    <Modal v-model:open="adjustOpen" title="调整绩效等级" @ok="submitAdjust">
      <Form layout="vertical">
        <Form.Item label="绩效等级" required>
          <Select v-model:value="adjustForm.grade" :options="GRADE_OPTIONS" />
        </Form.Item>
        <Form.Item label="调整原因" required>
          <Textarea v-model:value="adjustForm.reason" :rows="4" />
        </Form.Item>
      </Form>
    </Modal>

    <Drawer v-model:open="reviewOpen" :width="640" title="C 级绩效复盘">
      <Form v-if="activeReview" layout="vertical">
        <Form.Item label="员工">{{ activeReview.userName }}</Form.Item>
        <Form.Item label="一、本月工作完成情况">
          <Textarea disabled :rows="3" :value="activeReview.workCompletion" />
        </Form.Item>
        <Form.Item label="二、原因分析">
          <Textarea disabled :rows="3" :value="activeReview.reasonAnalysis" />
        </Form.Item>
        <Form.Item label="三、未达标指标">
          <Textarea disabled :rows="3" :value="activeReview.missedIndicators" />
        </Form.Item>
        <Form.Item label="四、改进方向与目标">
          <Textarea disabled :rows="3" :value="activeReview.improvementPlan" />
        </Form.Item>
        <Form.Item label="五、辅导措施">
          <Textarea disabled :rows="3" :value="activeReview.supportNeeded" />
        </Form.Item>
      </Form>
    </Drawer>
  </PerformanceShell>
</template>

<style scoped>
.filter-bar,
.section-head {
  display: flex;
  gap: 8px;
  align-items: center;
  padding: 12px;
  background: #fff;
  border: 1px solid #edf0f4;
  border-radius: 8px;
}

.filter-bar > * {
  max-width: 180px;
}

.section-head {
  justify-content: space-between;
}

@media (max-width: 800px) {
  .filter-bar,
  .section-head {
    flex-direction: column;
    align-items: stretch;
  }

  .filter-bar > * {
    max-width: none;
  }
}
</style>
