<script lang="ts" setup>
import type { FormInstance, TableColumnsType } from 'ant-design-vue';
import type { Rule } from 'ant-design-vue/es/form';

import type { FdmcaiwuStandardQuotationApi } from '#/api/fdmcaiwu/standard-quotation';

import { computed, nextTick, onMounted, reactive, ref } from 'vue';

import { useAccess } from '@vben/access';
import { Page } from '@vben/common-ui';
import { IconifyIcon } from '@vben/icons';
import { useUserStore } from '@vben/stores';

import {
  Alert,
  Button,
  Card,
  Descriptions,
  Divider,
  Drawer,
  Empty,
  Form,
  FormItem,
  InputNumber,
  message,
  Modal,
  Select,
  Spin,
  Statistic,
  Switch,
  Table,
  Tag,
  Tooltip,
} from 'ant-design-vue';

import {
  calculateStandardQuotation,
  createStandardQuotationSpecification,
  getStandardQuotationOptions,
} from '#/api/fdmcaiwu/standard-quotation';

defineOptions({ name: 'FdmcaiwuStandardQuotation' });

type ProductTypeOption = FdmcaiwuStandardQuotationApi.ProductTypeOption;
type QuotationEntry = FdmcaiwuStandardQuotationApi.QuotationEntry;
type SpecificationRow = FdmcaiwuStandardQuotationApi.SpecificationRow;

interface FormModel {
  includeCarton: boolean;
  includeOpp: boolean;
  includeStrap: boolean;
  includeSupplement: boolean;
  quantity: number;
}

interface CreateSpecificationFormModel {
  lengthMm?: number;
  thicknessMm?: number;
  widthMm?: number;
}

interface DisplayRow extends SpecificationRow {
  key: string;
}

interface SelectedDetail extends DisplayRow {
  composite: boolean;
  entry?: QuotationEntry;
  productCode: string;
  productLabel: string;
  status: FdmcaiwuStandardQuotationApi.CellStatus;
}

interface FilterModel {
  lengthMm?: string;
  productCode?: string;
  quotationStatus: 'ALL' | FdmcaiwuStandardQuotationApi.CellStatus;
  thicknessMm?: string;
  widthMm?: string;
}

interface NormalizedProductType extends ProductTypeOption {
  productCode: string;
  productLabel: string;
}

const PRODUCT_TYPES: NormalizedProductType[] = [
  { productCode: 'TPE_REGULAR', productLabel: 'TPE常规' },
  { productCode: 'TPE_LIGHT', productLabel: 'TPE轻羽' },
  { productCode: 'TPE_ELASTIC', productLabel: 'TPE高弹' },
  {
    composite: true,
    productCode: 'REGULAR_TPE_RUBBER',
    productLabel: '常规TPE+橡胶',
  },
  {
    composite: true,
    productCode: 'ELASTIC_TPE_RUBBER',
    productLabel: '高弹TPE+橡胶',
  },
  { composite: true, productCode: 'TPE_PU', productLabel: 'TPE+PU' },
  {
    composite: true,
    productCode: 'TPE_CORK',
    productLabel: 'TPE+软木',
  },
  {
    composite: true,
    productCode: 'TPE_SUEDE',
    productLabel: 'TPE+麂皮绒',
  },
];

const STATUS_FILTER_OPTIONS = [
  { label: '全部状态', value: 'ALL' },
  { label: '仅看已报价', value: 'CALCULATED' },
  { label: '仅看未配置', value: 'NOT_CONFIGURED' },
  { label: '仅看不可报价', value: 'BLOCKED' },
];

const { hasAccessByCodes } = useAccess();
const userStore = useUserStore();
const canCalculate = hasAccessByCodes([
  'fdmcaiwu:standard-quotation:calculate',
]);

const optionsLoading = ref(false);
const calculating = ref(false);
const optionsError = ref('');
const requestError = ref('');
const productTypes = ref<NormalizedProductType[]>([...PRODUCT_TYPES]);
const options = ref<FdmcaiwuStandardQuotationApi.Options>();
const result = ref<FdmcaiwuStandardQuotationApi.CalculateResp>();
const rows = ref<SpecificationRow[]>([]);
const detailOpen = ref(false);
const selectedDetail = ref<SelectedDetail>();
const calculatedSignature = ref('');
const createSpecificationOpen = ref(false);
const createSpecificationSaving = ref(false);
const createSpecificationFormRef = ref<FormInstance>();
const createSpecificationForm = reactive<CreateSpecificationFormModel>({
  lengthMm: undefined,
  thicknessMm: undefined,
  widthMm: undefined,
});

const isSuperAdmin = computed(() =>
  (userStore.userRoles ?? []).includes('super_admin'),
);

/**
 * 新增规格同时校验登录角色和后端下发能力，避免菜单权限误配造成越权入口。
 */
const canCreateSpecification = computed(
  () =>
    isSuperAdmin.value &&
    (options.value?.capabilities?.canCreateSpecification ??
      result.value?.capabilities?.canCreateSpecification ??
      false),
);

const positiveDimensionRule: Rule = {
  required: true,
  trigger: ['blur', 'change'],
  type: 'number',
  validator: async (_rule, value) => {
    if (value === undefined || value === null) {
      throw new Error('请输入规格尺寸');
    }
    if (!Number.isFinite(value) || value <= 0) {
      throw new Error('规格尺寸必须大于 0');
    }
  },
};

const createSpecificationRules: Record<
  keyof CreateSpecificationFormModel,
  Rule[]
> = {
  lengthMm: [positiveDimensionRule],
  thicknessMm: [positiveDimensionRule],
  widthMm: [positiveDimensionRule],
};

/**
 * 报价明细包含成本、配方及模具信息，必须同时通过登录角色与服务端能力校验。
 * 不复用菜单权限，避免部门经理因拥有超低价权限而获得明细查看能力。
 */
