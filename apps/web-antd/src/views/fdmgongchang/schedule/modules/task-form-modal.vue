<script setup lang="ts">
import type { StageChoice } from '../../shared/schedule';

import type { FdmgongchangFactoryApi } from '#/api/fdmgongchang/factory';
import type { FdmgongchangScheduleApi as Api } from '#/api/fdmgongchang/schedule';
import type { FdmgongchangStageStockApi as StockApi } from '#/api/fdmgongchang/stage-stock';

import { computed, onBeforeUnmount, ref, watch } from 'vue';

import { Alert, Button, Input, InputNumber, Modal, Select } from 'ant-design-vue';

import { getScheduleTaskInputProduct, previewScheduleTaskMaterials } from '#/api/fdmgongchang/schedule';
import { errorText } from '#/views/fdmplatform/data';
import { productStageValue } from '#/views/fdmplatform/products/attributes';

import { specText } from '../../production-order/shared';
import { dimensionTextInMm } from '../../shared/dimensions';
import { factoryToday } from '../../shared/factory-date';
import { dateText, dayLabel, rescaleMaterials, stageTaskPlan, TASK_OUTPUT_STAGES, TASK_STAGE_LABELS, taskOutputAttrs } from '../../shared/schedule';
import { attrSummary, isLayered, makeLabels, parseSizeText, stageFields, toNumber } from '../../stage-stock/model';
import AttrFields from '../../stage-stock/modules/attr-fields.vue';
import ProductPickerModal from './product-picker-modal.vue';

/** 订单明细表达用途，工序产出表达本次真正要做的物料，两者独立保存。 */
const props = defineProps<{
  existingTaskId?: number;
  initial?: Api.PlanTask | null;
  options?: Api.FormOptions | null;
  recalculateMaterials?: boolean;
  schedule: Api.Schedule;
  submit: (task: Api.PlanTask) => Promise<void>;
  workers: FdmgongchangFactoryApi.Worker[];
}>();
const emit = defineEmits<{ batchMix: [context: { orderNo?: string; workDate: string }] }>();
const open = defineModel<boolean>('open', { required: true });
function openBatchMix() {
  emit('batchMix', { orderNo: order.value === STOCK ? undefined : order.value, workDate: date.value });
  open.value = false;
}

interface ProductChoice extends StageChoice {
  assignmentId?: null | string;
  code?: null | string;
  key: string;
}

const STOCK = '__STOCK__';
const date = ref('');
const process = ref<string>();
const order = ref<string>(STOCK);
const productKey = ref<string>();
const productPickerOpen = ref(false);
const inputPickerOpen = ref(false);
const selectedInput = ref<Api.Material>();
const inputLoading = ref(false);
const inputError = ref('');
const initialInputContextKey = ref('');
let inputSequence = 0;
const found = ref<ProductChoice[]>([]);
const outputAttrs = ref<StockApi.ItemAttrs>({});
const outputEdited = ref(false);
const layerSide = ref<Api.ManufacturingLayer['side']>();
const quantity = ref<null | number>(null);
const autoQuantity = ref(false);
const workerIds = ref<number[]>([]);
const reason = ref('');
const errors = ref<string[]>([]);
const saving = ref(false);
const materialPreview = ref<Api.MaterialPreview>();
const previewResultKey = ref('');
const initialPreviewKey = ref('');
const previewLoading = ref(false);
const previewError = ref('');
let previewSequence = 0;
let previewTimer: ReturnType<typeof setTimeout> | undefined;
let initializing = false;

const dates = computed(() => {
  const start = new Date(`${dateText(props.schedule.startDate)  }T00:00:00`);
  const pad = (n: number) => String(n).padStart(2, '0');
  return Array.from({ length: props.schedule.days }, (_, i) => {
    const d = new Date(start);
    d.setDate(d.getDate() + i);
    return [d.getFullYear(), pad(d.getMonth() + 1), pad(d.getDate())].join('-');
  });
});
const dateOptions = computed(() => dates.value.map((d) => ({ label: dayLabel(d), value: d })));
const processOptions = computed(() => (props.options?.processes ?? []).map((p) => ({ label: p.label, value: p.code })));
const processOption = computed(() => props.options?.processes.find((p) => p.code === process.value));
const materialOptions = computed<StockApi.Options>(() => props.options?.materialOptions ?? {
  colors: [], materials: [], patterns: [], processes: [], rawMaterials: [], recipes: [], stages: [], textures: [],
});
const outputStage = computed(() => processOption.value?.outputStage || TASK_OUTPUT_STAGES[process.value ?? ''] || '');
const outputLabel = computed(() => TASK_STAGE_LABELS[outputStage.value] || materialOptions.value.stages.find((s) => s.code === outputStage.value)?.label || '本工序产出');
const outputFields = computed(() => outputStage.value ? stageFields(outputStage.value) : []);
const unit = computed(() => materialOptions.value.stages.find((s) => s.code === outputStage.value)?.unit || processOption.value?.unit || '');
const intermediate = computed(() => ['CUT', 'MIX', 'SLICE'].includes(process.value ?? ''));
const fallbackSources: Record<string, string[]> = { MIX: ['RAW'], SLICE: ['BOARD'], CUT: ['SHEET'] };
const sourceStages = computed(() => picked.value?.sourceStagesByProcess?.[process.value ?? '']
  ?? processOption.value?.sourceStages ?? materialOptions.value.processes.find((p) => p.code === process.value)?.sources
  ?? fallbackSources[process.value ?? ''] ?? []);
