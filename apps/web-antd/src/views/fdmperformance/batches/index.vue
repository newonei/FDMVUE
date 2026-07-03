<script lang="ts" setup>
import type { TableColumnsType } from 'ant-design-vue';

import { computed, onMounted, reactive, ref } from 'vue';
import { useRouter } from 'vue-router';

import { Button, Card, Form, Input, InputNumber, Modal, Select, Space, Table, Tag, message } from 'ant-design-vue';

import {
  deleteFdmPerformanceAssessmentBatch,
  type FdmPerformanceAssessmentApi,
  getFdmPerformanceAssessmentBatchPage,
  importFdmPerformanceAssessmentHistory,
} from '#/api/fdmperformance/assessment';
import { getFdmPerformanceTemplateSimpleList } from '#/api/fdmperformance/template';

import PerformanceShell from '../shared/PerformanceShell.vue';
import { mapApiBatch, mapApiTemplate } from '../shared/api-adapter';
import type { AssessmentBatch, AssessmentTemplate } from '../shared/model';
import { batchStatusMetaMap } from '../shared/model';
import { usePerformancePath } from '../shared/route';

defineOptions({ name: 'FdmPerformanceBatches' });

const router = useRouter();
const { performancePath } = usePerformancePath();
const keyword = ref('');
const groupMode = ref('不分组');
const apiLoading = ref(false);
const historyImporting = ref(false);
const historyImportOpen = ref(false);
const apiBatches = ref<(AssessmentBatch & { finishedCount?: number; instanceCount?: number })[]>([]);
const apiTemplates = ref<AssessmentTemplate[]>([]);
const historyImportForm = reactive<FdmPerformanceAssessmentApi.HistoryImportReq>({
  defaultScore: 90,
  name: '',
  periodKey: '',
  periodType: 1,
  templateIds: [],
});

const columns: TableColumnsType = [
  { dataIndex: 'name', title: '考核名称' },
  { dataIndex: 'templateId', title: '考评表', width: 260 },
  { dataIndex: 'period', title: '时间周期', width: 150 },
  { dataIndex: 'instances', title: '参与人数', width: 120 },
  { dataIndex: 'status', title: '状态', width: 140 },
  { dataIndex: 'action', fixed: 'right', title: '操作', width: 160 },
];

function getBatchMeta(status: unknown) {
  return batchStatusMetaMap[status as keyof typeof batchStatusMetaMap];
}

const filteredBatches = computed(() => {
  const text = keyword.value.trim();
  const rows = text
    ? apiBatches.value.filter((item) => item.name.includes(text) || item.period.includes(text))
    : apiBatches.value;
  return [...rows].sort((a, b) => {
    if (groupMode.value === '按周期') {
      return b.period.localeCompare(a.period);
    }
    if (groupMode.value === '按考评表') {
      return (getTemplateName(a.templateId) || '').localeCompare(getTemplateName(b.templateId) || '');
    }
    return b.id - a.id;
  });
});

function getTemplateName(templateId: number) {
  return apiTemplates.value.find((item) => item.id === templateId)?.name;
}

function getInstanceCount(record: AssessmentBatch & { instanceCount?: number }) {
  return record.instanceCount ?? record.instances?.length ?? 0;
}

const templateOptions = computed(() =>
  apiTemplates.value
    .filter((item) => item.status === 'enabled')
    .map((item) => ({ label: item.name, value: item.id })),
);
const periodTypeOptions = [
  { label: '月度', value: 1 },
  { label: '季度', value: 2 },
  { label: '半年度', value: 3 },
  { label: '年度', value: 4 },
  { label: '试用期', value: 5 },
  { label: '日', value: 6 },
  { label: '自定义', value: 99 },
];

async function loadApiData() {
  apiLoading.value = true;
  try {
    const [batchPage, templates] = await Promise.all([
      getFdmPerformanceAssessmentBatchPage({ pageNo: 1, pageSize: 50 }),
      getFdmPerformanceTemplateSimpleList(),
    ]);
    apiBatches.value = batchPage.list.map((item) => mapApiBatch(item));
    apiTemplates.value = templates.map((item) => mapApiTemplate(item));
  } finally {
    apiLoading.value = false;
  }
}

function getPreviousMonthKey() {
  const date = new Date();
  date.setMonth(date.getMonth() - 1);
  const month = `${date.getMonth() + 1}`.padStart(2, '0');
  return `${date.getFullYear()}-${month}`;
}

