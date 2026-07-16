<script lang="ts" setup>
import type { TableColumnsType } from 'ant-design-vue';

import type { JixiaoApi } from '#/api/fdmperformance';

import { computed, reactive, ref } from 'vue';

import { IconifyIcon } from '@vben/icons';

import {
  Alert,
  Button,
  Descriptions,
  Divider,
  Form,
  Input,
  message,
  Select,
  Space,
  Table,
  Tag,
} from 'ant-design-vue';

import { batchLaunchAssessments, getLaunchPreview } from '#/api/fdmperformance';

import { PERIOD_OPTIONS } from '../shared/constants';
import PerformanceShell from '../shared/PerformanceShell.vue';
import TemplatePickerModal from './components/TemplatePickerModal.vue';

defineOptions({ name: 'FdmPerformanceLaunch' });

type LaunchRow = JixiaoApi.LaunchBatchItem & {
  template: JixiaoApi.TemplateSelectItem;
};

const submitting = ref(false);
const previewLoading = ref(false);
const templatePickerOpen = ref(false);
const launchRows = ref<LaunchRow[]>([]);
const preview = ref<JixiaoApi.LaunchPreview>();
const previewTemplateId = ref<number>();
const commonForm = reactive<Omit<JixiaoApi.LaunchBatchReq, 'items'>>({
  endDate: undefined,
  remark: '',
  startDate: undefined,
});

const selectedTemplates = computed(() =>
  launchRows.value.map((item) => item.template),
);
const totalPersonCount = computed(() =>
  launchRows.value.reduce(
    (total, item) => total + item.template.personCount,
    0,
  ),
);

const launchColumns: TableColumnsType = [
  { dataIndex: 'template', title: '考评表', width: 230 },
  { dataIndex: 'periodType', title: '考核周期', width: 100 },
  { dataIndex: 'periodKey', title: '周期标识', width: 180 },
  { dataIndex: 'personCount', title: '人数', width: 80 },
  { dataIndex: 'indicatorCount', title: '指标', width: 80 },
  { dataIndex: 'name', title: '批次名称', width: 260 },
  { dataIndex: 'action', fixed: 'right', title: '操作', width: 130 },
];

const personColumns: TableColumnsType = [
  { dataIndex: 'userName', title: '被考核人' },
  { dataIndex: 'supervisorUserName', title: '直属主管' },
  { dataIndex: 'superiorSupervisorUserName', title: '主管上级' },
  { dataIndex: 'deptId', title: '部门 ID', width: 110 },
];

const indicatorColumns: TableColumnsType = [
  { dataIndex: 'dimensionName', title: '维度', width: 140 },
  { dataIndex: 'name', title: '指标名称' },
  { dataIndex: 'weight', title: '权重', width: 100 },
  { dataIndex: 'scoreMethod', title: '评分方式', width: 120 },
];

const flatIndicators = computed(() =>
  (preview.value?.dimensions || []).flatMap((dimension) =>
    (dimension.indicators || []).map((item) => ({
      ...item,
      dimensionName: dimension.name,
    })),
  ),
);

function periodLabel(periodType?: string) {
  return (
    PERIOD_OPTIONS.find((item) => item.value === periodType)?.label ||
    periodType ||
    '-'
  );
}

function pad2(value: number) {
  return String(value).padStart(2, '0');
}

function addMonths(offset: number) {
  const now = new Date();
  const date = new Date(now.getFullYear(), now.getMonth() + offset, 1);
  return { month: date.getMonth() + 1, year: date.getFullYear() };
}

function getQuarterByOffset(offset: number) {
  const now = new Date();
  const currentQuarter = Math.floor(now.getMonth() / 3);
  const date = new Date(now.getFullYear(), currentQuarter * 3 + offset * 3, 1);
  return {
    quarter: Math.floor(date.getMonth() / 3) + 1,
    year: date.getFullYear(),
  };
}

