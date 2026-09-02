<script lang="ts" setup>
import type { TableColumnsType } from 'ant-design-vue';

import type { ComplianceDraftFact } from './compliance-policy';

import type { FdmProcurementSupplierProductApi } from '#/api/fdmprocurement/supplier-product';
import type { ProductSelectionValue } from '#/views/fdmproduct/shared/product-selection';

import { computed, reactive, ref } from 'vue';

import { useAccess } from '@vben/access';
import { Page } from '@vben/common-ui';

import {
  Alert,
  Button,
  Card,
  Descriptions,
  Divider,
  Drawer,
  Empty,
  Input,
  message,
  Modal,
  Pagination,
  Select,
  Space,
  Table,
  Tag,
} from 'ant-design-vue';

import { getDataCompanySimpleList } from '#/api/fdmdata/datacompany';
import { getProcurementSupplierList } from '#/api/fdmprocurement/supplier';
import {
  createProcurementSupplierProduct,
  getProcurementSupplierProductComplianceList,
  getProcurementSupplierProductList,
  publishProcurementSupplierProductCompliance,
} from '#/api/fdmprocurement/supplier-product';
import { useFdmWaimaoAiContext } from '#/views/fdm-trade-shared/ai-assistant/context';
import { ProductSelectionModal } from '#/views/fdmproduct/shared';

import { canUseSupplierMasterAction } from '../supplier-master-permissions';
import {
  COMPLIANCE_FACT_TYPE_LABEL,
  COMPLIANCE_FACT_TYPE_OPTIONS,
  copyCurrentFactsToDraft,
  createComplianceDraftFact,
  evaluateComplianceFactSet,
  validateComplianceDraftFacts,
} from './compliance-policy';

defineOptions({ name: 'FdmProcurementSupplierProduct' });

const { hasAccessByCodes } = useAccess();
const hasPermission = (code: string) => hasAccessByCodes([code]);
const canQuery = computed(() =>
  canUseSupplierMasterAction('SUPPLIER_PRODUCT_READ', hasPermission),
);
const canQuerySuppliers = computed(() =>
  canUseSupplierMasterAction('SUPPLIER_READ', hasPermission),
);
const canReadCompliance = computed(() =>
  canUseSupplierMasterAction('COMPLIANCE_READ', hasPermission),
);
const canPublishCompliance = computed(() =>
  canUseSupplierMasterAction('COMPLIANCE_PUBLISH', hasPermission),
);
const canCreate = computed(
  () =>
    canUseSupplierMasterAction('SUPPLIER_PRODUCT_CREATE', hasPermission) &&
    canQuerySuppliers.value &&
    hasPermission('fdmproduct:selection:query'),
);

const companies = ref<Array<{ label: string; value: string }>>([]);
const suppliers = ref<Array<{ label: string; value: string }>>([]);
const rows = ref<FdmProcurementSupplierProductApi.SupplierProduct[]>([]);
const companyId = ref('');
const skuFilter = ref('');
const loading = ref(false);
const saving = ref(false);
const error = ref('');
const modalOpen = ref(false);
const productPickerOpen = ref(false);
const pageNo = ref(1);
const pageSize = ref(10);
const selectedProductLabel = ref('');
const complianceDrawerOpen = ref(false);
const complianceLoaded = ref(false);
const complianceLoadError = ref(false);
const complianceLoading = ref(false);
const compliancePublishing = ref(false);
const publishModalOpen = ref(false);
const selectedComplianceProduct = ref<
  FdmProcurementSupplierProductApi.SupplierProduct | undefined
>();
const complianceFacts = ref<FdmProcurementSupplierProductApi.ComplianceFact[]>(
  [],
);
const complianceDrafts = ref<ComplianceDraftFact[]>([]);
const complianceValidationErrors = ref<string[]>([]);

const form = reactive<FdmProcurementSupplierProductApi.CreateReq>({
  approvalStatus: 'PENDING',
  companyId: '',
  mappingType: 'EXACT',
  minOrderQty: '1',
  packageMultiple: '1',
  productId: '',
  productVersionToken: '',
  purchaseUnit: 'PCS',
  skuId: '',
  supplierId: '',
  supplierProductCode: '',
  supplierProductName: '',
  unitConversionFactor: '1',
  validFrom: '',
  validUntil: '',
});

