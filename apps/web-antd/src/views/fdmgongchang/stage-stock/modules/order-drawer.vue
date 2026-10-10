<script setup lang="ts">
import type { AttrField, InputLine, OutputDraft } from '../model';

import type { FdmgongchangFactoryApi } from '#/api/fdmgongchang/factory';
import type { FdmgongchangScheduleApi } from '#/api/fdmgongchang/schedule';
import type { FdmgongchangStageStockApi as Api } from '#/api/fdmgongchang/stage-stock';
import type { FdmgongchangWageApi } from '#/api/fdmgongchang/wage';

import { computed, onBeforeUnmount, reactive, ref, watch } from 'vue';

import { useUserStore } from '@vben/stores';

import {
  Alert,
  Button,
  Drawer,
  Empty,
  Input,
  InputNumber,
  message,
  Radio,
  Select,
  Spin,
  Table,
} from 'ant-design-vue';

import { getScheduleTasks } from '#/api/fdmgongchang/schedule';
import {
  createOrder,
  getMakeTasks,
  getOrder,
  getOrderOperators,
  getStockPage,
  previewItemCodes,
  reportOrder,
} from '#/api/fdmgongchang/stage-stock';
import { matchWageItems } from '#/api/fdmgongchang/wage';

import {
  attrSummary,
  contractProductText,
  defectRate,
  deriveOutputs,
  EDITABLE_FIELDS,
  formatQty,
  formatRate,
  lineBatch,
  makeLabels,
  makeTaskRemaining,
  nextKey,
  normalizeForStage,
  sumQty,
  toNumber,
  validateOutputs,
} from '../model';
import AttrFields from './attr-fields.vue';

/**
 * 工序单抽屉：
 * - create：选工序 → 从上游库存领料 → 选操作人 → 领料并报完工，或只领料（车间在制）；
 * - report：对在制工序单报产出，可以只登记这一批（继续在制），也可以报完关单。
 */
const props = defineProps<{
  initialStage?: string;
  /** 从「外贸订单 → 安排生产」进入时预选的自制任务。 */
  initialTask?: { assignmentId: string; contractId: string };
  mode: 'create' | 'report';
  options: Api.Options;
  orderId?: number;
}>();
const emit = defineEmits<{ saved: [message: string, outputStage?: string] }>();
const open = defineModel<boolean>('open', { required: true });
const processCode = ref('SLICE');
const sourceStage = ref('BOARD');
const finish = ref(true);
const stockRows = ref<Api.Stock[]>([]);
const stockTotal = ref(0);
const stockLoading = ref(false);
const stockKeyword = ref('');
const quantities = ref<Record<number, null | number>>({});
const sides = ref<Record<number, Api.LaminationSide>>({});
/** 已选领料的库存行，切换搜索后仍保留。 */
const picked = ref<Record<number, Api.Stock>>({});
const outputs = ref<OutputDraft[]>([]);
const touched = ref(false);
const codes = ref<Array<null | string>>([]);
/** 外贸合同的自制任务，工序单从中选择关联订单。 */
const makeTasks = ref<Api.MakeTask[]>([]);
const makeTasksLoading = ref(false);
const linkedAssignmentId = ref<string>();
const linkedTask = computed(() =>
  makeTasks.value.find((t) => t.assignmentId === linkedAssignmentId.value),
);
const makeTaskOptions = computed(() =>
  makeTasks.value
    .filter((t) => makeTaskRemaining(t) > 0 || t.assignmentId === linkedAssignmentId.value)
    .map((t) => ({
      disabled: !t.ready,
      label: `${t.contractCode} · ${t.customerName ?? ''} · ${contractProductText(t)} · 待产 ${formatQty(makeTaskRemaining(t))}${t.unit ?? ''}${t.ready ? '' : '（采购方案未生效）'}`,
      value: t.assignmentId,
    })),
);
async function loadMakeTasks() {
  makeTasksLoading.value = true;
  try {
    makeTasks.value = await getMakeTasks();
  } catch {
    makeTasks.value = [];
  } finally {
    makeTasksLoading.value = false;
  }
}
const meta = reactive({
  remark: '',
});
/** 操作人：本厂在岗、具备这道工序岗位的人（人员岗位里分配）。 */
const userStore = useUserStore();
const operators = ref<FdmgongchangFactoryApi.Operator[]>([]);
const operatorsLoading = ref(false);
const operatorUserId = ref<number>();
const selectedOperator = computed(() =>
  operators.value.find((o) => o.userId === operatorUserId.value),
);
async function loadOperators() {
  operatorsLoading.value = true;
  const code = processCode.value;
  try {
    const list = await getOrderOperators(code);
    if (code !== processCode.value) return;
    operators.value = list;
    const me = Number(userStore.userInfo?.id ?? userStore.userInfo?.userId);
    operatorUserId.value = list.some((o) => o.userId === operatorUserId.value)
      ? operatorUserId.value
      : list.find((o) => o.userId === me)?.userId;
  } catch {
    operators.value = [];
    operatorUserId.value = undefined;
  } finally {
    operatorsLoading.value = false;
  }
}
/**
 * 计件：报产出时一起登记谁按哪个计价项目算多少。项目按产出的宽、长、厚推荐，
 * 默认一行（操作人 + 最匹配的项目，数量 = 这次良品）；压花送片 / 接片这种两人各算全量的，再加一行。
 */