const canViewQuoteDetail = computed(
  () =>
    isSuperAdmin.value &&
    (result.value?.capabilities?.canViewQuoteDetail ??
      options.value?.capabilities?.canViewQuoteDetail ??
      false),
);

const canViewUltraLowPrice = computed(
  () =>
    result.value?.capabilities?.canViewUltraLowPrice ??
    options.value?.capabilities?.canViewUltraLowPrice ??
    false,
);

const tableColumns = computed<TableColumnsType<DisplayRow>>(() => [
  {
    children: [
      {
        className: 'matrix-spec-cell',
        customHeaderCell: () => ({
          class: 'matrix-header matrix-header-spec',
        }),
        dataIndex: 'lengthMm',
        fixed: 'left',
        key: 'lengthMm',
        title: '长度',
        width: 100,
      },
      {
        className: 'matrix-spec-cell',
        customHeaderCell: () => ({
          class: 'matrix-header matrix-header-spec',
        }),
        dataIndex: 'widthMm',
        fixed: 'left',
        key: 'widthMm',
        title: '宽度',
        width: 100,
      },
      {
        className: 'matrix-spec-cell matrix-spec-end-cell',
        customHeaderCell: () => ({
          class: 'matrix-header matrix-header-spec matrix-spec-end-cell',
        }),
        dataIndex: 'thicknessMm',
        fixed: 'left',
        key: 'thicknessMm',
        title: '厚度',
        width: 95,
      },
    ],
    customHeaderCell: () => ({
      class: 'matrix-header matrix-header-spec',
    }),
    key: 'specification',
    title: '规格(mm)',
  },
  ...productTypes.value.map((product, index) => {
    const toneClass = index % 2 === 0 ? 'matrix-header-a' : 'matrix-header-b';
    const productColumns = [
      {
        align: 'center' as const,
        className: 'matrix-weight-cell',
        customHeaderCell: () => ({
          class: `matrix-header ${toneClass}`,
        }),
        key: `weight:${product.productCode}`,
        title: '克重',
        width: 96,
      },
      {
        align: 'center' as const,
        className: `matrix-price-cell ${
          canViewUltraLowPrice.value ? '' : 'matrix-product-end-cell'
        }`,
        customHeaderCell: () => ({
          class: `matrix-header ${toneClass} ${
            canViewUltraLowPrice.value ? '' : 'matrix-product-end-cell'
          }`,
        }),
        key: `regular:${product.productCode}`,
        title: '常规价',
        width: 112,
      },
    ];
    if (canViewUltraLowPrice.value) {
      productColumns.push({
        align: 'center' as const,
        className:
          'matrix-price-cell matrix-ultra-low-cell matrix-product-end-cell',
        customHeaderCell: () => ({
          class: `matrix-header ${toneClass} matrix-header-ultra-low matrix-product-end-cell`,
        }),
        key: `ultra:${product.productCode}`,
        title: '超低价',
        width: 112,
      });
    }
    return {
      children: productColumns,
      customHeaderCell: () => ({
        class: `matrix-header matrix-product-group ${toneClass}`,
      }),
      key: `product:${product.productCode}`,
      title: product.productLabel,
    };
  }),
]);

const formState = reactive<FormModel>({
  includeCarton: false,
  includeOpp: false,
  includeStrap: false,
  includeSupplement: true,
  quantity: 1,
});

const filterState = reactive<FilterModel>({
  lengthMm: undefined,
  productCode: undefined,
  quotationStatus: 'ALL',
  thicknessMm: undefined,
  widthMm: undefined,
});

function hasValue(value: unknown) {
  return value !== undefined && value !== null && value !== '';
}

function toNumber(value: unknown) {
  if (!hasValue(value)) return undefined;
  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? numberValue : undefined;
}

function formatDimension(value: unknown) {
  const numberValue = toNumber(value);
  if (numberValue === undefined) return hasValue(value) ? String(value) : '—';
  return numberValue.toLocaleString('zh-CN', {
    maximumFractionDigits: 2,
    useGrouping: false,
  });
}

function formatMoney(value: unknown) {
  const numberValue = toNumber(value);
  if (numberValue === undefined) return '—';
  return `¥${numberValue.toLocaleString('zh-CN', {
    maximumFractionDigits: 2,
    minimumFractionDigits: 2,
  })}`;
}

function formatExactMoney(value: unknown) {
  return hasValue(value) ? `¥${String(value)}` : '—';
}

function formatPriceCell(value: unknown) {
  const numberValue = toNumber(value);
  if (numberValue === undefined) return hasValue(value) ? String(value) : '—';
  return numberValue.toLocaleString('zh-CN', {
    maximumFractionDigits: 2,
    minimumFractionDigits: 2,
  });
}

function formatDateTime(value: unknown) {
  if (!hasValue(value)) return '—';
  const date = new Date(String(value));
  return Number.isNaN(date.getTime())
    ? String(value)
    : date.toLocaleString('zh-CN', { hour12: false });
}

function normalizeStatus(
  value: unknown,
): FdmcaiwuStandardQuotationApi.CellStatus {
  const status = String(value ?? '').toUpperCase();
  if (['CALCULATED', 'SUCCEEDED', 'SUCCESS'].includes(status)) {
    return 'CALCULATED';
  }
  if (['NOT_CONFIGURED', 'UNCONFIGURED'].includes(status)) {
    return 'NOT_CONFIGURED';
  }
  return 'BLOCKED';
}

function statusLabel(status: FdmcaiwuStandardQuotationApi.CellStatus) {
  if (status === 'CALCULATED') return '已报价';
  if (status === 'NOT_CONFIGURED') return '未配置';
  return '不可报价';
}

function statusColor(status: FdmcaiwuStandardQuotationApi.CellStatus) {
  if (status === 'CALCULATED') return 'success';
  if (status === 'NOT_CONFIGURED') return 'default';
  return 'error';
}

