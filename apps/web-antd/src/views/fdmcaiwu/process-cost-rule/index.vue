<script lang="ts" setup>
import type { FormInstance, TableColumnsType } from 'ant-design-vue';
import type { Dayjs } from 'dayjs';

import type { FdmcaiwuProcessCostRuleApi } from '#/api/fdmcaiwu/process-cost-rule';

import { computed, onMounted, reactive, ref } from 'vue';

import { Page } from '@vben/common-ui';
import { IconifyIcon } from '@vben/icons';

import {
  Alert,
  Button,
  Card,
  DatePicker,
  Form,
  FormItem,
  Input,
  InputNumber,
  message,
  Modal,
  Select,
  Space,
  Switch,
  Table,
  Tag,
} from 'ant-design-vue';
import dayjs from 'dayjs';

import {
  createProcessCostRule,
  deleteProcessCostRule,
  getProcessCostRule,
  getProcessCostRulePage,
  updateProcessCostRule,
} from '#/api/fdmcaiwu/process-cost-rule';

defineOptions({ name: 'FdmcaiwuProcessCostRule' });

type RuleSaveModel = FdmcaiwuProcessCostRuleApi.SaveReq;
type RuleModel = Omit<
  RuleSaveModel,
  'effectiveEndDate' | 'effectiveStartDate'
> & {
  effectiveEndDate?: Dayjs;
  effectiveStartDate: Dayjs | undefined;
};
type DecimalField = Exclude<
  keyof RuleModel,
  | 'effectiveEndDate'
  | 'effectiveStartDate'
  | 'enabled'
  | 'id'
  | 'processRouteCode'
  | 'ruleCode'
  | 'ruleName'
  | 'sourceLocation'
  | 'version'
>;

interface CostFieldDefinition {
  field: DecimalField;
  label: string;
  unit: string;
}

interface CostGroupDefinition {
  fields: CostFieldDefinition[];
  key: string;
  title: string;
}

const ENABLED_OPTIONS = [
  { label: '启用', value: 1 },
  { label: '停用', value: 0 },
];

const COST_GROUPS: CostGroupDefinition[] = [
  {
    fields: [
      { field: 'foamingLaborPerKg', label: '发泡人工', unit: '元/kg' },
      { field: 'slicingLaborPerKg', label: '开片人工', unit: '元/kg' },
      { field: 'allocationCostPerKg', label: '费用分摊', unit: '元/kg' },
    ],
    key: 'preprocess',
    title: '前加工费用',
  },
  {
    fields: [
      { field: 'verticalCutSmall', label: '立切·小垫', unit: '元/条' },
      {
        field: 'verticalCutLargeOrThick',
        label: '立切·大垫或厚垫',
        unit: '元/条',
      },
      { field: 'compositeSmall', label: '复合·小垫', unit: '元/条' },
      { field: 'compositeLarge', label: '复合·大垫', unit: '元/条' },
      { field: 'compositeThick', label: '复合·厚垫', unit: '元/条' },
      { field: 'embossSmall', label: '压花·小垫', unit: '元/条' },
      {
        field: 'embossLargeOrThick',
        label: '压花·大垫或厚垫',
        unit: '元/条',
      },
      { field: 'punchSmall', label: '冲床·小垫', unit: '元/条' },
      { field: 'punchLarge', label: '冲床·大垫', unit: '元/条' },
      { field: 'punchThick', label: '冲床·厚垫', unit: '元/条' },
    ],
    key: 'postprocess',
    title: '后加工费用',
  },
  {
    fields: [
      { field: 'packingLaborSmall', label: '包装人工·小垫', unit: '元/条' },
      { field: 'packingLaborLarge', label: '包装人工·大垫', unit: '元/条' },
      {
        field: 'batchShippingOperationCostPerPiece',
        label: '批量发货',
        unit: '元/条',
      },
      { field: 'oppCostPerPiece', label: 'OPP袋', unit: '元/条' },
      { field: 'cartonCostPerPiece', label: '纸箱', unit: '元/条' },
      { field: 'strapCostPerPiece', label: '绑带', unit: '元/条' },
    ],
    key: 'packing',
    title: '包装与辅料',
  },
];

