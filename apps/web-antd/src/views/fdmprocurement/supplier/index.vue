<script lang="ts" setup>
import type { FdmProcurementSupplierApi } from '#/api/fdmprocurement/supplier';

import { computed, reactive, ref } from 'vue';

import { useAccess } from '@vben/access';
import { Page } from '@vben/common-ui';

import {
  Alert,
  Button,
  Card,
  Input,
  message,
  Modal,
  Pagination,
  Select,
  Space,
  Switch,
  Table,
  Tag,
} from 'ant-design-vue';

import { getDataCompanySimpleList } from '#/api/fdmdata/datacompany';
import {
  authorizeProcurementSupplierCompany,
  createProcurementSupplier,
  getProcurementSupplierList,
  updateProcurementSupplier,
} from '#/api/fdmprocurement/supplier';
import { useFdmWaimaoAiContext } from '#/views/fdm-trade-shared/ai-assistant/context';

import { canUseSupplierMasterAction } from '../supplier-master-permissions';

defineOptions({ name: 'FdmProcurementSupplier' });

const { hasAccessByCodes } = useAccess();
const hasPermission = (code: string) => hasAccessByCodes([code]);
const canQuery = computed(() =>
  canUseSupplierMasterAction('SUPPLIER_READ', hasPermission),
);
const canCreate = computed(() =>
  canUseSupplierMasterAction('SUPPLIER_CREATE', hasPermission),
);
const canUpdate = computed(() =>
  canUseSupplierMasterAction('SUPPLIER_UPDATE', hasPermission),
);
const canAuthorizeCompany = computed(() =>
  canUseSupplierMasterAction('SUPPLIER_AUTHORIZE_COMPANY', hasPermission),
);

const rows = ref<FdmProcurementSupplierApi.Supplier[]>([]);
const companies = ref<Array<{ label: string; value: string }>>([]);
const companyId = ref('');
const keyword = ref('');
const status = ref<FdmProcurementSupplierApi.SupplierStatus>();
const loading = ref(false);
const saving = ref(false);
const authorizing = ref(false);
const error = ref('');
const modalOpen = ref(false);
const authorizationModalOpen = ref(false);
const editing = ref<FdmProcurementSupplierApi.Supplier>();
const authorizationEditing = ref<FdmProcurementSupplierApi.Supplier>();
const pageNo = ref(1);
const pageSize = ref(10);

const form = reactive({
  admissionStatus: 'PENDING' as FdmProcurementSupplierApi.ApprovalStatus,
  approvalStatus: 'PENDING' as FdmProcurementSupplierApi.ApprovalStatus,
  companyStatus: 'ENABLED' as FdmProcurementSupplierApi.CompanyStatus,
  directShipAllowed: false,
  erpSupplierId: '',
  remark: '',
  status: 'ENABLED' as FdmProcurementSupplierApi.SupplierStatus,
  supplierCode: '',
  supplierName: '',
  validFrom: '',
  validUntil: '',
});
const authorizationForm = reactive({
  admissionStatus: 'PENDING' as FdmProcurementSupplierApi.ApprovalStatus,
  companyStatus: 'ENABLED' as FdmProcurementSupplierApi.CompanyStatus,
  directShipAllowed: false,
  validFrom: '',
  validUntil: '',
});

const filteredRows = computed(() =>
  rows.value.filter((row) => !status.value || row.status === status.value),
);
const pagedRows = computed(() =>
  filteredRows.value.slice(
    (pageNo.value - 1) * pageSize.value,
    pageNo.value * pageSize.value,
  ),
);

useFdmWaimaoAiContext(() => ({
  companyId: companyId.value || undefined,
  context: {
    filters: {
      keywordApplied: Boolean(keyword.value.trim()),
      status: status.value,
    },
    loading: loading.value,
    summary: {
      approvedCount: filteredRows.value.filter(
        (row) => row.approvalStatus === 'APPROVED',
      ).length,
      disabledCount: filteredRows.value.filter(
        (row) => row.status === 'DISABLED',
      ).length,
      loadedCount: rows.value.length,
      visibleCount: filteredRows.value.length,
    },
  },
  contextMode: 'list',
  surfaceKey: 'procurement-supplier',
}));