interface PieceLine {
  itemId?: number;
  itemTouched: boolean;
  key: number;
  quantity: null | number;
  quantityTouched: boolean;
  userId?: number;
}
const pieceMatches = ref<FdmgongchangWageApi.Match[]>([]);
const pieceMatchesLoaded = ref(false);
const pieces = ref<PieceLine[]>([]);
let pieceKey = 0;
const pieceItemOptions = computed(() =>
  pieceMatches.value.map((m) => ({
    label: `${m.name}${m.role ? `（${m.role}）` : ''} · ${m.price === null || m.price === undefined ? '未定价' : `${toNumber(m.price)} 元/${m.unit}`}${m.matched ? ' · 推荐' : ''}`,
    value: m.itemId,
  })),
);
const bestMatch = (excludeRole?: null | string) =>
  pieceMatches.value.find((m) => m.matched && (!excludeRole || (m.role && m.role !== excludeRole))) ??
  pieceMatches.value.find((m) => m.matched);
/** 推荐项目里第一行用最匹配的；后加的行优先用不同角色（送片之后是接片）。 */
function defaultItemFor(index: number) {
  if (index === 0) return bestMatch()?.itemId;
  const first = pieceMatches.value.find((m) => m.itemId === pieces.value[0]?.itemId);
  return bestMatch(first?.role)?.itemId;
}
function addPiece(userId?: number) {
  pieces.value.push({
    itemId: undefined,
    itemTouched: false,
    key: ++pieceKey,
    quantity: goodTotal.value > 0 ? goodTotal.value : null,
    quantityTouched: false,
    userId,
  });
  const index = pieces.value.length - 1;
  pieces.value[index]!.itemId = defaultItemFor(index);
}
function removePiece(index: number) {
  pieces.value.splice(index, 1);
}
let matchTimer: ReturnType<typeof setTimeout> | undefined;
const pieceSpec = computed(() => {
  const line =
    outputs.value.find((o) => (toNumber(o.goodQuantity) ?? 0) > 0) ??
    outputs.value[0];
  return {
    length: toNumber(line?.attrs.length) ?? null,
    thickness: toNumber(line?.attrs.thickness) ?? null,
    width: toNumber(line?.attrs.width) ?? null,
  };
});
async function loadPieceMatches() {
  const code = processCode.value;
  try {
    const list = await matchWageItems({ process: code, ...pieceSpec.value });
    if (code !== processCode.value) return;
    pieceMatches.value = list;
  } catch {
    pieceMatches.value = [];
  } finally {
    pieceMatchesLoaded.value = true;
  }
  if (pieces.value.length === 0 && pieceMatches.value.length > 0) {
    addPiece(props.mode === 'report' ? (order.value?.operatorUserId ?? undefined) : operatorUserId.value);
  } else {
    pieces.value.forEach((line, index) => {
      if (!line.itemTouched) line.itemId = defaultItemFor(index);
    });
  }
}
watch(
  () => [open.value, processCode.value, JSON.stringify(pieceSpec.value)],
  () => {
    if (!open.value) return;
    clearTimeout(matchTimer);
    matchTimer = setTimeout(loadPieceMatches, 300);
  },
);
/** 新建时换了操作人，第一行计件的人跟着换（没手动改过的话）。 */
watch(operatorUserId, (id, old) => {
  const first = pieces.value[0];
  if (props.mode === 'create' && first && (first.userId === old || !first.userId)) first.userId = id;
});
function piecePayload(): FdmgongchangWageApi.Piecework[] {
  return pieces.value
    .filter((p) => p.userId && p.itemId && (p.quantity ?? 0) > 0)
    .map((p) => ({ itemId: p.itemId!, quantity: p.quantity!, userId: p.userId! }));
}
function pieceErrors() {
  const problems: string[] = [];
  pieces.value.forEach((p, i) => {
    const filled = [p.userId, p.itemId, (p.quantity ?? 0) > 0].filter(Boolean).length;
    if (filled > 0 && filled < 3)
      problems.push(`计件第 ${i + 1} 行请选人员、计价项目并填写数量，不计件可以删掉这一行。`);
  });
  return problems;
}

/** 关联排单任务（选填）：这道工序前 3 天到明天下发的任务，用来对比计划与实际。 */
const scheduleTasks = ref<FdmgongchangScheduleApi.Task[]>([]);
const scheduleTaskId = ref<number>();
async function loadScheduleTasks() {
  const code = processCode.value;
  try {
    const list = await getScheduleTasks(code);
    if (code === processCode.value) scheduleTasks.value = list;
  } catch {
    scheduleTasks.value = [];
  }
}
const scheduleTaskOptions = computed(() =>
  scheduleTasks.value.map((t) => {
    const date = Array.isArray(t.workDate)
      ? `${t.workDate[1]}-${t.workDate[2]}`
      : String(t.workDate ?? '').slice(5);
    return {
      label: `${date} · ${t.sequence ?? ''}. ${t.contractCode || '备货'} · ${[t.product, t.spec].filter(Boolean).join(' ')} · 计划 ${Number(t.quantity)} / 已做 ${Number(t.actualQuantity)} ${t.unit ?? ''}${t.workerNames ? ` · ${t.workerNames}` : ''}`,
      value: t.id,
    };
  }),
);

