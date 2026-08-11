<script lang="ts" setup>
import type { TableColumnsType } from 'ant-design-vue';

import type { FdmcaiwuStandardQuotationApi } from '#/api/fdmcaiwu/standard-quotation';

import { computed, onMounted, reactive, ref } from 'vue';

import { useAccess } from '@vben/access';
import { Page } from '@vben/common-ui';
import { IconifyIcon } from '@vben/icons';

import {
  Alert,
  Button,
  Card,
  Descriptions,
  Divider,
  Drawer,
  Empty,
  InputNumber,
  message,
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
  getStandardQuotationOptions,
} from '#/api/fdmcaiwu/standard-quotation';

defineOptions({ name: 'FdmcaiwuStandardQuotation' });

type ProductTypeOption = FdmcaiwuStandardQuotationApi.ProductTypeOption;
type QuotationEntry = FdmcaiwuStandardQuotationApi.QuotationEntry;
type SpecificationRow = FdmcaiwuStandardQuotationApi.SpecificationRow;

interface FormModel {
  includeStrap: boolean;
  includeSupplement: boolean;
  profitMode: string;
  profitRatePercent: number;
  quantity: number;
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

const PROFIT_MODE_OPTIONS = [
  { label: '毛利率', value: 'GROSS_MARGIN' },
  { label: '加价率', value: 'MARKUP' },
];

const STATUS_FILTER_OPTIONS = [
  { label: '全部状态', value: 'ALL' },
  { label: '仅看已报价', value: 'CALCULATED' },
  { label: '仅看未配置', value: 'NOT_CONFIGURED' },
  { label: '仅看不可报价', value: 'BLOCKED' },
];

const { hasAccessByCodes } = useAccess();
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
    return {
      children: [
        {
          align: 'center' as const,
          className: 'matrix-price-cell matrix-product-end-cell',
          customHeaderCell: () => ({
            class: `matrix-header ${toneClass} matrix-product-end-cell`,
          }),
          key: `price:${product.productCode}`,
          title: '价格(元/片)',
          width: 130,
        },
      ],
      customHeaderCell: () => ({
        class: `matrix-header matrix-product-group ${toneClass}`,
      }),
      key: `product:${product.productCode}`,
      title: product.productLabel,
    };
  }),
]);

const formState = reactive<FormModel>({
  includeStrap: false,
  includeSupplement: false,
  profitMode: 'GROSS_MARGIN',
  profitRatePercent: 20,
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
  if (['CALCULATED', 'SUCCESS', 'SUCCEEDED'].includes(status)) {
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
  return String(columnKey ?? '').startsWith('price:');
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

function buildRequest(): FdmcaiwuStandardQuotationApi.CalculateReq {
  return {
    includeStrap: formState.includeStrap,
    includeSupplement: formState.includeSupplement,
    profitMode: formState.profitMode,
    profitRate: Number((formState.profitRatePercent / 100).toFixed(6)),
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
  if (
    !Number.isFinite(formState.profitRatePercent) ||
    formState.profitRatePercent < 0
  ) {
    return '利润率必须大于或等于 0';
  }
  if (
    formState.profitMode === 'GROSS_MARGIN' &&
    formState.profitRatePercent >= 100
  ) {
    return '毛利率必须小于 100%';
  }
  return '';
}

function applyDefaults(defaults?: FdmcaiwuStandardQuotationApi.Defaults) {
  if (!defaults) return;
  formState.quantity = defaults.quantity ?? 1;
  formState.profitMode = defaults.profitMode ?? 'GROSS_MARGIN';
  const profitRate = toNumber(defaults.profitRate);
  formState.profitRatePercent =
    profitRate === undefined ? 20 : Number((profitRate * 100).toFixed(4));
  formState.includeStrap = defaults.includeStrap ?? false;
  formState.includeSupplement = defaults.includeSupplement ?? false;
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
  if (calculating.value) return;
  if (!canCalculate) {
    message.warning('当前账号没有常规规格报价计算权限');
    return;
  }
  const errorMessage = validateForm();
  if (errorMessage) {
    message.warning(errorMessage);
    return;
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
  } catch (error) {
    requestError.value =
      error instanceof Error ? error.message : '常规规格报价计算失败';
  } finally {
    calculating.value = false;
  }
}

function resetParameters() {
  Object.assign(formState, {
    includeStrap: false,
    includeSupplement: false,
    profitMode: 'GROSS_MARGIN',
    profitRatePercent: 20,
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
        description="价格均由现有报价引擎按当前配方、原料、工费、模具和下方利润参数实时计算；Excel 只提供规格与复合层附加参数，不读取其中的历史固定报价。"
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
            <div class="field">
              <label>利润模式</label>
              <Select
                v-model:value="formState.profitMode"
                class="w-full"
                :options="PROFIT_MODE_OPTIONS"
              />
            </div>
            <div class="field">
              <label>利润率</label>
              <InputNumber
                v-model:value="formState.profitRatePercent"
                addon-after="%"
                class="w-full"
                :max="formState.profitMode === 'GROSS_MARGIN' ? 99.99 : 1000"
                :min="0"
                :precision="2"
              />
            </div>
            <div class="switch-field">
              <Switch v-model:checked="formState.includeSupplement" />
              <div>
                <div class="switch-title">允许补片</div>
                <div class="switch-description">剩余厚度按引擎规则补片</div>
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
              :scroll="{ x: 1335, y: 620 }"
              size="small"
            >
              <template #bodyCell="{ column, record }">
                <template v-if="isPriceColumn(column.key)">
                  <template
                    v-if="
                      getCellStatus(
                        record,
                        productCodeFromColumn(column.key),
                      ) === 'CALCULATED'
                    "
                  >
                    <Tooltip title="点击查看报价明细">
                      <Button
                        class="matrix-price-button"
                        size="small"
                        type="link"
                        @click="
                          showDetail(record, productCodeFromColumn(column.key))
                        "
                      >
                        {{
                          formatPriceCell(
                            getRecordEntry(
                              record,
                              productCodeFromColumn(column.key),
                            )?.unitQuoteDisplay ??
                              getRecordEntry(
                                record,
                                productCodeFromColumn(column.key),
                              )?.unitQuoteExact,
                          )
                        }}
                      </Button>
                    </Tooltip>
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

    <Drawer
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
.matrix-table :deep(.matrix-price-cell) {
  font-variant-numeric: tabular-nums;
  text-align: center;
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
  .filter-grid {
    grid-template-columns: 1fr;
  }

  .parameter-actions {
    width: 100%;
    align-items: stretch;
    flex-direction: column;
  }
}
</style>
