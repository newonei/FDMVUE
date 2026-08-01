<script lang="ts" setup>
import type { FormInstance } from 'ant-design-vue';
import type { Rule } from 'ant-design-vue/es/form';

import type { FdmcaiwuQuotationApi } from '#/api/fdmcaiwu/quotation';

import { computed, nextTick, onMounted, reactive, ref, watch } from 'vue';

import { Page } from '@vben/common-ui';
import { IconifyIcon } from '@vben/icons';

import {
  Alert,
  Button,
  Card,
  Descriptions,
  DescriptionsItem,
  Empty,
  Form,
  FormItem,
  InputNumber,
  message,
  RadioGroup,
  Select,
  Spin,
  Switch,
  Table,
  Tag,
} from 'ant-design-vue';

import {
  calculateQuotation,
  getQuotationOptions,
} from '#/api/fdmcaiwu/quotation';

import {
  formatDecimal,
  formatDensityType,
  formatExactMoney,
  formatLayoutOrientation,
  formatMaterialUnitCost,
  formatMoney,
  formatProductType,
  formatProfitMode,
  formatRate,
  formatSpecification,
  hasValue,
  RESULT_COST_FIELDS,
} from './data';

defineOptions({ name: 'FdmcaiwuQuotation' });

type MouldSelectionMode = 'AUTO' | 'MANUAL';

interface QuotationFormModel {
  includeStrap: boolean;
  includeSupplement: boolean;
  mouldProfileId?: number;
  mouldSelectionMode: MouldSelectionMode;
  productLengthMm?: number;
  productThicknessMm?: number;
  productWidthMm?: number;
  profitMode?: string;
  profitRatePercent?: number;
  quantity?: number;
  recipeId?: number;
}

interface CandidateTableRow extends FdmcaiwuQuotationApi.MouldCandidate {
  boardSpecification: string;
  key: number;
  layerSummary: string;
  layoutSummary: string;
  mouldSpecification: string;
  profileLabel: string;
  rejectReasonText: string;
  utilizationText: string;
}

const FALLBACK_PROFIT_MODES = [
  { label: '毛利率', value: 'GROSS_MARGIN' },
  { label: '加价率', value: 'MARKUP' },
];

const mouldSelectionModeOptions = [
  { label: '自动选择最低成本可行模具', value: 'AUTO' },
  { label: '手动指定模具', value: 'MANUAL' },
];

const formRef = ref<FormInstance>();
const optionsLoading = ref(false);
const calculating = ref(false);
const optionsError = ref('');
const requestError = ref('');
const result = ref<FdmcaiwuQuotationApi.CalculateResp>();
const quotationOptions = ref<FdmcaiwuQuotationApi.Options>({
  costDefaults: undefined,
  mouldProfiles: [],
  profitModes: [],
  recipes: [],
});

let calculateRequestSeq = 0;
let optionsRequestSeq = 0;
let optionsInitialized = false;

function createInitialForm(): QuotationFormModel {
  return {
    includeStrap: false,
    includeSupplement: false,
    mouldProfileId: undefined,
    mouldSelectionMode: 'AUTO',
    productLengthMm: undefined,
    productThicknessMm: undefined,
    productWidthMm: undefined,
    profitMode: 'GROSS_MARGIN',
    profitRatePercent: 20,
    quantity: 1,
    recipeId: undefined,
  };
}

function createInitialFormFromOptions(): QuotationFormModel {
  const next = createInitialForm();
  const defaults = quotationOptions.value.costDefaults;
  next.includeStrap = defaults?.includeStrap ?? false;
  next.includeSupplement = defaults?.includeSupplement ?? false;
  const defaultRecipe = quotationOptions.value.recipes.find(
    (item) => String(item.id) === String(defaults?.recipeId),
  );
  if (defaultRecipe && isRecipeCostAvailable(defaultRecipe)) {
    next.recipeId = defaultRecipe.id;
  }
  return next;
}

const formState = reactive<QuotationFormModel>(createInitialForm());

function isRecipeCostAvailable(recipe?: FdmcaiwuQuotationApi.RecipeOption) {
  if (!recipe) return false;
  if (recipe.costBlockReasons?.length) return false;
  const status = String(recipe.costStatus ?? '').toUpperCase();
  if (
    ['BLOCKED', 'ERROR', 'INVALID', 'MISSING', 'UNAVAILABLE'].some((item) =>
      status.includes(item),
    )
  ) {
    return false;
  }
  return Number(recipe.unitCostPerKg) > 0;
}

function getRecipeBlockReason(recipe?: FdmcaiwuQuotationApi.RecipeOption) {
  if (!recipe) return '';
  return recipe.costBlockReasons?.join('；') || '配方原材料成本无效';
}

const recipeSelectOptions = computed(() =>
  quotationOptions.value.recipes.map((item) => {
    const available = isRecipeCostAvailable(item);
    return {
      disabled: !available,
      label: `${item.recipeCode} · ${item.recipeName} · ${
        available ? formatMaterialUnitCost(item.unitCostPerKg) : '成本不可用'
      }`,
      title: available ? undefined : getRecipeBlockReason(item),
      value: item.id,
    };
  }),
);

const selectedRecipe = computed(() =>
  quotationOptions.value.recipes.find(
    (item) => String(item.id) === String(formState.recipeId),
  ),
);

const availableRecipeCount = computed(
  () => quotationOptions.value.recipes.filter(isRecipeCostAvailable).length,
);

const mouldProfileSelectOptions = computed(() =>
  quotationOptions.value.mouldProfiles.map((item) => ({
    disabled: Boolean(item.blockedReason),
    label: `${item.profileCode} · ${item.profileName} · 模具 ${formatSpecification(
      item.mouldLengthMm,
      item.mouldWidthMm,
      item.mouldThicknessMm,
    )}`,
    title: item.blockedReason || undefined,
    value: item.id,
  })),
);

const selectedMouldProfile = computed(() =>
  quotationOptions.value.mouldProfiles.find(
    (item) => String(item.id) === String(formState.mouldProfileId),
  ),
);

