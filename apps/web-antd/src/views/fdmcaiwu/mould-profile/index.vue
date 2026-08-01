<script lang="ts" setup>
import type { FormInstance, TableColumnsType } from 'ant-design-vue';

import type { FdmcaiwuMouldProfileApi } from '#/api/fdmcaiwu/mould-profile';

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
  createMouldProfile,
  deleteMouldProfile,
  getMouldProfile,
  getMouldProfilePage,
  updateMouldProfile,
} from '#/api/fdmcaiwu/mould-profile';

defineOptions({ name: 'FdmcaiwuMouldProfile' });

type ProfileModel = FdmcaiwuMouldProfileApi.SaveReq;

const ENABLED_OPTIONS = [
  { label: '启用', value: 1 },
  { label: '停用', value: 0 },
];

const DIMENSION_FIELDS: Array<{
  field:
    | 'boardLengthMm'
    | 'boardThicknessMm'
    | 'boardWidthMm'
    | 'mouldLengthMm'
    | 'mouldThicknessMm'
    | 'mouldWidthMm';
  label: string;
}> = [
  { field: 'mouldLengthMm', label: '模具长度' },
  { field: 'mouldWidthMm', label: '模具宽度' },
  { field: 'mouldThicknessMm', label: '模具厚度' },
  { field: 'boardLengthMm', label: '净板长度' },
  { field: 'boardWidthMm', label: '净板宽度' },
  { field: 'boardThicknessMm', label: '净板厚度' },
];

const CHARGE_FIELDS: Array<{
  field:
    | 'elasticChargeWeightKg'
    | 'lightChargeWeightKg'
    | 'regularChargeWeightKg'
    | 'superElasticChargeWeightKg';
  label: string;
}> = [
  { field: 'regularChargeWeightKg', label: '常规投料量' },
  { field: 'lightChargeWeightKg', label: '轻羽投料量' },
  { field: 'elasticChargeWeightKg', label: '高弹投料量' },
  { field: 'superElasticChargeWeightKg', label: '超弹投料量' },
];

function createForm(): ProfileModel {
  return {
    blockedReason: '',
    boardLengthMm: 0,
    boardThicknessMm: 0,
    boardWidthMm: 0,
    elasticChargeWeightKg: undefined,
    enabled: true,
    lightChargeWeightKg: undefined,
    mouldLengthMm: 0,
    mouldThicknessMm: 0,
    mouldWidthMm: 0,
    profileCode: '',
    profileName: '',
    regularChargeWeightKg: undefined,
    superElasticChargeWeightKg: undefined,
  };
}

const loading = ref(false);
const saving = ref(false);
const editLoading = ref(false);
const editOpen = ref(false);
const formRef = ref<FormInstance>();
const rows = ref<FdmcaiwuMouldProfileApi.Profile[]>([]);
const total = ref(0);
const query = reactive({
  enabled: undefined as number | undefined,
  keyword: '',
  pageNo: 1,
  pageSize: 20,
});
const form = reactive<ProfileModel>(createForm());

function formatNumber(value: unknown, digits = 3) {
  const numberValue = Number(value);
  if (!Number.isFinite(numberValue)) return '—';
  return numberValue.toLocaleString('zh-CN', {
    maximumFractionDigits: digits,
    useGrouping: false,
  });
}

function specification(length: unknown, width: unknown, thickness: unknown) {
  return `${formatNumber(length)} × ${formatNumber(width)} × ${formatNumber(thickness)} mm`;
}

const columns: TableColumnsType<FdmcaiwuMouldProfileApi.Profile> = [
  {
    dataIndex: 'profileCode',
    fixed: 'left',
    key: 'profileCode',
    title: '模具编码',
    width: 165,
  },
  {
    dataIndex: 'profileName',
    fixed: 'left',
    key: 'profileName',
    title: '模具名称',
    width: 190,
  },
  { key: 'mouldSpecification', title: '模具尺寸', width: 220 },
  { key: 'boardSpecification', title: '净板尺寸', width: 220 },
  {
    dataIndex: 'regularChargeWeightKg',
    key: 'regularChargeWeightKg',
    title: '常规投料(kg)',
    width: 120,
  },
  {
    dataIndex: 'lightChargeWeightKg',
    key: 'lightChargeWeightKg',
    title: '轻羽投料(kg)',
    width: 120,
  },
  {
    dataIndex: 'elasticChargeWeightKg',
    key: 'elasticChargeWeightKg',
    title: '高弹投料(kg)',
    width: 120,
  },
  {
    dataIndex: 'superElasticChargeWeightKg',
    key: 'superElasticChargeWeightKg',
    title: '超弹投料(kg)',
    width: 120,
  },
  { dataIndex: 'enabled', key: 'enabled', title: '状态', width: 85 },
  {
    dataIndex: 'blockedReason',
    key: 'blockedReason',
    title: '阻断原因',
    width: 240,
  },
  { fixed: 'right', key: 'action', title: '操作', width: 130 },
];

async function loadData() {
  loading.value = true;
  try {
    const result = await getMouldProfilePage({
      enabled: query.enabled === undefined ? undefined : query.enabled === 1,
      keyword: query.keyword.trim() || undefined,
      pageNo: query.pageNo,
      pageSize: query.pageSize,
    });
    rows.value = result.list ?? [];
    total.value = result.total ?? 0;
  } finally {
    loading.value = false;
  }
}

function resetForm(profile?: FdmcaiwuMouldProfileApi.Profile) {
  Object.assign(form, createForm(), profile ?? {});
}

function handleCreate() {
  resetForm();
  editOpen.value = true;
  formRef.value?.clearValidate();
}