function getHalfYearByOffset(offset: number) {
  const now = new Date();
  const currentHalfStartMonth = now.getMonth() < 6 ? 0 : 6;
  const date = new Date(
    now.getFullYear(),
    currentHalfStartMonth + offset * 6,
    1,
  );
  return {
    half: date.getMonth() < 6 ? 1 : 2,
    year: date.getFullYear(),
  };
}

function buildPeriodOptions(periodType?: string) {
  if (periodType === 'MONTH') {
    return Array.from({ length: 15 }, (_, index) => {
      const item = addMonths(index - 2);
      const value = `${item.year}-${pad2(item.month)}`;
      return { label: `${item.year}年${pad2(item.month)}月`, value };
    });
  }
  if (periodType === 'QUARTER') {
    return Array.from({ length: 9 }, (_, index) => {
      const item = getQuarterByOffset(index - 1);
      const value = `${item.year}-Q${item.quarter}`;
      return { label: `${item.year}年Q${item.quarter}`, value };
    });
  }
  if (periodType === 'HALF_YEAR') {
    return Array.from({ length: 7 }, (_, index) => {
      const item = getHalfYearByOffset(index - 1);
      const value = `${item.year}-H${item.half}`;
      return {
        label: `${item.year}年${item.half === 1 ? '上半年' : '下半年'}`,
        value,
      };
    });
  }
  if (periodType === 'YEAR') {
    const year = new Date().getFullYear();
    return Array.from({ length: 6 }, (_, index) => {
      const value = String(year + index - 1);
      return { label: `${value}年度`, value };
    });
  }
  if (periodType === 'PROBATION') {
    return Array.from({ length: 15 }, (_, index) => {
      const item = addMonths(index - 2);
      const value = `${item.year}-${pad2(item.month)}-PROBATION`;
      return { label: `${item.year}年${pad2(item.month)}月试用期`, value };
    });
  }
  return [];
}

function getDefaultPeriodKey(periodType?: string) {
  if (periodType === 'MONTH') {
    const item = addMonths(0);
    return `${item.year}-${pad2(item.month)}`;
  }
  if (periodType === 'QUARTER') {
    const item = getQuarterByOffset(0);
    return `${item.year}-Q${item.quarter}`;
  }
  if (periodType === 'HALF_YEAR') {
    const item = getHalfYearByOffset(0);
    return `${item.year}-H${item.half}`;
  }
  if (periodType === 'YEAR') {
    return String(new Date().getFullYear());
  }
  if (periodType === 'PROBATION') {
    const item = addMonths(0);
    return `${item.year}-${pad2(item.month)}-PROBATION`;
  }
  return '';
}

function createLaunchRow(
  template: JixiaoApi.TemplateSelectItem,
  existing?: LaunchRow,
): LaunchRow {
  const periodOptions = buildPeriodOptions(template.periodType);
  const existingPeriodKey = existing?.periodKey;
  const periodKey =
    existingPeriodKey &&
    periodOptions.some((option) => option.value === existingPeriodKey)
      ? existingPeriodKey
      : getDefaultPeriodKey(template.periodType);
  return {
    name: existing?.name || `${template.name}-${periodKey}`,
    periodKey,
    template,
    templateId: template.id,
  };
}

function confirmTemplates(templates: JixiaoApi.TemplateSelectItem[]) {
  const existingMap = new Map(
    launchRows.value.map((item) => [item.templateId, item]),
  );
  launchRows.value = templates.map((template) =>
    createLaunchRow(template, existingMap.get(template.id)),
  );
  if (
    previewTemplateId.value &&
    !launchRows.value.some(
      (item) => item.templateId === previewTemplateId.value,
    )
  ) {
    preview.value = undefined;
    previewTemplateId.value = undefined;
  }
}

function changePeriod(record: Record<string, any>) {
  const row = record as LaunchRow;
  row.name = `${row.template.name}-${row.periodKey}`;
}