async function initialize() {
  if (!canQuery.value) return;
  try {
    const result = await getDataCompanySimpleList();
    companies.value = (result || [])
      .filter((item) => item.id !== undefined)
      .map((item) => ({
        label: item.companyShortName || item.companyName || String(item.id),
        value: String(item.id),
      }));
    if (companies.value.length === 1)
      companyId.value = companies.value[0]!.value;
    if (companyId.value) await load();
  } catch {
    error.value = '可访问公司读取失败。';
  }
}

async function load() {
  if (!companyId.value || !canQuery.value) return;
  loading.value = true;
  error.value = '';
  try {
    rows.value = await getProcurementSupplierList({
      companyId: companyId.value,
      keyword: keyword.value.trim() || undefined,
    });
    pageNo.value = 1;
  } catch {
    rows.value = [];
    error.value = '供应商读取失败，请核对公司数据权限。';
  } finally {
    loading.value = false;
  }
}

function resetForm(row?: FdmProcurementSupplierApi.Supplier) {
  editing.value = row;
  Object.assign(form, {
    admissionStatus: row?.admissionStatus || 'PENDING',
    approvalStatus: row?.approvalStatus || 'PENDING',
    companyStatus: row?.companyStatus || 'ENABLED',
    directShipAllowed: row?.directShipAllowed || false,
    erpSupplierId: row?.erpSupplierId || '',
    remark: row?.remark || '',
    status: row?.status || 'ENABLED',
    supplierCode: row?.supplierCode || '',
    supplierName: row?.supplierName || '',
    validFrom: row?.validFrom || '',
    validUntil: row?.validUntil || '',
  });
}

function openCreate() {
  if (!companyId.value || !canCreate.value) return;
  resetForm();
  modalOpen.value = true;
}

function openEdit(row: FdmProcurementSupplierApi.Supplier) {
  if (!canUpdate.value) return;
  resetForm(row);
  modalOpen.value = true;
}

function openAuthorization(row: FdmProcurementSupplierApi.Supplier) {
  if (!canAuthorizeCompany.value) return;
  authorizationEditing.value = row;
  Object.assign(authorizationForm, {
    admissionStatus: row.admissionStatus,
    companyStatus: row.companyStatus,
    directShipAllowed: row.directShipAllowed,
    validFrom: row.validFrom,
    validUntil: row.validUntil,
  });
  authorizationModalOpen.value = true;
}

function asSupplier(record: Record<string, unknown>) {
  return record as unknown as FdmProcurementSupplierApi.Supplier;
}

async function save() {
  if (
    !companyId.value ||
    !form.supplierName.trim() ||
    (!editing.value && !form.supplierCode.trim())
  ) {
    message.warning('请填写供应商编码和名称。');
    return;
  }
  saving.value = true;
  try {
    await (editing.value
      ? updateProcurementSupplier({
          approvalStatus: form.approvalStatus,
          companyId: companyId.value,
          erpSupplierId: form.erpSupplierId.trim() || undefined,
          expectedVersion: editing.value.version,
          id: editing.value.id,
          remark: form.remark.trim() || undefined,
          status: form.status,
          supplierName: form.supplierName.trim(),
        })
      : createProcurementSupplier({
          ...form,
          companyId: companyId.value,
          erpSupplierId: form.erpSupplierId.trim() || undefined,
          remark: form.remark.trim() || undefined,
          supplierCode: form.supplierCode.trim(),
          supplierName: form.supplierName.trim(),
        }));
    message.success(editing.value ? '供应商已更新' : '供应商已新增');
    modalOpen.value = false;
    await load();
  } catch {
    message.error('保存失败；若数据版本已变化，请刷新后重试。');
  } finally {
    saving.value = false;
  }
}

