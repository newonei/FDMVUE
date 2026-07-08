<script lang="ts" setup>
import type { TableColumnsType } from 'ant-design-vue';

import type { AssessmentBatch, AssessmentTemplate, BatchStatus } from '../shared/model';

import { computed, onMounted, reactive, ref } from 'vue';
import { useRouter } from 'vue-router';

import { Button, Card, Form, Input, InputNumber, message, Modal, Select, Space, Table, Tag } from 'ant-design-vue';

import {
  deleteFdmPerformanceAssessmentBatch,
  type FdmPerformanceAssessmentApi,
  getFdmPerformanceAssessmentBatchPage,
  importFdmPerformanceAssessmentHistory,
} from '#/api/fdmperformance/assessment';
import { getFdmPerformanceTemplateSimpleList } from '#/api/fdmperformance/template';

import { mapApiBatch, mapApiTemplate } from '../shared/api-adapter';
import { batchStatusMetaMap } from '../shared/model';
import PerformanceShell from '../shared/PerformanceShell.vue';
import { usePerformancePath } from '../shared/route';

defineOptions({ name: 'FdmPerformanceBatches' });

const router = useRouter();
const { performancePath } = usePerformancePath();
const keyword = ref('');
const groupMode = ref<'period' | 'template'>('period');
const apiLoading = ref(false);
const historyImporting = ref(false);
const historyImportOpen = ref(false);
type BatchTableRow = AssessmentBatch & { finishedCount?: number; instanceCount?: number };
type PeriodGroupRow = {
  children: BatchTableRow[];
  finishedCount: number;
  id: string;
  instanceCount: number;
  name: string;
  period: string;
  rowType: 'period-group';
  status: BatchStatus;
};
type BatchDisplayRow = BatchTableRow | PeriodGroupRow;

const apiBatches = ref<BatchTableRow[]>([]);
const apiTemplates = ref<AssessmentTemplate[]>([]);
const historyImportForm = reactive<FdmPerformanceAssessmentApi.HistoryImportReq>({
  defaultScore: 90,
  name: '',
  periodKey: '',
  periodType: 1,
  templateIds: [],
});
const groupModeOptions = [
  { label: '按月份分组', value: 'period' },
  { label: '组内按考评表', value: 'template' },
];

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

function isPeriodGroupRow(record: unknown): record is PeriodGroupRow {
  if (!record || typeof record !== 'object') {
    return false;
  }
  return (
    'rowType' in record &&
    (record as { rowType?: unknown }).rowType === 'period-group'
  );
}

function getComparablePeriod(period: string) {
  return period || '';
}

function getFilteredBatchRows() {
  const text = keyword.value.trim();
  return text
    ? apiBatches.value.filter((item) => {
        const templateName = getTemplateName(item.templateId) || '';
        return item.name.includes(text) || item.period.includes(text) || templateName.includes(text);
      })
    : apiBatches.value;
}

function resolveGroupStatus(children: BatchTableRow[]): BatchStatus {
  const priority: BatchStatus[] = [
    'scoring',
    'hrReview',
    'pendingPublish',
    'resultVisible',
    'executing',
    'indicatorConfirm',
    'finished',
    'canceled',
  ];
  return priority.find((status) => children.some((item) => item.status === status)) || children[0]?.status || 'executing';
}

const filteredBatches = computed<BatchDisplayRow[]>(() => {
  const rows = [...getFilteredBatchRows()];
  const groups = new Map<string, BatchTableRow[]>();
  rows.forEach((item) => {
    const period = item.period || '未设置周期';
    const children = groups.get(period) || [];
    children.push(item);
    groups.set(period, children);
  });

  return [...groups.entries()]
    .map(([period, children]) => {
      const sortedChildren = children.sort((a, b) => {
        const templateCompare = (getTemplateName(a.templateId) || '').localeCompare(getTemplateName(b.templateId) || '');
        return groupMode.value === 'template' ? templateCompare || b.id - a.id : b.id - a.id;
      });
      return {
        children: sortedChildren,
        finishedCount: sortedChildren.reduce((sum, item) => sum + (item.finishedCount || 0), 0),
        id: `period-${period}`,
        instanceCount: sortedChildren.reduce((sum, item) => sum + getInstanceCount(item), 0),
        name: `${period}绩效考核`,
        period,
        rowType: 'period-group' as const,
        status: resolveGroupStatus(sortedChildren),
      };
    })
    .sort((a, b) => getComparablePeriod(b.period).localeCompare(getComparablePeriod(a.period)));
});

function getTemplateName(templateId?: number) {
  return apiTemplates.value.find((item) => item.id === templateId)?.name;
}

function getInstanceCount(record: BatchTableRow) {
  return record.instanceCount ?? record.instances?.length ?? 0;
}

function getGroupTemplateSummary(record: PeriodGroupRow) {
  const names = record.children.map((item) => getTemplateName(item.templateId) || '未命名考评表');
  return `共 ${record.children.length} 张考评表：${names.join('、')}`;
}

function getGroupStatusSummary(record: PeriodGroupRow) {
  const statusLabels = [...new Set(record.children.map((item) => getBatchMeta(item.status)?.label || item.status))];
  return statusLabels.length > 1 ? statusLabels.join(' / ') : statusLabels[0];
}

function getRowKey(record: BatchDisplayRow) {
  return isPeriodGroupRow(record) ? record.id : `batch-${record.id}`;
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
      <Select v-model:value="groupMode" :options="groupModeOptions" style="width: 160px" />
      <Button :loading="historyImporting" @click="openHistoryImport">导入历史绩效</Button>
      <Button type="primary" @click="router.push(performancePath('/launch'))">发起考核</Button>
    </template>

    <Card title="全部考核">
      <div class="toolbar">
        <Input v-model:value="keyword" allow-clear placeholder="搜索考核名称" />
      </div>
      <Table :columns="columns" :data-source="filteredBatches" :loading="apiLoading" :pagination="{ pageSize: 10 }" :row-key="getRowKey">
        <template #bodyCell="{ column, record }">
          <template v-if="column.dataIndex === 'templateId'">
            <span v-if="isPeriodGroupRow(record)" class="group-summary">{{ getGroupTemplateSummary(record) }}</span>
            <span v-else>{{ getTemplateName(record.templateId) }}</span>
          </template>
          <template v-else-if="column.dataIndex === 'instances'">
            {{ isPeriodGroupRow(record) ? record.instanceCount : getInstanceCount(record as BatchTableRow) }}
          </template>
          <template v-else-if="column.dataIndex === 'status'">
            <Tag :color="getBatchMeta(record.status).color">
              {{ isPeriodGroupRow(record) ? getGroupStatusSummary(record) : getBatchMeta(record.status).label }}
            </Tag>
          </template>
          <template v-else-if="column.dataIndex === 'action'">
            <span v-if="isPeriodGroupRow(record)" class="group-action-tip">展开查看批次</span>
            <Space v-else>
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

.group-summary,
.group-action-tip {
  color: #64748b;
}

.group-summary {
  display: inline-block;
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>
