<script setup lang="ts">
import type { FdmgongchangScheduleApi } from '#/api/fdmgongchang/schedule';
import type { FdmgongchangWorkbenchApi as Api } from '#/api/fdmgongchang/workbench';

import { computed, ref, watch } from 'vue';

import { Empty, Modal, Select, Spin } from 'ant-design-vue';

import { getWorkbenchMates, getWorkbenchPickList } from '#/api/fdmgongchang/workbench';

import TaskMaterials from '../../schedule/modules/task-materials.vue';
import { factoryToday } from '../../shared/factory-date';
import { upstreamBadge } from '../../shared/upstream';
import { attrSummary, formatQty, makeLabels, toNumber } from '../../stage-stock/model';
import { useJob } from '../use-job';

/**
 * 工人首页：活都从派单来，只有「我的任务」。
 * 一张卡片写清楚做什么（产品规格、订单、数量、日期、排单说明）和要领哪些料，做完了点报工。
 */
const emit = defineEmits<{
  startTask: [
    task: FdmgongchangScheduleApi.Task,
    process: Api.Process,
    onBehalfOf?: { id: number; name: string },
  ];
}>();
const job = useJob();

const my = computed(() => job.my!);
const processOf = (code: string) => my.value.processes.find((p) => p.code === code);
const labelOf = (code: string) => processOf(code)?.label ?? code;
const stageLabel = (code?: string) => job.options?.stages.find((s) => s.code === code)?.label ?? '';
const stageUnit = (code?: string) => job.options?.stages.find((s) => s.code === code)?.unit ?? '';
/** 发泡做板材、开片做已开片板材，不是订单成品：卡片标题写产出的半成品，成品写成「给谁用」。 */
const INTERMEDIATE = new Set(['BOARD', 'SHEET']);
const intermediateOf = (task: FdmgongchangScheduleApi.Task) => {
  const p = processOf(task.process);
  return p && INTERMEDIATE.has(p.outputStage) ? p.outputLabel : '';
};
const titleOf = (task: FdmgongchangScheduleApi.Task) => {
  const made = intermediateOf(task);
  if (made) return task.product ? `${made}（给 ${task.product} 用）` : made;
  return task.product || `${labelOf(task.process)}任务`;
};

const WEEK = ['日', '一', '二', '三', '四', '五', '六'];
const todayText = computed(() => {
  const d = factoryToday();
  return `${d.month() + 1}月${d.date()}日 周${WEEK[d.day()]}`;
});

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
const dateText = (v: FdmgongchangScheduleApi.DateValue) => {
  if (!v) return '';
  const d = new Date(Array.isArray(v) ? `${v[0]}-${v[1]}-${v[2]}` : (v as number | string));
  return Number.isNaN(d.getTime()) ? '' : `${d.getMonth() + 1}月${d.getDate()}日`;
};

/** 一个任务要领的一行料（建议，报工时照实际改）。 */
interface PickLine {
  batchNo: string;
  key: string;
  location?: null | string;
  name: string;
  qty: number;
  stage: string;
  unit: string;
}
interface TaskPicks {
  hint?: null | string;
  lines: PickLine[];
}
const labels = computed(() => makeLabels(job.options));
const pickLoading = ref(false);
/** 按任务编号：这个任务要领的料。 */
const picksByTask = ref<Map<number, TaskPicks>>(new Map());
async function loadPicks() {
  pickLoading.value = true;
  try {
    const list = await getWorkbenchPickList();
    const map = new Map<number, TaskPicks>();
    for (const p of list) {
      const lines: PickLine[] = p.picks.map((pick) => ({
        batchNo: pick.stock.batchNo,
        key: `s${pick.stock.id}`,
        location: pick.stock.location,
        name: attrSummary(pick.stock.stage, pick.stock.item, labels.value) || pick.stock.itemCode,
        qty: toNumber(pick.quantity) ?? 0,
        stage: stageLabel(pick.stock.stage),
        unit: stageUnit(pick.stock.stage),
      }));
      for (const a of p.aux) {
        const stock = a.stocks[0];
        const qty = (toNumber(a.perUnit) ?? 0) * (toNumber(p.task.quantity) ?? 0);
        if (stock && qty > 0) {
          lines.push({
            batchNo: stock.batchNo,
            key: `a${stock.id}`,
            location: stock.location,
            name: a.productName ?? a.productCode ?? '',
            qty: Math.round(qty * 1000) / 1000,
            stage: '辅料',
            unit: a.unit ?? '',
          });
        }
      }
      map.set(p.task.id, { hint: p.hint, lines });
    }
    picksByTask.value = map;
  } catch {
    picksByTask.value = new Map();
  } finally {
    pickLoading.value = false;
  }
}
watch(
  () => myTasks.value.map((t) => t.id).join(','),
  (ids) => {
    if (ids) void loadPicks();
    else picksByTask.value = new Map();
  },
  { immediate: true },
);
</script>

