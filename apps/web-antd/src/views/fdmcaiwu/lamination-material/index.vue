<script lang="ts" setup>
import type { FormInstance, TableColumnsType } from 'ant-design-vue';

import type { FdmcaiwuLaminationMaterialApi } from '#/api/fdmcaiwu/lamination-material';

import { computed, onMounted, reactive, ref } from 'vue';

import { Page } from '@vben/common-ui';
import { IconifyIcon } from '@vben/icons';
import { useUserStore } from '@vben/stores';

import {
  Alert,
  Button,
  Card,
  Form,
  FormItem,
  Input,
  InputNumber,
  message,
  Modal,
  Result,
  Select,
  Space,
  Switch,
  Table,
  Tag,
} from 'ant-design-vue';

import {
  createLaminationMaterial,
  deleteLaminationMaterial,
  getLaminationMaterial,
  getLaminationMaterialPage,
  updateLaminationMaterial,
} from '#/api/fdmcaiwu/lamination-material';

import {
  formatQuotationTaxRate,
  resolveTaxIncludedValue,
} from '../quotation/data';

defineOptions({ name: 'FdmcaiwuLaminationMaterial' });

type Material = FdmcaiwuLaminationMaterialApi.Material;
type SaveReq = FdmcaiwuLaminationMaterialApi.SaveReq;

const userStore = useUserStore();
const isSuperAdmin = computed(() =>
  (userStore.userRoles ?? []).includes('super_admin'),
);

const ENABLED_OPTIONS = [
  { label: '启用', value: 'true' },
  { label: '停用', value: 'false' },
];

const CATEGORY_OPTIONS = [
  { label: 'PU', value: 'PU' },
  { label: '软木', value: 'CORK' },
  { label: '麂皮绒', value: 'SUEDE' },
  { label: '硅胶止滑皮', value: 'SILICONE' },
  { label: '其他', value: 'OTHER' },
];

function currentLocalDateTimeText() {
  const date = new Date();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  const seconds = String(date.getSeconds()).padStart(2, '0');
  const milliseconds = String(date.getMilliseconds()).padStart(3, '0');
  return `${date.getFullYear()}-${month}-${day}T${hours}:${minutes}:${seconds}.${milliseconds}`;
}

function createForm(): SaveReq {
  return {
    adhesiveUnitPricePerSquareMeter: 2,
    allowRotation: true,
    billingIncrementMm: 1,
    category: undefined,
    effectiveStartTime: currentLocalDateTimeText(),
    enabled: true,
    headTrimMm: 0,
    horizontalGapMm: 5,
    leftTrimMm: 0,
    laminationLaborCostPerPiece: 2,
    materialCode: '',
    materialName: '',
    materialThicknessMm: 0,
    minimumPurchaseLengthMm: 0,
    remark: '',
    rightTrimMm: 0,
    rollWidthMm: 0,
    sourceLocation: '',
    sourceVersion: '',
    tailTrimMm: 0,
    unitPricePerLinearMeter: 0,
    verticalGapMm: 5,
    versionCode: '',
  };
}

const loading = ref(false);
const saving = ref(false);
const detailLoading = ref(false);
const editOpen = ref(false);
const formRef = ref<FormInstance>();
const rows = ref<Material[]>([]);
const total = ref(0);
const query = reactive({
  category: undefined as string | undefined,
  enabled: undefined as string | undefined,
  keyword: '',
  pageNo: 1,
  pageSize: 20,
});
const form = reactive<SaveReq>(createForm());

