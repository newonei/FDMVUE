<script setup lang="ts">
import type { TableColumnsType, TablePaginationConfig } from 'ant-design-vue';

import type { LaminationReportDraft } from '../shared/lamination-report';
import type { WorkshopOrder } from './order-model';

import type { FdmgongchangFactoryApi } from '#/api/fdmgongchang/factory';
import type { FdmgongchangScheduleApi as ScheduleApi } from '#/api/fdmgongchang/schedule';
import type { FdmgongchangWorkbenchApi as Api } from '#/api/fdmgongchang/workbench';

import { computed, reactive, ref, watch } from 'vue';

import { useAccess } from '@vben/access';
import { buildUUID } from '@vben/utils';

import { Alert, AutoComplete, Button, Input, InputNumber, message, Modal, Select, Table, Tag } from 'ant-design-vue';

import { reassignScheduleTasks } from '#/api/fdmgongchang/schedule';
import { batchReportWorkbenchTasks, getWorkbenchBatchOptions, getWorkbenchMates } from '#/api/fdmgongchang/workbench';

import DispatchWageCheck from '../schedule/modules/dispatch-wage-check.vue';
import TaskMaterials from '../schedule/modules/task-materials.vue';
import { businessError, reportFailureText } from '../shared/business-error';
import FactorySwitch from '../shared/factory-switch.vue';
import { changeLaminationDefect, changeLaminationGood, laminationDefects, laminationLayers } from '../shared/lamination-report';
import { quantityPrecision } from '../shared/quantity';
import { dateText, PROCESS_LABELS } from '../shared/schedule';
import { formatQty, makeLabels, roundQty, sizeText, toNumber } from '../stage-stock/model';
import { useJob } from '../workbench/use-job';
import { groupWorkshopOrders, mixPlanLines, orderFocus, orderMatches, taskFocus, taskOrderNos, uniqueTasks, WORKSHOP_FOCUS, WORKSHOP_OUTPUT, workshopTaskProgress } from './order-model';
import OrdersTable from './orders-table.vue';
import RelatedOrderTable from './related-order-table.vue';

const props = defineProps<{ factories: FdmgongchangFactoryApi.Factory[]; factoryId: null | number; process: string }>();
const emit = defineEmits<{
  changeFactory: [id: number]; refresh: []; reportOrder: [order: Api.Order];
  startActual: [process: Api.Process]; supplementOrder: [order: Api.Order];
}>();
const job = useJob();
const { hasAccessByCodes } = useAccess();
const canDispatch = computed(() => hasAccessByCodes(['fdmgongchang:schedule:confirm']));
const my = computed(() => job.my!);
const process = computed(() => my.value.workshopProcess ?? my.value.processes.find((item) => item.code === props.process)
  ?? my.value.teamProcesses?.find((item) => item.code === props.process));
const title = computed(() => `${props.process === 'LAMINATE' ? '复合（贴合）' : PROCESS_LABELS[props.process] ?? process.value?.label ?? props.process}车间`);
const tasks = computed(() => uniqueTasks((my.value.workshopTasks ?? []).filter((task) => task.process === props.process)));
const orders = computed(() => groupWorkshopOrders(tasks.value));
const keyword = ref('');
const status = ref('ACTIVE');
const visibleOrders = computed(() => orders.value.filter((order) => orderMatches(order, keyword.value)
  && (status.value === 'ALL' || (status.value === 'ACTIVE' ? order.counts.pending : order.counts.completed) > 0)));
