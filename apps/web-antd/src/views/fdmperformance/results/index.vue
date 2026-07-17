<script lang="ts" setup>
import type { TableColumnsType } from 'ant-design-vue';

import type { JixiaoApi } from '#/api/fdmperformance';

import { computed, onMounted, reactive, ref } from 'vue';

import {
  Button,
  DatePicker,
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
  batchPublishResults,
  getResultPage,
  getReviewPage,
  publishResult,
} from '#/api/fdmperformance';

import { GRADE_OPTIONS, REVIEW_STATUS_MAP } from '../shared/constants';
import PerformanceShell from '../shared/PerformanceShell.vue';

defineOptions({ name: 'FdmPerformanceResults' });

const resultLoading = ref(false);
const batchPublishing = ref(false);
const reviewLoading = ref(false);
const adjustOpen = ref(false);
const reviewOpen = ref(false);
const results = ref<JixiaoApi.Result[]>([]);
const reviews = ref<JixiaoApi.Review[]>([]);
const activeReview = ref<JixiaoApi.Review>();
const resultTotal = ref(0);
const reviewTotal = ref(0);
const selectedResultIds = ref<number[]>([]);

function currentMonthKey() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

const periodKey = ref(currentMonthKey());
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
const resultRowSelection = computed(() => ({
  preserveSelectedRowKeys: true,
  selectedRowKeys: selectedResultIds.value,
  getCheckboxProps: (record: JixiaoApi.Result) => ({
    disabled: !canPublishResult(record),
  }),
  onChange: (keys: Array<number | string>) => {
    selectedResultIds.value = keys
      .map(Number)
      .filter((key) => Number.isFinite(key));
  },
}));

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
  { dataIndex: 'triggerGrade', title: '触发等级', width: 100 },
  { dataIndex: 'bossUserName', title: '老板' },
  { dataIndex: 'generalManagerUserName', title: '总经理' },
  { dataIndex: 'status', title: '状态', width: 100 },
  { dataIndex: 'submittedTime', title: '主管提交时间', width: 180 },
  { dataIndex: 'employeeConfirmedTime', title: '员工确认时间', width: 180 },
  { dataIndex: 'action', fixed: 'right', title: '操作', width: 100 },
];

function reviewStatus(status?: number): { color: string; text: string } {
  return REVIEW_STATUS_MAP[status ?? 0] ?? { color: 'default', text: '-' };
}

function canPublishResult(record: JixiaoApi.Result) {
  return typeof record.id === 'number' && record.publicStatus !== 1;
}

async function loadResults() {
  resultLoading.value = true;
  try {
    const data = await getResultPage({
      ...resultQuery,
      periodKey: periodKey.value,
    });
    results.value = data.list;
    resultTotal.value = data.total;
  } finally {
    resultLoading.value = false;
  }
}

async function loadReviews() {
  reviewLoading.value = true;
  try {
    const data = await getReviewPage({
      ...reviewQuery,
      periodKey: periodKey.value,
    });
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
  selectedResultIds.value = selectedResultIds.value.filter(
    (id) => id !== record.id,
  );
  message.success('结果已公示');
  await loadResults();
}

async function submitBatchPublish() {
  if (selectedResultIds.value.length === 0) {
    return;
  }
  const resultIds = [...selectedResultIds.value];
  batchPublishing.value = true;
  try {
    await batchPublishResults({ resultIds });
    selectedResultIds.value = [];
    message.success(`已批量公示 ${resultIds.length} 条绩效结果`);
    await loadResults();
  } finally {
    batchPublishing.value = false;
  }
}

function openReview(record: JixiaoApi.Review) {
  activeReview.value = record;
  reviewOpen.value = true;
}

function searchResults() {
  resultQuery.pageNo = 1;
  selectedResultIds.value = [];
  void loadResults();
}

function filterReviews() {
  reviewQuery.pageNo = 1;
  void loadReviews();
}

function changePeriodMonth() {
  resultQuery.pageNo = 1;
  reviewQuery.pageNo = 1;
  selectedResultIds.value = [];
  void Promise.all([loadResults(), loadReviews()]);
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
  void Promise.all([loadResults(), loadReviews()]);
});
</script>

