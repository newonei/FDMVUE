<script lang="ts" setup>
import type { FormInstance } from 'ant-design-vue';
import type { Rule } from 'ant-design-vue/es/form';
import type { ColumnsType } from 'ant-design-vue/es/table';

import type { VbenFormSchema } from '#/adapter/form';
import type { VxeTableGridOptions } from '#/adapter/vxe-table';
import type { FdmcaiwuRawMaterialApi } from '#/api/fdmcaiwu/raw-material';
import type { FdmcaiwuRecipeApi } from '#/api/fdmcaiwu/recipe';

import { computed, nextTick, reactive, ref } from 'vue';

import { Page } from '@vben/common-ui';
import { IconifyIcon } from '@vben/icons';

import {
  Alert,
  Button,
  Descriptions,
  DescriptionsItem,
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
  Tooltip,
} from 'ant-design-vue';

import { useVbenVxeGrid } from '#/adapter/vxe-table';
import { getRawMaterialPage } from '#/api/fdmcaiwu/raw-material';
import {
  createRecipe,
  deleteRecipe,
  getRecipe,
  getRecipePage,
  updateRecipe,
} from '#/api/fdmcaiwu/recipe';

defineOptions({ name: 'FdmcaiwuRecipe' });

const PRODUCT_TYPE_OPTIONS = [
  { label: '常规', value: 'REGULAR' },
  { label: '轻羽', value: 'LIGHT' },
  { label: '高弹', value: 'ELASTIC' },
  { label: '超弹', value: 'SUPER_ELASTIC' },
];

const ENABLED_OPTIONS = [
  { label: '启用', value: true },
  { label: '停用', value: false },
];

const CATEGORY_LABELS: Record<string, string> = {
  ADDITIVE: '小料',
  COLOR_MASTER: '色母',
  MAIN: '主材料',
};

interface IngredientEditRow {
  key: number;
  rawMaterialId?: number;
  sort: number;
  usageWeightKg?: FdmcaiwuRecipeApi.DecimalValue;
}

interface EditFormModel {
  densityType: string;
  enabled: boolean;
  id?: number;
  ingredients: IngredientEditRow[];
  materialYieldRatePercent?: number;
  processRouteCode: string;
  productType?: string;
  recipeCode: string;
  recipeName: string;
}

let ingredientKeySequence = 0;

function createIngredientRow(
  ingredient?: FdmcaiwuRecipeApi.Ingredient,
): IngredientEditRow {
  ingredientKeySequence += 1;
  return {
    key: ingredientKeySequence,
    rawMaterialId: ingredient?.rawMaterialId,
    sort: ingredient?.sort ?? 10,
    usageWeightKg: ingredient?.usageWeightKg,
  };
}

function createEmptyEditForm(): EditFormModel {
  return {
    densityType: '',
    enabled: true,
    id: undefined,
    ingredients: [createIngredientRow()],
    materialYieldRatePercent: 93,
    processRouteCode: 'TPE_STANDARD',
    productType: undefined,
    recipeCode: '',
    recipeName: '',
  };
}

const editOpen = ref(false);
const editLoading = ref(false);
const saving = ref(false);
const rawMaterialLoading = ref(false);
const editFormRef = ref<FormInstance>();
const editForm = reactive<EditFormModel>(createEmptyEditForm());
const rawMaterials = ref<FdmcaiwuRawMaterialApi.RawMaterial[]>([]);

const editRules: Record<string, Rule[]> = {
  densityType: [{ message: '请输入密度类型', required: true, trigger: 'blur' }],
  productType: [
    { message: '请选择产品类型', required: true, trigger: 'change' },
  ],
  materialYieldRatePercent: [
    { message: '请输入合格率', required: true, trigger: 'change' },
    {
      async validator(_rule, value) {
        const numberValue = Number(value);
        if (
          !Number.isFinite(numberValue) ||
          numberValue <= 0 ||
          numberValue > 100
        ) {
          throw new Error('合格率必须在 (0, 100] 范围内');
        }
        return;
      },
      trigger: 'change',
    },
  ],
  processRouteCode: [
    { message: '请输入工艺路线编码', required: true, trigger: 'blur' },
  ],
  recipeCode: [{ message: '请输入配方编码', required: true, trigger: 'blur' }],
  recipeName: [{ message: '请输入配方名称', required: true, trigger: 'blur' }],
};