<template>
  <div class="flex min-h-full flex-col">
    <header class="flex flex-wrap items-center justify-between gap-x-6 gap-y-2 border-b border-border bg-card px-4 py-3">
      <div class="flex min-w-0 flex-col">
        <span class="text-base font-bold">{{ my.userName }} 的工作台</span>
        <span class="text-xs text-muted-foreground">
          {{ my.factoryName }} · {{ todayText }}<template v-if="my.team"> · {{ my.team }}</template>
        </span>
        <span class="text-xs text-muted-foreground">我的岗位：{{ my.processes.map((p) => p.label).join('、') || '还没分配' }}</span>
      </div>
      <div class="flex items-center gap-5 text-right">
        <div class="flex flex-col">
          <span class="text-xs text-muted-foreground">我的任务</span>
          <b class="text-lg tabular-nums">{{ myTasks.length }}</b>
        </div>
        <div class="flex flex-col">
          <span class="text-xs text-muted-foreground">今天计件</span>
          <b class="text-lg tabular-nums text-primary">¥{{ formatQty(my.todayAmount) }}</b>
        </div>
      </div>
    </header>

    <div v-if="my.processes.length === 0" class="p-6">
      <Empty description="你还没有分配工序岗位，请找班组长或工厂管理员在「人员岗位」里分配" />
    </div>

    <main v-else class="flex flex-1 flex-col gap-3 p-4">
      <!-- 我的任务：派给我的；卡片写清楚做什么、领什么料，做完了报工 -->
      <h2 class="m-0 text-sm font-semibold">我的任务</h2>
        <p v-if="myTasks.length === 0" class="m-0 rounded-lg bg-card p-4 text-sm text-muted-foreground">
          手上没有任务，等班组长派单。
        </p>
        <article
          v-for="task in myTasks"
          :key="task.id"
          class="flex flex-col gap-3 rounded-lg border border-border bg-card p-4"
        >
          <div class="flex flex-col gap-1">
            <span class="flex items-start gap-2 text-base font-semibold">
              <span class="mt-0.5 shrink-0 rounded bg-primary/10 px-1.5 text-xs font-normal leading-5 text-primary">{{ labelOf(task.process) }}</span>
              <span class="min-w-0 break-words">{{ titleOf(task) }}</span>
            </span>
            <span v-if="task.spec" class="text-sm text-muted-foreground">规格：{{ task.spec }}</span>
            <TaskMaterials :task="task" class="text-sm" />
          </div>

          <dl class="m-0 grid grid-cols-2 gap-x-4 gap-y-1 text-sm sm:grid-cols-4">
            <div class="flex flex-col">
              <dt class="text-xs text-muted-foreground">要做</dt>
              <dd class="m-0 font-semibold tabular-nums">{{ formatQty(task.quantity) }} {{ task.unit }}</dd>
            </div>
            <div class="flex flex-col">
              <dt class="text-xs text-muted-foreground">订单</dt>
              <dd class="m-0">{{ task.contractCode || '备货' }}</dd>
            </div>
            <div class="flex flex-col">
              <dt class="text-xs text-muted-foreground">{{ task.undated ? '任务包' : '安排在' }}</dt>
              <dd class="m-0">{{ task.undated ? (task.process === 'MIX' ? `发泡第 ${task.sequence} 个` : '不定日期') : dateText(task.workDate) }}</dd>
            </div>
            <div class="flex flex-col">
              <dt class="text-xs text-muted-foreground">一起做的人</dt>
              <dd class="m-0 truncate">{{ task.workerNames || '我' }}</dd>
            </div>
          </dl>
          <p v-if="task.plannedQuantity" class="m-0 text-xs text-muted-foreground">
            排单是 {{ formatQty(task.plannedQuantity) }} {{ task.unit }}，按上道报的良品改成了 {{ formatQty(task.quantity) }}。
          </p>
          <p v-if="task.reason" class="m-0 rounded-md bg-muted/50 px-3 py-2 text-sm">{{ task.reason }}</p>
          <p v-if="task.upstreamNote || upstreamBadge(task.upstreamState)" class="m-0 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <span
              v-if="upstreamBadge(task.upstreamState)"
              class="rounded px-1.5 py-0.5 font-semibold"
              :class="upstreamBadge(task.upstreamState)!.cls"
            >{{ upstreamBadge(task.upstreamState)!.text }}</span>
            <span v-if="task.upstreamNote">{{ task.upstreamNote }}</span>
          </p>

          <div class="flex flex-col gap-1">
            <span class="text-xs font-semibold text-muted-foreground">要领的料（建议，报工时按实际改）</span>
            <Spin :spinning="pickLoading && !picksByTask.has(task.id)" size="small">
              <p v-if="(picksByTask.get(task.id)?.lines.length ?? 0) === 0" class="m-0 text-sm text-muted-foreground">
                {{ pickLoading ? '正在算…' : '没有算出要领的料（发泡按配方领、贴合要自己选正反面），报工时自己选。' }}
              </p>
              <ul v-else class="m-0 flex list-none flex-col divide-y divide-border rounded-md border border-border p-0">
                <li v-for="line in picksByTask.get(task.id)!.lines" :key="line.key" class="flex items-center gap-3 px-3 py-1.5">
                  <span class="flex min-w-0 flex-1 flex-col">
                    <span class="truncate text-sm">{{ line.name }}</span>
                    <span class="truncate text-xs text-muted-foreground">
                      {{ line.stage }} · 批次 {{ line.batchNo }}<template v-if="line.location"> · {{ line.location }}</template>
                    </span>
                  </span>
                  <b class="shrink-0 tabular-nums">{{ formatQty(line.qty) }} {{ line.unit }}</b>
                </li>
              </ul>
            </Spin>
            <p v-if="picksByTask.get(task.id)?.hint" class="m-0 text-xs text-warning">{{ picksByTask.get(task.id)!.hint }}</p>
          </div>

          <button
            class="h-11 rounded-md bg-primary text-base font-semibold text-primary-foreground"
            type="button"
            @click="emit('startTask', task, processOf(task.process)!)"
          >
            做完了，报工
          </button>
        </article>
      <section v-if="teamTasks.length > 0" class="flex flex-col gap-2">
        <h2 class="m-0 text-sm font-bold">组员的任务（组长代报）<span class="ml-1 text-xs font-normal text-muted-foreground">{{ teamTasks.length }} 个，组员忘了报可以替他报</span></h2>
        <ul class="m-0 flex list-none flex-col divide-y divide-border rounded-lg border border-border bg-card p-0">
          <li v-for="t in teamTasks" :key="t.id" class="flex flex-wrap items-center gap-2 px-3 py-2">
            <span class="flex min-w-0 flex-1 flex-col">
              <span class="truncate text-sm font-semibold">{{ teamProcessOf(t.process)?.label }} · {{ t.product || '备货' }}</span>
              <span class="truncate text-xs text-muted-foreground">
                {{ t.contractCode || '备货' }} · {{ formatQty(t.quantity) }} {{ t.unit }} · {{ t.workerNames || '还没人接' }}
              </span>
            </span>
            <span
              v-if="upstreamBadge(t.upstreamState)"
              class="rounded px-1.5 py-0.5 text-xs font-semibold"
              :class="upstreamBadge(t.upstreamState)!.cls"
            >{{ upstreamBadge(t.upstreamState)!.text }}</span>
            <button class="rounded-md border border-primary px-3 py-1 text-sm text-primary" type="button" @click="openBehalf(t)">代报</button>
          </li>
        </ul>
      </section>
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