/** 报产出：true 报完关单；false 只登记这一批，单子继续在制。 */
const reportFinish = ref(true);
const reportedBefore = computed(() => order.value?.reportCount ?? 0);
const errors = ref<string[]>([]);
const submitting = ref(false);
const order = ref<Api.Order>();
const orderLoading = ref(false);

const labels = computed(() => makeLabels(props.options));
const processOption = computed(() =>
  props.options.processes.find((p) => p.code === processCode.value),
);
const outputStage = computed(() => processOption.value?.outputStage ?? '');
const stageOf = (code?: string) =>
  props.options.stages.find((s) => s.code === code);
const outputStageOption = computed(() => stageOf(outputStage.value));
const sourceStageOption = computed(() => stageOf(sourceStage.value));
const editable = computed<AttrField[]>(
  () => EDITABLE_FIELDS[processCode.value] ?? [],
);
const defaultMaterial = computed(
  () =>
    props.options.materials.find((m) => m.value.toUpperCase() === 'TPE')
      ?.value ?? props.options.materials[0]?.value,
);

const inputs = computed<InputLine[]>(() => {
  if (props.mode === 'report') {
    return (order.value?.inputs ?? []).map((line) => ({
      quantity:
        (toNumber(line.quantity) ?? 0) -
        (toNumber(line.returnedQuantity) ?? 0),
      side: line.laminationSide ?? undefined,
      stock: {
        batchNo: line.batchNo,
        id: line.stockId ?? line.id,
        item: line.item,
        itemCode: line.itemCode,
        location: line.location,
        quantity: line.quantity ?? 0,
        stage: line.stage,
      },
    }));
  }
  return Object.values(picked.value)
    .filter((stock) => (quantities.value[stock.id] ?? 0) > 0)
    .map((stock) => ({
      quantity: quantities.value[stock.id]!,
      side: sides.value[stock.id],
      stock,
    }));
});

const inputColors = computed(
  () =>
    [
      ...new Set(
        inputs.value
          .map((l) => l.stock.item?.color || l.stock.item?.frontColor)
          .filter(Boolean),
      ),
    ] as string[],
);
const inputUnit = computed(
  () => stageOf(inputs.value[0]?.stock.stage ?? sourceStage.value)?.unit ?? '',
);
const inputTotal = computed(() => sumQty(inputs.value.map((l) => l.quantity)));
const goodTotal = computed(() =>
  sumQty(outputs.value.map((o) => o.goodQuantity)),
);
const defectTotal = computed(() =>
  sumQty(outputs.value.map((o) => o.defectQuantity)),
);

/** 没手动改过数量的行，跟着良品合计走。 */
watch(
  () => goodTotal.value,
  (value) => {
    for (const line of pieces.value)
      if (!line.quantityTouched) line.quantity = value > 0 ? value : null;
  },
);

// ===== 打开与重置 =====

function resetPicking() {
  quantities.value = {};
  sides.value = {};
  picked.value = {};
  outputs.value = [];
  touched.value = false;
  codes.value = [];
  errors.value = [];
}

function defaultProcessFor(stage?: string) {
  const list = props.options.processes;
  return (
    list.find((p) => p.sources[0] === stage)?.code ??
    list.find((p) => stage && p.sources.includes(stage))?.code ??
    'SLICE'
  );
}

watch(open, async (value) => {
  if (!value) return;
  resetPicking();
  finish.value = true;
  reportFinish.value = true;
  Object.assign(meta, { remark: '' });
  operatorUserId.value = undefined;
  pieces.value = [];
  scheduleTaskId.value = undefined;
  scheduleTasks.value = [];
  pieceMatches.value = [];
  pieceMatchesLoaded.value = false;
  if (props.mode === 'report' && props.orderId) {
    orderLoading.value = true;
    try {
      order.value = await getOrder(props.orderId);
      processCode.value = order.value.process;
      sourceStage.value = order.value.sourceStage;
      outputs.value = deriveOutputs(
        order.value.process,
        inputs.value,
        defaultMaterial.value,
      );
      void loadOperators();
    } finally {
      orderLoading.value = false;
    }
    return;
  }
  order.value = undefined;
  linkedAssignmentId.value = props.initialTask?.assignmentId;
  void loadMakeTasks();
  const code = defaultProcessFor(props.initialStage);
  processCode.value = code;
  void loadOperators();
  void loadScheduleTasks();
  processCode.value = code;
  const option = props.options.processes.find((p) => p.code === code);
  sourceStage.value =
    props.initialStage && option?.sources.includes(props.initialStage)
      ? props.initialStage
      : (option?.sources[0] ?? 'BOARD');
  stockKeyword.value = '';
  await loadStock();
});

function selectProcess(code: string) {
  if (code === processCode.value) return;
  processCode.value = code;
  sourceStage.value = processOption.value?.sources[0] ?? sourceStage.value;
  resetPicking();
  loadStock();
  loadOperators();
  scheduleTaskId.value = undefined;
  loadScheduleTasks();
}

function selectSource(stage: string) {
  sourceStage.value = stage;
  resetPicking();
  loadStock();
}

// ===== 领料 =====

async function loadStock() {
  stockLoading.value = true;
  try {
    const page = await getStockPage({
      keyword: stockKeyword.value.trim() || undefined,
      pageNo: 1,
      pageSize: 200,
      stage: sourceStage.value,
    });
    stockRows.value = page.list;
    stockTotal.value = page.total;
  } finally {
    stockLoading.value = false;
  }
}

