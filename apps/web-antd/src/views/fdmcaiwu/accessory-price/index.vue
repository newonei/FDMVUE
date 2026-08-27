<script lang="ts" setup>
import type { FormInstance, TableColumnsType } from 'ant-design-vue';

import type { FdmcaiwuAccessoryPriceApi } from '#/api/fdmcaiwu/accessory-price';

import { onMounted, reactive, ref } from 'vue';

import { Page } from '@vben/common-ui';
import { IconifyIcon } from '@vben/icons';

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
  Select,
  Space,
  Switch,
  Table,
  Tag,
} from 'ant-design-vue';

import {
  createAccessoryPrice,
  deleteAccessoryPrice,
  getAccessoryPrice,
  getAccessoryPricePage,
  updateAccessoryPrice,
} from '#/api/fdmcaiwu/accessory-price';

defineOptions({ name: 'FdmcaiwuAccessoryPrice' });

type AccessoryPrice = FdmcaiwuAccessoryPriceApi.AccessoryPrice;
type SaveModel = FdmcaiwuAccessoryPriceApi.SaveReq;

const ENABLED_OPTIONS = [
  { label: '启用', value: 1 },
  { label: '停用', value: 0 },
];

const DIMENSION_FIELDS = [
  { field: 'lengthMm' as const, label: '长度' },
  { field: 'widthMm' as const, label: '宽度' },
  { field: 'thicknessMm' as const, label: '厚度' },
];

const COST_FIELDS = [
  { field: 'oppCostPerPiece' as const, label: 'OPP膜' },
  { field: 'cartonCostPerPiece' as const, label: '外箱' },
  { field: 'strapCostPerPiece' as const, label: '绑带' },
];

type CostField = (typeof COST_FIELDS)[number]['field'];

function createForm(): SaveModel {
  return {
    cartonCostPerPiece: undefined,
    enabled: true,
    lengthMm: 0,
    oppCostPerPiece: undefined,
    remark: '',
    sourceLocation: '',
    strapCostPerPiece: undefined,
    thicknessMm: 0,
    widthMm: 0,
  };
}

const loading = ref(false);
const saving = ref(false);
const editLoading = ref(false);
const editOpen = ref(false);
const formRef = ref<FormInstance>();
const rows = ref<AccessoryPrice[]>([]);
const total = ref(0);
const query = reactive({
  enabled: undefined as number | undefined,
  keyword: '',
  lengthMm: undefined as number | undefined,
  pageNo: 1,
  pageSize: 20,
  thicknessMm: undefined as number | undefined,
  widthMm: undefined as number | undefined,
});
const form = reactive<SaveModel>(createForm());

const columns: TableColumnsType<AccessoryPrice> = [
  {
    dataIndex: 'lengthMm',
    fixed: 'left',
    key: 'lengthMm',
    title: '长度(mm)',
    width: 115,
  },
  {
    dataIndex: 'widthMm',
    fixed: 'left',
    key: 'widthMm',
    title: '宽度(mm)',
    width: 115,
  },
  {
    dataIndex: 'thicknessMm',
    fixed: 'left',
    key: 'thicknessMm',
    title: '厚度(mm)',
    width: 115,
  },
  {
    dataIndex: 'oppCostPerPiece',
    key: 'oppCostPerPiece',
    title: 'OPP膜(元/片)',
    width: 135,
  },
  {
    dataIndex: 'cartonCostPerPiece',
    key: 'cartonCostPerPiece',
    title: '外箱(元/片)',
    width: 135,
  },
  {
    dataIndex: 'strapCostPerPiece',
    key: 'strapCostPerPiece',
    title: '绑带(元/片)',
    width: 135,
  },
  { dataIndex: 'enabled', key: 'enabled', title: '状态', width: 85 },
  { dataIndex: 'remark', key: 'remark', title: '备注', width: 220 },
  { key: 'source', title: '来源', width: 220 },
  {
    dataIndex: 'updateTime',
    key: 'updateTime',
    title: '更新时间',
    width: 170,
  },
  { fixed: 'right', key: 'action', title: '操作', width: 130 },
];

function formatNumber(value: unknown, minimumFractionDigits = 0) {
  const numberValue = Number(value);
  if (!Number.isFinite(numberValue)) return '—';
  return numberValue.toLocaleString('zh-CN', {
    maximumFractionDigits: 4,
    minimumFractionDigits,
    useGrouping: false,
  });
}

function formatSource(record: AccessoryPrice | Record<string, any>) {
  return (
    [record.sourceVersion, record.sourceLocation].filter(Boolean).join(' · ') ||
    '—'
  );
}

function getFormCostValue(field: CostField) {
  const value = form[field];
  return value === null ? undefined : value;
}

