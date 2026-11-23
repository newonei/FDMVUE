<script setup lang="ts">
import type { OrderDraft } from '../order-report';

import type { FdmgongchangScheduleApi } from '#/api/fdmgongchang/schedule';
import type { FdmgongchangWorkbenchApi as Api } from '#/api/fdmgongchang/workbench';

import { computed, ref, watch } from 'vue';

import { Button, Checkbox, Empty, Input, message, Modal, Select } from 'ant-design-vue';

import { getWorkbenchMates } from '#/api/fdmgongchang/workbench';

import { dimensionTextInMm } from '../../shared/dimensions';
import { attrSummary, formatQty, makeLabels, toNumber } from '../../stage-stock/model';
import { useJob } from '../use-job';
import BatchWorkbench from './batch-workbench.vue';
import RunningReportRow from './running-report-row.vue';

const emit = defineEmits<{
  batchSaved: [];
  orderDetails: [draft: OrderDraft];
  reportOrder: [draft: OrderDraft];
  startActual: [process: Api.Process];
  startTask: [
    task: FdmgongchangScheduleApi.Task,
    process: Api.Process,
    onBehalfOf?: { id: number; name: string },
  ];
}>();
const job = useJob();

const my = computed(() => job.my!);
const processOf = (code: string) => my.value.processes.find((p) => p.code === code);
const processTitle = (code: string) => {
  const process = processOf(code) ?? teamProcessOf(code);
  return process ? `${process.label} · ${process.outputLabel}` : code;
};
const stageUnit = (order: Api.Order) =>
  processOf(order.process)?.outputUnit ?? job.options?.stages.find((s) => s.code === order.outputStage)?.unit;

const myTasks = computed(() => my.value.tasks.filter((t) => processOf(t.process)));

/** 组长代报：组员的任务（自己的不重复列）。 */
const teamTasks = computed(() => {
  const mine = new Set(myTasks.value.map((t) => t.id));
  return (my.value.teamTasks ?? []).filter((t) => !mine.has(t.id) && teamProcessOf(t.process));
});
const teamProcessOf = (code: string) => (my.value.teamProcesses ?? []).find((p) => p.code === code);
const behalf = ref<{ options: { label: string; value: number }[]; task: FdmgongchangScheduleApi.Task; userId?: number }>();

/** 选替谁报：有人接了默认是接单的人。 */
async function openBehalf(task: FdmgongchangScheduleApi.Task) {
  const mates = await getWorkbenchMates(task.process);
  const first = Number(String(task.workerIds ?? '').split(',').find(Boolean)) || undefined;
  behalf.value = {
    options: mates.map((m) => ({ label: m.team ? `${m.nickname}（${m.team}）` : m.nickname, value: m.userId })),
    task,
    userId: mates.some((m) => m.userId === first) ? first : undefined,
  };
}

function confirmBehalf() {
  const b = behalf.value;
  if (!b?.userId) return;
  const name = b.options.find((o) => o.value === b.userId)?.label ?? '';
  behalf.value = undefined;
  emit('startTask', b.task, teamProcessOf(b.task.process)!, { id: b.userId, name });
}
const labels = computed(() => makeLabels(job.options));
const outputSpec = (task: FdmgongchangScheduleApi.Task) =>
  attrSummary(task.output?.stage ?? '', task.output?.attrs, labels.value, [], 'mm') || dimensionTextInMm(task.output?.name);
