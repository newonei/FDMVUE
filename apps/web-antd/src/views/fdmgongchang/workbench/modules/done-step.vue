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
  <div class="mx-auto flex min-h-full w-full max-w-[720px] flex-col">
    <main class="flex flex-1 flex-col items-center gap-3 px-6 pb-6 pt-10 text-center">
      <div class="flex size-14 items-center justify-center rounded-full bg-primary text-primary-foreground">
        <svg aria-label="提交成功" fill="none" height="30" role="img" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2.6" viewBox="0 0 24 24" width="30"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>
      </div>
      <h1 class="m-0 text-xl font-bold">{{ job.result.good > 0 ? '报好了' : job.supplement ? (job.order?.status === 'COMPLETED' ? '补登好了' : '补好了') : '领好了' }}</h1>
      <p class="m-0 text-sm leading-relaxed text-muted-foreground">
        <template v-if="job.result.good > 0">{{ formatQty(job.result.good) }} {{ output?.unit }}{{ output?.label }}已经进库存<br />{{ job.finish || job.createFinish ? '这张单已结束' : '单子还留着，下次接着报' }}</template>
        <template v-else-if="job.supplement && job.order?.status === 'COMPLETED'">补登的料已经算进 {{ job.order?.orderNo }} 的领料</template>
        <template v-else-if="job.supplement">补的料已经加到 {{ job.order?.orderNo }}，做完回来点「做完了，报数量」</template>
        <template v-else>料已经从库存扣掉，做完回来点「做完了，报数量」</template>
      </p>
      <section class="grid w-full grid-cols-2 gap-3 rounded-lg bg-card p-3 text-left border border-border">
        <div class="flex flex-col">
          <span class="text-xs text-muted-foreground">这批计件</span>
          <span class="text-lg font-bold text-primary">¥{{ formatQty(job.result.amount) }}</span>
        </div>
        <div class="flex flex-col">
          <span class="text-xs text-muted-foreground">今天累计</span>
          <span class="text-lg font-bold">¥{{ formatQty(job.my?.todayAmount) }}</span>
        </div>
        <div v-if="task" class="col-span-2 flex flex-col gap-1.5">
          <div class="flex justify-between text-sm">
            <span class="text-muted-foreground">{{ task.contractCode || '这个活' }}进度</span>
            <b>{{ formatQty(task.actualQuantity) }} / {{ formatQty(task.quantity) }} {{ task.unit }}</b>
          </div>
          <div class="h-1.5 overflow-hidden rounded-full bg-muted">
            <div :style="{ width: `${percent}%` }" class="h-1.5 bg-primary"></div>
          </div>
        </div>
      </section>
    </main>
    <footer class="grid grid-cols-1 gap-2 px-4 pb-4 pt-3 sm:grid-cols-2">
      <button class="h-10 rounded-md bg-primary text-sm font-semibold text-primary-foreground" type="button" @click="emit('home')">看下一个活</button>
      <button class="h-10 rounded-md border border-border bg-card text-sm font-semibold text-foreground" type="button" @click="emit('again')">再领一批料</button>
    </footer>
  </div>
</template>