const activeCount = computed(() => tasks.value.filter((task) => workshopTaskProgress(task).group === 'pending').length);
const expandedOrderKeys = ref<string[]>([]);
const selectedIds = ref<number[]>([]);
const selectedTasks = computed(() => tasks.value.filter((task) => selectedIds.value.includes(task.id)));
const busy = ref(false);
const submittedIds = ref<number[]>([]);
const warning = ref('');
const reportWarnings = ref<string[]>([]);
let contextVersion = 0;
const request = ref<{ fingerprint: string; requestId: string }>();
interface Draft extends LaminationReportDraft { taskVersion: string; boardItemCode?: string; foldingType: string; goodEdited?: boolean; operatorUserId?: number }
const drafts = reactive<Record<number, Draft>>({});
const boardOptions = reactive<Record<number, Api.BatchOptions>>({});
const boardLoading = reactive<Record<number, boolean>>({});
const boardErrors = reactive<Record<number, string>>({});
const foldingOptions = ['二折', '三折', '四折', '六折', '八折', '十折', '十二折'].map((value) => ({ value }));
const reportingEnded = (task: ScheduleApi.Task) => task.status === 'DONE' || task.status === 'CLOSED';
const canReport = (task: ScheduleApi.Task) => !!process.value && !reportingEnded(task) && !task.activeOrderId && !submittedIds.value.includes(task.id);
const canAssign = (task: ScheduleApi.Task) => !task.orderCount && !task.activeOrderId && ['CLAIMED', 'OPEN'].includes(task.status ?? 'OPEN');
const dispatchDisabled = computed(() => selectedTasks.value.length === 0 || selectedTasks.value.some((task) => !canAssign(task)));
const operators = ref<FdmgongchangFactoryApi.Operator[]>([]);
const operatorsLoading = ref(false);
const operatorsError = ref('');
const operatorOptions = computed(() => operators.value.map((worker) => ({ label: [worker.nickname, worker.team].filter(Boolean).join(' · '), value: worker.userId })));
const dispatchOpen = ref(false);
const dispatchWorkers = ref<number[]>([]);
async function loadOperators() {
  const version = contextVersion;
  operatorsLoading.value = true; operatorsError.value = '';
  try {
    const result = await getWorkbenchMates(props.process);
    if (version === contextVersion) operators.value = result;
  } catch (error) { if (version === contextVersion) operatorsError.value = businessError(error).msg; }
  finally { if (version === contextVersion) operatorsLoading.value = false; }
}
function openDispatch() {
  if (!canDispatch.value || dispatchDisabled.value || busy.value) return;
  dispatchWorkers.value = []; dispatchOpen.value = true;
}
async function dispatch() {
  if (!canDispatch.value || dispatchDisabled.value || busy.value) return;
  if (dispatchWorkers.value.length === 0) { message.warning('请选择派给谁'); return; }
  const version = contextVersion;
  busy.value = true;
  try {
    const count = await reassignScheduleTasks({ taskIds: selectedIds.value, toWorkerIds: dispatchWorkers.value });
    if (version !== contextVersion) return;
    message.success(`已派发 ${count} 个任务，员工可在「我的工作台」查看并手动领料`);
    dispatchOpen.value = false;
    for (const id of selectedIds.value) Reflect.deleteProperty(drafts, id);
    clearSelection(); emit('refresh');
  } catch (error) { if (version === contextVersion) warning.value = businessError(error).msg; }
  finally { if (version === contextVersion) busy.value = false; }
}
const selected = (task: ScheduleApi.Task) => selectedIds.value.includes(task.id);
function remainingReportQuantity(task: ScheduleApi.Task, planned: unknown) {
  const expected = toNumber(planned);
  if (expected === undefined) return undefined;
  const remaining = roundQty(Math.max(0, expected - (toNumber(task.actualQuantity) ?? 0) - (toNumber(task.defectQuantity) ?? 0)));
  return quantityPrecision(task.unit ?? process.value?.outputUnit) === 0 ? Math.floor(remaining) : remaining;
}
function taskDraft(task: ScheduleApi.Task): Draft {
  const taskVersion = JSON.stringify([task.quantity, task.actualQuantity, task.defectQuantity ?? 0,
    task.sliceBoardYield, task.output, task.inputs, task.workerIds, task.activeOrderId, task.status]);
  const existing = drafts[task.id];
  if (existing?.taskVersion === taskVersion) return existing;
  const quantity = toNumber(task.quantity) ?? 0;
  let planned: number | undefined = quantity;
  if (task.process === 'MIX') {
    planned = toNumber(task.output?.mixPlan?.wholeBatchBoards) ?? quantity;
  } else if (task.process === 'SLICE') {
    planned = toNumber(task.sliceBoardYield);
  }
  const draft: Draft = {
    taskVersion,
    attrs: task.output?.attrs ?? {},
    goodQuantity: reportingEnded(task) ? undefined : remainingReportQuantity(task, planned),
    defectQuantity: 0, foldingType: task.output?.foldingType?.trim() ?? '',
    operatorUserId: (task.workerIds ?? '').split(',').filter(Boolean).length === 1 ? Number(task.workerIds) : undefined,
  };
  if (task.process === 'LAMINATE') laminationLayers(draft);
  drafts[task.id] = draft;
  return drafts[task.id]!;
}
function selectedBoard(task: ScheduleApi.Task) {
  const options = boardOptions[task.id];
  if (!options) return undefined;
  const code = taskDraft(task).boardItemCode;
  return options.boards.find((board) => board.itemCode === code);
}
function boardSelectOptions(task: ScheduleApi.Task) {
  return boardOptions[task.id]?.boards.map((board) => {
    const label = [sizeText(board.attrs, 'mm'), board.itemCode].filter(Boolean).join(' · ');
    const title = [board.mixPlan?.mouldName, board.label].filter(Boolean).join(' · ');
    return { label, value: board.itemCode, searchText: `${label} ${title}`, title };
  }) ?? [];
}
function updateReportBoard(task: ScheduleApi.Task, code: string | undefined) {
  const draft = taskDraft(task);
  draft.boardItemCode = code;
  if (draft.goodEdited) return;
  const board = selectedBoard(task);
  draft.goodQuantity = remainingReportQuantity(task,
    board?.mixPlan?.wholeBatchBoards ?? board?.plannedBoards ?? task.output?.mixPlan?.wholeBatchBoards ?? task.quantity);
}
function updateReportGood(task: ScheduleApi.Task, value: unknown) {
  const draft = taskDraft(task);
  draft.goodQuantity = toNumber(value);
  if (task.process === 'MIX') draft.goodEdited = true;
}
async function loadBoards(task: ScheduleApi.Task) {
  if (props.process !== 'MIX' || boardOptions[task.id] || boardLoading[task.id]) return;
  const version = contextVersion;
  const snapshot = job.my;
  boardLoading[task.id] = true; Reflect.deleteProperty(boardErrors, task.id);
  try {
    const result = await getWorkbenchBatchOptions(props.process, task.id);
    if (version !== contextVersion || snapshot !== job.my) return;
    boardOptions[task.id] = result;
    updateReportBoard(task, selectedBoard(task)?.itemCode ?? result.defaultBoardItemCode);
  } catch (error) { if (version === contextVersion && snapshot === job.my) boardErrors[task.id] = businessError(error).msg; }
  finally { if (version === contextVersion && snapshot === job.my) boardLoading[task.id] = false; }
}
function selectOrderTasks(order: WorkshopOrder, keys: (number | string)[]) {
  const orderIds = new Set(order.tasks.map((task) => task.id));
  selectedIds.value = [...new Set([...selectedIds.value.filter((id) => !orderIds.has(id)),
    ...keys.map(Number).filter((id) => order.tasks.some((task) => task.id === id && canReport(task)))])];
  for (const task of selectedTasks.value) { taskDraft(task); void loadBoards(task); }
}
function selection(order: WorkshopOrder) {
  return { selectedRowKeys: selectedIds.value,
    onChange: (keys: (number | string)[]) => selectOrderTasks(order, keys),
    getCheckboxProps: (task: ScheduleApi.Task) => ({ disabled: busy.value || !canReport(task), name: `选择任务 ${task.id}` }),
  };
}
function toggleOrder(order: WorkshopOrder) {
  expandedOrderKeys.value = expandedOrderKeys.value.includes(order.key)
    ? expandedOrderKeys.value.filter((key) => key !== order.key) : [...expandedOrderKeys.value, order.key];
}
function clearSelection() { selectedIds.value = []; warning.value = ''; }
async function batchReport() {
  if (busy.value || selectedTasks.value.length === 0) return;
  const rows: Api.BatchReportRow[] = [];
  for (const task of selectedTasks.value) {
    if (!canReport(task)) { warning.value = `任务 #${task.id} 当前无法批量报工，请刷新后查看任务状态。`; return; }
    const draft = taskDraft(task);
    const good = Number(draft.goodQuantity ?? 0); const defect = Number(draft.defectQuantity ?? 0);
    if (!Number.isFinite(good) || !Number.isFinite(defect) || good < 0 || defect < 0 || good + defect <= 0) {
      warning.value = `任务 #${task.id} 请填写本次完成数量或残次品数量，合计必须大于 0。`; return;
    }
    if (props.process === 'MIX' && !draft.boardItemCode) { warning.value = `任务 #${task.id} 请先选择本次报工的板材。`; return; }
    if (props.process === 'FOLD' && !draft.foldingType.trim()) { warning.value = `任务 #${task.id} 请填写本次折叠类型。`; return; }
    if (!draft.operatorUserId || !operators.value.some((person) => person.userId === draft.operatorUserId)) {
      warning.value = `任务 #${task.id} 请选择本次实际生产人员，计件将归属该人员。`; return;
    }
    rows.push({ taskId: task.id, operatorUserId: draft.operatorUserId, goodQuantity: good, defectQuantity: defect,
      expectedActualQuantity: task.actualQuantity ?? 0, expectedDefectQuantity: task.defectQuantity ?? 0,
      ...(props.process === 'MIX' ? { boardItemCode: draft.boardItemCode } : {}),
      ...(props.process === 'FOLD' ? { foldingType: draft.foldingType.trim() } : {}),
      ...(props.process === 'LAMINATE' && draft.laminateLayers ? { laminateDefects: laminationDefects(draft) } : {}),
    });
  }
  const fingerprint = JSON.stringify({ process: props.process, rows });
  if (request.value?.fingerprint !== fingerprint) request.value = {
    fingerprint,
    requestId: buildUUID().replace(/^(.{8})(.{4})(.{4})(.{4})(.{12})$/, '$1-$2-$3-$4-$5'),
  };
  const version = contextVersion;
  busy.value = true; warning.value = '';
  try {
    const result = await batchReportWorkbenchTasks({ process: props.process, rows, requestId: request.value.requestId });
    if (version !== contextVersion) return;
    submittedIds.value.push(...rows.map((row) => row.taskId)); selectedIds.value = [];
    for (const row of rows) Reflect.deleteProperty(drafts, row.taskId);
    request.value = undefined; message.success(`已完成 ${result.reported} 个任务的本次报工`);
    reportWarnings.value = result.warnings ?? [];
    emit('refresh');
  } catch (error) {
    if (version === contextVersion) warning.value = reportFailureText(error, true);
  } finally { if (version === contextVersion) busy.value = false; }
}
watch(() => job.my, () => {
  submittedIds.value = []; selectedIds.value = [];
  for (const map of [boardOptions, boardLoading, boardErrors]) for (const key of Object.keys(map)) Reflect.deleteProperty(map, key);
});
watch([keyword, status], () => { pageNo.value = 1; });
watch([() => props.factoryId, () => props.process], () => {
  contextVersion++; clearSelection(); expandedOrderKeys.value = []; request.value = undefined;
  submittedIds.value = []; reportWarnings.value = []; busy.value = false; pageNo.value = 1;
  dispatchOpen.value = false; dispatchWorkers.value = []; operators.value = [];
  for (const map of [drafts, boardOptions, boardLoading, boardErrors]) for (const key of Object.keys(map)) Reflect.deleteProperty(map, key);
});
watch([() => props.factoryId, () => props.process], () => { void loadOperators(); }, { immediate: true });
const pageNo = ref(1); const pageSize = ref(20);
const pagination = computed<TablePaginationConfig>(() => ({ current: pageNo.value, pageSize: pageSize.value, total: visibleOrders.value.length,
  showSizeChanger: true, pageSizeOptions: ['10', '20', '50', '100'], showTotal: (total) => `共 ${total} 个订单` }));
