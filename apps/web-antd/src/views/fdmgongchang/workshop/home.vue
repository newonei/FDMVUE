<script setup lang="ts">
import type { TableColumnsType, TablePaginationConfig } from 'ant-design-vue';

import type { WorkshopOrder } from './order-model';

import type { FdmgongchangFactoryApi } from '#/api/fdmgongchang/factory';
import type { FdmgongchangScheduleApi as ScheduleApi } from '#/api/fdmgongchang/schedule';
import type { FdmgongchangWorkbenchApi as Api } from '#/api/fdmgongchang/workbench';

import { computed, reactive, ref, watch } from 'vue';

import { buildUUID } from '@vben/utils';

import { Alert, AutoComplete, Button, Input, InputNumber, message, Select, Table, Tag } from 'ant-design-vue';

import { batchReportWorkbenchTasks, getWorkbenchBatchOptions } from '#/api/fdmgongchang/workbench';

import TaskMaterials from '../schedule/modules/task-materials.vue';
import { businessError } from '../shared/business-error';
import FactorySwitch from '../shared/factory-switch.vue';
import { dateText, PROCESS_LABELS } from '../shared/schedule';
import { formatQty, sizeText } from '../stage-stock/model';
import { useJob } from '../workbench/use-job';
import { groupWorkshopOrders, isTaskCompleted, mixPlanLines, orderFocus, orderMatches, taskFocus, taskOrderNos, uniqueTasks, WORKSHOP_FOCUS, WORKSHOP_OUTPUT } from './order-model';
import OrdersTable from './orders-table.vue';
import RelatedOrderTable from './related-order-table.vue';

const props = defineProps<{ factories: FdmgongchangFactoryApi.Factory[]; factoryId: null | number; process: string }>();
const emit = defineEmits<{
  changeFactory: [id: number]; refresh: []; reportOrder: [order: Api.Order];
  startActual: [process: Api.Process]; supplementOrder: [order: Api.Order];
}>();
const job = useJob();
const my = computed(() => job.my!);
const process = computed(() => my.value.workshopProcess ?? my.value.processes.find((item) => item.code === props.process)
  ?? my.value.teamProcesses?.find((item) => item.code === props.process));
const title = computed(() => `${props.process === 'LAMINATE' ? '复合（贴合）' : PROCESS_LABELS[props.process] ?? process.value?.label ?? props.process}车间`);
const tasks = computed(() => uniqueTasks((my.value.workshopTasks ?? []).filter((task) => task.process === props.process)));
const orders = computed(() => groupWorkshopOrders(tasks.value));
const keyword = ref('');
const status = ref('ACTIVE');
const visibleOrders = computed(() => orders.value.filter((order) => orderMatches(order, keyword.value)
  && (status.value === 'ALL' || order.tasks.some((task) => status.value === 'ACTIVE' ? !isTaskCompleted(task) : isTaskCompleted(task)))));