function removeTemplate(templateId: number) {
  launchRows.value = launchRows.value.filter(
    (item) => item.templateId !== templateId,
  );
  if (previewTemplateId.value === templateId) {
    preview.value = undefined;
    previewTemplateId.value = undefined;
  }
}

async function openPreview(record: Record<string, any>) {
  const row = record as LaunchRow;
  previewTemplateId.value = row.templateId;
  preview.value = undefined;
  previewLoading.value = true;
  try {
    preview.value = await getLaunchPreview(row.templateId);
  } finally {
    previewLoading.value = false;
  }
}

async function submit() {
  if (launchRows.value.length === 0) {
    message.warning('请至少选择一张考评表');
    return;
  }
  const invalidRow = launchRows.value.find(
    (item) => !item.periodKey?.trim() || !item.name?.trim(),
  );
  if (invalidRow) {
    message.warning(`请完善“${invalidRow.template.name}”的周期和批次名称`);
    return;
  }
  submitting.value = true;
  try {
    const batchIds = await batchLaunchAssessments({
      ...commonForm,
      items: launchRows.value.map((item) => ({
        name: item.name.trim(),
        periodKey: item.periodKey.trim(),
        templateId: item.templateId,
      })),
    });
    message.success(`已发起 ${batchIds.length} 个考核批次`);
    launchRows.value = [];
    preview.value = undefined;
    previewTemplateId.value = undefined;
  } finally {
    submitting.value = false;
  }
}
</script>

<template>
  <PerformanceShell title="发起考核">
    <Alert
      message="可一次选择多张考评表。系统会先校验全部考评表和周期，再为每名被考核人创建独立 BPM 流程实例。"
      show-icon
      type="info"
    />

    <div class="launch-panel">
      <Form layout="vertical">
        <Form.Item label="考评表" required>
          <button
            class="template-trigger"
            :class="[{ 'has-value': launchRows.length > 0 }]"
            type="button"
            @click="templatePickerOpen = true"
          >
            <span v-if="launchRows.length" class="template-trigger-content">
              <strong>已选择 {{ launchRows.length }} 张考评表</strong>
              <span>
                共 {{ totalPersonCount }} 人次，可继续添加或移除考评表
              </span>
            </span>
            <span v-else class="template-placeholder">
              点击选择一张或多张考评表
            </span>
            <IconifyIcon icon="lucide:chevron-right" />
          </button>
        </Form.Item>

        <div v-if="launchRows.length" class="launch-list">
          <Table
            :columns="launchColumns"
            :data-source="launchRows"
            :pagination="false"
            :scroll="{ x: 1060 }"
            row-key="templateId"
            size="small"
          >
            <template #bodyCell="{ column, record }">
              <template v-if="column.dataIndex === 'template'">
                <div class="template-cell">
                  <strong :title="record.template.name">
                    {{ record.template.name }}
                  </strong>
                  <span :title="record.template.deptNames.join('、')">
                    {{
                      record.template.deptNames.length
                        ? record.template.deptNames.join('、')
                        : '未设置部门'
                    }}
                  </span>
                </div>
              </template>
              <template v-else-if="column.dataIndex === 'periodType'">
                <Tag color="blue">
                  {{ periodLabel(record.template.periodType) }}
                </Tag>
              </template>
              <template v-else-if="column.dataIndex === 'periodKey'">
                <Select
                  v-model:value="record.periodKey"
                  :options="buildPeriodOptions(record.template.periodType)"
                  class="period-select"
                  option-filter-prop="label"
                  show-search
                  @change="changePeriod(record)"
                />
              </template>
              <template v-else-if="column.dataIndex === 'personCount'">
                {{ record.template.personCount }}
              </template>
              <template v-else-if="column.dataIndex === 'indicatorCount'">
                {{ record.template.indicatorCount }}
              </template>
              <template v-else-if="column.dataIndex === 'name'">
                <Input v-model:value="record.name" />
              </template>
              <template v-else-if="column.dataIndex === 'action'">
                <Space>
                  <Button
                    :loading="
                      previewLoading && previewTemplateId === record.templateId
                    "
                    size="small"
                    type="link"
                    @click="openPreview(record)"
                  >
                    预览
                  </Button>
                  <Button
                    danger
                    size="small"
                    type="link"
                    @click="removeTemplate(record.templateId)"
                  >
                    移除
                  </Button>
                </Space>
              </template>
            </template>
          </Table>
        </div>

        <div class="shared-grid">
          <Form.Item label="开始日期">
            <Input
              v-model:value="commonForm.startDate"
              placeholder="YYYY-MM-DD"
            />
          </Form.Item>
          <Form.Item label="结束日期">
            <Input
              v-model:value="commonForm.endDate"
              placeholder="YYYY-MM-DD"
            />
          </Form.Item>
          <Form.Item label="备注">
            <Input v-model:value="commonForm.remark" />
          </Form.Item>
        </div>

        <Button
          :disabled="launchRows.length === 0"
          :loading="submitting"
          type="primary"
          @click="submit"
        >
          批量发起{{ launchRows.length ? `（${launchRows.length}）` : '' }}
        </Button>
      </Form>
    </div>

    <div v-if="preview" class="preview">
      <Descriptions bordered size="small" :column="3">
        <Descriptions.Item label="考评表">
          {{ preview.templateName }}
        </Descriptions.Item>
        <Descriptions.Item label="周期">
          {{ periodLabel(preview.periodType) }}
        </Descriptions.Item>
        <Descriptions.Item label="流程定义">
          {{ preview.processDefinitionKey }}
        </Descriptions.Item>
      </Descriptions>

      <Divider orientation="left">人员与主管</Divider>
      <Table
        :columns="personColumns"
        :data-source="preview.persons || []"
        :pagination="false"
        row-key="userId"
        size="small"
      />

      <Divider orientation="left">指标快照</Divider>
      <Table
        :columns="indicatorColumns"
        :data-source="flatIndicators"
        :pagination="false"
        row-key="id"
        size="small"
      >
        <template #bodyCell="{ column, record }">
          <template v-if="column.dataIndex === 'weight'">
            <Tag>{{ record.weight || 0 }}%</Tag>
          </template>
        </template>
      </Table>
    </div>

    <TemplatePickerModal
      v-model:open="templatePickerOpen"
      :selected="selectedTemplates"
      @confirm="confirmTemplates"
    />
  </PerformanceShell>