const columns: TableColumnsType<Material> = [
  {
    dataIndex: 'materialCode',
    fixed: 'left',
    key: 'materialCode',
    title: '材料编码',
    width: 170,
  },
  {
    dataIndex: 'materialName',
    fixed: 'left',
    key: 'materialName',
    title: '材料名称',
    width: 150,
  },
  { dataIndex: 'category', key: 'category', title: '类别', width: 105 },
  {
    dataIndex: 'rollWidthMm',
    key: 'rollWidthMm',
    title: '卷宽(mm)',
    width: 110,
  },
  {
    dataIndex: 'materialThicknessMm',
    key: 'materialThicknessMm',
    title: '厚度(mm)',
    width: 110,
  },
  {
    dataIndex: 'unitPricePerLinearMeter',
    key: 'unitPricePerLinearMeter',
    title: '延米价-不含税(元/m)',
    width: 155,
  },
  {
    dataIndex: 'unitPriceTaxIncludedPerLinearMeter',
    key: 'unitPriceTaxIncludedPerLinearMeter',
    title: '延米价-含税(元/m)',
    width: 155,
  },
  {
    dataIndex: 'adhesiveUnitPricePerSquareMeter',
    key: 'adhesiveUnitPricePerSquareMeter',
    title: '胶价-不含税(元/㎡)',
    width: 150,
  },
  {
    dataIndex: 'adhesiveUnitPriceTaxIncludedPerSquareMeter',
    key: 'adhesiveUnitPriceTaxIncludedPerSquareMeter',
    title: '胶价-含税(元/㎡)',
    width: 150,
  },
  {
    dataIndex: 'laminationLaborCostPerPiece',
    key: 'laminationLaborCostPerPiece',
    title: '加工费-不含税(元/片)',
    width: 165,
  },
  {
    dataIndex: 'laminationLaborCostTaxIncludedPerPiece',
    key: 'laminationLaborCostTaxIncludedPerPiece',
    title: '加工费-含税(元/片)',
    width: 165,
  },
  { key: 'gap', title: '间隙(横/纵)', width: 120 },
  {
    dataIndex: 'allowRotation',
    key: 'allowRotation',
    title: '旋转',
    width: 80,
  },
  { key: 'effective', title: '生效期', width: 205 },
  { dataIndex: 'versionCode', key: 'versionCode', title: '版本', width: 135 },
  { dataIndex: 'enabled', key: 'enabled', title: '状态', width: 80 },
  { fixed: 'right', key: 'action', title: '操作', width: 130 },
];

function valueOf(record: Material | Record<string, unknown>, key: unknown) {
  return (record as Record<string, unknown>)[String(key)];
}

function formatNumber(value: unknown, digits = 3) {
  const numberValue = Number(value);
  if (!Number.isFinite(numberValue)) return '—';
  return numberValue.toLocaleString('zh-CN', {
    maximumFractionDigits: digits,
    useGrouping: false,
  });
}

const formTaxRateLabel = formatQuotationTaxRate(0.08);
const formTaxIncludedPrices = computed(() => ({
  adhesiveUnitPricePerSquareMeter: resolveTaxIncludedValue(
    form.adhesiveUnitPricePerSquareMeter,
  ),
  laminationLaborCostPerPiece: resolveTaxIncludedValue(
    form.laminationLaborCostPerPiece,
  ),
  unitPricePerLinearMeter: resolveTaxIncludedValue(
    form.unitPricePerLinearMeter,
  ),
}));

function materialTaxIncludedPrice(
  record: Material | Record<string, unknown>,
  excludingTaxKey: keyof Material,
  includingTaxKey: keyof Material,
) {
  return resolveTaxIncludedValue(
    valueOf(record, excludingTaxKey),
    valueOf(record, includingTaxKey),
    valueOf(record, 'taxRate'),
  );
}

function formatCategory(value?: null | string) {
  return (
    CATEGORY_OPTIONS.find((item) => item.value === value)?.label || value || '—'
  );
}

function formatEffective(record: Material | Record<string, unknown>) {
  const material = record as Material;
  return `${material.effectiveStartTime || '—'} ~ ${material.effectiveEndTime || '长期'}`;
}

async function loadData() {
  if (!isSuperAdmin.value) return;
  loading.value = true;
  try {
    const data = await getLaminationMaterialPage({
      category: query.category,
      enabled:
        query.enabled === undefined ? undefined : query.enabled === 'true',
      keyword: query.keyword.trim() || undefined,
      pageNo: query.pageNo,
      pageSize: query.pageSize,
    });
    rows.value = data.list ?? [];
    total.value = data.total ?? 0;
  } finally {
    loading.value = false;
  }
}

function resetForm(data?: Material) {
  const source = data ?? ({} as Material);
  const editableSource: Partial<Material> = { ...source };
  delete editableSource.adhesiveUnitPriceTaxIncludedPerSquareMeter;
  delete editableSource.laminationLaborCostTaxIncludedPerPiece;
  delete editableSource.taxRate;
  delete editableSource.unitPriceTaxIncludedPerLinearMeter;
  Object.assign(form, createForm(), {
    ...editableSource,
    category: source.category || undefined,
    effectiveStartTime: currentLocalDateTimeText(),
    remark: source.remark || '',
    sourceLocation: source.sourceLocation || '',
    sourceVersion: source.sourceVersion || '',
    // 编辑会创建不可变新版本，不能把当前版本编码原样回传。
    versionCode: '',
  });
}

