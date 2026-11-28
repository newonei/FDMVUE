<script setup lang="ts">
import { computed, ref } from 'vue';

import { Alert, InputNumber } from 'ant-design-vue';

import LaminationCounters from '../../shared/lamination-counters.vue';
import { quantityPrecision } from '../../shared/quantity';
import { reportPlanWarning } from '../../shared/report-plan-warning';
import {
  attrSummary,
  EDITABLE_FIELDS,
  formatQty,
  makeLabels,
  sliceHint,
  toNumber,
  validateOutputs,
} from '../../stage-stock/model';
import AttrFields from '../../stage-stock/modules/attr-fields.vue';
import { canFinishWithoutOutput, reportErrors } from '../report-quantity';
import { goodTotal, jobAllowsPlainEmboss, slicePlanThicknessError, stageOf, useJob } from '../use-job';
import ReportQuantityFields from './report-quantity-fields.vue';
import StepHeader from './step-header.vue';

import '../../shared/report-spec.css';

/**
 * 报实际产出：良品与不良品分别登记，规格按本工序计划和已领材料带出；
 * 这批做完了还是先报一部分；做完时可以把没用完的料退回去。
 */
const props = defineProps<{ embedded?: boolean; orderActions?: boolean }>();
const emit = defineEmits<{ back: []; next: []; supplement: [] }>();

const job = useJob();
const idPrefix = computed(() => props.embedded ? `batch-${job.order?.id}-` : '');
const labels = computed(() => makeLabels(job.options));
const output = computed(() => stageOf(job, job.process?.outputStage));
const outputUnit = computed(() => output.value?.unit ?? job.process?.outputUnit ?? job.task?.unit);
const planWarning = computed(() => reportPlanWarning(
  job.process?.code === 'MIX' ? job.task?.output?.mixPlan?.wholeBatchBoards ?? job.task?.quantity : job.task?.quantity,
  job.task?.actualQuantity ?? job.order?.goodQuantity, goodTotal(job), outputUnit.value,
));
const source = computed(() => stageOf(job, job.sourceStage));
const editable = computed(() => EDITABLE_FIELDS[job.process?.code ?? ''] ?? []);
const allowPlainEmboss = computed(() => jobAllowsPlainEmboss(job));

/** 目标规格不全时展开填写；开片仅填写单层厚度。 */
const specErrors = computed(() =>
  validateOutputs(job.process?.code ?? '', job.process?.outputStage ?? '', job.outputs, { allowPlainEmboss: allowPlainEmboss.value }).filter(
    (e) => !e.includes('数量'),
  ),
);
const editing = ref(false);
const showEditor = computed(() => editing.value || specErrors.value.length > 0);
const errors = ref<string[]>([]);

/** 计划量自动带入；理论开片量仍作领料与规格的核对参考。 */
const slicing = computed(() => job.process?.code === 'SLICE');
const tracksMaterials = computed(() => job.process?.code !== 'MIX');
const planThicknessError = computed(() => slicePlanThicknessError(job));
const finishingWithoutOutput = computed(() => job.finish && canFinishWithoutOutput(job));
const submitText = computed(() => {
  if (finishingWithoutOutput.value) return '直接完工';
  if (job.prepare || job.finish || job.createFinish || goodTotal(job) > 0) return '下一步：核对本次报工';
  return '提交本次产出';
});

const inputColors = computed(
  () =>
    [...new Set(job.inputs.map((l) => l.stock.item?.color || l.stock.item?.frontColor).filter(Boolean))] as string[],
);

function next() {
  errors.value = reportErrors(job);
  if (errors.value.length > 0) return;
  emit('next');
}
</script>