const orderColumns: TableColumnsType<WorkshopOrder> = [
  { key: 'order', title: '订单 / 客户', width: 210 }, { key: 'products', title: '订单产品', width: 220 },
  { key: 'focus', title: '本车间重点', width: 400 }, { key: 'progress', title: '本车间任务', width: 150 },
  { key: 'actions', title: '操作', width: 130, fixed: 'right' },
];
const reportOutputTitle = computed(() => {
  if (props.process === 'MIX') return '报工选择板材';
  if (props.process === 'FOLD') return '报工折叠类型';
  return `报工产出 · ${WORKSHOP_OUTPUT[props.process] ?? '半成品'}`;
});
const taskColumns = computed<TableColumnsType<ScheduleApi.Task>>(() => {
  const isLamination = props.process === 'LAMINATE';
  const output = { key: 'output', title: reportOutputTitle.value, width: 250 };
  return [
    { key: 'task', title: '任务 / 产品', width: 190 },
    { key: 'operator', title: '实际生产 / 计件人员', width: 180 },
    ...(isLamination ? [{ key: 'color', title: '片材颜色', width: 165 }] : []),
    { key: 'good', title: isLamination ? '本次片材良品' : '本次良品', width: 120 },
    { key: 'defect', title: isLamination ? '本次片材残次' : '本次残次品', width: 120 },
    ...(isLamination ? [output] : []),
    { key: 'progress', title: '计划 / 累计已报', width: isLamination ? 205 : 125 },
    { key: 'focus', title: '成品要求', width: 320 },
    ...(isLamination ? [] : [output]),
  ];
});
const inProgress = computed(() => my.value.inProgress.filter((order) => order.process === props.process));
const recentDone = computed(() => (my.value.recentDone ?? []).filter((order) => order.process === props.process));
const independentProcess = computed(() => my.value.processes.find((item) => item.code === props.process));
/** 合并发泡任务分给各订单明细的张数。 */
function coverLines(task: ScheduleApi.Task) {
  return (task.covers ?? []).map((cover) => {
    const item = task.relatedOrderItems?.find((related) => cover.assignmentId.endsWith(`:${related.itemId}`));
    return `${item ? `${item.orderNo} ${item.productName || item.productCode || ''}`.trim() : cover.assignmentId}：${formatQty(cover.quantity)} ${task.unit ?? '张'}`;
  });
}
const summaryFields = (order: WorkshopOrder) => orderFocus(order, job.options);
const outputSize = (task: ScheduleApi.Task) => sizeText(selectedBoard(task)?.attrs ?? task.output?.attrs, 'mm') || '按任务规格';
const colorLabel = (color: string) => makeLabels(job.options).color(color);
function reportedLaminationLayers(task: ScheduleApi.Task) {
  const attrs = task.output?.attrs;
  const counts = task.laminationActuals;
  return [
    { side: '正面', color: attrs?.frontColor, good: counts?.frontGoodQuantity, defect: counts?.frontDefectQuantity },
    { side: '反面', color: attrs?.backColor, good: counts?.backGoodQuantity, defect: counts?.backDefectQuantity },
  ];
}
function adjustedBoards(task: ScheduleApi.Task) {
  const planned = toNumber(selectedBoard(task)?.plannedBoards);
  return planned === toNumber(task.quantity) ? undefined : planned;
}
function linkedSliceText(task: ScheduleApi.Task) {
  const { sliceTaskId, sliceQuantity, sliceBoardYield } = selectedBoard(task) ?? {};
  if (sliceTaskId === null || sliceTaskId === undefined) return '';
  const parts = [`报工后关联开片任务 #${sliceTaskId}`];
  if (sliceQuantity !== null && sliceQuantity !== undefined) parts.push(`计划 ${formatQty(sliceQuantity)} 片`);
  if (sliceBoardYield !== null && sliceBoardYield !== undefined) parts.push(`可开 ${formatQty(sliceBoardYield)} 片`);
  return parts.join(' · ');
}
function sliceBoardInputs(task: ScheduleApi.Task) {
  return (task.inputs ?? []).filter((input) => input.stage === 'BOARD')
    .map((input) => [sizeText(input.attrs, 'mm') || input.name, input.code].filter(Boolean).join(' · '))
    .filter(Boolean).join('；');
}
function reportMixPlanLines(task: ScheduleApi.Task) {
  const board = selectedBoard(task);
  return board?.mixPlan && task.output
    ? mixPlanLines({ ...task, output: { ...task.output, mixPlan: board.mixPlan, recipeBatches: board.recipeBatches } })
    : mixPlanLines(task);
}
const mixSummaryLines = (task: ScheduleApi.Task) => reportMixPlanLines(task).filter((line) => ['密炼锅数', '整锅可出'].includes(line.label));
const mixOutputLines = (task: ScheduleApi.Task) => reportMixPlanLines(task).filter((line) => !['密炼锅数', '整锅可出'].includes(line.label));
</script>