function formatProductType(value?: string) {
  return (
    PRODUCT_TYPE_OPTIONS.find((item) => item.value === value)?.label ??
    value ??
    '—'
  );
}

function formatDensityType(value?: string) {
  if (!value) return '—';
  return value === 'CUSTOM' ? '定制' : `密度 ${value}`;
}

function formatYieldRate(value: unknown) {
  const numberValue = Number(value);
  return Number.isFinite(numberValue)
    ? `${(numberValue * 100).toFixed(2).replace(/\.?0+$/, '')}%`
    : '—';
}

function hasValue(value: unknown) {
  return value !== undefined && value !== null && value !== '';
}

function toFiniteNumber(value: unknown) {
  if (!hasValue(value)) return undefined;
  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? numberValue : undefined;
}

function formatDecimal(
  value: unknown,
  options: {
    maximumFractionDigits?: number;
    minimumFractionDigits?: number;
  } = {},
) {
  const numberValue = toFiniteNumber(value);
  if (numberValue === undefined) return '—';
  return numberValue.toLocaleString('zh-CN', {
    maximumFractionDigits: options.maximumFractionDigits ?? 6,
    minimumFractionDigits: options.minimumFractionDigits ?? 0,
  });
}

function formatWeight(value: unknown) {
  const formatted = formatDecimal(value, {
    maximumFractionDigits: 6,
    minimumFractionDigits: 2,
  });
  return formatted === '—' ? formatted : `${formatted} kg`;
}

function formatMoney(value: unknown, maximumFractionDigits = 4) {
  const formatted = formatDecimal(value, {
    maximumFractionDigits,
    minimumFractionDigits: 2,
  });
  return formatted === '—' ? formatted : `¥${formatted}`;
}

function formatUnitCost(value: unknown, exact = false) {
  const formatted = formatDecimal(value, {
    maximumFractionDigits: exact ? 8 : 2,
    minimumFractionDigits: 2,
  });
  return formatted === '—' ? formatted : `${formatted} 元/kg`;
}

function formatCategory(value?: null | string) {
  if (!value) return '—';
  return CATEGORY_LABELS[value] ?? value;
}

function getBlockedReason(row: FdmcaiwuRecipeApi.Recipe) {
  if (row.blockedReasons?.length) return row.blockedReasons.join('；');
  if (!row.costAvailable) return '配方原材料成本不可用';
  return '—';
}

const queryFormSchema: VbenFormSchema[] = [
  {
    component: 'Input',
    componentProps: {
      allowClear: true,
      placeholder: '配方编码或名称',
    },
    fieldName: 'keyword',
    label: '关键词',
  },
  {
    component: 'Select',
    componentProps: {
      allowClear: true,
      options: PRODUCT_TYPE_OPTIONS,
      placeholder: '全部产品类型',
    },
    fieldName: 'productType',
    label: '产品类型',
  },
  {
    component: 'Input',
    componentProps: {
      allowClear: true,
      placeholder: '例如 110 或 CUSTOM',
    },
    fieldName: 'densityType',
    label: '密度类型',
  },
  {
    component: 'Select',
    componentProps: {
      allowClear: true,
      options: ENABLED_OPTIONS,
      placeholder: '全部状态',
    },
    fieldName: 'enabled',
    label: '状态',
  },
];

