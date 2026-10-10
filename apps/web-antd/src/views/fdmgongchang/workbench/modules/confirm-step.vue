<script setup lang="ts">
import { computed, ref } from 'vue';

import { attrSummary, formatQty, makeLabels, toNumber } from '../../stage-stock/model';
import { stageOf, useJob } from '../use-job';
import StepHeader from './step-header.vue';

/** 第 2 步 确认领料：只显示领多少、领什么、领完还剩多少。 */
const emit = defineEmits<{ back: []; issueOnly: []; reportNow: [] }>();
const job = useJob();
const submitting = ref(false);
const labels = computed(() => makeLabels(job.options));
const source = computed(() => stageOf(job, job.sourceStage));

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
  <div class="flex min-h-full flex-col">
    <StepHeader :current="2" :title="`${job.process?.label} · 第 2 步 确认领料`" :total="3" subtitle="看一眼，对了就点确认" @back="emit('back')" />
    <main class="flex flex-1 flex-col gap-3.5 p-4">
      <section v-for="p in job.picks" :key="p.stock.id" class="flex flex-col gap-3.5 rounded-2xl bg-card p-[18px] shadow-sm">
        <div class="flex flex-col gap-1">
          <span class="text-sm text-muted-foreground">
            从{{ source?.label }}领走<template v-if="p.side">（{{ p.side === 'FRONT' ? '正面' : '反面' }}）</template>
          </span>
          <span class="text-[34px] font-black">{{ formatQty(p.qty) }} {{ source?.unit }}</span>
          <span class="text-[17px] font-bold">{{ attrSummary(p.stock.stage, p.stock.item, labels) || p.stock.itemCode }}</span>
        </div>
        <div class="grid grid-cols-2 gap-2.5 text-sm">
          <div class="flex flex-col"><span class="text-muted-foreground">批次</span><b>{{ p.stock.batchNo }}</b></div>
          <div class="flex flex-col"><span class="text-muted-foreground">领完还剩</span><b>{{ formatQty((toNumber(p.stock.quantity) ?? 0) - p.qty) }} {{ source?.unit }}</b></div>
          <div class="flex flex-col"><span class="text-muted-foreground">做的订单</span><b>{{ job.task?.contractCode || '备货' }}</b></div>
          <div class="flex flex-col"><span class="text-muted-foreground">做的人</span><b>{{ job.my?.userName }}{{ job.my?.team ? `（${job.my.team}）` : '' }}</b></div>
        </div>
      </section>
      <p class="m-0 text-sm leading-relaxed text-muted-foreground">
        领料后这些料就从{{ source?.label }}库存扣掉，算到你「手上在做的」里。做完回来点「做完了，报数量」。
      </p>
    </main>
    <footer class="sticky bottom-0 flex flex-col gap-2.5 border-t border-border bg-card px-4 pb-5 pt-3">
      <button :disabled="submitting" class="h-14 rounded-xl bg-primary text-lg font-bold text-primary-foreground" type="button" @click="issue">
        确认领料，去干活
      </button>
      <button class="h-12 rounded-xl bg-primary/10 text-base font-bold text-primary" type="button" @click="emit('reportNow')">
        已经做完了，领料同时报数量
      </button>
    </footer>
  </div>
</template>
