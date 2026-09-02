<script lang="ts" setup>
import type { FormInstance } from 'ant-design-vue';
import type { Rule } from 'ant-design-vue/es/form';

import type { FdmcaiwuQuotationApi } from '#/api/fdmcaiwu/quotation';

import {
  computed,
  nextTick,
  onBeforeUnmount,
  onMounted,
  reactive,
  ref,
  watch,
} from 'vue';
import { useRoute, useRouter } from 'vue-router';

import { useAccess } from '@vben/access';
import { Page } from '@vben/common-ui';
import { IconifyIcon } from '@vben/icons';
import { useUserStore } from '@vben/stores';

import {
  Alert,
  Button,
  Card,
  Collapse,
  Descriptions,
  DescriptionsItem,
  Empty,
  Form,
  FormItem,
  InputNumber,
  message,
  Progress,
  RadioGroup,
  Segmented,
  Select,
  Space,
  Spin,
  Switch,
  Table,
  Tabs,
  Tag,
} from 'ant-design-vue';

import {
  calculateQuotation,
  createQuotationAiAnalysis,
  getQuotationAiAnalysis,
  getQuotationOptions,
} from '#/api/fdmcaiwu/quotation';

import BatchQuotationPanel from '../batch-quotation/index.vue';
import AccessoryMatchList from './components/accessory-match-list.vue';
import {
  formatCompactDecimal,
  formatDecimal,
  formatDensityType,
  formatExactMoney,
  formatLayoutOrientation,
  formatMaterialUnitCost,
  formatMoney,
  formatProductType,
  formatQuotationTaxRate,
  formatRate,
  formatSpecification,
  hasValue,
  resolveTaxIncludedValue,
  RESULT_COST_FIELDS,
} from './data';

defineOptions({ name: 'FdmcaiwuQuotation' });

type MouldSelectionMode = 'AUTO' | 'MANUAL';
type ProfitRateMode = 'CUSTOM' | 'DEFAULT';
type QuotationMode = 'batch' | 'single';
type ProductStructure = 'LAMINATED' | 'PURE_TPE';