let searchTimer: ReturnType<typeof setTimeout> | undefined;
watch(stockKeyword, () => {
  if (!open.value || props.mode !== 'create') return;
  clearTimeout(searchTimer);
  searchTimer = setTimeout(loadStock, 300);
});

/** 已领的行始终排在前面，搜索后也不会消失。 */
const visibleStock = computed(() => {
  const ids = new Set(stockRows.value.map((s) => s.id));
  const extra = Object.values(picked.value).filter((s) => !ids.has(s.id));
  return [...extra, ...stockRows.value];
});

function setQuantity(stock: Api.Stock, value: null | number) {
  quantities.value[stock.id] = value;
  if (value && value > 0) {
    picked.value[stock.id] = stock;
    if (processCode.value === 'LAMINATE' && !sides.value[stock.id]) {
      const hasFront = Object.entries(sides.value).some(
        ([id, s]) => s === 'FRONT' && (quantities.value[Number(id)] ?? 0) > 0,
      );
      sides.value[stock.id] = hasFront ? 'BACK' : 'FRONT';
    }
  }
}

function setSide(stock: Api.Stock, side: Api.LaminationSide) {
  sides.value[stock.id] = side;
}

const stockColumns = computed(() => [
  { key: 'itemCode', title: '编码' },
  { key: 'attrs', title: '属性' },
  { key: 'batchNo', title: '批次' },
  { align: 'right' as const, key: 'available', title: '可用' },
  { align: 'right' as const, key: 'take', title: '领用数量', width: 140 },
  ...(processCode.value === 'LAMINATE'
    ? [{ key: 'side', title: '贴合面', width: 100 }]
    : []),
]);

// ===== 产出 =====

const inputSignature = computed(() =>
  inputs.value
    .map((l) => `${l.stock.id}:${l.quantity}:${l.side ?? ''}`)
    .join(','),
);
watch(inputSignature, () => {
  if (props.mode === 'create' && !touched.value) {
    outputs.value = deriveOutputs(
      processCode.value,
      inputs.value,
      defaultMaterial.value,
    );
  }
});

function onAttrChanged(index: number, field: AttrField) {
  touched.value = true;
  if (['backColor', 'color', 'frontColor'].includes(field)) {
    const line = outputs.value[index]!;
    line.batchNo = lineBatch(processCode.value, line, inputs.value);
  }
}

function addLine() {
  const base =
    outputs.value.at(-1) ??
    deriveOutputs(processCode.value, inputs.value, defaultMaterial.value)[0];
  if (!base) {
    errors.value = ['先填写领用数量，再添加产出行。'];
    return;
  }
  outputs.value.push({
    attrs: { ...base.attrs },
    batchNo: base.batchNo,
    defectQuantity: undefined,
    goodQuantity: undefined,
    key: nextKey(),
  });
  touched.value = true;
}

function removeLine(index: number) {
  outputs.value.splice(index, 1);
  touched.value = true;
}

function regenerate() {
  touched.value = false;
  outputs.value = deriveOutputs(
    processCode.value,
    inputs.value,
    defaultMaterial.value,
  );
}

let previewTimer: ReturnType<typeof setTimeout> | undefined;
watch(
  () => outputs.value.map((o) => JSON.stringify(o.attrs)).join('|'),
  () => {
    clearTimeout(previewTimer);
    if (!open.value || outputs.value.length === 0) {
      codes.value = [];
      return;
    }
    previewTimer = setTimeout(async () => {
      try {
        codes.value = await previewItemCodes(
          outputs.value.map((o) => ({
            attrs: normalizeForStage(outputStage.value, o.attrs),
            stage: outputStage.value,
          })),
        );
      } catch {
        codes.value = [];
      }
    }, 300);
  },
);
onBeforeUnmount(() => {
  clearTimeout(matchTimer);
  clearTimeout(searchTimer);
  clearTimeout(previewTimer);
});

// ===== 提交 =====

function localErrors() {
  const problems: string[] = [];
  if (props.mode === 'create') {
    if (inputs.value.length === 0) problems.push('请至少填写一行领用数量。');
    for (const line of inputs.value) {
      if (line.quantity > (toNumber(line.stock.quantity) ?? 0)) {
        problems.push(
          `${line.stock.itemCode}（批次 ${line.stock.batchNo}）只剩 ${formatQty(line.stock.quantity)}，领用数量不能超过库存。`,
        );
      }
    }
    if (processCode.value === 'LAMINATE' && inputs.value.length > 0) {
      const used = new Set(inputs.value.map((l) => l.side));
      if (!used.has('FRONT') || !used.has('BACK'))
        problems.push(
          '贴合要同时领正面片材和反面片材，请在「贴合面」里各选一行。',
        );
    }
  }
  if (props.mode === 'create' && operators.value.length === 0) {
    problems.push(
      `还没有人分配「${processOption.value?.label ?? ''}」岗位，请先到 工厂部门 → 人员岗位 里分配。`,
    );
  } else if (props.mode === 'create' && !operatorUserId.value) {
    problems.push('请选择操作人。');
  }
  if (showOutputs.value) {
    const outputErrors = validateOutputs(
      processCode.value,
      outputStage.value,
      outputs.value,
    );
    // 已经报过产出的单，报完关单时可以不再填产出
    const closingOnly =
      props.mode === 'report' &&
      reportFinish.value &&
      reportedBefore.value > 0 &&
      outputPayload().length === 0;
    if (!closingOnly) problems.push(...outputErrors);
    problems.push(...pieceErrors());
  }
  return problems;
}