function normalizeProducts(
  sourceProducts?: ProductTypeOption[],
): NormalizedProductType[] {
  if (!sourceProducts?.length) return [...PRODUCT_TYPES];

  const productsByCode = new Map(
    sourceProducts
      .map((item) => [item.productCode ?? item.code, item] as const)
      .filter((item): item is readonly [string, ProductTypeOption] =>
        Boolean(item[0]),
      ),
  );
  return PRODUCT_TYPES.map((fallback) => {
    const source = productsByCode.get(fallback.productCode);
    return {
      ...fallback,
      ...source,
      productCode: fallback.productCode,
      productLabel:
        source?.productLabel ?? source?.label ?? fallback.productLabel,
    };
  });
}

function getEntry(row: SpecificationRow, productCode: string) {
  return (row.entries ?? []).find((entry) => entry.productCode === productCode);
}

function getAdditionalCost(
  entry: QuotationEntry | undefined,
  product?: { composite?: boolean },
) {
  if (!product?.composite || !entry) return undefined;
  if (hasValue(entry.additionalCostPerPiece)) {
    return entry.additionalCostPerPiece;
  }
  if (
    !hasValue(entry.surfaceCostPerPiece) &&
    !hasValue(entry.adhesiveCostPerPiece)
  ) {
    return undefined;
  }
  return (
    (toNumber(entry.surfaceCostPerPiece) ?? 0) +
    (toNumber(entry.adhesiveCostPerPiece) ?? 0)
  );
}

function isPriceColumn(columnKey: unknown) {
  const key = String(columnKey ?? '');
  return key.startsWith('regular:') || key.startsWith('ultra:');
}

function isWeightColumn(columnKey: unknown) {
  return String(columnKey ?? '').startsWith('weight:');
}

function isUltraLowColumn(columnKey: unknown) {
  return String(columnKey ?? '').startsWith('ultra:');
}

function productCodeFromColumn(columnKey: unknown) {
  const key = String(columnKey ?? '');
  const separatorIndex = key.indexOf(':');
  return separatorIndex === -1 ? '' : key.slice(separatorIndex + 1);
}

function getRecordEntry(rawRecord: unknown, productCode: string) {
  return getEntry(rawRecord as SpecificationRow, productCode);
}

function getCellStatus(rawRecord: unknown, productCode: string) {
  return normalizeStatus(
    getRecordEntry(rawRecord, productCode)?.status ?? 'NOT_CONFIGURED',
  );
}

function getCellMessage(rawRecord: unknown, productCode: string) {
  const entry = getRecordEntry(rawRecord, productCode);
  const status = normalizeStatus(entry?.status ?? 'NOT_CONFIGURED');
  const messages = [
    ...(entry?.blockReasons ?? []),
    ...(entry?.warnings ?? []),
  ].filter(Boolean);
  if (messages.length > 0) return messages.join('；');
  if (status === 'NOT_CONFIGURED') return '该规格暂未配置核算参数';
  if (status === 'BLOCKED') return '当前报价引擎无法计算该规格';
  return '点击查看报价明细';
}

function getColumnPrice(rawRecord: unknown, columnKey: unknown) {
  const entry = getRecordEntry(rawRecord, productCodeFromColumn(columnKey));
  if (isUltraLowColumn(columnKey)) {
    return entry?.ultraLowQuoteDisplay;
  }
  return (
    entry?.unitQuoteDisplay ??
    (canViewQuoteDetail.value ? entry?.unitQuoteExact : undefined)
  );
}

function getColumnWeight(rawRecord: unknown, columnKey: unknown) {
  const weight = getRecordEntry(
    rawRecord,
    productCodeFromColumn(columnKey),
  )?.nominalWeightText;
  return hasValue(weight) ? String(weight) : '无';
}

function buildRequest(): FdmcaiwuStandardQuotationApi.CalculateReq {
  return {
    includeCarton: formState.includeCarton,
    includeOpp: formState.includeOpp,
    includeStrap: formState.includeStrap,
    includeSupplement: formState.includeSupplement,
    quantity: formState.quantity,
  };
}

function currentSignature() {
  return JSON.stringify(buildRequest());
}

const resultIsStale = computed(
  () =>
    Boolean(result.value) && calculatedSignature.value !== currentSignature(),
);

const tableScrollX = computed(() =>
  Math.max(
    1959,
    295 +
      productTypes.value.length *
        (canViewUltraLowPrice.value ? 96 + 224 : 96 + 112),
  ),
);

function uniqueDimensionOptions(field: keyof SpecificationRow) {
  const values = [...new Set(rows.value.map((row) => String(row[field])))];
  values.sort((left, right) => Number(left) - Number(right));
  return values.map((value) => ({ label: value, value }));
}

const lengthOptions = computed(() => uniqueDimensionOptions('lengthMm'));
const widthOptions = computed(() => uniqueDimensionOptions('widthMm'));
const thicknessOptions = computed(() => uniqueDimensionOptions('thicknessMm'));
const productFilterOptions = computed(() =>
  productTypes.value.map((product) => ({
    label: product.productLabel,
    value: product.productCode,
  })),
);

const displayRows = computed<DisplayRow[]>(() =>
  rows.value.map((row) => ({
    ...row,
    key: `${row.lengthMm}-${row.widthMm}-${row.thicknessMm}`,
  })),
);

const filteredRows = computed(() =>
  displayRows.value.filter((row) => {
    if (filterState.lengthMm && String(row.lengthMm) !== filterState.lengthMm) {
      return false;
    }
    if (filterState.widthMm && String(row.widthMm) !== filterState.widthMm) {
      return false;
    }
    if (
      filterState.thicknessMm &&
      String(row.thicknessMm) !== filterState.thicknessMm
    ) {
      return false;
    }
    if (filterState.quotationStatus === 'ALL') return true;

    const entries = filterState.productCode
      ? [getEntry(row, filterState.productCode)]
      : productTypes.value.map((product) => getEntry(row, product.productCode));
    return entries.some(
      (entry) =>
        normalizeStatus(entry?.status ?? 'NOT_CONFIGURED') ===
        filterState.quotationStatus,
    );
  }),
);