<template>
  <div class="flex min-h-full min-w-0 flex-col gap-3 p-3 sm:p-4">
    <header class="flex flex-wrap items-center justify-between gap-3">
      <div><h1 class="m-0 text-xl font-bold">{{ title }}</h1><p class="mb-0 mt-1 text-sm text-muted-foreground">展开订单后勾选任务，可派给员工在「我的工作台」手动领料、分批报工，也可指定实际人员代报。</p></div>
      <div class="flex flex-wrap items-center gap-3">
        <FactorySwitch :factories="factories" :value="factoryId" :class="{ 'pointer-events-none opacity-60': busy }" :aria-disabled="busy" @change="!busy && emit('changeFactory', $event)" />
        <Button v-if="independentProcess" :disabled="busy" @click="emit('startActual', independentProcess)">
          {{ props.process === 'SLICE' ? '开片 · 选择板材' : `${independentProcess.label} · 独立开单` }}
        </Button>
        <Button :disabled="busy" @click="emit('refresh')">刷新</Button>
      </div>
    </header>
      <div class="flex flex-wrap items-center justify-between gap-3 border-y border-border py-2">
        <div class="flex flex-wrap gap-6 text-sm"><span>订单 <b class="text-base">{{ orders.length }}</b></span><span>待完成任务 <b class="text-base text-primary">{{ activeCount }}</b></span><span class="text-muted-foreground">重点：{{ WORKSHOP_FOCUS[props.process] }}</span></div>
        <div class="flex flex-wrap gap-2"><Input id="workshop-keyword" v-model:value="keyword" allow-clear class="w-64 max-w-full" placeholder="搜索订单、产品或任务编号" aria-label="搜索车间订单" /><Select id="workshop-status" v-model:value="status" :options="[{ label: '有待完成任务', value: 'ACTIVE' }, { label: '全部订单', value: 'ALL' }, { label: '有已完成任务', value: 'DONE' }]" class="w-40" aria-label="订单任务状态" /></div>
      </div>
      <div class="sticky top-0 z-10 flex flex-wrap items-center justify-between gap-3 rounded border border-primary/20 bg-background px-3 py-2 shadow-sm">
        <div class="text-sm">已勾选 <strong class="text-base text-primary">{{ selectedIds.length }}</strong> 个任务<span class="ml-3 text-xs text-muted-foreground">员工自报请先派工；主任代报须选实际人员，按任务用料比例自动领料。已领料任务请回原工序单报工。</span></div>
        <div class="flex gap-2"><Button :disabled="busy || !selectedIds.length" @click="clearSelection">取消勾选</Button><Button v-if="canDispatch" :disabled="busy || dispatchDisabled" @click="openDispatch">派给员工</Button><Button type="primary" :loading="busy" :disabled="!selectedIds.length" @click="batchReport">批量报工</Button></div>
      </div>
      <p v-if="canDispatch && selectedTasks.some((task) => !canAssign(task))" class="m-0 text-xs text-orange-600">已开过工序单的任务不能重新派工，请先核对原作业及剩余数量。</p>
      <Alert v-if="operatorsError" type="error" show-icon :message="`人员加载失败：${operatorsError}`"><template #action><Button size="small" @click="loadOperators">重试</Button></template></Alert>
      <Alert v-if="warning" type="error" show-icon :message="warning" closable @close="warning = ''" />
      <Alert v-if="reportWarnings.length" type="warning" show-icon message="报工已保存，以下事项需要补充处理" closable @close="reportWarnings = []"><template #description><ul class="mb-0 mt-2 list-disc pl-4"><li v-for="item in reportWarnings" :key="item">{{ item }}</li></ul></template></Alert>
      <Table