const gridColumns: VxeTableGridOptions<FdmcaiwuRecipeApi.Recipe>['columns'] = [
  {
    field: 'recipeCode',
    fixed: 'left',
    minWidth: 130,
    title: '配方编码',
  },
  {
    field: 'recipeName',
    fixed: 'left',
    minWidth: 210,
    title: '配方名称',
  },
  {
    field: 'productType',
    slots: { default: 'productType' },
    title: '产品类型',
    width: 100,
  },
  {
    field: 'densityType',
    slots: { default: 'densityType' },
    title: '密度类型',
    width: 110,
  },
  {
    align: 'right',
    field: 'materialYieldRate',
    slots: { default: 'yieldRate' },
    title: '合格率',
    width: 90,
  },
  {
    field: 'processRouteCode',
    title: '工艺路线',
    width: 150,
  },
  {
    align: 'right',
    field: 'ingredientCount',
    title: '原材料数',
    width: 100,
  },
  {
    align: 'right',
    field: 'batchWeightKg',
    slots: { default: 'batchWeight' },
    title: '批次重量',
    width: 135,
  },
  {
    align: 'right',
    field: 'batchCostYuan',
    slots: { default: 'batchCost' },
    title: '批次成本',
    width: 135,
  },
  {
    align: 'right',
    field: 'rawUnitCostPerKg',
    slots: { default: 'rawUnitCost' },
    title: '原始公斤成本',
    width: 155,
  },
  {
    align: 'right',
    field: 'effectiveUnitCostPerKg',
    slots: { default: 'effectiveUnitCost' },
    title: '计价公斤成本',
    width: 155,
  },
  {
    align: 'center',
    field: 'costAvailable',
    slots: { default: 'status' },
    title: '状态',
    width: 105,
  },
  {
    field: 'blockedReasons',
    minWidth: 220,
    slots: { default: 'blockedReasons' },
    title: '阻断原因',
  },
  {
    fixed: 'right',
    slots: { default: 'actions' },
    title: '操作',
    width: 145,
  },
];

const [Grid, gridApi] = useVbenVxeGrid({
  formOptions: {
    schema: queryFormSchema,
  },
  gridOptions: {
    autoResize: true,
    columns: gridColumns,
    height: '100%',
    keepSource: false,
    proxyConfig: {
      ajax: {
        query: async ({ page }, formValues) =>
          getRecipePage({
            pageNo: page.currentPage,
            pageSize: page.pageSize,
            ...formValues,
          }),
      },
    },
    rowConfig: { isHover: true, keyField: 'id' },
    stripe: true,
    toolbarConfig: { refresh: true, search: true },
  } as VxeTableGridOptions<FdmcaiwuRecipeApi.Recipe>,
});

const rawMaterialMap = computed(
  () => new Map(rawMaterials.value.map((item) => [item.id, item])),
);

function getRawMaterial(rawMaterialId?: number) {
  if (rawMaterialId === undefined) return undefined;
  return rawMaterialMap.value.get(Number(rawMaterialId));
}

function getMaterialOptionLabel(material: FdmcaiwuRawMaterialApi.RawMaterial) {
  const price = hasValue(material.unitPricePerKg)
    ? formatUnitCost(material.unitPricePerKg)
    : '价格未维护';
  return `${material.materialCode} · ${material.materialName} · ${price}${
    material.enabled ? '' : ' · 已停用'
  }`;
}

function getMaterialOptions(
  source: IngredientEditRow | Record<string, unknown>,
) {
  const row = source as unknown as IngredientEditRow;
  const selectedIds = new Set(
    editForm.ingredients
      .filter((item) => item.key !== row.key)
      .map((item) => item.rawMaterialId)
      .filter((id): id is number => id !== undefined),
  );
  return rawMaterials.value.map((material) => ({
    disabled: selectedIds.has(material.id),
    label: getMaterialOptionLabel(material),
    value: material.id,
  }));
}

function filterMaterialOption(input: string, option?: { label?: unknown }) {
  return String(option?.label ?? '')
    .toLowerCase()
    .includes(input.trim().toLowerCase());
}

function getLineCost(source: IngredientEditRow | Record<string, unknown>) {
  const row = source as unknown as IngredientEditRow;
  const material = getRawMaterial(row.rawMaterialId);
  const unitPrice = toFiniteNumber(material?.unitPricePerKg);
  const usageWeight = toFiniteNumber(row.usageWeightKg);
  if (
    !material?.enabled ||
    unitPrice === undefined ||
    unitPrice <= 0 ||
    usageWeight === undefined ||
    usageWeight <= 0
  ) {
    return undefined;
  }
  return unitPrice * usageWeight;
}