const profitModeOptions = computed(() => {
  const options =
    quotationOptions.value.profitModes.length > 0
      ? quotationOptions.value.profitModes
      : FALLBACK_PROFIT_MODES;
  return options.map((item) => ({
    label: item.label || formatProfitMode(item.value),
    value: item.value,
  }));
});

const profitRateExtra = computed(() =>
  formState.profitMode === 'MARKUP'
    ? '输入 20 表示在精确单位成本上加价 20%'
    : '输入 20 表示目标销售毛利率为 20%',
);

const manualMouldExtra = computed(() => {
  if (formState.mouldSelectionMode === 'AUTO') {
    return '自动模式不传 mouldProfileId，由服务端选择单位成本最低的可行模具';
  }
  const profile = selectedMouldProfile.value;
  if (!profile) return '请选择一个可用模具/板材档案';
  return `板材 ${formatSpecification(
    profile.boardLengthMm,
    profile.boardWidthMm,
    profile.boardThicknessMm,
  )}`;
});

const formRules: Record<string, Rule[]> = {
  mouldProfileId: [
    {
      async validator(_rule, value) {
        if (formState.mouldSelectionMode === 'MANUAL' && !hasValue(value)) {
          throw new Error('手动模式必须选择模具');
        }
        return;
      },
      trigger: 'change',
    },
  ],
  productLengthMm: [
    {
      message: '请输入长度',
      required: true,
      trigger: 'change',
      type: 'number',
    },
  ],
  productThicknessMm: [
    {
      message: '请输入厚度',
      required: true,
      trigger: 'change',
      type: 'number',
    },
  ],
  productWidthMm: [
    {
      message: '请输入宽度',
      required: true,
      trigger: 'change',
      type: 'number',
    },
  ],
  profitMode: [
    { message: '请选择利润模式', required: true, trigger: 'change' },
  ],
  profitRatePercent: [
    {
      message: '请输入利润率',
      required: true,
      trigger: 'change',
      type: 'number',
    },
    {
      async validator(_rule, value) {
        const numberValue = Number(value);
        if (!Number.isFinite(numberValue) || numberValue < 0) {
          throw new Error('利润率不能小于 0%');
        }
        if (formState.profitMode === 'GROSS_MARGIN' && numberValue >= 100) {
          throw new Error('毛利率必须小于 100%');
        }
        return;
      },
      trigger: 'change',
    },
  ],
  quantity: [
    {
      message: '请输入数量',
      required: true,
      trigger: 'change',
      type: 'number',
    },
  ],
  recipeId: [
    { message: '请选择配方', required: true, trigger: 'change' },
    {
      async validator(_rule, value) {
        if (!hasValue(value)) return;
        const recipe = quotationOptions.value.recipes.find(
          (item) => String(item.id) === String(value),
        );
        if (!isRecipeCostAvailable(recipe)) {
          throw new Error(getRecipeBlockReason(recipe));
        }
        return;
      },
      trigger: 'change',
    },
  ],
};

function handleMouldModeChange() {
  if (formState.mouldSelectionMode === 'AUTO') {
    formState.mouldProfileId = undefined;
    formRef.value?.clearValidate(['mouldProfileId']);
  }
}

function handleProfitModeChange() {
  formRef.value?.validateFields(['profitRatePercent']).catch(() => undefined);
}

function handleReset() {
  Object.assign(formState, createInitialFormFromOptions());
  result.value = undefined;
  requestError.value = '';
  nextTick(() => formRef.value?.clearValidate());
}

async function loadOptions() {
  const requestSeq = ++optionsRequestSeq;
  calculateRequestSeq += 1;
  calculating.value = false;
  result.value = undefined;
  requestError.value = '';
  optionsLoading.value = true;
  optionsError.value = '';
  try {
    const data = await getQuotationOptions();
    if (requestSeq !== optionsRequestSeq) return;
    quotationOptions.value = {
      costDefaults: data?.costDefaults,
      mouldProfiles: data?.mouldProfiles ?? [],
      profitModes: data?.profitModes ?? [],
      recipes: data?.recipes ?? [],
    };

    if (!optionsInitialized) {
      Object.assign(formState, createInitialFormFromOptions());
      optionsInitialized = true;
    } else if (
      formState.recipeId !== undefined &&
      !isRecipeCostAvailable(selectedRecipe.value)
    ) {
      formState.recipeId = undefined;
    }

    if (quotationOptions.value.recipes.length === 0) {
      optionsError.value = '尚未配置可用配方，当前无法发起报价计算。';
    } else if (!availableRecipeCount.value) {
      optionsError.value = '所有配方的原材料成本均无效，请先维护原材料价格。';
    } else if (quotationOptions.value.mouldProfiles.length === 0) {
      optionsError.value = '尚未配置模具/板材档案，服务端可能返回阻断结果。';
    }
  } catch {
    if (requestSeq !== optionsRequestSeq) return;
    optionsError.value = '报价基础数据加载失败，请稍后重试。';
  } finally {
    if (requestSeq === optionsRequestSeq) {
      optionsLoading.value = false;
    }
  }
}

function extractRequestError(error: unknown): string {
  const requestErrorObject = error as {
    message?: string;
    response?: { data?: { message?: string; msg?: string } };
  };
  return (
    requestErrorObject.response?.data?.message ||
    requestErrorObject.response?.data?.msg ||
    requestErrorObject.message ||
    '报价计算失败，请核对输入后重试。'
  );
}

function buildCalculateRequest():
  | FdmcaiwuQuotationApi.CalculateReq
  | undefined {
  if (
    !formState.productLengthMm ||
    !formState.productWidthMm ||
    !formState.productThicknessMm ||
    formState.recipeId === undefined ||
    !formState.quantity ||
    !formState.profitMode ||
    formState.profitRatePercent === undefined
  ) {
    return undefined;
  }

  return {
    includeStrap: formState.includeStrap,
    includeSupplement: formState.includeSupplement,
    mouldProfileId:
      formState.mouldSelectionMode === 'MANUAL'
        ? formState.mouldProfileId
        : undefined,
    productLengthMm: formState.productLengthMm,
    productThicknessMm: formState.productThicknessMm,
    productWidthMm: formState.productWidthMm,
    profitMode: formState.profitMode,
    profitRate: Number((formState.profitRatePercent / 100).toFixed(6)),
    quantity: formState.quantity,
    recipeId: formState.recipeId,
  };
}

