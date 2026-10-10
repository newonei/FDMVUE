<script setup lang="ts">
import type { FdmgongchangScheduleApi } from '#/api/fdmgongchang/schedule';
import type { FdmgongchangWorkbenchApi as Api } from '#/api/fdmgongchang/workbench';

import { computed, ref, watch } from 'vue';

import { formatDateTime } from '@vben/utils';

import { Empty } from 'ant-design-vue';

import { formatQty } from '../../stage-stock/model';
import { useJob } from '../use-job';

/** 工人首页：今天安排给我的活、我手上在做的单、今天挣了多少。 */
const emit = defineEmits<{
  continueOrder: [order: Api.Order];
  startFree: [process: Api.Process];
  startTask: [task: FdmgongchangScheduleApi.Task, process: Api.Process];
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

const WEEK = ['日', '一', '二', '三', '四', '五', '六'];
const todayText = computed(() => {
  const d = new Date();
  return `${d.getMonth() + 1}月${d.getDate()}日 周${WEEK[d.getDay()]}`;
});
const greeting = computed(() => {
  const h = new Date().getHours();
  if (h < 11) return '早上好';
  if (h < 14) return '中午好';
  if (h < 18) return '下午好';
  return '晚上好';
});

const percent = (t: FdmgongchangScheduleApi.Task) => {
  const plan = Number(t.quantity);
  return plan > 0 ? Math.min(100, Math.round((Number(t.actualQuantity) / plan) * 100)) : 0;
};
const myTasks = computed(() => my.value.tasks.filter((t) => processOf(t.process)));
</script>

<template>
  <div class="flex min-h-full flex-col">
    <header class="flex flex-col gap-2.5 bg-foreground px-5 pb-4 pt-5 text-background">
      <div class="flex items-center justify-between text-sm opacity-75">
        <span>{{ my.factoryName }} · {{ todayText }}</span>
      </div>
      <div class="flex items-end justify-between gap-3">
        <div class="flex min-w-0 flex-col gap-1">
          <span class="text-2xl font-black">{{ my.userName }}，{{ greeting }}</span>
          <span class="text-[15px] opacity-85">
            我的岗位：<b>{{ my.processes.map((p) => p.label).join('、') || '还没分配' }}</b>
            <template v-if="my.team"> · {{ my.team }}</template>
          </span>
        </div>
        <div class="flex shrink-0 flex-col items-end">
          <span class="text-xs opacity-75">今天计件</span>
          <span class="text-[22px] font-bold">¥{{ formatQty(my.todayAmount) }}</span>
        </div>
      </div>
    </header>

    <div v-if="my.processes.length === 0" class="p-6">
      <Empty description="你还没有分配工序岗位，请找班组长或工厂管理员在「人员岗位」里分配" />
    </div>

    <main v-else class="flex flex-1 flex-col gap-5 p-4">
      <section class="flex flex-col gap-2.5">
        <h2 class="m-0 text-[17px] font-bold">今天安排给我的活</h2>
        <p v-if="myTasks.length === 0" class="m-0 rounded-xl bg-card p-4 text-sm text-muted-foreground">
          今天还没有给你排活。有活要做可以点下面「自己开单」。
        </p>
        <div
          v-for="(task, i) in myTasks"
          :key="task.id"
          class="flex flex-col gap-3 rounded-2xl bg-card p-4 shadow-sm"
        >
          <div class="flex items-center justify-between text-[13px] text-muted-foreground">
            <span>第 {{ i + 1 }} 个 · {{ task.contractCode ? `订单 ${task.contractCode}` : '备货' }}</span>
            <span>{{ labelOf(task.process) }}</span>
          </div>
          <div class="text-xl font-bold leading-snug">
            {{ [task.product, task.spec].filter(Boolean).join(' · ') || `${labelOf(task.process)}任务` }}
          </div>
          <div class="flex flex-col gap-1.5">
            <div class="flex justify-between text-sm">
              <span class="text-muted-foreground">
                已做 <b class="text-foreground">{{ formatQty(task.actualQuantity) }}</b> / 计划 {{ formatQty(task.quantity) }} {{ task.unit }}
              </span>
              <span class="font-bold text-primary">{{ percent(task) }}%</span>
            </div>
            <div class="h-2.5 overflow-hidden rounded-full bg-muted">
              <div :style="{ width: `${percent(task)}%` }" class="h-2.5 bg-primary"></div>
            </div>
          </div>
          <button
            :class="Number(task.actualQuantity) > 0 ? 'bg-primary text-primary-foreground' : 'bg-primary/10 text-primary'"
            class="h-14 rounded-xl text-lg font-bold"
            type="button"
            @click="emit('startTask', task, processOf(task.process)!)"
          >
            {{ Number(task.actualQuantity) > 0 ? '接着做这个活' : '开始做' }}
          </button>
        </div>
      </section>

      <section v-if="my.inProgress.length > 0" class="flex flex-col gap-2.5">
        <h2 class="m-0 text-[17px] font-bold">我手上在做的</h2>
        <div
          v-for="order in my.inProgress"
          :key="order.id"
          class="flex flex-col gap-2.5 rounded-2xl border-2 border-warning bg-card p-4"
        >
          <div class="flex items-center justify-between gap-2">
            <span class="text-lg font-bold">
              已领 {{ formatQty(Number(order.inputQuantity) - Number(order.returnedQuantity ?? 0)) }} {{ order.inputUnit }}{{ stageLabel(order.sourceStage) }}
            </span>
            <span class="shrink-0 rounded-full bg-warning/15 px-2 py-0.5 text-xs text-warning">{{ labelOf(order.process) }}</span>
          </div>
          <span class="text-sm text-muted-foreground">
            {{ formatDateTime(order.issuedAt ?? undefined) }} 领的料<template v-if="(order.reportCount ?? 0) > 0">，已报 {{ formatQty(order.goodQuantity) }}</template><template v-else>，还没报数量</template>
          </span>
          <button class="h-14 rounded-xl bg-warning text-lg font-bold text-white" type="button" @click="emit('continueOrder', order)">
            做完了，报数量
          </button>
        </div>
      </section>
    </main>

    <footer v-if="my.processes.length > 0" class="sticky bottom-0 flex flex-col gap-2 border-t border-border bg-card px-4 pb-5 pt-3">
      <div v-if="my.processes.length > 1" class="flex flex-wrap gap-2">
        <button
          v-for="p in my.processes"
          :key="p.code"
          :class="p.code === processCode ? 'border-primary bg-primary/10 text-primary' : 'border-border text-foreground'"
          class="h-11 rounded-lg border-2 px-3 text-[15px] font-bold"
          type="button"
          @click="processCode = p.code"
        >
          {{ p.label }}
        </button>
      </div>
      <button
        class="h-[52px] rounded-xl border-2 border-foreground text-base font-bold text-foreground"
        type="button"
        @click="process && emit('startFree', process)"
      >
        ＋ 没安排的活，自己开单（{{ process?.label }}）
      </button>
    </footer>
  </div>
</template>