const previewBlockedReasons = computed(() => {
  const reasons: string[] = [];
  const selectedIds = new Set<number>();
  if (editForm.ingredients.length === 0) reasons.push('至少添加一种原材料');

  editForm.ingredients.forEach((row, index) => {
    const prefix = `第 ${index + 1} 行`;
    if (row.rawMaterialId === undefined) {
      reasons.push(`${prefix}未选择原材料`);
      return;
    }
    if (selectedIds.has(row.rawMaterialId)) {
      reasons.push(`${prefix}原材料重复`);
    }
    selectedIds.add(row.rawMaterialId);

    const usageWeight = toFiniteNumber(row.usageWeightKg);
    if (usageWeight === undefined || usageWeight <= 0) {
      reasons.push(`${prefix}用量必须大于 0`);
    }

    const material = getRawMaterial(row.rawMaterialId);
    if (!material) {
      reasons.push(`${prefix}原材料不存在`);
      return;
    }
    if (!material.enabled) {
      reasons.push(`${material.materialName}已停用`);
    }
    const unitPrice = toFiniteNumber(material.unitPricePerKg);
    if (unitPrice === undefined || unitPrice <= 0) {
      reasons.push(`${material.materialName}未维护有效单价`);
    }
  });
  return [...new Set(reasons)];
});

const previewBatchWeight = computed(() => {
  if (editForm.ingredients.length === 0) return undefined;
  const weights = editForm.ingredients.map((row) =>
    toFiniteNumber(row.usageWeightKg),
  );
  if (weights.some((value) => value === undefined || value <= 0)) {
    return undefined;
  }
  return weights.reduce<number>((sum, value) => sum + (value ?? 0), 0);
});

const previewBatchCost = computed(() => {
  if (previewBlockedReasons.value.length > 0) return undefined;
  return editForm.ingredients.reduce(
    (sum, row) => sum + (getLineCost(row) ?? 0),
    0,
  );
});

const previewRawUnitCost = computed(() => {
  if (
    previewBatchCost.value === undefined ||
    previewBatchWeight.value === undefined ||
    previewBatchWeight.value <= 0
  ) {
    return undefined;
  }
  return previewBatchCost.value / previewBatchWeight.value;
});

const previewEffectiveUnitCost = computed(() => {
  if (previewRawUnitCost.value === undefined) return undefined;
  return (
    Math.floor((previewRawUnitCost.value + Number.EPSILON) * 100 + 0.5) / 100
  );
});

const ingredientColumns: ColumnsType<IngredientEditRow> = [
  { align: 'center', key: 'sort', title: '顺序', width: 68 },
  { key: 'material', title: '原材料', width: 350 },
  { key: 'category', title: '分类', width: 90 },
  { align: 'right', key: 'unitPrice', title: '当前单价', width: 130 },
  { key: 'usageWeight', title: '配方用量', width: 170 },
  { align: 'right', key: 'lineCostYuan', title: '行成本', width: 125 },
  { fixed: 'right', key: 'action', title: '操作', width: 175 },
];

async function loadRawMaterials() {
  rawMaterialLoading.value = true;
  try {
    const result = await getRawMaterialPage({ pageNo: 1, pageSize: -1 });
    rawMaterials.value = result.list ?? [];
  } finally {
    rawMaterialLoading.value = false;
  }
}

function resetEditForm(recipe?: FdmcaiwuRecipeApi.Recipe) {
  const ingredients = [...(recipe?.ingredients ?? [])]
    .toSorted((left, right) => left.sort - right.sort)
    .map((item) => createIngredientRow(item));
  Object.assign(editForm, {
    densityType: recipe?.densityType ?? '',
    enabled: recipe?.enabled ?? true,
    id: recipe?.id,
    ingredients: ingredients.length > 0 ? ingredients : [createIngredientRow()],
    materialYieldRatePercent: hasValue(recipe?.materialYieldRate)
      ? Number(recipe?.materialYieldRate) * 100
      : 93,
    processRouteCode: recipe?.processRouteCode ?? 'TPE_STANDARD',
    productType: recipe?.productType,
    recipeCode: recipe?.recipeCode ?? '',
    recipeName: recipe?.recipeName ?? '',
  });
}