const calculatedSummary = computed(() => {
  const allEntries = rows.value.flatMap((row) => row.entries ?? []);
  return {
    blockedCount:
      result.value?.summary?.blockedCount ??
      allEntries.filter((entry) => normalizeStatus(entry.status) === 'BLOCKED')
        .length,
    calculatedCount:
      result.value?.summary?.calculatedCount ??
      allEntries.filter(
        (entry) => normalizeStatus(entry.status) === 'CALCULATED',
      ).length,
    cellCount:
      result.value?.summary?.cellCount ??
      rows.value.length * productTypes.value.length,
    notConfiguredCount:
      result.value?.summary?.notConfiguredCount ??
      allEntries.filter(
        (entry) => normalizeStatus(entry.status) === 'NOT_CONFIGURED',
      ).length,
    specCount: result.value?.summary?.specCount ?? rows.value.length,
  };
});

const sourceInfo = computed(
  () => result.value?.source ?? options.value?.source,
);

function validateForm() {
  if (!Number.isInteger(formState.quantity) || formState.quantity <= 0) {
    return '数量必须为大于 0 的整数';
  }
  return '';
}

function applyDefaults(defaults?: FdmcaiwuStandardQuotationApi.Defaults) {
  if (!defaults) return;
  formState.quantity = defaults.quantity ?? 1;
  formState.includeCarton = defaults.includeCarton ?? false;
  formState.includeOpp = defaults.includeOpp ?? false;
  formState.includeStrap = defaults.includeStrap ?? false;
  formState.includeSupplement = defaults.includeSupplement ?? true;
}

async function loadOptions() {
  optionsLoading.value = true;
  optionsError.value = '';
  try {
    const data = await getStandardQuotationOptions();
    options.value = data;
    productTypes.value = normalizeProducts(data?.productTypes);
    applyDefaults(data?.defaults);
    return true;
  } catch (error) {
    optionsError.value =
      error instanceof Error ? error.message : '报价参数加载失败';
    return false;
  } finally {
    optionsLoading.value = false;
  }
}

async function handleCalculate(options: { silent?: boolean } = {}) {
  if (calculating.value) return false;
  if (!canCalculate) {
    message.warning('当前账号没有常规规格报价计算权限');
    return false;
  }
  const errorMessage = validateForm();
  if (errorMessage) {
    message.warning(errorMessage);
    return false;
  }
  calculating.value = true;
  requestError.value = '';
  try {
    const data = await calculateStandardQuotation(buildRequest());
    result.value = data ?? {};
    rows.value = data?.rows ?? data?.specs ?? [];
    if (data?.productTypes?.length) {
      productTypes.value = normalizeProducts(data.productTypes);
    }
    calculatedSignature.value = currentSignature();
    if (!options.silent) {
      message.success(`已实时计算 ${rows.value.length} 条常规规格`);
    }
    return true;
  } catch (error) {
    requestError.value =
      error instanceof Error ? error.message : '常规规格报价计算失败';
    return false;
  } finally {
    calculating.value = false;
  }
}

function resetCreateSpecificationForm() {
  Object.assign(createSpecificationForm, {
    lengthMm: undefined,
    thicknessMm: undefined,
    widthMm: undefined,
  });
  createSpecificationFormRef.value?.clearValidate();
}

function openCreateSpecification() {
  // Modal 的 v-if 只是展示控制，这里仍做二次校验，避免从控制台直接触发处理函数。
  if (!canCreateSpecification.value) {
    message.warning('只有超级管理员可以新增常规规格');
    return;
  }
  resetCreateSpecificationForm();
  createSpecificationOpen.value = true;
}

async function handleCreateSpecification() {
  // 保存前再次读取最新角色和服务端能力，防止弹窗打开后权限发生变化。
  if (!canCreateSpecification.value) {
    createSpecificationOpen.value = false;
    message.warning('当前账号没有新增常规规格权限');
    return;
  }
  if (createSpecificationSaving.value) return;

  try {
    await createSpecificationFormRef.value?.validate();
  } catch {
    return;
  }

  const enteredLengthMm = Number(createSpecificationForm.lengthMm);
  const enteredWidthMm = Number(createSpecificationForm.widthMm);
  // 与服务端目录规则一致：较长边归一为长度，避免交换长宽后无法定位新规格。
  const lengthMm = Math.max(enteredLengthMm, enteredWidthMm);
  const widthMm = Math.min(enteredLengthMm, enteredWidthMm);
  const thicknessMm = Number(createSpecificationForm.thicknessMm);
  const currentParameters = { ...formState };
  createSpecificationSaving.value = true;
  try {
    await createStandardQuotationSpecification({
      lengthMm,
      thicknessMm,
      widthMm,
    });
    createSpecificationOpen.value = false;

    await loadOptions();
    Object.assign(formState, currentParameters);
    const calculated = await handleCalculate({ silent: true });
    if (calculated) {
      Object.assign(filterState, {
        lengthMm: String(lengthMm),
        productCode: undefined,
        quotationStatus: 'ALL',
        thicknessMm: String(thicknessMm),
        widthMm: String(widthMm),
      });
      await nextTick();
      document
        .querySelector('.result-card')
        ?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      message.success(
        `已新增并定位规格 ${formatDimension(lengthMm)} × ${formatDimension(widthMm)} × ${formatDimension(thicknessMm)} mm`,
      );
    } else {
      message.success('规格已新增，请重新计算报价后查看');
    }
  } catch (error) {
    message.error(error instanceof Error ? error.message : '新增常规规格失败');
  } finally {
    createSpecificationSaving.value = false;
  }
}

function resetParameters() {
  Object.assign(formState, {
    includeCarton: false,
    includeOpp: false,
    includeStrap: false,
    includeSupplement: true,
    quantity: 1,
  });
  applyDefaults(options.value?.defaults);
}