function handleCreate() {
  if (!isSuperAdmin.value) {
    message.warning('只有超级管理员可以新增贴合材料');
    return;
  }
  resetForm();
  editOpen.value = true;
  formRef.value?.clearValidate();
}

async function handleEdit(record: Material | Record<string, unknown>) {
  if (!isSuperAdmin.value) {
    message.warning('只有超级管理员可以编辑贴合材料');
    return;
  }
  const material = record as Material;
  editOpen.value = true;
  detailLoading.value = true;
  try {
    resetForm(await getLaminationMaterial(material.id));
    formRef.value?.clearValidate();
  } catch {
    editOpen.value = false;
  } finally {
    detailLoading.value = false;
  }
}

function validatePositive(value: unknown, label: string) {
  if (!Number.isFinite(Number(value)) || Number(value) <= 0) {
    message.warning(`${label}必须大于 0`);
    return false;
  }
  return true;
}

function validateNonNegative(value: unknown, label: string) {
  if (!Number.isFinite(Number(value)) || Number(value) < 0) {
    message.warning(`${label}不能小于 0`);
    return false;
  }
  return true;
}

function validateForm() {
  if (!form.materialCode.trim() || !form.materialName.trim()) {
    message.warning('请填写材料编码和名称');
    return false;
  }
  if (!form.effectiveStartTime) {
    message.warning('请填写生效开始日期');
    return false;
  }
  if (
    !validatePositive(form.rollWidthMm, '卷宽') ||
    !validatePositive(form.materialThicknessMm, '材料厚度') ||
    !validatePositive(form.unitPricePerLinearMeter, '延米价') ||
    !validatePositive(form.billingIncrementMm, '计费步长')
  ) {
    return false;
  }
  const fields: Array<[unknown, string]> = [
    [form.horizontalGapMm, '横向间隙'],
    [form.verticalGapMm, '纵向间隙'],
    [form.leftTrimMm, '左修边'],
    [form.rightTrimMm, '右修边'],
    [form.headTrimMm, '卷首修边'],
    [form.tailTrimMm, '卷尾修边'],
    [form.minimumPurchaseLengthMm, '最小购买长度'],
    [form.adhesiveUnitPricePerSquareMeter, '热熔胶单价'],
    [form.laminationLaborCostPerPiece, '贴合加工费'],
  ];
  return fields.every(([value, label]) => validateNonNegative(value, label));
}

async function handleSave() {
  if (!isSuperAdmin.value) {
    editOpen.value = false;
    message.warning('只有超级管理员可以保存贴合材料');
    return;
  }
  try {
    await formRef.value?.validate();
  } catch {
    return;
  }
  if (!validateForm()) return;
  saving.value = true;
  try {
    const payload: SaveReq = {
      ...form,
      category: form.category || undefined,
      effectiveStartTime: form.effectiveStartTime || undefined,
      materialCode: form.materialCode.trim(),
      materialName: form.materialName.trim(),
      remark: form.remark?.trim() || undefined,
      sourceLocation: form.sourceLocation?.trim() || undefined,
      sourceVersion: form.sourceVersion?.trim() || undefined,
      versionCode: form.versionCode?.trim() || undefined,
    };
    if (form.id) {
      await updateLaminationMaterial(payload);
      message.success('已创建新的材料价格版本');
    } else {
      await createLaminationMaterial(payload);
      message.success('贴合材料已创建');
    }
    editOpen.value = false;
    await loadData();
  } finally {
    saving.value = false;
  }
}

function handleDelete(record: Material | Record<string, unknown>) {
  if (!isSuperAdmin.value) {
    message.warning('只有超级管理员可以删除贴合材料');
    return;
  }
  const material = record as Material;
  Modal.confirm({
    content: `删除后材料“${material.materialName}”将不再参与新报价，历史批次快照不受影响。`,
    okText: '确认删除',
    okType: 'danger',
    title: '确认删除贴合材料？',
    async onOk() {
      if (!isSuperAdmin.value) {
        message.warning('当前账号已无删除贴合材料权限');
        return;
      }
      await deleteLaminationMaterial(material.id);
      message.success('贴合材料已删除');
      await loadData();
    },
  });
}