<template>
  <div class="mx-auto flex min-h-full w-full max-w-[720px] flex-col">
    <StepHeader
      v-if="!props.embedded"
      :title="`${job.process?.label} · 报本工序实际产出`"
      @back="emit('back')"
    />
    <form aria-label="报本工序实际产出" @submit.prevent="next">
      <div class="flex flex-col gap-3 px-3 py-4 sm:px-4">
        <p v-if="job.onBehalfOf" class="m-0 rounded-md bg-warning/10 p-2.5 text-sm">正在替 {{ job.onBehalfOf.name }} 报工</p>
        <Alert v-if="planThicknessError" :message="planThicknessError" show-icon type="warning" />
        <p v-if="job.process?.code === 'FOLD' && job.task" class="m-0 text-base font-bold factory-report-spec">
          {{ job.task?.output?.foldingType ? `折叠要求：${job.task.output.foldingType}` : '折叠要求未确认，请联系主任' }}
        </p>

        <section v-for="line in job.outputs" :key="line.key" class="flex flex-col gap-3 border-b border-border pb-3">
          <div class="flex flex-col gap-1">
            <div class="flex flex-wrap items-center justify-between gap-2">
              <b class="text-base">实际产出：{{ output?.label || job.process?.outputLabel }}</b>
              <button v-if="editable.length > 0 && specErrors.length === 0 && !slicing" class="min-h-11 rounded-md px-2 text-sm font-semibold text-primary hover:bg-muted" type="button" @click="editing = !editing">
                {{ editing ? '收起规格' : '修改规格' }}
              </button>
            </div>
            <span v-if="attrSummary(job.process?.outputStage ?? '', line.attrs, labels, [], 'mm')" class="text-lg font-bold factory-report-spec">{{ attrSummary(job.process?.outputStage ?? '', line.attrs, labels, [], 'mm') }}</span>
            <AttrFields
              v-if="(slicing || showEditor) && editable.length > 0"
              v-model="line.attrs"
              :color-choices="job.process?.code === 'LAMINATE' ? inputColors : undefined"
              :fields="editable"
              :id-prefix="`${idPrefix}wb-${line.key}`"
              :options="job.options!"
              dimension-unit="mm"
            />
          </div>

          <LaminationCounters v-if="job.process?.code === 'LAMINATE' && line.attrs.frontColor && line.attrs.backColor" :line="line" :id-prefix="`${idPrefix}laminate-${line.key}`" :options="job.options" :unit="outputUnit" />
          <template v-else>
            <ReportQuantityFields :counted-good="job.process?.code === 'MIX'" :id-prefix="idPrefix" :line="line" :unit="outputUnit" />
            <p class="m-0 text-base tabular-nums" aria-live="polite">良品 <b>{{ formatQty(line.goodQuantity) }} {{ outputUnit }}</b></p>
            <p v-if="slicing" class="m-0 text-sm text-muted-foreground">{{ sliceHint(job.inputs, job.outputs, line) }}</p>
          </template>
        </section>
        <Alert v-if="planWarning" :message="planWarning" show-icon type="warning" />

        <details v-if="slicing && job.inputs.length > 0" class="text-sm text-muted-foreground">
          <summary class="min-h-11 cursor-pointer content-center">查看板材规格</summary>
          <p v-for="line in job.inputs" :key="line.stock.id" class="mb-1">
            {{ attrSummary(line.stock.stage, line.stock.item, labels, [], 'mm') || line.stock.itemCode }} · {{ formatQty(line.quantity) }} {{ source?.unit }}
          </p>
          <p class="m-0">颜色沿用板材，厚度填写单层厚度。</p>
        </details>

        <label v-if="!job.createFinish" class="flex min-h-11 cursor-pointer items-center gap-3 text-base font-semibold">
          <input v-model="job.finish" class="size-5 shrink-0 accent-primary" type="checkbox" />
          本次报工后完工
        </label>
        <p v-if="props.embedded && finishingWithoutOutput" class="m-0 text-sm text-muted-foreground">已有报工记录，本次只完工。</p>

        <section v-if="tracksMaterials && !job.createFinish && job.finish && job.order" class="flex flex-col gap-1.5 rounded-lg border border-border bg-card p-3">
          <span class="text-sm font-bold">有没用完的料？填退回多少（没有就不用填）</span>
          <div
            v-for="input in (job.order.inputs ?? []).filter((i) => i.stage !== 'AUX')"
            :key="input.id"
            class="flex flex-wrap items-center justify-between gap-2 border-t border-border pt-1.5"
          >
            <span class="flex min-w-0 flex-col">
              <span class="text-sm font-semibold">{{ attrSummary(input.stage, input.item, labels, [], 'mm') || input.itemCode }}</span>
              <span class="text-xs text-muted-foreground">
                批次 {{ input.batchNo }} · 最多退 {{ formatQty((toNumber(input.quantity) ?? 0) - (toNumber(input.returnedQuantity) ?? 0)) }} {{ source?.unit }}
              </span>
            </span>
            <InputNumber
              :id="`${idPrefix}return-${input.id}`"
              :aria-label="`${attrSummary(input.stage, input.item, labels, [], 'mm') || input.itemCode} 退回数量`"
              :addon-after="source?.unit"
              :max="(toNumber(input.quantity) ?? 0) - (toNumber(input.returnedQuantity) ?? 0)"
              :min="0"
              :precision="quantityPrecision(source?.unit)"
              :value="job.returns[input.id] ?? undefined"
              class="w-40"
              placeholder="退回数量"
              @change="(v) => (job.returns[input.id] = v === null || v === undefined || v === '' ? null : Number(v))"
            />
          </div>
        </section>

        <Alert v-if="errors.length > 0" show-icon type="error">
          <template #message>
            <ul class="m-0 list-disc pl-4">
              <li v-for="e in errors" :key="e">{{ e }}</li>
            </ul>
          </template>
        </Alert>
      </div>
      <footer v-if="!props.embedded" class="flex flex-col gap-2 px-3 pb-4 sm:px-4">
        <button class="min-h-12 w-full rounded-md bg-primary text-base font-semibold text-primary-foreground" type="submit">
          {{ submitText }}
        </button>
        <button v-if="tracksMaterials && orderActions" class="min-h-11 rounded-md border border-border text-base font-semibold" type="button" @click="emit('supplement')">补领材料</button>
      </footer>
    </form>
  </div>
</template>