async function handleCreate() {
  resetEditForm();
  editOpen.value = true;
  editLoading.value = true;
  try {
    await loadRawMaterials();
    await nextTick();
    editFormRef.value?.clearValidate();
  } finally {
    editLoading.value = false;
  }
}

async function handleEdit(row: FdmcaiwuRecipeApi.Recipe) {
  editOpen.value = true;
  editLoading.value = true;
  try {
    const [recipe] = await Promise.all([getRecipe(row.id), loadRawMaterials()]);
    resetEditForm(recipe);
    await nextTick();
    editFormRef.value?.clearValidate();
  } catch {
    editOpen.value = false;
  } finally {
    editLoading.value = false;
  }
}

function addIngredient() {
  editForm.ingredients.push(createIngredientRow());
}

function removeIngredient(index: number) {
  editForm.ingredients.splice(index, 1);
}

function moveIngredient(index: number, offset: number) {
  const targetIndex = index + offset;
  if (targetIndex < 0 || targetIndex >= editForm.ingredients.length) return;
  const [row] = editForm.ingredients.splice(index, 1);
  if (row) editForm.ingredients.splice(targetIndex, 0, row);
}

function validateIngredients() {
  if (editForm.ingredients.length === 0) {
    message.warning('请至少添加一种原材料');
    return false;
  }
  const selectedIds = new Set<number>();
  for (const [index, row] of editForm.ingredients.entries()) {
    if (row.rawMaterialId === undefined) {
      message.warning(`请选择第 ${index + 1} 行原材料`);
      return false;
    }
    if (selectedIds.has(row.rawMaterialId)) {
      message.warning(`第 ${index + 1} 行原材料重复`);
      return false;
    }
    selectedIds.add(row.rawMaterialId);
    const usageWeight = toFiniteNumber(row.usageWeightKg);
    if (usageWeight === undefined || usageWeight <= 0) {
      message.warning(`第 ${index + 1} 行配方用量必须大于 0`);
      return false;
    }
  }
  return true;
}

async function handleSave() {
  try {
    await editFormRef.value?.validate();
  } catch {
    return;
  }
  if (
    !editForm.recipeCode.trim() ||
    !editForm.recipeName.trim() ||
    !editForm.productType ||
    !editForm.densityType.trim() ||
    !editForm.processRouteCode.trim() ||
    !editForm.materialYieldRatePercent ||
    !validateIngredients()
  ) {
    return;
  }

  const data: FdmcaiwuRecipeApi.SaveReq = {
    densityType: editForm.densityType.trim().toUpperCase(),
    enabled: editForm.enabled,
    id: editForm.id,
    ingredients: editForm.ingredients.map((row, index) => ({
      rawMaterialId: row.rawMaterialId as number,
      sort: (index + 1) * 10,
      usageWeightKg: row.usageWeightKg as FdmcaiwuRecipeApi.DecimalValue,
    })),
    materialYieldRate: Number(
      (Number(editForm.materialYieldRatePercent) / 100).toFixed(6),
    ),
    processRouteCode: editForm.processRouteCode.trim().toUpperCase(),
    productType: editForm.productType,
    recipeCode: editForm.recipeCode.trim(),
    recipeName: editForm.recipeName.trim(),
  };

  saving.value = true;
  try {
    if (editForm.id === undefined) {
      await createRecipe(data);
      message.success('配方已创建');
    } else {
      await updateRecipe(data);
      message.success('配方已更新');
    }
    editOpen.value = false;
    await gridApi.query();
  } finally {
    saving.value = false;
  }
}