function resetFilters() {
  Object.assign(filterState, {
    lengthMm: undefined,
    productCode: undefined,
    quotationStatus: 'ALL',
    thicknessMm: undefined,
    widthMm: undefined,
  });
}

function showDetail(rawRecord: unknown, productCode: string) {
  if (!canViewQuoteDetail.value) return;

  const record = rawRecord as DisplayRow;
  const product = productTypes.value.find(
    (item) => item.productCode === productCode,
  );
  const entry = getEntry(record, productCode);
  selectedDetail.value = {
    ...record,
    composite: product?.composite ?? false,
    entry,
    productCode,
    productLabel: product?.productLabel ?? productCode,
    status: normalizeStatus(entry?.status ?? 'NOT_CONFIGURED'),
  };
  detailOpen.value = true;
}

onMounted(async () => {
  const loaded = await loadOptions();
  if (loaded && canCalculate) {
    await handleCalculate({ silent: true });
  }
});
</script>

<template>
  <Page
    description="按常用长、宽、厚规格集中查看 8 类产品的实时计算价格。"
    title="常规规格报价表"
  >
    <div class="standard-quotation-page">
      <Alert
        class="mb-4"
        show-icon
        type="info"
        message="实时计算口径"
        description="价格均由现有报价引擎按当前配方、原料、工费、模具和规格对应的报价规则实时计算；价格口径由系统按规格自动匹配。"
      />

      <Alert
        v-if="optionsError"
        class="mb-4"
        show-icon
        type="error"
        message="报价基础信息加载失败"
        :description="optionsError"
      >
        <template #action>
          <Button size="small" @click="loadOptions">重试</Button>
        </template>
      </Alert>

      <Card :bordered="false" class="parameter-card">
        <template #title>
          <div class="card-title">
            <IconifyIcon icon="lucide:settings-2" />
            <span>报价参数</span>
          </div>
        </template>
        <template #extra>
          <div class="parameter-actions">
            <Button
              v-if="canCreateSpecification"
              :disabled="optionsLoading || calculating"
              @click="openCreateSpecification"
            >
              <template #icon>
                <IconifyIcon icon="lucide:plus" />
              </template>
              新增常规规格
            </Button>
            <Button :disabled="calculating" @click="resetParameters">
              恢复默认
            </Button>
            <Button
              v-access:code="['fdmcaiwu:standard-quotation:calculate']"
              :disabled="optionsLoading"
              :loading="calculating"
              type="primary"
              @click="handleCalculate()"
            >
              <template #icon>
                <IconifyIcon icon="lucide:calculator" />
              </template>
              一键重新计算
            </Button>
          </div>
        </template>

        <Spin :spinning="optionsLoading">
          <div class="parameter-grid">
            <div class="field">
              <label>数量</label>
              <InputNumber
                v-model:value="formState.quantity"
                class="w-full"
                :min="1"
                :precision="0"
              />
            </div>
            <div class="switch-field">
              <Switch v-model:checked="formState.includeSupplement" />
              <div>
                <div class="switch-title">计入半层余厚补片</div>
                <div class="switch-description">默认按余厚规则计入补片</div>
              </div>
            </div>
            <div class="switch-field">
              <Switch v-model:checked="formState.includeOpp" />
              <div>
                <div class="switch-title">计入OPP膜</div>
                <div class="switch-description">按当前规格读取OPP膜价格</div>
              </div>
            </div>
            <div class="switch-field">
              <Switch v-model:checked="formState.includeCarton" />
              <div>
                <div class="switch-title">计入外箱</div>
                <div class="switch-description">按当前规格读取外箱价格</div>
              </div>
            </div>
            <div class="switch-field">
              <Switch v-model:checked="formState.includeStrap" />
              <div>
                <div class="switch-title">计入绑带</div>
                <div class="switch-description">报价成本包含绑带费用</div>
              </div>
            </div>
          </div>
        </Spin>
      </Card>

      <Alert
        v-if="resultIsStale"
        class="mt-4"
        show-icon
        type="warning"
        message="报价参数已修改"
        description="当前表格仍是上一次计算结果，请点击“一键重新计算”刷新价格。"
      />

      <Alert
        v-if="requestError"
        class="mt-4"
        show-icon
        type="error"
        message="常规规格报价未完成"
        :description="requestError"
      >
        <template #action>
          <Button v-if="canCalculate" size="small" @click="handleCalculate()">
            重试
          </Button>
        </template>
      </Alert>

      <Card :bordered="false" class="result-card">
        <template #title>
          <div class="card-title">
            <IconifyIcon icon="lucide:table-properties" />
            <span>规格与报价</span>
          </div>
        </template>
        <template #extra>
          <span v-if="result?.calculatedAt" class="calculated-at">
            计算时间：{{ formatDateTime(result.calculatedAt) }}
          </span>
        </template>

        <Spin :spinning="calculating" tip="正在调用报价引擎计算规格矩阵…">
          <template v-if="result">
            <div class="summary-grid">
              <Statistic
                title="常规规格"
                :value="calculatedSummary.specCount"
                suffix="条"
              />
              <Statistic
                title="报价单元"
                :value="calculatedSummary.cellCount"
                suffix="个"
              />
              <Statistic
                class="success-statistic"
                title="已计算"
                :value="calculatedSummary.calculatedCount"
                suffix="个"
              />
              <Statistic
                title="未配置"
                :value="calculatedSummary.notConfiguredCount"
                suffix="个"
              />
              <Statistic
                class="error-statistic"
                title="不可报价"
                :value="calculatedSummary.blockedCount"
                suffix="个"
              />
            </div>

            <div class="table-toolbar">
              <div class="filter-grid">
                <Select
                  v-model:value="filterState.lengthMm"
                  allow-clear
                  :options="lengthOptions"
                  placeholder="筛选长度"
                />
                <Select
                  v-model:value="filterState.widthMm"
                  allow-clear
                  :options="widthOptions"
                  placeholder="筛选宽度"
                />
                <Select
                  v-model:value="filterState.thicknessMm"
                  allow-clear
                  :options="thicknessOptions"
                  placeholder="筛选厚度"
                />
                <Select
                  v-model:value="filterState.productCode"
                  allow-clear
                  :options="productFilterOptions"
                  placeholder="状态对应产品（任一产品）"
                />
                <Select
                  v-model:value="filterState.quotationStatus"
                  :options="STATUS_FILTER_OPTIONS"
                />
                <Button @click="resetFilters">清空筛选</Button>
              </div>
              <div class="table-context">
                <strong>{{ productTypes.length }} 类产品同表展示</strong>
                <span> · 克重 / 常规价</span>
                <span v-if="canViewUltraLowPrice"> / 超低价对比</span>
                <span> · 当前 {{ filteredRows.length }} 条规格</span>
              </div>
            </div>

            <Table
              bordered
              class="matrix-table"
              :columns="tableColumns"
              :data-source="filteredRows"
              :pagination="{
                defaultPageSize: 50,
                pageSizeOptions: ['30', '50'],
                showSizeChanger: true,
                showTotal: (total: number) => `共 ${total} 条`,
              }"
              row-key="key"
              :scroll="{ x: tableScrollX, y: 620 }"
              size="small"
            >
              <template #bodyCell="{ column, record }">
                <span
                  v-if="isWeightColumn(column.key)"
                  class="matrix-weight-text"
                >
                  {{ getColumnWeight(record, column.key) }}
                </span>
                <template v-else-if="isPriceColumn(column.key)">
                  <template
                    v-if="
                      getCellStatus(
                        record,
                        productCodeFromColumn(column.key),
                      ) === 'CALCULATED'
                    "
                  >
                    <Tooltip
                      v-if="canViewQuoteDetail && !isUltraLowColumn(column.key)"
                      title="点击查看报价明细"
                    >
                      <Button
                        class="matrix-price-button"
                        size="small"
                        type="link"
                        @click="
                          showDetail(record, productCodeFromColumn(column.key))
                        "
                      >
                        {{
                          formatPriceCell(getColumnPrice(record, column.key))
                        }}
                      </Button>
                    </Tooltip>
                    <span v-else class="matrix-price-text">
                      {{ formatPriceCell(getColumnPrice(record, column.key)) }}
                    </span>
                  </template>
                  <span
                    v-else-if="
                      getCellStatus(
                        record,
                        productCodeFromColumn(column.key),
                      ) === 'NOT_CONFIGURED'
                    "
                    class="matrix-state matrix-state-unconfigured"
                  >
                    未配置
                  </span>
                  <Tooltip
                    v-else
                    :title="
                      getCellMessage(record, productCodeFromColumn(column.key))
                    "
                  >
                    <span class="matrix-state matrix-state-blocked">
                      不可报价
                    </span>
                  </Tooltip>
                </template>
              </template>
              <template #emptyText>
                <Empty description="没有符合当前筛选条件的规格" />
              </template>
            </Table>
          </template>

          <Empty
            v-else-if="!requestError"
            class="result-empty"
            :description="
              canCalculate
                ? '规格价格将在首次进入页面时自动计算'
                : '当前账号没有报价计算权限'
            "
          >
            <Button
              v-if="canCalculate"
              type="primary"
              @click="handleCalculate()"
            >
              开始计算
            </Button>
          </Empty>
        </Spin>
      </Card>
    </div>

    <Modal
      v-if="canCreateSpecification"
      v-model:open="createSpecificationOpen"
      :confirm-loading="createSpecificationSaving"
      :mask-closable="!createSpecificationSaving"
      ok-text="保存并计算"
      title="新增常规规格"
      width="560px"
      @ok="handleCreateSpecification"
    >
      <Alert
        class="mb-4"
        show-icon
        type="info"
        message="规格保存后将由现有报价引擎计算"
        description="请分别填写长度、宽度和厚度，系统会将较长边统一作为长度。新增后 TPE常规、轻羽、高弹由引擎计算；5种复合品缺少基材厚度、表面或胶水成本时显示未配置。仅在开启OPP膜、外箱或绑带且缺少对应价格时，才需到辅料价格表补齐。"
      />
      <Form
        ref="createSpecificationFormRef"
        layout="vertical"
        :model="createSpecificationForm"
        :rules="createSpecificationRules"
      >
        <div class="create-specification-grid">
          <FormItem label="长度（mm）" name="lengthMm">
            <InputNumber
              v-model:value="createSpecificationForm.lengthMm"
              class="w-full"
              :min="0.001"
              :precision="3"
              placeholder="例如 1850"
            />
          </FormItem>
          <FormItem label="宽度（mm）" name="widthMm">
            <InputNumber
              v-model:value="createSpecificationForm.widthMm"
              class="w-full"
              :min="0.001"
              :precision="3"
              placeholder="例如 610"
            />
          </FormItem>
          <FormItem label="厚度（mm）" name="thicknessMm">
            <InputNumber
              v-model:value="createSpecificationForm.thicknessMm"
              class="w-full"
              :min="0.001"
              :precision="3"
              placeholder="例如 6"
            />
          </FormItem>
        </div>
      </Form>
    </Modal>

    <Drawer
      v-if="canViewQuoteDetail"
      v-model:open="detailOpen"
      destroy-on-close
      title="规格报价明细"
      :width="720"
    >
      <template v-if="selectedDetail">
        <div class="detail-heading">
          <div>
            <div class="detail-product">{{ selectedDetail.productLabel }}</div>
            <div class="detail-specification">
              {{ formatDimension(selectedDetail.lengthMm) }} ×
              {{ formatDimension(selectedDetail.widthMm) }} ×
              {{ formatDimension(selectedDetail.thicknessMm) }} mm
            </div>
          </div>
          <Tag :color="statusColor(selectedDetail.status)">
            {{ statusLabel(selectedDetail.status) }}
          </Tag>
        </div>

        <Descriptions bordered :column="2" size="small">
          <Descriptions.Item label="基材厚度">
            {{ formatDimension(selectedDetail.entry?.substrateThicknessMm) }} mm
          </Descriptions.Item>
          <Descriptions.Item label="配方编码">
            {{ selectedDetail.entry?.recipeCode || '—' }}
          </Descriptions.Item>
          <Descriptions.Item label="配方名称">
            {{ selectedDetail.entry?.recipeName || '—' }}
          </Descriptions.Item>
          <Descriptions.Item label="选用模具">
            {{ selectedDetail.entry?.selectedMouldCode || '—' }}
          </Descriptions.Item>
          <Descriptions.Item label="模具名称">
            {{ selectedDetail.entry?.selectedMouldName || '—' }}
          </Descriptions.Item>
        </Descriptions>

        <Divider orientation="left">成本与报价</Divider>
        <Descriptions bordered :column="2" size="small">
          <Descriptions.Item label="引擎基础成本">
            {{ formatExactMoney(selectedDetail.entry?.baseUnitCostExact) }}
          </Descriptions.Item>
          <Descriptions.Item label="展示基础成本">
            {{
              formatMoney(
                selectedDetail.entry?.baseUnitCostDisplay ??
                  selectedDetail.entry?.baseUnitCostExact,
              )
            }}
          </Descriptions.Item>
          <Descriptions.Item label="复合面层成本">
            {{ formatExactMoney(selectedDetail.entry?.surfaceCostPerPiece) }}
          </Descriptions.Item>
          <Descriptions.Item label="胶水成本">
            {{ formatExactMoney(selectedDetail.entry?.adhesiveCostPerPiece) }}
          </Descriptions.Item>
          <Descriptions.Item label="OPP膜">
            {{ formatExactMoney(selectedDetail.entry?.oppCostPerPiece) }}
          </Descriptions.Item>
          <Descriptions.Item label="外箱">
            {{ formatExactMoney(selectedDetail.entry?.cartonCostPerPiece) }}
          </Descriptions.Item>
          <Descriptions.Item label="绑带">
            {{ formatExactMoney(selectedDetail.entry?.strapCostPerPiece) }}
          </Descriptions.Item>
          <Descriptions.Item label="辅料小计">
            {{ formatExactMoney(selectedDetail.entry?.auxiliaryCost) }}
          </Descriptions.Item>
          <Descriptions.Item label="复合附加成本">
            {{
              formatExactMoney(
                getAdditionalCost(selectedDetail.entry, selectedDetail),
              )
            }}
          </Descriptions.Item>
          <Descriptions.Item label="总成本">
            {{ formatExactMoney(selectedDetail.entry?.unitCostExact) }}
          </Descriptions.Item>
          <Descriptions.Item label="最终实时报价" :span="2">
            <span class="detail-quote">
              {{
                formatMoney(
                  selectedDetail.entry?.unitQuoteDisplay ??
                    selectedDetail.entry?.unitQuoteExact,
                )
              }}
            </span>
            <span
              v-if="hasValue(selectedDetail.entry?.unitQuoteExact)"
              class="exact-value"
            >
              精确值
              {{ formatExactMoney(selectedDetail.entry?.unitQuoteExact) }}
            </span>
          </Descriptions.Item>
        </Descriptions>

        <Alert
          v-if="selectedDetail.entry?.blockReasons?.length"
          class="mt-4"
          show-icon
          type="error"
          message="阻断原因"
          :description="selectedDetail.entry.blockReasons.join('；')"
        />
        <Alert
          v-if="selectedDetail.entry?.warnings?.length"
          class="mt-4"
          show-icon
          type="warning"
          message="计算提醒"
          :description="selectedDetail.entry.warnings.join('；')"
        />
        <Alert
          v-if="selectedDetail.status === 'NOT_CONFIGURED'"
          class="mt-4"
          show-icon
          type="info"
          message="该组合暂未配置"
          description="Excel 核算资料没有该规格对应的复合层参数，因此不生成价格；基础三类仍由报价引擎正常计算。"
        />

        <Divider orientation="left">数据来源</Divider>
        <Descriptions bordered :column="1" size="small">
          <Descriptions.Item label="辅料价格表">
            {{ selectedDetail.entry?.accessoryPriceId || '—' }}
          </Descriptions.Item>
          <Descriptions.Item label="辅料价格版本">
            {{ selectedDetail.entry?.accessoryPriceSourceVersion || '—' }}
          </Descriptions.Item>
          <Descriptions.Item label="辅料价格来源">
            {{ selectedDetail.entry?.accessoryPriceSourceLocation || '—' }}
          </Descriptions.Item>
          <Descriptions.Item label="Excel 资料版本">
            {{
              selectedDetail.entry?.catalogSourceVersion ||
              sourceInfo?.sourceVersion ||
              '—'
            }}
          </Descriptions.Item>
          <Descriptions.Item label="资料位置">
            {{
              selectedDetail.entry?.catalogSourceLocation ||
              sourceInfo?.sourceLocation ||
              '—'
            }}
          </Descriptions.Item>
          <Descriptions.Item label="计算模型">
            {{
              selectedDetail.entry?.calculationProfile ||
              sourceInfo?.calculationProfile ||
              '现有报价引擎'
            }}
          </Descriptions.Item>
          <Descriptions.Item label="配方成本版本">
            {{ selectedDetail.entry?.recipeSourceVersion || '—' }}
          </Descriptions.Item>
          <Descriptions.Item label="模具资料版本">
            {{ selectedDetail.entry?.mouldSourceVersion || '—' }}
          </Descriptions.Item>
          <Descriptions.Item label="工费规则版本">
            {{ selectedDetail.entry?.processCostRuleVersion || '—' }}
          </Descriptions.Item>
          <Descriptions.Item label="计算时间">
            {{ formatDateTime(result?.calculatedAt) }}
          </Descriptions.Item>
        </Descriptions>
      </template>
    </Drawer>
  </Page>