const foldingRequirement = (task?: FdmgongchangScheduleApi.Task) => {
  if (task?.process !== 'FOLD') return '';
  return task.output?.foldingType ? `折叠要求：${task.output.foldingType}` : '折叠要求未确认，请联系主任';
};
const inProgress = computed(() => my.value.inProgress.filter((o) => processOf(o.process)));
const runningTaskIds = computed(() => new Set(inProgress.value.map((o) => o.scheduleTaskId)));
const pendingTasks = computed(() => myTasks.value.filter((task) => !runningTaskIds.value.has(task.id) && task.status !== 'DONE' && task.status !== 'CLOSED'));
const recentDone = computed(() => (my.value.recentDone ?? []).filter((order) => processOf(order.process)));
const section = ref<'pending' | 'recent' | 'running'>(job.homeView.section ?? (inProgress.value.length > 0 ? 'running' : 'pending'));
const keyword = ref(job.homeView.keyword);
const page = ref(job.homeView.page);
const pageSize = 10;
const normalized = (value: string) => value.toLocaleLowerCase().replaceAll(/[×*＊]/g, 'x').replaceAll(/\s/g, '');
const searchMatches = (value: unknown, text: string) => normalized(JSON.stringify(value)).includes(normalized(text));
const matches = (value: unknown) => searchMatches(value, keyword.value);
const teamExpanded = ref(false);
const teamKeyword = ref('');
const teamPage = ref(1);
const matchingTeam = computed(() => teamTasks.value.filter((task) => searchMatches([task, `任务 #${task.id}`, outputSpec(task)], teamKeyword.value)));
const teamPageCount = computed(() => Math.max(1, Math.ceil(matchingTeam.value.length / pageSize)));
const visibleTeam = computed(() => matchingTeam.value.slice((teamPage.value - 1) * pageSize, teamPage.value * pageSize));
watch(teamKeyword, () => { teamPage.value = 1; });
watch(teamPageCount, (count) => { teamPage.value = Math.min(teamPage.value, count); });
const tasksById = computed(() => new Map(myTasks.value.map((task) => [task.id, task])));
const taskOf = (order: Api.Order) => order.scheduleTaskId ? tasksById.value.get(order.scheduleTaskId) : undefined;
const taskSearch = (task: FdmgongchangScheduleApi.Task) =>
  [`任务 #${task.id}`, task.contractCode, outputSpec(task), foldingRequirement(task)];
const matchingPending = computed(() => pendingTasks.value.filter((task) => matches(taskSearch(task))));
const matchingOrders = (orders: Api.Order[]) => orders.filter((order) => {
  const task = taskOf(order);
  return matches([order.orderNo, order.contractCode, order.scheduleTaskId ? `任务 #${order.scheduleTaskId}` : '', task && taskSearch(task)]);
});
const matchingRunning = computed(() => matchingOrders(inProgress.value));
const matchingRecent = computed(() => matchingOrders(recentDone.value));
const total = computed(() => {
  if (section.value === 'running') return matchingRunning.value.length;
  if (section.value === 'pending') return matchingPending.value.length;
  return matchingRecent.value.length;
});
const pageCount = computed(() => Math.max(1, Math.ceil(total.value / pageSize)));
const paged = <T,>(rows: T[]) => rows.slice((page.value - 1) * pageSize, page.value * pageSize);
const visiblePending = computed(() => section.value === 'pending' ? paged(matchingPending.value) : []);
const visibleOrders = computed(() => {
  if (section.value === 'pending') return [];
  const orders = section.value === 'running' ? matchingRunning.value : matchingRecent.value;
  return paged(orders).map((order) => ({ order, task: taskOf(order) }));
});
const selected = ref<number[]>([]);
const reportDrafts = new Map<number, OrderDraft>();
const batchMode = ref<'issue' | 'report'>();
const batchLimit = 50;
const pageIds = computed(() => section.value === 'pending'
  ? visiblePending.value.map((task) => task.id)
  : visibleOrders.value.map(({ order }) => order.id));
const checkedOnPage = computed(() => pageIds.value.filter((id) => selected.value.includes(id)).length);
const selectedTasks = computed(() => pendingTasks.value.filter((task) => selected.value.includes(task.id)));
const selectedOrders = computed(() => inProgress.value.filter((order) => selected.value.includes(order.id)));
const batchAction = computed(() => {
  if (section.value !== 'pending') return '批量报工';
  const tasks = selectedTasks.value.length > 0 ? selectedTasks.value : pendingTasks.value;
  return tasks.length > 0 && tasks.every((task) => task.process === 'MIX') ? '批量开工' : '批量领料';
});

function selectRows(ids: number[], checked: boolean) {
  const next = checked
    ? [...new Set([...selected.value, ...ids])]
    : selected.value.filter((id) => !ids.includes(id));
  if (next.length > batchLimit) {
    message.warning(`每批最多选择 ${batchLimit} 项`);
    return;
  }
  selected.value = next;
}

function batchSaved() {
  if (batchMode.value === 'issue') {
    section.value = 'running';
    keyword.value = '';
  } else {
    for (const id of selected.value) reportDrafts.delete(id);
  }
  selected.value = [];
  batchMode.value = undefined;
  emit('batchSaved');
}