const sourceText = computed(() => sourceStages.value.map((s) => TASK_STAGE_LABELS[s] || materialOptions.value.stages.find((v) => v.code === s)?.label || s).join('、'));
const selectsInput = computed(() => process.value === 'SLICE' || process.value === 'CUT');
const inputStage = computed(() => sourceStages.value[0] || (process.value === 'SLICE' ? 'BOARD' : 'SHEET'));
const inputSummary = computed(() => selectedInput.value?.attrs
  ? attrSummary(selectedInput.value.stage, selectedInput.value.attrs, makeLabels(materialOptions.value), [], 'mm') : '');
const editableOutputFields = computed(() => selectsInput.value
  ? outputFields.value.filter((field) => process.value === 'SLICE' ? field === 'thickness' : field === 'length' || field === 'width')
  : outputFields.value);
const outputSummary = computed(() => attrSummary(outputStage.value, outputAttrs.value, makeLabels(materialOptions.value), [], 'mm'));

const orderOptions = computed(() => {
  const codes = [...new Set((props.options?.demand ?? []).map((d) => d.contractCode))];
  return [{ label: '备货（不关联订单）', value: STOCK }, ...codes.map((code) => ({ label: code, value: code }))];
});
/** 历史任务没有明细标识时，仅能用该订单唯一一条明细补齐，不能按产品名称猜。 */
const initialAssignmentId = computed(() => {
  if (props.initial?.assignmentId) return props.initial.assignmentId;
  const matches = (props.options?.demand ?? []).filter((d) => d.contractCode === props.initial?.contractCode);
  return matches.length === 1 ? matches[0]?.assignmentId : undefined;
});
const current = computed<null | ProductChoice>(() => {
  const t = props.initial;
  if (!t?.product || (t.contractCode || STOCK) !== order.value) return null;
  return { assignmentId: initialAssignmentId.value, key: '__CURRENT__', name: t.product, spec: t.spec ?? '' };
});
const choices = computed<ProductChoice[]>(() => {
  const list: ProductChoice[] = order.value === STOCK ? found.value : (props.options?.demand ?? [])
    .filter((d) => d.contractCode === order.value)
    .map((d, index) => ({
      ...d,
      key: d.assignmentId || `unlinked:${  index}`,
      name: d.product || '未命名订单明细',
      code: d.productCode,
      remaining: d.remaining === null || d.remaining === undefined ? null : Number(d.remaining),
      spec: d.spec ?? '',
    }));
  const keep = current.value;
  return keep && (!keep.assignmentId || !list.some((c) => c.assignmentId === keep.assignmentId)) ? [keep, ...list] : list;
});
const productOptions = computed(() => choices.value.map((c) => ({
  label: [c.name, c.code, c.assignmentId ? `明细 ${  c.assignmentId.replace(/^POI:/, '')}` : ''].filter(Boolean).join(' · '),
  value: c.key,
})));
const picked = computed(() => choices.value.find((c) => c.key === productKey.value));
const selectedLayer = computed(() => picked.value?.layers?.find((layer) => layer.side === layerSide.value));
const layerOptions = computed(() => (picked.value?.layers ?? []).map((layer) => ({
  value: layer.side,
  label: `${({ FRONT: '正面层', BACK: '反面层', BOTH: '正反同规格层' })[layer.side]} · ${materialOptions.value.colors.find((option) => option.value === layer.color)?.label || layer.color} · ${Number((layer.thickness * 10).toFixed(2))} mm${layer.perProduct === 2 ? ' · 每垫 2 片' : ''}`,
})));
const stagePlan = computed(() => {
  const choice = picked.value;
  if (!choice) return null;
  const color = selectedInput.value?.attrs?.color || outputAttrs.value.color;
  if (intermediate.value && choice.layers?.length) {
    const layer = selectedLayer.value;
    const plan = choice.layerPlans?.find((row) => row.side === layer?.side);
    return stageTaskPlan(process.value, { ...choice,
      boards: layer ? plan?.boards : null,
      sheets: layer && plan ? plan.boards * plan.layers : null,
      remaining: layer && choice.remaining ? choice.remaining * layer.perProduct : null,
    });
  }
  return stageTaskPlan(process.value, { ...choice,
    boards: color ? choice.boardsByColor?.[color] ?? choice.boards : choice.boards,
    sheets: color ? choice.sheetsByColor?.[color] ?? choice.sheets : choice.sheets,
  });
});
const sameOriginal = computed(() => !!props.initial && process.value === props.initial.process
  && (order.value === STOCK ? !props.initial.contractCode : order.value === props.initial.contractCode)
  && ((!!picked.value?.assignmentId && picked.value.assignmentId === initialAssignmentId.value) || picked.value?.key === '__CURRENT__'));