interface QuotationFormModel {
  customProfitRatePercent?: string;
  includeCarton: boolean;
  includeOpp: boolean;
  includeStrap: boolean;
  includeSupplement: boolean;
  laminationMaterialId?: number | string;
  mouldProfileId?: number;
  mouldSelectionMode: MouldSelectionMode;
  profitRateMode: ProfitRateMode;
  productLengthMm?: number;
  productThicknessMm?: number;
  productWidthMm?: number;
  productStructure: ProductStructure;
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

const route = useRoute();
const router = useRouter();
const { hasAccessByCodes } = useAccess();
const userStore = useUserStore();
const isSuperAdmin = computed(() =>
  (userStore.userRoles ?? []).includes('super_admin'),
);
const canUseBatchQuotation = hasAccessByCodes([
  'fdmcaiwu:batch-quotation:query',
]);
const initialQuotationMode: QuotationMode =
  route.query.mode === 'batch' && canUseBatchQuotation ? 'batch' : 'single';
const activeQuotationMode = ref<QuotationMode>(initialQuotationMode);
const batchPanelMounted = ref(initialQuotationMode === 'batch');
const quotationModeOptions = computed(() => [
  {
    label: '单笔报价',
    value: 'single',
  },
  ...(canUseBatchQuotation
    ? [
        {
          label: 'Excel 批量报价',
          value: 'batch',
        },
      ]
    : []),
]);
const pageDescription = computed(() =>
  activeQuotationMode.value === 'batch'
    ? '从 Excel 导入多条规格，逐行完成工艺选模与报价，并导出冻结批次结果。'
    : '输入任意成品规格和配方，系统自动解析合格率与工费规则，比较全部可行模具后返回最低完整成本。',
);

function normalizeQuotationMode(value: unknown): QuotationMode {
  return value === 'batch' && canUseBatchQuotation ? 'batch' : 'single';
}

function setQuotationMode(value: number | string) {
  const nextMode = normalizeQuotationMode(value);
  activeQuotationMode.value = nextMode;
  if (nextMode === 'batch') {
    batchPanelMounted.value = true;
  }
  void router.replace({
    query: {
      ...route.query,
      mode: nextMode,
    },
  });
}

watch(
  () => route.query.mode,
  (value) => {
    const nextMode = normalizeQuotationMode(value);
    activeQuotationMode.value = nextMode;
    if (nextMode === 'batch') {
      batchPanelMounted.value = true;
    }
  },
);

const mouldSelectionModeOptions = [
  { label: '自动选择最低成本可行模具', value: 'AUTO' },
  { label: '手动指定模具', value: 'MANUAL' },
];

const profitRateModeOptions = [
  { label: '按规格自动', value: 'DEFAULT' },
  { label: '自定义利润率', value: 'CUSTOM' },
];

const formRef = ref<FormInstance>();
const optionsLoading = ref(false);
const calculating = ref(false);
const optionsError = ref('');
const requestError = ref('');
const result = ref<FdmcaiwuQuotationApi.CalculateResp>();
const lastCalculateRequest = ref<FdmcaiwuQuotationApi.CalculateReq>();
const activeResultTab = ref('overview');
const aiAnalysisLoading = ref(false);
const aiAnalysisStatus = ref('');
const aiAnalysisProgress = ref(0);
const aiAnalysisMessage = ref('');
const aiAnalysisError = ref('');
const aiAnalysisResult = ref<FdmcaiwuQuotationApi.AiAnalysisResult>();
const quotationOptions = ref<FdmcaiwuQuotationApi.Options>({
  capabilities: undefined,
  costDefaults: undefined,
  laminationMaterials: [],
  mouldProfiles: [],
  recipes: [],
});

const canViewOptionQuoteDetail = computed(
  () =>
    isSuperAdmin.value &&
    quotationOptions.value.capabilities?.canViewQuoteDetail === true,
);

const canCustomizeProfitRate = computed(
  () => quotationOptions.value.capabilities?.canCustomizeProfitRate === true,
);

let calculateRequestSeq = 0;
let optionsRequestSeq = 0;
let optionsInitialized = false;
let aiAnalysisRequestSeq = 0;

const AI_ANALYSIS_MAX_POLLS = 80;
const AI_ANALYSIS_POLL_INTERVAL_MS = 1500;

function createInitialForm(): QuotationFormModel {
  return {
    customProfitRatePercent: undefined,
    includeCarton: false,
    includeOpp: false,
    includeStrap: false,
    includeSupplement: true,
    laminationMaterialId: undefined,
    mouldProfileId: undefined,
    mouldSelectionMode: 'AUTO',
    profitRateMode: 'DEFAULT',
    productLengthMm: undefined,
    productThicknessMm: undefined,
    productWidthMm: undefined,
    productStructure: 'PURE_TPE',
    quantity: 1,
    recipeId: undefined,
  };
}

function createInitialFormFromOptions(): QuotationFormModel {
  const next = createInitialForm();
  const defaults = quotationOptions.value.costDefaults;
  next.includeCarton = defaults?.includeCarton ?? false;
  next.includeOpp = defaults?.includeOpp ?? false;
  next.includeStrap = defaults?.includeStrap ?? false;
  next.includeSupplement = defaults?.includeSupplement ?? true;
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
  // 非超级管理员收到的是已脱敏选项，成本为空并不代表配方不可使用。
  if (!canViewOptionQuoteDetail.value) return true;
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
      label: `${item.recipeCode} · ${item.recipeName}${
        canViewOptionQuoteDetail.value && available
          ? ` · ${formatMaterialUnitCost(item.unitCostPerKg)}`
          : ''
      }${available ? '' : ' · 成本不可用'}`,
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

const productStructureOptions = [
  { label: '纯TPE', value: 'PURE_TPE' },
  { label: 'TPE+外采面材', value: 'LAMINATED' },
];

const laminationMaterialOptions = computed(() =>
  (quotationOptions.value.laminationMaterials ?? []).map((item) => ({
    label: `${item.materialCode} · ${item.materialName} · 卷宽 ${formatCompactDecimal(
      item.rollWidthMm,
      'mm',
      3,
    )} · 厚 ${formatCompactDecimal(item.materialThicknessMm, 'mm', 3)}`,
    value: item.id,
  })),
);

const selectedLaminationMaterial = computed(() =>
  (quotationOptions.value.laminationMaterials ?? []).find(
    (item) => String(item.id) === String(formState.laminationMaterialId),
  ),
);

const baseTpeThicknessPreview = computed(() => {
  const finishedThickness = Number(formState.productThicknessMm);
  const materialThickness = Number(
    selectedLaminationMaterial.value?.materialThicknessMm,
  );
  if (
    formState.productStructure !== 'LAMINATED' ||
    !Number.isFinite(finishedThickness) ||
    !Number.isFinite(materialThickness)
  ) {
    return undefined;
  }
  return finishedThickness - materialThickness;
});

const canViewQuoteDetail = computed(() => {
  if (!isSuperAdmin.value) return false;
  if (result.value) {
    return result.value.capabilities?.canViewQuoteDetail === true;
  }
  return canViewOptionQuoteDetail.value;
});

const canViewUltraLowPrice = computed(
  () =>
    isSuperAdmin.value ||
    result.value?.capabilities?.canViewUltraLowPrice === true ||
    quotationOptions.value.capabilities?.canViewUltraLowPrice === true,
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
  customProfitRatePercent: [
    {
      async validator(_rule, value) {
        if (
          !canCustomizeProfitRate.value ||
          formState.profitRateMode !== 'CUSTOM'
        ) {
          return;
        }
        const normalized = normalizeProfitRatePercent(value);
        if (normalized === undefined) {
          throw new Error('请输入 0 至 99.99 之间的利润率');
        }
      },
      trigger: ['blur', 'change'],
    },
  ],
  laminationMaterialId: [
    {
      async validator(_rule, value) {
        if (formState.productStructure === 'LAMINATED' && !hasValue(value)) {
          throw new Error('请选择贴合材料');
        }
      },
      trigger: 'change',
    },
  ],
  mouldProfileId: [
    {
      async validator(_rule, value) {
        if (formState.mouldSelectionMode === 'MANUAL' && !hasValue(value)) {
          throw new Error('手动模式必须选择模具');
        }
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
    {
      async validator() {
        if (
          formState.productStructure === 'LAMINATED' &&
          baseTpeThicknessPreview.value !== undefined &&
          baseTpeThicknessPreview.value <= 0
        ) {
          throw new Error('成品总厚度必须大于贴合材料厚度');
        }
      },
      trigger: 'change',
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

function handleProductStructureChange() {
  if (formState.productStructure === 'PURE_TPE') {
    formState.laminationMaterialId = undefined;
  }
  formRef.value?.clearValidate(['laminationMaterialId', 'productThicknessMm']);
}

/**
 * InputNumber 使用 string-mode 保留十进制精度；这里用字符串比较范围，
 * 避免百分比先转为 IEEE-754 number 再发送产生尾差。
 */
function normalizeProfitRatePercent(value: unknown): string | undefined {
  const text = String(value ?? '').trim();
  if (!/^\d+(?:\.\d{1,2})?$/.test(text)) return undefined;
  const [integerPart = '', fractionPart = ''] = text.split('.');
  const normalizedInteger = integerPart.replace(/^0+(?=\d)/, '');
  if (normalizedInteger.length > 2) return undefined;
  if (normalizedInteger === '99' && fractionPart.padEnd(2, '0') > '99') {
    return undefined;
  }
  return text;
}

function formatProfitRatePercent(value: unknown): string {
  const formatted = formatCompactDecimal(value, '', 2);
  return formatted === '—' ? formatted : `${formatted}%`;
}

function normalizeProfitRatePercentForInput(
  value: unknown,
): string | undefined {
  const text = String(value ?? '').trim();
  if (!/^\d+(?:\.\d+)?$/.test(text)) return undefined;
  const [integerPart = '', fractionPart = ''] = text.split('.');
  const compactFraction = fractionPart.replace(/0+$/, '');
  return normalizeProfitRatePercent(
    compactFraction ? `${integerPart}.${compactFraction}` : integerPart,
  );
}

function restoreDefaultProfitRate() {
  if (!canCustomizeProfitRate.value) {
    formState.profitRateMode = 'DEFAULT';
    formState.customProfitRatePercent = undefined;
    return;
  }
  formState.profitRateMode = 'DEFAULT';
  formState.customProfitRatePercent = undefined;
  formRef.value?.clearValidate(['customProfitRatePercent']);
}

function handleProfitRateModeChange() {
  if (!canCustomizeProfitRate.value) {
    restoreDefaultProfitRate();
    return;
  }
  if (formState.profitRateMode === 'DEFAULT') {
    formState.customProfitRatePercent = undefined;
    formRef.value?.clearValidate(['customProfitRatePercent']);
    return;
  }
  if (formState.customProfitRatePercent === undefined) {
    formState.customProfitRatePercent = normalizeProfitRatePercentForInput(
      result.value?.defaultProfitRatePercent,
    );
  }
}

function clearAiAnalysis() {
  aiAnalysisRequestSeq += 1;
  aiAnalysisLoading.value = false;
  aiAnalysisStatus.value = '';
  aiAnalysisProgress.value = 0;
  aiAnalysisMessage.value = '';
  aiAnalysisError.value = '';
  aiAnalysisResult.value = undefined;
}

function handleReset() {
  Object.assign(formState, createInitialFormFromOptions());
  result.value = undefined;
  lastCalculateRequest.value = undefined;
  clearAiAnalysis();
  activeResultTab.value = 'overview';
  requestError.value = '';
  nextTick(() => formRef.value?.clearValidate());
}

async function loadOptions() {
  const requestSeq = ++optionsRequestSeq;
  calculateRequestSeq += 1;
  calculating.value = false;
  result.value = undefined;
  lastCalculateRequest.value = undefined;
  clearAiAnalysis();
  requestError.value = '';
  optionsLoading.value = true;
  optionsError.value = '';
  try {
    const data = await getQuotationOptions();
    if (requestSeq !== optionsRequestSeq) return;
    quotationOptions.value = {
      capabilities: data?.capabilities,
      costDefaults: data?.costDefaults,
      laminationMaterials: data?.laminationMaterials ?? [],
      mouldProfiles: data?.mouldProfiles ?? [],
      recipes: data?.recipes ?? [],
    };

    // 权限可能在页面打开期间被收回；隐藏控件之外再清空本地值，
    // buildCalculateRequest 还会做最后一道发送前校验。
    if (!canCustomizeProfitRate.value) {
      formState.profitRateMode = 'DEFAULT';
      formState.customProfitRatePercent = undefined;
    }

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
    (formState.productStructure === 'LAMINATED' &&
      !formState.laminationMaterialId)
  ) {
    return undefined;
  }

  const customProfitRatePercent =
    canCustomizeProfitRate.value && formState.profitRateMode === 'CUSTOM'
      ? normalizeProfitRatePercent(formState.customProfitRatePercent)
      : undefined;
  if (
    canCustomizeProfitRate.value &&
    formState.profitRateMode === 'CUSTOM' &&
    customProfitRatePercent === undefined
  ) {
    return undefined;
  }

  return {
    ...(customProfitRatePercent === undefined
      ? {}
      : { customProfitRatePercent }),
    includeCarton: formState.includeCarton,
    includeOpp: formState.includeOpp,
    includeStrap: formState.includeStrap,
    includeSupplement: formState.includeSupplement,
    laminationMaterialId:
      formState.productStructure === 'LAMINATED'
        ? formState.laminationMaterialId
        : undefined,
    mouldProfileId:
      formState.mouldSelectionMode === 'MANUAL'
        ? formState.mouldProfileId
        : undefined,
    productLengthMm: formState.productLengthMm,
    productThicknessMm: formState.productThicknessMm,
    productWidthMm: formState.productWidthMm,
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
    lastCalculateRequest.value = payload;
    clearAiAnalysis();
    activeResultTab.value =
      response.status?.toLowerCase() === 'blocked' &&
      response.candidateMoulds?.length
        ? 'moulds'
        : 'overview';
    if (response.status?.toLowerCase() === 'calculated') {
      message.success('动态报价计算完成');
    }
  } catch (error) {
    if (requestSeq !== calculateRequestSeq) return;
    result.value = undefined;
    lastCalculateRequest.value = undefined;
    clearAiAnalysis();
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
    lastCalculateRequest.value = undefined;
    clearAiAnalysis();
    requestError.value = '';
  },
  { deep: true },
);

function createAiAnalysisRequestId() {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }
  return `quotation-ai-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function waitForAiAnalysisPoll() {
  return new Promise<void>((resolve) => {
    window.setTimeout(resolve, AI_ANALYSIS_POLL_INTERVAL_MS);
  });
}

function normalizeAiProgress(value: unknown) {
  const progress = Number(value);
  if (!Number.isFinite(progress)) return 0;
  return Math.min(100, Math.max(0, progress <= 1 ? progress * 100 : progress));
}

function aiAnalysisStatusLabel(value: unknown) {
  const status = String(value ?? '').toUpperCase();
  const labels: Record<string, string> = {
    CANCEL_REQUESTED: '正在取消',
    CANCELING: '正在取消',
    CANCELED: '分析已取消',
    CREATED: '等待分析',
    DOWNLOADING: '正在获取结果',
    FAILED: '分析失败',
    PENDING: '等待分析',
    QUEUED: '等待分析',
    RESULT_RECEIVED: '正在校验结果',
    RUNNING: '分析中',
    SUBMITTING: '正在提交',
    SUBMISSION_UNKNOWN: '提交状态待确认',
    SUCCEEDED: '分析完成',
    SUCCESS: '分析完成',
    UNAVAILABLE: '服务不可用',
    WAITING_PROVIDER: '等待模型响应',
  };
  return labels[status] || (status ? String(value) : '准备分析');
}

function aiRiskLabel(value: unknown) {
  const labels: Record<string, string> = {
    HIGH: '高风险',
    LOW: '低风险',
    MEDIUM: '中风险',
  };
  return labels[String(value ?? '').toUpperCase()] || String(value || '未评级');
}

function aiRiskColor(value: unknown) {
  const risk = String(value ?? '').toUpperCase();
  if (risk === 'HIGH') return 'error';
  if (risk === 'MEDIUM') return 'warning';
  if (risk === 'LOW') return 'success';
  return 'default';
}

function formatAiConfidence(value: unknown) {
  if (!hasValue(value)) return '—';
  const confidence = Number(value);
  if (!Number.isFinite(confidence)) return String(value);
  const percentage = confidence <= 1 ? confidence * 100 : confidence;
  return `${Math.min(100, Math.max(0, percentage)).toFixed(0)}%`;
}

async function handleAiAnalysis() {
  const quotation = lastCalculateRequest.value;
  if (!quotation || !result.value) {
    message.warning('请先完成当前参数的报价计算');
    return;
  }

  const requestSeq = ++aiAnalysisRequestSeq;
  aiAnalysisLoading.value = true;
  aiAnalysisStatus.value = 'PENDING';
  aiAnalysisProgress.value = 0;
  aiAnalysisMessage.value = '';
  aiAnalysisError.value = '';
  aiAnalysisResult.value = undefined;

  try {
    const started = await createQuotationAiAnalysis({
      quotation,
      requestId: createAiAnalysisRequestId(),
    });
    if (requestSeq !== aiAnalysisRequestSeq) return;

    if (!started.available) {
      aiAnalysisMessage.value =
        started.message || 'AI 分析服务当前不可用，报价结果不受影响。';
      aiAnalysisStatus.value = started.status || 'UNAVAILABLE';
      return;
    }
    if (!started.invocationId) {
      aiAnalysisError.value =
        started.message || 'AI 分析任务未返回有效的任务编号。';
      return;
    }

    aiAnalysisStatus.value = started.status || 'QUEUED';
    aiAnalysisMessage.value = started.message || '';
    for (let pollIndex = 0; pollIndex < AI_ANALYSIS_MAX_POLLS; pollIndex += 1) {
      if (requestSeq !== aiAnalysisRequestSeq) return;
      if (pollIndex > 0) await waitForAiAnalysisPoll();
      if (requestSeq !== aiAnalysisRequestSeq) return;

      const status = await getQuotationAiAnalysis(started.invocationId);
      if (requestSeq !== aiAnalysisRequestSeq) return;
      aiAnalysisStatus.value = status.status || aiAnalysisStatus.value;
      aiAnalysisProgress.value = normalizeAiProgress(status.progress);
      aiAnalysisMessage.value = status.message || '';

      if (!status.available) {
        aiAnalysisMessage.value =
          status.message || 'AI 分析服务当前不可用，报价结果不受影响。';
        return;
      }
      if (status.result) aiAnalysisResult.value = status.result;
      if (status.terminal || status.result) {
        if (status.result) aiAnalysisProgress.value = 100;
        if (!status.result) {
          aiAnalysisError.value =
            status.message || 'AI 分析未生成可展示的结果。';
        }
        return;
      }
    }
    aiAnalysisError.value =
      'AI 分析等待超时，可稍后重新发起；报价结果不受影响。';
  } catch (error) {
    if (requestSeq !== aiAnalysisRequestSeq) return;
    aiAnalysisError.value =
      extractRequestError(error) || 'AI 分析未完成，报价结果不受影响。';
  } finally {
    if (requestSeq === aiAnalysisRequestSeq) {
      aiAnalysisLoading.value = false;
    }
  }
}

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

const quotationTaxRateLabel = computed(() =>
  formatQuotationTaxRate(result.value?.taxRate),
);

function resolveResultTaxIncluded(
  excludingTax: unknown,
  includingTax?: unknown,
) {
  return resolveTaxIncludedValue(
    excludingTax,
    includingTax,
    result.value?.taxRate,
  );
}

const summaryValues = computed(() => {
  const unitQuoteDisplay =
    result.value?.regularUnitQuoteDisplay ?? result.value?.unitQuoteDisplay;
  const totalQuoteDisplay =
    result.value?.regularTotalQuoteDisplay ?? result.value?.totalQuoteDisplay;
  return {
    totalQuote: {
      display: totalQuoteDisplay,
      exact: result.value?.totalQuoteExact,
      taxIncludedDisplay: resolveResultTaxIncluded(
        totalQuoteDisplay,
        result.value?.regularTotalQuoteTaxIncludedDisplay ??
          result.value?.totalQuoteTaxIncludedDisplay,
      ),
      taxIncludedExact: resolveResultTaxIncluded(
        result.value?.totalQuoteExact,
        result.value?.totalQuoteTaxIncludedExact,
      ),
    },
    unitCost: {
      display: result.value?.unitCostDisplay,
      exact: result.value?.unitCostExact,
    },
    unitQuote: {
      display: unitQuoteDisplay,
      exact: result.value?.unitQuoteExact,
      taxIncludedDisplay: resolveResultTaxIncluded(
        unitQuoteDisplay,
        result.value?.regularUnitQuoteTaxIncludedDisplay ??
          result.value?.unitQuoteTaxIncludedDisplay,
      ),
      taxIncludedExact: resolveResultTaxIncluded(
        result.value?.unitQuoteExact,
        result.value?.unitQuoteTaxIncludedExact,
      ),
    },
  };
});

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
      value: data?.mouldProfileCode || '—',
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
      note: `余厚 ${formatCompactDecimal(data?.remainingThicknessMm, 'mm', 2)}`,
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
  { key: 'status', title: '状态', width: 82, fixed: 'left' as const },
  {
    dataIndex: 'profileLabel',
    key: 'profileLabel',
    title: '模具档案',
    width: 250,
    fixed: 'left' as const,
  },
  {
    dataIndex: 'layoutSummary',
    key: 'layoutSummary',
    title: '排版',
    width: 160,
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
    width: 90,
  },
  {
    key: 'unitCost',
    title: '单位成本',
    width: 120,
  },
  {
    key: 'action',
    title: '操作',
    width: 110,
    fixed: 'right' as const,
  },
];

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

const pricingPolicySummary = computed(() => {
  const appliedRate = result.value?.appliedProfitRatePercent;
  if (!canCustomizeProfitRate.value || !hasValue(appliedRate)) {
    return '价格规则由系统自动匹配';
  }
  return result.value?.customProfitRateApplied
    ? `自定义利润率 ${formatProfitRatePercent(appliedRate)}`
    : `规格默认利润率 ${formatProfitRatePercent(appliedRate)}`;
});

const resultContextItems = computed(() => [
  {
    key: 'product',
    label: '成品规格',
    value: formatSpecification(
      result.value?.productLengthMm,
      result.value?.productWidthMm,
      result.value?.productThicknessMm,
    ),
  },
  {
    key: 'recipe',
    label: '配方',
    value:
      [result.value?.recipeCode, result.value?.recipeName]
        .filter(Boolean)
        .join(' · ') || '—',
  },
  {
    key: 'terms',
    label: '报价条件',
    value: `${result.value?.quantity ?? '—'} 条 · ${pricingPolicySummary.value}`,
  },
]);

const laminationLayoutSummary = computed(() => {
  const lamination = result.value?.lamination;
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
  return parts.join(' + ') || '已按订单数量自动排版';
});

const laminationFacts = computed(() => {
  const lamination = result.value?.lamination;
  if (!lamination) return [];
  return [
    {
      key: 'material',
      label: '贴合材料',
      value:
        [lamination.materialCode, lamination.materialName]
          .filter(Boolean)
          .join(' · ') || '—',
    },
    {
      key: 'base-thickness',
      label: '基础TPE厚度',
      value: formatCompactDecimal(lamination.tpeThicknessMm, 'mm', 3),
    },
    {
      key: 'layout',
      label: '卷材排版',
      value: laminationLayoutSummary.value,
    },
    {
      key: 'purchase-length',
      label: '计费购买长度',
      value: formatCompactDecimal(lamination.billableLengthMm, 'mm', 2),
    },
    {
      key: 'net-area',
      label: '净贴合面积',
      value: formatCompactDecimal(
        lamination.productNetAreaSquareMeters,
        '㎡',
        4,
      ),
    },
    {
      key: 'utilization',
      label: '面材利用率',
      value: formatRate(lamination.layoutUtilizationRate),
    },
  ];
});

const productionFacts = computed(() => [
  {
    key: 'classification',
    label: '产品判定',
    value: `${formatSizeClass(result.value?.sizeClass)} · ${formatThicknessClass(
      result.value?.thicknessClass,
    )}`,
  },
  {
    key: 'yield',
    label: '材料合格率',
    value: formatRate(result.value?.materialYieldRate),
  },
  {
    key: 'charge',
    label: '标准投料量',
    value: formatCompactDecimal(result.value?.chargeWeightKg, 'kg', 3),
  },
  {
    key: 'material',
    label: '单片材料用量',
    value: formatCompactDecimal(result.value?.materialKgPerPiece, 'kg/片', 4),
  },
]);

onMounted(loadOptions);
onBeforeUnmount(() => {
  aiAnalysisRequestSeq += 1;
});
</script>

<template>
  <Page title="产品报价" :description="pageDescription">
    <div class="quotation-page">
      <div v-if="quotationModeOptions.length > 1" class="quotation-mode-bar">
        <div class="quotation-mode-copy">
          <div class="quotation-mode-title">报价方式</div>
          <div class="quotation-mode-description">
            单条快速测算，或通过 Excel 一次处理多条规格
          </div>
        </div>
        <Segmented
          :value="activeQuotationMode"
          :options="quotationModeOptions"
          @change="setQuotationMode"
        />
      </div>

      <div v-show="activeQuotationMode === 'single'" class="quotation-layout">
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
                      {{ selectedRecipe.processRouteCode || '未配置工艺路线' }}
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
                    <span v-if="canViewQuoteDetail">
                      批次
                      {{
                        formatCompactDecimal(
                          selectedRecipe.batchWeightKg,
                          'kg',
                          3,
                        )
                      }}
                      /
                      {{
                        formatMoney(selectedRecipe.batchCostYuan)
                      }}，原始公斤成本
                      {{
                        formatCompactDecimal(
                          selectedRecipe.rawUnitCostPerKg,
                          '元/kg',
                          4,
                        )
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

                <FormItem class="span-two" label="产品结构">
                  <RadioGroup
                    v-model:value="formState.productStructure"
                    button-style="solid"
                    option-type="button"
                    :options="productStructureOptions"
                    @change="handleProductStructureChange"
                  />
                </FormItem>

                <FormItem
                  v-if="formState.productStructure === 'LAMINATED'"
                  class="span-two"
                  label="外采贴合材料"
                  name="laminationMaterialId"
                  extra="下拉仅展示卷宽和厚度，采购延米价不在报价页显示"
                >
                  <Select
                    v-model:value="formState.laminationMaterialId"
                    allow-clear
                    option-filter-prop="label"
                    placeholder="请选择贴合材料"
                    show-search
                    :loading="optionsLoading"
                    :options="laminationMaterialOptions"
                  />
                  <Alert
                    v-if="!laminationMaterialOptions.length && !optionsLoading"
                    class="mt-2"
                    show-icon
                    type="warning"
                    message="尚未配置可用的贴合材料"
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

                <Alert
                  v-if="
                    formState.productStructure === 'LAMINATED' &&
                    selectedLaminationMaterial
                  "
                  class="span-two"
                  show-icon
                  :type="
                    baseTpeThicknessPreview !== undefined &&
                    baseTpeThicknessPreview <= 0
                      ? 'error'
                      : 'info'
                  "
                  :message="`成品总厚度扣除 ${formatCompactDecimal(
                    selectedLaminationMaterial.materialThicknessMm,
                    'mm',
                    3,
                  )} 面材后，基础TPE厚度为 ${formatCompactDecimal(
                    baseTpeThicknessPreview,
                    'mm',
                    3,
                  )}`"
                  description="数量会参与固定卷宽排版，未利用的卷宽和末排余料由本订单承担。"
                />
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
                  <div class="section-title">补片、辅料与报价</div>
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

                <FormItem label="计入OPP膜">
                  <div class="switch-field">
                    <Switch v-model:checked="formState.includeOpp" />
                    <span class="switch-hint">
                      {{ formState.includeOpp ? '计入OPP膜成本' : '不计OPP膜' }}
                    </span>
                  </div>
                </FormItem>

                <FormItem label="计入外箱">
                  <div class="switch-field">
                    <Switch v-model:checked="formState.includeCarton" />
                    <span class="switch-hint">
                      {{
                        formState.includeCarton ? '计入外箱成本' : '不计外箱'
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

                <FormItem
                  v-if="canCustomizeProfitRate"
                  class="span-two"
                  label="报价利润率"
                  name="customProfitRatePercent"
                >
                  <div class="profit-rate-control">
                    <div class="profit-rate-row">
                      <RadioGroup
                        v-model:value="formState.profitRateMode"
                        button-style="solid"
                        option-type="button"
                        :options="profitRateModeOptions"
                        @change="handleProfitRateModeChange"
                      />
                      <InputNumber
                        v-if="formState.profitRateMode === 'CUSTOM'"
                        v-model:value="formState.customProfitRatePercent"
                        class="profit-rate-input"
                        string-mode
                        :min="0"
                        :max="99.99"
                        :precision="2"
                        :step="0.01"
                        addon-after="%"
                        placeholder="例如 12.50"
                      />
                      <Button
                        v-if="formState.profitRateMode === 'CUSTOM'"
                        size="small"
                        type="link"
                        @click="restoreDefaultProfitRate"
                      >
                        恢复默认
                      </Button>
                    </div>
                    <div class="profit-rate-hint">
                      <template v-if="formState.profitRateMode === 'DEFAULT'">
                        由服务端按当前规格报价政策自动匹配；完成计算后会显示本次实际采用的利润率。
                      </template>
                      <template v-else>
                        自定义值只影响本次单笔报价，不会修改系统默认规格政策；不得低于该规格的系统超低价利润率，最终以后端校验为准。
                      </template>
                    </div>
                    <div
                      v-if="result && hasValue(result.appliedProfitRatePercent)"
                      class="profit-rate-result"
                    >
                      <Tag
                        :color="
                          result.customProfitRateApplied ? 'purple' : 'blue'
                        "
                      >
                        {{
                          result.customProfitRateApplied
                            ? '本次采用自定义利润率'
                            : '本次采用规格默认利润率'
                        }}
                      </Tag>
                      <span>
                        {{
                          formatProfitRatePercent(
                            result.appliedProfitRatePercent,
                          )
                        }}
                      </span>
                      <span
                        v-if="
                          result.customProfitRateApplied &&
                          hasValue(result.defaultProfitRatePercent)
                        "
                        class="profit-rate-default"
                      >
                        规格默认
                        {{
                          formatProfitRatePercent(
                            result.defaultProfitRatePercent,
                          )
                        }}
                      </span>
                    </div>
                  </div>
                </FormItem>
              </div>
            </div>

            <Alert
              class="mb-4"
              show-icon
              type="info"
              message="成本规则由系统自动解析"
              :description="
                canCustomizeProfitRate
                  ? '配方决定实时KG成本、固定合格率和工艺路线；规格决定默认利润率、大小垫、厚垫及对应工费。自定义利润率只作用于当前单笔报价。'
                  : '配方决定实时KG成本、固定合格率和工艺路线；规格决定利润率、大小垫、厚垫及对应工费。'
              "
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
            <Space>
              <Tag v-if="result" :color="resultStatusColor">
                {{ resultStatusLabel }}
              </Tag>
              <Button
                v-if="result && lastCalculateRequest"
                v-access:code="['fdmcaiwu:quotation:calculate']"
                size="small"
                :loading="aiAnalysisLoading"
                @click="handleAiAnalysis"
              >
                <template #icon>
                  <IconifyIcon icon="lucide:sparkles" />
                </template>
                {{ aiAnalysisResult ? '重新分析' : 'AI分析' }}
              </Button>
            </Space>
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

              <div
                v-if="normalizedResultStatus === 'calculated'"
                class="summary-grid"
              >
                <div class="summary-item quote-summary">
                  <div class="summary-label">常规单价</div>
                  <div class="summary-value">
                    {{ formatMoney(summaryValues.unitQuote.display) }}
                  </div>
                  <div class="summary-caption">
                    不含税 · {{ pricingPolicySummary }}
                  </div>
                  <div class="summary-tax-value">
                    含税（+{{ quotationTaxRateLabel }}）
                    {{
                      formatMoney(summaryValues.unitQuote.taxIncludedDisplay)
                    }}
                  </div>
                </div>
                <div class="summary-item total-summary">
                  <div class="summary-label">常规总价</div>
                  <div class="summary-value">
                    {{ formatMoney(summaryValues.totalQuote.display) }}
                  </div>
                  <div class="summary-caption">
                    不含税 · {{ result.quantity ?? '—' }} 条
                  </div>
                  <div class="summary-tax-value">
                    含税（+{{ quotationTaxRateLabel }}）
                    {{
                      formatMoney(summaryValues.totalQuote.taxIncludedDisplay)
                    }}
                  </div>
                </div>
                <div
                  v-if="
                    canViewUltraLowPrice &&
                    hasValue(result.ultraLowUnitQuoteDisplay)
                  "
                  class="summary-item ultra-summary"
                >
                  <div class="summary-label">超低单价</div>
                  <div class="summary-value">
                    {{ formatMoney(result.ultraLowUnitQuoteDisplay) }}
                  </div>
                  <div class="summary-caption">
                    不含税总价
                    {{ formatMoney(result.ultraLowTotalQuoteDisplay) }}
                  </div>
                  <div class="summary-tax-value">
                    含税（+{{ quotationTaxRateLabel }}）
                    {{
                      formatMoney(
                        resolveResultTaxIncluded(
                          result.ultraLowUnitQuoteDisplay,
                          result.ultraLowUnitQuoteTaxIncludedDisplay,
                        ),
                      )
                    }}
                    <span class="summary-tax-secondary">
                      总价
                      {{
                        formatMoney(
                          resolveResultTaxIncluded(
                            result.ultraLowTotalQuoteDisplay,
                            result.ultraLowTotalQuoteTaxIncludedDisplay,
                          ),
                        )
                      }}
                    </span>
                  </div>
                </div>
                <div
                  v-if="canViewQuoteDetail"
                  class="summary-item cost-summary"
                >
                  <div class="summary-label">单位成本</div>
                  <div class="summary-value">
                    {{ formatMoney(summaryValues.unitCost.display) }}
                  </div>
                  <div class="summary-caption">精确值收纳在计算依据</div>
                </div>
              </div>

              <section
                v-if="
                  aiAnalysisLoading ||
                  aiAnalysisResult ||
                  aiAnalysisMessage ||
                  aiAnalysisError
                "
                class="ai-analysis-panel"
              >
                <div class="ai-analysis-heading">
                  <div>
                    <div class="ai-analysis-title">
                      <IconifyIcon icon="lucide:sparkles" />
                      <span>AI 报价分析</span>
                    </div>
                    <div class="ai-analysis-subtitle">
                      AI 仅解释本次参数、阻断原因和风险，不生成或修改价格
                    </div>
                  </div>
                  <Tag v-if="aiAnalysisStatus" color="processing">
                    {{ aiAnalysisStatusLabel(aiAnalysisStatus) }}
                  </Tag>
                </div>

                <Progress
                  v-if="aiAnalysisLoading"
                  :percent="Math.round(aiAnalysisProgress)"
                  status="active"
                />
                <Alert
                  v-if="aiAnalysisError"
                  class="mt-3"
                  show-icon
                  type="warning"
                  message="AI 分析未完成"
                  :description="aiAnalysisError"
                />
                <Alert
                  v-else-if="aiAnalysisMessage && !aiAnalysisResult"
                  class="mt-3"
                  show-icon
                  type="info"
                  message="AI 分析状态"
                  :description="aiAnalysisMessage"
                />

                <template v-if="aiAnalysisResult">
                  <div class="ai-analysis-summary">
                    <div class="ai-analysis-summary-meta">
                      <Tag :color="aiRiskColor(aiAnalysisResult.riskLevel)">
                        {{ aiRiskLabel(aiAnalysisResult.riskLevel) }}
                      </Tag>
                      <span>
                        置信度
                        {{ formatAiConfidence(aiAnalysisResult.confidence) }}
                      </span>
                    </div>
                    <div class="ai-analysis-summary-text">
                      {{ aiAnalysisResult.summary || '本次分析未返回摘要。' }}
                    </div>
                  </div>

                  <div
                    v-if="aiAnalysisResult.observations?.length"
                    class="ai-analysis-block"
                  >
                    <div class="ai-analysis-block-title">观察项</div>
                    <div class="ai-observation-list">
                      <div
                        v-for="(item, index) in aiAnalysisResult.observations"
                        :key="item.code || `${item.title}-${index}`"
                        class="ai-observation-item"
                      >
                        <div class="ai-observation-heading">
                          <Tag
                            :color="
                              String(item.severity).toUpperCase() === 'WARNING'
                                ? 'warning'
                                : 'blue'
                            "
                          >
                            {{
                              String(item.severity).toUpperCase() === 'WARNING'
                                ? '注意'
                                : '信息'
                            }}
                          </Tag>
                          <strong>{{ item.title || '分析观察' }}</strong>
                        </div>
                        <div class="ai-observation-detail">
                          {{ item.detail || '—' }}
                        </div>
                      </div>
                    </div>
                  </div>

                  <div
                    v-if="aiAnalysisResult.suggestions?.length"
                    class="ai-analysis-block"
                  >
                    <div class="ai-analysis-block-title">建议</div>
                    <ol class="ai-suggestion-list">
                      <li
                        v-for="(item, index) in aiAnalysisResult.suggestions"
                        :key="`${item}-${index}`"
                      >
                        {{ item }}
                      </li>
                    </ol>
                  </div>
                </template>
              </section>

              <Tabs
                v-model:active-key="activeResultTab"
                class="result-tabs"
                :animated="false"
              >
                <Tabs.TabPane key="overview" tab="方案概览">
                  <section class="tab-section">
                    <div class="context-grid">
                      <div
                        v-for="item in resultContextItems"
                        :key="item.key"
                        class="context-item"
                      >
                        <div class="context-label">{{ item.label }}</div>
                        <div class="context-value">{{ item.value }}</div>
                      </div>
                    </div>
                  </section>

                  <AccessoryMatchList
                    v-if="result.accessoryMatches?.length"
                    :matches="result.accessoryMatches"
                    class="mb-4"
                  />

                  <Alert
                    v-if="
                      formState.productStructure === 'LAMINATED' &&
                      !canViewQuoteDetail
                    "
                    class="mb-4"
                    show-icon
                    type="info"
                    message="外采面材已随本次报价计算"
                    :description="`${selectedLaminationMaterial?.materialName || '所选面材'}已按当前 ${result.quantity ?? formState.quantity ?? '—'} 片数量自动排版；详细排版与成本仅超级管理员可查看。`"
                  />

                  <section
                    v-if="canViewQuoteDetail && result.lamination"
                    class="tab-section"
                  >
                    <div class="tab-section-heading">
                      <div>
                        <div class="tab-section-title">外采面材排版</div>
                        <div class="tab-section-subtitle">
                          固定卷宽按当前数量自动组合标准与旋转排版，余料由本订单承担
                        </div>
                      </div>
                    </div>
                    <div class="fact-grid lamination-fact-grid">
                      <div
                        v-for="item in laminationFacts"
                        :key="item.key"
                        class="fact-item"
                      >
                        <span class="fact-label">{{ item.label }}</span>
                        <strong class="fact-value">{{ item.value }}</strong>
                      </div>
                    </div>
                  </section>

                  <section
                    v-if="canViewQuoteDetail && result.lamination"
                    class="tab-section"
                  >
                    <div class="tab-section-heading">
                      <div>
                        <div class="tab-section-title">贴合增量成本</div>
                        <div class="tab-section-subtitle">
                          卷材按计费长度计价；胶水按实际铺料卷材面积计费，不含供应商计费取整的超额部分；贴合人工取材料价格版本并替代旧复合工费
                        </div>
                      </div>
                    </div>
                    <Descriptions bordered :column="2" size="small">
                      <DescriptionsItem label="材料版本">
                        {{ result.lamination.versionCode || '—' }}
                      </DescriptionsItem>
                      <DescriptionsItem label="基础TPE厚度">
                        {{
                          formatCompactDecimal(
                            result.lamination.tpeThicknessMm,
                            'mm',
                            3,
                          )
                        }}
                      </DescriptionsItem>
                      <DescriptionsItem label="面材单片成本">
                        {{
                          formatExactMoney(
                            result.lamination.materialCostPerPiece,
                          )
                        }}
                      </DescriptionsItem>
                      <DescriptionsItem label="面材订单成本">
                        {{
                          formatExactMoney(result.lamination.materialOrderCost)
                        }}
                      </DescriptionsItem>
                      <DescriptionsItem label="热熔胶单片成本">
                        {{
                          formatExactMoney(
                            result.lamination.adhesiveCostPerPiece,
                          )
                        }}
                      </DescriptionsItem>
                      <DescriptionsItem label="热熔胶订单成本">
                        {{
                          formatExactMoney(result.lamination.adhesiveOrderCost)
                        }}
                      </DescriptionsItem>
                      <DescriptionsItem label="复合加工单片">
                        {{
                          formatExactMoney(
                            result.lamination.laminationLaborCostPerPiece,
                          )
                        }}
                      </DescriptionsItem>
                      <DescriptionsItem label="动态费用计入单位成本">
                        {{
                          result.lamination.dynamicCostIncludedInUnitCost
                            ? '是'
                            : '否'
                        }}
                      </DescriptionsItem>
                    </Descriptions>
                  </section>

                  <section class="tab-section">
                    <div class="tab-section-heading">
                      <div>
                        <div class="tab-section-title">工艺路径</div>
                        <div class="tab-section-subtitle">
                          从选模到每板产量，保留本次方案的关键计算链
                        </div>
                      </div>
                    </div>
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

                  <section class="tab-section">
                    <div class="tab-section-title">生产关键指标</div>
                    <div class="fact-grid">
                      <div
                        v-for="item in productionFacts"
                        :key="item.key"
                        class="fact-item"
                      >
                        <span class="fact-label">{{ item.label }}</span>
                        <strong class="fact-value">{{ item.value }}</strong>
                      </div>
                    </div>
                  </section>
                </Tabs.TabPane>

                <Tabs.TabPane
                  v-if="canViewQuoteDetail"
                  key="cost"
                  tab="成本明细"
                >
                  <section class="tab-section">
                    <div class="tab-section-heading">
                      <div>
                        <div class="tab-section-title">单位成本构成</div>
                        <div class="tab-section-subtitle">
                          展示金额用于日常报价，精确金额用于核算复核
                        </div>
                      </div>
                      <Tag>{{ costRows.length }} 项</Tag>
                    </div>
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

                  <section class="tab-section">
                    <div class="tab-section-heading">
                      <div>
                        <div class="tab-section-title">配方原材料</div>
                        <div class="tab-section-subtitle">
                          当前单价来自原材料价格维护，共
                          {{ ingredientCostRows.length }} 项
                        </div>
                      </div>
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
                </Tabs.TabPane>

                <Tabs.TabPane
                  v-if="canViewQuoteDetail"
                  key="moulds"
                  tab="模具比选"
                >
                  <section class="tab-section">
                    <div class="tab-section-heading">
                      <div>
                        <div class="tab-section-title">候选模具方案</div>
                        <div class="tab-section-subtitle">
                          当前方案置顶；可切换任一可行模具并立即重算
                        </div>
                      </div>
                      <Tag>{{ candidateRows.length }} 个</Tag>
                    </div>
                    <Table
                      :columns="candidateColumns"
                      :data-source="candidateRows"
                      :pagination="false"
                      row-key="key"
                      :scroll="{ x: 930 }"
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
                      <template #expandedRowRender="{ record }">
                        <div class="candidate-expanded">
                          <Descriptions
                            size="small"
                            :column="{ xs: 1, sm: 1, md: 2, lg: 2, xl: 2 }"
                          >
                            <DescriptionsItem label="模具尺寸">
                              {{ record.mouldSpecification }}
                            </DescriptionsItem>
                            <DescriptionsItem label="板材尺寸">
                              {{ record.boardSpecification }}
                            </DescriptionsItem>
                            <DescriptionsItem label="层数 / 补片">
                              {{ record.layerSummary }}
                            </DescriptionsItem>
                            <DescriptionsItem label="不可行原因 / 提醒">
                              {{ record.rejectReasonText }}
                            </DescriptionsItem>
                          </Descriptions>
                        </div>
                      </template>
                      <template #emptyText>
                        <Empty description="服务端未返回候选模具" />
                      </template>
                    </Table>
                  </section>
                </Tabs.TabPane>

                <Tabs.TabPane
                  v-if="canViewQuoteDetail"
                  key="audit"
                  tab="计算依据"
                >
                  <div class="audit-intro">
                    日常报价无需展开以下内容；需要核算、追溯或排查时再按项查看。
                  </div>
                  <Collapse class="audit-collapse">
                    <Collapse.Panel key="exact" header="精确金额">
                      <Descriptions bordered :column="1" size="small">
                        <DescriptionsItem label="单位成本精确值">
                          {{ formatExactMoney(summaryValues.unitCost.exact) }}
                        </DescriptionsItem>
                        <DescriptionsItem label="不含税单位报价精确值">
                          {{ formatExactMoney(summaryValues.unitQuote.exact) }}
                        </DescriptionsItem>
                        <DescriptionsItem label="含税单位报价精确值">
                          {{
                            formatExactMoney(
                              summaryValues.unitQuote.taxIncludedExact,
                            )
                          }}
                        </DescriptionsItem>
                        <DescriptionsItem label="不含税报价总额精确值">
                          {{ formatExactMoney(summaryValues.totalQuote.exact) }}
                        </DescriptionsItem>
                        <DescriptionsItem label="含税报价总额精确值">
                          {{
                            formatExactMoney(
                              summaryValues.totalQuote.taxIncludedExact,
                            )
                          }}
                        </DescriptionsItem>
                        <DescriptionsItem label="含税加点">
                          {{ quotationTaxRateLabel }}
                        </DescriptionsItem>
                      </Descriptions>
                    </Collapse.Panel>

                    <Collapse.Panel key="rules" header="本次解析规则与费率">
                      <Descriptions
                        bordered
                        :column="{ xs: 1, sm: 1, md: 2, lg: 3, xl: 3 }"
                        size="small"
                      >
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
                        <DescriptionsItem label="辅料价格来源">
                          {{ result.accessoryPriceSourceVersion || '—' }} ·
                          {{ result.accessoryPriceSourceLocation || '—' }}
                        </DescriptionsItem>
                        <DescriptionsItem label="发泡人工">
                          {{ formatDecimal(result.foamingLaborPerKg, '元/kg') }}
                        </DescriptionsItem>
                        <DescriptionsItem label="开片人工">
                          {{ formatDecimal(result.slicingLaborPerKg, '元/kg') }}
                        </DescriptionsItem>
                        <DescriptionsItem label="费用分摊">
                          {{
                            formatDecimal(result.allocationCostPerKg, '元/kg')
                          }}
                        </DescriptionsItem>
                        <DescriptionsItem label="立切">
                          {{
                            formatDecimal(
                              result.verticalCutCostPerPiece,
                              '元/条',
                            )
                          }}
                        </DescriptionsItem>
                        <DescriptionsItem label="复合">
                          {{
                            formatDecimal(result.compositeCostPerPiece, '元/条')
                          }}
                        </DescriptionsItem>
                        <DescriptionsItem label="压花">
                          {{
                            formatDecimal(result.embossCostPerPiece, '元/条')
                          }}
                        </DescriptionsItem>
                        <DescriptionsItem label="冲床">
                          {{ formatDecimal(result.punchCostPerPiece, '元/条') }}
                        </DescriptionsItem>
                        <DescriptionsItem label="包装人工">
                          {{
                            formatDecimal(result.packingLaborPerPiece, '元/条')
                          }}
                        </DescriptionsItem>
                        <DescriptionsItem label="批量发货">
                          {{
                            formatDecimal(
                              result.batchShippingOperationCostPerPiece,
                              '元/条',
                            )
                          }}
                        </DescriptionsItem>
                        <DescriptionsItem label="OPP膜">
                          {{ formatDecimal(result.oppCostPerPiece, '元/片') }}
                        </DescriptionsItem>
                        <DescriptionsItem label="外箱">
                          {{
                            formatDecimal(result.cartonCostPerPiece, '元/片')
                          }}
                        </DescriptionsItem>
                        <DescriptionsItem label="绑带">
                          {{ formatDecimal(result.strapCostPerPiece, '元/片') }}
                        </DescriptionsItem>
                      </Descriptions>
                    </Collapse.Panel>

                    <Collapse.Panel key="layout" header="选中模具与排版详情">
                      <Descriptions
                        bordered
                        :column="{ xs: 1, sm: 1, md: 2, lg: 3, xl: 3 }"
                        size="small"
                      >
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
                          {{
                            formatLayoutOrientation(result.layoutOrientation)
                          }}
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
                          {{
                            formatDecimal(result.materialKgPerPiece, 'kg/片')
                          }}
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
                            formatDecimal(
                              result.rawMaterialUnitCostPerKg,
                              '元/kg',
                            )
                          }}
                        </DescriptionsItem>
                        <DescriptionsItem label="配方公斤成本">
                          {{
                            formatMaterialUnitCost(result.materialUnitCostPerKg)
                          }}
                        </DescriptionsItem>
                      </Descriptions>
                    </Collapse.Panel>

                    <Collapse.Panel
                      key="steps"
                      :header="`完整计算步骤 (${calculationStepRows.length})`"
                    >
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
                    </Collapse.Panel>

                    <Collapse.Panel key="sources" header="计算口径与数据来源">
                      <Descriptions
                        bordered
                        :column="{ xs: 1, sm: 1, md: 2, lg: 2, xl: 2 }"
                        size="small"
                      >
                        <DescriptionsItem label="配方">
                          {{ result.recipeCode || '—' }} ·
                          {{ result.recipeName || '—' }}
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
                    </Collapse.Panel>
                  </Collapse>
                </Tabs.TabPane>
              </Tabs>
            </div>
          </Spin>
        </Card>
      </div>

      <div
        v-if="batchPanelMounted"
        v-show="activeQuotationMode === 'batch'"
        class="batch-mode-panel"
      >
        <BatchQuotationPanel embedded />
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

.quotation-mode-bar {
  display: flex;
  gap: 20px;
  align-items: center;
  justify-content: space-between;
  padding: 14px 16px;
  margin-bottom: 16px;
  background: var(--ant-color-bg-container, #fff);
  border: 1px solid var(--ant-color-border-secondary, #f0f0f0);
  border-radius: 10px;
}

.quotation-mode-copy {
  min-width: 0;
}

.quotation-mode-title {
  font-size: 14px;
  font-weight: 600;
  color: var(--ant-color-text, #1f1f1f);
}

.quotation-mode-description {
  margin-top: 2px;
  font-size: 12px;
  color: var(--ant-color-text-secondary, #8c8c8c);
}

.batch-mode-panel {
  min-width: 0;
}

.quotation-layout {
  display: grid;
  grid-template-columns: minmax(430px, 0.82fr) minmax(0, 1.55fr);
  gap: 16px;
  align-items: start;
}

.result-card,
.result-content {
  min-width: 0;
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
.tab-section-title {
  font-size: 15px;
  font-weight: 600;
  color: var(--ant-color-text, #1f1f1f);
}

.section-subtitle,
.section-count,
.switch-hint,
.summary-caption,
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

.profit-rate-control {
  padding: 12px;
  background: var(--ant-color-fill-quaternary, #fafafa);
  border: 1px solid var(--ant-color-border-secondary, #f0f0f0);
  border-radius: 8px;
}

.profit-rate-row,
.profit-rate-result {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  align-items: center;
}

.profit-rate-input {
  width: 168px;
}

.profit-rate-hint,
.profit-rate-default {
  font-size: 12px;
  color: var(--ant-color-text-secondary, #8c8c8c);
}

.profit-rate-hint {
  margin-top: 8px;
  line-height: 1.6;
}

.profit-rate-result {
  padding-top: 9px;
  margin-top: 9px;
  font-size: 13px;
  font-weight: 600;
  border-top: 1px dashed var(--ant-color-border-secondary, #f0f0f0);
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
  position: relative;
  min-width: 0;
  padding: 16px 18px;
  overflow: hidden;
  border: 1px solid var(--ant-color-border-secondary, #f0f0f0);
  border-radius: 10px;
}

.cost-summary {
  background: rgb(22 119 255 / 6%);
  border-top: 3px solid var(--ant-color-primary, #1677ff);
}

.quote-summary {
  background: rgb(82 196 26 / 7%);
  border-top: 3px solid #52c41a;
}

.total-summary {
  background: rgb(250 173 20 / 8%);
  border-top: 3px solid #faad14;
}

.summary-label {
  margin-bottom: 6px;
  font-size: 13px;
  color: var(--ant-color-text-secondary, #8c8c8c);
}

.summary-value {
  overflow: hidden;
  text-overflow: ellipsis;
  font-size: clamp(22px, 2vw, 31px);
  font-weight: 650;
  font-variant-numeric: tabular-nums;
  line-height: 1.25;
  color: var(--ant-color-text, #1f1f1f);
  white-space: nowrap;
}

.summary-caption {
  margin-top: 8px;
  overflow-wrap: anywhere;
}

.summary-tax-value {
  margin-top: 8px;
  font-size: 13px;
  font-weight: 600;
  line-height: 1.55;
  color: var(--ant-color-primary, #1677ff);
  overflow-wrap: anywhere;
}

.summary-tax-secondary {
  display: block;
  font-size: 12px;
  font-weight: 400;
  color: var(--ant-color-text-secondary, #8c8c8c);
}

.ultra-summary {
  background: rgb(114 46 209 / 6%);
  border-top: 3px solid #722ed1;
}

.ai-analysis-panel {
  padding: 16px;
  margin-top: 16px;
  background: linear-gradient(
    135deg,
    rgb(114 46 209 / 6%),
    rgb(22 119 255 / 4%)
  );
  border: 1px solid rgb(114 46 209 / 18%);
  border-radius: 10px;
}

.ai-analysis-heading,
.ai-analysis-title,
.ai-analysis-summary-meta,
.ai-observation-heading {
  display: flex;
  gap: 8px;
  align-items: center;
}

.ai-analysis-heading {
  justify-content: space-between;
  margin-bottom: 12px;
}

.ai-analysis-title {
  font-size: 15px;
  font-weight: 600;
  color: var(--ant-color-text, #1f1f1f);
}

.ai-analysis-subtitle,
.ai-analysis-summary-meta,
.ai-observation-detail {
  font-size: 12px;
  color: var(--ant-color-text-secondary, #8c8c8c);
}

.ai-analysis-subtitle {
  margin-top: 3px;
}

.ai-analysis-summary {
  padding: 12px 14px;
  margin-top: 12px;
  background: var(--ant-color-bg-container, #fff);
  border-radius: 8px;
}

.ai-analysis-summary-text {
  margin-top: 9px;
  font-size: 13px;
  line-height: 1.7;
  color: var(--ant-color-text, #1f1f1f);
  overflow-wrap: anywhere;
  white-space: pre-wrap;
}

.ai-analysis-block {
  margin-top: 14px;
}

.ai-analysis-block-title {
  margin-bottom: 8px;
  font-size: 13px;
  font-weight: 600;
}

.ai-observation-list {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
}

.ai-observation-item {
  min-width: 0;
  padding: 10px 12px;
  background: var(--ant-color-bg-container, #fff);
  border: 1px solid var(--ant-color-border-secondary, #f0f0f0);
  border-radius: 8px;
}

.ai-observation-detail {
  margin-top: 7px;
  line-height: 1.6;
  overflow-wrap: anywhere;
  white-space: pre-wrap;
}

.ai-suggestion-list {
  padding: 10px 12px 10px 34px;
  margin: 0;
  font-size: 13px;
  line-height: 1.7;
  background: var(--ant-color-bg-container, #fff);
  border-radius: 8px;
}

.ai-suggestion-list li + li {
  margin-top: 4px;
}

.result-tabs {
  min-width: 0;
  margin-top: 18px;
}

.result-tabs :deep(.ant-tabs-nav) {
  margin-bottom: 16px;
}

.result-tabs :deep(.ant-tabs-tab) {
  padding-top: 8px;
  padding-bottom: 10px;
}

.tab-section + .tab-section {
  margin-top: 24px;
}

.tab-section-heading {
  display: flex;
  gap: 12px;
  align-items: flex-start;
  justify-content: space-between;
  margin-bottom: 12px;
}

.tab-section-subtitle {
  margin-top: 3px;
  font-size: 12px;
  color: var(--ant-color-text-secondary, #8c8c8c);
}

.context-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 10px;
}

.context-item {
  min-width: 0;
  padding: 12px 14px;
  background: var(--ant-color-fill-quaternary, #fafafa);
  border: 1px solid var(--ant-color-border-secondary, #f0f0f0);
  border-radius: 8px;
}

.context-label,
.fact-label {
  font-size: 12px;
  color: var(--ant-color-text-secondary, #8c8c8c);
}

.context-value {
  margin-top: 5px;
  overflow: hidden;
  text-overflow: ellipsis;
  font-size: 13px;
  font-weight: 600;
  line-height: 1.45;
  color: var(--ant-color-text, #1f1f1f);
  overflow-wrap: anywhere;
}

.fact-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 10px;
  margin-top: 10px;
}

.fact-item {
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-width: 0;
  padding: 12px;
  background: var(--ant-color-fill-quaternary, #fafafa);
  border-left: 3px solid var(--ant-color-primary, #1677ff);
  border-radius: 6px;
}

.fact-value {
  font-size: 13px;
  line-height: 1.45;
  color: var(--ant-color-text, #1f1f1f);
  overflow-wrap: anywhere;
}

.process-flow {
  display: grid;
  grid-template-columns: repeat(5, minmax(0, 1fr));
  gap: 10px;
}

.process-stage {
  position: relative;
  min-width: 0;
  min-height: 102px;
  padding: 12px;
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
  margin-top: 7px;
  font-size: 13px;
  font-weight: 600;
  line-height: 1.4;
  color: var(--ant-color-text, #1f1f1f);
  overflow-wrap: anywhere;
}

.process-stage-note {
  margin-top: 5px;
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

.audit-intro {
  padding: 10px 12px;
  margin-bottom: 12px;
  font-size: 12px;
  line-height: 1.6;
  color: var(--ant-color-text-secondary, #595959);
  background: rgb(22 119 255 / 5%);
  border: 1px solid rgb(22 119 255 / 15%);
  border-radius: 8px;
}

.audit-collapse {
  overflow: hidden;
  background: transparent;
  border-color: var(--ant-color-border-secondary, #f0f0f0);
  border-radius: 8px;
}

.audit-collapse :deep(.ant-collapse-header) {
  font-weight: 600;
}

.candidate-expanded {
  padding: 4px 10px;
}

@media (max-width: 1180px) {
  .quotation-layout {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 900px) {
  .ai-observation-list {
    grid-template-columns: 1fr;
  }

  .fact-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .process-flow {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .process-arrow {
    display: none;
  }
}

@media (max-width: 720px) {
  .quotation-mode-bar {
    flex-direction: column;
    align-items: stretch;
  }

  .quotation-mode-bar :deep(.ant-segmented) {
    width: 100%;
  }

  .quotation-mode-bar :deep(.ant-segmented-item) {
    flex: 1;
    text-align: center;
  }

  .form-grid,
  .dimension-grid,
  .cost-grid,
  .context-grid,
  .fact-grid,
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