async function runCalculation() {
  const payload = buildCalculateRequest();
  if (!payload) return;

  const requestSeq = ++calculateRequestSeq;
  calculating.value = true;
  requestError.value = '';
  try {
    const response = await calculateQuotation(payload);
    if (requestSeq !== calculateRequestSeq) return;
    result.value = response;
    if (response.status?.toLowerCase() === 'calculated') {
      message.success('动态报价计算完成');
    }
  } catch (error) {
    if (requestSeq !== calculateRequestSeq) return;
    result.value = undefined;
    requestError.value = extractRequestError(error);
  } finally {
    if (requestSeq === calculateRequestSeq) {
      calculating.value = false;
    }
  }
}

async function handleUseCandidate(record: unknown) {
  const candidate = record as CandidateTableRow;
  if (!candidate.feasible || !candidate.mouldProfileId) return;
  formState.mouldSelectionMode = 'MANUAL';
  formState.mouldProfileId = candidate.mouldProfileId;
  await nextTick();
  try {
    await formRef.value?.validate();
  } catch {
    return;
  }
  await runCalculation();
}

watch(
  formState,
  () => {
    calculateRequestSeq += 1;
    calculating.value = false;
    result.value = undefined;
    requestError.value = '';
  },
  { deep: true },
);

const blockReasons = computed(() => result.value?.blockReasons ?? []);
const warnings = computed(() => result.value?.warnings ?? []);

const normalizedResultStatus = computed(() =>
  (result.value?.status || 'calculated').toLowerCase(),
);

const resultStatusLabel = computed(() => {
  if (normalizedResultStatus.value === 'blocked') return '报价已阻断';
  if (normalizedResultStatus.value === 'calculated') {
    return '计算完成';
  }
  return result.value?.status || '未知状态';
});

const resultStatusColor = computed(() =>
  normalizedResultStatus.value === 'blocked' ? 'error' : 'success',
);

const summaryValues = computed(() => ({
  totalQuote: {
    display: result.value?.totalQuoteDisplay,
    exact: result.value?.totalQuoteExact,
  },
  unitCost: {
    display: result.value?.unitCostDisplay,
    exact: result.value?.unitCostExact,
  },
  unitQuote: {
    display: result.value?.unitQuoteDisplay,
    exact: result.value?.unitQuoteExact,
  },
}));

const processCards = computed(() => {
  const data = result.value;
  return [
    {
      key: 'mould',
      note: formatSpecification(
        data?.mouldLengthMm,
        data?.mouldWidthMm,
        data?.mouldThicknessMm,
      ),
      title: '1. 选中模具',
      value:
        [data?.mouldProfileCode, data?.mouldProfileName]
          .filter(Boolean)
          .join(' · ') || '—',
    },
    {
      key: 'board',
      note: '可用板材长 × 宽 × 厚',
      title: '2. 板材',
      value: formatSpecification(
        data?.boardLengthMm,
        data?.boardWidthMm,
        data?.boardThicknessMm,
      ),
    },
    {
      key: 'layout',
      note: `每层 ${data?.piecesPerLayer ?? '—'} 片`,
      title: '3. 排版',
      value: `${formatLayoutOrientation(data?.layoutOrientation)} · ${
        data?.layoutColumns ?? '—'
      } 列 × ${data?.layoutRows ?? '—'} 行`,
    },
    {
      key: 'layers',
      note: `余厚 ${formatDecimal(data?.remainingThicknessMm, 'mm')}`,
      title: '4. 层数与补片',
      value: `${data?.fullLayers ?? '—'} 个完整层 + ${
        data?.supplementPieces ?? 0
      } 片补片`,
    },
    {
      key: 'yield',
      note: `体积利用率 ${formatRate(data?.volumeUtilizationRate)}`,
      title: '5. 每板产量',
      value: `${data?.totalPiecesPerBoard ?? '—'} 片`,
    },
  ];
});

function formatIngredientCategory(value?: null | string) {
  const labels: Record<string, string> = {
    ADDITIVE: '小料',
    COLOR_MASTER: '色母',
    MAIN: '主材料',
  };
  return value ? labels[value] || value : '—';
}

const ingredientCostRows = computed(() =>
  (result.value?.ingredientCosts ?? []).map((item, index) => ({
    category: formatIngredientCategory(item.category),
    key: `${item.id}-${index}`,
    lineCost: formatMoney(item.lineCost),
    materialCode: item.code,
    materialName: item.name,
    unitPrice: formatDecimal(item.unitPricePerKg, '元/kg'),
    usageWeight: formatDecimal(item.usageWeightKg, 'kg'),
  })),
);

const ingredientCostColumns = [
  {
    dataIndex: 'materialCode',
    key: 'materialCode',
    title: '材料编码',
    width: 140,
  },
  { dataIndex: 'materialName', key: 'materialName', title: '材料名称' },
  { dataIndex: 'category', key: 'category', title: '分类', width: 100 },
  {
    align: 'right' as const,
    dataIndex: 'unitPrice',
    key: 'unitPrice',
    title: '当前单价',
    width: 160,
  },
  {
    align: 'right' as const,
    dataIndex: 'usageWeight',
    key: 'usageWeight',
    title: '配方用量',
    width: 150,
  },
  {
    align: 'right' as const,
    dataIndex: 'lineCost',
    key: 'lineCost',
    title: '行成本',
    width: 140,
  },
];

const costRows = computed(() =>
  RESULT_COST_FIELDS.filter((item) => hasValue(result.value?.[item.field])).map(
    (item) => ({
      displayAmount: formatMoney(result.value?.[item.field]),
      exactAmount: formatExactMoney(result.value?.[item.field]),
      key: item.field,
      name: item.name,
    }),
  ),
);

const costColumns = [
  { dataIndex: 'name', key: 'name', title: '成本项' },
  {
    align: 'right' as const,
    dataIndex: 'exactAmount',
    key: 'exactAmount',
    title: '精确金额',
    width: 190,
  },
  {
    align: 'right' as const,
    dataIndex: 'displayAmount',
    key: 'displayAmount',
    title: '展示金额',
    width: 150,
  },
];