</template>

<style scoped>
.standard-quotation-page {
  width: 100%;
  max-width: 1880px;
  margin: 0 auto;
}

.card-title,
.parameter-actions,
.switch-field,
.detail-heading {
  display: flex;
  gap: 10px;
  align-items: center;
}

.parameter-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(150px, 1fr)) repeat(
      2,
      minmax(180px, 1fr)
    );
  gap: 16px;
  align-items: end;
}

.field label {
  display: block;
  margin-bottom: 6px;
  font-size: 13px;
  color: var(--ant-color-text-secondary, #595959);
}

.switch-field {
  min-height: 54px;
  padding: 8px 12px;
  background: var(--ant-color-fill-quaternary, #fafafa);
  border: 1px solid var(--ant-color-border-secondary, #f0f0f0);
  border-radius: 8px;
}

.switch-title {
  font-size: 13px;
  font-weight: 600;
}

.switch-description,
.calculated-at,
.exact-value {
  font-size: 12px;
  color: var(--ant-color-text-secondary, #8c8c8c);
}

.result-card {
  margin-top: 16px;
}

.summary-grid {
  display: grid;
  grid-template-columns: repeat(5, minmax(0, 1fr));
  gap: 12px;
  margin-bottom: 12px;
}

.create-specification-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 12px;
}

.summary-grid :deep(.ant-statistic) {
  padding: 14px 16px;
  background: var(--ant-color-fill-quaternary, #fafafa);
  border: 1px solid var(--ant-color-border-secondary, #f0f0f0);
  border-radius: 8px;
}

.success-statistic :deep(.ant-statistic-content) {
  color: var(--ant-color-success, #52c41a);
}

.error-statistic :deep(.ant-statistic-content) {
  color: var(--ant-color-error, #ff4d4f);
}

.table-toolbar {
  display: flex;
  gap: 16px;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 12px;
}

.filter-grid {
  display: grid;
  grid-template-columns: repeat(5, minmax(130px, 170px)) auto;
  gap: 8px;
}

.table-context {
  white-space: nowrap;
  color: var(--ant-color-text-secondary, #595959);
}

.detail-quote {
  font-weight: 700;
  color: var(--ant-color-primary, #1677ff);
}

.detail-quote {
  margin-right: 12px;
  font-size: 20px;
}

.matrix-table :deep(.ant-table-thead > tr > th.matrix-header) {
  font-weight: 600;
  color: var(--ant-color-text, #1f1f1f);
  text-align: center;
}

.matrix-table :deep(.ant-table-thead > tr > th.matrix-header-spec) {
  background: #dbeeff;
  background: color-mix(
    in srgb,
    var(--ant-color-primary, #1677ff) 17%,
    var(--ant-color-bg-container, #fff)
  );
}

.matrix-table :deep(.ant-table-thead > tr > th.matrix-header-a) {
  background: #eaf5ff;
  background: color-mix(
    in srgb,
    var(--ant-color-primary, #1677ff) 10%,
    var(--ant-color-bg-container, #fff)
  );
}

.matrix-table :deep(.ant-table-thead > tr > th.matrix-header-b) {
  background: #deefff;
  background: color-mix(
    in srgb,
    var(--ant-color-primary, #1677ff) 15%,
    var(--ant-color-bg-container, #fff)
  );
}

.matrix-table :deep(.matrix-spec-cell),
.matrix-table :deep(.matrix-weight-cell),
.matrix-table :deep(.matrix-price-cell) {
  font-variant-numeric: tabular-nums;
  text-align: center;
}

.matrix-weight-text {
  font-size: 13px;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
  color: var(--ant-color-text-secondary, #595959);
}

.matrix-table :deep(.ant-table-tbody > tr > td.ant-table-cell-fix-left) {
  background: var(--ant-color-bg-container, #fff);
}

.matrix-table :deep(.matrix-spec-end-cell),
.matrix-table :deep(.matrix-product-end-cell) {
  border-right: 2px solid
    color-mix(
      in srgb,
      var(--ant-color-primary, #1677ff) 24%,
      var(--ant-color-border-secondary, #f0f0f0)
    ) !important;
}

.matrix-price-button {
  height: 24px;
  padding: 0 4px;
  font-size: 14px;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
}

.matrix-price-text {
  font-size: 14px;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
}

.matrix-state {
  font-size: 12px;
  white-space: nowrap;
}

.matrix-state-unconfigured {
  color: var(--ant-color-text-secondary, #8c8c8c);
}

.matrix-state-blocked {
  color: var(--ant-color-error, #ff4d4f);
  cursor: help;
}

.result-empty {
  display: flex;
  flex-direction: column;
  justify-content: center;
  min-height: 380px;
}

.detail-heading {
  justify-content: space-between;
  padding: 14px 16px;
  margin-bottom: 18px;
  background: var(--ant-color-fill-quaternary, #fafafa);
  border: 1px solid var(--ant-color-border-secondary, #f0f0f0);
  border-radius: 8px;
}

.detail-product {
  margin-bottom: 4px;
  font-size: 16px;
  font-weight: 600;
}

.detail-specification {
  color: var(--ant-color-text-secondary, #595959);
}

@media (max-width: 1280px) {
  .parameter-grid {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }

  .table-toolbar {
    align-items: flex-start;
    flex-direction: column;
  }
}

@media (max-width: 820px) {
  .parameter-grid,
  .summary-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .filter-grid {
    width: 100%;
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .parameter-card :deep(.ant-card-head-wrapper) {
    align-items: flex-start;
    flex-direction: column;
    gap: 12px;
    padding: 12px 0;
  }
}

@media (max-width: 560px) {
  .parameter-grid,
  .summary-grid,
  .filter-grid,
  .create-specification-grid {
    grid-template-columns: 1fr;
  }

  .parameter-actions {
    width: 100%;
    align-items: stretch;
    flex-direction: column;
  }
}
</style>
