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
  calculateSmallMat,
  calculateStandardQuotation,
  createStandardQuotationSpecification,
  getSmallMatPolicy,
  getStandardQuotationOptions,
  saveSmallMatPolicy,
} from '#/api/fdmcaiwu/standard-quotation';

import AccessoryMatchList from '../quotation/components/accessory-match-list.vue';
import {
  formatQuotationTaxRate,
  resolveTaxIncludedValue,
} from '../quotation/data';

defineOptions({ name: 'FdmcaiwuStandardQuotation' });

type ProductTypeOption = FdmcaiwuStandardQuotationApi.ProductTypeOption;
type QuotationEntry = FdmcaiwuStandardQuotationApi.QuotationEntry;
type SmallMatCalculateResp = FdmcaiwuStandardQuotationApi.SmallMatCalculateResp;
type SmallMatCutPlan = FdmcaiwuStandardQuotationApi.SmallMatCutPlan;
type SmallMatPolicyResp = FdmcaiwuStandardQuotationApi.SmallMatPolicyResp;
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

interface SmallMatFormModel {
  includeCarton: boolean;
  includeOpp: boolean;
  includeStrap: boolean;
  includeSupplement: boolean;
  lengthMm?: number;
  productCode?: string;
  quantity: number;
  thicknessMm?: number;
  widthMm?: number;
}

interface SmallMatPolicyFormModel {
  allowRotate: boolean;
  cuttingCostPerPiece: number;
  edgeTrimMm: number;
  enabled: boolean;
  kerfMm: number;
  maxAreaSquareMeters: number;
  orderSetupCost: number;
  pricingEnabled: boolean;
  repackingCostPerPiece: number;
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

type ProductGroup = 'BASE_TPE' | 'EXTERNAL_LAMINATION' | 'RUBBER_COMPOSITE';

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
    productCode: 'TPE_PU_HIGH_SOLID',
    productLabel: 'TPE+PU高固',
  },
  {
    composite: true,
    productCode: 'TPE_PU_CONTRAST',
    productLabel: 'TPE+PU撞色',
  },
  {
    composite: true,
    productCode: 'TPE_PU_HIGH_SOLID_CONTRAST',
    productLabel: 'TPE+PU高固撞色',
  },
  {
    composite: true,
    productCode: 'TPE_SILICONE_ANTISLIP',
    productLabel: 'TPE+硅胶止滑皮',
  },
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

const PRODUCT_GROUP_OPTIONS: Array<{
  label: string;
  value: ProductGroup;
}> = [
  { label: '基础 TPE', value: 'BASE_TPE' },
  { label: '橡胶复合', value: 'RUBBER_COMPOSITE' },
  { label: '外采面材', value: 'EXTERNAL_LAMINATION' },
];

