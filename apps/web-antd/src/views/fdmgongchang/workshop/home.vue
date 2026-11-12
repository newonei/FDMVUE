<script setup lang="ts">
import type { TableColumnsType, TablePaginationConfig } from 'ant-design-vue';

import type { FdmgongchangFactoryApi } from '#/api/fdmgongchang/factory';
import type { FdmgongchangScheduleApi as ScheduleApi } from '#/api/fdmgongchang/schedule';
import type { FdmgongchangWorkbenchApi as Api } from '#/api/fdmgongchang/workbench';

import { computed, ref, watch } from 'vue';

import { Button, Input, Modal, Select, Table, Tag } from 'ant-design-vue';

import { getWorkbenchMates } from '#/api/fdmgongchang/workbench';

import TaskMaterials from '../schedule/modules/task-materials.vue';
import { dimensionTextInMm } from '../shared/dimensions';
import FactorySwitch from '../shared/factory-switch.vue';
import { dateText, PROCESS_LABELS, TASK_STATUS, taskMaterialText } from '../shared/schedule';
import { upstreamBadge } from '../shared/upstream';
import { formatQty } from '../stage-stock/model';
import { useJob } from '../workbench/use-job';
import { orderProductSpec, relatedProductSearch } from './order-details';
import OrdersTable from './orders-table.vue';
import RelatedOrderTable from './related-order-table.vue';

const props = defineProps<{
  factories: FdmgongchangFactoryApi.Factory[];
  factoryId: null | number;
  process: string;
}>();
const emit = defineEmits<{
  changeFactory: [id: number];
  claimTask: [task: ScheduleApi.Task];
  refresh: [];
  reportOrder: [order: Api.Order];
  startActual: [process: Api.Process];
  startTask: [task: ScheduleApi.Task, process: Api.Process, onBehalfOf?: { id: number; name: string }];
  supplementOrder: [order: Api.Order];
}>();

const job = useJob();
const my = computed(() => job.my!);
const process = computed(() => my.value.workshopProcess
  ?? my.value.processes.find((item) => item.code === props.process)
  ?? my.value.teamProcesses?.find((item) => item.code === props.process));
const title = computed(() => `${PROCESS_LABELS[props.process] ?? process.value?.label ?? props.process}车间`);
// 列表可见范围与操作权限分开：看得到同车间任务，不代表可以替其他人领料报工。
const tasks = computed(() => (my.value.workshopTasks ?? []).filter((task) => task.process === props.process));
const mine = computed(() => new Set(my.value.tasks.map((task) => task.id)));
const belongsToMe = (task: ScheduleApi.Task) => mine.value.has(task.id)
  || String(task.workerIds ?? '').split(',').some((id) => id.trim() === String(my.value.userId));
const hall = computed(() => new Set((my.value.hall ?? []).map((task) => task.id)));
const team = computed(() => new Set((my.value.teamTasks ?? []).map((task) => task.id)));
const completed = (task: ScheduleApi.Task) => task.status === 'DONE' || task.status === 'CLOSED';
const canStart = (task: ScheduleApi.Task) => !!process.value && !completed(task) && mine.value.has(task.id);
const canClaim = (task: ScheduleApi.Task) => !completed(task) && hall.value.has(task.id);
const canBehalf = (task: ScheduleApi.Task) => !!process.value && !completed(task) && !mine.value.has(task.id) && team.value.has(task.id);
const inProgress = computed(() => my.value.inProgress.filter((order) => order.process === props.process));
const recentDone = computed(() => (my.value.recentDone ?? []).filter((order) => order.process === props.process));
const runningTask = (id: number) => inProgress.value.some((order) => order.scheduleTaskId === id);
const independentSlice = computed(() => my.value.processes.find((item) => item.code === 'SLICE' && item.code === props.process));
function orderNos(task: ScheduleApi.Task) {
  if (task.relatedOrderNos?.length) return task.relatedOrderNos;
  return task.contractCode ? [task.contractCode] : [];
}
const orderTitle = (task: ScheduleApi.Task) => orderNos(task).length > 1 || (task.covers?.length ?? 0) > 1
  ? '合并订单任务' : orderNos(task)[0] || '备货任务';