</template>

<style scoped>
.launch-panel,
.preview {
  padding: 14px;
  background: #fff;
  border: 1px solid #edf0f4;
  border-radius: 8px;
}

.launch-list {
  margin-bottom: 16px;
}

.shared-grid {
  display: grid;
  grid-template-columns: 180px 180px minmax(240px, 1fr);
  gap: 12px;
}

.template-trigger {
  display: flex;
  width: 100%;
  min-height: 44px;
  padding: 6px 11px;
  font-size: 14px;
  color: #8c8c8c;
  text-align: left;
  cursor: pointer;
  background: #fff;
  border: 1px solid #d9d9d9;
  border-radius: 6px;
  transition:
    border-color 0.2s,
    box-shadow 0.2s;
  align-items: center;
  justify-content: space-between;
}

.template-trigger:hover,
.template-trigger:focus-visible {
  border-color: #4096ff;
  outline: none;
  box-shadow: 0 0 0 2px rgb(5 145 255 / 10%);
}

.template-trigger.has-value {
  color: #1f2329;
}

.template-trigger-content,
.template-cell {
  display: flex;
  min-width: 0;
  flex-direction: column;
}

.template-trigger-content strong,
.template-trigger-content span,
.template-cell strong,
.template-cell span {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.template-trigger-content span,
.template-cell span {
  margin-top: 2px;
  font-size: 12px;
  color: #8c8c8c;
}

.template-placeholder {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.period-select {
  width: 100%;
}

@media (max-width: 900px) {
  .shared-grid {
    grid-template-columns: 1fr;
  }
}
</style>