function handleDelete(row: FdmcaiwuRecipeApi.Recipe) {
  Modal.confirm({
    content: `删除后将无法在报价中选择“${row.recipeName}”，此操作不可撤销。`,
    okText: '确认删除',
    okType: 'danger',
    title: '确认删除该配方？',
    async onOk() {
      await deleteRecipe(row.id);
      message.success('配方已删除');
      await gridApi.query();
    },
  });
}
</script>

<template>
  <Page auto-content-height content-class="flex min-h-0 flex-1 flex-col !p-0">
    <Modal
      v-model:open="editOpen"
      :confirm-loading="saving"
      :mask-closable="!saving"
      :title="editForm.id === undefined ? '新增配方' : '编辑配方'"
      width="1120px"
      ok-text="保存"
      @ok="handleSave"
    >
      <div class="recipe-modal-body">
        <Form
          ref="editFormRef"
          :disabled="editLoading"
          layout="vertical"
          :model="editForm"
          :rules="editRules"
        >
          <div class="base-form-grid">
            <FormItem label="配方编码" name="recipeCode">
              <Input
                v-model:value="editForm.recipeCode"
                :maxlength="64"
                placeholder="例如 REC-025"
              />
            </FormItem>
            <FormItem label="配方名称" name="recipeName">
              <Input
                v-model:value="editForm.recipeName"
                :maxlength="128"
                placeholder="请输入便于识别的配方名称"
              />
            </FormItem>
            <FormItem label="产品类型" name="productType">
              <Select
                v-model:value="editForm.productType"
                :options="PRODUCT_TYPE_OPTIONS"
                placeholder="请选择产品类型"
              />
            </FormItem>
            <FormItem
              label="密度类型"
              name="densityType"
              extra="填写数字密度，如 110；定制配方填写 CUSTOM"
            >
              <Input
                v-model:value="editForm.densityType"
                :maxlength="32"
                placeholder="110 / CUSTOM"
              />
            </FormItem>
            <FormItem
              label="合格率（%）"
              name="materialYieldRatePercent"
              extra="合格率按配方固定维护，报价时自动读取"
            >
              <InputNumber
                v-model:value="editForm.materialYieldRatePercent"
                class="w-full"
                :max="100"
                :min="0.01"
                :precision="2"
                addon-after="%"
              />
            </FormItem>
            <FormItem
              label="工艺路线编码"
              name="processRouteCode"
              extra="用于匹配工费规则，例如 TPE_STANDARD"
            >
              <Input
                v-model:value="editForm.processRouteCode"
                :maxlength="64"
                placeholder="TPE_STANDARD"
              />
            </FormItem>
            <FormItem label="启用状态">
              <div class="switch-field">
                <Switch v-model:checked="editForm.enabled" />
                <span class="text-xs text-muted-foreground">
                  {{
                    editForm.enabled
                      ? '启用后可在产品报价中选择'
                      : '停用后不可用于新报价'
                  }}
                </span>
              </div>
            </FormItem>
          </div>
        </Form>

        <section class="ingredient-section">
          <div class="section-heading">
            <div>
              <h3>配方原材料</h3>
              <p>配方用量单位为 kg；成本预览取“原材料价格”菜单中的当前单价。</p>
            </div>
            <Button
              type="dashed"
              :disabled="editLoading"
              @click="addIngredient"
            >
              <template #icon>
                <IconifyIcon icon="lucide:plus" />
              </template>
              添加原材料
            </Button>
          </div>

          <Table
            :columns="ingredientColumns"
            :data-source="editForm.ingredients"
            :loading="editLoading || rawMaterialLoading"
            :pagination="false"
            row-key="key"
            :scroll="{ x: 1030, y: 310 }"
            size="small"
          >
            <template #bodyCell="{ column, record, index }">
              <template v-if="column.key === 'sort'">
                {{ index + 1 }}
              </template>
              <template v-else-if="column.key === 'material'">
                <Select
                  v-model:value="record.rawMaterialId"
                  allow-clear
                  class="w-full"
                  :filter-option="filterMaterialOption"
                  :options="getMaterialOptions(record)"
                  placeholder="选择原材料"
                  show-search
                />
              </template>
              <template v-else-if="column.key === 'category'">
                <Tag v-if="getRawMaterial(record.rawMaterialId)">
                  {{
                    formatCategory(
                      getRawMaterial(record.rawMaterialId)?.category,
                    )
                  }}
                </Tag>
                <span v-else>—</span>
              </template>
              <template v-else-if="column.key === 'unitPrice'">
                <div v-if="getRawMaterial(record.rawMaterialId)">
                  <span>
                    {{
                      formatUnitCost(
                        getRawMaterial(record.rawMaterialId)?.unitPricePerKg,
                      )
                    }}
                  </span>
                  <Tag
                    v-if="!getRawMaterial(record.rawMaterialId)?.enabled"
                    class="ml-1"
                    color="error"
                  >
                    停用
                  </Tag>
                </div>
                <span v-else>—</span>
              </template>
              <template v-else-if="column.key === 'usageWeight'">
                <InputNumber
                  v-model:value="record.usageWeightKg"
                  class="w-full"
                  string-mode
                  :min="0.000001"
                  :precision="6"
                  :step="0.1"
                  addon-after="kg"
                  placeholder="0.000000"
                />
              </template>
              <template v-else-if="column.key === 'lineCostYuan'">
                {{ formatMoney(getLineCost(record), 6) }}
              </template>
              <template v-else-if="column.key === 'action'">
                <Space :size="0">
                  <Button
                    size="small"
                    type="link"
                    :disabled="index === 0"
                    @click="moveIngredient(index, -1)"
                  >
                    上移
                  </Button>
                  <Button
                    size="small"
                    type="link"
                    :disabled="index === editForm.ingredients.length - 1"
                    @click="moveIngredient(index, 1)"
                  >
                    下移
                  </Button>
                  <Button
                    danger
                    size="small"
                    type="link"
                    @click="removeIngredient(index)"
                  >
                    删除
                  </Button>
                </Space>
              </template>
            </template>
          </Table>
        </section>

        <section class="preview-section">
          <div class="section-heading">
            <div>
              <h3>实时成本预览</h3>
              <p>仅用于录入校验；保存后以服务端重新计算结果为准。</p>
            </div>
          </div>
          <Alert
            v-if="previewBlockedReasons.length > 0"
            class="mb-3"
            :message="previewBlockedReasons.join('；')"
            show-icon
            type="warning"
          />
          <Descriptions bordered :column="4" size="small">
            <DescriptionsItem label="批次重量">
              {{ formatWeight(previewBatchWeight) }}
            </DescriptionsItem>
            <DescriptionsItem label="批次成本">
              {{ formatMoney(previewBatchCost, 6) }}
            </DescriptionsItem>
            <DescriptionsItem label="原始公斤成本">
              {{ formatUnitCost(previewRawUnitCost, true) }}
            </DescriptionsItem>
            <DescriptionsItem label="计价公斤成本">
              <strong class="effective-cost">
                {{ formatUnitCost(previewEffectiveUnitCost) }}
              </strong>
            </DescriptionsItem>
          </Descriptions>
          <p class="preview-formula">
            批次成本 = Σ（当前单价 × 配方用量）；原始公斤成本 = 批次成本 ÷
            批次重量；计价公斤成本按两位小数四舍五入。
          </p>
        </section>
      </div>
    </Modal>

    <div class="recipe-page flex h-full min-h-0 flex-1 flex-col px-4 pb-4">
      <header
        class="flex flex-shrink-0 flex-wrap items-start justify-between gap-3 pt-3 pb-2"
      >
        <div class="min-w-0 flex-1">
          <h2 class="mb-1 text-lg font-semibold text-foreground">配方管理</h2>
          <p class="mb-0 text-xs text-muted-foreground">
            维护每个配方使用的原材料和用量；公斤成本根据原材料当前价格实时计算。
          </p>
        </div>
        <Button
          v-access:code="['fdmcaiwu:recipe:create']"
          type="primary"
          @click="handleCreate"
        >
          <template #icon>
            <IconifyIcon icon="lucide:plus" />
          </template>
          新增配方
        </Button>
      </header>

      <div class="recipe-grid min-h-0 flex-1 overflow-hidden">
        <Grid
          class="recipe-vxe-wrapper"
          grid-class="recipe-vxe-grid"
          table-title="配方成本"
        >
          <template #productType="{ row }">
            <Tag>{{ formatProductType(row.productType) }}</Tag>
          </template>
          <template #densityType="{ row }">
            {{ formatDensityType(row.densityType) }}
          </template>
          <template #yieldRate="{ row }">
            {{ formatYieldRate(row.materialYieldRate) }}
          </template>
          <template #batchWeight="{ row }">
            {{ formatWeight(row.batchWeightKg) }}
          </template>
          <template #batchCost="{ row }">
            {{ formatMoney(row.batchCostYuan, 4) }}
          </template>
          <template #rawUnitCost="{ row }">
            {{ formatUnitCost(row.rawUnitCostPerKg, true) }}
          </template>
          <template #effectiveUnitCost="{ row }">
            <strong :class="{ 'effective-cost': row.costAvailable }">
              {{ formatUnitCost(row.effectiveUnitCostPerKg) }}
            </strong>
          </template>
          <template #status="{ row }">
            <Tag v-if="!row.enabled">已停用</Tag>
            <Tag v-else-if="row.costAvailable" color="success">可报价</Tag>
            <Tag v-else color="error">成本阻断</Tag>
          </template>
          <template #blockedReasons="{ row }">
            <Tooltip :title="getBlockedReason(row)">
              <span class="blocked-reason">{{ getBlockedReason(row) }}</span>
            </Tooltip>
          </template>
          <template #actions="{ row }">
            <Space :size="0">
              <Button
                v-access:code="['fdmcaiwu:recipe:update']"
                size="small"
                type="link"
                @click="handleEdit(row)"
              >
                编辑
              </Button>
              <Button
                v-access:code="['fdmcaiwu:recipe:delete']"
                danger
                size="small"
                type="link"
                @click="handleDelete(row)"
              >
                删除
              </Button>
            </Space>
          </template>
        </Grid>
      </div>
    </div>
  </Page>