function outputPayload(): Api.OrderOutput[] {
  return outputs.value
    .filter(
      (o) =>
        (toNumber(o.goodQuantity) ?? 0) + (toNumber(o.defectQuantity) ?? 0) > 0,
    )
    .map((o) => ({
      attrs: normalizeForStage(outputStage.value, o.attrs),
      batchNo: o.batchNo.trim() || undefined,
      defectQuantity: toNumber(o.defectQuantity) ?? 0,
      goodQuantity: toNumber(o.goodQuantity) ?? 0,
    }));
}

async function submit() {
  errors.value = localErrors();
  if (errors.value.length > 0) return;
  submitting.value = true;
  try {
    const out = outputStageOption.value;
    if (props.mode === 'create') {
      await createOrder({
        assignmentId: linkedTask.value?.assignmentId,
        contractId: linkedTask.value?.contractId,
        finish: finish.value,
        inputs: inputs.value.map((l) => ({
          laminationSide: processCode.value === 'LAMINATE' ? l.side : undefined,
          quantity: l.quantity,
          stockId: l.stock.id,
        })),
        operatorUserId: operatorUserId.value,
        outputs: finish.value ? outputPayload() : [],
        pieceworks: finish.value ? piecePayload() : [],
        process: processCode.value,
        remark: meta.remark.trim() || undefined,
        scheduleTaskId: scheduleTaskId.value,
        sourceStage: sourceStage.value,
      });
      emit(
        'saved',
        finish.value
          ? `${processOption.value?.label}已提交：${sourceStageOption.value?.label}扣 ${formatQty(inputTotal.value)} ${inputUnit.value}，${out?.label}入 ${formatQty(goodTotal.value)} ${out?.unit}`
          : `${processOption.value?.label}已领料 ${formatQty(inputTotal.value)} ${inputUnit.value}，进入车间在制`,
        finish.value ? outputStage.value : sourceStage.value,
      );
    } else if (order.value) {
      const payload = outputPayload();
      await reportOrder({
        finish: reportFinish.value,
        id: order.value.id,
        outputs: payload,
        pieceworks: payload.length > 0 ? piecePayload() : [],
      });
      const entered =
        payload.length > 0
          ? `，${out?.label}入 ${formatQty(goodTotal.value)} ${out?.unit}`
          : '';
      emit(
        'saved',
        reportFinish.value
          ? `${order.value.orderNo} 已完工${entered}`
          : `${order.value.orderNo} 已登记一批产出${entered}，单子继续在制`,
        outputStage.value,
      );
    }
    open.value = false;
  } catch {
    // 后端错误已由全局提示展示，保留抽屉内容方便修改
  } finally {
    submitting.value = false;
  }
}

/** 新建时选「只领料」不填产出；报产出时总要显示产出。 */
const showOutputs = computed(() => props.mode === 'report' || finish.value);

const summaryText = computed(() => {
  if (props.mode === 'create' && !finish.value)
    return `领料 ${formatQty(inputTotal.value)} ${inputUnit.value}，完工后再报产出`;
  const unit = outputStageOption.value?.unit ?? '';
  const rate = defectRate(goodTotal.value, defectTotal.value);
  return `领料 ${formatQty(inputTotal.value)} ${inputUnit.value} → 良品 ${formatQty(goodTotal.value)} ${unit}，残次 ${formatQty(defectTotal.value)} ${unit}${rate === null ? '' : `（残次率 ${formatRate(rate)}）`}`;
});

function warnNoPatterns() {
  if (processCode.value === 'ENGRAVE' && props.options.patterns.length === 0) {
    message.warning(
      '还没有雕刻图案，请先到 系统管理 → 字典管理 里给「雕刻图案」添加数据',
    );
  }
}
watch(processCode, warnNoPatterns);
</script>

