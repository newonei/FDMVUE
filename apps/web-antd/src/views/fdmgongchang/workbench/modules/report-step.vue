<script setup lang="ts">
import { computed, ref } from 'vue';

import { Alert, InputNumber } from 'ant-design-vue';

import { dimensionTextInMm } from '../../shared/dimensions';
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
import { goodTotal, outputPayload, slicePlanThicknessError, stageOf, useJob } from '../use-job';
import BigCounter from './big-counter.vue';
import StepHeader from './step-header.vue';

/**
 * 报实际产出：良品与不良品分别登记，规格按本工序计划和已领材料带出；
 * 这批做完了还是先报一部分；做完时可以把没用完的料退回去。
 */
const emit = defineEmits<{ back: []; next: [] }>();
const job = useJob();
const labels = computed(() => makeLabels(job.options));
const output = computed(() => stageOf(job, job.process?.outputStage));
const source = computed(() => stageOf(job, job.sourceStage));
const editable = computed(() => EDITABLE_FIELDS[job.process?.code ?? ''] ?? []);
const reportedBefore = computed(() => job.order?.reportCount ?? 0);
const plannedAttrs = computed(() => job.prepare?.outputAttrs ?? job.task?.output?.attrs ?? job.prepare?.targetAttrs);
const plannedSpec = computed(() => plannedAttrs.value ? attrSummary(job.process?.outputStage ?? '', plannedAttrs.value, labels.value, [], 'mm') : dimensionTextInMm(job.task?.spec));

/** 目标规格不全时展开填写；开片仅填写单层厚度。 */
const specErrors = computed(() =>
  validateOutputs(job.process?.code ?? '', job.process?.outputStage ?? '', job.outputs).filter(
    (e) => !e.includes('数量'),
  ),
);
const editing = ref(false);
const showEditor = computed(() => editing.value || specErrors.value.length > 0);
const errors = ref<string[]>([]);

/** 理论开片量只作参考，实际良品和不良品必须由工人填写。 */
const slicing = computed(() => job.process?.code === 'SLICE');
const planThicknessError = computed(() => slicePlanThicknessError(job));

const inputColors = computed(
  () =>
    [...new Set(job.inputs.map((l) => l.stock.item?.color || l.stock.item?.frontColor).filter(Boolean))] as string[],
);

function next() {
  const closingOnly = !job.createFinish && job.finish && reportedBefore.value > 0 && outputPayload(job).length === 0;
  errors.value = closingOnly ? [] : validateOutputs(job.process?.code ?? '', job.process?.outputStage ?? '', job.outputs);
  if (!closingOnly && planThicknessError.value) errors.value.push(planThicknessError.value);
  if (errors.value.length > 0) return;
  emit('next');
}
</script>