const calculationStepRows = computed(() =>
  (result.value?.calculationSteps ?? []).map((item, index) => ({
    ...item,
    key: item.code || String(index),
    order: index + 1,
    valueText: formatDecimal(item.value),
  })),
);

const calculationStepColumns = [
  { dataIndex: 'order', key: 'order', title: '#', width: 54 },
  { dataIndex: 'label', key: 'label', title: '计算步骤', width: 180 },
  { dataIndex: 'formula', key: 'formula', title: '公式 / 说明' },
  {
    align: 'right' as const,
    dataIndex: 'valueText',
    key: 'valueText',
    title: '精确结果',
    width: 200,
  },
  { dataIndex: 'unit', key: 'unit', title: '单位', width: 90 },
];

const candidateRows = computed<CandidateTableRow[]>(() =>
  (result.value?.candidateMoulds ?? []).map((item) => ({
    ...item,
    boardSpecification: formatSpecification(
      item.boardLengthMm,
      item.boardWidthMm,
      item.boardThicknessMm,
    ),
    key: item.mouldProfileId,
    layerSummary: `每层 ${item.piecesPerLayer ?? '—'} / 完整层 ${
      item.fullLayers ?? '—'
    } / 补片 ${item.supplementPieces ?? 0}`,
    layoutSummary: `${formatLayoutOrientation(item.layoutOrientation)} · ${
      item.layoutColumns ?? '—'
    }×${item.layoutRows ?? '—'}`,
    mouldSpecification: formatSpecification(
      item.mouldLengthMm,
      item.mouldWidthMm,
      item.mouldThicknessMm,
    ),
    profileLabel: `${item.profileCode} · ${item.profileName}`,
    rejectReasonText: item.rejectReasons?.join('；') || '—',
    utilizationText: formatRate(item.volumeUtilizationRate),
  })),
);

const candidateColumns = [
  { key: 'status', title: '状态', width: 92, fixed: 'left' as const },
  {
    dataIndex: 'profileLabel',
    key: 'profileLabel',
    title: '模具档案',
    width: 210,
    fixed: 'left' as const,
  },
  {
    dataIndex: 'mouldSpecification',
    key: 'mouldSpecification',
    title: '模具尺寸',
    width: 210,
  },
  {
    dataIndex: 'boardSpecification',
    key: 'boardSpecification',
    title: '板材尺寸',
    width: 210,
  },
  {
    dataIndex: 'layoutSummary',
    key: 'layoutSummary',
    title: '排版',
    width: 180,
  },
  {
    dataIndex: 'layerSummary',
    key: 'layerSummary',
    title: '层数 / 补片',
    width: 220,
  },
  {
    dataIndex: 'totalPiecesPerBoard',
    key: 'totalPiecesPerBoard',
    title: '每板片数',
    width: 105,
  },
  {
    dataIndex: 'utilizationText',
    key: 'utilizationText',
    title: '利用率',
    width: 100,
  },
  {
    key: 'unitCost',
    title: '单位成本',
    width: 130,
  },
  {
    dataIndex: 'rejectReasonText',
    key: 'rejectReasonText',
    title: '不可行原因 / 提醒',
    width: 260,
  },
  {
    key: 'action',
    title: '操作',
    width: 110,
    fixed: 'right' as const,
  },
];

const resultProfitRate = computed(() => {
  if (!hasValue(result.value?.profitRate)) return '—';
  const numberValue = Number(result.value?.profitRate);
  return Number.isFinite(numberValue)
    ? `${(numberValue * 100).toFixed(2).replace(/\.?0+$/, '')}%`
    : String(result.value?.profitRate);
});

function formatSizeClass(value?: string) {
  if (value === 'SMALL') return '小垫（有效宽度 ≤ 660mm）';
  if (value === 'LARGE') return '大垫（有效宽度 > 660mm）';
  return value || '—';
}

function formatThicknessClass(value?: string) {
  if (value === 'NORMAL') return '普通厚度（< 15mm）';
  if (value === 'THICK') return '厚垫（≥ 15mm）';
  return value || '—';
}

onMounted(loadOptions);
</script>

<template>
  <Page
    title="动态工艺报价"
    description="输入任意成品规格和配方，系统自动解析合格率与工费规则，比较全部可行模具后返回最低完整成本。"
  >
    <div class="quotation-page">
      <div class="quotation-layout">
        <Card class="control-card" :bordered="false">
          <template #title>
            <div class="card-title">
              <IconifyIcon icon="lucide:sliders-horizontal" />
              <span>报价输入</span>
            </div>
          </template>
          <template #extra>
            <Button size="small" :loading="optionsLoading" @click="loadOptions">
              <template #icon>
                <IconifyIcon icon="lucide:refresh-cw" />
              </template>
              刷新基础数据
            </Button>
          </template>

          <Alert
            v-if="optionsError"
            class="mb-4"
            show-icon
            type="warning"
            :message="optionsError"
          />

          <Form
            ref="formRef"
            :model="formState"
            :rules="formRules"
            layout="vertical"
            @finish="runCalculation"
          >
            <div class="form-section">
              <div class="section-heading">
                <span class="section-index">1</span>
                <div>
                  <div class="section-title">产品与配方</div>
                  <div class="section-subtitle">
                    规格不受预设路线限制，可输入任意长宽厚
                  </div>
                </div>
              </div>

              <div class="form-grid">
                <FormItem class="span-two" label="配方" name="recipeId">
                  <Select
                    v-model:value="formState.recipeId"
                    allow-clear
                    option-filter-prop="label"
                    placeholder="请选择配方"
                    show-search
                    :loading="optionsLoading"
                    :options="recipeSelectOptions"
                  />
                  <div v-if="selectedRecipe" class="recipe-meta">
                    <Tag color="blue">
                      {{ formatProductType(selectedRecipe.productType) }}
                    </Tag>
                    <Tag color="cyan">
                      {{ formatDensityType(selectedRecipe.densityType) }}
                    </Tag>
                    <Tag color="purple">
                      合格率 {{ formatRate(selectedRecipe.materialYieldRate) }}
                    </Tag>
                    <Tag>
{{
                      selectedRecipe.processRouteCode || '未配置工艺路线'
                    }}