function getRecordValue(
  record: AccessoryPrice | Record<string, any>,
  key: unknown,
) {
  return (record as unknown as Record<string, unknown>)[String(key)];
}

async function loadData() {
  loading.value = true;
  try {
    const result = await getAccessoryPricePage({
      enabled: query.enabled === undefined ? undefined : query.enabled === 1,
      keyword: query.keyword.trim() || undefined,
      lengthMm: query.lengthMm,
      pageNo: query.pageNo,
      pageSize: query.pageSize,
      thicknessMm: query.thicknessMm,
      widthMm: query.widthMm,
    });
    rows.value = result.list ?? [];
    total.value = result.total ?? 0;
  } finally {
    loading.value = false;
  }
}

function resetForm(data?: AccessoryPrice) {
  const {
    createTime: _createTime,
    sourceVersion: _sourceVersion,
    updateTime: _updateTime,
    ...editableData
  } = data ?? ({} as Partial<AccessoryPrice>);
  Object.assign(form, createForm(), editableData);
}

function handleCreate() {
  resetForm();
  editOpen.value = true;
  formRef.value?.clearValidate();
}

async function handleEdit(record: AccessoryPrice | Record<string, any>) {
  editOpen.value = true;
  editLoading.value = true;
  try {
    resetForm(await getAccessoryPrice(record.id));
    formRef.value?.clearValidate();
  } catch {
    editOpen.value = false;
  } finally {
    editLoading.value = false;
  }
}