async function authorizeCompany() {
  const row = authorizationEditing.value;
  if (!row) return;
  if (!authorizationForm.validFrom || !authorizationForm.validUntil) {
    message.warning('请填写公司准入有效期。');
    return;
  }
  if (authorizationForm.validFrom > authorizationForm.validUntil) {
    message.warning('准入结束日期不能早于开始日期。');
    return;
  }
  authorizing.value = true;
  try {
    await authorizeProcurementSupplierCompany({
      admissionStatus: authorizationForm.admissionStatus,
      companyId: row.companyId,
      directShipAllowed: authorizationForm.directShipAllowed,
      expectedVersion: row.companyVersion,
      status: authorizationForm.companyStatus,
      supplierId: row.id,
      validFrom: authorizationForm.validFrom,
      validUntil: authorizationForm.validUntil,
    });
    message.success('公司准入信息已更新');
    authorizationModalOpen.value = false;
    authorizationEditing.value = undefined;
    await load();
  } catch {
    message.error('准入信息保存失败；若数据版本已变化，请刷新后重试。');
  } finally {
    authorizing.value = false;
  }
}

const columns = [
  { dataIndex: 'supplierCode', key: 'supplierCode', title: '供应商编码' },
  { dataIndex: 'supplierName', key: 'supplierName', title: '供应商名称' },
  { key: 'status', title: '状态', width: 120 },
  { key: 'approval', title: '审批 / 准入', width: 160 },
  { key: 'validity', title: '公司准入有效期', width: 210 },
  { key: 'actions', title: '操作', width: 190 },
];

void initialize();
</script>