const pagedRows = computed(() =>
  rows.value.slice(
    (pageNo.value - 1) * pageSize.value,
    pageNo.value * pageSize.value,
  ),
);
const supplierNameById = computed(() =>
  Object.fromEntries(suppliers.value.map((item) => [item.value, item.label])),
);
const complianceHealth = computed(() =>
  selectedComplianceProduct.value
    ? evaluateComplianceFactSet(
        selectedComplianceProduct.value,
        complianceFacts.value,
        {
          loadError: complianceLoadError.value,
          loaded: complianceLoaded.value,
        },
      )
    : undefined,
);

useFdmWaimaoAiContext(() => ({
  companyId: companyId.value || undefined,
  context: {
    filters: { skuFilterApplied: Boolean(skuFilter.value.trim()) },
    loading: loading.value,
    summary: {
      approvedCount: rows.value.filter(
        (row) => row.approvalStatus === 'APPROVED',
      ).length,
      complianceAuthorityCount: rows.value.filter(
        (row) =>
          row.complianceVersion > 0 &&
          /^[a-f0-9]{64}$/i.test(row.complianceSnapshotHash || ''),
      ).length,
      complianceMissingCount: rows.value.filter(
        (row) =>
          !Number.isInteger(row.complianceVersion) ||
          row.complianceVersion <= 0 ||
          !/^[a-f0-9]{64}$/i.test(row.complianceSnapshotHash || ''),
      ).length,
      loadedCount: rows.value.length,
      supplierCount: new Set(rows.value.map((row) => row.supplierId)).size,
    },
  },
  contextMode: 'list',
  surfaceKey: 'procurement-supplier-product',
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
    if (companyId.value) await changeCompany();
  } catch {
    error.value = '公司列表读取失败。';
  }
}

async function loadSuppliers() {
  if (!companyId.value || !canQuerySuppliers.value) return;
  const result = await getProcurementSupplierList({
    companyId: companyId.value,
  });
  suppliers.value = result.map((item) => ({
    label: `${item.supplierCode} · ${item.supplierName}`,
    value: item.id,
  }));
}

async function load() {
  if (!companyId.value || !canQuery.value) return;
  loading.value = true;
  error.value = '';
  try {
    rows.value = await getProcurementSupplierProductList({
      companyId: companyId.value,
      skuId: skuFilter.value.trim() || undefined,
    });
    pageNo.value = 1;
  } catch {
    rows.value = [];
    error.value = '供应商产品映射读取失败。';
  } finally {
    loading.value = false;
  }
}

async function changeCompany() {
  complianceDrawerOpen.value = false;
  publishModalOpen.value = false;
  selectedComplianceProduct.value = undefined;
  suppliers.value = [];
  rows.value = [];
  await Promise.all([loadSuppliers(), load()]);
}

async function loadComplianceFacts(product = selectedComplianceProduct.value) {
  if (!product || !canReadCompliance.value) return;
  complianceLoading.value = true;
  complianceLoaded.value = false;
  complianceLoadError.value = false;
  complianceFacts.value = [];
  try {
    complianceFacts.value = await getProcurementSupplierProductComplianceList({
      companyId: product.companyId,
      supplierProductId: product.id,
    });
    complianceLoaded.value = true;
  } catch {
    complianceLoadError.value = true;
  } finally {
    complianceLoading.value = false;
  }
}

async function openCompliance(value: Record<string, unknown>) {
  const product =
    value as unknown as FdmProcurementSupplierProductApi.SupplierProduct;
  if (!product.id || !product.companyId) {
    message.error('当前映射缺少服务端身份字段，无法读取合规事实。');
    return;
  }
  selectedComplianceProduct.value = product;
  complianceDrawerOpen.value = true;
  await loadComplianceFacts(product);
}

function openCompliancePublish() {
  if (!selectedComplianceProduct.value || complianceLoadError.value) {
    message.warning('当前权威事实未成功读取，不能基于未知状态发布新版本。');
    return;
  }
  complianceDrafts.value =
    complianceFacts.value.length > 0
      ? copyCurrentFactsToDraft(complianceFacts.value)
      : [createComplianceDraftFact()];
  complianceValidationErrors.value = [];
  publishModalOpen.value = true;
}

function addComplianceDraft() {
  if (complianceDrafts.value.length >= 500) {
    message.warning('单个合规版本最多包含 500 条事实。');
    return;
  }
  complianceDrafts.value.push(createComplianceDraftFact());
}

function removeComplianceDraft(key: string) {
  complianceDrafts.value = complianceDrafts.value.filter(
    (item) => item.key !== key,
  );
}

function changeComplianceFactType(draft: ComplianceDraftFact) {
  if (draft.factType === 'CUSTOMER_COMPLIANCE') {
    draft.scopeType = 'CUSTOMER';
    draft.scopeValue ||= '';
  } else {
    draft.scopeType = 'GLOBAL';
    draft.scopeValue = undefined;
  }
}

async function publishCompliance() {
  const product = selectedComplianceProduct.value;
  if (!product) return;
  const validation = validateComplianceDraftFacts(complianceDrafts.value);
  complianceValidationErrors.value = validation.errors;
  if (!validation.valid) {
    message.warning('请先修正合规事实中的校验问题。');
    return;
  }
  if (
    !Number.isInteger(product.version) ||
    !Number.isInteger(product.complianceVersion)
  ) {
    message.error('服务端未返回有效的乐观锁版本，已阻止发布。');
    return;
  }
  compliancePublishing.value = true;
  try {
    const nextVersion = await publishProcurementSupplierProductCompliance({
      companyId: product.companyId,
      expectedComplianceVersion: product.complianceVersion,
      expectedProductVersion: product.version,
      facts: validation.facts,
      supplierProductId: product.id,
    });
    message.success(`合规事实完整版本 v${nextVersion} 已发布`);
    publishModalOpen.value = false;
    const selectedId = product.id;
    await load();
    const refreshed = rows.value.find((item) => item.id === selectedId);
    if (refreshed) {
      selectedComplianceProduct.value = refreshed;
      await loadComplianceFacts(refreshed);
    } else {
      complianceDrawerOpen.value = false;
    }
  } catch {
    message.error(
      '发布失败，可能是映射或合规版本已变化。已重新读取服务端权威版本，请核对后再发布。',
    );
    await load();
    const refreshed = rows.value.find((item) => item.id === product.id);
    if (refreshed) {
      selectedComplianceProduct.value = refreshed;
      await loadComplianceFacts(refreshed);
    }
  } finally {
    compliancePublishing.value = false;
  }
}

function abbreviatedHash(value?: null | string) {
  if (!value) return '未提供';
  return value.length > 20 ? `${value.slice(0, 10)}…${value.slice(-8)}` : value;
}

function complianceFactTypeLabel(value: unknown) {
  const type = value as FdmProcurementSupplierProductApi.ComplianceFactType;
  return COMPLIANCE_FACT_TYPE_LABEL[type] || String(value || '未知类型');
}

function factValidity(value: Record<string, unknown>) {
  const fact =
    value as unknown as FdmProcurementSupplierProductApi.ComplianceFact;
  const today = new Date();
  const local = new Date(today.getTime() - today.getTimezoneOffset() * 60_000)
    .toISOString()
    .slice(0, 10);
  if (fact.validFrom > local) return { color: 'blue', label: '未生效' };
  if (fact.validUntil < local) return { color: 'red', label: '已过期' };
  return { color: 'green', label: '有效' };
}

function openCreate() {
  Object.assign(form, {
    approvalStatus: 'PENDING',
    companyId: companyId.value,
    mappingType: 'EXACT',
    minOrderQty: '1',
    packageMultiple: '1',
    productId: '',
    productVersionToken: '',
    purchaseUnit: 'PCS',
    skuId: '',
    supplierId: '',
    supplierProductCode: '',
    supplierProductName: '',
    unitConversionFactor: '1',
    validFrom: '',
    validUntil: '',
    verifiedCapacityQty: undefined,
  });
  selectedProductLabel.value = '';
  modalOpen.value = true;
}

function selectProduct(value: ProductSelectionValue) {
  form.productId = value.productId;
  form.skuId = value.skuId;
  form.productVersionToken = value.versionToken;
  form.purchaseUnit = value.unit || form.purchaseUnit;
  selectedProductLabel.value = `${value.productCode} / ${value.skuCode} · ${value.productName}`;
}

async function save() {
  if (
    !form.supplierId ||
    !form.skuId ||
    !form.supplierProductCode.trim() ||
    !form.validFrom ||
    !form.validUntil
  ) {
    message.warning('请选择供应商和 SKU，并补全编码与有效期。');
    return;
  }
  saving.value = true;
  try {
    await createProcurementSupplierProduct({
      ...form,
      supplierProductCode: form.supplierProductCode.trim(),
      supplierProductName: form.supplierProductName?.trim() || undefined,
    });
    message.success('供应商产品映射已新增');
    modalOpen.value = false;
    await load();
  } catch {
    message.error('新增失败，请核对产品版本、准入状态与有效期。');
  } finally {
    saving.value = false;
  }
}

const columns: TableColumnsType = [
  { key: 'supplier', title: '供应商', width: 220 },
  { key: 'product', title: '产品 / SKU', width: 210 },
  { dataIndex: 'supplierProductCode', key: 'code', title: '供应商产品编码' },
  { key: 'conversion', title: '采购单位 / 换算', width: 150 },
  { key: 'quantity', title: 'MOQ / 包装倍数', width: 150 },
  { key: 'status', title: '映射 / 审批', width: 180 },
  { key: 'compliance', title: '合规权威版本', width: 160 },
  { key: 'validity', title: '有效期', width: 210 },
  { key: 'actions', fixed: 'right', title: '操作', width: 110 },
];

const complianceColumns: TableColumnsType = [
  { key: 'fact', title: '事实类型 / 编码', width: 210 },
  { key: 'scope', title: '作用域', width: 150 },
  { dataIndex: 'evidenceReference', key: 'evidence', title: '证据引用' },
  { key: 'validity', title: '证据有效期', width: 220 },
  { key: 'hash', title: '事实 Hash', width: 180 },
];

void initialize();
</script>

<template>
  <Page
    title="产品供应商映射"
    description="真实产品中心 SKU 与采购供应商的版本化映射"
  >
    <template #extra>
      <Button
        v-if="canCreate"
        type="primary"
        :disabled="!companyId"
        @click="openCreate"
      >
        新增映射
      </Button>
    </template>
    <Alert
      v-if="!canQuery"
      message="当前账号没有供应商产品映射查询权限"
      type="warning"
      show-icon
    />
    <div v-else class="mapping-page">
      <Alert v-if="error" :message="error" type="error" show-icon />
      <Card size="small">
        <Space wrap>
          <Select
            v-model:value="companyId"
            :options="companies"
            placeholder="选择数据公司"
            style="width: 240px"
            @change="changeCompany"
          />
          <Input
            v-model:value="skuFilter"
            allow-clear
            placeholder="按 SKU Long ID 精确筛选"
            style="width: 240px"
            @press-enter="load"
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
          :scroll="{ x: 1450 }"
        >
          <template #bodyCell="{ column, record }">
            <template v-if="column.key === 'supplier'">
              {{ supplierNameById[record.supplierId] || record.supplierId }}
            </template>
            <template v-else-if="column.key === 'product'">
              产品 {{ record.productId }}<br />SKU {{ record.skuId }}
            </template>
            <template v-else-if="column.key === 'conversion'">
              {{ record.purchaseUnit }} ×
              {{ record.unitConversionFactor }}
            </template>
            <template v-else-if="column.key === 'quantity'">
              {{ record.minOrderQty }} / {{ record.packageMultiple }}
            </template>
            <template v-else-if="column.key === 'status'">
              <Tag>{{ record.mappingType }}</Tag><Tag>{{ record.approvalStatus }}</Tag>
            </template>
            <template v-else-if="column.key === 'compliance'">
              <Tag
                v-if="
                  record.complianceVersion > 0 &&
                  /^[a-f0-9]{64}$/i.test(record.complianceSnapshotHash || '')
                "
                color="green"
              >
                已发布 v{{ record.complianceVersion }}
              </Tag>
              <Tag v-else-if="record.complianceVersion > 0" color="red">
                快照异常
              </Tag>
              <Tag v-else color="orange">未发布 · Fail-closed</Tag>
            </template>
            <template v-else-if="column.key === 'validity'">
              {{ record.validFrom }} ～ {{ record.validUntil }}
            </template>
            <template v-else-if="column.key === 'actions'">
              <Button type="link" size="small" @click="openCompliance(record)">
                合规事实
              </Button>
            </template>
          </template>
        </Table>
        <Pagination
          v-model:current="pageNo"
          v-model:page-size="pageSize"
          :total="rows.length"
          show-size-changer
        />
      </Card>
    </div>

    <Modal
      v-model:open="modalOpen"
      :confirm-loading="saving"
      title="新增供应商产品映射"
      width="760px"
      @ok="save"
    >
      <div class="mapping-form">
        <label>供应商<Select
            v-model:value="form.supplierId"
            show-search
            :options="suppliers"
        /></label>
        <label>产品中心 SKU
          <div class="product-choice">
            <Input
              :value="selectedProductLabel"
              readonly
              placeholder="尚未选择"
            /><Button @click="productPickerOpen = true">选择 SKU</Button>
          </div></label>
        <label>供应商产品编码<Input v-model:value="form.supplierProductCode" /></label>
        <label>供应商产品名称<Input v-model:value="form.supplierProductName" /></label>
        <label>采购单位<Input v-model:value="form.purchaseUnit" /></label>
        <label>单位换算系数<Input v-model:value="form.unitConversionFactor" /></label>
        <label>最小起订量<Input v-model:value="form.minOrderQty" /></label>
        <label>包装倍数<Input v-model:value="form.packageMultiple" /></label>
        <label>映射类型<Select
            v-model:value="form.mappingType"
            :options="
              ['EXACT', 'APPROVED_SUBSTITUTE'].map((value) => ({
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
        <label>有效开始<Input v-model:value="form.validFrom" type="date" /></label>
        <label>有效结束<Input v-model:value="form.validUntil" type="date" /></label>
        <label>核定产能（可选）<Input v-model:value="form.verifiedCapacityQty" /></label>
        <label>产能有效期（可选）<Input
            v-model:value="form.capacityValidUntil"
            type="date"
        /></label>
      </div>
    </Modal>

    <Drawer
      v-model:open="complianceDrawerOpen"
      :width="980"
      title="供应商产品合规事实"
    >
      <template #extra>
        <Space>
          <Button
            :loading="complianceLoading"
            :disabled="!selectedComplianceProduct"
            @click="loadComplianceFacts()"
          >
            重新读取
          </Button>
          <Button
            v-if="canPublishCompliance"
            type="primary"
            :disabled="
              !selectedComplianceProduct ||
              complianceLoading ||
              complianceLoadError ||
              !complianceLoaded
            "
            @click="openCompliancePublish"
          >
            发布新版本
          </Button>
        </Space>
      </template>

      <div v-if="selectedComplianceProduct" class="compliance-drawer">
        <Descriptions :column="2" bordered size="small">
          <Descriptions.Item label="供应商产品">
            {{ selectedComplianceProduct.supplierProductCode }} ·
            {{ selectedComplianceProduct.supplierProductName || '未命名' }}
          </Descriptions.Item>
          <Descriptions.Item label="供应商">
            {{
              supplierNameById[selectedComplianceProduct.supplierId] ||
              selectedComplianceProduct.supplierId
            }}
          </Descriptions.Item>
          <Descriptions.Item label="产品 / SKU">
            {{ selectedComplianceProduct.productId }} /
            {{ selectedComplianceProduct.skuId }}
          </Descriptions.Item>
          <Descriptions.Item label="映射数据版本">
            v{{ selectedComplianceProduct.version }}
          </Descriptions.Item>
          <Descriptions.Item label="当前合规版本">
            v{{ selectedComplianceProduct.complianceVersion || 0 }}
          </Descriptions.Item>
          <Descriptions.Item label="合规快照 Hash">
            <code
              :title="selectedComplianceProduct.complianceSnapshotHash || ''"
            >
              {{
                abbreviatedHash(
                  selectedComplianceProduct.complianceSnapshotHash,
                )
              }}
            </code>
          </Descriptions.Item>
        </Descriptions>

        <Alert
          v-if="complianceHealth"
          :message="complianceHealth.title"
          :description="complianceHealth.detail"
          :type="complianceHealth.level"
          show-icon
        />

        <Card size="small" title="当前不可变版本明细">
          <template #extra>
            <span class="muted-text">
              历史版本由服务端不可变保留；当前接口只返回最新版本
            </span>
          </template>
          <Table
            :columns="complianceColumns"
            :data-source="complianceFacts"
            :loading="complianceLoading"
            :pagination="false"
            :scroll="{ x: 900 }"
            row-key="id"
          >
            <template #emptyText>
              <Empty
                description="服务端没有返回当前版本的合规事实；不会以空数据推断为已合规"
              />
            </template>
            <template #bodyCell="{ column, record }">
              <template v-if="column.key === 'fact'">
                <strong>{{ complianceFactTypeLabel(record.factType) }}</strong>
                <Tag>v{{ record.factSetVersion }}</Tag>
                <br />
                <code>{{ record.factCode }}</code>
              </template>
              <template v-else-if="column.key === 'scope'">
                <Tag :color="record.scopeType === 'GLOBAL' ? 'blue' : 'purple'">
                  {{ record.scopeType === 'GLOBAL' ? '全局' : '客户专属' }}
                </Tag>
                <div v-if="record.scopeValue" class="scope-value">
                  客户 {{ record.scopeValue }}
                </div>
              </template>
              <template v-else-if="column.key === 'evidence'">
                <Tag color="green">{{ record.evidenceStatus }}</Tag>
                <div class="evidence-reference">
                  {{ record.evidenceReference }}
                </div>
              </template>
              <template v-else-if="column.key === 'validity'">
                {{ record.validFrom }} ～ {{ record.validUntil }}
                <Tag :color="factValidity(record).color">
                  {{ factValidity(record).label }}
                </Tag>
              </template>
              <template v-else-if="column.key === 'hash'">
                <code :title="record.factHash">{{
                  abbreviatedHash(record.factHash)
                }}</code>
              </template>
            </template>
          </Table>
        </Card>
      </div>
    </Drawer>

    <Modal
      v-model:open="publishModalOpen"
      :confirm-loading="compliancePublishing"
      :mask-closable="false"
      title="发布供应商产品合规新版本"
      width="1120px"
      @ok="publishCompliance"
    >
      <div class="compliance-publish">
        <Alert
          type="warning"
          show-icon
          message="本次发布会创建一个完整、不可变的新版本"
          description="当前版本的事实已回填为可编辑草稿。请保留仍然有效的事实并修改需要更新的内容；从草稿删除的事实不会出现在新版本中。这不是增量追加。"
        />
        <Descriptions v-if="selectedComplianceProduct" :column="3" size="small">
          <Descriptions.Item label="映射">
            {{ selectedComplianceProduct.supplierProductCode }}
          </Descriptions.Item>
          <Descriptions.Item label="预期映射版本">
            v{{ selectedComplianceProduct.version }}
          </Descriptions.Item>
          <Descriptions.Item label="将从合规版本">
            v{{ selectedComplianceProduct.complianceVersion || 0 }} 发布到 v{{
              (selectedComplianceProduct.complianceVersion || 0) + 1
            }}
          </Descriptions.Item>
        </Descriptions>

        <Alert
          v-if="complianceValidationErrors.length"
          type="error"
          show-icon
          message="发布前校验未通过"
        >
          <template #description>
            <ul class="validation-list">
              <li v-for="item in complianceValidationErrors" :key="item">
                {{ item }}
              </li>
            </ul>
          </template>
        </Alert>

        <div class="fact-toolbar">
          <strong>完整事实集合（{{ complianceDrafts.length }} / 500）</strong>
          <Button @click="addComplianceDraft">添加事实</Button>
        </div>

        <div class="fact-draft-list">
          <Card
            v-for="(draft, index) in complianceDrafts"
            :key="draft.key"
            size="small"
          >
            <template #title>事实 {{ index + 1 }}</template>
            <template #extra>
              <Button
                danger
                size="small"
                type="text"
                @click="removeComplianceDraft(draft.key)"
              >
                移除
              </Button>
            </template>
            <div class="fact-grid">
              <label>
                事实类型
                <Select
                  v-model:value="draft.factType"
                  :options="COMPLIANCE_FACT_TYPE_OPTIONS"
                  @change="changeComplianceFactType(draft)"
                />
              </label>
              <label>
                事实编码
                <Input
                  v-model:value="draft.factCode"
                  :maxlength="128"
                  placeholder="例如 CE、FOB、ISO9001"
                />
              </label>
              <label>
                作用域
                <Input
                  :value="
                    draft.factType === 'CUSTOMER_COMPLIANCE'
                      ? '客户专属'
                      : '全局'
                  "
                  disabled
                />
              </label>
              <label v-if="draft.factType === 'CUSTOMER_COMPLIANCE'">
                客户 Long ID
                <Input
                  v-model:value="draft.scopeValue"
                  placeholder="必须是当前客户的十进制 Long ID"
                />
              </label>
              <label
                :class="{
                  'wide-field': draft.factType !== 'CUSTOMER_COMPLIANCE',
                }"
              >
                证据引用
                <Input
                  v-model:value="draft.evidenceReference"
                  :maxlength="500"
                  placeholder="证书编号、受控文档 URI 或可审计的证据索引"
                />
              </label>
              <label>
                有效开始
                <Input v-model:value="draft.validFrom" type="date" />
              </label>
              <label>
                有效结束
                <Input v-model:value="draft.validUntil" type="date" />
              </label>
            </div>
          </Card>
          <Empty
            v-if="complianceDrafts.length === 0"
            description="完整事实集合不能为空，请添加至少一条事实"
          />
        </div>
        <Divider />
        <p class="muted-text">
          发布时服务端会再次校验公司配置、映射版本、当前合规版本、事实编码、作用域和有效期，并为每条事实及完整集合生成权威
          Hash。
        </p>
      </div>
    </Modal>
    <ProductSelectionModal
      v-model:open="productPickerOpen"
      :company-id="companyId"
      @select="selectProduct"
    />
  </Page>
</template>

<style scoped>
.mapping-page,
.mapping-form,
.compliance-drawer,
.compliance-publish,
.fact-draft-list {
  display: grid;
  gap: 12px;
}

.mapping-form {
  grid-template-columns: repeat(2, minmax(0, 1fr));
}

.mapping-form label {
  display: grid;
  gap: 6px;
}

.product-choice {
  display: flex;
  gap: 8px;
}

.muted-text {
  font-size: 12px;
  color: var(--ant-color-text-secondary, #8c8c8c);
}

.scope-value {
  margin-top: 6px;
  overflow-wrap: anywhere;
}

.evidence-reference {
  margin-top: 6px;
  overflow-wrap: anywhere;
  white-space: pre-wrap;
}

.fact-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.fact-draft-list {
  max-height: 50vh;
  padding-right: 4px;
  overflow: auto;
}

.fact-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 12px;
}

.fact-grid label {
  display: grid;
  gap: 6px;
}

.wide-field {
  grid-column: span 2;
}

.validation-list {
  padding-left: 20px;
  margin: 0;
}

@media (max-width: 700px) {
  .mapping-form,
  .fact-grid {
    grid-template-columns: 1fr;
  }

  .wide-field {
    grid-column: auto;
  }
}
</style>
