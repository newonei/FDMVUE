<script lang="ts" setup>
import type { TableColumnsType, UploadFile } from 'ant-design-vue';
import type { FileType } from 'ant-design-vue/es/upload/interface';

import type { FdmcaiwuBatchQuotationApi } from '#/api/fdmcaiwu/batch-quotation';
import type { FdmcaiwuQuotationApi } from '#/api/fdmcaiwu/quotation';

import { computed, onMounted, reactive, ref } from 'vue';

import { Page } from '@vben/common-ui';
import { IconifyIcon } from '@vben/icons';
import { downloadFileFromBlobPart } from '@vben/utils';

import {
  Alert,
  Button,
  Card,
  Empty,
  InputNumber,
  message,
  Select,
  Spin,
  Statistic,
  Switch,
  Table,
  Tag,
  Upload,
} from 'ant-design-vue';

import {
  calculateBatchQuotation,
  downloadBatchQuotationTemplate,
  exportBatchQuotation,
} from '#/api/fdmcaiwu/batch-quotation';
import { getQuotationOptions } from '#/api/fdmcaiwu/quotation';

import { formatMaterialUnitCost, hasValue } from '../quotation/data';

defineOptions({ name: 'FdmcaiwuBatchQuotation' });

interface BatchFormModel {
  defaultQuantity: number;
  defaultRecipeId?: number;
  includeStrap: boolean;
  includeSupplement: boolean;
}

interface PreviewRow {
  allocationCostPerKg: string;
  auxiliarySubtotalPerPiece: string;
  batchTotalCost: string;
  businessNo: string;
  batchShippingOperationCostPerPiece: string;
  cartonCostPerPiece: string;
  chargeWeightKg: string;
  compositeCostPerPiece: string;
  embossCostPerPiece: string;
  failureReason: string;
  foamingLaborPerKg: string;
  key: string;
  materialCost: string;
  materialUnitCostPerKg: string;
  materialYieldRate: string;
  effectiveWidthMm: string;
  sizeClass: string;
  thicknessClass: string;
  processRouteCode: string;
  processCostRuleVersion: string;
  candidateCount: string;
  currentCost: string;
  currentQuote: string;
  costDifference: string;
  costDifferenceRate: string;
  mould: string;
  oppCostPerPiece: string;
  packingLaborPerPiece: string;
  packingOperationCostPerPiece: string;
  postprocessCost: string;
  preprocessCost: string;
  preprocessCostPerKg: string;
  punchCostPerPiece: string;
  quantity: string;
  recipe: string;
  rowNo: number;
  remarks: string;
  slicingLaborPerKg: string;
  specification: string;
  status: 'FAILED' | 'SUCCESS';
  strapCostPerPiece: string;
  totalCost: string;
  totalPiecesPerBoard: string;
  verticalCutCostPerPiece: string;
  warnings: string;
  unitQuote: string;
}

const MAX_FILE_SIZE = 20 * 1024 * 1024;
const ACCEPTED_EXTENSIONS = ['.xls', '.xlsx'];

const optionsLoading = ref(false);
const calculating = ref(false);
const exporting = ref(false);
const templateDownloading = ref(false);
const selectedFile = ref<File>();
const result = ref<FdmcaiwuBatchQuotationApi.CalculateResult>();
const calculatedSignature = ref('');
const optionsError = ref('');
const requestError = ref('');
const quotationOptions = ref<FdmcaiwuQuotationApi.Options>({
  costDefaults: undefined,
  mouldProfiles: [],
  profitModes: [],
  recipes: [],
});

const formState = reactive<BatchFormModel>({
  defaultQuantity: 1,
  defaultRecipeId: undefined,
  includeStrap: false,
  includeSupplement: false,
});