watch(section, () => { selected.value = []; });
watch([pendingTasks, inProgress], () => {
  const rows = section.value === 'pending' ? pendingTasks.value : inProgress.value;
  const valid = new Set(rows.map((row) => row.id));
  selected.value = selected.value.filter((id) => valid.has(id));
  for (const [id, draft] of reportDrafts) {
    const order = inProgress.value.find((row) => row.id === id);
    if (!order || (order.reportCount ?? 0) !== (draft.order.reportCount ?? 0)) reportDrafts.delete(id);
  }
});
const planned = (task: FdmgongchangScheduleApi.Task) => task.output?.mixPlan?.wholeBatchBoards ?? task.quantity;
const remaining = (task: FdmgongchangScheduleApi.Task) => Math.max(0, (toNumber(planned(task)) ?? 0) - (toNumber(task.actualQuantity) ?? 0) - (toNumber(task.defectQuantity) ?? 0));
const taskUnit = (task: FdmgongchangScheduleApi.Task) => task.output?.unit ?? task.unit ?? processOf(task.process)?.outputUnit;
watch([section, keyword], () => { page.value = 1; });
watch(pageCount, (count) => { page.value = Math.min(page.value, count); }, { immediate: true });
watch([section, keyword, page], () => { job.homeView = { section: section.value, keyword: keyword.value, page: page.value }; }, { immediate: true });
</script>

<template>
  <div class="flex min-h-full flex-col">
    <header class="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 border-b border-border bg-card px-4 py-3">
      <h1 class="m-0 text-xl font-bold">我的任务</h1>
      <span class="break-words text-sm text-muted-foreground">{{ my.factoryName }}</span>
    </header>

    <div v-if="my.processes.length === 0" class="p-6">
      <Empty description="请联系班组长分配工序岗位" />
    </div>

    <main v-else class="flex flex-1 flex-col gap-3 px-3 py-3 sm:px-4">
      <nav aria-label="我的任务分类" class="grid grid-cols-3 gap-1 rounded-lg bg-muted p-1">
        <button
          v-for="tab in ([{ key: 'running', label: '正在做', count: inProgress.length }, { key: 'pending', label: '待开工', count: pendingTasks.length }, { key: 'recent', label: '最近完工', count: recentDone.length }] as const)"
          :key="tab.key"
          :aria-pressed="section === tab.key"
          :class="section === tab.key ? 'bg-card font-bold text-primary shadow-sm' : 'text-foreground'"
          class="min-h-11 rounded-md px-1 text-sm sm:text-base"
          type="button"
          @click="section = tab.key"
        >
          {{ tab.label }} <span class="tabular-nums">{{ tab.count }}</span>
        </button>
      </nav>
      <Input v-model:value="keyword" allow-clear aria-label="搜索我的任务" placeholder="搜索任务、订单号或规格" size="large" class="min-h-11" />
      <div v-if="section !== 'recent' && (total || selected.length)" class="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border bg-card px-3 py-2">
        <div class="flex flex-wrap items-center gap-3">
          <Checkbox
            :checked="!!pageIds.length && checkedOnPage === pageIds.length"
            :disabled="!pageIds.length"
            :indeterminate="checkedOnPage > 0 && checkedOnPage < pageIds.length"
            @update:checked="selectRows(pageIds, $event)"
          >