<template>
  <Page title="供应商资料" description="真实采购供应商主数据与公司准入状态">
    <template #extra>
      <Button
        v-if="canCreate"
        type="primary"
        :disabled="!companyId"
        @click="openCreate"
      >
        新增供应商
      </Button>
    </template>
    <Alert
      v-if="!canQuery"
      message="当前账号没有供应商查询权限"
      type="warning"
      show-icon
    />
    <div v-else class="supplier-page">
      <Alert v-if="error" :message="error" type="error" show-icon />
      <Card size="small">
        <Space wrap>
          <Select
            v-model:value="companyId"
            :options="companies"
            placeholder="选择数据公司"
            style="width: 240px"
            @change="load"
          />
          <Input
            v-model:value="keyword"
            allow-clear
            placeholder="供应商编码或名称"
            style="width: 240px"
            @press-enter="load"
          />
          <Select
            v-model:value="status"
            allow-clear
            placeholder="全部状态"
            style="width: 150px"
            :options="
              ['ENABLED', 'DISABLED', 'FROZEN', 'BLACKLISTED'].map((value) => ({
                label: value,
                value,
              }))
            "
            @change="pageNo = 1"
          />
          <Button :loading="loading" :disabled="!companyId" @click="load">
            查询
          </Button>
        </Space>
      </Card>
      <Card size="small">
        <Table
          :columns="columns"
          :data-source="pagedRows"
          :loading="loading"
          :pagination="false"
          row-key="id"
        >
          <template #bodyCell="{ column, record }">
            <template v-if="column.key === 'status'">
              <Tag>{{ record.status }}</Tag>
            </template>
            <template v-else-if="column.key === 'approval'">
              {{ record.approvalStatus }} /
              {{ record.admissionStatus }}
            </template>
            <template v-else-if="column.key === 'validity'">
              {{ record.validFrom }} ～ {{ record.validUntil }}
            </template>
            <template v-else-if="column.key === 'actions'">
              <Space size="small">
                <Button
                  v-if="canUpdate"
                  type="link"
                  @click="openEdit(asSupplier(record))"
                >
                  编辑
                </Button>
                <Button
                  v-if="canAuthorizeCompany"
                  type="link"
                  @click="openAuthorization(asSupplier(record))"
                >
                  公司准入
                </Button>
              </Space>
            </template>
          </template>
        </Table>
        <Pagination
          v-model:current="pageNo"
          v-model:page-size="pageSize"
          :total="filteredRows.length"
          show-size-changer
        />
      </Card>
    </div>

    <Modal
      v-model:open="modalOpen"
      :confirm-loading="saving"
      :title="editing ? '编辑供应商' : '新增供应商'"
      @ok="save"
    >
      <div class="supplier-form">
        <label>供应商编码<Input
            v-model:value="form.supplierCode"
            :disabled="Boolean(editing)"
        /></label>
        <label>供应商名称<Input v-model:value="form.supplierName" /></label>
        <label>ERP 供应商 ID<Input v-model:value="form.erpSupplierId" /></label>
        <label>主状态<Select
            v-model:value="form.status"
            :options="
              ['ENABLED', 'DISABLED', 'FROZEN', 'BLACKLISTED'].map((value) => ({
                label: value,
                value,
              }))
            "
        /></label>
        <label>审批状态<Select
            v-model:value="form.approvalStatus"
            :options="
              ['PENDING', 'APPROVED', 'REJECTED'].map((value) => ({
                label: value,
                value,
              }))
            "
        /></label>
        <template v-if="!editing">
          <label>公司状态<Select
              v-model:value="form.companyStatus"
              :options="
                ['ENABLED', 'DISABLED'].map((value) => ({
                  label: value,
                  value,
                }))
              "
          /></label>
          <label>准入状态<Select
              v-model:value="form.admissionStatus"
              :options="
                ['PENDING', 'APPROVED', 'REJECTED'].map((value) => ({
                  label: value,
                  value,
                }))
              "
          /></label>
          <label>准入开始<Input v-model:value="form.validFrom" type="date" /></label>
          <label>准入结束<Input v-model:value="form.validUntil" type="date" /></label>
          <label class="switch-field">允许直发<Switch v-model:checked="form.directShipAllowed" /></label>
        </template>
        <label>备注<Input.TextArea v-model:value="form.remark" :maxlength="2000" /></label>
      </div>
    </Modal>

    <Modal
      v-model:open="authorizationModalOpen"
      :confirm-loading="authorizing"
      title="维护公司准入"
      @ok="authorizeCompany"
    >
      <Alert
        v-if="authorizationEditing"
        :message="`${authorizationEditing.supplierCode} · ${authorizationEditing.supplierName}`"
        description="准入状态、有效期和直发资格使用独立版本控制，不会覆盖供应商主档。"
        type="info"
        show-icon
      />
      <div class="supplier-form authorization-form">
        <label>公司状态<Select
            v-model:value="authorizationForm.companyStatus"
            :options="
              ['ENABLED', 'DISABLED'].map((value) => ({ label: value, value }))
            "
        /></label>
        <label>准入状态<Select
            v-model:value="authorizationForm.admissionStatus"
            :options="
              ['PENDING', 'APPROVED', 'REJECTED'].map((value) => ({
                label: value,
                value,
              }))
            "
        /></label>
        <label>准入开始<Input
            v-model:value="authorizationForm.validFrom"
            type="date"
        /></label>
        <label>准入结束<Input
            v-model:value="authorizationForm.validUntil"
            type="date"
        /></label>
        <label class="switch-field">允许直发<Switch
            v-model:checked="authorizationForm.directShipAllowed"
        /></label>
      </div>
    </Modal>
  </Page>
</template>

<style scoped>
.supplier-page,
.supplier-form {
  display: grid;
  gap: 12px;
}

.supplier-form {
  grid-template-columns: repeat(2, minmax(0, 1fr));
}

.authorization-form {
  margin-top: 16px;
}

.supplier-form label {
  display: grid;
  gap: 6px;
}

.supplier-form label:last-child {
  grid-column: 1 / -1;
}

.switch-field {
  align-content: start;
}

@media (max-width: 700px) {
  .supplier-form {
    grid-template-columns: 1fr;
  }
}
</style>
