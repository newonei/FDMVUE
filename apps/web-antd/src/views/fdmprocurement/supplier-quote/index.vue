<script lang="ts" setup>
import type { FdmProcurementSupplierQuoteApi } from '#/api/fdmprocurement/supplier-quote';

import { computed, reactive, ref } from 'vue';

import { useAccess } from '@vben/access';
import { Page } from '@vben/common-ui';

import {
  Alert,
  Button,
  Card,
  Checkbox,
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
import { getProcurementSupplierProductList } from '#/api/fdmprocurement/supplier-product';
import {
  createProcurementSupplierQuoteVersion,
  getProcurementSupplierQuoteList,
} from '#/api/fdmprocurement/supplier-quote';
import { useFdmWaimaoAiContext } from '#/views/fdm-trade-shared/ai-assistant/context';

import { canUseSupplierMasterAction } from '../supplier-master-permissions';

defineOptions({ name: 'FdmProcurementSupplierQuote' });

const { hasAccessByCodes } = useAccess();
const hasPermission = (code: string) => hasAccessByCodes([code]);
const canReadSensitive = computed(() =>
  canUseSupplierMasterAction('QUOTE_READ', hasPermission),
);
const canCreate = computed(
  () =>
    canReadSensitive.value &&
    canUseSupplierMasterAction('QUOTE_CREATE', hasPermission),
);
const canReadMappings = computed(() =>
  canUseSupplierMasterAction('SUPPLIER_PRODUCT_READ', hasPermission),
);
const canReadSuppliers = computed(() =>
  canUseSupplierMasterAction('SUPPLIER_READ', hasPermission),
);

const companies = ref<Array<{ label: string; value: string }>>([]);
const mappings = ref<Array<{ label: string; value: string }>>([]);
const rows = ref<FdmProcurementSupplierQuoteApi.Quote[]>([]);
const companyId = ref('');
const supplierProductId = ref('');
const loading = ref(false);
const saving = ref(false);
const error = ref('');
const modalOpen = ref(false);
const pageNo = ref(1);
const pageSize = ref(10);

const form = reactive<FdmProcurementSupplierQuoteApi.CreateVersionReq>({
  companyId: '',
  currency: 'CNY',
  leadTimeDays: 0,
  paymentTerms: '',
  quoteNo: '',
  status: 'DRAFT',
  supplierProductId: '',
  taxIncluded: false,
  taxRate: '0',
  tiers: [{ minQty: '1', unitPrice: '0' }],
  unitFreightAmount: '0',
  validFrom: '',
  validUntil: '',
});

const pagedRows = computed(() =>
  rows.value.slice(
    (pageNo.value - 1) * pageSize.value,
    pageNo.value * pageSize.value,
  ),
);

function summarizeQuotes(
  values: readonly FdmProcurementSupplierQuoteApi.Quote[],
) {
  const currencyCounts: Record<string, number> = {};
  let tierCount = 0;
  for (const row of values) {
    currencyCounts[row.currency] = (currencyCounts[row.currency] || 0) + 1;
    tierCount += row.tiers.length;
  }
  return { currencyCounts, tierCount };
}

useFdmWaimaoAiContext(() => {
  const quoteSummary = summarizeQuotes(rows.value);
  return {
    companyId: companyId.value || undefined,
    context: {
      filters: { supplierProductSelected: Boolean(supplierProductId.value) },
      loading: loading.value,
      summary: {
        activeCount: rows.value.filter((row) => row.status === 'ACTIVE').length,
        currencyCounts: quoteSummary.currencyCounts,
        loadedVersionCount: rows.value.length,
        tierCount: quoteSummary.tierCount,
      },
    },
    contextMode: 'list',
    surfaceKey: 'procurement-supplier-quote',
  };
});

async function initialize() {
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
    if (companyId.value && canReadSensitive.value) await changeCompany();
  } catch {
    error.value = '公司列表读取失败。';
  }
}

