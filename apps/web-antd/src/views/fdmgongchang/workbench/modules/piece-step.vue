<script setup lang="ts">
import type { FdmgongchangFactoryApi } from '#/api/fdmgongchang/factory';
import type { FdmgongchangWageApi } from '#/api/fdmgongchang/wage';

import { computed, onMounted, ref } from 'vue';

import { message, Select, Spin } from 'ant-design-vue';

import { getWorkbenchMates, matchWorkbenchWage } from '#/api/fdmgongchang/workbench';
import ImageUpload from '#/components/upload/image-upload.vue';

import { formatQty, toNumber } from '../../stage-stock/model';
import { defectTotal, goodTotal, stageOf, useJob } from '../use-job';
import StepHeader from './step-header.vue';

/**
 * 确认计件：按做出来的规格自动选好计价项目，默认算给自己、数量 = 好的数量；
 * 两人一起做（压花送片 / 接片）点「还有人跟我一起做」。按任务报工时还要拍纸质领料单。
 */
const props = defineProps<{ submitting: boolean }>();
const emit = defineEmits<{ back: []; submit: [] }>();
const job = useJob();

const matches = ref<FdmgongchangWageApi.Match[]>([]);
const mates = ref<FdmgongchangFactoryApi.Operator[]>([]);
const loading = ref(true);
let seed = 0;
const unit = computed(() => stageOf(job, job.process?.outputStage)?.unit ?? '');

const best = (excludeRole?: null | string) =>
  matches.value.find((m) => m.matched && (!excludeRole || (m.role && m.role !== excludeRole))) ??
  matches.value.find((m) => m.matched) ??
  matches.value[0];

onMounted(async () => {
  try {
    const first = job.outputs.find((o) => (toNumber(o.goodQuantity) ?? 0) > 0) ?? job.outputs[0];
    const [list, people] = await Promise.all([
      matchWorkbenchWage({
        length: toNumber(first?.attrs.length) ?? null,
        process: job.process!.code,
        thickness: toNumber(first?.attrs.thickness) ?? null,
        width: toNumber(first?.attrs.width) ?? null,
      }),
      getWorkbenchMates(job.process!.code),
    ]);
    matches.value = list;
    mates.value = people;
    if (job.pieces.length === 0 && list.length > 0) {
      job.pieces = [{ itemId: best()?.itemId, key: ++seed, quantity: goodTotal(job), userId: job.my?.userId }];
    }
  } finally {
    loading.value = false;
  }
});

const itemOptions = computed(() =>
  matches.value.map((m) => ({
    label: `${m.name}${m.role ? `（${m.role}）` : ''} · ¥${toNumber(m.price) ?? '未定价'}/${m.unit}`,
    value: m.itemId,
  })),
);
const mateOptions = computed(() =>
  mates.value
    .filter((m) => m.userId !== job.my?.userId)
    .map((m) => ({ label: [m.nickname, m.team].filter(Boolean).join(' · '), value: m.userId })),
);
const priceOf = (itemId?: number) => toNumber(matches.value.find((m) => m.itemId === itemId)?.price) ?? 0;
const nameOf = (userId?: number) =>
  userId === job.my?.userId ? `${job.my?.userName}（我）` : (mates.value.find((m) => m.userId === userId)?.nickname ?? '');
const amountOf = (line: (typeof job.pieces)[number]) => Math.round((line.quantity ?? 0) * priceOf(line.itemId) * 100) / 100;
const total = computed(() => job.pieces.reduce((t, l) => t + amountOf(l), 0));

function submit() {
  if (job.prepare && job.sheets.length === 0) {
    message.warning('请拍照上传纸质领料单');
    return;
  }
  emit('submit');
}

function addMate() {
  const firstRole = matches.value.find((m) => m.itemId === job.pieces[0]?.itemId)?.role;
  job.pieces.push({ itemId: best(firstRole)?.itemId, key: ++seed, quantity: goodTotal(job), userId: undefined });
}
</script>

<template>
  <div class="mx-auto flex min-h-full w-full max-w-[720px] flex-col">
    <StepHeader
      :subtitle="`好的 ${formatQty(goodTotal(job))} ${unit} · 残次 ${formatQty(defectTotal(job))} ${unit}`"
      :title="job.prepare ? '计件和领料单' : '这批活算给谁？'"
      @back="emit('back')"
    />
    <Spin :spinning="loading">
      <main class="flex flex-1 flex-col gap-3 p-4">
        <p v-if="!loading && matches.length === 0" class="m-0 rounded-md bg-card p-3 text-sm text-muted-foreground">
          这道工序还没有计价项目，提交后由班组长补登计件。
        </p>
        <section v-for="(line, i) in job.pieces" :key="line.key" class="flex flex-col gap-2 rounded-lg bg-card p-3 border border-border">
          <div class="flex items-center justify-between gap-2">
            <span v-if="i === 0" class="text-sm font-bold">{{ nameOf(line.userId) }}</span>
            <Select
              v-else
              :id="`piece-mate-${line.key}`"
              v-model:value="line.userId"
              :options="mateOptions"
              aria-label="一起做的人"
              class="min-w-0 flex-1"
              placeholder="选一起做的人"
            />
            <button v-if="i > 0" class="h-8 shrink-0 px-2 text-xs font-semibold text-destructive" type="button" @click="job.pieces.splice(i, 1)">去掉</button>
          </div>
          <Select
            :id="`piece-item-${line.key}`"
            v-model:value="line.itemId"
            :options="itemOptions"
            aria-label="计价项目"
          />
          <div class="flex items-baseline justify-between border-t border-dashed border-border pt-2">
            <span class="text-sm text-muted-foreground">{{ formatQty(line.quantity) }} {{ unit }} × ¥{{ priceOf(line.itemId) }}</span>
            <span class="text-lg font-bold text-primary">¥{{ formatQty(amountOf(line)) }}</span>
          </div>
        </section>
        <button
          v-if="matches.length > 0 && mateOptions.length > 0"
          class="h-9 rounded-md border border-dashed border-muted-foreground text-sm text-muted-foreground"
          type="button"
          @click="addMate"
        >
          ＋ 还有人跟我一起做
        </button>
        <p class="m-0 text-xs leading-relaxed text-muted-foreground">计价项目按做出来的规格自动选好。提交后由班组长确认，月底一起结算。</p>
        <section v-if="job.prepare" class="flex flex-col gap-2 rounded-lg border border-border bg-card p-3">
          <span class="text-sm font-bold">拍纸质领料单<span class="ml-1 text-destructive">*</span></span>
          <ImageUpload
            v-model:value="job.sheets"
            :max-number="9"
            :max-size="10"
            :show-description="false"
            directory="fdmgongchang/issue-sheet"
            multiple
          />
          <span class="text-xs text-muted-foreground">领料单上的数量要和第 1 步填的实际领料对得上，可以拍多张。</span>
        </section>
      </main>
    </Spin>
    <footer class="sticky bottom-0 border-t border-border bg-card px-4 pb-4 pt-3">
      <button
        :disabled="props.submitting"
        class="h-10 w-full rounded-md bg-primary text-sm font-semibold text-primary-foreground disabled:opacity-60"
        type="button"
        @click="submit"
      >
        {{ props.submitting ? '提交中…' : `${job.prepare ? '报工' : '提交'}${total > 0 ? `（计件 ¥${formatQty(total)}）` : ''}` }}
      </button>
    </footer>
  </div>
</template>
