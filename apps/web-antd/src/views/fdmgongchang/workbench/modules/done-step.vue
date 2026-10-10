<script setup lang="ts">
import { computed } from 'vue';

import { formatQty } from '../../stage-stock/model';
import { stageOf, useJob } from '../use-job';

/** 完成：货已入库，这批挣了多少、今天累计、订单进度。 */
const emit = defineEmits<{ again: []; home: [] }>();
const job = useJob();
const output = computed(() => stageOf(job, job.process?.outputStage));
const task = computed(() => job.my?.tasks.find((t) => t.id === job.task?.id));
const percent = computed(() => {
  const plan = Number(task.value?.quantity ?? 0);
  return plan > 0 ? Math.min(100, Math.round((Number(task.value?.actualQuantity ?? 0) / plan) * 100)) : 0;
});
</script>

<template>
  <div class="flex min-h-full flex-col">
    <main class="flex flex-1 flex-col items-center gap-4 px-6 pb-6 pt-16 text-center">
      <div class="flex size-24 items-center justify-center rounded-full bg-primary text-primary-foreground">
        <svg aria-label="提交成功" fill="none" height="52" role="img" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2.6" viewBox="0 0 24 24" width="52"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>
      </div>
      <h1 class="m-0 text-[28px] font-black">{{ job.result.good > 0 ? '报好了' : '领好了' }}</h1>
      <p class="m-0 text-base leading-relaxed text-muted-foreground">
        <template v-if="job.result.good > 0">{{ formatQty(job.result.good) }} {{ output?.unit }}{{ output?.label }}已经进库存<br />{{ job.finish || job.createFinish ? '这张单已结束' : '单子还留着，下次接着报' }}</template>
        <template v-else>料已经从库存扣掉，做完回来点「做完了，报数量」</template>
      </p>
      <section class="grid w-full grid-cols-2 gap-3.5 rounded-2xl bg-card p-[18px] text-left shadow-sm">
        <div class="flex flex-col">
          <span class="text-[13px] text-muted-foreground">这批计件</span>
          <span class="text-2xl font-black text-primary">¥{{ formatQty(job.result.amount) }}</span>
        </div>
        <div class="flex flex-col">
          <span class="text-[13px] text-muted-foreground">今天累计</span>
          <span class="text-2xl font-black">¥{{ formatQty(job.my?.todayAmount) }}</span>
        </div>
        <div v-if="task" class="col-span-2 flex flex-col gap-1.5">
          <div class="flex justify-between text-sm">
            <span class="text-muted-foreground">{{ task.contractCode || '这个活' }}进度</span>
            <b>{{ formatQty(task.actualQuantity) }} / {{ formatQty(task.quantity) }} {{ task.unit }}</b>
          </div>
          <div class="h-2.5 overflow-hidden rounded-full bg-muted">
            <div :style="{ width: `${percent}%` }" class="h-2.5 bg-primary"></div>
          </div>
        </div>
      </section>
    </main>
    <footer class="flex flex-col gap-2.5 px-4 pb-5 pt-3">
      <button class="h-14 rounded-xl bg-primary text-lg font-bold text-primary-foreground" type="button" @click="emit('home')">看下一个活</button>
      <button class="h-12 rounded-xl border-2 border-foreground bg-card text-base font-bold text-foreground" type="button" @click="emit('again')">再领一批料</button>
    </footer>
  </div>
</template>