全选本页
</Checkbox>
          <span class="text-sm tabular-nums text-muted-foreground" aria-live="polite">已选 {{ selected.length }} 项</span>
        </div>
        <div class="flex flex-wrap gap-2">
          <Button v-if="selected.length" @click="selected = []">取消勾选</Button>
          <Button type="primary" :disabled="!selected.length" @click="batchMode = section === 'pending' ? 'issue' : 'report'">
            {{ batchAction }}
          </Button>
        </div>
      </div>
      <p v-if="section === 'recent'" class="m-0 text-sm text-muted-foreground">最近 3 天的完工记录</p>
      <p v-if="total === 0" class="m-0 rounded-md bg-card px-4 py-6 text-center text-base text-muted-foreground">
        {{ keyword ? '没有找到任务' : section === 'running' ? '还没有开工的任务' : section === 'recent' ? '最近没有完工记录' : '没有待开工任务' }}
      </p>

      <ul v-else aria-label="任务列表" role="list" class="m-0 list-none divide-y divide-border rounded-lg border border-border bg-card p-0">
        <li v-for="task in visiblePending" :key="task.id" :data-task-id="task.id">
          <div class="flex items-center gap-3 px-3 py-3 sm:px-4">
            <Checkbox
              class="shrink-0"
              :aria-label="`选择任务 #${task.id}`"
              :checked="selected.includes(task.id)"
              @update:checked="selectRows([task.id], $event)"
            />
            <div class="flex min-w-0 flex-1 flex-col gap-1 break-words">
              <b class="text-base leading-snug">{{ processTitle(task.process) }}</b>
              <span v-if="outputSpec(task)" class="text-base leading-snug">{{ outputSpec(task) }}</span>
              <span v-if="foldingRequirement(task)" class="text-sm" :class="{ 'text-warning': !task.output?.foldingType }">{{ foldingRequirement(task) }}</span>
              <span class="text-sm text-muted-foreground">任务 #{{ task.id }}<template v-if="task.contractCode"> · {{ task.contractCode }}</template></span>
              <span class="text-sm tabular-nums">
                计划 {{ formatQty(planned(task)) }} {{ taskUnit(task) }}<template v-if="remaining(task) < Number(planned(task))"> · 剩余 {{ formatQty(remaining(task)) }} {{ taskUnit(task) }}</template>
              </span>
            </div>
            <button class="min-h-11 shrink-0 rounded-md bg-primary px-3 text-base font-semibold text-primary-foreground" type="button" @click="emit('startTask', task, processOf(task.process)!)">
              {{ task.process === 'MIX' ? '发泡开工' : '领料开工' }}
            </button>
          </div>
        </li>
        <li v-for="{ order, task } in visibleOrders" :key="`order-${ order.id}`" :data-order-id="order.id">
          <div v-if="section === 'running'" class="flex items-start">
            <Checkbox
              class="ml-3 mt-3 shrink-0 sm:ml-4"
              :aria-label="`选择工序单 ${order.orderNo}`"
              :checked="selected.includes(order.id)"
              @update:checked="selectRows([order.id], $event)"
            />
            <RunningReportRow
              class="min-w-0 flex-1"
              :order="order"
              :planned-spec="task && outputSpec(task)"
              @details="emit('orderDetails', $event)"
              @draft="reportDrafts.set(order.id, $event)"
              @report="emit('reportOrder', $event)"
            />
          </div>
          <div v-else class="flex items-center gap-3 px-3 py-3 sm:px-4">
            <div class="flex min-w-0 flex-1 flex-col gap-1 break-words">
              <b class="text-base leading-snug">{{ processTitle(order.process) }}</b>
              <span v-if="task && outputSpec(task)" class="text-base leading-snug">{{ outputSpec(task) }}</span>
              <span v-if="foldingRequirement(task)" class="text-sm" :class="{ 'text-warning': !task?.output?.foldingType }">{{ foldingRequirement(task) }}</span>
              <span class="text-sm text-muted-foreground">
                {{ task ? `任务 #${task.id}` : order.orderNo }}<template v-if="task?.contractCode || order.contractCode"> · {{ task?.contractCode || order.contractCode }}</template>
              </span>
              <span class="text-sm tabular-nums">
                已报良品 {{ formatQty(order.goodQuantity) }} {{ stageUnit(order) }}
              </span>
            </div>
          </div>
        </li>
      </ul>

      <nav v-if="pageCount > 1" aria-label="我的任务分页" class="flex items-center justify-between gap-3">
        <button type="button" :disabled="page <= 1" class="h-11 rounded-md border border-border px-4 disabled:opacity-40" @click="page--">上一页</button>
        <span class="text-xs">第 {{ page }} / {{ pageCount }} 页 · {{ total }} 条</span>
        <button type="button" :disabled="page >= pageCount" class="h-11 rounded-md border border-border px-4 disabled:opacity-40" @click="page++">下一页</button>
      </nav>
      <section aria-label="独立开单" class="flex flex-wrap gap-2">
        <button v-for="process in my.processes" :key="process.code" class="min-h-11 rounded-md border border-border bg-card px-3 text-sm font-semibold" type="button" @click="emit('startActual', process)">
          {{ process.code === 'SLICE' ? '开片 · 选择板材' : `${process.label} · 独立开单` }}
        </button>
      </section>
      <section v-if="teamTasks.length > 0" class="flex flex-col gap-2">
        <h2 class="m-0 text-sm font-bold">
          <button type="button" :aria-expanded="teamExpanded" :aria-label="teamExpanded ? '收起组员任务' : '展开组员任务'" aria-controls="team-tasks-panel" class="flex min-h-11 w-full flex-wrap items-center gap-2 rounded-md border border-border px-3 py-2 text-left" @click="teamExpanded = !teamExpanded">
            <span>组员的任务（组长代报）</span><span class="text-xs font-normal text-muted-foreground">共 {{ teamTasks.length }} 个</span><span class="ml-auto text-xs text-primary">{{ teamExpanded ? '收起' : '展开' }}</span>
          </button>
        </h2>
        <div v-if="teamExpanded" id="team-tasks-panel" class="flex flex-col gap-2">
        <p class="m-0 text-xs text-muted-foreground">组员忘了报可以替他报，工序单和计件仍记在实际生产人员名下。</p>
        <Input v-model:value="teamKeyword" allow-clear aria-label="搜索组员任务" placeholder="搜索订单、任务编号、颜色、规格或折法" />
        <span class="text-xs text-muted-foreground">共 {{ teamTasks.length }} 个任务<template v-if="teamKeyword"> · 匹配 {{ matchingTeam.length }} 个</template></span>
        <p v-if="matchingTeam.length === 0" class="m-0 rounded-md bg-card p-3 text-sm text-muted-foreground">没有匹配的组员任务，请换个关键词。</p>
        <ul class="m-0 flex list-none flex-col divide-y divide-border rounded-lg border border-border bg-card p-0">
          <li v-for="t in visibleTeam" :key="t.id" :data-team-task-id="t.id" class="flex items-center gap-3 px-3 py-3">
            <span class="flex min-w-0 flex-1 flex-col gap-1 break-words">
              <b class="text-base">{{ processTitle(t.process) }}</b>
              <span v-if="outputSpec(t)" class="text-base">{{ outputSpec(t) }}</span>
              <span v-if="foldingRequirement(t)" class="text-sm">{{ foldingRequirement(t) }}</span>
              <span class="text-sm text-muted-foreground">任务 #{{ t.id }} · {{ t.workerNames || '还没人接' }}<template v-if="t.contractCode"> · {{ t.contractCode }}</template></span>
              <span class="text-sm">计划 {{ formatQty(planned(t)) }} {{ taskUnit(t) }}</span>
            </span>
            <button class="min-h-11 shrink-0 rounded-md border border-primary px-3 text-base text-primary" type="button" @click="openBehalf(t)">代报</button>
          </li>
        </ul>
        <nav v-if="teamPageCount > 1" aria-label="组员任务分页" class="flex items-center justify-between gap-3">
          <button type="button" :disabled="teamPage <= 1" class="h-11 rounded-md border border-border px-4 disabled:opacity-40" @click="teamPage--">上一页</button>
          <span class="text-xs">第 {{ teamPage }} / {{ teamPageCount }} 页 · {{ matchingTeam.length }} 条</span>
          <button type="button" :disabled="teamPage >= teamPageCount" class="h-11 rounded-md border border-border px-4 disabled:opacity-40" @click="teamPage++">下一页</button>
        </nav>
        </div>
      </section>
      <BatchWorkbench
        v-if="batchMode"
        :mode="batchMode"
        :orders="selectedOrders"
        :report-drafts="reportDrafts"
        :tasks="selectedTasks"
        @close="batchMode = undefined"
        @saved="batchSaved"
      />
      <Modal
        :open="!!behalf"
        title="替谁报工"
        ok-text="下一步"
        :ok-button-props="{ disabled: !behalf?.userId }"
        @ok="confirmBehalf"
        @cancel="behalf = undefined"
      >
        <p class="text-xs text-muted-foreground">工序单记在他名下，计件也算他的；代报人会写在备注里。</p>
        <Select
          v-if="behalf"
          v-model:value="behalf.userId"
          :options="behalf.options"
          class="w-full"
          placeholder="选组员"
          show-search
          :filter-option="(input: string, o: any) => String(o?.label ?? '').includes(input)"
        />
      </Modal>
    </main>
  </div>
</template>