function createForm(): RuleModel {
  return {
    allocationCostPerKg: 2.8,
    batchShippingOperationCostPerPiece: 0.05,
    cartonCostPerPiece: 1.1,
    compositeLarge: 0.4,
    compositeSmall: 0.35,
    compositeThick: 0.55,
    effectiveEndDate: undefined,
    effectiveStartDate: dayjs().startOf('day'),
    embossLargeOrThick: 0.19,
    embossSmall: 0.15,
    enabled: true,
    foamingLaborPerKg: 0.31,
    oppCostPerPiece: 0.3,
    packingLaborLarge: 0.5,
    packingLaborSmall: 0.4,
    processRouteCode: 'TPE_STANDARD',
    punchLarge: 0.13,
    punchSmall: 0.12,
    punchThick: 0.22,
    ruleCode: '',
    ruleName: '',
    slicingLaborPerKg: 0.29,
    sourceLocation: '',
    strapCostPerPiece: 0.55,
    thickThresholdMm: 15,
    version: 'V1',
    verticalCutLargeOrThick: 0.1,
    verticalCutSmall: 0.07,
    widthThresholdMm: 660,
  };
}

const loading = ref(false);
const saving = ref(false);
const editOpen = ref(false);
const editLoading = ref(false);
const formRef = ref<FormInstance>();
const rows = ref<FdmcaiwuProcessCostRuleApi.Rule[]>([]);
const total = ref(0);
const query = reactive({
  enabled: undefined as number | undefined,
  keyword: '',
  pageNo: 1,
  pageSize: 20,
  processRouteCode: '',
});
const form = reactive<RuleModel>(createForm());

const modalTitle = computed(() => (form.id ? '编辑工费规则' : '新增工费规则'));

function formatMoney(value: unknown) {
  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? numberValue.toFixed(2) : '—';
}

/**
 * 后端正常返回 YYYY-MM-DD；同时兼容 LocalDate 被序列化成
 * [year, month, day] 的场景，确保 DatePicker 始终只接收 Dayjs。
 */
function toDatePickerValue(value: unknown): Dayjs | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  if (dayjs.isDayjs(value)) return value;

  if (Array.isArray(value) && value.length >= 3) {
    const [year, month, date] = value.map(Number);
    if (
      Number.isInteger(year) &&
      Number.isInteger(month) &&
      Number.isInteger(date)
    ) {
      const parsedArrayDate = dayjs(new Date(year!, month! - 1, date!));
      return parsedArrayDate.isValid() ? parsedArrayDate : undefined;
    }
  }

  const parsedDate =
    value instanceof Date || typeof value === 'number'
      ? dayjs(value)
      : dayjs(String(value));
  return parsedDate.isValid() ? parsedDate : undefined;
}

const columns: TableColumnsType<FdmcaiwuProcessCostRuleApi.Rule> = [
  {
    dataIndex: 'ruleCode',
    fixed: 'left',
    key: 'ruleCode',
    title: '规则编码',
    width: 145,
  },
  {
    dataIndex: 'ruleName',
    fixed: 'left',
    key: 'ruleName',
    title: '规则名称',
    width: 180,
  },
  {
    dataIndex: 'processRouteCode',
    key: 'processRouteCode',
    title: '工艺路线',
    width: 150,
  },
  { dataIndex: 'version', key: 'version', title: '版本', width: 90 },
  {
    dataIndex: 'effectiveStartDate',
    key: 'effectiveStartDate',
    title: '生效日',
    width: 115,
  },
  {
    dataIndex: 'effectiveEndDate',
    key: 'effectiveEndDate',
    title: '失效日',
    width: 115,
  },
  { key: 'threshold', title: '规格阈值', width: 180 },
  { key: 'preprocess', title: '前加工(元/kg)', width: 145 },
  { key: 'postprocess', title: '后加工档位', width: 220 },
  { key: 'packing', title: '包装档位', width: 145 },
  { dataIndex: 'enabled', key: 'enabled', title: '状态', width: 85 },
  { fixed: 'right', key: 'action', title: '操作', width: 130 },
];