</Tag>
                    <Tag
                      :color="
                        isRecipeCostAvailable(selectedRecipe)
                          ? 'success'
                          : 'error'
                      "
                    >
                      {{
                        isRecipeCostAvailable(selectedRecipe)
                          ? '成本有效'
                          : '成本不可用'
                      }}
                    </Tag>
                    <span>
                      批次
                      {{ formatDecimal(selectedRecipe.batchWeightKg, 'kg') }} /
                      {{
                        formatMoney(selectedRecipe.batchCostYuan)
                      }}，原始公斤成本
                      {{
                        formatDecimal(selectedRecipe.rawUnitCostPerKg, '元/kg')
                      }}，计价成本
                      {{ formatMaterialUnitCost(selectedRecipe.unitCostPerKg) }}
                    </span>
                  </div>
                  <Alert
                    v-if="
                      selectedRecipe && !isRecipeCostAvailable(selectedRecipe)
                    "
                    class="mt-2"
                    show-icon
                    type="error"
                    :message="getRecipeBlockReason(selectedRecipe)"
                  />
                </FormItem>

                <div class="span-two dimension-grid">
                  <FormItem label="成品长度（mm）" name="productLengthMm">
                    <InputNumber
                      v-model:value="formState.productLengthMm"
                      class="w-full"
                      :min="0.01"
                      :precision="2"
                      placeholder="例如 1850"
                    />
                  </FormItem>
                  <FormItem label="成品宽度（mm）" name="productWidthMm">
                    <InputNumber
                      v-model:value="formState.productWidthMm"
                      class="w-full"
                      :min="0.01"
                      :precision="2"
                      placeholder="例如 610"
                    />
                  </FormItem>
                  <FormItem label="成品厚度（mm）" name="productThicknessMm">
                    <InputNumber
                      v-model:value="formState.productThicknessMm"
                      class="w-full"
                      :min="0.01"
                      :precision="2"
                      placeholder="例如 10"
                    />
                  </FormItem>
                </div>
              </div>
            </div>

            <div class="form-section">
              <div class="section-heading">
                <span class="section-index">2</span>
                <div>
                  <div class="section-title">模具策略</div>
                  <div class="section-subtitle">
                    自动选择完整成本最低方案，也可指定候选模具复算；投料量始终读取模具档案标准值
                  </div>
                </div>
              </div>

              <div class="form-grid">
                <FormItem class="span-two" label="模具选择方式">
                  <RadioGroup
                    v-model:value="formState.mouldSelectionMode"
                    button-style="solid"
                    option-type="button"
                    :options="mouldSelectionModeOptions"
                    @change="handleMouldModeChange"
                  />
                </FormItem>

                <FormItem
                  class="span-two"
                  label="手动模具/板材档案"
                  name="mouldProfileId"
                  :extra="manualMouldExtra"
                >
                  <Select
                    v-model:value="formState.mouldProfileId"
                    allow-clear
                    option-filter-prop="label"
                    placeholder="请选择模具档案"
                    show-search
                    :disabled="formState.mouldSelectionMode === 'AUTO'"
                    :options="mouldProfileSelectOptions"
                  />
                </FormItem>
              </div>
            </div>

            <div class="form-section">
              <div class="section-heading">
                <span class="section-index">3</span>
                <div>
                  <div class="section-title">补片与报价</div>
                  <div class="section-subtitle">
                    补片由余厚规则判断，报价基于服务端精确单位成本
                  </div>
                </div>
              </div>

              <div class="form-grid">
                <FormItem label="计入半层余厚补片">
                  <div class="switch-field">
                    <Switch v-model:checked="formState.includeSupplement" />
                    <span class="switch-hint">
                      {{
                        formState.includeSupplement ? '计入补片' : '不计补片'
                      }}
                    </span>
                  </div>
                </FormItem>

                <FormItem label="计入绑带">
                  <div class="switch-field">
                    <Switch v-model:checked="formState.includeStrap" />
                    <span class="switch-hint">
                      {{
                        formState.includeStrap ? '计入绑带成本' : '不计绑带成本'
                      }}
                    </span>
                  </div>
                </FormItem>

                <FormItem label="报价数量" name="quantity">
                  <InputNumber
                    v-model:value="formState.quantity"
                    class="w-full"
                    :min="1"
                    :precision="0"
                    :step="1"
                  />
                </FormItem>

                <FormItem label="利润模式" name="profitMode">
                  <Select
                    v-model:value="formState.profitMode"
                    :options="profitModeOptions"
                    @change="handleProfitModeChange"
                  />
                </FormItem>

                <FormItem
                  class="span-two"
                  label="利润率（%）"
                  name="profitRatePercent"
                  :extra="profitRateExtra"
                >
                  <InputNumber
                    v-model:value="formState.profitRatePercent"
                    class="w-full"
                    :max="
                      formState.profitMode === 'GROSS_MARGIN' ? 99.99 : 1000
                    "
                    :min="0"
                    :precision="2"
                    addon-after="%"
                  />
                </FormItem>
              </div>
            </div>

            <Alert
              class="mb-4"
              show-icon
              type="info"
              message="成本规则由系统自动解析"
              description="配方决定实时KG成本、固定合格率和工艺路线；规格决定大小垫、厚垫及对应工费。页面不允许临时报改基础费率。"
            />

            <div class="form-actions">
              <Button @click="handleReset">重置</Button>
              <Button
                v-access:code="['fdmcaiwu:quotation:calculate']"
                html-type="submit"
                type="primary"
                :disabled="optionsLoading || !availableRecipeCount"
                :loading="calculating"
              >
                <template #icon>
                  <IconifyIcon icon="lucide:calculator" />
                </template>
                计算动态报价
              </Button>
            </div>
          </Form>
        </Card>

        <Card class="result-card" :bordered="false">
          <template #title>
            <div class="card-title">
              <IconifyIcon icon="lucide:workflow" />
              <span>工艺与报价结果</span>
            </div>
          </template>
          <template #extra>
            <Tag v-if="result" :color="resultStatusColor">
              {{ resultStatusLabel }}
            </Tag>
          </template>

          <Spin :spinning="calculating" tip="正在计算排版与报价…">
            <Alert
              v-if="requestError"
              class="mb-4"
              show-icon
              type="error"
              message="报价计算未完成"
              :description="requestError"
            />

            <Empty
              v-if="!result && !requestError"
              class="result-empty"
              description="填写报价参数后开始计算"
            />

            <div v-else-if="result" class="result-content">
              <Alert
                v-if="blockReasons.length"
                class="mb-4"
                show-icon
                type="error"
                message="当前方案无法完成报价"
              >
                <template #description>
                  <ul class="message-list">
                    <li v-for="item in blockReasons" :key="item">{{ item }}</li>
                  </ul>
                </template>
              </Alert>

              <Alert
                v-if="warnings.length"
                class="mb-4"
                show-icon
                type="warning"
                message="计算提醒"
              >
                <template #description>
                  <ul class="message-list">
                    <li v-for="item in warnings" :key="item">{{ item }}</li>
                  </ul>
                </template>
              </Alert>

              <div class="summary-grid">
                <div class="summary-item cost-summary">
                  <div class="summary-label">单位成本</div>
                  <div class="summary-value">
                    {{ formatMoney(summaryValues.unitCost.display) }}
                  </div>
                  <div class="summary-exact">
                    精确值 {{ formatExactMoney(summaryValues.unitCost.exact) }}
                  </div>
                </div>
                <div class="summary-item quote-summary">
                  <div class="summary-label">建议单位报价</div>
                  <div class="summary-value">
                    {{ formatMoney(summaryValues.unitQuote.display) }}
                  </div>
                  <div class="summary-exact">
                    精确值 {{ formatExactMoney(summaryValues.unitQuote.exact) }}
                  </div>
                </div>
                <div class="summary-item total-summary">
                  <div class="summary-label">报价总额</div>
                  <div class="summary-value">
                    {{ formatMoney(summaryValues.totalQuote.display) }}
                  </div>
                  <div class="summary-exact">
                    精确值
                    {{ formatExactMoney(summaryValues.totalQuote.exact) }}
                  </div>
                </div>
              </div>

              <section class="result-section">
                <div class="result-section-title">工艺计算链</div>
                <div class="process-flow">
                  <div
                    v-for="(item, index) in processCards"
                    :key="item.key"
                    class="process-stage"
                  >
                    <div class="process-stage-title">{{ item.title }}</div>
                    <div class="process-stage-value">{{ item.value }}</div>
                    <div class="process-stage-note">{{ item.note }}</div>
                    <IconifyIcon
                      v-if="index < processCards.length - 1"
                      class="process-arrow"
                      icon="lucide:chevron-right"
                    />
                  </div>
                </div>
              </section>

              <section class="result-section">
                <div class="result-section-title">本次解析规则</div>
                <Descriptions bordered :column="3" size="small">
                  <DescriptionsItem label="有效宽度">
                    {{ formatDecimal(result.effectiveWidthMm, 'mm') }}
                  </DescriptionsItem>
                  <DescriptionsItem label="大小垫分类">
                    {{ formatSizeClass(result.sizeClass) }}
                  </DescriptionsItem>
                  <DescriptionsItem label="厚度分类">
                    {{ formatThicknessClass(result.thicknessClass) }}
                  </DescriptionsItem>
                  <DescriptionsItem label="配方合格率">
                    {{ formatRate(result.materialYieldRate) }}
                  </DescriptionsItem>
                  <DescriptionsItem label="工艺路线">
                    {{ result.processRouteCode || '—' }}
                  </DescriptionsItem>
                  <DescriptionsItem label="工费规则">
                    {{ result.processCostRuleCode || '—' }} ·
                    {{ result.processCostRuleVersion || '—' }}
                  </DescriptionsItem>
                  <DescriptionsItem label="发泡人工">
                    {{ formatDecimal(result.foamingLaborPerKg, '元/kg') }}
                  </DescriptionsItem>
                  <DescriptionsItem label="开片人工">
                    {{ formatDecimal(result.slicingLaborPerKg, '元/kg') }}
                  </DescriptionsItem>
                  <DescriptionsItem label="费用分摊">
                    {{ formatDecimal(result.allocationCostPerKg, '元/kg') }}
                  </DescriptionsItem>
                  <DescriptionsItem label="立切">
                    {{ formatDecimal(result.verticalCutCostPerPiece, '元/条') }}
                  </DescriptionsItem>
                  <DescriptionsItem label="复合">
                    {{ formatDecimal(result.compositeCostPerPiece, '元/条') }}
                  </DescriptionsItem>
                  <DescriptionsItem label="压花">
                    {{ formatDecimal(result.embossCostPerPiece, '元/条') }}
                  </DescriptionsItem>
                  <DescriptionsItem label="冲床">
                    {{ formatDecimal(result.punchCostPerPiece, '元/条') }}
                  </DescriptionsItem>
                  <DescriptionsItem label="包装人工">
                    {{ formatDecimal(result.packingLaborPerPiece, '元/条') }}
                  </DescriptionsItem>
                  <DescriptionsItem label="批量发货">
                    {{
                      formatDecimal(
                        result.batchShippingOperationCostPerPiece,
                        '元/条',
                      )
                    }}
                  </DescriptionsItem>
                </Descriptions>
              </section>

              <section class="result-section">
                <div class="result-section-title">选中模具与排版详情</div>
                <Descriptions bordered :column="3" size="small">
                  <DescriptionsItem label="模具档案">
                    {{ result.mouldProfileCode || '—' }} ·
                    {{ result.mouldProfileName || '—' }}
                  </DescriptionsItem>
                  <DescriptionsItem label="模具尺寸">
                    {{
                      formatSpecification(
                        result.mouldLengthMm,
                        result.mouldWidthMm,
                        result.mouldThicknessMm,
                      )
                    }}
                  </DescriptionsItem>
                  <DescriptionsItem label="板材尺寸">
                    {{
                      formatSpecification(
                        result.boardLengthMm,
                        result.boardWidthMm,
                        result.boardThicknessMm,
                      )
                    }}
                  </DescriptionsItem>
                  <DescriptionsItem label="排版方向">
                    {{ formatLayoutOrientation(result.layoutOrientation) }}
                  </DescriptionsItem>
                  <DescriptionsItem label="排版行列">
                    {{ result.layoutColumns ?? '—' }} 列 ×
                    {{ result.layoutRows ?? '—' }} 行
                  </DescriptionsItem>
                  <DescriptionsItem label="每层片数">
                    {{ result.piecesPerLayer ?? '—' }}
                  </DescriptionsItem>
                  <DescriptionsItem label="完整层数">
                    {{ result.fullLayers ?? '—' }}
                  </DescriptionsItem>
                  <DescriptionsItem label="剩余厚度">
                    {{ formatDecimal(result.remainingThicknessMm, 'mm') }}
                  </DescriptionsItem>
                  <DescriptionsItem label="补片数">
                    {{ result.supplementPieces ?? '—' }}
                  </DescriptionsItem>
                  <DescriptionsItem label="每板片数">
                    {{ result.totalPiecesPerBoard ?? '—' }}
                  </DescriptionsItem>
                  <DescriptionsItem label="体积利用率">
                    {{ formatRate(result.volumeUtilizationRate) }}
                  </DescriptionsItem>
                  <DescriptionsItem label="单片材料用量">
                    {{ formatDecimal(result.materialKgPerPiece, 'kg/片') }}
                  </DescriptionsItem>
                  <DescriptionsItem label="模具标准投料量">
                    {{ formatDecimal(result.chargeWeightKg, 'kg') }}
                  </DescriptionsItem>
                  <DescriptionsItem label="标准投料量来源">
                    {{ result.chargeWeightSource || '—' }}
                  </DescriptionsItem>
                  <DescriptionsItem label="材料成本来源">
                    {{ result.materialUnitCostSource || '—' }}
                  </DescriptionsItem>
                  <DescriptionsItem label="原始公斤成本">
                    {{
                      formatDecimal(result.rawMaterialUnitCostPerKg, '元/kg')
                    }}
                  </DescriptionsItem>
                  <DescriptionsItem label="配方公斤成本">
                    {{ formatMaterialUnitCost(result.materialUnitCostPerKg) }}
                  </DescriptionsItem>
                </Descriptions>
              </section>

              <section class="result-section">
                <div class="result-section-title">配方原材料成本明细</div>
                <div class="result-section-subtitle">
                  当前单价来自原材料价格维护；配方公斤成本由这些明细实时汇总并按两位四舍五入。
                </div>
                <Table
                  :columns="ingredientCostColumns"
                  :data-source="ingredientCostRows"
                  :pagination="false"
                  row-key="key"
                  :scroll="{ x: 850 }"
                  size="small"
                >
                  <template #emptyText>
                    <Empty description="服务端未返回配方原材料成本明细" />
                  </template>
                </Table>
              </section>

              <section class="result-section">
                <div class="result-section-title">成本汇总</div>
                <Table
                  :columns="costColumns"
                  :data-source="costRows"
                  :pagination="false"
                  row-key="key"
                  size="small"
                >
                  <template #emptyText>
                    <Empty description="当前结果没有成本汇总" />
                  </template>
                </Table>
              </section>

              <section class="result-section">
                <div class="result-section-title">完整计算步骤</div>
                <Table
                  :columns="calculationStepColumns"
                  :data-source="calculationStepRows"
                  :pagination="false"
                  row-key="key"
                  :scroll="{ x: 850 }"
                  size="small"
                >
                  <template #emptyText>
                    <Empty description="服务端未返回计算步骤" />
                  </template>
                </Table>
              </section>

              <section class="result-section">
                <div class="result-section-title">
                  候选模具
                  <span class="section-count">
                    {{ candidateRows.length }} 个
                  </span>
                </div>
                <Table
                  :columns="candidateColumns"
                  :data-source="candidateRows"
                  :pagination="false"
                  row-key="key"
                  :scroll="{ x: 1900 }"
                  size="small"
                >
                  <template #bodyCell="{ column, record }">
                    <template v-if="column.key === 'status'">
                      <Tag v-if="record.selected" color="blue">当前</Tag>
                      <Tag v-else-if="record.feasible" color="success">
                        可行
                      </Tag>
                      <Tag v-else color="error">不可行</Tag>
                    </template>
                    <template v-else-if="column.key === 'unitCost'">
                      {{ formatMoney(record.unitCostDisplay) }}
                    </template>
                    <template v-else-if="column.key === 'action'">
                      <Button
                        size="small"
                        type="link"
                        :disabled="!record.feasible"
                        :loading="
                          calculating &&
                          formState.mouldSelectionMode === 'MANUAL' &&
                          formState.mouldProfileId === record.mouldProfileId
                        "
                        @click="handleUseCandidate(record)"
                      >
                        {{ record.selected ? '锁定并重算' : '使用并重算' }}
                      </Button>
                    </template>
                  </template>
                  <template #emptyText>
                    <Empty description="服务端未返回候选模具" />
                  </template>
                </Table>
              </section>

              <section class="result-section">
                <div class="result-section-title">计算口径与来源</div>
                <Descriptions bordered :column="2" size="small">
                  <DescriptionsItem label="配方">
                    {{ result.recipeCode || '—' }} ·
                    {{ result.recipeName || '—' }}
                  </DescriptionsItem>
                  <DescriptionsItem label="利润口径">
                    {{ formatProfitMode(result.profitMode) }} /
                    {{ resultProfitRate }}
                  </DescriptionsItem>
                  <DescriptionsItem label="计算口径">
                    {{ result.calculationProfile || '—' }}
                  </DescriptionsItem>
                  <DescriptionsItem label="排版算法">
                    {{ result.layoutAlgorithmVersion || '—' }}
                  </DescriptionsItem>
                  <DescriptionsItem label="补片算法">
                    {{ result.supplementAlgorithmVersion || '—' }}
                  </DescriptionsItem>
                  <DescriptionsItem label="工费规则版本">
                    {{ result.processCostRuleVersion || '—' }}
                  </DescriptionsItem>
                  <DescriptionsItem label="模具来源版本">
                    {{ result.mouldSourceVersion || '—' }}
                  </DescriptionsItem>
                  <DescriptionsItem label="配方来源" :span="2">
                    {{ result.recipeSourceVersion || '—' }} ·
                    {{ result.recipeSourceLocation || '—' }}
                  </DescriptionsItem>
                  <DescriptionsItem label="模具来源" :span="2">
                    {{ result.mouldSourceLocation || '—' }}
                  </DescriptionsItem>
                </Descriptions>
              </section>
            </div>
          </Spin>
        </Card>
      </div>
    </div>
  </Page>