function isRecipeCostAvailable(recipe?: FdmcaiwuQuotationApi.RecipeOption) {
  if (!recipe || recipe.costBlockReasons?.length) return false;
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

const recipeSelectOptions = computed(() =>
  quotationOptions.value.recipes.map((item) => {
    const available = isRecipeCostAvailable(item);
    return {
      disabled: !available,
      label: `${item.recipeCode} · ${item.recipeName} · ${
        available ? formatMaterialUnitCost(item.unitCostPerKg) : '成本不可用'
      }`,
      title: available
        ? undefined
        : item.costBlockReasons?.join('；') || '配方原材料成本不可用',
      value: item.id,
    };
  }),
);

const selectedFileList = computed<UploadFile[]>(() =>
  selectedFile.value
    ? [
        {
          name: selectedFile.value.name,
          size: selectedFile.value.size,
          status: 'done',
          uid: `${selectedFile.value.name}-${selectedFile.value.lastModified}`,
        },
      ]
    : [],
);

function buildOptions(): FdmcaiwuBatchQuotationApi.CalculateOptions {
  const options: FdmcaiwuBatchQuotationApi.CalculateOptions = {
    defaultQuantity: formState.defaultQuantity,
    defaultRecipeId: formState.defaultRecipeId,
    includeStrap: formState.includeStrap,
    includeSupplement: formState.includeSupplement,
    profitMode: 'GROSS_MARGIN',
    profitRate: 0,
  };
  return options;
}

function getCurrentSignature() {
  const file = selectedFile.value;
  if (!file) return '';
  return JSON.stringify({
    file: [file.name, file.size, file.lastModified],
    options: buildOptions(),
  });
}

const resultIsStale = computed(
  () =>
    Boolean(result.value) &&
    calculatedSignature.value !== getCurrentSignature(),
);

function toFiniteNumber(value: unknown) {
  if (!hasValue(value)) return undefined;
  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? numberValue : undefined;
}

function formatNumber(value: unknown, maximumFractionDigits = 4) {
  const numberValue = toFiniteNumber(value);
  if (numberValue === undefined) return '—';
  return numberValue.toLocaleString('zh-CN', {
    maximumFractionDigits,
    minimumFractionDigits: 0,
    useGrouping: false,
  });
}

function formatMoney(value: unknown) {
  const numberValue = toFiniteNumber(value);
  if (numberValue === undefined) return '—';
  return numberValue.toLocaleString('zh-CN', {
    maximumFractionDigits: 2,
    minimumFractionDigits: 2,
    useGrouping: false,
  });
}

function formatRate(value: unknown) {
  const numberValue = toFiniteNumber(value);
  if (numberValue === undefined) return '—';
  const percentage = numberValue <= 1 ? numberValue * 100 : numberValue;
  return `${formatNumber(percentage, 2)}%`;
}

function formatSizeClass(value: unknown) {
  if (value === 'SMALL') return '小垫';
  if (value === 'LARGE') return '大垫';
  return hasValue(value) ? String(value) : '—';
}

function formatThicknessClass(value: unknown) {
  if (value === 'NORMAL') return '普通';
  if (value === 'THICK') return '厚垫';
  return hasValue(value) ? String(value) : '—';
}

function firstValue(
  row: FdmcaiwuBatchQuotationApi.ResultRow,
  ...fields: string[]
) {
  return fields.map((field) => row[field]).find(hasValue);
}

function joinMessages(value: unknown) {
  if (Array.isArray(value)) return value.filter((item) => Boolean(item)).join('；');
  return hasValue(value) ? String(value) : '';
}

function isSuccessRow(row: FdmcaiwuBatchQuotationApi.ResultRow) {
  if (typeof row.success === 'boolean') return row.success;
  return ['calculated', 'ok', 'succeeded', 'success'].includes(
    String(row.status ?? '').toLowerCase(),
  );
}

const previewRows = computed<PreviewRow[]>(() =>
  (result.value?.rows ?? []).map((row, index) => {
    const rowNo = Number(row.rowNumber ?? index + 1);
    const success = isSuccessRow(row);
    const length = firstValue(row, 'productLengthMm', 'lengthMm');
    const width = firstValue(row, 'productWidthMm', 'widthMm');
    const thickness = firstValue(row, 'productThicknessMm', 'thicknessMm');
    const fallbackSpecification = [length, width, thickness].every(hasValue)
      ? `${length} × ${width} × ${thickness} mm`
      : '—';
    const recipe = [row.recipeCode, row.recipeName]
      .filter((item) => Boolean(item))
      .join(' · ');
    const mould = [row.mouldProfileCode, row.mouldProfileName]
      .filter((item) => Boolean(item))
      .join(' · ');
    return {
      allocationCostPerKg: formatMoney(firstValue(row, 'allocationCostPerKg')),
      auxiliarySubtotalPerPiece: formatMoney(
        firstValue(row, 'auxiliarySubtotalPerPiece'),
      ),
      batchTotalCost: formatMoney(firstValue(row, 'batchTotalCost')),
      businessNo: String(firstValue(row, 'businessNo') ?? '—'),
      batchShippingOperationCostPerPiece: formatMoney(
        firstValue(
          row,
          'batchShippingOperationCostPerPiece',
          'batchShippingCost',
        ),
      ),
      cartonCostPerPiece: formatMoney(firstValue(row, 'cartonCostPerPiece')),
      chargeWeightKg: formatNumber(firstValue(row, 'chargeWeightKg')),
      compositeCostPerPiece: formatMoney(
        firstValue(row, 'compositeCostPerPiece', 'compositeCost'),
      ),
      candidateCount: formatNumber(firstValue(row, 'candidateCount'), 0),
      costDifference: formatMoney(firstValue(row, 'costDifference')),
      costDifferenceRate: formatRate(firstValue(row, 'costDifferenceRate')),
      currentCost: formatMoney(firstValue(row, 'currentCost')),
      currentQuote: formatMoney(firstValue(row, 'currentQuote')),
      effectiveWidthMm: formatNumber(firstValue(row, 'effectiveWidthMm'), 2),
      embossCostPerPiece: formatMoney(
        firstValue(row, 'embossCostPerPiece', 'embossCost'),
      ),
      failureReason:
        joinMessages(
          firstValue(row, 'failureReason', 'errorMessage', 'blockReasons'),
        ) || (success ? '' : '计算失败'),
      foamingLaborPerKg: formatMoney(firstValue(row, 'foamingLaborPerKg')),
      key: `${rowNo}-${index}`,
      materialCost: formatMoney(firstValue(row, 'materialCost')),
      materialUnitCostPerKg: formatMoney(
        firstValue(row, 'materialUnitCostPerKg', 'kgUnitPrice'),
      ),
      materialYieldRate: formatRate(firstValue(row, 'materialYieldRate')),
      mould: mould || '—',
      oppCostPerPiece: formatMoney(firstValue(row, 'oppCostPerPiece')),
      packingLaborPerPiece: formatMoney(
        firstValue(row, 'packingLaborPerPiece', 'packingLaborCost'),
      ),
      packingOperationCostPerPiece: formatMoney(
        firstValue(
          row,
          'packingOperationSubtotalPerPiece',
          'packingOperationCostPerPiece',
          'packingCostSubtotal',
        ),
      ),
      postprocessCost: formatMoney(
        firstValue(row, 'postprocessSubtotalPerPiece', 'postprocessCost'),
      ),
      preprocessCost: formatMoney(
        firstValue(row, 'preprocessCostPerPiece', 'preprocessCost'),
      ),
      preprocessCostPerKg: formatMoney(
        firstValue(
          row,
          'preprocessSubtotalPerKg',
          'preprocessCostPerKg',
          'preprocessUnitCostPerKg',
        ),
      ),
      processRouteCode: String(firstValue(row, 'processRouteCode') ?? '—'),
      processCostRuleVersion: String(
        firstValue(row, 'processCostRuleVersion') ?? '—',
      ),
      punchCostPerPiece: formatMoney(
        firstValue(row, 'punchCostPerPiece', 'punchCost'),
      ),
      quantity: formatNumber(firstValue(row, 'quantity'), 0),
      recipe: recipe || '—',
      remarks: String(firstValue(row, 'remarks') ?? '—'),
      rowNo,
      slicingLaborPerKg: formatMoney(firstValue(row, 'slicingLaborPerKg')),
      sizeClass: formatSizeClass(firstValue(row, 'sizeClass')),
      specification: String(row.specification || fallbackSpecification),
      status: success ? 'SUCCESS' : 'FAILED',
      strapCostPerPiece: formatMoney(firstValue(row, 'strapCostPerPiece')),
      totalCost: formatMoney(
        firstValue(
          row,
          'unitCostPerPiece',
          'totalCost',
          'unitCostDisplay',
          'unitCostExact',
        ),
      ),
      totalPiecesPerBoard: formatNumber(
        firstValue(row, 'totalPiecesPerBoard', 'slicingPieceCount'),
        0,
      ),
      thicknessClass: formatThicknessClass(firstValue(row, 'thicknessClass')),
      verticalCutCostPerPiece: formatMoney(
        firstValue(row, 'verticalCutCostPerPiece', 'verticalCutCost'),
      ),
      warnings: joinMessages(row.warnings),
      unitQuote: formatMoney(firstValue(row, 'unitQuote')),
    };
  }),
);

const previewColumns: TableColumnsType<PreviewRow> = [
  { dataIndex: 'rowNo', fixed: 'left', key: 'rowNo', title: '行号', width: 70 },
  { dataIndex: 'businessNo', key: 'businessNo', title: '业务编号', width: 130 },
  {
    dataIndex: 'status',
    fixed: 'left',
    key: 'status',
    title: '状态',
    width: 80,
  },
  {
    dataIndex: 'specification',
    fixed: 'left',
    key: 'specification',
    title: '规格',
    width: 180,
  },
  { dataIndex: 'recipe', key: 'recipe', title: '配方', width: 210 },
  { dataIndex: 'quantity', key: 'quantity', title: '数量', width: 80 },
  {
    dataIndex: 'effectiveWidthMm',
    key: 'effectiveWidthMm',
    title: '有效宽度(mm)',
    width: 120,
  },
  { dataIndex: 'sizeClass', key: 'sizeClass', title: '大小垫', width: 85 },
  {
    dataIndex: 'thicknessClass',
    key: 'thicknessClass',
    title: '厚度分类',
    width: 90,
  },
  {
    dataIndex: 'processRouteCode',
    key: 'processRouteCode',
    title: '工艺路线',
    width: 140,
  },
  {
    dataIndex: 'processCostRuleVersion',
    key: 'processCostRuleVersion',
    title: '工费规则版本',
    width: 130,
  },
  {
    dataIndex: 'candidateCount',
    key: 'candidateCount',
    title: '候选模具数',
    width: 105,
  },
  { dataIndex: 'mould', key: 'mould', title: '最低成本可行模具', width: 220 },
  {
    dataIndex: 'materialUnitCostPerKg',
    key: 'materialUnitCostPerKg',
    title: 'KG单价',
    width: 105,
  },
  {
    dataIndex: 'chargeWeightKg',
    key: 'chargeWeightKg',
    title: '装模量(kg)',
    width: 110,
  },
  {
    dataIndex: 'totalPiecesPerBoard',
    key: 'totalPiecesPerBoard',
    title: '开片条数',
    width: 100,
  },
  {
    dataIndex: 'materialYieldRate',
    key: 'materialYieldRate',
    title: '合格率',
    width: 90,
  },
  {
    dataIndex: 'materialCost',
    key: 'materialCost',
    title: '材料价格',
    width: 100,
  },
  {
    dataIndex: 'foamingLaborPerKg',
    key: 'foamingLaborPerKg',
    title: '发泡KG人工单价',
    width: 140,
  },
  {
    dataIndex: 'slicingLaborPerKg',
    key: 'slicingLaborPerKg',
    title: '开片人工KG单价',
    width: 140,
  },
  {
    dataIndex: 'allocationCostPerKg',
    key: 'allocationCostPerKg',
    title: '费用分摊(KG单价)',
    width: 150,
  },
  {
    dataIndex: 'preprocessCostPerKg',
    key: 'preprocessCostPerKg',
    title: '前加工费用小计',
    width: 135,
  },
  {
    dataIndex: 'preprocessCost',
    key: 'preprocessCost',
    title: '前加工费用折算',
    width: 135,
  },
  {
    dataIndex: 'verticalCutCostPerPiece',
    key: 'verticalCutCostPerPiece',
    title: '立切',
    width: 85,
  },
  {
    dataIndex: 'compositeCostPerPiece',
    key: 'compositeCostPerPiece',
    title: '复合加工',
    width: 100,
  },
  {
    dataIndex: 'embossCostPerPiece',
    key: 'embossCostPerPiece',
    title: '压花(送片+接片)',
    width: 145,
  },
  {
    dataIndex: 'punchCostPerPiece',
    key: 'punchCostPerPiece',
    title: '冲床',
    width: 85,
  },
  {
    dataIndex: 'postprocessCost',
    key: 'postprocessCost',
    title: '小计',
    width: 90,
  },
  {
    dataIndex: 'packingLaborPerPiece',
    key: 'packingLaborPerPiece',
    title: '包装人工/条',
    width: 115,
  },
  {
    dataIndex: 'batchShippingOperationCostPerPiece',
    key: 'batchShippingOperationCostPerPiece',
    title: '批量发货',
    width: 100,
  },
  {
    dataIndex: 'packingOperationCostPerPiece',
    key: 'packingOperationCostPerPiece',
    title: '包装费用小计',
    width: 125,
  },
  {
    dataIndex: 'oppCostPerPiece',
    key: 'oppCostPerPiece',
    title: 'OPP袋',
    width: 90,
  },
  {
    dataIndex: 'cartonCostPerPiece',
    key: 'cartonCostPerPiece',
    title: '纸箱',
    width: 90,
  },
  {
    dataIndex: 'strapCostPerPiece',
    key: 'strapCostPerPiece',
    title: '绑带',
    width: 90,
  },
  {
    dataIndex: 'auxiliarySubtotalPerPiece',
    key: 'auxiliarySubtotalPerPiece',
    title: '辅料小计',
    width: 105,
  },
  {
    dataIndex: 'totalCost',
    key: 'totalCost',
    title: '总计成本',
    width: 110,
  },
  {
    dataIndex: 'currentCost',
    key: 'currentCost',
    title: '现有成本',
    width: 105,
  },
  {
    dataIndex: 'costDifference',
    key: 'costDifference',
    title: '成本差额',
    width: 105,
  },
  {
    dataIndex: 'costDifferenceRate',
    key: 'costDifferenceRate',
    title: '差异率',
    width: 95,
  },
  {
    dataIndex: 'currentQuote',
    key: 'currentQuote',
    title: '现有报价',
    width: 105,
  },
  {
    dataIndex: 'unitQuote',
    key: 'unitQuote',
    title: '建议报价',
    width: 105,
  },
  {
    dataIndex: 'batchTotalCost',
    key: 'batchTotalCost',
    title: '批量总成本',
    width: 120,
  },
  { dataIndex: 'remarks', key: 'remarks', title: '备注', width: 180 },
  {
    dataIndex: 'failureReason',
    fixed: 'right',
    key: 'failureReason',
    title: '失败原因/提醒',
    width: 260,
  },
];

function validateFile(file: File) {
  const lowerName = file.name.toLowerCase();
  if (!ACCEPTED_EXTENSIONS.some((extension) => lowerName.endsWith(extension))) {
    message.error('仅支持 .xlsx 或 .xls 文件');
    return false;
  }
  if (file.size > MAX_FILE_SIZE) {
    message.error('Excel 文件不能超过 20MB');
    return false;
  }
  return true;
}

function handleBeforeUpload(file: FileType) {
  if (!validateFile(file)) return Upload.LIST_IGNORE;
  selectedFile.value = file;
  result.value = undefined;
  calculatedSignature.value = '';
  requestError.value = '';
  return false;
}

function handleRemoveFile() {
  selectedFile.value = undefined;
  result.value = undefined;
  calculatedSignature.value = '';
  requestError.value = '';
}

function validateForm() {
  if (!selectedFile.value) return '请先选择需要导入的 Excel 文件';
  if (
    !Number.isInteger(formState.defaultQuantity) ||
    formState.defaultQuantity <= 0
  ) {
    return '默认数量必须为大于 0 的整数';
  }
  return '';
}

async function loadOptions() {
  optionsLoading.value = true;
  optionsError.value = '';
  try {
    const data = await getQuotationOptions();
    quotationOptions.value = {
      costDefaults: data?.costDefaults,
      mouldProfiles: data?.mouldProfiles ?? [],
      profitModes: data?.profitModes ?? [],
      recipes: data?.recipes ?? [],
    };
    const defaults = data?.costDefaults;
    formState.includeStrap = defaults?.includeStrap ?? false;
    formState.includeSupplement = defaults?.includeSupplement ?? false;
    const defaultRecipe = data?.recipes?.find(
      (recipe) => String(recipe.id) === String(defaults?.recipeId),
    );
    formState.defaultRecipeId = isRecipeCostAvailable(defaultRecipe)
      ? defaultRecipe?.id
      : data?.recipes?.find((recipe) => isRecipeCostAvailable(recipe))?.id;
  } catch (error) {
    optionsError.value =
      error instanceof Error ? error.message : '报价选项加载失败';
  } finally {
    optionsLoading.value = false;
  }
}

async function handleDownloadTemplate() {
  templateDownloading.value = true;
  try {
    const blob = await downloadBatchQuotationTemplate();
    downloadFileFromBlobPart({
      fileName: '瑜伽垫批量报价导入模板.xlsx',
      source: blob,
    });
    message.success('导入模板已下载');
  } finally {
    templateDownloading.value = false;
  }
}

async function handleCalculate() {
  const errorMessage = validateForm();
  if (errorMessage) {
    message.warning(errorMessage);
    return;
  }
  const file = selectedFile.value;
  if (!file) return;
  calculating.value = true;
  requestError.value = '';
  result.value = undefined;
  try {
    const data = await calculateBatchQuotation(file, buildOptions());
    result.value = {
      calculationBatchId: data?.calculationBatchId ?? '',
      failedCount: data?.failedCount ?? 0,
      rows: data?.rows ?? [],
      successCount: data?.successCount ?? 0,
      totalCount: data?.totalCount ?? data?.rows?.length ?? 0,
    };
    calculatedSignature.value = getCurrentSignature();
    if (result.value.failedCount) {
      message.warning(
        `计算完成：成功 ${result.value.successCount} 条，失败 ${result.value.failedCount} 条`,
      );
    } else {
      message.success(`已完成 ${result.value.successCount} 条规格计算`);
    }
  } catch (error) {
    requestError.value =
      error instanceof Error ? error.message : '批量计算失败';
  } finally {
    calculating.value = false;
  }
}

async function handleExport() {
  if (!result.value || resultIsStale.value) {
    message.warning('请先使用当前文件和参数重新计算');
    return;
  }
  if (!result.value.calculationBatchId) {
    message.warning('服务端未返回计算批次号，无法保证导出与预览一致');
    return;
  }
  exporting.value = true;
  try {
    const blob = await exportBatchQuotation(result.value.calculationBatchId);
    const date = new Date();
    const stamp = `${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, '0')}${String(date.getDate()).padStart(2, '0')}`;
    downloadFileFromBlobPart({
      fileName: `瑜伽垫批量报价结果_${stamp}.xlsx`,
      source: blob,
    });
    message.success('报价结果已导出');
  } finally {
    exporting.value = false;
  }
}

function handleResetParameters() {
  Object.assign(formState, {
    defaultQuantity: 1,
    defaultRecipeId: undefined,
    includeStrap: false,
    includeSupplement: false,
  });
  const defaults = quotationOptions.value.costDefaults;
  formState.includeStrap = defaults?.includeStrap ?? false;
  formState.includeSupplement = defaults?.includeSupplement ?? false;
  const defaultRecipe = quotationOptions.value.recipes.find(
    (recipe) => String(recipe.id) === String(defaults?.recipeId),
  );
  formState.defaultRecipeId = isRecipeCostAvailable(defaultRecipe)
    ? defaultRecipe?.id
    : quotationOptions.value.recipes.find(isRecipeCostAvailable)?.id;
}

onMounted(loadOptions);
</script>

<template>
  <Page
    title="批量报价"
    description="从 Excel 导入规格，逐行自动选择总计成本最低的可行模具，并导出完整工艺与成本明细。"
  >
    <div class="batch-page">
      <Alert
        class="mb-4"
        show-icon
        type="info"
        message="计算口径"
        description="Excel 中的配方或数量留空时使用下方全局默认值；每条规格都会遍历可用模具并选择单位总成本最低的可行方案。"
      />

      <Alert
        v-if="optionsError"
        class="mb-4"
        show-icon
        type="error"
        message="报价基础数据加载失败"
        :description="optionsError"
      >
        <template #action>
          <Button size="small" @click="loadOptions">重试</Button>
        </template>
      </Alert>

      <div class="setup-grid">
        <Card :bordered="false" title="1. 导入规格 Excel">
          <div class="upload-actions">
            <Button
              v-access:code="['fdmcaiwu:batch-quotation:query']"
              :loading="templateDownloading"
              @click="handleDownloadTemplate"
            >
              <template #icon>
                <IconifyIcon icon="lucide:download" />
              </template>
              下载导入模板
            </Button>
            <span class="hint">支持 .xlsx / .xls，最大 20MB</span>
          </div>

          <Upload.Dragger
            accept=".xlsx,.xls"
            :before-upload="handleBeforeUpload"
            :file-list="selectedFileList"
            :max-count="1"
            @remove="handleRemoveFile"
          >
            <p class="ant-upload-drag-icon">
              <IconifyIcon class="upload-icon" icon="lucide:sheet" />
            </p>
            <p class="ant-upload-text">点击或拖拽 Excel 到这里</p>
            <p class="ant-upload-hint">
              新文件会替换当前文件，服务端将校验标题和每一行规格
            </p>
          </Upload.Dragger>

          <Alert
            v-if="selectedFile"
            class="mt-4"
            show-icon
            type="success"
            message="已选择导入文件"
            :description="`${selectedFile.name} · ${(selectedFile.size / 1024).toFixed(1)} KB`"
          />
        </Card>

        <Card :bordered="false" title="2. 默认参数">
          <Spin :spinning="optionsLoading">
            <div class="parameter-grid">
              <div class="field span-two">
                <label>默认配方（可选）</label>
                <Select
                  v-model:value="formState.defaultRecipeId"
                  allow-clear
                  class="w-full"
                  :disabled="optionsLoading"
                  :options="recipeSelectOptions"
                  placeholder="Excel 配方为空时使用"
                  show-search
                  :filter-option="
                    (input, option) =>
                      String(option?.label ?? '')
                        .toLowerCase()
                        .includes(input.toLowerCase())
                  "
                />
              </div>

              <div class="field">
                <label>默认数量</label>
                <InputNumber
                  v-model:value="formState.defaultQuantity"
                  class="w-full"
                  :min="1"
                  :precision="0"
                />
              </div>

              <div class="switch-field">
                <Switch v-model:checked="formState.includeSupplement" />
                <span>剩余厚度允许补片</span>
              </div>
              <div class="switch-field">
                <Switch v-model:checked="formState.includeStrap" />
                <span>计入绑带成本</span>
              </div>
            </div>

            <Alert
              class="mt-4"
              show-icon
              type="info"
              message="逐行自动解析成本规则"
              description="Excel 每一行都按自己的配方读取KG成本、固定合格率与工艺路线，再按规格解析大小垫和厚垫工费；这里不再设置全批统一合格率或加工费。"
            />

            <div class="setup-actions">
              <Button @click="handleResetParameters">恢复默认参数</Button>
              <Button
                v-access:code="['fdmcaiwu:batch-quotation:calculate']"
                type="primary"
                :disabled="optionsLoading"
                :loading="calculating"
                @click="handleCalculate"
              >
                <template #icon>
                  <IconifyIcon icon="lucide:calculator" />
                </template>
                预检并批量计算
              </Button>
            </div>
          </Spin>
        </Card>
      </div>

      <Card class="result-card" :bordered="false">
        <template #title>
          <div class="card-title">
            <IconifyIcon icon="lucide:table-properties" />
            <span>工艺与报价结果</span>
          </div>
        </template>
        <template #extra>
          <Button
            v-access:code="['fdmcaiwu:batch-quotation:export']"
            type="primary"
            :disabled="
              !result?.calculationBatchId || resultIsStale || calculating
            "
            :loading="exporting"
            @click="handleExport"
          >
            <template #icon>
              <IconifyIcon icon="lucide:file-down" />
            </template>
            导出结果 Excel
          </Button>
        </template>

        <Alert
          v-if="requestError"
          class="mb-4"
          show-icon
          type="error"
          message="批量报价未完成"
          :description="requestError"
        />
        <Alert
          v-if="resultIsStale"
          class="mb-4"
          show-icon
          type="warning"
          message="文件或参数已变更"
          description="当前预览是旧参数结果，请重新计算后再导出。"
        />

        <Spin :spinning="calculating" tip="正在逐条比较可行模具并计算成本…">
          <Empty
            v-if="!result && !requestError"
            class="result-empty"
            description="导入规格并点击批量计算后，在这里预览结果"
          />

          <template v-else-if="result">
            <div class="summary-grid">
              <Statistic
                title="导入规格"
                :value="result.totalCount"
                suffix="条"
              />
              <Statistic
                class="success-statistic"
                title="计算成功"
                :value="result.successCount"
                suffix="条"
              />
              <Statistic
                class="failed-statistic"
                title="计算失败"
                :value="result.failedCount"
                suffix="条"
              />
            </div>

            <Alert
              v-if="result.calculationBatchId"
              class="mb-4"
              show-icon
              type="success"
              message="计算快照已冻结"
              :description="`批次号：${result.calculationBatchId}。导出将直接读取本批次快照，不会因原材料价格或工费规则更新而漂移。`"
            />

            <Table
              bordered
              :columns="previewColumns"
              :data-source="previewRows"
              :pagination="{ defaultPageSize: 50, showSizeChanger: true }"
              row-key="key"
              size="small"
              :scroll="{ x: 4300, y: 600 }"
            >
              <template #bodyCell="{ column, record }">
                <template v-if="column.key === 'status'">
                  <Tag
                    :color="record.status === 'SUCCESS' ? 'success' : 'error'"
                  >
                    {{ record.status === 'SUCCESS' ? '成功' : '失败' }}
                  </Tag>
                </template>
                <template v-else-if="column.key === 'failureReason'">
                  <span
                    :class="{
                      'failure-text': record.status === 'FAILED',
                      'warning-text': record.warnings,
                    }"
                  >
                    {{ record.failureReason || record.warnings || '—' }}
                  </span>
                </template>
              </template>
              <template #emptyText>
                <Empty description="服务端未返回规格结果" />
              </template>
            </Table>
          </template>
        </Spin>
      </Card>
    </div>
  </Page>