v-model:expanded-row-keys="expandedOrderKeys" class="workshop-order-table" :columns="orderColumns" :data-source="visibleOrders"
        row-key="key" :custom-row="(order: WorkshopOrder) => ({ class: 'workshop-order-row', 'data-order-key': order.key })" :pagination="pagination" :scroll="{ x: 1110 }"
        :locale="{ emptyText: orders.length ? '没有符合条件的订单' : '本车间暂无已下发订单任务' }" bordered size="middle"
        @change="(value: TablePaginationConfig) => { pageNo = value.current ?? 1; pageSize = value.pageSize ?? 20; }"
>
        <template #bodyCell="{ column, record: order }">
          <template v-if="column.key === 'order'"><div class="break-words font-semibold">{{ order.orderNo }}</div><div class="mt-1 text-xs text-muted-foreground">{{ order.customer || '—' }}</div><div v-if="order.items[0]?.promisedDate || order.items[0]?.requiredDate" class="mt-1 text-xs text-muted-foreground">交期 {{ dateText(order.items[0].promisedDate || order.items[0].requiredDate) }}</div></template>
          <template v-else-if="column.key === 'products'"><div v-for="item in order.items.slice(0, 2)" :key="item.itemId" class="line-clamp-1 text-sm" :title="item.productName">{{ item.productName || item.productCode || '未填写产品名称' }}</div><div v-if="order.items.length > 2" class="text-xs text-muted-foreground">等 {{ order.items.length }} 条产品明细，展开查看</div><div v-if="!order.items.length" class="text-xs text-muted-foreground">未关联具体订单产品明细</div></template>
          <template v-else-if="column.key === 'focus'"><div v-for="field in summaryFields(order as WorkshopOrder)" :key="`${field.label}:${field.value}`" class="mb-1 flex gap-2 text-sm"><span class="shrink-0 text-xs text-muted-foreground">{{ field.label }}</span><strong class="break-words" :title="field.value">{{ field.value }}</strong></div></template>
          <template v-else-if="column.key === 'progress'">
            <div>共 <b>{{ order.tasks.length }}</b> 项任务</div>
            <div class="mt-1 text-xs text-muted-foreground">
              待完成 {{ order.counts.pending }} · 已完成 {{ order.counts.completed }}
              <span v-if="order.counts.handled"> · 差额已处理 {{ order.counts.handled }}</span>
              <span v-if="order.counts.closed"> · 已关闭 {{ order.counts.closed }}</span>
            </div>
          </template>
          <template v-else-if="column.key === 'actions'"><Button type="link" :aria-expanded="expandedOrderKeys.includes(order.key)" @click="toggleOrder(order as WorkshopOrder)">{{ expandedOrderKeys.includes(order.key) ? '收起订单' : '展开订单' }}</Button></template>
        </template>
        <template #expandedRowRender="{ record: order }">
          <div class="flex min-w-0 flex-col gap-2 py-1">
            <div class="flex items-center justify-between"><strong>{{ order.orderNo }} · 本车间全部任务</strong><span class="text-xs text-muted-foreground">未领料任务可派工或代报；已领料任务由原负责人继续</span></div>
            <p v-if="props.process === 'MIX' && summaryFields(order as WorkshopOrder).some((field) => field.label === '克重' && field.value === '未填写')" class="m-0 text-xs text-orange-600">克重未填写，请在采购单生产要求中补全。</p>
            <Table
              class="workshop-task-table" :columns="taskColumns" :data-source="order.tasks" :row-selection="selection(order as WorkshopOrder)"
              :custom-row="(task: WorkshopOrder['tasks'][number]) => ({ class: 'workshop-task-row', 'data-task-id': task.id, 'data-progress-color': task.progress.color })"
              row-key="id" :pagination="false" :scroll="{ x: props.process === 'LAMINATE' ? 1600 : 1355 }" bordered size="small"