const keyword = ref('');
const status = ref('ACTIVE');
const ownership = ref('ALL');
const statusOptions = [
  { label: '未完成任务', value: 'ACTIVE' },
  { label: '全部状态', value: 'ALL' },
  ...Object.entries(TASK_STATUS).map(([value, item]) => ({ label: item.label, value })),
];
const visibleTasks = computed(() => {
  const word = keyword.value.trim().toLocaleLowerCase();
  return tasks.value.filter((task) => {
    if (status.value === 'ACTIVE' && completed(task)) return false;
    if (!['ACTIVE', 'ALL'].includes(status.value) && task.status !== status.value) return false;
    if (ownership.value === 'MINE' && !belongsToMe(task)) return false;
    if (ownership.value === 'CLAIMABLE' && !hall.value.has(task.id)) return false;
    return !word || [...orderNos(task), ...(task.relatedOrderItems ?? []).flatMap((item) => relatedProductSearch(item)), task.contractCode, task.product, task.spec, task.workerNames, task.scheduleNo, task.id]
      .some((value) => String(value ?? '').toLocaleLowerCase().includes(word));
  });
});
const counts = computed(() => ({
  claimed: tasks.value.filter((task) => task.status === 'CLAIMED').length,
  done: tasks.value.filter((task) => task.status === 'DONE').length,
  mine: tasks.value.filter((task) => canStart(task)).length,
  open: tasks.value.filter((task) => task.status === 'OPEN').length,
}));

const columns: TableColumnsType<ScheduleApi.Task> = [
  { key: 'order', title: '订单 / 任务', width: 180 },
  { key: 'products', title: '关联订单产品', width: 280 },
  { key: 'output', title: '本工序生产规格', width: 230 },
  { key: 'quantity', title: '本工序计划 / 实绩', width: 150 },
  { key: 'workers', title: '负责人', width: 100 },
  { key: 'date', title: '日期 / 排序', width: 120 },
  { key: 'status', title: '任务 / 上道状态', width: 210 },
  { key: 'actions', title: '操作', width: 200, fixed: 'right' },
];
const pageNo = ref(1);
const pageSize = ref(20);
const expandedTaskIds = ref<(number | string)[]>([]);
const pagination = computed<TablePaginationConfig>(() => ({
  current: pageNo.value, pageSize: pageSize.value, total: visibleTasks.value.length,
  showSizeChanger: true, pageSizeOptions: ['10', '20', '50', '100'],
  showTotal: (total) => `共 ${total} 项任务`,
}));
function changePage(value: TablePaginationConfig) {
  pageNo.value = value.current ?? 1;
  pageSize.value = value.pageSize ?? 20;
}
watch([keyword, status, ownership, () => props.factoryId], () => {
  pageNo.value = 1;
  expandedTaskIds.value = [];
});
watch(() => visibleTasks.value.length, (length) => {
  pageNo.value = Math.min(pageNo.value, Math.max(1, Math.ceil(length / pageSize.value)));
});
const outputText = (task: ScheduleApi.Task) => task.output
  ? taskMaterialText(task.output) : dimensionTextInMm(task.spec) || '按工序任务要求生产';
const productSummary = (task: ScheduleApi.Task) => (task.relatedOrderItems ?? []).slice(0, 2);
function toggleDetails(task: ScheduleApi.Task) {
  expandedTaskIds.value = expandedTaskIds.value.includes(task.id)
    ? expandedTaskIds.value.filter((id) => id !== task.id) : [...expandedTaskIds.value, task.id];
}

const behalf = ref<{ options: { label: string; value: number }[]; task: ScheduleApi.Task; userId?: number }>();
async function openBehalf(task: ScheduleApi.Task) {
  const mates = await getWorkbenchMates(task.process);
  const first = Number(String(task.workerIds ?? '').split(',').find(Boolean)) || undefined;
  behalf.value = {
    options: mates.map((mate) => ({ label: mate.team ? `${mate.nickname}（${mate.team}）` : mate.nickname, value: mate.userId })),
    task,
    userId: mates.some((mate) => mate.userId === first) ? first : undefined,
  };
}
function confirmBehalf() {
  const value = behalf.value;
  if (!value?.userId || !process.value) return;
  const name = value.options.find((item) => item.value === value.userId)?.label ?? '';
  behalf.value = undefined;
  emit('startTask', value.task, process.value, { id: value.userId, name });
}
</script>

