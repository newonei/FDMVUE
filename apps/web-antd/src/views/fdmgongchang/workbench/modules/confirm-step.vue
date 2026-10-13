<script setup lang="ts">
import type { FdmgongchangProductionOrderApi as OrderApi } from '#/api/fdmgongchang/production-order';

import { computed, onMounted, ref } from 'vue';

import { getWorkbenchProductionOrders } from '#/api/fdmgongchang/workbench';

import { finalProcess } from '../../production-order/shared';
import { attrSummary, formatQty, makeLabels, toNumber } from '../../stage-stock/model';
import { stageOf, useJob } from '../use-job';
import StepHeader from './step-header.vue';

/** 第 2 步 确认领料：只显示领多少、领什么、领完还剩多少。 */
const emit = defineEmits<{ back: []; issueOnly: []; reportNow: [] }>();
const job = useJob();
const submitting = ref(false);
const labels = computed(() => makeLabels(job.options));
const source = computed(() => stageOf(job, job.sourceStage));
const total = computed(() => job.picks.reduce((t, p) => t + (p.qty || 0), 0));

/**
 * 不按排单开工时，如果这道工序是某张工厂订单工艺的最后一道，选这批是做哪张单（记进订单的工序进度；完成数量按交货算）；
 * 按排单开工的由排单任务自动关联。补领沿用原来的单。
 */
const mayAskOrder = computed(() => !job.supplement && !job.task && !!job.process);
const openOrders = ref<OrderApi.Order[]>([]);
const orderChoices = computed(() =>
  openOrders.value.flatMap((o) =>
    o.items
      .filter((i) => Number(i.quantity) > Number(i.completedQuantity) && finalProcess(i) === job.process?.code)
      .map((i) => ({
        id: i.id,
        label: i.productName,
        left: `还差 ${formatQty(Number(i.quantity) - Number(i.completedQuantity))} ${i.unit ?? ''}`,
        orderNo: o.orderNo,
        party: o.requesterDeptName || o.requesterName || '',
      })),
  ),
);
const askOrder = computed(() => mayAskOrder.value && orderChoices.value.length > 0);
onMounted(async () => {
  if (!mayAskOrder.value) return;
  try {
    openOrders.value = await getWorkbenchProductionOrders();
  } catch {
    openOrders.value = [];
  }
});
function choose(c?: { id: number; label: string; orderNo: string }) {
  job.productionItem = c ? { id: c.id, label: c.label, orderNo: c.orderNo } : undefined;
}
const orderText = computed(() =>
  job.supplement ? `补到 ${job.order?.orderNo ?? ''}` : job.task?.contractCode || job.productionItem?.orderNo || '备货',
);

async function issue() {
  submitting.value = true;
  try {
    emit('issueOnly');
  } finally {
    submitting.value = false;
  }
}
</script>