function openHistoryImport() {
  historyImportForm.defaultScore = 90;
  historyImportForm.name = '';
  historyImportForm.periodKey = getPreviousMonthKey();
  historyImportForm.periodType = 1;
  historyImportForm.templateIds = [];
  historyImportOpen.value = true;
}

async function importHistoryFromApi() {
  if (!historyImportForm.periodKey?.trim()) {
    message.warning('请输入历史绩效周期');
    return;
  }
  historyImporting.value = true;
  try {
    const batchId = await importFdmPerformanceAssessmentHistory({
      defaultScore: historyImportForm.defaultScore,
      name: historyImportForm.name?.trim() || undefined,
      periodKey: historyImportForm.periodKey.trim(),
      periodType: historyImportForm.periodType,
      templateIds: historyImportForm.templateIds?.length ? historyImportForm.templateIds : undefined,
    });
    historyImportOpen.value = false;
    message.success(`已导入历史绩效批次 ${batchId}`);
    await loadApiData();
  } finally {
    historyImporting.value = false;
  }
}

function deleteBatch(record: AssessmentBatch) {
  Modal.confirm({
    title: '删除已发起考核',
    content: `确认删除「${record.name}」？删除后会同步清理该批次下的被考核人、任务、评分、结果和日志记录。`,
    okText: '删除',
    okType: 'danger',
    cancelText: '取消',
    async onOk() {
      await deleteFdmPerformanceAssessmentBatch(record.id);
      message.success('已删除考核记录');
      await loadApiData();
    },
  });
}

onMounted(loadApiData);
</script>

<template>
  <PerformanceShell description="查看已发起绩效考核批次，并进入详情处理评分、确认和结果公示。" title="已发起考核">
    <template #actions>
      <Select v-model:value="groupMode" :options="['不分组', '按考评表', '按周期'].map((value) => ({ label: value, value }))" style="width: 160px" />
      <Button :loading="historyImporting" @click="openHistoryImport">导入历史绩效</Button>
      <Button type="primary" @click="router.push(performancePath('/launch'))">发起考核</Button>
    </template>

    <Card title="全部考核">
      <div class="toolbar">
        <Input v-model:value="keyword" allow-clear placeholder="搜索考核名称" />
      </div>
      <Table :columns="columns" :data-source="filteredBatches" :loading="apiLoading" :pagination="{ pageSize: 10 }" row-key="id">
        <template #bodyCell="{ column, record }">
          <template v-if="column.dataIndex === 'templateId'">
            {{ getTemplateName(record.templateId) }}
          </template>
          <template v-else-if="column.dataIndex === 'instances'">
            {{ getInstanceCount(record as AssessmentBatch & { instanceCount?: number }) }}
          </template>
          <template v-else-if="column.dataIndex === 'status'">
            <Tag :color="getBatchMeta(record.status).color">{{ getBatchMeta(record.status).label }}</Tag>
          </template>
          <template v-else-if="column.dataIndex === 'action'">
            <Space>
              <Button size="small" type="link" @click="router.push(performancePath(`/batches/${record.id}`))">查看</Button>
              <Button danger size="small" type="link" @click="deleteBatch(record as AssessmentBatch)">删除</Button>
            </Space>
          </template>
        </template>
      </Table>
    </Card>

    <Modal
      v-model:open="historyImportOpen"
      title="导入历史绩效"
      :confirm-loading="historyImporting"
      @ok="importHistoryFromApi"
    >
      <Form layout="vertical">
        <Form.Item label="考核名称">
          <Input v-model:value="historyImportForm.name" placeholder="为空时按周期自动生成" />
        </Form.Item>
        <Form.Item required label="周期类型">
          <Select v-model:value="historyImportForm.periodType" :options="periodTypeOptions" />
        </Form.Item>
        <Form.Item required label="历史周期">
          <Input v-model:value="historyImportForm.periodKey" placeholder="例如 2026-05" />
        </Form.Item>
        <Form.Item label="参与考评表">
          <Select
            v-model:value="historyImportForm.templateIds"
            allow-clear
            mode="multiple"
            :options="templateOptions"
            placeholder="不选择时导入全部启用考评表"
          />
        </Form.Item>
        <Form.Item required label="默认分数">
          <InputNumber v-model:value="historyImportForm.defaultScore" :max="120" :min="0" addon-after="分" />
        </Form.Item>
      </Form>
    </Modal>
  </PerformanceShell>
</template>

<style scoped>
.toolbar {
  display: flex;
  justify-content: flex-end;
  margin-bottom: 14px;
}

.toolbar :deep(.ant-input-affix-wrapper) {
  width: 260px;
}
</style>