const mergedOriginal = computed(() => sameOriginal.value && (props.initial?.covers?.length ?? 0) > 1);
const suggested = computed(() => {
  if (picked.value?.key === '__CURRENT__') return null;
  return stagePlan.value?.suggested ?? null;
});
const inputContextKey = computed(() => JSON.stringify([process.value, order.value, productKey.value,
  quantity.value, taskOutputAttrs(outputStage.value, outputAttrs.value)]));
/** 旧任务可只改日期/人员/备注；重排物料或数量时才要求明确选料。 */
const preserveLegacyInputs = computed(() => selectsInput.value && !!props.initial && !selectedInput.value
  && !props.recalculateMaterials
  && (process.value !== 'SLICE' || (props.schedule.status === 'CONFIRMED' && !!props.existingTaskId))
  && !inputLoading.value && !inputError.value && !!initialInputContextKey.value
  && inputContextKey.value === initialInputContextKey.value);

const previewRequest = computed<Api.MaterialPreviewRequest | undefined>(() => process.value && (quantity.value ?? 0) > 0
  && (!selectsInput.value || (!!selectedInput.value?.code
    && [outputAttrs.value.length, outputAttrs.value.width, outputAttrs.value.thickness].every((v) => (toNumber(v) ?? 0) > 0)))
  && !inputLoading.value ? {
  assignmentId: picked.value?.assignmentId || null,
  ...(selectsInput.value ? { inputProductId: selectedInput.value?.productId || null, inputCode: selectedInput.value?.code || null } : {}),
  outputAttrs: taskOutputAttrs(outputStage.value, outputAttrs.value),
  process: process.value,
  quantity: quantity.value!,
} : undefined);
const previewKey = computed(() => previewRequest.value ? JSON.stringify(previewRequest.value) : '');
const currentPreview = computed<Api.MaterialPreview | undefined>(() => {
  if (previewKey.value && previewKey.value === previewResultKey.value) return materialPreview.value;
  if (previewKey.value && previewKey.value === initialPreviewKey.value && props.initial?.inputs?.length) {
    return { basis: '已保存的预计领料；调整计划产出或数量后重新计算。', estimated: true,
      inputs: props.initial.inputs, recipeBatches: props.initial.output?.recipeBatches,
      sourceStages: sourceStages.value, warnings: [] };
  }
  return undefined;
});
const plannedInputs = computed<Api.Material[] | undefined>(() => currentPreview.value?.inputs
  .filter((row) => (toNumber(row.quantity) ?? 0) > 0)
  .map(({ available: _available, shortage: _shortage, perBatch: _perBatch, ...material }) => material));
const previewNumber = (value: Api.Decimal | null | undefined) => value === null || value === undefined
  ? '待确认' : Number(value).toLocaleString('zh-CN', { maximumFractionDigits: 3 });
function plannedMaterialName(material: Api.Material) {
  const summary = attrSummary(material.stage, material.attrs, makeLabels(materialOptions.value), [], 'mm');
  return material.stage === 'RAW' || material.stage === 'AUX'
    ? material.name || material.code || TASK_STAGE_LABELS[material.stage] || material.stage
    : (summary ? (material.name?.match(/^(正面|反面)\s/)?.[0] || '') + summary : '')
      || dimensionTextInMm(material.name || material.code || TASK_STAGE_LABELS[material.stage] || material.stage);
}

async function calculateMaterials() {
  if (previewTimer) clearTimeout(previewTimer);
  const request = previewRequest.value;
  if (!request || !open.value) return;
  const key = previewKey.value;
  const sequence = ++previewSequence;
  previewLoading.value = true;
  previewError.value = '';
  try {
    const result = await previewScheduleTaskMaterials(request);
    if (sequence !== previewSequence || key !== previewKey.value || !open.value) return;
    materialPreview.value = result;
    previewResultKey.value = key;
    return result;
  } catch {
    if (sequence === previewSequence && key === previewKey.value) previewError.value = '预计领料计算失败，请重新计算后再保存。';
  } finally {
    if (sequence === previewSequence) previewLoading.value = false;
  }
}

function applySuggestedOutput() {
  const choice = picked.value;
  const layer = selectedLayer.value;
  const useLayer = intermediate.value && !!choice?.layers?.length;
  let attrs = useLayer ? layer?.cutAttrs : choice?.targetAttrs;
  if (process.value === 'MIX') {
    attrs = useLayer ? layer?.boardAttrs : choice?.boardAttrs;
  } else if (process.value === 'SLICE') {
    attrs = useLayer ? layer?.sheetAttrs : choice?.sheetAttrs;
  }
  outputAttrs.value = taskOutputAttrs(outputStage.value, attrs);
  if (autoQuantity.value) quantity.value = suggested.value;
}

function clearInput() {
  ++inputSequence;
  inputLoading.value = false;
  inputError.value = '';
  inputPickerOpen.value = false;
  selectedInput.value = undefined;
}