<template>
  <Drawer
    v-model:open="open"
    :title="
      mode === 'create' ? '新建工序单' : `报产出 · ${order?.orderNo ?? ''}`
    "
    :width="860"
    class="max-w-full"
    destroy-on-close
  >
    <Spin :spinning="orderLoading">
      <div class="flex flex-col gap-6">
        <!-- 1 选择工序 -->
        <section v-if="mode === 'create'" class="flex flex-col gap-2">
          <h3 class="m-0 flex items-center gap-2 text-sm font-semibold">
            <span
              class="inline-flex size-5 items-center justify-center rounded-full bg-primary/10 text-xs text-primary"
              >1</span>
            选择工序
          </h3>
          <Radio.Group
            :value="processCode"
            button-style="solid"
            class="flex flex-wrap gap-y-1.5"
            @change="(e) => selectProcess(String(e.target.value))"
          >
            <Radio.Button
              v-for="p in options.processes"
              :key="p.code"
              :value="p.code"
            >
              {{ p.label }}
            </Radio.Button>
          </Radio.Group>
          <div class="text-xs text-muted-foreground">
            产出入库到
            <b class="text-foreground">{{ outputStageOption?.label }}</b>（{{ outputStageOption?.defaultLocation }}）
          </div>
        </section>

        <!-- 2 领料 -->
        <section class="flex flex-col gap-2">
          <h3
            class="m-0 flex flex-wrap items-center gap-2 text-sm font-semibold"
          >
            <span
              v-if="mode === 'create'"
              class="inline-flex size-5 items-center justify-center rounded-full bg-primary/10 text-xs text-primary"
              >2</span>
            {{ mode === 'create' ? '领料' : '已领料' }}
            <span class="text-xs font-normal text-muted-foreground">
              {{
                mode === 'create'
                  ? '从上游库存领，提交后立即扣库存'
                  : `从${sourceStageOption?.label}领料`
              }}
            </span>
          </h3>
          <template v-if="mode === 'create'">
            <div class="flex flex-wrap items-center gap-3">
              <label
                for="order-source"
                class="flex items-center gap-2 text-xs text-muted-foreground"
              >
                领料来源
                <Select
                  v-if="(processOption?.sources.length ?? 0) > 1"
                  id="order-source"
                  :value="sourceStage"
                  class="w-48"
                  size="small"
                  :options="
                    processOption?.sources.map((code, i) => ({
                      value: code,
                      label: `${stageOf(code)?.label}${i === 0 ? '' : '（跳过中间工序）'}`,
                    }))
                  "
                  @change="(v) => selectSource(String(v))"
                />
                <b v-else class="text-sm text-foreground">{{
                  sourceStageOption?.label
                }}</b>
              </label>
              <Input
                id="order-stock-search"
                v-model:value="stockKeyword"
                allow-clear
                class="w-52"
                placeholder="搜编码或批次"
                size="small"
              />
              <span
                v-if="stockTotal > 200"
                class="text-xs text-muted-foreground"
                >共 {{ stockTotal }} 行，只显示前 200 行，请用搜索缩小范围</span>
            </div>
            <Table
              :columns="stockColumns"
              :data-source="visibleStock"
              :loading="stockLoading"
              :pagination="false"
              :scroll="{ x: 'max-content', y: 300 }"
              row-key="id"
              size="small"
            >
              <template #bodyCell="{ column, record }">
                <template v-if="column.key === 'itemCode'">
                  <span class="font-mono text-xs">{{ record.itemCode }}</span>
                </template>
                <template v-else-if="column.key === 'attrs'">
                  <span class="text-xs">{{
                    attrSummary(record.stage, record.item, labels)
                  }}</span>
                </template>
                <template v-else-if="column.key === 'batchNo'">
                  <span class="font-mono text-xs">{{ record.batchNo }}</span>
                </template>
                <template v-else-if="column.key === 'available'">
                  <span class="tabular-nums">{{
                    formatQty(record.quantity)
                  }}</span>
                  <span class="ml-1 text-xs text-muted-foreground">{{
                    sourceStageOption?.unit
                  }}</span>
                </template>
                <template v-else-if="column.key === 'take'">
                  <InputNumber
                    :id="`order-take-${record.id}`"
                    :value="quantities[record.id] ?? undefined"
                    :min="0"
                    :max="Number(record.quantity)"
                    :precision="3"
                    class="w-28"
                    size="small"
                    :aria-label="`${record.itemCode} 领用数量`"
                    @change="
                      (v) =>
                        setQuantity(
                          record as Api.Stock,
                          (v as null | number | undefined) ?? null,
                        )
                    "
                  />
                </template>
                <template v-else-if="column.key === 'side'">
                  <Select
                    :id="`order-side-${record.id}`"
                    :value="sides[record.id]"
                    :disabled="!(quantities[record.id] ?? 0)"
                    class="w-20"
                    size="small"
                    :options="[
                      { value: 'FRONT', label: '正面' },
                      { value: 'BACK', label: '反面' },
                    ]"
                    aria-label="贴合面"
                    @change="
                      (v) =>
                        setSide(record as Api.Stock, v as Api.LaminationSide)
                    "
                  />
                </template>
              </template>
              <template #emptyText>
                <Empty
                  :description="`${sourceStageOption?.label ?? ''}没有可用库存`"
                />
              </template>
            </Table>
            <Radio.Group v-model:value="finish" class="text-sm">
              <Radio :value="true">领料并报完工</Radio>
              <Radio :value="false">只领料，稍后报完工（进入车间在制）</Radio>
            </Radio.Group>
          </template>
          <div
            v-else
            class="flex flex-col gap-1 rounded-md border border-border p-3 text-xs"
          >
            <div
              v-for="line in inputs"
              :key="line.stock.id"
              class="flex flex-wrap gap-x-3"
            >
              <span class="font-mono">{{ line.stock.itemCode }}</span>
              <span>{{
                attrSummary(line.stock.stage, line.stock.item, labels)
              }}</span>
              <span class="text-muted-foreground">批次
                <span class="font-mono">{{ line.stock.batchNo }}</span></span>
              <b class="tabular-nums">{{ formatQty(line.quantity) }}
                {{ stageOf(line.stock.stage)?.unit }}</b>
              <span
                v-if="
                  Number(
                    order?.inputs?.find((i) => i.stockId === line.stock.id)
                      ?.returnedQuantity ?? 0,
                  ) > 0
                "
                class="text-muted-foreground"
              >（已扣除退回的余料）</span>
              <span v-if="line.side" class="text-muted-foreground">{{
                line.side === 'FRONT' ? '正面' : '反面'
              }}</span>
            </div>
            <div class="text-muted-foreground">
              {{ order?.team }} {{ order?.operatorName }}
            </div>
            <div v-if="reportedBefore > 0" class="text-foreground">
              已报 {{ reportedBefore }} 次：良品
              <b class="tabular-nums">{{ formatQty(order?.goodQuantity) }}</b>，残次
              <b class="tabular-nums">{{ formatQty(order?.defectQuantity) }}</b>
              {{ outputStageOption?.unit }}
            </div>
          </div>
          <Radio.Group
            v-if="mode === 'report'"
            v-model:value="reportFinish"
            class="text-sm"
          >
            <Radio :value="true">报完并关单</Radio>
            <Radio :value="false">只登记这一批，单子继续在制</Radio>
          </Radio.Group>
        </section>

        <!-- 3 产出 -->
        <section v-if="showOutputs" class="flex flex-col gap-2">
          <h3
            class="m-0 flex flex-wrap items-center gap-2 text-sm font-semibold"
          >
            <span
              v-if="mode === 'create'"
              class="inline-flex size-5 items-center justify-center rounded-full bg-primary/10 text-xs text-primary"
              >3</span>
            {{ mode === 'report' && reportedBefore > 0 ? '这一批产出' : '产出入库' }}
            <span class="text-xs font-normal text-muted-foreground">良品入{{ outputStageOption?.label }}库存；残次品只登记数量{{
                mode === 'report' && reportFinish && reportedBefore > 0
                  ? '；没有新产出可以不填，直接关单'
                  : ''
              }}</span>
          </h3>
          <div
            v-if="processCode === 'SLICE'"
            class="text-xs text-muted-foreground"
          >
            一次可以开多种颜色、多种规格，每种一行。每张板开几片由人工填写。
          </div>
          <div
            v-if="outputs.length === 0"
            class="rounded-md border border-dashed border-border p-4 text-center text-xs text-muted-foreground"
          >
            {{
              mode === 'create'
                ? '先在上面填领用数量，产出行会按领料自动带出。'
                : '没有产出行，点「添加产出行」。'
            }}
          </div>
          <div
            v-for="(line, index) in outputs"
            :key="line.key"
            class="flex flex-col gap-2 rounded-md border border-border bg-muted/30 p-3"
          >
            <div class="flex flex-wrap items-center justify-between gap-2">
              <span class="font-mono text-xs">{{
                codes[index] ?? '填完属性后显示编码'
              }}</span>
              <label
                :for="`out-batch-${line.key}`"
                class="flex items-center gap-1.5 text-xs text-muted-foreground"
              >
                批次
                <Input
                  :id="`out-batch-${line.key}`"
                  v-model:value="line.batchNo"
                  :maxlength="128"
                  :placeholder="
                    processCode === 'MIX' ? '保存时自动生成' : '继承领料批次'
                  "
                  class="w-56 font-mono"
                  size="small"
                />
              </label>
            </div>
            <AttrFields
              v-if="editable.length > 0"
              v-model="line.attrs"
              :color-choices="
                processCode === 'SLICE' || processCode === 'LAMINATE'
                  ? inputColors
                  : undefined
              "
              :fields="editable"
              :id-prefix="`out-${line.key}`"
              :options="options"
              @changed="(field) => onAttrChanged(index, field)"
            />
            <div
              v-if="attrSummary(outputStage, line.attrs, labels, editable)"
              class="text-xs text-muted-foreground"
            >
              沿用：{{ attrSummary(outputStage, line.attrs, labels, editable) }}
            </div>
            <div class="flex flex-wrap items-center gap-4">
              <label
                :for="`out-good-${line.key}`"
                class="flex items-center gap-1.5 text-xs text-muted-foreground"
              >
                良品
                <InputNumber
                  :id="`out-good-${line.key}`"
                  v-model:value="line.goodQuantity"
                  :min="0"
                  :precision="3"
                  class="w-28"
                  size="small"
                />
                {{ outputStageOption?.unit }}
              </label>
              <label
                :for="`out-defect-${line.key}`"
                class="flex items-center gap-1.5 text-xs text-muted-foreground"
              >
                残次品
                <InputNumber
                  :id="`out-defect-${line.key}`"
                  v-model:value="line.defectQuantity"
                  :min="0"
                  :precision="3"
                  class="w-28"
                  size="small"
                />
                {{ outputStageOption?.unit }}
              </label>
              <Button
                v-if="outputs.length > 1"
                danger
                size="small"
                type="link"
                @click="removeLine(index)"
              >
                删除这一行
              </Button>
            </div>
          </div>
          <div class="flex items-center gap-2">
            <Button size="small" @click="addLine">＋ 添加产出行</Button>
            <Button
              v-if="mode === 'create'"
              size="small"
              type="link"
              @click="regenerate"
            >
              按领料重新生成
            </Button>
          </div>
        </section>

        <!-- 计件 -->
        <section v-if="showOutputs && pieceMatchesLoaded" class="flex flex-col gap-2">
          <h3 class="m-0 flex flex-wrap items-center gap-2 text-sm font-semibold">
            计件
            <span class="text-xs font-normal text-muted-foreground">按产出规格推荐计价项目；两人各算全量的（如压花送片、接片）各填一行</span>
          </h3>
          <p v-if="pieceMatches.length === 0" class="m-0 text-xs text-muted-foreground">
            这道工序还没有计价项目，可以到 工厂设置 → 计价项目 添加；不填计件也能报产出。
          </p>
          <template v-else>
            <div
              v-for="(line, index) in pieces"
              :key="line.key"
              class="flex flex-wrap items-center gap-2 rounded-md border border-border p-2"
            >
              <Select
                :id="`piece-user-${line.key}`"
                v-model:value="line.userId"
                :aria-label="`计件第 ${index + 1} 行人员`"
                :options="operators.map((o) => ({ label: [o.nickname, o.team].filter(Boolean).join(' · '), value: o.userId }))"
                class="w-40"
                option-filter-prop="label"
                placeholder="人员"
                show-search
                size="small"
              />
              <Select
                :id="`piece-item-${line.key}`"
                :aria-label="`计件第 ${index + 1} 行计价项目`"
                :options="pieceItemOptions"
                :value="line.itemId"
                class="min-w-[260px] flex-1"
                option-filter-prop="label"
                placeholder="计价项目"
                show-search
                size="small"
                @change="(v) => ((line.itemId = v as number), (line.itemTouched = true))"
              />
              <InputNumber
                :id="`piece-qty-${line.key}`"
                :aria-label="`计件第 ${index + 1} 行数量`"
                :min="0"
                :precision="3"
                :value="line.quantity ?? undefined"
                class="w-28"
                size="small"
                @change="(v) => ((line.quantity = (v as null | number | undefined) ?? null), (line.quantityTouched = true))"
              />
              <Button danger size="small" type="link" @click="removePiece(index)">删除</Button>
            </div>
            <div>
              <Button size="small" @click="addPiece()">＋ 加一个人</Button>
            </div>
          </template>
        </section>

        <!-- 4 其他信息 -->
        <section v-if="mode === 'create'" class="flex flex-col gap-2">
          <h3 class="m-0 flex items-center gap-2 text-sm font-semibold">
            <span
              class="inline-flex size-5 items-center justify-center rounded-full bg-primary/10 text-xs text-primary"
              >{{ finish ? 4 : 3 }}</span>
            其他信息
          </h3>
          <div class="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <label
              for="order-contract"
              class="flex flex-col gap-1 text-xs text-muted-foreground sm:col-span-2"
            >
              关联外贸订单（选填）
              <Select
                id="order-contract"
                v-model:value="linkedAssignmentId"
                :loading="makeTasksLoading"
                :not-found-content="makeTasksLoading ? '加载中…' : '外贸合同里暂无分派给工厂的自制任务'"
                :options="makeTaskOptions"
                allow-clear
                option-filter-prop="label"
                placeholder="选择外贸合同的自制任务"
                show-search
              />
              <span v-if="linkedTask && outputStage === 'PACKED'" class="text-primary">
                包装完工后，良品数量会自动回写到合同 {{ linkedTask.contractCode }} 的生产进度。
              </span>
              <span v-else-if="linkedTask">
                包装完工时才回写合同进度，这道工序只做关联记录。
              </span>
            </label>
            <label
              v-if="scheduleTasks.length > 0"
              for="order-schedule-task"
              class="flex flex-col gap-1 text-xs text-muted-foreground sm:col-span-2"
            >
              关联排单任务（选填）
              <Select
                id="order-schedule-task"
                v-model:value="scheduleTaskId"
                :options="scheduleTaskOptions"
                allow-clear
                option-filter-prop="label"
                placeholder="选这张单在做哪个排单任务，用来对比计划与实际"
                show-search
              />
            </label>
            <label
              for="order-operator"
              class="flex flex-col gap-1 text-xs text-muted-foreground"
            >
              操作人
              <Select
                id="order-operator"
                v-model:value="operatorUserId"
                :loading="operatorsLoading"
                :not-found-content="
                  operatorsLoading ? '加载中…' : '还没有人分配这道工序的岗位'
                "
                :options="
                  operators.map((o) => ({
                    label: [o.nickname, o.team, o.deptName]
                      .filter(Boolean)
                      .join(' · '),
                    value: o.userId,
                  }))
                "
                option-filter-prop="label"
                placeholder="选择做这道工序的人"
                show-search
              />
            </label>
            <div class="flex flex-col gap-1 text-xs text-muted-foreground">
              班组
              <span class="flex h-8 items-center text-sm text-foreground">{{
                selectedOperator?.team || '—'
              }}</span>
            </div>
            <label
              for="order-remark"
              class="flex flex-col gap-1 text-xs text-muted-foreground"
            >
              备注
              <Input
                id="order-remark"
                v-model:value="meta.remark"
                :maxlength="500"
                placeholder="选填"
              />
            </label>
          </div>
        </section>
      </div>
    </Spin>
    <template #footer>
      <div class="flex flex-col gap-2">
        <Alert v-if="errors.length > 0" type="error" show-icon>
          <template #message>
            <ul class="m-0 list-disc pl-4">
              <li v-for="e in errors" :key="e">{{ e }}</li>
            </ul>
          </template>
        </Alert>
        <div class="flex flex-wrap items-center justify-between gap-3">
          <span class="text-sm tabular-nums">{{ summaryText }}</span>
          <div class="flex gap-2">
            <Button @click="open = false">取消</Button>
            <Button :loading="submitting" type="primary" @click="submit">
              {{
                mode === 'report'
                  ? reportFinish
                    ? '确认报完并关单'
                    : '登记这一批'
                  : finish
                    ? '提交领料并入库'
                    : '提交领料'
              }}
            </Button>
          </div>
        </div>
      </div>
    </template>
  </Drawer>
</template>