async function loadData() {
  loading.value = true;
  try {
    const result = await getProcessCostRulePage({
      enabled: query.enabled === undefined ? undefined : query.enabled === 1,
      keyword: query.keyword.trim() || undefined,
      pageNo: query.pageNo,
      pageSize: query.pageSize,
      processRouteCode: query.processRouteCode.trim() || undefined,
    });
    rows.value = result.list ?? [];
    total.value = result.total ?? 0;
  } finally {
    loading.value = false;
  }
}

function resetForm(data?: FdmcaiwuProcessCostRuleApi.Rule) {
  const defaults = createForm();
  const {
    effectiveEndDate,
    effectiveStartDate,
    sourceVersion: _sourceVersion,
    ...ruleData
  } = data ?? ({} as Partial<FdmcaiwuProcessCostRuleApi.Rule>);
  Object.assign(form, defaults, ruleData, {
    effectiveEndDate: toDatePickerValue(effectiveEndDate),
    effectiveStartDate:
      toDatePickerValue(effectiveStartDate) ?? defaults.effectiveStartDate,
    sourceLocation: data?.sourceLocation ?? '',
  });
}

async function handleCreate() {
  resetForm();
  editOpen.value = true;
  formRef.value?.clearValidate();
}

async function handleEdit(
  row: FdmcaiwuProcessCostRuleApi.Rule | Record<string, any>,
) {
  editOpen.value = true;
  editLoading.value = true;
  try {
    resetForm(await getProcessCostRule(row.id));
    formRef.value?.clearValidate();
  } catch {
    editOpen.value = false;
  } finally {
    editLoading.value = false;
  }
}

function validateNumbers() {
  for (const group of COST_GROUPS) {
    for (const item of group.fields) {
      const value = Number(form[item.field]);
      if (!Number.isFinite(value) || value < 0) {
        message.warning(`${item.label}必须是大于等于 0 的数字`);
        return false;
      }
    }
  }
  if (
    Number(form.widthThresholdMm) <= 0 ||
    Number(form.thickThresholdMm) <= 0
  ) {
    message.warning('宽度和厚度阈值必须大于 0');
    return false;
  }
  return true;
}

async function handleSave() {
  try {
    await formRef.value?.validate();
  } catch {
    return;
  }
  if (!validateNumbers()) return;
  if (!form.effectiveStartDate) {
    message.warning('请选择生效日期');
    return;
  }
  saving.value = true;
  try {
    const { effectiveEndDate, effectiveStartDate, ...formData } = form;
    const payload: RuleSaveModel = {
      ...formData,
      effectiveEndDate: effectiveEndDate?.format('YYYY-MM-DD') || undefined,
      effectiveStartDate: effectiveStartDate.format('YYYY-MM-DD'),
      processRouteCode: form.processRouteCode.trim().toUpperCase(),
      ruleCode: form.ruleCode.trim().toUpperCase(),
      ruleName: form.ruleName.trim(),
      sourceLocation: form.sourceLocation?.trim() || undefined,
      version: form.version.trim(),
    };
    if (form.id) {
      await updateProcessCostRule(payload);
      message.success('工费规则已更新');
    } else {
      await createProcessCostRule(payload);
      message.success('工费规则已创建');
    }
    editOpen.value = false;
    await loadData();
  } finally {
    saving.value = false;
  }
}

function handleDelete(
  row: FdmcaiwuProcessCostRuleApi.Rule | Record<string, any>,
) {
  Modal.confirm({
    content: `删除规则“${row.ruleName}”后，引用该路线的新报价可能被阻断。`,
    okText: '确认删除',
    okType: 'danger',
    title: '确认删除工费规则？',
    async onOk() {
      await deleteProcessCostRule(row.id);
      message.success('工费规则已删除');
      await loadData();
    },
  });
}

function handleTableChange(pagination: {
  current?: number;
  pageSize?: number;
}) {
  query.pageNo = pagination.current ?? 1;
  query.pageSize = pagination.pageSize ?? 20;
  loadData();
}

function handleSearch() {
  query.pageNo = 1;
  loadData();
}

onMounted(loadData);
</script>