function inheritInputAttrs() {
  const attrs = selectedInput.value?.attrs;
  if (!attrs || !selectsInput.value) return;
  outputAttrs.value = taskOutputAttrs(outputStage.value, {
    ...outputAttrs.value,
    material: attrs.material,
    color: attrs.color,
    recipeCode: attrs.recipeCode,
    recipeName: attrs.recipeName,
    ...(process.value === 'SLICE'
      ? { length: attrs.length, width: attrs.width }
      : { thickness: attrs.thickness }),
  });
  outputEdited.value = true;
}

async function selectInputProduct(product: Api.Product) {
  inputPickerOpen.value = false;
  if (!open.value || !selectsInput.value || !process.value) return;
  const run = ++inputSequence;
  inputLoading.value = true;
  inputError.value = '';
  try {
    const material = await getScheduleTaskInputProduct({
      process: process.value, assignmentId: picked.value?.assignmentId || null, productId: product.id,
    });
    if (run !== inputSequence || !open.value) return;
    selectedInput.value = material;
    initialPreviewKey.value = '';
    inheritInputAttrs();
    if (autoQuantity.value) quantity.value = suggested.value;
  } catch (error) {
    if (run === inputSequence) inputError.value = `领料产品读取失败：${  errorText(error)}`;
  } finally {
    if (run === inputSequence) inputLoading.value = false;
  }
}

function selectProduct(p: Api.Product) {
  productPickerOpen.value = false;
  if (!open.value || order.value !== STOCK) return;
  const hasFaceColors = Boolean(p.frontColor || p.backColor);
  let color: null | string = null;
  if (p.colorMode === 'SINGLE') {
    color = p.colorCode || null;
  } else if (!hasFaceColors) {
    color = p.colorCode || materialOptions.value.colors.find((c) => c.value === p.color || c.label === p.color)?.value || null;
  }
  const attrs: StockApi.ItemAttrs = {
    ...parseSizeText(p.size),
    // 已按面维护的颜色不再从单色或旧颜色原文补另一面，缺失的一面需要现场确认。
    color,
    frontColor: p.frontColor || null,
    backColor: p.backColor || null,
    textureFront: p.textureFront || null,
    textureBack: p.textureBack || null,
    material: materialOptions.value.materials.find((m) => m.value === p.material || m.label === p.material)?.value ?? p.material,
  };
  found.value = [{ code: p.code, key: p.id, name: p.displayName || p.name, spec: specText(p),
    boardAttrs: productStageValue(p) === 'BOARD' ? attrs : undefined,
    sheetAttrs: productStageValue(p) === 'SHEET' ? attrs : undefined,
    targetAttrs: attrs,
  }];
  productKey.value = p.id;
}

function clearProduct() {
  const attrs = { ...outputAttrs.value };
  const plannedQuantity = quantity.value;
  productKey.value = undefined;
  // 清除用途关联时保留现场已明确的产出规格和数量。
  outputAttrs.value = attrs;
  quantity.value = plannedQuantity;
}

const workerOptions = computed(() => props.workers.filter((w) => !process.value || w.posts.includes(process.value))
  .map((w) => ({ label: [w.nickname, w.team].filter(Boolean).join(' · '), value: w.userId })));

watch([open, () => props.initial], ([value]) => {
  productPickerOpen.value = false;
  clearInput();
  initialInputContextKey.value = '';
  ++previewSequence;
  if (previewTimer) clearTimeout(previewTimer);
  materialPreview.value = undefined;
  previewResultKey.value = '';
  initialPreviewKey.value = '';
  previewLoading.value = false;
  previewError.value = '';
  if (!value) return;
  initializing = true;
  const t = props.initial;
  date.value = t?.date ?? dates.value.find((d) => d >= factoryToday().format('YYYY-MM-DD')) ?? dates.value[0] ?? '';
  process.value = t?.process ?? undefined;
  order.value = t?.contractCode || STOCK;
  found.value = [];
  const fallbackProductKey = t?.product ? '__CURRENT__' : undefined;
  productKey.value = initialAssignmentId.value && choices.value.some((c) => c.key === initialAssignmentId.value) ? initialAssignmentId.value : fallbackProductKey;
  layerSide.value = t?.output?.side || (picked.value?.layers?.length === 1 ? picked.value.layers[0]?.side : undefined);
  quantity.value = t ? Number(t.quantity) : null;
  autoQuantity.value = !t;
  workerIds.value = [...(t?.workerIds ?? [])];
  reason.value = t?.reason ?? '';
  errors.value = [];
  outputEdited.value = false;
  applySuggestedOutput();
  if (t?.output?.attrs) outputAttrs.value = { ...t.output.attrs };
  if (selectsInput.value && t?.inputs?.length === 1 && t.inputs[0]?.code && t.inputs[0].attrs
    && t.inputs[0].attrs.material && t.inputs[0].attrs.color
    && [t.inputs[0].attrs.length, t.inputs[0].attrs.width, t.inputs[0].attrs.thickness].every((v) => (toNumber(v) ?? 0) > 0)
    && sourceStages.value.includes(t.inputs[0].stage)
    // 开片只要求来源长宽、材质和颜色匹配，计划厚度就是要开出的单层厚度。
    && (process.value !== 'SLICE' || (t.output?.attrs
      && (['material', 'color', 'recipeCode'] as const).every((field) => (t.inputs![0]!.attrs![field] || null) === (t.output!.attrs![field] || null))
      && (['length', 'width'] as const).every((field) => toNumber(t.inputs![0]!.attrs![field]) === toNumber(t.output!.attrs![field]))))) {
    selectedInput.value = { ...t.inputs[0], attrs: t.inputs[0].attrs ? { ...t.inputs[0].attrs } : undefined };
    inheritInputAttrs();
    outputEdited.value = false;
  }
  initialInputContextKey.value = t && selectsInput.value && !selectedInput.value ? inputContextKey.value : '';
  initialPreviewKey.value = !props.recalculateMaterials && t?.inputs?.length && process.value !== 'SLICE' ? previewKey.value : '';
  initializing = false;
}, { immediate: true });