<template>
  <div class="mx-auto flex min-h-full w-full max-w-[720px] flex-col">
    <StepHeader
      :current="2"
      :subtitle="job.supplement ? `补到 ${job.order?.orderNo ?? ''}，看一眼，对了就点确认` : '看一眼，对了就点确认'"
      :title="`${job.process?.label} · 第 2 步 ${job.supplement ? '确认补领' : '确认领料'}`"
      :total="job.supplement ? 2 : 3"
      @back="emit('back')"
    />
    <main class="flex flex-1 flex-col gap-3 p-4">
      <section class="flex flex-col gap-2 rounded-lg border border-border bg-card p-3">
        <h3 class="m-0 flex items-baseline justify-between text-sm font-bold">
          从{{ source?.label }}领走
          <span class="text-xs font-normal text-muted-foreground">{{ job.picks.length }} 种 · 共 {{ formatQty(total) }} {{ source?.unit }}</span>
        </h3>
        <table class="w-full text-sm">
          <thead>
            <tr class="text-left text-xs text-muted-foreground">
              <th class="py-1 font-normal">材料</th>
              <th class="py-1 font-normal">批次</th>
              <th class="py-1 text-right font-normal">领用</th>
              <th class="py-1 text-right font-normal">领完还剩</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="p in job.picks" :key="p.stock.id" class="border-t border-border">
              <td class="py-1.5 pr-2">
                <span class="font-semibold">{{ attrSummary(p.stock.stage, p.stock.item, labels) || p.stock.itemCode }}</span>
                <span v-if="p.side" class="ml-1 text-xs text-primary">{{ p.side === 'FRONT' ? '正面' : '反面' }}</span>
              </td>
              <td class="py-1.5 pr-2 font-mono text-xs text-muted-foreground">{{ p.stock.batchNo }}</td>
              <td class="whitespace-nowrap py-1.5 text-right font-semibold tabular-nums">{{ formatQty(p.qty) }} {{ source?.unit }}</td>
              <td class="whitespace-nowrap py-1.5 text-right tabular-nums text-muted-foreground">
                {{ formatQty((toNumber(p.stock.quantity) ?? 0) - p.qty) }} {{ source?.unit }}
              </td>
            </tr>
          </tbody>
        </table>
        <div class="grid grid-cols-2 gap-2 border-t border-dashed border-border pt-2 text-xs">
          <div class="flex flex-col"><span class="text-muted-foreground">做的订单</span><b class="text-sm">{{ orderText }}</b></div>
          <div class="flex flex-col"><span class="text-muted-foreground">做的人</span><b class="text-sm">{{ job.my?.userName }}{{ job.my?.team ? `（${job.my.team}）` : '' }}</b></div>
        </div>
      </section>
      <section v-if="askOrder && orderChoices.length > 0" class="flex flex-col gap-1.5 rounded-lg border border-border bg-card p-3">
        <span class="text-sm font-bold">这批是做哪张工厂订单？</span>
        <span class="text-xs text-muted-foreground">选了以后，报的好的数量会自动算进这张单的完成数量</span>
        <button
          :class="!job.productionItem ? 'border-primary bg-primary/10' : 'border-border'"
          class="flex min-h-9 items-center rounded-md border px-3 text-left text-sm"
          type="button"
          @click="choose()"
        >
          备货，不算哪张单
        </button>
        <button
          v-for="c in orderChoices"
          :key="c.id"
          :class="job.productionItem?.id === c.id ? 'border-primary bg-primary/10' : 'border-border'"
          class="flex flex-col items-start justify-center rounded-md border px-3 py-1.5 text-left"
          type="button"
          @click="choose(c)"
        >
          <span class="text-sm font-semibold">{{ c.label }}</span>
          <span class="text-xs text-muted-foreground">{{ c.orderNo }} · {{ c.party }} · {{ c.left }}</span>
        </button>
      </section>
      <p v-if="job.supplement" class="m-0 text-xs leading-relaxed text-muted-foreground">
        补领的料从{{ source?.label }}库存扣掉，加到你手上这张单里。做完回来照常点「做完了，报数量」。
      </p>
      <p v-else class="m-0 text-xs leading-relaxed text-muted-foreground">
        领料后这些料就从{{ source?.label }}库存扣掉，算到你「手上在做的」里。做完回来点「做完了，报数量」。
      </p>
    </main>
    <footer class="sticky bottom-0 grid grid-cols-1 gap-2 border-t border-border bg-card px-4 pb-4 pt-3 sm:grid-cols-2">
      <button :disabled="submitting" class="h-10 rounded-md bg-primary text-sm font-semibold text-primary-foreground" type="button" @click="issue">
        {{ job.supplement ? '确认补领，接着干活' : '确认领料，去干活' }}
      </button>
      <button v-if="!job.supplement" class="h-10 rounded-md bg-primary/10 text-sm font-semibold text-primary" type="button" @click="emit('reportNow')">
        已经做完了，领料同时报数量
      </button>
    </footer>
  </div>
</template>