<template>
  <div class="flex min-h-full min-w-0 flex-col gap-4 p-4 sm:p-5">
    <header class="flex flex-wrap items-center justify-between gap-3">
      <div class="flex flex-col gap-1">
        <h1 class="m-0 text-xl font-bold">{{ title }}</h1>
        <p class="m-0 text-sm text-muted-foreground">查看本工序订单任务，领取后领料开工，再登记实际产出。</p>
      </div>
      <div class="flex items-center gap-3">
        <FactorySwitch :factories="factories" :value="factoryId" @change="emit('changeFactory', $event)" />
        <Button @click="emit('refresh')">刷新</Button>
      </div>
    </header>

    <dl class="m-0 flex flex-wrap gap-x-8 gap-y-2 border-y border-border py-3 text-sm">
      <div class="flex items-center gap-2"><dt class="text-muted-foreground">车间待领取</dt><dd class="m-0 font-semibold tabular-nums">{{ counts.open }}</dd></div>
      <div class="flex items-center gap-2"><dt class="text-muted-foreground">车间已接单</dt><dd class="m-0 font-semibold tabular-nums">{{ counts.claimed }}</dd></div>
      <div class="flex items-center gap-2"><dt class="text-muted-foreground">我的未完成任务</dt><dd class="m-0 font-semibold tabular-nums text-primary">{{ counts.mine }}</dd></div>
      <div class="flex items-center gap-2"><dt class="text-muted-foreground">车间已报工</dt><dd class="m-0 font-semibold tabular-nums">{{ counts.done }}</dd></div>
    </dl>

    <section v-if="inProgress.length" class="flex min-w-0 flex-col gap-2">
      <h2 class="m-0 text-base font-semibold">我在本车间的在制工序单</h2>
      <OrdersTable :orders="inProgress" :options="job.options" @report="emit('reportOrder', $event)" @supplement="emit('supplementOrder', $event)" />
    </section>

    <section class="flex min-w-0 flex-col gap-3">
      <div class="flex flex-wrap items-center justify-between gap-3">
        <h2 class="m-0 text-base font-semibold">车间订单任务 <span class="text-sm font-normal text-muted-foreground">{{ visibleTasks.length }} 项</span></h2>
        <div class="flex flex-wrap gap-2">
          <Input id="workshop-keyword" v-model:value="keyword" allow-clear class="w-64 max-w-full" placeholder="搜索订单、产品编码、名称或人员" aria-label="搜索车间任务" />
          <Select id="workshop-status" v-model:value="status" :options="statusOptions" class="w-36" aria-label="任务状态" />
          <Select id="workshop-ownership" v-model:value="ownership" :options="[{ label: '车间全部任务', value: 'ALL' }, { label: '我的任务', value: 'MINE' }, { label: '我可领取', value: 'CLAIMABLE' }]" class="w-36" aria-label="任务归属" />
        </div>
      </div>
      <p class="m-0 text-xs text-muted-foreground">上道未完成的任务提前展示；已接单任务由负责人操作，班组长可按权限代报。展开行查看关联订单产品明细和领料计划。</p>
      <Table
        v-model:expanded-row-keys="expandedTaskIds"
        class="workshop-task-table"
        :columns="columns"
        :data-source="visibleTasks"
        :custom-row="(record: ScheduleApi.Task) => ({ class: 'workshop-task-row', 'data-task-id': record.id })"
        row-key="id"
        :pagination="pagination"
        :scroll="{ x: 1520 }"
        :locale="{ emptyText: tasks.length ? '没有符合筛选条件的任务' : '本车间暂无已下发任务，工厂订单下发后会自动分配到这里' }"
        bordered
        size="small"
        @change="changePage"
      >
        <template #bodyCell="{ column, record: task }">
          <template v-if="column.key === 'order'">
            <div class="break-words font-medium">{{ orderTitle(task as ScheduleApi.Task) }}</div>
            <div v-if="orderTitle(task as ScheduleApi.Task) === '合并订单任务' && orderNos(task as ScheduleApi.Task).length" class="break-words text-xs text-primary">关联订单：{{ orderNos(task as ScheduleApi.Task).join('、') }}</div>
            <div class="mt-1 text-xs text-muted-foreground">任务 #{{ task.id }}</div>
            <div v-if="task.scheduleNo" class="break-all text-xs text-muted-foreground">{{ task.scheduleNo }}</div>
          </template>
          <template v-else-if="column.key === 'products'">
            <div v-for="item in productSummary(task as ScheduleApi.Task)" :key="`${item.orderId }:${ item.itemId}`" class="mb-1">
              <div class="line-clamp-1 text-sm" :title="item.productName ?? ''">{{ item.productName || '未填写产品名称' }}</div>
              <div v-if="item.productCode" class="break-all font-mono text-xs text-muted-foreground">{{ item.productCode }}</div>
              <div class="line-clamp-1 text-xs text-muted-foreground" :title="orderProductSpec(item)">{{ orderProductSpec(item) || '未填写订单产品规格' }}</div>
            </div>
            <Button v-if="task.relatedOrderItems?.length" type="link" size="small" class="!h-auto !p-0 text-xs" :aria-expanded="expandedTaskIds.includes(task.id)" @click="toggleDetails(task as ScheduleApi.Task)">查看 {{ task.relatedOrderItems.length }} 条订单产品明细</Button>
            <span v-else class="text-xs text-muted-foreground">未关联具体订单产品明细</span>
          </template>
          <template v-else-if="column.key === 'output'">
            <div class="break-words">{{ outputText(task as ScheduleApi.Task) }}</div>
            <div v-if="task.output?.code" class="mt-1 break-all font-mono text-xs text-muted-foreground">{{ task.output.code }}</div>
          </template>
          <template v-else-if="column.key === 'quantity'">
            <div class="tabular-nums">计划 <b>{{ formatQty(task.quantity) }}</b> {{ task.unit }}</div>
            <div class="tabular-nums">良品 {{ formatQty(task.actualQuantity) }} {{ task.unit }}</div>
            <div v-if="Number(task.defectQuantity) > 0" class="text-xs text-muted-foreground">残次 {{ formatQty(task.defectQuantity) }} {{ task.unit }}</div>
            <div v-if="Number(task.shortage) > 0" class="text-xs text-warning">差额 {{ formatQty(task.shortage) }} {{ task.unit }}</div>
          </template>
          <template v-else-if="column.key === 'workers'">
            <div>{{ task.workerNames || '待领取' }}</div>
            <Tag v-if="belongsToMe(task as ScheduleApi.Task)" color="blue" class="mt-1">我的任务</Tag>
          </template>
          <template v-else-if="column.key === 'date'">
            <div>{{ task.undated ? (task.process === 'MIX' && task.sequence ? `发泡顺序 ${ task.sequence}` : '不定日期') : dateText(task.workDate) }}</div>
            <div v-if="task.undated" class="mt-1 text-xs text-muted-foreground">下发 {{ dateText(task.workDate) }}</div>
          </template>
          <template v-else-if="column.key === 'status'">
            <Tag :color="TASK_STATUS[(task.status ?? 'OPEN') as ScheduleApi.TaskStatus].color">{{ TASK_STATUS[(task.status ?? 'OPEN') as ScheduleApi.TaskStatus].label }}</Tag>
            <div v-if="upstreamBadge(task.upstreamState)" class="mt-1 text-xs">
              <span class="rounded px-1.5 py-0.5 font-semibold" :class="upstreamBadge(task.upstreamState)!.cls">{{ upstreamBadge(task.upstreamState)!.text }}</span>
            </div>
            <div v-if="task.upstreamNote" class="mt-1 line-clamp-2 text-xs text-muted-foreground" :title="task.upstreamNote">{{ task.upstreamNote }}</div>
          </template>
          <template v-else-if="column.key === 'actions'">
            <div class="task-actions flex flex-wrap gap-2">
              <Button v-if="canClaim(task as ScheduleApi.Task)" data-task-action="claim" size="small" type="primary" @click="emit('claimTask', task as ScheduleApi.Task)">领取任务</Button>
              <Button v-if="canStart(task as ScheduleApi.Task)" data-task-action="start" size="small" type="primary" @click="emit('startTask', task as ScheduleApi.Task, process!)">{{ runningTask(task.id) ? '继续报本工序产出' : '领料开工' }}</Button>
              <Button v-if="canBehalf(task as ScheduleApi.Task)" data-task-action="behalf" size="small" @click="openBehalf(task as ScheduleApi.Task)">组长代报</Button>
              <span v-if="!completed(task as ScheduleApi.Task) && !canStart(task as ScheduleApi.Task) && !canClaim(task as ScheduleApi.Task) && !canBehalf(task as ScheduleApi.Task)" class="text-xs text-muted-foreground">{{ task.workerNames ? '由任务负责人领料、报工' : '待本工序人员领取' }}</span>
              <span v-if="completed(task as ScheduleApi.Task)" class="text-muted-foreground">—</span>
            </div>
          </template>
        </template>
        <template #expandedRowRender="{ record: task }">
          <div class="flex min-w-0 flex-col gap-2 py-2">
            <h3 class="m-0 text-sm font-semibold">关联订单产品明细（{{ task.relatedOrderItems?.length ?? 0 }} 条）</h3>
            <p class="m-0 text-xs text-muted-foreground">下表数量是订单产品数量；本工序计划产出 {{ formatQty(task.quantity) }} {{ task.unit }}，已报良品 {{ formatQty(task.actualQuantity) }} {{ task.unit }}。</p>
            <RelatedOrderTable :items="task.relatedOrderItems ?? []" :options="job.options" />
            <h3 class="m-0 mt-2 text-sm font-semibold">本工序领料与产出要求</h3>
            <TaskMaterials :task="task" />
            <p v-if="!task.output && !task.inputs?.length" class="m-0 text-xs text-muted-foreground">{{ outputText(task as ScheduleApi.Task) }}</p>
            <p v-if="task.reason" class="m-0 text-xs">任务说明：{{ task.reason }}</p>
            <p v-if="task.upstreamNote" class="m-0 text-xs text-muted-foreground">{{ task.upstreamNote }}</p>
            <p v-if="task.shortageNote" class="m-0 text-xs text-warning">差额说明：{{ task.shortageNote }}</p>
            <p v-if="task.closedReason" class="m-0 text-xs text-muted-foreground">关闭原因：{{ task.closedReason }}</p>
          </div>
        </template>
      </Table>
    </section>

    <details v-if="recentDone.length" class="border-t border-border pt-3">
      <summary class="cursor-pointer text-sm font-semibold">我最近完工的工序单 · 补登领料</summary>
      <p class="my-2 text-xs text-muted-foreground">完工 3 天内可补登漏记的实际领料，需要填写原因。</p>
      <OrdersTable :orders="recentDone" :options="job.options" completed @supplement="emit('supplementOrder', $event)" />
    </details>
    <details v-if="independentSlice" class="border-t border-border pt-3">
      <summary class="cursor-pointer text-sm font-semibold">独立开片生产</summary>
      <p class="my-2 text-xs text-muted-foreground">一次领取多种板材，在同一张工序单逐批登记数量；用于独立生产，不计入已下发任务或订单进度。</p>
      <Button @click="emit('startActual', independentSlice)">开片 · 选择板材</Button>
    </details>
    <Modal :open="!!behalf" title="替谁报工" ok-text="下一步" :ok-button-props="{ disabled: !behalf?.userId }" @ok="confirmBehalf" @cancel="behalf = undefined">
      <p class="text-xs text-muted-foreground">工序单记在所选组员名下，计件也算他的；代报人会写在备注里。</p>
      <Select v-if="behalf" v-model:value="behalf.userId" :options="behalf.options" class="w-full" placeholder="选择组员" show-search :filter-option="(input: string, option: any) => String(option?.label ?? '').includes(input)" />
    </Modal>
  </div>
</template>
