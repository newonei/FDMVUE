<script setup lang="ts">
import type { FdmgongchangScheduleApi } from '#/api/fdmgongchang/schedule';
import type { FdmgongchangWorkbenchApi as Api } from '#/api/fdmgongchang/workbench';

import { computed, ref, watch } from 'vue';

import { formatDateTime } from '@vben/utils';

import { Empty } from 'ant-design-vue';

import { formatQty } from '../../stage-stock/model';
import { useJob } from '../use-job';

/**
 * 工人首页：顶部一行是我、今天的活、在做几单、今天计件；左边今天安排给我的活，
 * 右边我手上在做的单和自己开单。手机上上下排，电脑上左右两栏，一屏看全。
 */
const emit = defineEmits<{
  continueOrder: [order: Api.Order];
  startFree: [process: Api.Process];
  startTask: [task: FdmgongchangScheduleApi.Task, process: Api.Process];
  supplementOrder: [order: Api.Order];
}>();
const job = useJob();

const my = computed(() => job.my!);
const processCode = ref<string>();
watch(
  () => my.value.processes,
  (list) => {
    if (!list.some((p) => p.code === processCode.value)) processCode.value = list[0]?.code;
  },
  { immediate: true },
);
const process = computed(() => my.value.processes.find((p) => p.code === processCode.value));
const processOf = (code: string) => my.value.processes.find((p) => p.code === code);
const labelOf = (code: string) => processOf(code)?.label ?? code;
const stageLabel = (code?: string) => job.options?.stages.find((s) => s.code === code)?.label ?? '';
const stageUnit = (code?: string) => job.options?.stages.find((s) => s.code === code)?.unit ?? '';

const WEEK = ['日', '一', '二', '三', '四', '五', '六'];
const todayText = computed(() => {
  const d = new Date();
  return `${d.getMonth() + 1}月${d.getDate()}日 周${WEEK[d.getDay()]}`;
});

