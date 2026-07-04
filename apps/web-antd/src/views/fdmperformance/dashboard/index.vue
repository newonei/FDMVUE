<script lang="ts" setup>
import type { TableColumnsType } from 'ant-design-vue';

import { computed, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';

import { IconifyIcon } from '@vben/icons';

import { Button, Card, Empty, Space, Statistic, Table, Tag } from 'ant-design-vue';

import {
  type FdmPerformanceAssessmentApi,
  getFdmPerformanceAssessmentBatchPage,
  getFdmPerformanceAssessmentResultPage,
  getFdmPerformanceAssessmentTaskPage,
} from '#/api/fdmperformance/assessment';
import { getFdmPerformanceIndicatorPage } from '#/api/fdmperformance/indicator';
import { getFdmPerformanceTemplatePage } from '#/api/fdmperformance/template';

import { mapApiBatch } from '../shared/api-adapter';
import { batchStatusMetaMap } from '../shared/model';
import PerformanceShell from '../shared/PerformanceShell.vue';
import { usePerformancePath } from '../shared/route';

defineOptions({ name: 'FdmPerformanceDashboard' });

const router = useRouter();
const { performancePath } = usePerformancePath();
const loading = ref(false);
const apiBatches = ref<ReturnType<typeof mapApiBatch>[]>([]);
const apiTasks = ref<FdmPerformanceAssessmentApi.Task[]>([]);
const apiResults = ref<FdmPerformanceAssessmentApi.Result[]>([]);
const apiTemplateTotal = ref(0);
const apiIndicatorTotal = ref(0);

const activeBatch = computed(() => apiBatches.value[0]);
const pendingCount = computed(() => apiTasks.value.length);
const finishedRatio = computed(() => {
  const total = apiBatches.value.reduce((sum, item) => sum + Number(item.instanceCount || 0), 0) || 1;
  const finished = apiResults.value.filter((item) => item.resultVisible).length;
  return Math.round((finished / total) * 100);
});
const templateCount = computed(() => apiTemplateTotal.value);
const indicatorCount = computed(() => apiIndicatorTotal.value);
const todoRows = computed(() =>
  apiTasks.value.map((item) => ({
    desc: `批次 ${item.batchId || '-'} · 实例 ${item.instanceId || '-'}`,
    id: item.id,
    title: item.nodeName || '待办任务',
    to: performancePath(`/batches/${item.batchId}`),
  })),
);
const resultRows = computed(() =>
  apiResults.value.map((item) => ({
    grade: item.gradeName || '-',
    id: item.id,
    score: item.totalScore ?? '-',
    title: item.userName || `用户${item.userId || '-'}`,
  })),
);
const batchRows = computed(() =>
  apiBatches.value.map((item) => ({
    id: item.id,
    instanceCount: Number(item.instanceCount || 0),
    name: item.name,
    period: item.period,
    status: item.status,
  })),
);

const batchColumns: TableColumnsType = [
  { dataIndex: 'name', title: '考核名称' },
  { dataIndex: 'period', title: '时间周期', width: 160 },
  { dataIndex: 'status', title: '状态', width: 140 },
  { dataIndex: 'instances', title: '参与人数', width: 120 },
  { dataIndex: 'action', fixed: 'right', title: '操作', width: 120 },
];

function getBatchMeta(status: unknown) {
  return batchStatusMetaMap[status as keyof typeof batchStatusMetaMap];
}

async function loadDashboard() {
  loading.value = true;
  try {
    const [batchPage, taskPage, resultPage, templatePage, indicatorPage] = await Promise.all([
      getFdmPerformanceAssessmentBatchPage({ pageNo: 1, pageSize: 10 }),
      getFdmPerformanceAssessmentTaskPage({ pageNo: 1, pageSize: 20, status: 0 }),
      getFdmPerformanceAssessmentResultPage({ pageNo: 1, pageSize: 20 }),
      getFdmPerformanceTemplatePage({ pageNo: 1, pageSize: 1 }),
      getFdmPerformanceIndicatorPage({ pageNo: 1, pageSize: 1 }),
    ]);
    apiBatches.value = (batchPage.list || []).map((item) => mapApiBatch(item));
    apiTasks.value = taskPage.list || [];
    apiResults.value = resultPage.list || [];
    apiTemplateTotal.value = templatePage.total || 0;
    apiIndicatorTotal.value = indicatorPage.total || 0;
  } finally {
    loading.value = false;
  }
}

onMounted(loadDashboard);
</script>

<template>
  <PerformanceShell
    description="查看绩效待办、进行中的考核批次和个人考核结果。"
    title="绩效工作台"
  >
    <template #actions>
      <Button @click="router.push(performancePath('/templates'))">考评表</Button>
      <Button type="primary" @click="router.push(performancePath('/launch'))">发起考核</Button>
    </template>

    <div class="metric-grid">
      <Card>
        <Statistic :value="pendingCount" title="待处理事项">
          <template #prefix><IconifyIcon icon="lucide:list-checks" /></template>
        </Statistic>
      </Card>
      <Card>
        <Statistic :value="templateCount" title="考评表">
          <template #prefix><IconifyIcon icon="lucide:file-check-2" /></template>
        </Statistic>
      </Card>
      <Card>
        <Statistic :value="indicatorCount" title="指标库指标">
          <template #prefix><IconifyIcon icon="lucide:database" /></template>
        </Statistic>
      </Card>
      <Card>
        <Statistic :value="finishedRatio" suffix="%" title="当前结果完成率">
          <template #prefix><IconifyIcon icon="lucide:chart-column" /></template>
        </Statistic>
      </Card>
    </div>

    <div class="content-grid">
      <Card title="我的待办">
        <div v-if="todoRows.length" class="todo-list">
          <div v-for="item in todoRows.slice(0, 5)" :key="item.id" class="todo-item">
            <div>
              <strong>{{ item.title }}</strong>
              <span>{{ item.desc }}</span>
            </div>
            <Button size="small" type="link" @click="router.push(item.to)">处理</Button>
          </div>
        </div>
        <Empty v-else description="暂无需要处理的待办" />
      </Card>

      <Card title="我的考核结果">
        <div v-if="resultRows.length" class="result-list">
          <div v-for="item in resultRows" :key="item.id" class="result-item">
            <span>{{ item.title }}</span>
            <strong>{{ item.score }}</strong>
            <Tag color="green">{{ item.grade }}</Tag>
          </div>
        </div>
        <Empty v-else description="暂无考核结果" />
      </Card>
    </div>

    <Card title="已发起考核">
      <Table
        :columns="batchColumns"
        :data-source="batchRows"
        :loading="loading"
        :pagination="{ pageSize: 5 }"
        row-key="id"
      >
        <template #bodyCell="{ column, record }">
          <template v-if="column.dataIndex === 'status'">
            <Tag :color="getBatchMeta(record.status).color">{{ getBatchMeta(record.status).label }}</Tag>
          </template>
          <template v-else-if="column.dataIndex === 'instances'">
            {{ record.instanceCount }}
          </template>
          <template v-else-if="column.dataIndex === 'action'">
            <Space>
              <Button size="small" type="link" @click="router.push(performancePath(`/batches/${record.id}`))">查看</Button>
            </Space>
          </template>
        </template>
      </Table>
    </Card>

    <Card v-if="activeBatch" title="当前流程概览">
      <div class="stage-row">
        <div class="stage done">指标制定</div>
        <div class="stage done">指标确认</div>
        <div class="stage active">执行中/评分</div>
        <div class="stage">人事审核</div>
        <div class="stage">结果公示</div>
      </div>
    </Card>
  </PerformanceShell>
</template>

<style scoped>
.metric-grid,
.content-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 14px;
}

.content-grid {
  grid-template-columns: 2fr 1fr;
}

.todo-list,
.result-list {
  display: grid;
  gap: 10px;
}

.todo-item,
.result-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 12px 0;
  border-bottom: 1px solid #f1f5f9;
}

.todo-item strong,
.todo-item span {
  display: block;
}

.todo-item span {
  margin-top: 4px;
  color: #64748b;
}

.stage-row {
  display: grid;
  grid-template-columns: repeat(5, minmax(0, 1fr));
  gap: 8px;
}

.stage {
  min-height: 42px;
  padding: 10px;
  color: #64748b;
  text-align: center;
  background: #f3f4f6;
  border-radius: 6px;
}

.stage.done {
  color: #08979c;
  background: #e6fffb;
}

.stage.active {
  color: #1677ff;
  background: #eaf3ff;
  border: 1px solid #91caff;
}

@media (max-width: 1200px) {
  .metric-grid,
  .content-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (max-width: 700px) {
  .metric-grid,
  .content-grid,
  .stage-row {
    grid-template-columns: 1fr;
  }
}
</style>