watch([open, previewKey], () => {
  ++previewSequence;
  if (previewTimer) clearTimeout(previewTimer);
  previewLoading.value = false;
  previewError.value = '';
  if (!open.value || !previewKey.value || currentPreview.value) return;
  previewLoading.value = true;
  previewTimer = setTimeout(() => { void calculateMaterials(); }, 350);
}, { immediate: true });
onBeforeUnmount(() => {
  ++inputSequence;
  ++previewSequence;
  if (previewTimer) clearTimeout(previewTimer);
});

watch([process, productKey], () => {
  if (initializing || !open.value) return;
  clearInput();
  layerSide.value = picked.value?.layers?.length === 1 ? picked.value.layers[0]?.side : undefined;
  outputEdited.value = true;
  applySuggestedOutput();
}, { flush: 'sync' });
watch(layerSide, () => {
  if (initializing || !open.value) return;
  clearInput();
  outputEdited.value = true;
  applySuggestedOutput();
}, { flush: 'sync' });
watch(suggested, (value) => {
  if (!initializing && autoQuantity.value) quantity.value = value;
}, { flush: 'sync' });
watch(process, () => {
  if (initializing) return;
  const allowed = new Set(workerOptions.value.map((w) => w.value));
  workerIds.value = workerIds.value.filter((id) => allowed.has(id));
}, { flush: 'sync' });
watch(order, () => {
  if (initializing) return;
  clearInput();
  productPickerOpen.value = false;
  productKey.value = undefined;
  const own = choices.value.filter((c) => c.key !== '__CURRENT__');
  if (order.value !== STOCK && own.length === 1) productKey.value = own[0]!.key;
  applySuggestedOutput();
}, { flush: 'sync' });

function inputQuantity(v: null | number | undefined) {
  quantity.value = v ?? null;
  autoQuantity.value = false;
}