>
              <template #bodyCell="{ column, record: task }">
                <template v-if="column.key === 'task'">
                  <div class="flex flex-wrap items-center gap-1 font-semibold">#{{ task.id }} <Tag class="!m-0" :color="task.progress.color">{{ task.progress.label }}</Tag><Tag v-if="task.output?.side" class="!m-0" :color="task.output.side === 'BACK' ? 'purple' : 'blue'">{{ task.output.side === 'FRONT' ? '正面' : task.output.side === 'BACK' ? '反面' : '整体' }}</Tag></div>
                  <div class="mt-0.5 line-clamp-2 text-xs leading-[18px]" :title="task.product">{{ task.relatedOrderItems?.map((item: ScheduleApi.RelatedOrderItem) => item.productName || item.productCode).filter(Boolean).join('、') || task.product || '按任务要求生产' }}</div>
                  <div v-if="taskOrderNos(task as ScheduleApi.Task).length > 1" class="mt-1 text-xs text-orange-600">合并任务 · 勾选同步，只报一次<br />关联 {{ taskOrderNos(task as ScheduleApi.Task).join('、') }}</div>
                  <ul v-if="coverLines(task as ScheduleApi.Task).length > 1" class="mb-0 mt-1 list-none p-0 text-xs text-muted-foreground"><li v-for="line in coverLines(task as ScheduleApi.Task)" :key="line">{{ line }}</li></ul>
                  <div v-if="task.activeOrderId" class="mt-1 text-xs text-orange-700">{{ task.activeOperatorName || '原领料人' }} 已领料 · 工序单 #{{ task.activeOrderId }}<br />请由负责人在「我的工作台 → 正在做」继续报工。</div><div v-else class="mt-1 text-xs text-muted-foreground">{{ task.workerNames ? `已派给 ${task.workerNames}` : '待派给员工' }}</div>
                  <details class="mt-1 text-xs"><summary class="cursor-pointer text-muted-foreground">任务明细 / 用料要求</summary><div class="mt-2"><TaskMaterials :task="task as ScheduleApi.Task" /><p v-if="task.workerNames">负责人：{{ task.workerNames }}</p><p v-if="task.reason">{{ task.reason }}</p><p v-if="task.upstreamNote">{{ task.upstreamNote }}</p></div></details>
                </template>
                <template v-else-if="column.key === 'focus'">
                  <div class="task-focus-fields">
                    <div v-for="field in taskFocus(task as ScheduleApi.Task, job.options)" :key="field.label" class="focus-field" :class="{ 'focus-field-wide': !['克重', '成品数量', '单双色'].includes(field.label), 'focus-field-size': field.label === '成品规格' }">
                      <span class="focus-label" :class="field.side === 'FRONT' ? 'text-blue-700' : field.side === 'BACK' ? 'text-purple-700' : 'text-muted-foreground'">{{ field.label }}</span>
                      <strong class="focus-value" :class="field.value === '未填写' ? 'text-orange-600' : ''">{{ field.value }}</strong>
                    </div>
                  </div>
                  <div v-if="mixSummaryLines(task as ScheduleApi.Task).length" class="mix-plan mt-0.5 border-t border-primary/20 pt-0.5">
                    <div v-for="line in mixSummaryLines(task as ScheduleApi.Task)" :key="line.label" class="flex items-baseline gap-1 leading-[18px]"><span class="shrink-0 text-xs text-muted-foreground">{{ line.label }}</span><strong class="break-words text-[13px]">{{ line.value }}</strong></div>
                  </div>
                </template>
                <template v-else-if="column.key === 'output'">
                  <div class="mb-1 flex flex-wrap items-baseline gap-x-2"><span class="text-sm font-medium">{{ WORKSHOP_OUTPUT[props.process] }}</span><span class="text-xs text-muted-foreground">本工序规格 {{ outputSize(task as ScheduleApi.Task) }}</span></div>
                  <template v-if="props.process === 'SLICE'">
                    <div v-if="sliceBoardInputs(task as ScheduleApi.Task)" class="break-words text-xs text-muted-foreground">领用板材 {{ sliceBoardInputs(task as ScheduleApi.Task) }}</div>
                    <div v-if="task.sliceBoardYield != null" class="text-xs text-muted-foreground">计划用板可开 {{ formatQty(task.sliceBoardYield) }} {{ task.unit }}</div>
                  </template>
                  <template v-if="props.process === 'LAMINATE' && taskDraft(task as ScheduleApi.Task).laminateLayers">
                    <div class="mb-1 font-semibold text-primary">本次贴合良品 {{ formatQty(taskDraft(task as ScheduleApi.Task).goodQuantity) }} {{ task.unit }}</div>
                    <p class="mb-1 text-xs text-muted-foreground">两色好片配对贴合，残次只扣对应颜色，多出的好片保留库存。</p>
                  </template>
                  <template v-if="props.process === 'MIX'">
                    <Select
                      :id="`board-${order.key}-${task.id}`"
                      :value="taskDraft(task as ScheduleApi.Task).boardItemCode"
                      size="small" class="w-full" show-search option-filter-prop="searchText" :dropdown-match-select-width="false"
                      :disabled="!selected(task as ScheduleApi.Task) || busy" :loading="boardLoading[task.id]"
                      :options="boardSelectOptions(task as ScheduleApi.Task)" placeholder="勾选任务后选择板材" aria-label="选择报工板材"
                      @update:value="updateReportBoard(task as ScheduleApi.Task, typeof $event === 'string' ? $event : undefined)"
                    />
                    <div v-if="boardErrors[task.id]" class="mt-1 text-xs text-red-600">{{ boardErrors[task.id] }} <Button type="link" size="small" @click="loadBoards(task as ScheduleApi.Task)">重试</Button></div>
                    <div v-if="boardOptions[task.id]?.boardChangeReason" class="mt-1 text-xs text-muted-foreground">{{ boardOptions[task.id]?.boardChangeReason }}</div>
                    <div v-if="linkedSliceText(task as ScheduleApi.Task)" class="mt-1 text-xs text-muted-foreground">{{ linkedSliceText(task as ScheduleApi.Task) }}</div>
                  </template>
                  <div v-else-if="props.process === 'FOLD' && task.output?.foldingType" class="font-semibold">按订单折叠：{{ task.output.foldingType }}</div>
                  <AutoComplete v-else-if="props.process === 'FOLD'" :id="`fold-${order.key}-${task.id}`" v-model:value="taskDraft(task as ScheduleApi.Task).foldingType" size="small" class="w-full" :options="foldingOptions" :disabled="!selected(task as ScheduleApi.Task) || busy" :maxlength="50" placeholder="选择或输入，如八折" aria-label="本次折叠类型" />
                  <div v-if="mixOutputLines(task as ScheduleApi.Task).length" class="mt-1 text-xs leading-4">
                    <div v-for="line in mixOutputLines(task as ScheduleApi.Task)" :key="line.label" class="flex items-baseline gap-1.5"><span class="shrink-0 text-muted-foreground">{{ line.label }}</span><span class="break-words">{{ line.value }}</span></div>
                  </div>
                </template>
                <template v-else-if="column.key === 'progress'">
                  <div v-if="adjustedBoards(task as ScheduleApi.Task) !== undefined" class="text-base text-primary">选板后计划 <b>{{ formatQty(adjustedBoards(task as ScheduleApi.Task)) }}</b> {{ task.unit }}</div>
                  <div v-else class="text-base">计划 <b>{{ formatQty(task.quantity) }}</b> {{ task.unit }}</div>
                  <div v-if="task.progress.shortage != null" class="mt-1 text-sm font-semibold text-orange-700">
                    良品缺口 {{ formatQty(task.progress.shortage) }} {{ task.unit }}<span v-if="task.shortageHandledAt"> · 差额已处理</span>
                  </div>
                  <template v-if="props.process === 'LAMINATE'">
                    <div class="mt-1 text-sm">已贴合 {{ formatQty(task.actualQuantity) }} {{ task.unit }}</div>
                    <div v-for="layer in reportedLaminationLayers(task as ScheduleApi.Task)" :key="layer.side" class="mt-1 text-xs" data-lamination-progress>
                      <div :class="layer.side === '正面' ? 'text-blue-700' : 'text-purple-700'">{{ layer.side }} · {{ layer.color ? colorLabel(layer.color) : '颜色未记录' }}</div>
                      <div class="text-muted-foreground">
                        正常 {{ layer.good == null ? '未记录' : `${task.laminationActuals?.goodQuantityLowerBound ? '至少 ' : ''}${formatQty(layer.good)} ${task.unit ?? '片'}` }}
                        · 瑕疵 {{ layer.defect == null ? '未分色' : `${formatQty(layer.defect)} ${task.unit ?? '片'}` }}
                      </div>
                    </div>
                  </template>
                  <template v-else>
                    <div class="mt-1 text-sm">已报良品 {{ formatQty(task.actualQuantity) }} {{ task.unit }}</div><div class="text-sm text-muted-foreground">已报残次 {{ formatQty(task.defectQuantity) }} {{ task.unit }}</div>
                  </template>
                </template>
                <template v-else-if="column.key === 'operator'"><Select :id="`operator-${order.key}-${task.id}`" v-model:value="taskDraft(task as ScheduleApi.Task).operatorUserId" class="w-full" size="small" :options="operatorOptions" :loading="operatorsLoading" :disabled="!selected(task as ScheduleApi.Task) || busy" allow-clear show-search option-filter-prop="label" placeholder="选实际生产人员" :aria-label="`任务 ${task.id} 实际生产人员`" /><p class="mb-0 mt-1 text-xs text-muted-foreground">录入：{{ my.userName || '当前登录人' }}；计件归所选人员</p></template>
                <template v-else-if="column.key === 'color'">
                  <div v-for="layer in taskDraft(task as ScheduleApi.Task).laminateLayers" :key="layer.side" class="laminate-color-line text-xs" :class="layer.side === 'FRONT' ? 'text-blue-700' : 'text-purple-700'"><span>{{ layer.side === 'FRONT' ? '正面' : '反面' }} · {{ colorLabel(layer.color) }}</span></div>
                  <span v-if="!taskDraft(task as ScheduleApi.Task).laminateLayers" class="text-xs text-muted-foreground">按任务颜色</span>
                </template>
                <template v-else-if="column.key === 'good'">
                  <template v-if="taskDraft(task as ScheduleApi.Task).laminateLayers">
                    <div v-for="layer in taskDraft(task as ScheduleApi.Task).laminateLayers" :key="layer.side" class="laminate-color-line"><InputNumber :id="`good-${order.key}-${task.id}-${layer.side}`" :value="layer.goodQuantity" size="small" class="!w-full" :addon-after="task.unit" :min="0" :precision="0" :disabled="!selected(task as ScheduleApi.Task) || busy" placeholder="片材良品数" :aria-label="`任务 ${task.id} ${layer.side === 'FRONT' ? '正面' : '反面'} ${colorLabel(layer.color)} 本次片材良品`" @change="changeLaminationGood(taskDraft(task as ScheduleApi.Task), layer.side, $event === null || $event === '' ? undefined : Number($event))" /></div>
                  </template>
                  <InputNumber v-else :id="`good-${order.key}-${task.id}`" :value="taskDraft(task as ScheduleApi.Task).goodQuantity" size="small" class="!w-full" :addon-after="task.unit" :min="0" :precision="quantityPrecision(task.unit)" :disabled="!selected(task as ScheduleApi.Task) || busy" placeholder="本次良品数" :aria-label="`任务 ${task.id} 本次完成良品数量`" @update:value="updateReportGood(task as ScheduleApi.Task, $event)" />
                </template>
                <template v-else-if="column.key === 'defect'">
                  <template v-if="taskDraft(task as ScheduleApi.Task).laminateLayers">
                    <div v-for="layer in taskDraft(task as ScheduleApi.Task).laminateLayers" :key="layer.side" class="laminate-color-line"><InputNumber :id="`defect-${order.key}-${task.id}-${layer.side}`" :value="layer.defectQuantity" size="small" class="!w-full" :addon-after="task.unit" :min="0" :precision="0" :disabled="!selected(task as ScheduleApi.Task) || busy" placeholder="片材残次数" :aria-label="`任务 ${task.id} ${layer.side === 'FRONT' ? '正面' : '反面'} ${colorLabel(layer.color)} 本次片材残次`" @change="changeLaminationDefect(taskDraft(task as ScheduleApi.Task), layer.side, $event === null || $event === '' ? undefined : Number($event))" /></div>
                  </template>
                  <InputNumber v-else :id="`defect-${order.key}-${task.id}`" v-model:value="taskDraft(task as ScheduleApi.Task).defectQuantity" size="small" class="!w-full" :addon-after="task.unit" :min="0" :precision="quantityPrecision(task.unit)" :disabled="!selected(task as ScheduleApi.Task) || busy" placeholder="残次品数" :aria-label="`任务 ${task.id} 本次残次品数量`" />
                </template>
              </template>
            </Table>
            <details class="text-sm"><summary class="cursor-pointer text-muted-foreground">订单产品明细 · {{ order.items.length }} 条</summary><div class="mt-2"><RelatedOrderTable :items="order.items" :options="job.options" /></div></details>
          </div>
        </template>
      </Table>
    <Modal v-model:open="dispatchOpen" title="派给员工" ok-text="确认派工" :confirm-loading="busy" :closable="!busy" :mask-closable="!busy" :keyboard="!busy" :cancel-button-props="{ disabled: busy }" @ok="dispatch">
      <div class="flex flex-col gap-3">
        <p class="m-0">将选中的 {{ selectedIds.length }} 个任务安排到员工的「我的工作台」，员工可核对规格、手选材料并填写实际领取数量。</p>
        <DispatchWageCheck v-if="dispatchOpen && selectedTasks.length" :key="factoryId ?? 0" :tasks="selectedTasks" />
        <Select id="workshop-dispatch-workers" v-model:value="dispatchWorkers" :options="operatorOptions" :loading="operatorsLoading" :disabled="busy" mode="multiple" show-search option-filter-prop="label" placeholder="选择本工序在岗员工" aria-label="派给员工" />
        <Alert type="info" show-icon message="选择多人表示共同负责同一任务" description="由一位负责人领料并在原工序单分批报工；不会拆成多人独立领料的任务。需要各自领料时，请先按分工拆成不同任务。" />
        <p class="m-0 text-xs text-muted-foreground">已经派过人的任务将改为本次所选人员；已开过工序单的任务不能改派。</p>
        <Alert v-if="warning" type="error" :message="warning" />
      </div>
    </Modal>
    <details v-if="inProgress.length || recentDone.length" class="border-t border-border pt-3"><summary class="cursor-pointer text-sm text-muted-foreground">历史工序单 / 补登领料（{{ inProgress.length + recentDone.length }}）</summary><OrdersTable v-if="inProgress.length" class="mt-2" :orders="inProgress" :options="job.options" @report="emit('reportOrder', $event)" @supplement="emit('supplementOrder', $event)" /><OrdersTable v-if="recentDone.length" class="mt-2" :orders="recentDone" :options="job.options" completed @supplement="emit('supplementOrder', $event)" /></details>
  </div>