</template>

<style scoped>
.batch-page {
  width: 100%;
  max-width: 1880px;
  margin: 0 auto;
}

.setup-grid {
  display: grid;
  grid-template-columns: minmax(420px, 0.8fr) minmax(560px, 1.2fr);
  gap: 16px;
  align-items: start;
}

.upload-actions,
.setup-actions,
.card-title,
.switch-field {
  display: flex;
  gap: 10px;
  align-items: center;
}

.upload-actions {
  justify-content: space-between;
  margin-bottom: 16px;
}

.hint {
  font-size: 12px;
  color: var(--ant-color-text-secondary, #8c8c8c);
}

.upload-icon {
  font-size: 46px;
  color: var(--ant-color-primary, #1677ff);
}

.parameter-grid,
.cost-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 14px;
}

.field label {
  display: block;
  margin-bottom: 6px;
  font-size: 13px;
  color: var(--ant-color-text-secondary, #595959);
}

.span-two {
  grid-column: 1 / -1;
}

.switch-field {
  min-height: 56px;
  padding-top: 20px;
}

.cost-collapse {
  margin-top: 14px;
  border-top: 1px solid var(--ant-color-border-secondary, #f0f0f0);
}

.cost-group + .cost-group {
  margin-top: 18px;
}

.cost-group-title {
  padding-bottom: 7px;
  margin-bottom: 10px;
  font-size: 13px;
  font-weight: 600;
  color: var(--ant-color-text, #1f1f1f);
  border-bottom: 1px dashed var(--ant-color-border-secondary, #f0f0f0);
}

.setup-actions {
  justify-content: flex-end;
  padding-top: 16px;
  margin-top: 10px;
  border-top: 1px solid var(--ant-color-border-secondary, #f0f0f0);
}

.result-card {
  margin-top: 16px;
}

.result-empty {
  display: flex;
  flex-direction: column;
  justify-content: center;
  min-height: 360px;
}

.summary-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 12px;
  margin-bottom: 18px;
}

.summary-grid :deep(.ant-statistic) {
  padding: 16px;
  background: var(--ant-color-fill-quaternary, #fafafa);
  border: 1px solid var(--ant-color-border-secondary, #f0f0f0);
  border-radius: 8px;
}

.success-statistic :deep(.ant-statistic-content) {
  color: var(--ant-color-success, #52c41a);
}

.failed-statistic :deep(.ant-statistic-content) {
  color: var(--ant-color-error, #ff4d4f);
}

.failure-text {
  color: var(--ant-color-error, #ff4d4f);
}

.warning-text:not(.failure-text) {
  color: var(--ant-color-warning, #faad14);
}

@media (max-width: 1200px) {
  .setup-grid {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 720px) {
  .parameter-grid,
  .cost-grid,
  .summary-grid {
    grid-template-columns: 1fr;
  }

  .span-two {
    grid-column: auto;
  }

  .upload-actions,
  .setup-actions {
    flex-direction: column;
    align-items: stretch;
  }
}
</style>