async function save() {
  errors.value = [];
  if (!date.value) errors.value.push('请选择日期。');
  if (!process.value) errors.value.push('请选择工序。');
  if (intermediate.value && picked.value?.layers?.length && !selectedLayer.value) errors.value.push('请选择本次生产的正面或反面层。');
  if (selectsInput.value && !preserveLegacyInputs.value && (!selectedInput.value?.code || inputLoading.value)) errors.value.push('请先从产品中心选择本次领料的板材。');
  if (selectsInput.value && inputError.value) errors.value.push('请重新选择有效的领料产品。');
  if (!preserveLegacyInputs.value && order.value !== STOCK && !picked.value?.assignmentId && !mergedOriginal.value) errors.value.push('请选择准确的关联订单明细。');
  if (order.value === STOCK && !intermediate.value && !picked.value) errors.value.push('请选择备货产品。');
  if (!(quantity.value && quantity.value > 0)) errors.value.push('请填写计划产出数量，要大于 0。');
  if (mergedOriginal.value && Math.abs((props.initial?.covers ?? []).reduce((sum, cover) => sum + Number(cover.quantity), 0) - (quantity.value ?? 0)) > 0.0001) {
    errors.value.push('合并任务的计划数量必须保持各订单原分配合计；需要增补时请按订单明细新建任务。');
  }
  const attrs = outputAttrs.value;
  // 旧任务没有结构化目标时可保留其原始约定；新建或重新选产品必须明确本工序产出。
  const legacy = sameOriginal.value && !props.initial?.output?.attrs && !outputEdited.value;
  if (outputStage.value && !legacy && !preserveLegacyInputs.value) {
    if (!attrs.material) errors.value.push('请选择产出材质。');
    if (![attrs.length, attrs.width, attrs.thickness].every((v) => (toNumber(v) ?? 0) > 0)) errors.value.push('请填写产出的长、宽、厚，均应大于 0。');
    if (isLayered(outputStage.value) ? !attrs.frontColor || !attrs.backColor : !attrs.color) errors.value.push(intermediate.value ? '请选择本次产出的单一颜色；双色订单应按颜色分别安排。' : '请选择产出颜色。');
    if (process.value === 'SLICE' && selectedInput.value?.attrs && (toNumber(attrs.thickness) ?? 0) > (toNumber(selectedInput.value.attrs.thickness) ?? 0)) errors.value.push('开片单层厚度不能超过领料板材厚度。');
    if (process.value === 'MIX' && !attrs.recipeCode) errors.value.push('请选择本次发泡的配方版本。');
  }
  if (errors.value.length > 0) return;
  saving.value = true;
  try {
    if (preserveLegacyInputs.value && props.initial) {
      await props.submit({ ...props.initial, date: date.value, workerIds: workerIds.value, reason: reason.value.trim() || null,
        sequence: props.initial.date === date.value ? props.initial.sequence : null });
      open.value = false;
      return;
    }
    const legacyMaterials = legacy && sameOriginal.value && props.initial
      ? rescaleMaterials(props.initial, props.initial.quantity, quantity.value!) : undefined;
    if (!legacyMaterials && !currentPreview.value && previewRequest.value && !await calculateMaterials()) return;
    if (selectsInput.value && (!currentPreview.value?.estimated || !plannedInputs.value?.length)) {
      errors.value.push('所选领料与计划产出尚未匹配，请核对产出规格并重新计算预计领料。');
      return;
    }
    const output: Api.Material = legacy ? { ...(props.initial?.output ?? { stage: outputStage.value }), quantity: quantity.value! }
      : { ...(sameOriginal.value && !outputEdited.value ? props.initial?.output : {}), attrs: taskOutputAttrs(outputStage.value, attrs), name: (`${outputLabel.value  } · ${  outputSummary.value}`).slice(0, 120), quantity: quantity.value!, stage: outputStage.value, unit: unit.value };
    output.recipeBatches = process.value === 'MIX' ? currentPreview.value?.recipeBatches ?? null : null;
    output.mixPlan = process.value === 'MIX' ? currentPreview.value?.mixPlan ?? null : null;
    if (intermediate.value && selectedLayer.value) output.side = selectedLayer.value.side;
    else if (sameOriginal.value && props.initial?.output?.side) output.side = props.initial.output.side;
    const previewInputs = plannedInputs.value?.length ? plannedInputs.value : undefined;
    await props.submit({
      assignmentId: picked.value?.assignmentId || null,
      contractCode: order.value === STOCK ? null : order.value,
      covers: sameOriginal.value ? props.initial?.covers?.map((cover) => ({ ...cover, quantity: props.initial?.covers?.length === 1 ? quantity.value! : cover.quantity })) : undefined,
      date: date.value,
      inputs: legacyMaterials ? legacyMaterials.inputs : previewInputs,
      output,
      process: process.value!,
      product: picked.value?.name || outputLabel.value,
      quantity: quantity.value!,
      reason: reason.value.trim() || null,
      sequence: props.initial?.date === date.value && props.initial?.process === process.value ? props.initial?.sequence : null,
      spec: legacy ? props.initial?.spec : outputSummary.value || null,
      unit: unit.value || null,
      workerIds: workerIds.value,
    });
    open.value = false;
  } catch {
    // 后端错误已由全局提示展示。
  } finally {
    saving.value = false;
  }
}
</script>

<template>
  <Modal v-model:open="open" :confirm-loading="saving" :title="initial ? '修改生产任务' : '下发生产任务'" :width="900" :body-style="{ maxHeight: '72vh', overflowY: 'auto' }" ok-text="保存" @ok="save">
    <div class="grid grid-cols-1 gap-3 text-xs text-muted-foreground sm:grid-cols-2">
      <div class="rounded-md bg-primary/5 px-3 py-2 leading-6 sm:col-span-2">
        <b class="text-foreground">下发任务：{{ selectsInput ? '选择领料产品 → 设置计划产出' : '计划产出 → 预计领料' }} → 指派人员</b><br />
        任务下发后，进入对应工序的车间菜单确认实际领料，再登记本工序的实际产出。
      </div>
      <label for="task-form-date" class="flex flex-col gap-1">
        计划日期
        <Select id="task-form-date" v-model:value="date" :options="dateOptions" />
      </label>
      <label for="task-form-process" class="flex flex-col gap-1">
        本次工序
        <Select id="task-form-process" v-model:value="process" :options="processOptions" placeholder="选工序" />
      </label>
      <div v-if="process === 'MIX'" class="flex flex-wrap items-center gap-2 rounded-md border border-primary/20 bg-primary/5 p-3 sm:col-span-2">
        <Button id="task-form-batch-mix" @click="openBatchMix">批量安排发泡</Button>
        <span>一次安排本订单所有明细和制造层，也可再选多个订单；按预览下发独立排单。</span>
      </div>
      <label for="task-form-order" class="flex flex-col gap-1 sm:col-span-2">
        关联订单（说明这批物料的用途）
        <Select id="task-form-order" v-model:value="order" :options="orderOptions" option-filter-prop="label" show-search />
      </label>
      <div class="flex flex-col gap-1 sm:col-span-2">
        <label for="task-form-product">{{ order === STOCK ? (intermediate ? '关联产品（选填）' : '备货产品') : '关联订单明细（最终交付产品）' }}</label>
        <span v-if="order === STOCK" class="flex items-start gap-2">
          <button id="task-form-product" type="button" class="flex min-h-8 min-w-0 flex-1 items-center justify-between gap-3 rounded-md border border-border bg-background px-3 py-1.5 text-left text-sm hover:border-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary" aria-haspopup="dialog" @click="productPickerOpen = true">
            <span class="min-w-0 break-words" :class="picked ? 'text-foreground' : 'text-muted-foreground'">{{ picked?.name || '点击从产品中心选择，可按分类筛选' }}</span>
            <span class="shrink-0 text-primary">{{ picked ? '更换' : '选择产品' }}</span>
          </button>
          <button v-if="picked" type="button" class="min-h-8 shrink-0 px-1 text-primary hover:underline" @click.prevent="clearProduct">清除</button>
        </span>
        <Select