</template>

<style scoped>
.laminate-color-line {
  display: flex;
  align-items: center;
  min-height: 42px;
}

.workshop-task-table :deep(.ant-table-tbody > tr.workshop-task-row > td) {
  padding: 4px 6px;
  vertical-align: top;
}

.workshop-task-table :deep(.workshop-task-row[data-progress-color='green']) {
  --workshop-task-accent: hsl(var(--success));
}

.workshop-task-table :deep(.workshop-task-row[data-progress-color='gold']) {
  --workshop-task-accent: hsl(var(--warning));
}

.workshop-task-table :deep(.ant-table-tbody > .workshop-task-row[data-progress-color] > td) {
  background-color: color-mix(in srgb, var(--workshop-task-accent) 14%, hsl(var(--background)));
}

.workshop-task-table :deep(.ant-table-tbody > .workshop-task-row[data-progress-color]:hover > td),
.workshop-task-table :deep(.ant-table-tbody > .workshop-task-row[data-progress-color] > .ant-table-cell-row-hover),
.workshop-task-table :deep(.ant-table-tbody > .workshop-task-row[data-progress-color].ant-table-row-selected > td) {
  background-color: color-mix(in srgb, var(--workshop-task-accent) 22%, hsl(var(--background)));
}

.workshop-task-table :deep(.ant-table) {
  font-size: 13px;
  line-height: 18px;
}

.workshop-task-table :deep(.ant-table-thead > tr > th) {
  padding: 5px 6px;
}

.workshop-task-table :deep(.ant-tag) {
  padding-inline: 4px;
  font-size: 11px;
  line-height: 16px;
}

.task-focus-fields {
  display: flex;
  flex-wrap: wrap;
  gap: 0 12px;
}

.focus-field {
  display: flex;
  gap: 4px;
  align-items: baseline;
  order: 1;
  min-width: 0;
  line-height: 18px;
}

.focus-field-wide {
  flex-basis: 100%;
  order: 2;
}

.focus-field-size {
  order: 0;
}

.focus-label {
  flex-shrink: 0;
  font-size: 12px;
}

.focus-value {
  font-size: 14px;
  line-height: 18px;
  overflow-wrap: anywhere;
}
</style>