async function changeCompany() {
  mappings.value = [];
  supplierProductId.value = '';
  rows.value = [];
  if (!companyId.value || !canReadSensitive.value) return;
  if (!canReadMappings.value) {
    error.value = '缺少 supplier-product:query，无法选择报价所属映射。';
    return;
  }
  loading.value = true;
  try {
    const [mappingRows, suppliers] = await Promise.all([
      getProcurementSupplierProductList({ companyId: companyId.value }),
      canReadSuppliers.value
        ? getProcurementSupplierList({})
        : Promise.resolve([]),
    ]);
    const supplierNames = Object.fromEntries(
      suppliers.map((item) => [item.id, item.supplierName]),
    );
    mappings.value = mappingRows.map((item) => ({
      label: `${supplierNames[item.supplierId] || item.supplierId} · ${item.supplierProductCode} · SKU ${item.skuId}`,
      value: item.id,
    }));
  } catch {
    error.value = '供应商产品映射读取失败，无法选择报价对象。';
  } finally {
    loading.value = false;
  }
}

async function load() {
  if (!companyId.value || !supplierProductId.value || !canReadSensitive.value)
    return;
  loading.value = true;
  error.value = '';
  try {
    rows.value = await getProcurementSupplierQuoteList({
      companyId: companyId.value,
      supplierProductId: supplierProductId.value,
    });
    pageNo.value = 1;
  } catch {
    rows.value = [];
    error.value = '敏感报价读取失败，请核对 view-sensitive 权限和公司配置。';
  } finally {
    loading.value = false;
  }
}

function openCreate() {
  Object.assign(form, {
    companyId: companyId.value,
    currency: 'CNY',
    leadTimeDays: 0,
    paymentTerms: '',
    quoteNo: '',
    sourceChecksum: undefined,
    sourceFilename: undefined,
    status: 'DRAFT',
    supplierProductId: supplierProductId.value,
    taxIncluded: false,
    taxRate: '0',
    tiers: [{ minQty: '1', unitPrice: '0' }],
    unitFreightAmount: '0',
    validFrom: '',
    validUntil: '',
  });
  modalOpen.value = true;
}

function addTier() {
  form.tiers.push({ minQty: '', unitPrice: '' });
}

function removeTier(index: number) {
  if (form.tiers.length > 1) form.tiers.splice(index, 1);
}

async function save() {
  if (
    !form.quoteNo.trim() ||
    !form.paymentTerms.trim() ||
    !form.validFrom ||
    !form.validUntil ||
    form.tiers.some((tier) => tier.minQty === '' || tier.unitPrice === '')
  ) {
    message.warning('请补全报价编号、账期、有效期和阶梯价格。');
    return;
  }
  saving.value = true;
  try {
    await createProcurementSupplierQuoteVersion({
      ...form,
      paymentTerms: form.paymentTerms.trim(),
      quoteNo: form.quoteNo.trim(),
    });
    message.success('报价版本已新增');
    modalOpen.value = false;
    await load();
  } catch {
    message.error('报价版本新增失败，请核对有效期、币种和阶梯区间。');
  } finally {
    saving.value = false;
  }
}

const columns = [
  { key: 'quote', title: '报价版本', width: 170 },
  { key: 'status', title: '状态', width: 100 },
  { key: 'price', title: '敏感阶梯价格', width: 240 },
  { key: 'tax', title: '税费 / 运费', width: 180 },
  { key: 'delivery', title: '交期 / 账期', width: 200 },
  { key: 'validity', title: '有效期', width: 210 },
];

void initialize();
</script>