const RUBBER_PRODUCT_CODES = new Set([
  'ELASTIC_TPE_RUBBER',
  'REGULAR_TPE_RUBBER',
]);

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
const activeProductGroup = ref<ProductGroup>('BASE_TPE');
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
const smallMatOpen = ref(false);
const smallMatCalculating = ref(false);
const smallMatError = ref('');
const smallMatFormRef = ref<FormInstance>();
const smallMatResult = ref<SmallMatCalculateResp>();
const smallMatDetailOpen = ref(false);
const smallMatForm = reactive<SmallMatFormModel>({
  includeCarton: false,
  includeOpp: false,
  includeStrap: false,
  includeSupplement: true,
  lengthMm: undefined,
  productCode: 'TPE_REGULAR',
  quantity: 1,
  thicknessMm: undefined,
  widthMm: undefined,
});
const smallMatPolicyOpen = ref(false);
const smallMatPolicyLoading = ref(false);
const smallMatPolicySaving = ref(false);
const smallMatPolicyError = ref('');
const smallMatPolicy = ref<SmallMatPolicyResp>();
const smallMatPolicyFormRef = ref<FormInstance>();
const smallMatPolicyForm = reactive<SmallMatPolicyFormModel>({
  allowRotate: false,
  cuttingCostPerPiece: 0,
  edgeTrimMm: 0,
  enabled: false,
  kerfMm: 0,
  maxAreaSquareMeters: 0.5,
  orderSetupCost: 0,
  pricingEnabled: true,
  repackingCostPerPiece: 0,
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

/** 小垫政策入口要求登录角色和服务端下发能力均确认；服务端仍会二次校验。 */
const canManageSmallMatPolicy = computed(
  () =>
    isSuperAdmin.value &&
    (options.value?.capabilities?.canManageSmallMatPolicy ?? false),
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

const positiveIntegerRule: Rule = {
  required: true,
  trigger: ['blur', 'change'],
  type: 'number',
  validator: async (_rule, value) => {
    if (value === undefined || value === null) {
      throw new Error('请输入数量');
    }
    if (!Number.isInteger(value) || value <= 0) {
      throw new Error('数量必须为大于 0 的整数');
    }
  },
};

const nonNegativeNumberRule: Rule = {
  required: true,
  trigger: ['blur', 'change'],
  type: 'number',
  validator: async (_rule, value) => {
    if (value === undefined || value === null) {
      throw new Error('请输入参数');
    }
    if (!Number.isFinite(value) || value < 0) {
      throw new Error('参数不能小于 0');
    }
  },
};

const smallMatRules: Partial<Record<keyof SmallMatFormModel, Rule[]>> = {
  lengthMm: [positiveDimensionRule],
  productCode: [
    {
      required: true,
      message: '请选择产品类型',
      trigger: ['blur', 'change'],
    },
  ],
  quantity: [positiveIntegerRule],
  thicknessMm: [positiveDimensionRule],
  widthMm: [positiveDimensionRule],
};

const smallMatPolicyRules: Record<
  keyof Omit<
    SmallMatPolicyFormModel,
    'allowRotate' | 'enabled' | 'pricingEnabled'
  >,
  Rule[]
> = {
  cuttingCostPerPiece: [nonNegativeNumberRule],
  edgeTrimMm: [nonNegativeNumberRule],
  kerfMm: [nonNegativeNumberRule],
  maxAreaSquareMeters: [positiveDimensionRule],
  orderSetupCost: [nonNegativeNumberRule],
  repackingCostPerPiece: [nonNegativeNumberRule],
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

/** 小垫成本明细仅在服务端实际返回 detail 时允许真实超级管理员打开。 */
const canViewSmallMatQuoteDetail = computed(
  () =>
    isSuperAdmin.value &&
    smallMatResult.value?.capabilities?.canViewQuoteDetail === true &&
    Boolean(smallMatResult.value?.detail),
);

/** 母垫推荐和排版不含成本，服务端返回后所有报价用户均可查看。 */
const canViewSmallMatPlan = computed(() => Boolean(smallMatResult.value?.plan));

const canViewSmallMatUltraLowPrice = computed(
  () =>
    smallMatResult.value?.capabilities?.canViewUltraLowPrice ??
    canViewUltraLowPrice.value,
);

function getProductGroup(product: NormalizedProductType): ProductGroup {
  if (!product.composite) return 'BASE_TPE';
  if (RUBBER_PRODUCT_CODES.has(product.productCode)) {
    return 'RUBBER_COMPOSITE';
  }
  return 'EXTERNAL_LAMINATION';
}

const visibleProductTypes = computed(() =>
  productTypes.value.filter(
    (product) => getProductGroup(product) === activeProductGroup.value,
  ),
);

const activeProductGroupLabel = computed(
  () =>
    PRODUCT_GROUP_OPTIONS.find(
      (item) => item.value === activeProductGroup.value,
    )?.label ?? '当前产品组',
);

const externalLaminationGroupActive = computed(
  () => activeProductGroup.value === 'EXTERNAL_LAMINATION',
);

const smallMatPolicyNeedsParameterReview = computed(() =>
  [
    smallMatPolicyForm.kerfMm,
    smallMatPolicyForm.edgeTrimMm,
    smallMatPolicyForm.cuttingCostPerPiece,
    smallMatPolicyForm.repackingCostPerPiece,
    smallMatPolicyForm.orderSetupCost,
  ].every((value) => Number(value) === 0),
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
  ...visibleProductTypes.value.map((product, index) => {
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
        title: '常规报价',
        width: 152,
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
        title: '超低报价',
        width: 152,
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

function formatAreaSquareMeters(value: unknown) {
  const numberValue = toNumber(value);
  if (numberValue === undefined) return '—';
  return `${numberValue.toLocaleString('zh-CN', {
    maximumFractionDigits: 4,
    minimumFractionDigits: 0,
    useGrouping: false,
  })} ㎡`;
}

function formatUtilization(value: unknown) {
  const numberValue = toNumber(value);
  if (numberValue === undefined) return '—';
  const percent = numberValue <= 1 ? numberValue * 100 : numberValue;
  return `${percent.toLocaleString('zh-CN', {
    maximumFractionDigits: 2,
    minimumFractionDigits: 0,
  })}%`;
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

  const fallbackByCode = new Map(
    PRODUCT_TYPES.map((item) => [item.productCode, item]),
  );
  const normalized: NormalizedProductType[] = [];
  const seenCodes = new Set<string>();
  for (const source of sourceProducts) {
    const productCode = source.productCode ?? source.code;
    if (!productCode || seenCodes.has(productCode)) continue;
    const fallback = fallbackByCode.get(productCode);
    normalized.push({
      ...fallback,
      ...source,
      composite: source.composite ?? fallback?.composite ?? false,
      productCode,
      productLabel:
        source.productLabel ??
        source.label ??
        fallback?.productLabel ??
        productCode,
    });
    seenCodes.add(productCode);
  }
  for (const fallback of PRODUCT_TYPES) {
    if (!seenCodes.has(fallback.productCode)) normalized.push({ ...fallback });
  }
  return normalized;
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

function formatLaminationLayoutDetail(
  lamination?: null | NonNullable<QuotationEntry['lamination']>,
) {
  if (!lamination) return '—';
  const parts: string[] = [];
  if ((lamination.standardRows ?? 0) > 0) {
    parts.push(
      `标准 ${lamination.piecesPerStandardRow ?? '—'} 片/排 × ${lamination.standardRows} 排`,
    );
  }
  if ((lamination.rotatedRows ?? 0) > 0) {
    parts.push(
      `旋转 ${lamination.piecesPerRotatedRow ?? '—'} 片/排 × ${lamination.rotatedRows} 排`,
    );
  }
  return parts.join(' + ') || '—';
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

function getColumnTaxIncludedPrice(rawRecord: unknown, columnKey: unknown) {
  const entry = getRecordEntry(rawRecord, productCodeFromColumn(columnKey));
  const excludingTax = getColumnPrice(rawRecord, columnKey);
  const includingTax = isUltraLowColumn(columnKey)
    ? (entry?.ultraLowQuoteTaxIncludedDisplay ??
      (canViewQuoteDetail.value
        ? entry?.ultraLowQuoteTaxIncludedExact
        : undefined))
    : (entry?.unitQuoteTaxIncludedDisplay ??
      (canViewQuoteDetail.value
        ? entry?.unitQuoteTaxIncludedExact
        : undefined));
  return resolveTaxIncludedValue(excludingTax, includingTax, entry?.taxRate);
}

function hasAccessoryFallback(rawRecord: unknown, columnKey: unknown) {
  return Boolean(
    getRecordEntry(
      rawRecord,
      productCodeFromColumn(columnKey),
    )?.accessoryMatches?.some(
      (item) => String(item.matchMode).toUpperCase() !== 'EXACT',
    ),
  );
}

function accessoryTypeLabel(value: unknown) {
  const labels: Record<string, string> = {
    CARTON: '外箱',
    OPP: 'OPP膜',
    STRAP: '绑带',
  };
  return labels[String(value ?? '').toUpperCase()] || String(value || '辅料');
}

function formatAccessoryMatchSpecification(
  length: unknown,
  width: unknown,
  thickness: unknown,
) {
  return `${formatDimension(length)} × ${formatDimension(width)} × ${formatDimension(
    thickness,
  )} mm`;
}

function getAccessoryFallbackTooltip(rawRecord: unknown, columnKey: unknown) {
  const matches =
    getRecordEntry(rawRecord, productCodeFromColumn(columnKey))
      ?.accessoryMatches ?? [];
  return matches
    .filter((item) => String(item.matchMode).toUpperCase() !== 'EXACT')
    .map(
      (item) =>
        `${item.accessoryName || accessoryTypeLabel(item.accessoryType)}：${formatAccessoryMatchSpecification(
          item.requestedLengthMm,
          item.requestedWidthMm,
          item.requestedThicknessMm,
        )} → ${formatAccessoryMatchSpecification(
          item.matchedLengthMm,
          item.matchedWidthMm,
          item.matchedThicknessMm,
        )}`,
    )
    .join('；');
}

function resolveEntryTaxIncluded(
  entry: QuotationEntry | undefined,
  excludingTax: unknown,
  includingTax?: unknown,
) {
  return resolveTaxIncludedValue(excludingTax, includingTax, entry?.taxRate);
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

/** 小垫请求只提交成品规格、数量和辅料选择；报价规则由服务端自行匹配。 */
function buildSmallMatRequest(): FdmcaiwuStandardQuotationApi.SmallMatCalculateReq {
  return {
    includeCarton: smallMatForm.includeCarton,
    includeOpp: smallMatForm.includeOpp,
    includeStrap: smallMatForm.includeStrap,
    includeSupplement: smallMatForm.includeSupplement,
    lengthMm: Number(smallMatForm.lengthMm),
    productCode: String(smallMatForm.productCode),
    quantity: Number(smallMatForm.quantity),
    thicknessMm: Number(smallMatForm.thicknessMm),
    widthMm: Number(smallMatForm.widthMm),
  };
}

function formatSmallMatSpecification(
  data: Pick<
    SmallMatCalculateResp,
    'lengthMm' | 'thicknessMm' | 'widthMm'
  > = smallMatResult.value ?? {},
) {
  return `${formatDimension(data.lengthMm)} × ${formatDimension(
    data.widthMm,
  )} × ${formatDimension(data.thicknessMm)} mm`;
}

function getSmallMatProductLabel() {
  if (smallMatResult.value?.productLabel) {
    return smallMatResult.value.productLabel;
  }
  const productCode =
    smallMatResult.value?.productCode ?? smallMatForm.productCode;
  return (
    productTypes.value.find((product) => product.productCode === productCode)
      ?.productLabel ??
    productCode ??
    '—'
  );
}

function formatMotherSpecification(plan?: SmallMatCutPlan) {
  if (!plan) return '—';
  return `${formatDimension(plan.motherLengthMm)} × ${formatDimension(
    plan.motherWidthMm,
  )} × ${formatDimension(plan.motherThicknessMm)} mm`;
}

function formatCutLayout(plan?: SmallMatCutPlan) {
  if (!plan) return '—';
  const lengthCount = toNumber(plan.layoutLengthCount);
  const widthCount = toNumber(plan.layoutWidthCount);
  if (lengthCount === undefined || widthCount === undefined) return '—';
  return `${formatDimension(lengthCount)} × ${formatDimension(widthCount)}`;
}

function smallMatStatusLabel(status: unknown) {
  const normalized = String(status ?? '').toUpperCase();
  if (['CALCULATED', 'SUCCEEDED', 'SUCCESS'].includes(normalized)) {
    return '测算完成';
  }
  if (normalized === 'NOT_SMALL_MAT') return '未命中小垫规则';
  if (normalized === 'NOT_CONFIGURED') return '暂未配置';
  if (normalized === 'BLOCKED') return '暂不可报价';
  return '待测算';
}

function smallMatStatusColor(status: unknown) {
  const normalized = String(status ?? '').toUpperCase();
  if (['CALCULATED', 'SUCCEEDED', 'SUCCESS'].includes(normalized)) {
    return 'success';
  }
  if (normalized === 'NOT_SMALL_MAT' || normalized === 'NOT_CONFIGURED') {
    return 'warning';
  }
  if (normalized === 'BLOCKED') return 'error';
  return 'default';
}

function isSmallMatResult(data = smallMatResult.value) {
  return data?.smallMat === true;
}

function isNotSmallMatResult(data = smallMatResult.value) {
  return String(data?.status ?? '').toUpperCase() === 'NOT_SMALL_MAT';
}

function isSmallMatCalculated(data = smallMatResult.value) {
  const status = String(data?.status ?? '').toUpperCase();
  return (
    isSmallMatResult(data) &&
    ['CALCULATED', 'SUCCEEDED', 'SUCCESS'].includes(status)
  );
}

function getSmallMatFeedback(
  data: SmallMatCalculateResp | undefined,
  fallback: string,
) {
  return (
    data?.blockReasons?.find(Boolean) ??
    data?.warnings?.find(Boolean) ??
    fallback
  );
}

function formatSmallMatSourceCostMode(value: unknown) {
  if (value === 'FINISHED_MOTHER_MAT_FULL_COST') {
    return '常规母垫完整内部成本';
  }
  return hasValue(value) ? String(value) : '—';
}

function applySmallMatDefaults(
  defaults?: FdmcaiwuStandardQuotationApi.Defaults,
) {
  smallMatForm.quantity = defaults?.quantity ?? 1;
  smallMatForm.includeCarton = defaults?.includeCarton ?? false;
  smallMatForm.includeOpp = defaults?.includeOpp ?? false;
  smallMatForm.includeStrap = defaults?.includeStrap ?? false;
  smallMatForm.includeSupplement = defaults?.includeSupplement ?? true;
}

function resetSmallMatForm() {
  Object.assign(smallMatForm, {
    lengthMm: undefined,
    productCode: productTypes.value[0]?.productCode ?? 'TPE_REGULAR',
    thicknessMm: undefined,
    widthMm: undefined,
  });
  applySmallMatDefaults(options.value?.defaults);
  smallMatResult.value = undefined;
  smallMatError.value = '';
  smallMatDetailOpen.value = false;
  smallMatFormRef.value?.clearValidate();
}

function openSmallMatCalculator() {
  smallMatOpen.value = true;
  if (!smallMatForm.productCode) {
    smallMatForm.productCode =
      productTypes.value[0]?.productCode ?? 'TPE_REGULAR';
  }
}

async function handleSmallMatCalculate() {
  if (!canCalculate) {
    message.warning('当前账号没有小垫报价计算权限');
    return;
  }
  if (smallMatCalculating.value) return;
  try {
    await smallMatFormRef.value?.validate();
  } catch {
    return;
  }

  smallMatCalculating.value = true;
  smallMatError.value = '';
  smallMatResult.value = undefined;
  smallMatDetailOpen.value = false;
  try {
    const data = await calculateSmallMat(buildSmallMatRequest());
    smallMatResult.value = data ?? {};
    if (isSmallMatCalculated(data) && !data?.blockReasons?.length) {
      message.success('小垫拆分测算已完成');
    } else {
      message.warning(
        getSmallMatFeedback(data, '当前规格未能生成小垫拆分报价'),
      );
    }
  } catch (error) {
    smallMatError.value =
      error instanceof Error ? error.message : '小垫拆分测算失败';
  } finally {
    smallMatCalculating.value = false;
  }
}

function applySmallMatPolicy(policy?: SmallMatPolicyResp) {
  Object.assign(smallMatPolicyForm, {
    allowRotate: policy?.allowRotate ?? false,
    cuttingCostPerPiece: toNumber(policy?.cuttingCostPerPiece) ?? 0,
    edgeTrimMm: toNumber(policy?.edgeTrimMm) ?? 0,
    enabled: policy?.enabled ?? false,
    kerfMm: toNumber(policy?.kerfMm) ?? 0,
    maxAreaSquareMeters: toNumber(policy?.maxAreaSquareMeters) ?? 0.5,
    orderSetupCost: toNumber(policy?.orderSetupCost) ?? 0,
    pricingEnabled: policy?.pricingEnabled ?? true,
    repackingCostPerPiece: toNumber(policy?.repackingCostPerPiece) ?? 0,
  });
}

async function openSmallMatPolicy() {
  if (!canManageSmallMatPolicy.value) {
    message.warning('只有超级管理员可以维护小垫判定设置');
    return;
  }
  smallMatPolicyOpen.value = true;
  smallMatPolicyLoading.value = true;
  smallMatPolicyError.value = '';
  try {
    const data = await getSmallMatPolicy();
    smallMatPolicy.value = data;
    applySmallMatPolicy(data);
  } catch (error) {
    smallMatPolicyError.value =
      error instanceof Error ? error.message : '小垫判定设置加载失败';
  } finally {
    smallMatPolicyLoading.value = false;
  }
}

async function handleSaveSmallMatPolicy() {
  if (!canManageSmallMatPolicy.value) {
    smallMatPolicyOpen.value = false;
    message.warning('当前账号没有小垫判定设置权限');
    return;
  }
  if (smallMatPolicySaving.value) return;
  try {
    await smallMatPolicyFormRef.value?.validate();
  } catch {
    return;
  }

  smallMatPolicySaving.value = true;
  smallMatPolicyError.value = '';
  try {
    const savedPolicy = await saveSmallMatPolicy({
      allowRotate: smallMatPolicyForm.allowRotate,
      cuttingCostPerPiece: Number(smallMatPolicyForm.cuttingCostPerPiece),
      edgeTrimMm: Number(smallMatPolicyForm.edgeTrimMm),
      enabled: smallMatPolicyForm.enabled,
      kerfMm: Number(smallMatPolicyForm.kerfMm),
      maxAreaSquareMeters: Number(smallMatPolicyForm.maxAreaSquareMeters),
      orderSetupCost: Number(smallMatPolicyForm.orderSetupCost),
      pricingEnabled: smallMatPolicyForm.pricingEnabled,
      repackingCostPerPiece: Number(smallMatPolicyForm.repackingCostPerPiece),
    });
    smallMatPolicy.value = savedPolicy ?? smallMatPolicy.value;
    applySmallMatPolicy(smallMatPolicy.value);
    smallMatPolicyOpen.value = false;
    message.success('小垫判定设置已保存');
  } catch (error) {
    smallMatPolicyError.value =
      error instanceof Error ? error.message : '小垫判定设置保存失败';
  } finally {
    smallMatPolicySaving.value = false;
  }
}

function openSmallMatQuoteDetail() {
  if (!canViewSmallMatQuoteDetail.value) return;
  smallMatDetailOpen.value = true;
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
    980,
    295 +
      visibleProductTypes.value.length *
        (canViewUltraLowPrice.value ? 96 + 304 : 96 + 152),
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
  visibleProductTypes.value.map((product) => ({
    label: product.productLabel,
    value: product.productCode,
  })),
);
const smallMatProductOptions = computed(() =>
  productTypes.value.map((product) => ({
    label: product.productLabel,
    value: product.productCode,
  })),
);

const smallMatAreaSquareMeters = computed(() => {
  const lengthMm = toNumber(smallMatForm.lengthMm);
  const widthMm = toNumber(smallMatForm.widthMm);
  if (lengthMm === undefined || widthMm === undefined) return undefined;
  return (lengthMm * widthMm) / 1_000_000;
});

const smallMatCandidatePlans = computed<SmallMatCutPlan[]>(() => {
  const candidatePlans = smallMatResult.value?.plan?.candidatePlans;
  if (candidatePlans?.length) return candidatePlans;
  return smallMatResult.value?.plan ? [smallMatResult.value.plan] : [];
});

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
      : visibleProductTypes.value.map((product) =>
          getEntry(row, product.productCode),
        );
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
    applySmallMatDefaults(data?.defaults);
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

function handleProductGroupChange() {
  filterState.productCode = undefined;
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
    description="按产品组查看 12 类常用规格的实时计算价格，避免超宽表格影响对比。"
    title="常规规格报价表"
  >
    <div class="standard-quotation-page">
      <Alert
        class="mb-4"
        show-icon
        type="info"
        message="实时计算口径"
        description="价格均由现有报价引擎按当前配方、原料、工费、模具和规格对应的报价规则实时计算；原报价为不含税口径，含税价固定增加 8%。辅料优先精确匹配，无精确记录时仅向长、宽、厚均不小于成品的启用规格匹配。"
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
              :disabled="optionsLoading || calculating || smallMatCalculating"
              @click="openSmallMatCalculator"
            >
              <template #icon>
                <IconifyIcon icon="lucide:scissors" />
              </template>
              小垫拆分测算
            </Button>
            <Button
              v-if="canManageSmallMatPolicy"
              :disabled="optionsLoading || smallMatPolicyLoading"
              @click="openSmallMatPolicy"
            >
              <template #icon>
                <IconifyIcon icon="lucide:ruler" />
              </template>
              小垫判定设置
            </Button>
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
        v-if="externalLaminationGroupActive"
        class="mt-4"
        show-icon
        type="info"
        message="外采面材价格依赖当前报价数量"
        :description="`当前按每个规格 ${formState.quantity} 片进行固定卷宽排版和余料分摊；数量变化可能使单价呈阶梯变化，请修改数量后重新计算。`"
      />

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
              <div class="product-group-switcher">
                <span class="product-group-label">产品组</span>
                <Select
                  v-model:value="activeProductGroup"
                  :options="PRODUCT_GROUP_OPTIONS"
                  @change="handleProductGroupChange"
                />
              </div>
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
                  placeholder="筛选当前组产品"
                />
                <Select
                  v-model:value="filterState.quotationStatus"
                  :options="STATUS_FILTER_OPTIONS"
                />
                <Button @click="resetFilters">清空筛选</Button>
              </div>
              <div class="table-context">
                <strong>
                  {{ activeProductGroupLabel }} ·
                  {{ visibleProductTypes.length }} 类产品
                </strong>
                <span> · 克重 / 常规报价（不含税 / 含税）</span>
                <span v-if="canViewUltraLowPrice">
                  / 超低报价（不含税 / 含税）
                </span>
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
                    <div class="matrix-price-stack">
                      <div class="matrix-price-line">
                        <span class="matrix-price-label">不含税</span>
                        <Tooltip
                          v-if="
                            canViewQuoteDetail && !isUltraLowColumn(column.key)
                          "
                          title="点击查看报价明细"
                        >
                          <Button
                            class="matrix-price-button"
                            size="small"
                            type="link"
                            @click="
                              showDetail(
                                record,
                                productCodeFromColumn(column.key),
                              )
                            "
                          >
                            {{
                              formatPriceCell(
                                getColumnPrice(record, column.key),
                              )
                            }}
                          </Button>
                        </Tooltip>
                        <span v-else class="matrix-price-text">
                          {{
                            formatPriceCell(getColumnPrice(record, column.key))
                          }}
                        </span>
                      </div>
                      <div class="matrix-price-line matrix-tax-price-line">
                        <span class="matrix-price-label">含税</span>
                        <span class="matrix-price-text">
                          {{
                            formatPriceCell(
                              getColumnTaxIncludedPrice(record, column.key),
                            )
                          }}
                        </span>
                      </div>
                      <Tooltip
                        v-if="
                          !isUltraLowColumn(column.key) &&
                          hasAccessoryFallback(record, column.key)
                        "
                        :title="getAccessoryFallbackTooltip(record, column.key)"
                      >
                        <Tag class="matrix-accessory-tag" color="warning">
                          辅料向上匹配
                        </Tag>
                      </Tooltip>
                    </div>
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
        description="请分别填写长度、宽度和厚度，系统会将较长边统一作为长度。新增后 TPE常规、轻羽、高弹由引擎计算；复合品缺少基材厚度、表面或胶水成本时显示未配置。OPP膜、外箱和绑带优先精确匹配；没有精确价格时，只使用长、宽、厚均不小于成品的最近启用规格，仍无合格记录才会阻断。"
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

    <Modal
      v-if="canManageSmallMatPolicy"
      v-model:open="smallMatPolicyOpen"
      :confirm-loading="smallMatPolicySaving || smallMatPolicyLoading"
      :mask-closable="!smallMatPolicySaving && !smallMatPolicyLoading"
      ok-text="保存设置"
      title="小垫判定设置"
      width="760px"
      @ok="handleSaveSmallMatPolicy"
    >
      <Spin :spinning="smallMatPolicyLoading">
        <Alert
          class="mb-4"
          show-icon
          type="info"
          message="分别设置小垫报价政策与拆分测算"
          description="面积阈值同时用于识别小垫；报价政策和母垫裁切测算可独立启停，具体价格规则始终由服务端执行。"
        />

        <Alert
          v-if="smallMatPolicy?.configured === false"
          class="mb-4"
          show-icon
          type="warning"
          message="尚未发布小垫判定设置"
          description="请确认以下参数后保存；保存后新发起的小垫测算将使用该设置。"
        />

        <Alert
          v-if="smallMatPolicy?.pricingEnabled === false"
          class="mb-4"
          show-icon
          type="warning"
          message="小垫报价政策当前未启用"
          description="面积阈值仍会保留；开启“启用小垫报价政策”并保存后，新的报价才会使用小垫专用价格政策。"
        />

        <Alert
          v-if="smallMatPolicy?.enabled === false"
          class="mb-4"
          show-icon
          type="warning"
          message="小垫拆分测算当前未启用"
          description="请确认裁切参数和费用后，打开“启用小垫拆分测算”并保存；该开关不影响小垫报价政策。"
        />

        <Alert
          v-if="smallMatPolicyError"
          class="mb-4"
          show-icon
          type="error"
          message="小垫判定设置未能加载或保存"
          :description="smallMatPolicyError"
        />

        <Alert
          v-if="
            smallMatPolicyForm.enabled && smallMatPolicyNeedsParameterReview
          "
          class="mb-4"
          show-icon
          type="warning"
          message="请复核裁切基础参数"
          description="当前刀缝、修边、裁切费、复包装人工费和订单开单费均为 0；如确认适用，可继续保存。"
        />

        <Form
          ref="smallMatPolicyFormRef"
          layout="vertical"
          :model="smallMatPolicyForm"
          :rules="smallMatPolicyRules"
        >
          <div class="small-mat-policy-grid">
            <FormItem label="最大成品面积（㎡）" name="maxAreaSquareMeters">
              <InputNumber
                v-model:value="smallMatPolicyForm.maxAreaSquareMeters"
                class="w-full"
                :min="0.000001"
                :precision="6"
                placeholder="例如 0.50"
              />
            </FormItem>
            <FormItem label="刀缝（mm）" name="kerfMm">
              <InputNumber
                v-model:value="smallMatPolicyForm.kerfMm"
                class="w-full"
                :min="0"
                :precision="3"
                placeholder="例如 2"
              />
            </FormItem>
            <FormItem label="四边修边（mm）" name="edgeTrimMm">
              <InputNumber
                v-model:value="smallMatPolicyForm.edgeTrimMm"
                class="w-full"
                :min="0"
                :precision="3"
                placeholder="例如 5"
              />
            </FormItem>
            <FormItem label="每片裁切费（元）" name="cuttingCostPerPiece">
              <InputNumber
                v-model:value="smallMatPolicyForm.cuttingCostPerPiece"
                class="w-full"
                :min="0"
                :precision="6"
                placeholder="可填 0"
              />
            </FormItem>
            <FormItem
              label="每片复包装人工费（元）"
              name="repackingCostPerPiece"
            >
              <InputNumber
                v-model:value="smallMatPolicyForm.repackingCostPerPiece"
                class="w-full"
                :min="0"
                :precision="6"
                placeholder="可填 0"
              />
            </FormItem>
            <FormItem label="订单开单费（元）" name="orderSetupCost">
              <InputNumber
                v-model:value="smallMatPolicyForm.orderSetupCost"
                class="w-full"
                :min="0"
                :precision="6"
                placeholder="可填 0"
              />
            </FormItem>
          </div>

          <div class="small-mat-policy-switches">
            <div class="switch-field">
              <Switch v-model:checked="smallMatPolicyForm.pricingEnabled" />
              <div>
                <div class="switch-title">启用小垫报价政策</div>
                <div class="switch-description">
                  控制面积阈值内是否使用小垫专用报价政策
                </div>
              </div>
            </div>
            <div class="switch-field">
              <Switch v-model:checked="smallMatPolicyForm.enabled" />
              <div>
                <div class="switch-title">启用小垫拆分测算</div>
                <div class="switch-description">
                  控制是否生成母垫推荐和裁切排版方案
                </div>
              </div>
            </div>
            <div class="switch-field">
              <Switch v-model:checked="smallMatPolicyForm.allowRotate" />
              <div>
                <div class="switch-title">允许旋转排版</div>
                <div class="switch-description">
                  系统可比较长宽互换后的排版结果
                </div>
              </div>
            </div>
          </div>

          <div v-if="smallMatPolicy?.version" class="policy-version">
            当前设置版本：{{ smallMatPolicy.version }}
          </div>
        </Form>
      </Spin>
    </Modal>

    <Drawer
      v-model:open="smallMatOpen"
      :mask-closable="!smallMatCalculating"
      title="小垫拆分测算"
      :width="960"
    >
      <div class="small-mat-calculator">
        <Alert
          class="mb-4"
          show-icon
          type="info"
          message="按成品规格测算小垫拆分报价"
          description="请分别填写长度、宽度和厚度（mm）。系统会按当前有效的小垫判定设置，匹配可用母垫；测算按常规母垫完整内部成本及裁切口径执行。"
        />

        <Form
          ref="smallMatFormRef"
          layout="vertical"
          :model="smallMatForm"
          :rules="smallMatRules"
        >
          <div class="small-mat-form-grid">
            <FormItem label="产品类型" name="productCode">
              <Select
                v-model:value="smallMatForm.productCode"
                :options="smallMatProductOptions"
                placeholder="请选择产品类型"
              />
            </FormItem>
            <FormItem label="长度（mm）" name="lengthMm">
              <InputNumber
                v-model:value="smallMatForm.lengthMm"
                class="w-full"
                :min="0.001"
                :precision="3"
                placeholder="例如 200"
              />
            </FormItem>
            <FormItem label="宽度（mm）" name="widthMm">
              <InputNumber
                v-model:value="smallMatForm.widthMm"
                class="w-full"
                :min="0.001"
                :precision="3"
                placeholder="例如 200"
              />
            </FormItem>
            <FormItem label="厚度（mm）" name="thicknessMm">
              <InputNumber
                v-model:value="smallMatForm.thicknessMm"
                class="w-full"
                :min="0.001"
                :precision="3"
                placeholder="例如 10"
              />
            </FormItem>
            <FormItem label="数量" name="quantity">
              <InputNumber
                v-model:value="smallMatForm.quantity"
                class="w-full"
                :min="1"
                :precision="0"
              />
            </FormItem>
          </div>

          <div class="small-mat-accessory-grid">
            <div class="switch-field">
              <Switch v-model:checked="smallMatForm.includeSupplement" />
              <div>
                <div class="switch-title">计入半层余厚补片</div>
                <div class="switch-description">默认按余厚规则计入补片</div>
              </div>
            </div>
            <div class="switch-field">
              <Switch v-model:checked="smallMatForm.includeOpp" />
              <div>
                <div class="switch-title">计入 OPP 膜</div>
                <div class="switch-description">按规格读取辅料价格</div>
              </div>
            </div>
            <div class="switch-field">
              <Switch v-model:checked="smallMatForm.includeCarton" />
              <div>
                <div class="switch-title">计入外箱</div>
                <div class="switch-description">按规格读取辅料价格</div>
              </div>
            </div>
            <div class="switch-field">
              <Switch v-model:checked="smallMatForm.includeStrap" />
              <div>
                <div class="switch-title">计入绑带</div>
                <div class="switch-description">报价成本包含绑带费用</div>
              </div>
            </div>
          </div>

          <div class="small-mat-form-footer">
            <div class="small-mat-area-preview">
              成品面积：
              <strong>{{
                formatAreaSquareMeters(smallMatAreaSquareMeters)
              }}</strong>
              <span> · 是否适用小垫拆分由系统按当前设置判定</span>
            </div>
            <div class="small-mat-form-actions">
              <Button
                :disabled="smallMatCalculating"
                @click="resetSmallMatForm"
              >
                清空
              </Button>
              <Button
                v-access:code="['fdmcaiwu:standard-quotation:calculate']"
                :loading="smallMatCalculating"
                type="primary"
                @click="handleSmallMatCalculate"
              >
                <template #icon>
                  <IconifyIcon icon="lucide:calculator" />
                </template>
                开始测算
              </Button>
            </div>
          </div>
        </Form>

        <Alert
          v-if="smallMatError"
          class="mt-4"
          show-icon
          type="error"
          message="小垫拆分测算未完成"
          :description="smallMatError"
        >
          <template #action>
            <Button size="small" @click="handleSmallMatCalculate">
              重试
            </Button>
          </template>
        </Alert>

        <Spin
          :spinning="smallMatCalculating"
          tip="正在调用报价引擎测算小垫拆分方案…"
        >
          <template v-if="smallMatResult">
            <div class="small-mat-result-heading">
              <div>
                <div class="detail-product">
                  {{ getSmallMatProductLabel() }}
                </div>
                <div class="detail-specification">
                  {{ formatSmallMatSpecification(smallMatResult) }} ·
                  {{ smallMatResult.quantity ?? smallMatForm.quantity }} 片
                </div>
              </div>
              <Tag :color="smallMatStatusColor(smallMatResult.status)">
                {{ smallMatStatusLabel(smallMatResult.status) }}
              </Tag>
            </div>

            <Alert
              v-if="isNotSmallMatResult()"
              show-icon
              type="warning"
              message="当前规格未命中小垫拆分规则"
              :description="
                getSmallMatFeedback(
                  smallMatResult,
                  '请确认成品规格，或由超级管理员检查小垫判定设置。',
                )
              "
            />

            <template v-else-if="isSmallMatCalculated()">
              <div class="small-mat-price-grid">
                <div class="small-mat-price-card small-mat-regular-price">
                  <div class="small-mat-price-label">
                    常规报价（不含税单片）
                  </div>
                  <Tooltip
                    v-if="canViewSmallMatQuoteDetail"
                    title="点击查看规格报价明细"
                  >
                    <Button
                      class="small-mat-quote-button"
                      size="large"
                      type="link"
                      @click="openSmallMatQuoteDetail"
                    >
                      {{ formatMoney(smallMatResult.unitQuoteDisplay) }}
                    </Button>
                  </Tooltip>
                  <div v-else class="small-mat-price-value">
                    {{ formatMoney(smallMatResult.unitQuoteDisplay) }}
                  </div>
                  <div
                    v-if="hasValue(smallMatResult.totalQuoteDisplay)"
                    class="small-mat-price-subtext"
                  >
                    不含税总价：{{
                      formatMoney(smallMatResult.totalQuoteDisplay)
                    }}
                  </div>
                  <div class="small-mat-tax-price">
                    含税单片（+{{
                      formatQuotationTaxRate(smallMatResult.taxRate)
                    }}）：{{
                      formatMoney(
                        resolveTaxIncludedValue(
                          smallMatResult.unitQuoteDisplay,
                          smallMatResult.unitQuoteTaxIncludedDisplay,
                          smallMatResult.taxRate,
                        ),
                      )
                    }}
                    <span v-if="hasValue(smallMatResult.totalQuoteDisplay)">
                      含税总价：{{
                        formatMoney(
                          resolveTaxIncludedValue(
                            smallMatResult.totalQuoteDisplay,
                            smallMatResult.totalQuoteTaxIncludedDisplay,
                            smallMatResult.taxRate,
                          ),
                        )
                      }}
                    </span>
                  </div>
                </div>

                <div
                  v-if="
                    canViewSmallMatUltraLowPrice &&
                    hasValue(smallMatResult.ultraLowQuoteDisplay)
                  "
                  class="small-mat-price-card small-mat-ultra-price"
                >
                  <div class="small-mat-price-label">超低价（不含税单片）</div>
                  <div class="small-mat-price-value">
                    {{ formatMoney(smallMatResult.ultraLowQuoteDisplay) }}
                  </div>
                  <div class="small-mat-tax-price">
                    含税单片（+{{
                      formatQuotationTaxRate(smallMatResult.taxRate)
                    }}）：{{
                      formatMoney(
                        resolveTaxIncludedValue(
                          smallMatResult.ultraLowQuoteDisplay,
                          smallMatResult.ultraLowQuoteTaxIncludedDisplay,
                          smallMatResult.taxRate,
                        ),
                      )
                    }}
                  </div>
                </div>
              </div>

              <AccessoryMatchList
                v-if="smallMatResult.accessoryMatches?.length"
                :matches="smallMatResult.accessoryMatches"
                class="mt-4"
                heading="本次小垫辅料匹配"
              />

              <template v-if="canViewSmallMatPlan && smallMatResult.plan">
                <Divider orientation="left">推荐母垫与排版</Divider>
                <div class="small-mat-plan-grid">
                  <div class="small-mat-plan-item">
                    <span>推荐母垫</span>
                    <strong>{{
                      formatMotherSpecification(smallMatResult.plan)
                    }}</strong>
                  </div>
                  <div class="small-mat-plan-item">
                    <span>单张排版</span>
                    <strong>{{ formatCutLayout(smallMatResult.plan) }}</strong>
                  </div>
                  <div class="small-mat-plan-item">
                    <span>每张可裁</span>
                    <strong>
                      {{ formatDimension(smallMatResult.plan.piecesPerMother) }}
                      片
                    </strong>
                  </div>
                  <div class="small-mat-plan-item">
                    <span>本单母垫张数</span>
                    <strong>
                      {{ formatDimension(smallMatResult.plan.motherCount) }} 张
                    </strong>
                  </div>
                  <div class="small-mat-plan-item">
                    <span>本单利用率</span>
                    <strong>{{
                      formatUtilization(smallMatResult.plan.orderUtilization)
                    }}</strong>
                  </div>
                  <div class="small-mat-plan-item">
                    <span>排版方向</span>
                    <strong>{{
                      smallMatResult.plan.rotated ? '已旋转排版' : '标准方向'
                    }}</strong>
                  </div>
                </div>

                <div
                  v-if="smallMatCandidatePlans.length > 1"
                  class="small-mat-candidate-list"
                >
                  <div class="small-mat-candidate-title">可用母垫候选</div>
                  <div
                    v-for="(candidate, index) in smallMatCandidatePlans"
                    :key="`${candidate.motherLengthMm}-${candidate.motherWidthMm}-${candidate.motherThicknessMm}-${index}`"
                    class="small-mat-candidate-row"
                  >
                    <div class="small-mat-candidate-name">
                      <Tag
                        v-if="candidate.recommended || index === 0"
                        color="blue"
                      >
                        推荐
                      </Tag>
                      <span>{{ formatMotherSpecification(candidate) }}</span>
                    </div>
                    <span
                      >每张
                      {{ formatDimension(candidate.piecesPerMother) }} 片</span
                    >
                    <span>{{ formatDimension(candidate.motherCount) }} 张</span>
                    <span
                      >利用率
                      {{ formatUtilization(candidate.orderUtilization) }}</span
                    >
                  </div>
                </div>
              </template>
            </template>

            <Alert
              v-else
              show-icon
              type="error"
              message="已命中小垫规则，但当前暂不可报价"
              :description="
                getSmallMatFeedback(
                  smallMatResult,
                  '请根据下方提示补齐相关资料或由超级管理员检查小垫判定设置。',
                )
              "
            />

            <Alert
              v-if="smallMatResult.blockReasons?.length"
              class="mt-4"
              show-icon
              type="error"
              message="测算未通过"
              :description="smallMatResult.blockReasons.join('；')"
            />
            <Alert
              v-if="smallMatResult.warnings?.length"
              class="mt-4"
              show-icon
              type="warning"
              message="测算提醒"
              :description="smallMatResult.warnings.join('；')"
            />
          </template>
        </Spin>
      </div>
    </Drawer>

    <Drawer
      v-if="canViewSmallMatQuoteDetail"
      v-model:open="smallMatDetailOpen"
      destroy-on-close
      title="小垫规格报价明细"
      :width="720"
    >
      <template v-if="smallMatResult?.detail">
        <div class="detail-heading">
          <div>
            <div class="detail-product">{{ getSmallMatProductLabel() }}</div>
            <div class="detail-specification">
              {{ formatSmallMatSpecification(smallMatResult) }} ·
              {{ smallMatResult.quantity ?? smallMatForm.quantity }} 片
            </div>
          </div>
          <Tag color="success">
            {{ smallMatStatusLabel(smallMatResult.status) }}
          </Tag>
        </div>

        <Descriptions bordered :column="2" size="small">
          <Descriptions.Item label="适用设置版本">
            {{ smallMatResult.detail.policyVersion || '—' }}
          </Descriptions.Item>
          <Descriptions.Item label="报价引擎">
            {{ smallMatResult.detail.sourceEngineProfile || '现有报价引擎' }}
          </Descriptions.Item>
          <Descriptions.Item label="母垫成本口径" :span="2">
            {{
              formatSmallMatSourceCostMode(smallMatResult.detail.sourceCostMode)
            }}
          </Descriptions.Item>
        </Descriptions>

        <Divider orientation="left">成本与报价</Divider>
        <Descriptions bordered :column="2" size="small">
          <Descriptions.Item label="母垫内部单位成本">
            {{ formatExactMoney(smallMatResult.detail.motherUnitCostExact) }}
          </Descriptions.Item>
          <Descriptions.Item label="母垫总成本">
            {{ formatExactMoney(smallMatResult.detail.motherTotalCostExact) }}
          </Descriptions.Item>
          <Descriptions.Item label="裁切费">
            {{ formatExactMoney(smallMatResult.detail.cuttingCostExact) }}
          </Descriptions.Item>
          <Descriptions.Item label="复包装人工费">
            {{ formatExactMoney(smallMatResult.detail.repackingCostExact) }}
          </Descriptions.Item>
          <Descriptions.Item label="订单开单费">
            {{ formatExactMoney(smallMatResult.detail.orderSetupCostExact) }}
          </Descriptions.Item>
          <Descriptions.Item label="辅料费用">
            {{ formatExactMoney(smallMatResult.detail.accessoryCostExact) }}
          </Descriptions.Item>
          <Descriptions.Item label="最终单位成本">
            {{ formatExactMoney(smallMatResult.detail.finalUnitCostExact) }}
          </Descriptions.Item>
          <Descriptions.Item label="常规单片报价（不含税）">
            {{ formatExactMoney(smallMatResult.detail.regularUnitQuoteExact) }}
          </Descriptions.Item>
          <Descriptions.Item label="常规单片报价（含税）">
            {{
              formatExactMoney(
                resolveTaxIncludedValue(
                  smallMatResult.detail.regularUnitQuoteExact,
                  smallMatResult.detail.regularUnitQuoteTaxIncludedExact,
                  smallMatResult.taxRate,
                ),
              )
            }}
          </Descriptions.Item>
          <Descriptions.Item label="常规总报价（不含税）">
            {{ formatExactMoney(smallMatResult.detail.regularTotalQuoteExact) }}
          </Descriptions.Item>
          <Descriptions.Item label="常规总报价（含税）">
            {{
              formatExactMoney(
                resolveTaxIncludedValue(
                  smallMatResult.detail.regularTotalQuoteExact,
                  smallMatResult.detail.regularTotalQuoteTaxIncludedExact,
                  smallMatResult.taxRate,
                ),
              )
            }}
          </Descriptions.Item>
          <Descriptions.Item label="超低单片报价（不含税）">
            {{ formatExactMoney(smallMatResult.detail.ultraLowUnitQuoteExact) }}
          </Descriptions.Item>
          <Descriptions.Item label="超低单片报价（含税）">
            {{
              formatExactMoney(
                resolveTaxIncludedValue(
                  smallMatResult.detail.ultraLowUnitQuoteExact,
                  smallMatResult.detail.ultraLowUnitQuoteTaxIncludedExact,
                  smallMatResult.taxRate,
                ),
              )
            }}
          </Descriptions.Item>
          <Descriptions.Item label="超低总报价（不含税）">
            {{
              formatExactMoney(smallMatResult.detail.ultraLowTotalQuoteExact)
            }}
          </Descriptions.Item>
          <Descriptions.Item label="超低总报价（含税）">
            {{
              formatExactMoney(
                resolveTaxIncludedValue(
                  smallMatResult.detail.ultraLowTotalQuoteExact,
                  smallMatResult.detail.ultraLowTotalQuoteTaxIncludedExact,
                  smallMatResult.taxRate,
                ),
              )
            }}
          </Descriptions.Item>
        </Descriptions>
      </template>
    </Drawer>

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

        <template v-if="selectedDetail.entry?.lamination">
          <Divider orientation="left">外采面材排版</Divider>
          <Descriptions bordered :column="2" size="small">
            <Descriptions.Item label="贴合材料">
              {{ selectedDetail.entry.lamination.materialCode || '—' }} ·
              {{ selectedDetail.entry.lamination.materialName || '—' }}
            </Descriptions.Item>
            <Descriptions.Item label="材料版本">
              {{ selectedDetail.entry.lamination.versionCode || '—' }}
            </Descriptions.Item>
            <Descriptions.Item label="TPE基材厚度">
              {{
                formatDimension(selectedDetail.entry.lamination.tpeThicknessMm)
              }}
              mm
            </Descriptions.Item>
            <Descriptions.Item label="订单排版">
              {{
                formatLaminationLayoutDetail(selectedDetail.entry.lamination)
              }}
            </Descriptions.Item>
            <Descriptions.Item label="计费购买长度">
              {{
                formatDimension(
                  selectedDetail.entry.lamination.billableLengthMm,
                )
              }}
              mm
            </Descriptions.Item>
            <Descriptions.Item label="面材利用率">
              {{
                formatUtilization(
                  selectedDetail.entry.lamination.layoutUtilizationRate,
                )
              }}
            </Descriptions.Item>
            <Descriptions.Item label="面材单片成本">
              {{
                formatExactMoney(
                  selectedDetail.entry.lamination.materialCostPerPiece,
                )
              }}
            </Descriptions.Item>
            <Descriptions.Item label="热熔胶单片成本">
              {{
                formatExactMoney(
                  selectedDetail.entry.lamination.adhesiveCostPerPiece,
                )
              }}
            </Descriptions.Item>
            <Descriptions.Item label="贴合加工费">
              {{
                formatExactMoney(
                  selectedDetail.entry.lamination.laminationLaborCostPerPiece,
                )
              }}
            </Descriptions.Item>
            <Descriptions.Item label="面材订单成本">
              {{
                formatExactMoney(
                  selectedDetail.entry.lamination.materialOrderCost,
                )
              }}
            </Descriptions.Item>
          </Descriptions>
        </template>

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
          <Descriptions.Item label="最终实时报价（不含税）">
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
          <Descriptions.Item
            :label="`最终实时报价（含税 +${formatQuotationTaxRate(selectedDetail.entry?.taxRate)}）`"
          >
            <span class="detail-quote tax-detail-quote">
              {{
                formatMoney(
                  resolveEntryTaxIncluded(
                    selectedDetail.entry,
                    selectedDetail.entry?.unitQuoteDisplay ??
                      selectedDetail.entry?.unitQuoteExact,
                    selectedDetail.entry?.unitQuoteTaxIncludedDisplay ??
                      selectedDetail.entry?.unitQuoteTaxIncludedExact,
                  ),
                )
              }}
            </span>
            <span
              v-if="hasValue(selectedDetail.entry?.unitQuoteExact)"
              class="exact-value"
            >
              精确值
              {{
                formatExactMoney(
                  resolveEntryTaxIncluded(
                    selectedDetail.entry,
                    selectedDetail.entry?.unitQuoteExact,
                    selectedDetail.entry?.unitQuoteTaxIncludedExact,
                  ),
                )
              }}
            </span>
          </Descriptions.Item>
        </Descriptions>

        <AccessoryMatchList
          v-if="selectedDetail.entry?.accessoryMatches?.length"
          :matches="selectedDetail.entry.accessoryMatches"
          class="mt-4"
          heading="本规格辅料匹配"
        />

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

.small-mat-policy-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 0 12px;
}

.small-mat-policy-switches {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 12px;
}

.policy-version {
  margin-top: 14px;
  font-size: 12px;
  color: var(--ant-color-text-secondary, #8c8c8c);
}

.small-mat-calculator {
  padding-bottom: 24px;
}

.small-mat-form-grid {
  display: grid;
  grid-template-columns: minmax(180px, 1.25fr) repeat(4, minmax(118px, 1fr));
  gap: 0 12px;
}

.small-mat-accessory-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 12px;
  margin-top: 4px;
}

.small-mat-form-footer,
.small-mat-form-actions,
.small-mat-result-heading,
.small-mat-candidate-row,
.small-mat-candidate-name {
  display: flex;
  gap: 10px;
  align-items: center;
}

.small-mat-form-footer {
  justify-content: space-between;
  padding-top: 16px;
  margin-top: 16px;
  border-top: 1px solid var(--ant-color-border-secondary, #f0f0f0);
}

.small-mat-area-preview {
  font-size: 13px;
  color: var(--ant-color-text-secondary, #595959);
}

.small-mat-area-preview strong {
  font-variant-numeric: tabular-nums;
  color: var(--ant-color-text, #1f1f1f);
}

.small-mat-result-heading {
  justify-content: space-between;
  padding: 14px 16px;
  margin-top: 16px;
  margin-bottom: 16px;
  background: var(--ant-color-fill-quaternary, #fafafa);
  border: 1px solid var(--ant-color-border-secondary, #f0f0f0);
  border-radius: 8px;
}

.small-mat-price-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
}

.small-mat-price-card {
  min-height: 118px;
  padding: 16px;
  border: 1px solid var(--ant-color-border-secondary, #f0f0f0);
  border-radius: 10px;
}

.small-mat-regular-price {
  background: color-mix(
    in srgb,
    var(--ant-color-primary, #1677ff) 8%,
    var(--ant-color-bg-container, #fff)
  );
  border-color: color-mix(
    in srgb,
    var(--ant-color-primary, #1677ff) 26%,
    var(--ant-color-border-secondary, #f0f0f0)
  );
}

.small-mat-ultra-price {
  background: color-mix(
    in srgb,
    var(--ant-color-warning, #faad14) 10%,
    var(--ant-color-bg-container, #fff)
  );
  border-color: color-mix(
    in srgb,
    var(--ant-color-warning, #faad14) 28%,
    var(--ant-color-border-secondary, #f0f0f0)
  );
}

.small-mat-price-label {
  margin-bottom: 4px;
  font-size: 13px;
  color: var(--ant-color-text-secondary, #595959);
}

.small-mat-price-value {
  min-height: 38px;
  font-size: 24px;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  line-height: 38px;
  color: var(--ant-color-primary, #1677ff);
}

.small-mat-ultra-price .small-mat-price-value {
  color: var(--ant-color-warning, #d48806);
}

.small-mat-quote-button {
  height: 38px;
  padding: 0;
  font-size: 24px;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  line-height: 38px;
}

.small-mat-price-subtext {
  margin-top: 7px;
  font-size: 12px;
  color: var(--ant-color-text-secondary, #8c8c8c);
}

.small-mat-tax-price {
  display: flex;
  flex-direction: column;
  gap: 3px;
  padding-top: 8px;
  margin-top: 8px;
  font-size: 12px;
  font-weight: 600;
  color: var(--ant-color-primary, #1677ff);
  border-top: 1px dashed var(--ant-color-border-secondary, #f0f0f0);
}

.small-mat-plan-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 10px;
}

.small-mat-plan-item {
  display: flex;
  flex-direction: column;
  justify-content: center;
  min-height: 70px;
  padding: 12px;
  background: var(--ant-color-fill-quaternary, #fafafa);
  border: 1px solid var(--ant-color-border-secondary, #f0f0f0);
  border-radius: 8px;
}

.small-mat-plan-item span {
  margin-bottom: 5px;
  font-size: 12px;
  color: var(--ant-color-text-secondary, #8c8c8c);
}

.small-mat-plan-item strong {
  font-size: 14px;
  font-variant-numeric: tabular-nums;
}

.small-mat-candidate-list {
  margin-top: 14px;
  overflow: hidden;
  border: 1px solid var(--ant-color-border-secondary, #f0f0f0);
  border-radius: 8px;
}

.small-mat-candidate-title {
  padding: 9px 12px;
  font-size: 13px;
  font-weight: 600;
  background: var(--ant-color-fill-quaternary, #fafafa);
  border-bottom: 1px solid var(--ant-color-border-secondary, #f0f0f0);
}

.small-mat-candidate-row {
  justify-content: space-between;
  min-height: 42px;
  padding: 8px 12px;
  font-size: 13px;
  font-variant-numeric: tabular-nums;
  border-bottom: 1px solid var(--ant-color-border-secondary, #f0f0f0);
}

.small-mat-candidate-row:last-child {
  border-bottom: 0;
}

.small-mat-candidate-name {
  min-width: 220px;
  font-weight: 600;
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

.product-group-switcher {
  display: flex;
  flex: 0 0 auto;
  gap: 8px;
  align-items: center;
}

.product-group-switcher :deep(.ant-select) {
  width: 150px;
}

.product-group-label {
  font-size: 13px;
  font-weight: 600;
  white-space: nowrap;
}

.filter-grid {
  display: grid;
  grid-template-columns: repeat(5, minmax(130px, 170px)) auto;
  gap: 8px;
}

.table-context {
  color: var(--ant-color-text-secondary, #595959);
  white-space: nowrap;
}

.detail-quote {
  margin-right: 12px;
  font-size: 20px;
  font-weight: 700;
  color: var(--ant-color-primary, #1677ff);
}

.tax-detail-quote {
  color: var(--ant-color-success, #52c41a);
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
  color: var(--ant-color-text-secondary, #595959);
  white-space: nowrap;
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

.matrix-price-stack {
  display: inline-flex;
  flex-direction: column;
  gap: 3px;
  align-items: stretch;
  min-width: 112px;
}

.matrix-price-line {
  display: flex;
  gap: 6px;
  align-items: center;
  justify-content: space-between;
  white-space: nowrap;
}

.matrix-price-label {
  font-size: 11px;
  font-weight: 400;
  color: var(--ant-color-text-secondary, #8c8c8c);
}

.matrix-tax-price-line .matrix-price-text {
  color: var(--ant-color-success, #389e0d);
}

.matrix-accessory-tag {
  align-self: center;
  margin-inline-end: 0;
  font-size: 10px;
  cursor: help;
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

  .small-mat-form-grid {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }

  .small-mat-accessory-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .table-toolbar {
    flex-direction: column;
    align-items: flex-start;
  }

  .product-group-switcher {
    width: 100%;
  }

  .product-group-switcher :deep(.ant-select) {
    flex: 1;
  }
}

@media (max-width: 820px) {
  .parameter-grid,
  .summary-grid,
  .small-mat-policy-grid,
  .small-mat-form-grid,
  .small-mat-plan-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .small-mat-policy-switches {
    grid-template-columns: 1fr;
  }

  .filter-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
    width: 100%;
  }

  .parameter-card :deep(.ant-card-head-wrapper) {
    flex-direction: column;
    gap: 12px;
    align-items: flex-start;
    padding: 12px 0;
  }
}

@media (max-width: 560px) {
  .parameter-grid,
  .summary-grid,
  .filter-grid,
  .create-specification-grid,
  .small-mat-policy-grid,
  .small-mat-form-grid,
  .small-mat-accessory-grid,
  .small-mat-price-grid,
  .small-mat-plan-grid {
    grid-template-columns: 1fr;
  }

  .parameter-actions {
    flex-direction: column;
    align-items: stretch;
    width: 100%;
  }

  .small-mat-form-footer,
  .small-mat-candidate-row {
    flex-direction: column;
    align-items: flex-start;
  }

  .small-mat-form-actions {
    width: 100%;
  }

  .small-mat-form-actions :deep(.ant-btn) {
    flex: 1;
  }

  .small-mat-candidate-name {
    min-width: 0;
  }
}
</style>