<template>
  <Page
    title="工费规则"
    description="按工艺路线维护前加工、大小垫、厚垫及包装费率；单笔与批量报价会自动解析当前有效版本。"
  >
    <Modal
      v-model:open="editOpen"
      :confirm-loading="saving"
      :mask-closable="!saving"
      :title="modalTitle"
      width="1180px"
      ok-text="保存"
      @ok="handleSave"
    >
      <Form
        ref="formRef"
        layout="vertical"
        :model="form"
        :disabled="editLoading"
      >
        <div class="base-grid">
          <FormItem
            label="规则编码"
            name="ruleCode"
            :rules="[{ required: true, message: '请输入规则编码' }]"
          >
            <Input
              v-model:value="form.ruleCode"
              placeholder="TPE_STANDARD_2026"
            />
          </FormItem>
          <FormItem
            label="规则名称"
            name="ruleName"
            :rules="[{ required: true, message: '请输入规则名称' }]"
          >
            <Input v-model:value="form.ruleName" placeholder="TPE常规工费" />
          </FormItem>
          <FormItem
            label="工艺路线"
            name="processRouteCode"
            :rules="[{ required: true, message: '请输入工艺路线' }]"
          >
            <Input
              v-model:value="form.processRouteCode"
              placeholder="TPE_STANDARD"
            />
          </FormItem>
          <FormItem
            label="版本"
            name="version"
            :rules="[{ required: true, message: '请输入版本' }]"
          >
            <Input v-model:value="form.version" placeholder="V1" />
          </FormItem>
          <FormItem
            label="生效日期"
            name="effectiveStartDate"
            :rules="[{ required: true, message: '请选择生效日期' }]"
          >
            <DatePicker
              v-model:value="form.effectiveStartDate"
              class="w-full"
            />
          </FormItem>
          <FormItem label="失效日期（可选）">
            <DatePicker
              v-model:value="form.effectiveEndDate"
              allow-clear
              class="w-full"
            />
          </FormItem>
          <FormItem
            label="小垫宽度上限"
            extra="有效宽度=min(长,宽)，小于等于该值为小垫"
          >
            <InputNumber
              v-model:value="form.widthThresholdMm"
              class="w-full"
              :min="0.01"
              addon-after="mm"
            />
          </FormItem>
          <FormItem label="厚垫起始厚度" extra="大于等于该值为厚垫">
            <InputNumber
              v-model:value="form.thickThresholdMm"
              class="w-full"
              :min="0.01"
              addon-after="mm"
            />
          </FormItem>
          <FormItem label="启用状态">
            <Space>
<Switch v-model:checked="form.enabled" /><span>{{
                form.enabled ? '启用' : '停用'
              }}</span>