<template>
  <Page
    title="供应商报价"
    description="按公司配置管理的敏感供应商报价版本与阶梯价格"
  >
    <template #extra>
      <Button
        v-if="canCreate"
        type="primary"
        :disabled="!supplierProductId"
        @click="openCreate"
      >
        新增报价版本
      </Button>
    </template>
    <Alert
      v-if="!canReadSensitive"
      message="当前账号缺少 fdmprocurement:supplier-quote:view-sensitive，页面不会请求或展示任何报价字段。"
      type="warning"
      show-icon
    />
    <div v-else class="quote-page">
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
          <Select
            v-model:value="supplierProductId"
            show-search
            :options="mappings"
            placeholder="选择供应商产品映射"
            style="width: 420px"
            @change="load"
          />
          <Button
            :loading="loading"
            :disabled="!supplierProductId"
            @click="load"
          >
            刷新
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
          :scroll="{ x: 1100 }"
        >
          <template #bodyCell="{ column, record }">
            <template v-if="column.key === 'quote'">
              {{ record.quoteNo }} · V{{ record.quoteVersion }}<br />{{
                record.currency
              }}
            </template>
            <template v-else-if="column.key === 'status'">
              <Tag>{{ record.status }}</Tag>
            </template>
            <template v-else-if="column.key === 'price'">
              <div v-for="tier in record.tiers" :key="tier.id">
                {{ tier.minQty }}～{{ tier.maxQty || '∞' }}：{{
                  tier.unitPrice
                }}
                {{ record.currency }}
              </div>
            </template>
            <template v-else-if="column.key === 'tax'">
              税率 {{ record.taxRate }} · 运费
              {{ record.unitFreightAmount }}
            </template>
            <template v-else-if="column.key === 'delivery'">
              {{ record.leadTimeDays }} 天 ·
              {{ record.paymentTerms }}
            </template>
            <template v-else-if="column.key === 'validity'">
              {{ record.validFrom }} ～ {{ record.validUntil }}
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
      title="新增报价版本"
      width="820px"
      @ok="save"
    >
      <div class="quote-form">
        <label>报价编号<Input v-model:value="form.quoteNo" /></label>
        <label
          >状态<Select
            v-model:value="form.status"
            :options="
              ['DRAFT', 'ACTIVE', 'EXPIRED', 'VOIDED'].map((value) => ({
                label: value,
                value,
              }))
            "
        /></label>
        <label
          >币种<Input v-model:value="form.currency" :maxlength="3"
        /></label>
        <label>含税<Checkbox v-model:checked="form.taxIncluded" /></label>
        <label>税率（0～1）<Input v-model:value="form.taxRate" /></label>
        <label>单位运费<Input v-model:value="form.unitFreightAmount" /></label>
        <label
          >交期天数<Input v-model:value="form.leadTimeDays" type="number"
        /></label>
        <label>付款条款<Input v-model:value="form.paymentTerms" /></label>
        <label
          >有效开始<Input v-model:value="form.validFrom" type="date"
        /></label>
        <label
          >有效结束<Input v-model:value="form.validUntil" type="date"
        /></label>
        <section class="tiers">
          <header>
            <strong>阶梯价格</strong
            ><Button size="small" @click="addTier">新增阶梯</Button>
          </header>
          <div
            v-for="(tier, index) in form.tiers"
            :key="index"
            class="tier-row"
          >
            <Input v-model:value="tier.minQty" addon-before="最小量" />
            <Input
              v-model:value="tier.maxQty"
              addon-before="最大量"
              placeholder="不限"
            />
            <Input v-model:value="tier.unitPrice" addon-before="单价" />
            <Button
              danger
              :disabled="form.tiers.length === 1"
              @click="removeTier(index)"
            >
              删除
            </Button>
          </div>
        </section>
      </div>
    </Modal>
  </Page>
</template>

<style scoped>
.quote-page,
.quote-form,
.tiers {
  display: grid;
  gap: 12px;
}

.quote-form {
  grid-template-columns: repeat(2, minmax(0, 1fr));
}

.quote-form label {
  display: grid;
  gap: 6px;
}

.tiers {
  grid-column: 1/-1;
}

.tiers header,
.tier-row {
  display: flex;
  gap: 8px;
  align-items: center;
  justify-content: space-between;
}

@media (max-width: 760px) {
  .quote-form {
    grid-template-columns: 1fr;
  }

  .tier-row {
    display: grid;
  }
}
</style>