v-else id="task-form-product" v-model:value="productKey" not-found-content="这张订单里没有可排产明细"
          :options="productOptions" placeholder="选择准确的订单明细" option-filter-prop="label" show-search
/>
        <span v-if="picked" class="text-xs">{{ order === STOCK ? '关联产品' : '订单目标' }}：{{ picked.code || picked.name }}<template v-if="picked.spec"> · {{ dimensionTextInMm(picked.spec) }}</template></span>
      </div>

      <label v-if="intermediate && layerOptions.length" for="task-form-layer" class="flex flex-col gap-1 sm:col-span-2">
        本次生产的层
        <Select id="task-form-layer" v-model:value="layerSide" :options="layerOptions" placeholder="选择正面或反面，按各层实际厚度生产" />
      </label>
      <section v-if="selectsInput" class="flex flex-col gap-2 rounded-md border border-border p-3 sm:col-span-2" aria-label="选择领料产品">
        <b class="text-foreground">预计领料产品：{{ sourceText }}</b>
        <p class="m-0">从产品中心选择本次要领用的上工序板材；实际领料批次和数量在对应工序车间确认。</p>
        <button id="task-form-input-product" type="button" :disabled="inputLoading" class="flex min-h-9 items-center justify-between gap-3 rounded-md border border-border bg-background px-3 py-2 text-left text-sm hover:border-primary disabled:opacity-60" aria-haspopup="dialog" @click="inputPickerOpen = true">
          <span class="min-w-0 break-words" :class="selectedInput ? 'text-foreground' : 'text-muted-foreground'">{{ inputLoading ? '正在读取所选板材…' : selectedInput?.name || '点击从产品中心选择领料板材' }}</span>
          <span class="shrink-0 text-primary">{{ selectedInput ? '更换板材' : '选择板材' }}</span>
        </button>
        <p v-if="selectedInput" class="m-0 text-foreground">{{ selectedInput.code }}<br />{{ inputSummary }}</p>
        <p v-if="preserveLegacyInputs" class="m-0">当前保留历史任务的领料和产出约定，可直接调整日期、人员或说明；如需修改计划数量或产出，请重新选择领料板材。</p>
        <p v-if="process === 'SLICE' && initial && !selectedInput && !preserveLegacyInputs" class="m-0">草稿或补派任务需要重新选择领料板材，确认本次产出规格后再保存。</p>
        <p v-if="inputError" class="m-0 text-destructive" role="alert">{{ inputError }}</p>
      </section>

      <section v-if="process" class="flex flex-col gap-3 rounded-md border border-border bg-muted/20 p-3 sm:col-span-2" aria-label="本工序计划产出">
        <div class="flex flex-wrap items-center gap-2 text-foreground">
          <b>领料：{{ sourceText || '按工艺上道产出' }}</b>
          <span>→</span>
          <b>报工产出：{{ outputLabel }}</b>
        </div>
        <b class="text-foreground">本工序计划产出规格</b>
        <template v-if="selectsInput">
          <p class="m-0">{{ process === 'SLICE' ? '开片沿用板材的材质、配方、颜色和长宽，按已确认的制造层厚度开片（mm）；两层厚度相加为成品厚度。' : '立切沿用已开片板材的材质、配方、颜色和厚度，仅填写目标片材的长、宽（mm）。' }}</p>
          <p v-if="!selectedInput" class="m-0">{{ process === 'SLICE' ? '选择上方的领料板材后，自动带出本工序产出规格。' : '请先选择上方的领料板材，再填写产出规格。' }}</p>
          <p v-else class="m-0">已沿用所选板材属性，报工时登记本工序实际产出。</p>
        </template>
        <p v-else class="m-0">{{ process === 'MIX' ? '开工时按配方领取原材料；报工登记以下规格、颜色的板材。' : '开工时领取上工序已有库存批次；报工登记本工序实际产出，保留领料批次追溯。' }}</p>
        <AttrFields v-if="editableOutputFields.length && (!selectsInput || selectedInput)" v-model="outputAttrs" :fields="editableOutputFields" :options="materialOptions" dimension-unit="mm" id-prefix="task-output" @changed="outputEdited = true" />
        <p v-if="intermediate" class="m-0">一项任务对应一个制造层规格。同色不同厚度也需分层安排；同色等厚可合并生产，数量按每垫两片计算。</p>
        <p v-if="initial && !initial.output?.attrs && sameOriginal" class="m-0 text-warning">历史任务尚未保存结构化产出；保持不填时沿用原约定，填写后请补全产出属性。</p>
        <p v-if="outputSummary && (!selectsInput || selectedInput || preserveLegacyInputs)" class="m-0 text-foreground">计划产出：{{ outputLabel }} · {{ outputSummary }}</p>
      </section>

      <label for="task-form-quantity" class="flex flex-col gap-1 sm:col-span-2">
        计划产出数量
        <span class="flex max-w-sm items-center gap-2">
          <InputNumber id="task-form-quantity" :min="0" :value="quantity ?? undefined" class="flex-1" @update:value="(v) => inputQuantity(v as null | number | undefined)" />
          <span class="w-6 shrink-0 text-foreground">{{ unit }}</span>
        </span>
        <span v-if="stagePlan?.hint">{{ stagePlan.hint }}</span>
      </label>
      <section v-if="process" class="flex flex-col gap-2 rounded-md border border-border p-3 sm:col-span-2" aria-label="预计领料">
        <div class="flex items-center justify-between gap-3">
          <div><b class="text-foreground">预计领料</b><span class="ml-2">用于备料，不占用或扣减库存</span></div>
          <Button size="small" :loading="previewLoading" :disabled="!previewRequest" @click="calculateMaterials">重新计算</Button>
        </div>
        <p v-if="!previewRequest" class="m-0">{{ process === 'SLICE' ? '选择领料板材、填写单层厚度和计划片数后，按板厚除以单层厚度向下取整，计算预计领料张数。' : selectsInput ? '选择领料板材，填写产出规格和计划数量后，自动计算该板材的预计用量。' : '填写本工序的产出规格和计划数量后，自动计算预计领料。' }}</p>
        <p v-else-if="previewLoading" class="m-0" role="status">正在按计划产出计算预计领料…</p>
        <p v-if="previewError" class="m-0 text-destructive" role="alert">{{ previewError }}</p>
        <template v-if="currentPreview">
          <p v-if="currentPreview.basis" class="m-0">{{ dimensionTextInMm(currentPreview.basis) }}</p>
          <div v-if="currentPreview.inputs.length" class="overflow-x-auto">
            <table class="w-full text-left text-xs">
              <thead class="bg-muted/40"><tr><th class="p-2 font-medium">物料 / 规格</th><th class="whitespace-nowrap p-2 font-medium">预计用量</th><th class="whitespace-nowrap p-2 font-medium">当前库存</th><th class="whitespace-nowrap p-2 font-medium">缺口</th></tr></thead>
              <tbody>