</template>

<style scoped>
.quotation-page {
  width: 100%;
  max-width: 1760px;
  margin: 0 auto;
}

.quotation-layout {
  display: grid;
  grid-template-columns: minmax(470px, 0.9fr) minmax(0, 1.45fr);
  gap: 16px;
  align-items: start;
}

.card-title {
  display: inline-flex;
  gap: 8px;
  align-items: center;
}

.form-section + .form-section {
  padding-top: 22px;
  margin-top: 6px;
  border-top: 1px solid var(--ant-color-border-secondary, #f0f0f0);
}

.section-heading {
  display: flex;
  gap: 10px;
  align-items: flex-start;
  margin-bottom: 16px;
}

.section-index {
  display: inline-flex;
  flex: none;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  font-size: 12px;
  font-weight: 600;
  color: #fff;
  background: var(--ant-color-primary, #1677ff);
  border-radius: 50%;
}

.section-title,
.result-section-title {
  font-size: 15px;
  font-weight: 600;
  color: var(--ant-color-text, #1f1f1f);
}

.section-subtitle,
.section-count,
.switch-hint,
.summary-exact,
.process-stage-note {
  font-size: 12px;
  color: var(--ant-color-text-secondary, #8c8c8c);
}

.section-subtitle {
  margin-top: 2px;
}

.form-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  column-gap: 16px;
}

.span-two {
  grid-column: 1 / -1;
}

.dimension-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  column-gap: 12px;
}

.recipe-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  align-items: center;
  margin-top: 8px;
  font-size: 12px;
  color: var(--ant-color-text-secondary, #8c8c8c);
}

.parameter-group + .parameter-group {
  margin-top: 8px;
}

.parameter-group-title {
  padding-bottom: 8px;
  margin-bottom: 12px;
  font-size: 13px;
  font-weight: 600;
  color: var(--ant-color-text-secondary, #595959);
  border-bottom: 1px dashed var(--ant-color-border-secondary, #f0f0f0);
}

.cost-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  column-gap: 12px;
}

.switch-field {
  display: flex;
  gap: 10px;
  align-items: center;
  min-height: 32px;
}

.form-actions {
  display: flex;
  gap: 10px;
  justify-content: flex-end;
  padding-top: 20px;
  margin-top: 8px;
  border-top: 1px solid var(--ant-color-border-secondary, #f0f0f0);
}

.result-empty {
  display: flex;
  flex-direction: column;
  justify-content: center;
  min-height: 520px;
}

.summary-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 12px;
}

.summary-item {
  min-width: 0;
  padding: 18px;
  overflow: hidden;
  border: 1px solid var(--ant-color-border-secondary, #f0f0f0);
  border-radius: 10px;
}

.cost-summary {
  background: rgb(22 119 255 / 6%);
}

.quote-summary {
  background: rgb(82 196 26 / 7%);
}

.total-summary {
  background: rgb(250 173 20 / 8%);
}

.summary-label {
  margin-bottom: 8px;
  font-size: 13px;
  color: var(--ant-color-text-secondary, #8c8c8c);
}

.summary-value {
  overflow: hidden;
  text-overflow: ellipsis;
  font-size: clamp(22px, 2vw, 31px);
  font-weight: 650;
  line-height: 1.25;
  color: var(--ant-color-text, #1f1f1f);
  white-space: nowrap;
}

.summary-exact {
  margin-top: 8px;
  overflow-wrap: anywhere;
}

.result-section {
  margin-top: 24px;
}

.result-section-title {
  margin-bottom: 10px;
}

.result-section-subtitle {
  margin: -4px 0 10px;
  font-size: 12px;
  color: var(--ant-color-text-secondary, #8c8c8c);
}

.section-count {
  margin-left: 6px;
  font-weight: 400;
}

.process-flow {
  display: grid;
  grid-template-columns: repeat(5, minmax(0, 1fr));
  gap: 10px;
}

.process-stage {
  position: relative;
  min-width: 0;
  min-height: 116px;
  padding: 14px;
  background: var(--ant-color-fill-quaternary, #fafafa);
  border: 1px solid var(--ant-color-border-secondary, #f0f0f0);
  border-radius: 8px;
}

.process-stage-title {
  font-size: 12px;
  font-weight: 600;
  color: var(--ant-color-primary, #1677ff);
}

.process-stage-value {
  margin-top: 9px;
  font-size: 14px;
  font-weight: 600;
  line-height: 1.4;
  color: var(--ant-color-text, #1f1f1f);
  overflow-wrap: anywhere;
}

.process-stage-note {
  margin-top: 7px;
  overflow-wrap: anywhere;
}

.process-arrow {
  position: absolute;
  top: 50%;
  right: -15px;
  z-index: 1;
  color: var(--ant-color-text-quaternary, #bfbfbf);
  transform: translateY(-50%);
}

.message-list {
  padding-left: 18px;
  margin: 0;
}

.message-list li + li {
  margin-top: 4px;
}

@media (max-width: 1380px) {
  .quotation-layout {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 900px) {
  .process-flow {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .process-arrow {
    display: none;
  }
}

@media (max-width: 720px) {
  .form-grid,
  .dimension-grid,
  .cost-grid,
  .summary-grid,
  .process-flow {
    grid-template-columns: 1fr;
  }

  .span-two {
    grid-column: auto;
  }

  .form-actions > * {
    flex: 1;
  }
}
</style>