function validateNumbers() {
  for (const item of DIMENSION_FIELDS) {
    const value = Number(form[item.field]);
    if (!Number.isFinite(value) || value <= 0) {
      message.warning(`${item.label}必须大于 0`);
      return false;
    }
  }
  for (const item of COST_FIELDS) {
    const originalValue = form[item.field];
    if (
      originalValue === undefined ||
      originalValue === null ||
      originalValue === ''
    ) {
      continue;
    }
    const value = Number(originalValue);
    if (!Number.isFinite(value) || value < 0) {
      message.warning(`${item.label}价格必须大于或等于 0`);
      return false;
    }
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
  saving.value = true;
  try {
    const payload: SaveModel = {
      ...form,
      remark: form.remark?.trim() || undefined,
      sourceLocation: form.sourceLocation?.trim() || undefined,
    };
    if (form.id) {
      await updateAccessoryPrice(payload);
      message.success('规格辅料价格已更新');
    } else {
      await createAccessoryPrice(payload);
      message.success('规格辅料价格已创建');
    }
    editOpen.value = false;
    await loadData();
  } finally {
    saving.value = false;
  }
}

function handleDelete(record: AccessoryPrice | Record<string, any>) {
  Modal.confirm({
    content: `删除 ${record.lengthMm} × ${record.widthMm} × ${record.thicknessMm} mm 后，新报价会先尝试向上匹配其他启用规格；没有长、宽、厚均不小于成品的有效价格时才会被阻断。`,
    okText: '确认删除',
    okType: 'danger',
    title: '确认删除规格辅料价格？',
    async onOk() {
      await deleteAccessoryPrice(record.id);
      message.success('规格辅料价格已删除');
      await loadData();
    },
  });
}

function handleSearch() {
  query.pageNo = 1;
  loadData();
}

function handleResetSearch() {
  Object.assign(query, {
    enabled: undefined,
    keyword: '',
    lengthMm: undefined,
    pageNo: 1,
    thicknessMm: undefined,
    widthMm: undefined,
  });
  loadData();
}

function handleTableChange(pagination: {
  current?: number;
  pageSize?: number;
}) {
  query.pageNo = pagination.current ?? 1;
  query.pageSize = pagination.pageSize ?? 20;
  loadData();
}

onMounted(loadData);
</script>

<template>
  <Page
    title="辅料价格表"
    description="按成品长度、宽度、厚度维护 OPP膜、外箱和绑带的单位价格；报价优先精确匹配，无精确价格时向长、宽、厚均不小于成品的最近启用规格匹配。"
  >
    <Modal
      v-model:open="editOpen"
      :confirm-loading="saving"
      :mask-closable="!saving"
      :title="form.id ? '编辑规格辅料价格' : '新增规格辅料价格'"
      width="900px"
      ok-text="保存"
      @ok="handleSave"
    >
      <Form
        ref="formRef"
        :disabled="editLoading"
        layout="vertical"
        :model="form"
      >
        <Alert
          class="mb-4"
          show-icon
          type="info"
          message="规格分三列维护"
          description="长度、宽度、厚度共同确定唯一规格。辅料价格可单项留空，填写 0 表示免费；报价勾选的辅料若无精确价格，会按单项向上匹配三个尺寸都不小于成品的最近启用记录，仍无合格记录才会阻断。"
        />

        <section class="form-section">
          <h3>成品规格</h3>
          <div class="field-grid">
            <FormItem
              v-for="item in DIMENSION_FIELDS"
              :key="item.field"
              :label="item.label"
            >
              <InputNumber
                :value="form[item.field]"
                class="w-full"
                string-mode
                :min="0.001"
                :precision="3"
                addon-after="mm"
                @update:value="(value) => (form[item.field] = value ?? 0)"
              />
            </FormItem>
          </div>
        </section>

        <section class="form-section">
          <h3>单位辅料价格</h3>
          <div class="field-grid">
            <FormItem
              v-for="item in COST_FIELDS"
              :key="item.field"
              :label="item.label"
            >
              <InputNumber
                :value="getFormCostValue(item.field)"
                allow-clear
                class="w-full"
                string-mode
                :min="0"
                :precision="4"
                addon-after="元/片"
                placeholder="留空表示未维护"
                @update:value="
                  (value) => (form[item.field] = value ?? undefined)
                "
              />
            </FormItem>
          </div>
        </section>

        <div class="field-grid">
          <FormItem label="启用状态">
            <Space>
              <Switch v-model:checked="form.enabled" />
              <span>{{ form.enabled ? '启用' : '停用' }}</span>
            </Space>
          </FormItem>
          <FormItem label="来源位置">
            <Input
              v-model:value="form.sourceLocation"
              :maxlength="255"
              placeholder="可选，例如报价体系表!辅料价格"
            />
          </FormItem>
          <FormItem class="span-two" label="备注">
            <Input
              v-model:value="form.remark"
              :maxlength="500"
              placeholder="可选"
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
            placeholder="来源或备注"
            @press-enter="handleSearch"
          />
          <InputNumber
            v-model:value="query.lengthMm"
            :min="0.001"
            placeholder="长度(mm)"
          />
          <InputNumber
            v-model:value="query.widthMm"
            :min="0.001"
            placeholder="宽度(mm)"
          />
          <InputNumber
            v-model:value="query.thicknessMm"
            :min="0.001"
            placeholder="厚度(mm)"
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
          <Button @click="handleResetSearch">重置</Button>
        </Space>
        <Button
          v-access:code="['fdmcaiwu:accessory-price:create']"
          type="primary"
          @click="handleCreate"
        >
          <template #icon><IconifyIcon icon="lucide:plus" /></template>
          新增规格
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
        :scroll="{ x: 1480 }"
        size="small"
        @change="handleTableChange"
      >
        <template #bodyCell="{ column, record }">
          <template
            v-if="
              ['lengthMm', 'widthMm', 'thicknessMm'].includes(
                String(column.key),
              )
            "
          >
            {{ formatNumber(getRecordValue(record, column.key)) }}
          </template>
          <template
            v-else-if="
              [
                'oppCostPerPiece',
                'cartonCostPerPiece',
                'strapCostPerPiece',
              ].includes(String(column.key))
            "
          >
            {{ formatNumber(getRecordValue(record, column.key), 2) }}
          </template>
          <template v-else-if="column.key === 'enabled'">
            <Tag :color="record.enabled ? 'success' : 'default'">
              {{ record.enabled ? '启用' : '停用' }}
            </Tag>
          </template>
          <template v-else-if="column.key === 'remark'">
            {{ record.remark || '—' }}
          </template>
          <template v-else-if="column.key === 'source'">
            <span :title="formatSource(record)">{{
              formatSource(record)
            }}</span>
          </template>
          <template v-else-if="column.key === 'action'">
            <Space :size="0">
              <Button
                v-access:code="['fdmcaiwu:accessory-price:update']"
                size="small"
                type="link"
                @click="handleEdit(record)"
              >
                编辑
              </Button>
              <Button
                v-access:code="['fdmcaiwu:accessory-price:delete']"
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

.field-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 0 16px;
}

.span-two {
  grid-column: span 2;
}

.form-section {
  padding: 14px 16px 0;
  margin-bottom: 16px;
  background: var(--ant-color-fill-quaternary, #fafafa);
  border: 1px solid var(--ant-color-border-secondary, #f0f0f0);
  border-radius: 8px;
}

.form-section h3 {
  margin-bottom: 12px;
  font-size: 14px;
  font-weight: 600;
}

@media (max-width: 900px) {
  .field-grid {
    grid-template-columns: 1fr;
  }

  .span-two {
    grid-column: auto;
  }

  .toolbar {
    flex-direction: column;
    align-items: stretch;
  }
}
</style>