<tr v-for="(material, index) in currentPreview.inputs" :key="`${material.stage}:${material.code || ''}:${index}`" class="border-t border-border">
                <td class="p-2 text-foreground">{{ plannedMaterialName(material) }}<span v-if="material.perBatch != null" class="ml-2 text-muted-foreground">每锅 {{ previewNumber(material.perBatch) }} {{ material.unit }}</span><div v-if="material.note && material.stage !== 'RAW'" class="mt-1 text-muted-foreground">{{ dimensionTextInMm(material.note) }}</div></td>
                <td class="whitespace-nowrap p-2 text-foreground">{{ previewNumber(material.quantity) }} <span v-if="material.quantity != null">{{ material.unit }}</span></td>
                <td class="whitespace-nowrap p-2">{{ material.available == null ? '—' : previewNumber(material.available) }} <span v-if="material.available != null">{{ material.unit }}</span></td>
                <td class="whitespace-nowrap p-2" :class="Number(material.shortage) > 0 ? 'text-warning' : ''">{{ material.shortage == null ? '—' : previewNumber(material.shortage) }} <span v-if="material.shortage != null">{{ material.unit }}</span></td>
              </tr>
</tbody>
            </table>
          </div>
          <p v-for="warning in currentPreview.warnings" :key="warning" class="m-0 text-warning">{{ dimensionTextInMm(warning) }}</p>
        </template>
        <p class="m-0 leading-5">实际领料的批次、数量在「对应工序车间 → 领料开工」确认；库存不足时允许登记实际领料，并提示补录入库。</p>
      </section>
      <label for="task-form-workers" class="flex flex-col gap-1">
        指派人员
        <Select id="task-form-workers" v-model:value="workerIds" :options="workerOptions" mode="multiple" option-filter-prop="label" :placeholder="process ? '留空则进入任务大厅' : '先选工序'" />
      </label>
      <label for="task-form-reason" class="flex flex-col gap-1 sm:col-span-2">
        生产说明（选填）
        <Input id="task-form-reason" v-model:value="reason" :maxlength="300" placeholder="例如 先做正面紫色板材，下午换反面灰色" />
      </label>
      <Alert v-if="errors.length > 0" class="sm:col-span-2" show-icon type="error">
        <template #message><ul class="m-0 list-disc pl-4"><li v-for="e in errors" :key="e">{{ e }}</li></ul></template>
      </Alert>
    </div>
  </Modal>
  <ProductPickerModal :open="productPickerOpen" @close="productPickerOpen = false" @selected="selectProduct" />
  <ProductPickerModal :open="inputPickerOpen" :required-stage="inputStage" :title="`选择预计领用的${ sourceText}`" @close="inputPickerOpen = false" @selected="selectInputProduct" />
</template>
