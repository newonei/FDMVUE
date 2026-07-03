<script lang="ts" setup>
import type { TableColumnsType } from 'ant-design-vue';

import { computed, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';

import { Button, Card, Empty, Input, Modal, Space, Table, Tag, message } from 'ant-design-vue';

import {
  confirmMyFdmPerformanceAssessmentIndicators,
  confirmMyFdmPerformanceAssessmentResult,
  getMyFdmPerformanceAssessmentInstancePage,
  submitMyFdmPerformanceAssessmentResultObjection,
  type FdmPerformanceAssessmentApi,
} from '#/api/fdmperformance/assessment';

import PerformanceShell from '../shared/PerformanceShell.vue';
import { apiPeriodKeyToText, mapApiInstance } from '../shared/api-adapter';
import type { AssessmentInstance } from '../shared/model';
import { instanceStatusMetaMap } from '../shared/model';
import { usePerformancePath } from '../shared/route';

defineOptions({ name: 'FdmPerformanceMy' });

const router = useRouter();
const { performancePath } = usePerformancePath();
const objectionModalOpen = ref(false);
const objectionInstanceId = ref<number>();
const objectionText = ref('对评分结果有异议，需要绩效管理员复核评分依据和等级系数。');
const loading = ref(false);
const apiInstances = ref<(AssessmentInstance & {
  apiRaw: FdmPerformanceAssessmentApi.Instance;
  batch: { id: number; name: string };
  employee: { dept?: string; name?: string };
})[]>([]);

const myInstances = computed(() => apiInstances.value);
const myResults = computed(() => myInstances.value.filter((item) => item.resultVisible));
const myTodos = computed(() =>
  myInstances.value.filter(
    (item) =>
      item.status === 'indicatorConfirm' ||
      item.status === 'selfScore' ||
      (item.resultVisible && !item.resultConfirmed && !item.resultObjection),
  ),
);

const columns: TableColumnsType = [
  { dataIndex: 'batch', title: '考核名称' },
  { dataIndex: 'nodeName', title: '当前流程', width: 160 },
  { dataIndex: 'currentExecutor', title: '当前执行人', width: 140 },
  { dataIndex: 'progress', title: '进度', width: 100 },
  { dataIndex: 'finalScore', title: '考核结果', width: 120 },
  { dataIndex: 'grade', title: '绩效等级', width: 120 },
  { dataIndex: 'confirm', title: '确认状态', width: 120 },
  { dataIndex: 'action', fixed: 'right', title: '操作', width: 240 },
];

function getInstanceMeta(status: unknown) {
  return instanceStatusMetaMap[status as keyof typeof instanceStatusMetaMap] || instanceStatusMetaMap.indicatorConfirm;
}

function openSelfScore(item: Record<string, any>) {
  router.push({
    path: performancePath(`/batches/${item.batch.id}/instances/${item.id}`),
    query: { scoreType: 'self', source: 'my' },
  });
}

async function confirmIndicators(instanceId: number) {
  await confirmMyFdmPerformanceAssessmentIndicators(instanceId);
  await loadMyPerformance();
  message.success('指标已确认，进入执行中');
}

async function confirmResult(instanceId: number) {
  await confirmMyFdmPerformanceAssessmentResult(instanceId);
  await loadMyPerformance();
  message.success('结果已确认');
}

function openObjection(instanceId: number) {
  objectionInstanceId.value = instanceId;
  objectionText.value = '对评分结果有异议，需要绩效管理员复核评分依据和等级系数。';
  objectionModalOpen.value = true;
}

async function saveObjection() {
  if (!objectionInstanceId.value) return;
  await submitMyFdmPerformanceAssessmentResultObjection({
    instanceId: objectionInstanceId.value,
    reason: objectionText.value,
  });
  await loadMyPerformance();
  objectionModalOpen.value = false;
  message.success('已提交结果异议');
}

async function loadMyPerformance() {
  loading.value = true;
  try {
    const page = await getMyFdmPerformanceAssessmentInstancePage({
      pageNo: 1,
      pageSize: 100,
    });
    apiInstances.value = (page.list || []).map((item) => ({
      ...mapApiInstance(item),
      apiRaw: item,
      batch: {
        id: Number(item.batchId || 0),
        name:
          item.batchName ||
          (item.periodKey ? `${apiPeriodKeyToText(item.periodKey)}绩效考核` : `考核批次 ${item.batchId || '-'}`),
      },
      employee: { dept: item.deptName, name: item.userName },
    }));
  } finally {
    loading.value = false;
  }
}

onMounted(loadMyPerformance);
</script>

<template>
  <PerformanceShell description="员工视角查看自己的待办、当前考核和已公示结果。" title="我的绩效">
    <div class="my-grid">
      <Card title="我的待办">
        <div v-if="myTodos.length" class="todo-list">
          <div v-for="item in myTodos" :key="item.id" class="todo-item">
            <div>
              <strong>{{ item.batch.name }}</strong>
              <span>{{ item.nodeName }} · {{ item.stayTime }}</span>
            </div>
            <Button v-if="item.status === 'indicatorConfirm'" type="primary" @click="confirmIndicators(item.id)">
              确认指标
            </Button>
            <Button v-else-if="item.status === 'selfScore'" type="primary" @click="openSelfScore(item)">
              去自评
            </Button>
            <Space v-else>
              <Button type="primary" @click="confirmResult(item.id)">确认结果</Button>
              <Button danger @click="openObjection(item.id)">提交异议</Button>
            </Space>
          </div>
        </div>
        <Empty v-else description="暂无需要处理的待办" />
      </Card>
      <Card title="我的考核结果">
        <div v-if="myResults.length" class="result-card">
          <strong>{{ myResults[0]!.finalScore }}</strong>
          <span>{{ myResults[0]!.grade }}</span>
        </div>
        <Empty v-else description="暂无考核结果" />
      </Card>
    </div>

    <Card title="我的考核">
      <Table :columns="columns" :data-source="myInstances" :loading="loading" :pagination="false" row-key="id">
        <template #bodyCell="{ column, record }">
          <template v-if="column.dataIndex === 'batch'">
            {{ record.batch.name }}
          </template>
          <template v-else-if="column.dataIndex === 'nodeName'">
            <Tag :color="getInstanceMeta(record.status).color">{{ record.nodeName }}</Tag>
          </template>
          <template v-else-if="column.dataIndex === 'progress'">
            {{ record.progress }}/8
          </template>
          <template v-else-if="column.dataIndex === 'finalScore'">
            {{ record.finalScore ?? '-' }}
          </template>
          <template v-else-if="column.dataIndex === 'grade'">
            {{ record.grade ?? '-' }}
          </template>
          <template v-else-if="column.dataIndex === 'confirm'">
            <Tag :color="record.resultObjection ? 'red' : record.resultConfirmed ? 'green' : record.resultVisible ? 'blue' : 'default'">
              {{ record.resultObjection ? '结果异议' : record.resultConfirmed ? '已确认' : record.resultVisible ? '待确认' : '-' }}
            </Tag>
          </template>
          <template v-else-if="column.dataIndex === 'action'">
            <Space>
              <Button v-if="record.status === 'indicatorConfirm'" size="small" type="link" @click="confirmIndicators(record.id)">确认指标</Button>
              <Button v-if="record.status === 'selfScore'" size="small" type="link" @click="openSelfScore(record)">自评</Button>
              <Button v-if="record.resultVisible && !record.resultConfirmed && !record.resultObjection" size="small" type="link" @click="confirmResult(record.id)">确认结果</Button>
              <Button v-if="record.resultVisible && !record.resultConfirmed && !record.resultObjection" danger size="small" type="link" @click="openObjection(record.id)">提交异议</Button>
              <Button
                size="small"
                type="link"
                @click="
                  router.push({
                    path: performancePath(`/batches/${record.batch.id}/instances/${record.id}`),
                    query: { source: 'my' },
                  })
                "
              >
                查看
              </Button>
            </Space>
          </template>
        </template>
      </Table>
    </Card>

    <Modal v-model:open="objectionModalOpen" title="提交结果异议" @ok="saveObjection">
      <Input.TextArea v-model:value="objectionText" :rows="4" />
    </Modal>
  </PerformanceShell>
</template>

<style scoped>
.my-grid {
  display: grid;
  grid-template-columns: 2fr 1fr;
  gap: 14px;
}

.todo-list {
  display: grid;
  gap: 12px;
}

.todo-item {
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

.result-card {
  display: grid;
  place-items: center;
  min-height: 160px;
}

.result-card strong {
  color: #1677ff;
  font-size: 42px;
}

.result-card span {
  color: #16a34a;
  font-size: 22px;
  font-weight: 650;
}

@media (max-width: 960px) {
  .my-grid {
    grid-template-columns: 1fr;
  }
}
</style>