<template>
  <PerformanceShell title="结果与复盘">
    <div class="filter-bar">
      <DatePicker
        v-model:value="periodKey"
        :allow-clear="false"
        format="YYYY年MM月"
        :input-read-only="true"
        picker="month"
        placeholder="选择月份"
        value-format="YYYY-MM"
        @change="changePeriodMonth"
      />
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
      <Button type="primary" @click="searchResults">查询结果</Button>
      <div class="batch-actions">
        <span class="selected-count">
          已选择 {{ selectedResultIds.length }} 项
        </span>
        <Button
          :disabled="selectedResultIds.length === 0"
          size="small"
          type="link"
          @click="selectedResultIds = []"
        >
          清空
        </Button>
        <Popconfirm
          :title="`确认公示选中的 ${selectedResultIds.length} 条绩效结果？`"
          @confirm="submitBatchPublish"
        >
          <Button
            :disabled="selectedResultIds.length === 0"
            :loading="batchPublishing"
            type="primary"
          >
            批量公示
          </Button>
        </Popconfirm>
      </div>
    </div>

    <Table
      class="performance-compact-table"
      :columns="resultColumns"
      :data-source="results"
      :loading="resultLoading"
      :row-selection="resultRowSelection"
      :pagination="{
        current: resultQuery.pageNo,
        pageSize: resultQuery.pageSize,
        size: 'small',
        total: resultTotal,
      }"
      row-key="id"
      size="small"
      @change="changeResultPage"
    >
      <template #bodyCell="{ column, record }">
        <template v-if="column.dataIndex === 'grade'">
          <Tag
            :color="
              record.grade === 'C'
                ? 'red'
                : record.grade === 'C+'
                  ? 'orange'
                  : 'blue'
            "
          >
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
              v-if="canPublishResult(record)"
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
      <strong>C / C+ 绩效复盘</strong>
      <Space>
        <Select
          v-model:value="reviewQuery.status"
          allow-clear
          :options="[
            { label: '待主管填写', value: 0 },
            { label: '待员工确认', value: 1 },
            { label: '已关闭', value: 2 },
            { label: '已完成', value: 3 },
          ]"
          placeholder="状态"
          style="width: 130px"
          @change="filterReviews"
        />
      </Space>
    </div>

    <Table
      class="performance-compact-table"
      :columns="reviewColumns"
      :data-source="reviews"
      :loading="reviewLoading"
      :pagination="{
        current: reviewQuery.pageNo,
        pageSize: reviewQuery.pageSize,
        size: 'small',
        total: reviewTotal,
      }"
      row-key="id"
      size="small"
      @change="changeReviewPage"
    >
      <template #bodyCell="{ column, record }">
        <template v-if="column.dataIndex === 'status'">
          <Tag :color="reviewStatus(record.status).color">
            {{ reviewStatus(record.status).text }}
          </Tag>
        </template>
        <template v-else-if="column.dataIndex === 'triggerGrade'">
          <Tag :color="record.triggerGrade === 'C' ? 'red' : 'orange'">
            {{ record.triggerGrade || '-' }}
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

    <Drawer v-model:open="reviewOpen" :width="640" title="绩效复盘">
      <Form v-if="activeReview" layout="vertical">
        <Form.Item label="员工">{{ activeReview.userName }}</Form.Item>
        <Form.Item label="触发等级">{{ activeReview.triggerGrade }}</Form.Item>
        <Form.Item label="一、员工对本月工作完成情况的评价">
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
        <Form.Item label="五、主管提供的辅导与支持措施">
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
  flex-wrap: wrap;
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

.batch-actions {
  display: flex;
  gap: 4px;
  align-items: center;
  max-width: none;
  margin-left: auto;
}

.selected-count {
  color: #60666f;
  white-space: nowrap;
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

  .batch-actions {
    justify-content: flex-end;
    margin-left: 0;
  }
}
</style>