async function handleEdit(
  record: FdmcaiwuMouldProfileApi.Profile | Record<string, any>,
) {
  editOpen.value = true;
  editLoading.value = true;
  try {
    resetForm(await getMouldProfile(record.id));
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
  for (const item of CHARGE_FIELDS) {
    const original = form[item.field];
    if (original === undefined || original === null || original === '')
      continue;
    const value = Number(original);
    if (!Number.isFinite(value) || value <= 0) {
      message.warning(`${item.label}留空或填写大于 0 的数值`);
      return false;
    }
  }
  if (!CHARGE_FIELDS.some((item) => Number(form[item.field]) > 0)) {
    message.warning('至少需要维护一种产品类型的装模量');
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
  saving.value = true;
  try {
    const payload: ProfileModel = {
      ...form,
      blockedReason: form.blockedReason?.trim() || undefined,
      profileCode: form.profileCode.trim().toUpperCase(),
      profileName: form.profileName.trim(),
    };
    if (form.id) {
      await updateMouldProfile(payload);
      message.success('模具档案已更新');
    } else {
      await createMouldProfile(payload);
      message.success('模具档案已创建');
    }
    editOpen.value = false;
    await loadData();
  } finally {
    saving.value = false;
  }
}

function handleDelete(
  record: FdmcaiwuMouldProfileApi.Profile | Record<string, any>,
) {
  Modal.confirm({
    content: `删除“${record.profileName}”后，该模具不再参与新报价候选比较。`,
    okText: '确认删除',
    okType: 'danger',
    title: '确认删除模具档案？',
    async onOk() {
      await deleteMouldProfile(record.id);
      message.success('模具档案已删除');
      await loadData();
    },
  });
}

function handleSearch() {
  query.pageNo = 1;
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
    title="模具管理"
    description="维护模具尺寸、可用净板尺寸和不同产品类型的装模量；自动报价只比较启用且参数完整的模具。"
  >
    <Modal
      v-model:open="editOpen"
      :confirm-loading="saving"
      :mask-closable="!saving"
      :title="form.id ? '编辑模具' : '新增模具'"
      width="980px"
      ok-text="保存"
      @ok="handleSave"
    >
      <Form
        ref="formRef"
        :disabled="editLoading"
        layout="vertical"
        :model="form"
      >
        <div class="form-grid">
          <FormItem
            label="模具编码"
            name="profileCode"
            :rules="[{ required: true, message: '请输入模具编码' }]"
          >
            <Input
              v-model:value="form.profileCode"
              placeholder="MP-620-910-20"
            />
          </FormItem>
          <FormItem
            label="模具名称"
            name="profileName"
            :rules="[{ required: true, message: '请输入模具名称' }]"
          >
            <Input
              v-model:value="form.profileName"
              placeholder="请输入便于识别的名称"
            />
          </FormItem>
        </div>

        <section class="form-section">
          <h3>模具与净板尺寸</h3>
          <div class="dimension-grid">
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
          <h3>不同产品装模量</h3>
          <Alert
            class="mb-3"
            show-icon
            type="info"
            message="某产品类型留空时，该模具不会参与该类型配方的自动报价。"
          />
          <div class="form-grid">
            <FormItem
              v-for="item in CHARGE_FIELDS"
              :key="item.field"
              :label="item.label"
            >
              <InputNumber
                :value="form[item.field]"
                allow-clear
                class="w-full"
                string-mode
                :min="0.000001"
                :precision="6"
                addon-after="kg"
                @update:value="
                  (value) => (form[item.field] = value ?? undefined)
                "
              />
            </FormItem>
          </div>
        </section>

        <div class="form-grid">
          <FormItem label="启用状态">
            <Space>
<Switch v-model:checked="form.enabled" /><span>{{
                form.enabled ? '启用' : '停用'
              }}</span>
</Space>
          </FormItem>
          <FormItem
            label="阻断原因"
            extra="填写后用于说明该模具当前不可参与报价的原因"
          >
            <Input
              v-model:value="form.blockedReason"
              :maxlength="512"
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
            placeholder="模具编码或名称"
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
          v-access:code="['fdmcaiwu:mould-profile:create']"
          type="primary"
          @click="handleCreate"
        >
          <template #icon><IconifyIcon icon="lucide:plus" /></template>
          新增模具
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
        :scroll="{ x: 1650 }"
        size="small"
        @change="handleTableChange"
      >
        <template #bodyCell="{ column, record }">
          <template v-if="column.key === 'mouldSpecification'">
            {{
              specification(
                record.mouldLengthMm,
                record.mouldWidthMm,
                record.mouldThicknessMm,
              )
            }}
          </template>
          <template v-else-if="column.key === 'boardSpecification'">
            {{
              specification(
                record.boardLengthMm,
                record.boardWidthMm,
                record.boardThicknessMm,
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
          <template v-else-if="column.key === 'blockedReason'">
            <span :class="{ 'blocked-text': record.blockedReason }">{{
              record.blockedReason || '—'
            }}</span>
          </template>
          <template v-else-if="column.key === 'action'">
            <Space :size="0">
              <Button
                v-access:code="['fdmcaiwu:mould-profile:update']"
                size="small"
                type="link"
                @click="handleEdit(record)"
                >
编辑
</Button>
              <Button
                v-access:code="['fdmcaiwu:mould-profile:delete']"
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

.form-grid,
.dimension-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0 16px;
}

.dimension-grid {
  grid-template-columns: repeat(3, minmax(0, 1fr));
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

.blocked-text {
  color: var(--ant-color-error, #ff4d4f);
}

@media (max-width: 800px) {
  .form-grid,
  .dimension-grid {
    grid-template-columns: 1fr;
  }

  .toolbar {
    flex-direction: column;
    align-items: stretch;
  }
}
</style>
