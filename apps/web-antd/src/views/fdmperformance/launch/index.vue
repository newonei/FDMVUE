<script lang="ts" setup>
import type { TableColumnsType } from 'ant-design-vue';

import type { JixiaoApi } from '#/api/fdmperformance';

import { computed, onMounted, reactive, ref } from 'vue';

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

import {
  getEnabledTemplates,
  getLaunchPreview,
  launchAssessment,
} from '#/api/fdmperformance';

import { PERIOD_OPTIONS } from '../shared/constants';
import PerformanceShell from '../shared/PerformanceShell.vue';

defineOptions({ name: 'FdmPerformanceLaunch' });

const submitting = ref(false);
const templates = ref<JixiaoApi.Template[]>([]);
const preview = ref<JixiaoApi.LaunchPreview>();
const form = reactive<JixiaoApi.LaunchReq>({
  name: '',
  periodKey: '',
  templateId: undefined as unknown as number,
});

const templateOptions = computed(() =>
  templates.value.map((item) => ({
    label: item.name,
    value: item.id,
  })),
);
const selectedTemplate = computed(() =>
  templates.value.find((item) => item.id === form.templateId),
);
const selectedPeriodType = computed(
  () => preview.value?.periodType || selectedTemplate.value?.periodType || '',
);
const periodKeyOptions = computed(() =>
  buildPeriodOptions(selectedPeriodType.value),
);

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

function syncBatchName() {
  if (!selectedTemplate.value?.name || !form.periodKey) return;
  form.name = `${selectedTemplate.value.name}-${form.periodKey}`;
}

function syncPeriodKey(periodType?: string) {
  const options = buildPeriodOptions(periodType);
  if (options.length === 0) {
    form.periodKey = '';
    return;
  }
  if (!options.some((item) => item.value === form.periodKey)) {
    form.periodKey = getDefaultPeriodKey(periodType) || options[0]?.value || '';
  }
  syncBatchName();
}

async function loadTemplates() {
  templates.value = await getEnabledTemplates();
}

async function chooseTemplate(templateId?: number) {
  preview.value = undefined;
  form.periodKey = '';
  form.name = '';
  if (!templateId) {
    return;
  }
  syncPeriodKey(selectedTemplate.value?.periodType);
  preview.value = await getLaunchPreview(templateId);
  syncPeriodKey(preview.value.periodType);
}

function handlePeriodChange() {
  syncBatchName();
}

async function submit() {
  if (!form.templateId || !form.name?.trim() || !form.periodKey?.trim()) {
    message.warning('请选择考评表并填写批次名称、周期标识');
    return;
  }
  submitting.value = true;
  try {
    await launchAssessment(form);
    message.success('已发起考核');
  } finally {
    submitting.value = false;
  }
}

onMounted(loadTemplates);
</script>

<template>
  <PerformanceShell title="发起考核">
    <Alert
      message="发起后系统会为每个被考核人创建一个独立 BPM 流程实例，并冻结人员主管关系与指标快照。"
      show-icon
      type="info"
    />

    <div class="launch-panel">
      <Form layout="vertical">
        <div class="form-grid">
          <Form.Item label="考评表" required>
            <Select
              v-model:value="form.templateId"
              :options="templateOptions"
              placeholder="选择已启用考评表"
              @change="(value) => chooseTemplate(Number(value))"
            />
          </Form.Item>
          <Form.Item label="周期标识" required>
            <Select
              v-model:value="form.periodKey"
              :disabled="!selectedPeriodType"
              :options="periodKeyOptions"
              option-filter-prop="label"
              placeholder="请选择周期"
              show-search
              @change="handlePeriodChange"
            />
          </Form.Item>
          <Form.Item label="批次名称" required>
            <Input v-model:value="form.name" />
          </Form.Item>
          <Form.Item label="开始日期">
            <Input v-model:value="form.startDate" placeholder="YYYY-MM-DD" />
          </Form.Item>
          <Form.Item label="结束日期">
            <Input v-model:value="form.endDate" placeholder="YYYY-MM-DD" />
          </Form.Item>
        </div>
        <Form.Item label="备注">
          <Input v-model:value="form.remark" />
        </Form.Item>
        <Space>
          <Button :loading="submitting" type="primary" @click="submit">
            批量发起
          </Button>
        </Space>
      </Form>
    </div>

    <div v-if="preview" class="preview">
      <Descriptions bordered size="small" :column="3">
        <Descriptions.Item label="考评表">
          {{ preview.templateName }}
        </Descriptions.Item>
        <Descriptions.Item label="周期">
          {{
            PERIOD_OPTIONS.find((item) => item.value === preview?.periodType)
              ?.label || preview.periodType
          }}
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

.form-grid {
  display: grid;
  grid-template-columns: 1.2fr 160px 1.2fr 140px 140px;
  gap: 12px;
}

@media (max-width: 1100px) {
  .form-grid {
    grid-template-columns: 1fr;
  }
}
</style>