</Space>
          </FormItem>
        </div>

        <Alert
          class="mb-4"
          show-icon
          type="info"
          message="厚垫覆盖规则"
          description="厚度达到阈值后，立切、复合、压花、冲床使用厚垫档；包装人工仍只按大小垫判断。"
        />

        <section
          v-for="group in COST_GROUPS"
          :key="group.key"
          class="cost-section"
        >
          <h3>{{ group.title }}</h3>
          <div class="cost-grid">
            <FormItem
              v-for="item in group.fields"
              :key="item.field"
              :label="item.label"
            >
              <InputNumber
                :value="form[item.field]"
                class="w-full"
                string-mode
                :min="0"
                :precision="4"
                :addon-after="item.unit"
                @update:value="(value) => (form[item.field] = value ?? 0)"
              />
            </FormItem>
          </div>
        </section>

        <div class="base-grid">
          <FormItem label="来源位置">
            <Input
              v-model:value="form.sourceLocation"
              placeholder="文件或说明文档位置"
            />
          </FormItem>
        </div>
      </Form>
    </Modal>

    <Card :bordered="false">
      <div class="toolbar">
        <Space wrap>
          <Input
            v-model:value="query.keyword"
            allow-clear
            placeholder="编码或名称"
            @press-enter="handleSearch"
          />
          <Input
            v-model:value="query.processRouteCode"
            allow-clear
            placeholder="工艺路线"
            @press-enter="handleSearch"
          />
          <Select
            v-model:value="query.enabled"
            allow-clear
            class="status-select"
            :options="ENABLED_OPTIONS"
            placeholder="全部状态"
          />
          <Button :loading="loading" @click="handleSearch">
            <template #icon><IconifyIcon icon="lucide:search" /></template>
            查询
          </Button>
        </Space>
        <Button
          v-access:code="['fdmcaiwu:process-cost-rule:create']"
          type="primary"
          @click="handleCreate"
        >
          <template #icon><IconifyIcon icon="lucide:plus" /></template>
          新增规则
        </Button>
      </div>

      <Table
        bordered
        :columns="columns"
        :data-source="rows"
        :loading="loading"
        :pagination="{
          current: query.pageNo,
          pageSize: query.pageSize,
          showSizeChanger: true,
          total,
        }"
        row-key="id"
        :scroll="{ x: 1700 }"
        size="small"
        @change="handleTableChange"
      >
        <template #bodyCell="{ column, record }">
          <template v-if="column.key === 'threshold'">
            宽 ≤ {{ record.widthThresholdMm }} / 厚 ≥
            {{ record.thickThresholdMm }} mm
          </template>
          <template v-else-if="column.key === 'preprocess'">
            {{
              formatMoney(
                Number(record.foamingLaborPerKg) +
                  Number(record.slicingLaborPerKg) +
                  Number(record.allocationCostPerKg),
              )
            }}
          </template>
          <template v-else-if="column.key === 'postprocess'">
            小垫
            {{
              formatMoney(
                Number(record.verticalCutSmall) +
                  Number(record.compositeSmall) +
                  Number(record.embossSmall) +
                  Number(record.punchSmall),
              )
            }}
            / 大垫
            {{
              formatMoney(
                Number(record.verticalCutLargeOrThick) +
                  Number(record.compositeLarge) +
                  Number(record.embossLargeOrThick) +
                  Number(record.punchLarge),
              )
            }}
            / 厚垫
            {{
              formatMoney(
                Number(record.verticalCutLargeOrThick) +
                  Number(record.compositeThick) +
                  Number(record.embossLargeOrThick) +
                  Number(record.punchThick),
              )
            }}
          </template>
          <template v-else-if="column.key === 'packing'">
            小垫
            {{
              formatMoney(
                Number(record.packingLaborSmall) +
                  Number(record.batchShippingOperationCostPerPiece),
              )
            }}
            / 大垫
            {{
              formatMoney(
                Number(record.packingLaborLarge) +
                  Number(record.batchShippingOperationCostPerPiece),
              )
            }}
          </template>
          <template v-else-if="column.key === 'enabled'">
            <Tag :color="record.enabled ? 'success' : 'default'">
{{
              record.enabled ? '启用' : '停用'
            }}
</Tag>
          </template>
          <template v-else-if="column.key === 'action'">
            <Space :size="0">
              <Button
                v-access:code="['fdmcaiwu:process-cost-rule:update']"
                size="small"
                type="link"
                @click="handleEdit(record)"
                >
编辑
</Button>
              <Button
                v-access:code="['fdmcaiwu:process-cost-rule:delete']"
                danger
                size="small"
                type="link"
                @click="handleDelete(record)"
                >
删除
</Button>
            </Space>
          </template>
        </template>
      </Table>
    </Card>
  </Page>
</template>

<style scoped>
.toolbar {
  display: flex;
  gap: 12px;
  justify-content: space-between;
  margin-bottom: 16px;
}

.status-select {
  width: 120px;
}

.base-grid,
.cost-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 0 16px;
}

.cost-section {
  padding: 14px 16px 0;
  margin-bottom: 16px;
  background: var(--ant-color-fill-quaternary, #fafafa);
  border: 1px solid var(--ant-color-border-secondary, #f0f0f0);
  border-radius: 8px;
}

.cost-section h3 {
  margin-bottom: 12px;
  font-size: 14px;
  font-weight: 600;
}

@media (max-width: 900px) {
  .base-grid,
  .cost-grid {
    grid-template-columns: 1fr;
  }

  .toolbar {
    flex-direction: column;
    align-items: stretch;
  }
}
</style>