</template>

<style scoped>
.recipe-page,
.recipe-grid {
  min-height: 0;
}

.recipe-page {
  height: 100%;
}

.recipe-grid {
  display: flex;
  flex-direction: column;
  min-height: 440px;
}

.recipe-grid :deep(.recipe-vxe-wrapper) {
  display: flex;
  flex: 1 1 auto;
  flex-direction: column;
  height: 100%;
  min-height: 0;
}

.recipe-grid :deep(.recipe-vxe-grid) {
  flex: 1 1 auto;
  height: 100% !important;
  min-height: 0;
}

.recipe-grid :deep(.vxe-grid) {
  height: 100%;
}

.blocked-reason {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.recipe-modal-body {
  max-height: min(75vh, 820px);
  padding-right: 4px;
  overflow-y: auto;
}

.base-form-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0 18px;
}

.switch-field {
  display: flex;
  gap: 10px;
  align-items: center;
  min-height: 32px;
}

.ingredient-section,
.preview-section {
  padding-top: 18px;
  margin-top: 4px;
  border-top: 1px solid var(--ant-color-border-secondary, #f0f0f0);
}

.preview-section {
  margin-top: 22px;
}

.section-heading {
  display: flex;
  gap: 16px;
  align-items: flex-start;
  justify-content: space-between;
  margin-bottom: 12px;
}

.section-heading h3 {
  margin: 0;
  font-size: 15px;
  font-weight: 600;
  color: var(--ant-color-text, #1f1f1f);
}

.section-heading p,
.preview-formula {
  margin: 3px 0 0;
  font-size: 12px;
  color: var(--ant-color-text-secondary, #8c8c8c);
}

.preview-formula {
  margin-top: 9px;
}

.effective-cost {
  color: var(--ant-color-primary, #1677ff);
}

@media (max-width: 768px) {
  .base-form-grid {
    grid-template-columns: 1fr;
  }

  .recipe-grid {
    min-height: 540px;
  }
}
</style>