function handleSearch() {
  if (!isSuperAdmin.value) return;
  query.pageNo = 1;
  void loadData();
}

function handleReset() {
  if (!isSuperAdmin.value) return;
  Object.assign(query, {
    category: undefined,
    enabled: undefined,
    keyword: '',
    pageNo: 1,
  });
  void loadData();
}

function handleTableChange(pagination: {
  current?: number;
  pageSize?: number;
}) {
  if (!isSuperAdmin.value) return;
  query.pageNo = pagination.current ?? 1;
  query.pageSize = pagination.pageSize ?? 20;
  void loadData();
}

onMounted(() => {
  if (isSuperAdmin.value) void loadData();
});
</script>

<template>
  <Page
    title="贴合材料价格表"
    description="维护外采卷材的不含税成本和排版参数；含税成本固定按不含税价增加 8%，每次修改生成新版本。"
  >
    <Result
      v-if="!isSuperAdmin"
      status="403"
      title="无权访问"
      sub-title="贴合材料采购价与排版参数仅允许超级管理员维护。"
    />

    <Modal
      v-else
      v-model:open="editOpen"
      :confirm-loading="saving"
      :mask-closable="!saving"
      :title="form.id ? '编辑贴合材料' : '新增贴合材料'"
      width="1080px"
      ok-text="保存新版本"
      @ok="handleSave"
    >
      <Form
        ref="formRef"
        :disabled="detailLoading"
        layout="vertical"
        :model="form"
      >
        <Alert
          class="mb-4"
          show-icon
          type="info"
          message="可编辑成本均为不含税口径"
          description="含税成本固定按不含税价增加 8% 并只读展示。报价计算会冻结当时材料版本；编辑已有材料会新建版本，不会追溯改变旧批次。"
        />

        <section class="form-section">
          <div class="section-title">基础资料</div>
          <div class="field-grid four-columns">
            <FormItem label="材料编码" required>
              <Input
                v-model:value="form.materialCode"
                :disabled="Boolean(form.id)"
                :maxlength="64"
                placeholder="例如 PU_NORMAL"
              />
            </FormItem>
            <FormItem label="材料名称" required>
              <Input v-model:value="form.materialName" :maxlength="100" />
            </FormItem>
            <FormItem label="类别">
              <Select
                v-model:value="form.category"
                allow-clear
                :options="CATEGORY_OPTIONS"
                placeholder="选填"
              />
            </FormItem>
            <FormItem label="启用状态">
              <Space>
                <Switch v-model:checked="form.enabled" />
                <span>{{ form.enabled ? '启用' : '停用' }}</span>
              </Space>
            </FormItem>
          </div>
        </section>

        <section class="form-section">
          <div class="section-title">卷材与价格</div>
          <div class="field-grid four-columns">
            <FormItem label="卷宽" required>
              <InputNumber
                v-model:value="form.rollWidthMm"
                class="w-full"
                :min="0.001"
                :precision="3"
                addon-after="mm"
              />
            </FormItem>
            <FormItem label="材料厚度" required>
              <InputNumber
                v-model:value="form.materialThicknessMm"
                class="w-full"
                :min="0.001"
                :precision="3"
                addon-after="mm"
              />
            </FormItem>
            <FormItem label="延米价（不含税）" required>
              <InputNumber
                v-model:value="form.unitPricePerLinearMeter"
                class="w-full"
                :min="0.0001"
                :precision="4"
                addon-after="元/m"
              />
            </FormItem>
            <FormItem :label="`延米价（含税 +${formTaxRateLabel}，只读）`">
              <InputNumber
                :value="formTaxIncludedPrices.unitPricePerLinearMeter"
                class="w-full"
                disabled
                :precision="4"
                addon-after="元/m"
              />
            </FormItem>
            <FormItem label="热熔胶单价（不含税）" required>
              <InputNumber
                v-model:value="form.adhesiveUnitPricePerSquareMeter"
                class="w-full"
                :min="0"
                :precision="4"
                addon-after="元/㎡"
              />
            </FormItem>
            <FormItem :label="`热熔胶单价（含税 +${formTaxRateLabel}，只读）`">
              <InputNumber
                :value="formTaxIncludedPrices.adhesiveUnitPricePerSquareMeter"
                class="w-full"
                disabled
                :precision="4"
                addon-after="元/㎡"
              />
            </FormItem>
            <FormItem label="贴合加工费（不含税）" required>
              <InputNumber
                v-model:value="form.laminationLaborCostPerPiece"
                class="w-full"
                :min="0"
                :precision="4"
                addon-after="元/片"
              />
            </FormItem>
            <FormItem :label="`贴合加工费（含税 +${formTaxRateLabel}，只读）`">
              <InputNumber
                :value="formTaxIncludedPrices.laminationLaborCostPerPiece"
                class="w-full"
                disabled
                :precision="4"
                addon-after="元/片"
              />
            </FormItem>
            <FormItem label="生效开始日期" required>
              <Input
                v-model:value="form.effectiveStartTime"
                placeholder="YYYY-MM-DDTHH:mm:ss"
              />
            </FormItem>
            <FormItem label="版本编码">
              <Input
                v-model:value="form.versionCode"
                :maxlength="64"
                placeholder="选填新版本编码；留空由系统生成"
              />
            </FormItem>
            <FormItem label="允许旋转排版">
              <Space>
                <Switch v-model:checked="form.allowRotation" />
                <span>{{
                  form.allowRotation ? '允许 90° 旋转' : '仅标准方向'
                }}</span>
              </Space>
            </FormItem>
          </div>
        </section>

        <section class="form-section">
          <div class="section-title">排版与计费参数</div>
          <div class="field-grid four-columns">
            <FormItem label="横向间隙">
              <InputNumber
                v-model:value="form.horizontalGapMm"
                class="w-full"
                :min="0"
                :precision="3"
                addon-after="mm"
              />
            </FormItem>
            <FormItem label="纵向间隙">
              <InputNumber
                v-model:value="form.verticalGapMm"
                class="w-full"
                :min="0"
                :precision="3"
                addon-after="mm"
              />
            </FormItem>
            <FormItem label="最小购买长度">
              <InputNumber
                v-model:value="form.minimumPurchaseLengthMm"
                class="w-full"
                :min="0"
                :precision="3"
                addon-after="mm"
              />
            </FormItem>
            <FormItem label="计费步长">
              <InputNumber
                v-model:value="form.billingIncrementMm"
                class="w-full"
                :min="0.001"
                :precision="3"
                addon-after="mm"
              />
            </FormItem>
            <FormItem label="左修边">
              <InputNumber
                v-model:value="form.leftTrimMm"
                class="w-full"
                :min="0"
                :precision="3"
                addon-after="mm"
              />
            </FormItem>
            <FormItem label="右修边">
              <InputNumber
                v-model:value="form.rightTrimMm"
                class="w-full"
                :min="0"
                :precision="3"
                addon-after="mm"
              />
            </FormItem>
            <FormItem label="卷首修边">
              <InputNumber
                v-model:value="form.headTrimMm"
                class="w-full"
                :min="0"
                :precision="3"
                addon-after="mm"
              />
            </FormItem>
            <FormItem label="卷尾修边">
              <InputNumber
                v-model:value="form.tailTrimMm"
                class="w-full"
                :min="0"
                :precision="3"
                addon-after="mm"
              />
            </FormItem>
          </div>
        </section>

        <section class="form-section compact-section">
          <div class="section-title">来源与备注</div>
          <div class="field-grid">
            <FormItem label="来源版本">
              <Input v-model:value="form.sourceVersion" :maxlength="128" />
            </FormItem>
            <FormItem label="来源位置">
              <Input v-model:value="form.sourceLocation" :maxlength="255" />
            </FormItem>
            <FormItem class="span-two" label="备注">
              <Input v-model:value="form.remark" :maxlength="500" />
            </FormItem>
          </div>
        </section>
      </Form>
    </Modal>

    <Card v-if="isSuperAdmin" :bordered="false">
      <div class="toolbar">
        <Space wrap>
          <Input
            v-model:value="query.keyword"
            allow-clear
            class="keyword-input"
            placeholder="材料编码或名称"
            @press-enter="handleSearch"
          />
          <Select
            v-model:value="query.category"
            allow-clear
            :options="CATEGORY_OPTIONS"
            placeholder="全部类别"
          />
          <Select
            v-model:value="query.enabled"
            allow-clear
            :options="ENABLED_OPTIONS"
            placeholder="全部状态"
          />
          <Button :loading="loading" @click="handleSearch">
            <template #icon><IconifyIcon icon="lucide:search" /></template>
            查询
          </Button>
          <Button @click="handleReset">重置</Button>
        </Space>
        <Button
          v-access:code="['fdmcaiwu:lamination-material:create']"
          type="primary"
          @click="handleCreate"
        >
          <template #icon><IconifyIcon icon="lucide:plus" /></template>
          新增材料
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
        :scroll="{ x: 2260 }"
        size="small"
        @change="handleTableChange"
      >
        <template #bodyCell="{ column, record }">
          <template v-if="column.key === 'category'">
            {{ formatCategory(record.category) }}
          </template>
          <template
            v-else-if="
              ['rollWidthMm', 'materialThicknessMm'].includes(
                String(column.key),
              )
            "
          >
            {{ formatNumber(valueOf(record, column.key)) }}
          </template>
          <template
            v-else-if="
              [
                'unitPricePerLinearMeter',
                'adhesiveUnitPricePerSquareMeter',
                'laminationLaborCostPerPiece',
              ].includes(String(column.key))
            "
          >
            {{ formatNumber(valueOf(record, column.key), 4) }}
          </template>
          <template
            v-else-if="column.key === 'unitPriceTaxIncludedPerLinearMeter'"
          >
            {{
              formatNumber(
                materialTaxIncludedPrice(
                  record,
                  'unitPricePerLinearMeter',
                  'unitPriceTaxIncludedPerLinearMeter',
                ),
                4,
              )
            }}
          </template>
          <template
            v-else-if="
              column.key === 'adhesiveUnitPriceTaxIncludedPerSquareMeter'
            "
          >
            {{
              formatNumber(
                materialTaxIncludedPrice(
                  record,
                  'adhesiveUnitPricePerSquareMeter',
                  'adhesiveUnitPriceTaxIncludedPerSquareMeter',
                ),
                4,
              )
            }}
          </template>
          <template
            v-else-if="column.key === 'laminationLaborCostTaxIncludedPerPiece'"
          >
            {{
              formatNumber(
                materialTaxIncludedPrice(
                  record,
                  'laminationLaborCostPerPiece',
                  'laminationLaborCostTaxIncludedPerPiece',
                ),
                4,
              )
            }}
          </template>
          <template v-else-if="column.key === 'gap'">
            {{ formatNumber(record.horizontalGapMm) }} /
            {{ formatNumber(record.verticalGapMm) }}
          </template>
          <template v-else-if="column.key === 'allowRotation'">
            <Tag :color="record.allowRotation ? 'blue' : 'default'">
              {{ record.allowRotation ? '允许' : '禁止' }}
            </Tag>
          </template>
          <template v-else-if="column.key === 'effective'">
            {{ formatEffective(record) }}
          </template>
          <template v-else-if="column.key === 'enabled'">
            <Tag :color="record.enabled ? 'success' : 'default'">
              {{ record.enabled ? '启用' : '停用' }}
            </Tag>
          </template>
          <template v-else-if="column.key === 'action'">
            <Space :size="0">
              <Button
                v-access:code="['fdmcaiwu:lamination-material:update']"
                size="small"
                type="link"
                @click="handleEdit(record)"
              >
                编辑
              </Button>
              <Button
                v-access:code="['fdmcaiwu:lamination-material:delete']"
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
  align-items: center;
  justify-content: space-between;
  margin-bottom: 14px;
}

.keyword-input {
  width: 230px;
}

.form-section {
  padding: 12px 14px 0;
  margin-bottom: 12px;
  background: var(--ant-color-fill-quaternary, #fafafa);
  border: 1px solid var(--ant-color-border-secondary, #f0f0f0);
  border-radius: 8px;
}

.compact-section {
  margin-bottom: 0;
}

.section-title {
  margin-bottom: 10px;
  font-size: 14px;
  font-weight: 600;
}

.field-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0 14px;
}

.four-columns {
  grid-template-columns: repeat(4, minmax(0, 1fr));
}

.span-two {
  grid-column: span 2;
}

@media (max-width: 980px) {
  .four-columns,
  .field-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (max-width: 680px) {
  .toolbar {
    flex-direction: column;
    align-items: stretch;
  }

  .four-columns,
  .field-grid {
    grid-template-columns: 1fr;
  }

  .span-two {
    grid-column: auto;
  }
}
</style>
