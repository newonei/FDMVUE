<script setup lang="ts">
import type { OrderDraft } from '../order-report';

import type { FdmgongchangWorkbenchApi as Api } from '#/api/fdmgongchang/workbench';

import { computed, ref, watch } from 'vue';

import { businessError } from '../../shared/business-error';
import LaminationCounters from '../../shared/lamination-counters.vue';
import { reportPlanWarning } from '../../shared/report-plan-warning';
import { attrSummary, makeLabels, toNumber } from '../../stage-stock/model';
import { loadOrderDraft } from '../order-report';
import { canFinishWithoutOutput, hasExcessDefects, hasNewOutput } from '../report-quantity';
import { useJob } from '../use-job';
import ReportQuantityFields from './report-quantity-fields.vue';

import '../../shared/report-spec.css';

const props = defineProps<{ order: Api.Order; plannedSpec?: string }>();
const emit = defineEmits<{
  details: [draft: OrderDraft];
  draft: [draft: OrderDraft];
  report: [draft: OrderDraft];
}>();
const job = useJob();
const draft = ref<OrderDraft>();
const loadError = ref('');
const attempted = ref(false);
const retry = ref(0);
const labels = computed(() => makeLabels(job.options));
const orderLabel = computed(() => props.order.scheduleTaskId ? `任务 #${props.order.scheduleTaskId}` : props.order.orderNo);
const finishingWithoutOutput = computed(() => !!draft.value && canFinishWithoutOutput(draft.value));
const planWarning = computed(() => {
  const current = draft.value;
  if (!current) return '';
  return reportPlanWarning(
    current.process.code === 'MIX' ? current.task?.output?.mixPlan?.wholeBatchBoards ?? current.task?.quantity : current.task?.quantity,
    current.task?.actualQuantity ?? current.order.goodQuantity,
    current.outputs.reduce((total, line) => total + (toNumber(line.goodQuantity) ?? 0), 0),
    current.process.outputUnit,
  );
});
const quantityError = computed(() => {
  if (!attempted.value || !draft.value) return '';
  const outputs = draft.value.outputs;
  if (outputs.some((line) => hasExcessDefects(line))) return '瑕疵数量不能超过本次产量。';
  if (!finishingWithoutOutput.value && !hasNewOutput(outputs)) return '请填写本次产量。';
  return '';
});

watch(
  [
    () => props.order.id,
    () => props.order.reportCount,
    () => props.order.inputQuantity,
    () => props.order.inputSummary,
    () => props.order.returnedQuantity,
    retry,
  ],
  async (_, __, onCleanup) => {
    let active = true;
    onCleanup(() => { active = false; });
    draft.value = undefined;
    loadError.value = '';
    attempted.value = false;
    try {
      const loaded = await loadOrderDraft(job, props.order.id);
      if (active) {
        draft.value = loaded;
        emit('draft', loaded);
      }
    } catch (error) {
      if (active) loadError.value = businessError(error).msg;
    }
  },
  { immediate: true },
);

function submit() {
  if (!draft.value) return;
  attempted.value = true;
  if (!quantityError.value) emit('report', draft.value);
}
</script>

<template>
  <form :aria-label="`${orderLabel} 报工`" class="flex flex-col gap-2" @submit.prevent="submit">
    <template v-if="draft">
      <div v-for="line in draft.outputs" :key="line.key" class="flex flex-col gap-1">
        <button
          class="min-h-11 self-start rounded-md text-left text-lg font-bold leading-snug factory-report-spec hover:underline"
          data-output-spec
          type="button"
          @click="emit('details', draft)"
        >
          {{ attrSummary(draft.process.outputStage, line.attrs, labels, [], 'mm') || '填写产出规格' }}
          <span class="sr-only">，查看工序单操作</span>
        </button>
        <p v-if="draft.process.code === 'FOLD' && draft.task" class="m-0 text-base font-bold factory-report-spec">
          {{ draft.task.output?.foldingType || '折法未确认，请联系主任' }}
        </p>
        <LaminationCounters
          v-if="draft.process.code === 'LAMINATE' && line.attrs.frontColor && line.attrs.backColor"
          compact
          :id-prefix="`laminate-${line.key}`"
          :line="line"
          :options="job.options"
          :unit="draft.process.outputUnit"
        />
        <ReportQuantityFields v-else :counted-good="draft.process.code === 'MIX'" :line="line" :unit="draft.process.outputUnit" />
      </div>
      <p v-if="quantityError" class="m-0 text-base text-destructive" role="alert">{{ quantityError }}</p>
      <p v-if="planWarning" class="m-0 text-sm text-warning" role="status">{{ planWarning }}</p>
      <button
        v-if="draft.outputs.length || finishingWithoutOutput"
        class="min-h-12 w-full rounded-md bg-primary px-4 text-base font-bold text-primary-foreground"
        type="submit"
      >
        {{ finishingWithoutOutput ? '直接完工' : '提交并完工' }}
      </button>
      <button v-else class="min-h-12 w-full rounded-md bg-primary px-4 text-base font-bold text-primary-foreground" type="button" @click="emit('details', draft)">
        查看工序单
      </button>
    </template>
    <template v-else>
      <p v-if="plannedSpec" class="m-0 text-lg font-bold factory-report-spec">{{ plannedSpec }}</p>
      <p v-if="loadError" class="m-0 text-base text-destructive" role="alert">{{ loadError }}</p>
      <button v-if="loadError" class="min-h-11 self-start rounded-md border border-border px-4 text-base" type="button" @click="retry++">重新加载</button>
      <p v-else class="m-0 text-base text-muted-foreground" role="status">正在读取产出规格</p>
    </template>
  </form>
</template>