const activeCount = computed(() => tasks.value.filter((task) => !isTaskCompleted(task)).length);
const expandedOrderKeys = ref<string[]>([]);
const selectedIds = ref<number[]>([]);
const selectedTasks = computed(() => tasks.value.filter((task) => selectedIds.value.includes(task.id)));
const busy = ref(false);
const submittedIds = ref<number[]>([]);
const warning = ref('');
const reportWarnings = ref<string[]>([]);
let contextVersion = 0;
const request = ref<{ fingerprint: string; requestId: string }>();
interface Draft { good?: number; defect?: number; boardItemCode?: string; foldingType: string }
const drafts = reactive<Record<number, Draft>>({});
const boardOptions = reactive<Record<number, Api.BatchOptions>>({});
const boardLoading = reactive<Record<number, boolean>>({});
const boardErrors = reactive<Record<number, string>>({});
const foldingOptions = ['二折', '三折', '四折', '六折', '八折', '十折', '十二折'].map((value) => ({ value }));
const canReport = (task: ScheduleApi.Task) => !!process.value && !isTaskCompleted(task) && !submittedIds.value.includes(task.id);
const selected = (task: ScheduleApi.Task) => selectedIds.value.includes(task.id);
const taskDraft = (task: ScheduleApi.Task) => drafts[task.id] ??= { good: undefined, defect: 0, foldingType: '' };
async function loadBoards(task: ScheduleApi.Task) {
  if (props.process !== 'MIX' || boardOptions[task.id] || boardLoading[task.id]) return;
  const version = contextVersion;
  boardLoading[task.id] = true; Reflect.deleteProperty(boardErrors, task.id);
  try {
    const result = await getWorkbenchBatchOptions(props.process, task.id);
    if (version !== contextVersion) return;
    boardOptions[task.id] = result; taskDraft(task).boardItemCode = result.defaultBoardItemCode;
  } catch (error) { if (version === contextVersion) boardErrors[task.id] = businessError(error).msg; }
  finally { if (version === contextVersion) boardLoading[task.id] = false; }
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
    const draft = taskDraft(task);
    const good = Number(draft.good ?? 0); const defect = Number(draft.defect ?? 0);
    if (!Number.isFinite(good) || !Number.isFinite(defect) || good < 0 || defect < 0 || good + defect <= 0) {
      warning.value = `任务 #${task.id} 请填写本次完成数量或残次品数量，合计必须大于 0。`; return;
    }
    if (props.process === 'MIX' && !draft.boardItemCode) { warning.value = `任务 #${task.id} 请先选择本次报工的板材。`; return; }
    if (props.process === 'FOLD' && !draft.foldingType.trim()) { warning.value = `任务 #${task.id} 请填写本次折叠类型。`; return; }
    rows.push({ taskId: task.id, goodQuantity: good, defectQuantity: defect,
      expectedActualQuantity: task.actualQuantity ?? 0, expectedDefectQuantity: task.defectQuantity ?? 0,
      ...(props.process === 'MIX' ? { boardItemCode: draft.boardItemCode } : {}),
      ...(props.process === 'FOLD' ? { foldingType: draft.foldingType.trim() } : {}),
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
  } catch (error) { if (version === contextVersion) warning.value = businessError(error).msg; }
  finally { if (version === contextVersion) busy.value = false; }
}
watch(() => job.my, () => { submittedIds.value = []; selectedIds.value = []; });
watch([keyword, status], () => { pageNo.value = 1; });
watch([() => props.factoryId, () => props.process], () => {
  contextVersion++; clearSelection(); expandedOrderKeys.value = []; request.value = undefined;
  submittedIds.value = []; reportWarnings.value = []; busy.value = false; pageNo.value = 1;
  for (const map of [drafts, boardOptions, boardLoading, boardErrors]) for (const key of Object.keys(map)) Reflect.deleteProperty(map, key);
});
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
const taskColumns = computed<TableColumnsType<ScheduleApi.Task>>(() => [
  { key: 'task', title: '任务 / 产品', width: 195 },
  { key: 'focus', title: WORKSHOP_FOCUS[props.process] ?? '生产要求', width: props.process === 'EMBOSS' ? 340 : 290 },
  { key: 'output', title: reportOutputTitle.value, width: 230 },
  { key: 'progress', title: '计划 / 累计已报', width: 150 },
  { key: 'good', title: '本次完成（良品）', width: 160 }, { key: 'defect', title: '本次残次品', width: 150 },
]);
const inProgress = computed(() => my.value.inProgress.filter((order) => order.process === props.process));
const recentDone = computed(() => (my.value.recentDone ?? []).filter((order) => order.process === props.process));
const independentSlice = computed(() => my.value.processes.find((item) => item.code === 'SLICE' && item.code === props.process));
function taskState(task: ScheduleApi.Task) {
  if (task.status === 'CLOSED') return '已关闭'; if (task.status === 'DONE') return '已完成';
  return Number(task.actualQuantity) + Number(task.defectQuantity ?? 0) > 0 ? '部分报工' : '待报工';
}
/** 合并发泡任务分给各订单明细的张数。 */
function coverLines(task: ScheduleApi.Task) {
  return (task.covers ?? []).map((cover) => {
    const item = task.relatedOrderItems?.find((related) => cover.assignmentId.endsWith(`:${related.itemId}`));
    return `${item ? `${item.orderNo} ${item.productName || item.productCode || ''}`.trim() : cover.assignmentId}：${formatQty(cover.quantity)} ${task.unit ?? '张'}`;
  });
}
const summaryFields = (order: WorkshopOrder) => orderFocus(order, job.options);
const outputSize = (task: ScheduleApi.Task) => sizeText(task.output?.attrs, 'mm') || '按任务规格';
</script>

<template>
  <div class="flex min-h-full min-w-0 flex-col gap-4 p-4 sm:p-5">
    <header class="flex flex-wrap items-center justify-between gap-3">
      <div><h1 class="m-0 text-xl font-bold">{{ title }}</h1><p class="mb-0 mt-1 text-sm text-muted-foreground">每个订单一行，展开查看任务。勾选后填写本次数量，直接批量报工。</p></div>
      <div class="flex items-center gap-3"><FactorySwitch :factories="factories" :value="factoryId" :class="{ 'pointer-events-none opacity-60': busy }" :aria-disabled="busy" @change="!busy && emit('changeFactory', $event)" /><Button :disabled="busy" @click="emit('refresh')">刷新</Button></div>
    </header>
    <Alert v-if="props.process === 'PACK'" type="info" show-icon message="包装工序不再排任务" description="订单拆分下发到最后一道生产工序。已存在的包装工序记录可在历史记录中查看。" />
    <template v-else>
      <div class="flex flex-wrap items-center justify-between gap-3 border-y border-border py-3">
        <div class="flex flex-wrap gap-6 text-sm"><span>订单 <b class="text-base">{{ orders.length }}</b></span><span>待完成任务 <b class="text-base text-primary">{{ activeCount }}</b></span><span class="text-muted-foreground">重点：{{ WORKSHOP_FOCUS[props.process] }}</span></div>
        <div class="flex flex-wrap gap-2"><Input id="workshop-keyword" v-model:value="keyword" allow-clear class="w-64 max-w-full" placeholder="搜索订单、产品或任务编号" aria-label="搜索车间订单" /><Select id="workshop-status" v-model:value="status" :options="[{ label: '有待完成任务', value: 'ACTIVE' }, { label: '全部订单', value: 'ALL' }, { label: '有已完成任务', value: 'DONE' }]" class="w-40" aria-label="订单任务状态" /></div>
      </div>
      <div class="sticky top-0 z-10 flex flex-wrap items-center justify-between gap-3 rounded border border-primary/20 bg-background p-3 shadow-sm">
        <div class="text-sm">已勾选 <strong class="text-base text-primary">{{ selectedIds.length }}</strong> 个任务<span class="ml-3 text-xs text-muted-foreground">本次完成填写良品，残次品单独填写。报工时按任务用料比例自动领料，库存不足可记为负数。</span></div>
        <div class="flex gap-2"><Button :disabled="busy || !selectedIds.length" @click="clearSelection">取消勾选</Button><Button type="primary" :loading="busy" :disabled="!selectedIds.length" @click="batchReport">批量报工</Button></div>
      </div>
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
          <template v-else-if="column.key === 'progress'"><div>共 <b>{{ order.tasks.length }}</b> 项任务</div><div class="mt-1 text-xs text-muted-foreground">待完成 {{ order.tasks.filter((task: ScheduleApi.Task) => !isTaskCompleted(task)).length }} · 已完成 {{ order.tasks.filter(isTaskCompleted).length }}</div></template>
          <template v-else-if="column.key === 'actions'"><Button type="link" :aria-expanded="expandedOrderKeys.includes(order.key)" @click="toggleOrder(order as WorkshopOrder)">{{ expandedOrderKeys.includes(order.key) ? '收起订单' : '展开订单' }}</Button></template>
        </template>
        <template #expandedRowRender="{ record: order }">
          <div class="flex min-w-0 flex-col gap-3 py-2">
            <div class="flex items-center justify-between"><strong>{{ order.orderNo }} · 本车间全部任务</strong><span class="text-xs text-muted-foreground">未完成任务可直接勾选，无需领取</span></div>
            <p v-if="props.process === 'MIX' && summaryFields(order as WorkshopOrder).some((field) => field.label === '克重' && field.value === '未填写')" class="m-0 text-xs text-orange-600">克重未填写，请在采购单生产要求中补全。</p>
            <Table
class="workshop-task-table" :columns="taskColumns" :data-source="order.tasks" :row-selection="selection(order as WorkshopOrder)"
              :custom-row="(task: ScheduleApi.Task) => ({ class: 'workshop-task-row', 'data-task-id': task.id })" row-key="id" :pagination="false" :scroll="{ x: 1260 }" bordered size="small"
>
              <template #bodyCell="{ column, record: task }">
                <template v-if="column.key === 'task'">
                  <div class="font-semibold">任务 #{{ task.id }} <Tag :color="isTaskCompleted(task as ScheduleApi.Task) ? 'default' : 'blue'">{{ taskState(task as ScheduleApi.Task) }}</Tag></div>
                  <div class="mt-1 line-clamp-2 text-sm">{{ task.relatedOrderItems?.map((item: ScheduleApi.RelatedOrderItem) => item.productName || item.productCode).filter(Boolean).join('、') || task.product || '按任务要求生产' }}</div>
                  <div v-if="task.output?.side" class="mt-1"><Tag :color="task.output.side === 'BACK' ? 'purple' : 'blue'">{{ task.output.side === 'FRONT' ? '正面' : task.output.side === 'BACK' ? '反面' : '单色 / 整体' }}</Tag></div>
                  <div v-if="taskOrderNos(task as ScheduleApi.Task).length > 1" class="mt-1 text-xs text-orange-600">合并任务 · 勾选同步，只报一次<br />关联 {{ taskOrderNos(task as ScheduleApi.Task).join('、') }}</div>
                  <ul v-if="coverLines(task as ScheduleApi.Task).length > 1" class="mb-0 mt-1 list-none p-0 text-xs text-muted-foreground"><li v-for="line in coverLines(task as ScheduleApi.Task)" :key="line">{{ line }}</li></ul>
                  <details class="mt-2 text-xs"><summary class="cursor-pointer text-muted-foreground">任务明细 / 用料要求</summary><div class="mt-2"><TaskMaterials :task="task as ScheduleApi.Task" /><p v-if="task.workerNames">负责人：{{ task.workerNames }}</p><p v-if="task.reason">{{ task.reason }}</p><p v-if="task.upstreamNote">{{ task.upstreamNote }}</p></div></details>
                </template>
                <template v-else-if="column.key === 'focus'"><div v-for="field in taskFocus(task as ScheduleApi.Task, job.options)" :key="field.label" class="focus-field my-1.5 flex items-start gap-2"><span class="mt-0.5 shrink-0 rounded px-1.5 py-0.5 text-xs" :class="field.side === 'FRONT' ? 'bg-blue-50 text-blue-700' : field.side === 'BACK' ? 'bg-purple-50 text-purple-700' : 'bg-muted text-muted-foreground'">{{ field.label }}</span><strong class="break-words text-base leading-6" :class="field.value === '未填写' ? 'text-orange-600' : ''">{{ field.value }}</strong></div><div v-if="mixPlanLines(task as ScheduleApi.Task).length" class="mix-plan mt-2 rounded border border-primary/30 bg-primary/5 px-2 py-1"><div v-for="line in mixPlanLines(task as ScheduleApi.Task)" :key="line.label" class="my-1 flex items-start gap-2"><span class="mt-0.5 shrink-0 text-xs text-muted-foreground">{{ line.label }}</span><strong class="break-words leading-6">{{ line.value }}</strong></div></div></template>
                <template v-else-if="column.key === 'output'">
                  <div class="mb-1 font-medium">{{ WORKSHOP_OUTPUT[props.process] }}</div><div class="mb-2 text-xs text-muted-foreground">本工序规格 {{ outputSize(task as ScheduleApi.Task) }}</div>
                  <template v-if="props.process === 'MIX'"><Select :id="`board-${order.key}-${task.id}`" v-model:value="taskDraft(task as ScheduleApi.Task).boardItemCode" class="w-full" :disabled="!selected(task as ScheduleApi.Task) || busy" :loading="boardLoading[task.id]" :options="boardOptions[task.id]?.boards.map((item) => ({ label: item.label, value: item.itemCode })) ?? []" placeholder="勾选任务后选择板材" aria-label="选择报工板材" /><div v-if="boardErrors[task.id]" class="mt-1 text-xs text-red-600">{{ boardErrors[task.id] }} <Button type="link" size="small" @click="loadBoards(task as ScheduleApi.Task)">重试</Button></div></template>
                  <AutoComplete v-else-if="props.process === 'FOLD'" :id="`fold-${order.key}-${task.id}`" v-model:value="taskDraft(task as ScheduleApi.Task).foldingType" class="w-full" :options="foldingOptions" :disabled="!selected(task as ScheduleApi.Task) || busy" :maxlength="50" placeholder="选择或输入，如八折" aria-label="本次折叠类型" />
                </template>
                <template v-else-if="column.key === 'progress'"><div>计划 <b>{{ formatQty(task.quantity) }}</b> {{ task.unit }}</div><div class="mt-1 text-xs">已报良品 {{ formatQty(task.actualQuantity) }} {{ task.unit }}</div><div class="text-xs text-muted-foreground">已报残次 {{ formatQty(task.defectQuantity) }} {{ task.unit }}</div></template>
                <template v-else-if="column.key === 'good'"><InputNumber :id="`good-${order.key}-${task.id}`" v-model:value="taskDraft(task as ScheduleApi.Task).good" class="!w-full" :min="0" :precision="3" :disabled="!selected(task as ScheduleApi.Task) || busy" placeholder="本次良品数" :aria-label="`任务 ${task.id} 本次完成良品数量`" /><span class="mt-1 block text-xs text-muted-foreground">单位：{{ task.unit }}</span></template>
                <template v-else-if="column.key === 'defect'"><InputNumber :id="`defect-${order.key}-${task.id}`" v-model:value="taskDraft(task as ScheduleApi.Task).defect" class="!w-full" :min="0" :precision="3" :disabled="!selected(task as ScheduleApi.Task) || busy" placeholder="残次品数" :aria-label="`任务 ${task.id} 本次残次品数量`" /><span class="mt-1 block text-xs text-muted-foreground">单位：{{ task.unit }}</span></template>
              </template>
            </Table>
            <details class="text-sm"><summary class="cursor-pointer text-muted-foreground">订单产品明细 · {{ order.items.length }} 条</summary><div class="mt-2"><RelatedOrderTable :items="order.items" :options="job.options" /></div></details>
          </div>
        </template>
      </Table>
    </template>
    <details v-if="inProgress.length || recentDone.length" class="border-t border-border pt-3"><summary class="cursor-pointer text-sm text-muted-foreground">历史工序单 / 补登领料（{{ inProgress.length + recentDone.length }}）</summary><OrdersTable v-if="inProgress.length" class="mt-2" :orders="inProgress" :options="job.options" @report="emit('reportOrder', $event)" @supplement="emit('supplementOrder', $event)" /><OrdersTable v-if="recentDone.length" class="mt-2" :orders="recentDone" :options="job.options" completed @supplement="emit('supplementOrder', $event)" /></details>
    <details v-if="independentSlice" class="border-t border-border pt-3"><summary class="cursor-pointer text-sm text-muted-foreground">独立开片生产</summary><p class="my-2 text-xs text-muted-foreground">独立生产不计入已下发任务或订单进度。</p><Button @click="emit('startActual', independentSlice)">开片 · 选择板材</Button></details>
  </div>
</template>