<template>
  <div class="mx-auto flex min-h-full w-full max-w-[720px] flex-col">
    <StepHeader
      :current="1"
      :subtitle="`领了 ${job.inputs.map((l) => `${attrSummary(l.stock.stage, l.stock.item, labels, [], 'mm') || l.stock.itemCode} ${formatQty(l.quantity)}`).join(' · ')} ${source?.unit ?? ''}`"
      :title="`${job.process?.label} · 报本工序实际产出`"
      :total="2"
      @back="emit('back')"
    />
    <main class="flex flex-1 flex-col gap-3 p-4">
      <p v-if="job.onBehalfOf" class="m-0 rounded-md bg-warning/10 p-2.5 text-xs text-warning">
        正在替 {{ job.onBehalfOf.name }} 报工：工序单和计件记在他名下，备注写你代报。
      </p>
      <Alert v-if="planThicknessError" :message="planThicknessError" show-icon type="warning" />
      <section v-if="job.task" class="flex flex-col gap-1 rounded-lg border border-primary/40 bg-primary/5 p-3 text-sm">
        <b>计划产出：{{ job.prepare?.outputLabel || output?.label }} {{ formatQty(job.task.quantity) }} {{ job.prepare?.outputUnit || job.task.unit }}</b>
        <span v-if="plannedSpec">计划规格：{{ plannedSpec }}</span>
        <span class="text-xs text-muted-foreground">关联订单产品：{{ job.task.product || '备货' }}。以下仅登记本次新产出的良品和不良品，领料已在开工时扣减。</span>
      </section>
      <p v-if="reportedBefore > 0" class="m-0 rounded-md bg-primary/10 p-2.5 text-xs text-primary">
        这张单已经报过 {{ reportedBefore }} 次，共 {{ formatQty(job.order?.goodQuantity) }} {{ output?.unit }}，这次只报新做的。
      </p>
      <div v-for="(line, index) in job.outputs" :key="line.key" class="flex flex-col gap-3">
        <div class="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <section class="flex flex-col gap-2 rounded-lg bg-card p-3 border border-border">
          <span class="text-sm font-bold">
            本次良品（{{ output?.unit }}）<template v-if="job.outputs.length > 1">（第 {{ index + 1 }} 种）</template>
          </span>
          <BigCounter :id="`good-${line.key}`" v-model="line.goodQuantity" label="好的数量" :precision="3" />
          <span v-if="slicing" class="text-center text-xs text-primary">{{ sliceHint(job.inputs, job.outputs, line) }}</span>
          <span v-else class="text-center text-xs text-muted-foreground">点中间的数字可以直接输入</span>
        </section>
        <section class="flex flex-col gap-2 rounded-lg bg-card p-3 border border-border">
          <span class="text-sm font-bold">本次不良品（{{ output?.unit }}）</span>
          <BigCounter :id="`bad-${line.key}`" v-model="line.defectQuantity" label="坏的数量" :precision="3" size="medium" tone="danger" />
        </section>
        </div>
        <!-- 开片先核对板材规格，放在数量上面 -->
        <section :class="slicing ? 'order-first border-primary/40' : 'border-border'" class="flex flex-col gap-1.5 rounded-lg border bg-card px-3 py-2.5">
          <div class="flex items-center justify-between">
            <span class="text-sm font-bold">实际产出：{{ output?.label }}</span>
            <button v-if="editable.length > 0 && specErrors.length === 0 && !slicing" class="h-8 px-2 text-xs font-semibold text-primary" type="button" @click="editing = !editing">
              {{ editing ? '收起' : '不对？改一下' }}
            </button>
          </div>
          <span class="text-sm">{{ attrSummary(job.process?.outputStage ?? '', line.attrs, labels, [], 'mm') || '—' }}</span>
          <span v-if="slicing" class="text-xs text-muted-foreground">开片不会改变颜色，颜色固定沿用对应领料，不可修改。材质、配方和长宽沿用实际领料；厚度填写单层厚度，双色 6 mm 瑜伽垫开为两层各 3 mm，贴合后为 6 mm。</span>
          <span v-else-if="job.process?.code === 'CUT'" class="text-xs text-muted-foreground">材质、配方、颜色和厚度沿用实际领料；仅填写本次立切产出的长、宽，单位 mm。</span>
          <span v-if="specErrors.length > 0" class="text-xs text-warning">还差几个规格，请补上：</span>
          <AttrFields
            v-if="(slicing || showEditor) && editable.length > 0"
            v-model="line.attrs"
            :color-choices="job.process?.code === 'LAMINATE' ? inputColors : undefined"
            :fields="editable"
            :id-prefix="`wb-${line.key}`"
            :options="job.options!"
            dimension-unit="mm"
          />
          <span v-else class="text-xs text-muted-foreground">规格按本工序计划和已领物料带出，请核对实物</span>
        </section>
      </div>

      <section v-if="!job.createFinish" class="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <button
          :class="job.finish ? 'border-2 border-primary' : 'border border-border'"
          class="flex flex-col gap-0.5 rounded-md bg-card px-3 py-2 text-left"
          type="button"
          @click="job.finish = true"
        >
          <b class="text-sm">{{ job.prepare ? '这个任务做完了' : '这批都做完了' }}</b>
          <span class="text-xs text-muted-foreground">{{ job.prepare ? '任务算报完' : '结束这张单' }}</span>
        </button>
        <button
          :class="!job.finish ? 'border-2 border-primary' : 'border border-border'"
          class="flex flex-col gap-0.5 rounded-md bg-card px-3 py-2 text-left"
          type="button"
          @click="job.finish = false"
        >
          <b class="text-sm">先报这些，还没做完</b>
          <span class="text-xs text-muted-foreground">{{ job.prepare ? '任务留着，明天接着报' : '单子留着，下次接着报' }}</span>
        </button>
      </section>

      <section v-if="!job.createFinish && job.finish && job.order" class="flex flex-col gap-1.5 rounded-lg border border-border bg-card p-3">
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
            :id="`return-${input.id}`"
            :aria-label="`${attrSummary(input.stage, input.item, labels, [], 'mm') || input.itemCode} 退回数量`"
            :addon-after="source?.unit"
            :max="(toNumber(input.quantity) ?? 0) - (toNumber(input.returnedQuantity) ?? 0)"
            :min="0"
            :precision="3"
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
    </main>
    <footer class="sticky bottom-0 border-t border-border bg-card px-4 pb-4 pt-3">
      <button class="h-10 w-full rounded-md bg-primary text-sm font-semibold text-primary-foreground" type="button" @click="next">
        {{ goodTotal(job) > 0 ? '下一步：确认计件' : '提交' }}
      </button>
    </footer>
  </div>
</template>