const percent = (t: FdmgongchangScheduleApi.Task) => {
  const plan = Number(t.quantity);
  return plan > 0 ? Math.min(100, Math.round((Number(t.actualQuantity) / plan) * 100)) : 0;
};
const myTasks = computed(() => my.value.tasks.filter((t) => processOf(t.process)));
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
          <span class="text-xs text-muted-foreground">今天的活</span>
          <b class="text-lg tabular-nums">{{ myTasks.length }}</b>
        </div>
        <div class="flex flex-col">
          <span class="text-xs text-muted-foreground">在做</span>
          <b :class="my.inProgress.length > 0 ? 'text-warning' : ''" class="text-lg tabular-nums">{{ my.inProgress.length }}</b>
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

    <main v-else class="grid flex-1 grid-cols-1 content-start gap-4 p-4 md:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
      <section class="flex min-w-0 flex-col gap-2">
        <h2 class="m-0 text-sm font-bold">今天安排给我的活</h2>
        <p v-if="myTasks.length === 0" class="m-0 rounded-lg bg-card p-3 text-sm text-muted-foreground">
          今天还没有给你排活。有活要做，在「自己开单」里选工序开单。
        </p>
        <div v-else class="flex flex-col divide-y divide-border overflow-hidden rounded-lg border border-border bg-card">
          <div v-for="task in myTasks" :key="task.id" class="flex flex-wrap items-center gap-x-3 gap-y-1.5 px-3 py-2.5">
            <div class="flex min-w-0 flex-1 flex-col">
              <span class="flex items-center gap-1.5 text-sm font-semibold">
                <span class="shrink-0 rounded bg-primary/10 px-1.5 text-xs font-normal leading-5 text-primary">{{ labelOf(task.process) }}</span>
                <span class="truncate">{{ [task.product, task.spec].filter(Boolean).join(' · ') || `${labelOf(task.process)}任务` }}</span>
              </span>
              <span class="text-xs text-muted-foreground">{{ task.contractCode ? `订单 ${task.contractCode}` : '备货' }}</span>
            </div>
            <div class="flex w-40 shrink-0 flex-col gap-1">
              <span class="flex justify-between text-xs">
                <span class="tabular-nums text-muted-foreground">{{ formatQty(task.actualQuantity) }} / {{ formatQty(task.quantity) }} {{ task.unit }}</span>
                <b class="text-primary">{{ percent(task) }}%</b>
              </span>
              <div class="h-1.5 overflow-hidden rounded-full bg-muted">
                <div :style="{ width: `${percent(task)}%` }" class="h-1.5 bg-primary"></div>
              </div>
            </div>
            <button
              :class="Number(task.actualQuantity) > 0 ? 'bg-primary text-primary-foreground' : 'bg-primary/10 text-primary'"
              class="h-9 shrink-0 rounded-md px-3 text-sm font-semibold"
              type="button"
              @click="emit('startTask', task, processOf(task.process)!)"
            >
              {{ Number(task.actualQuantity) > 0 ? '接着做' : '开始做' }}
            </button>
          </div>
        </div>
      </section>

      <div class="flex min-w-0 flex-col gap-4">
        <section class="flex flex-col gap-2">
          <h2 class="m-0 text-sm font-bold">
            我手上在做的<span v-if="my.inProgress.length > 0" class="ml-1 font-normal text-warning">{{ my.inProgress.length }} 单</span>
          </h2>
          <p v-if="my.inProgress.length === 0" class="m-0 rounded-lg bg-card p-3 text-sm text-muted-foreground">手上没有在做的单。</p>
          <div
            v-for="order in my.inProgress"
            :key="order.id"
            class="flex flex-col gap-1.5 rounded-lg border border-warning/60 bg-card px-3 py-2.5"
          >
            <div class="flex items-center justify-between gap-2 text-sm">
              <span class="font-semibold">
                {{ labelOf(order.process) }} · 已领 {{ formatQty(Number(order.inputQuantity) - Number(order.returnedQuantity ?? 0)) }} {{ order.inputUnit }}{{ stageLabel(order.sourceStage) }}
              </span>
              <span class="shrink-0 font-mono text-xs text-muted-foreground">{{ order.orderNo }}</span>
            </div>
            <span v-if="order.inputSummary" class="truncate text-xs text-muted-foreground" :title="order.inputSummary">领的料：{{ order.inputSummary }}</span>
            <span class="text-xs text-muted-foreground">
              {{ formatDateTime(order.issuedAt ?? undefined) }} 领料<template v-if="(order.reportCount ?? 0) > 0">，已报 {{ formatQty(order.goodQuantity) }}</template><template v-else>，还没报数量</template>
            </span>
            <div class="grid grid-cols-2 gap-2">
              <button class="h-9 rounded-md bg-warning text-sm font-semibold text-white" type="button" @click="emit('continueOrder', order)">
                做完了，报数量
              </button>
              <button class="h-9 rounded-md border border-warning text-sm font-semibold text-warning" type="button" @click="emit('supplementOrder', order)">
                料不够，补领
              </button>
            </div>
          </div>
        </section>

        <section v-if="(my.recentDone ?? []).length > 0" class="flex flex-col gap-2">
          <h2 class="m-0 text-sm font-bold">
            最近做完的<span class="ml-1 text-xs font-normal text-muted-foreground">实际多拿了料没登记，3 天内可以补登</span>
          </h2>
          <div class="flex flex-col divide-y divide-border overflow-hidden rounded-lg border border-border bg-card">
            <div v-for="order in my.recentDone" :key="order.id" class="flex items-center gap-2 px-3 py-2">
              <div class="flex min-w-0 flex-1 flex-col">
                <span class="truncate text-sm">
                  {{ labelOf(order.process) }} · 领 {{ formatQty(Number(order.inputQuantity) - Number(order.returnedQuantity ?? 0)) }} {{ order.inputUnit }}，好的
                  {{ formatQty(order.goodQuantity) }} {{ stageUnit(order.outputStage) }}
                </span>
                <span class="truncate text-xs text-muted-foreground">
                  {{ order.orderNo }} · {{ formatDateTime(order.completedAt ?? undefined) }} 完工
                </span>
              </div>
              <button
                class="h-8 shrink-0 rounded-md border border-border px-2.5 text-sm text-foreground"
                type="button"
                @click="emit('supplementOrder', order)"
              >
                补登领料
              </button>
            </div>
          </div>
        </section>

        <section class="flex flex-col gap-2 rounded-lg border border-border bg-card p-3">
          <h2 class="m-0 text-sm font-bold">没安排的活，自己开单</h2>
          <div class="flex flex-wrap gap-1.5">
            <button
              v-for="p in my.processes"
              :key="p.code"
              :class="p.code === processCode ? 'border-primary bg-primary/10 text-primary' : 'border-border text-foreground'"
              class="h-8 rounded-md border px-2.5 text-sm"
              type="button"
              @click="processCode = p.code"
            >
              {{ p.label }}
            </button>
          </div>
          <button
            class="h-9 rounded-md bg-foreground text-sm font-semibold text-background"
            type="button"
            @click="process && emit('startFree', process)"
          >
            ＋ 开一张{{ process?.label }}单
          </button>
        </section>
      </div>
    </main>
  </div>
</template>
