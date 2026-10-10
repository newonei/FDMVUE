<script setup lang="ts">
import { computed, ref } from 'vue';

import { Alert } from 'ant-design-vue';

import {
  attrSummary,
  EDITABLE_FIELDS,
  formatQty,
  makeLabels,
  toNumber,
  validateOutputs,
} from '../../stage-stock/model';
import AttrFields from '../../stage-stock/modules/attr-fields.vue';
import { goodTotal, outputPayload, stageOf, useJob } from '../use-job';
import BigCounter from './big-counter.vue';
import StepHeader from './step-header.vue';

/**
 * 第 3 步 报数量：好的多少、坏的多少（大计数器），规格按领的料带出；
 * 这批做完了还是先报一部分；做完时可以把没用完的料退回去。
 */
const emit = defineEmits<{ back: []; next: [] }>();
const job = useJob();
const labels = computed(() => makeLabels(job.options));
const output = computed(() => stageOf(job, job.process?.outputStage));
const source = computed(() => stageOf(job, job.sourceStage));
const editable = computed(() => EDITABLE_FIELDS[job.process?.code ?? ''] ?? []);
const reportedBefore = computed(() => job.order?.reportCount ?? 0);

/** 规格不全（例如开片要填长宽）时直接展开让人填。 */
const specErrors = computed(() =>
  validateOutputs(job.process?.code ?? '', job.process?.outputStage ?? '', job.outputs).filter(
    (e) => !e.includes('数量'),
  ),
);
const editing = ref(false);
const showEditor = computed(() => editing.value || specErrors.value.length > 0);
const errors = ref<string[]>([]);

const inputColors = computed(
  () =>
    [...new Set(job.inputs.map((l) => l.stock.item?.color || l.stock.item?.frontColor).filter(Boolean))] as string[],
);

function next() {
  const closingOnly = !job.createFinish && job.finish && reportedBefore.value > 0 && outputPayload(job).length === 0;
  errors.value = closingOnly ? [] : validateOutputs(job.process?.code ?? '', job.process?.outputStage ?? '', job.outputs);
  if (errors.value.length > 0) return;
  emit('next');
}
</script>

<template>
  <div class="flex min-h-full flex-col">
    <StepHeader
      :current="3"
      :subtitle="`领了 ${job.inputs.map((l) => formatQty(l.quantity)).join(' + ')} ${source?.unit ?? ''}${source?.label ?? ''}`"
      :title="`${job.process?.label} · 第 3 步 报数量`"
      :total="3"
      @back="emit('back')"
    />
    <main class="flex flex-1 flex-col gap-3 p-4">
      <p v-if="reportedBefore > 0" class="m-0 rounded-xl bg-primary/10 p-3 text-sm text-primary">
        这张单已经报过 {{ reportedBefore }} 次，共 {{ formatQty(job.order?.goodQuantity) }} {{ output?.unit }}，这次只报新做的。
      </p>
      <template v-for="(line, index) in job.outputs" :key="line.key">
        <section class="flex flex-col gap-2.5 rounded-2xl bg-card p-4 shadow-sm">
          <span class="text-base font-bold">
            好的有多少{{ output?.unit }}？<template v-if="job.outputs.length > 1">（第 {{ index + 1 }} 种）</template>
          </span>
          <BigCounter :id="`good-${line.key}`" v-model="line.goodQuantity" label="好的数量" :precision="3" />
          <span class="text-center text-[13px] text-muted-foreground">点中间的数字可以直接输入</span>
        </section>
        <section class="flex flex-col gap-2.5 rounded-2xl bg-card p-4 shadow-sm">
          <span class="text-base font-bold">坏的（残次）有多少{{ output?.unit }}？</span>
          <BigCounter :id="`bad-${line.key}`" v-model="line.defectQuantity" label="坏的数量" :precision="3" size="medium" tone="danger" />
        </section>
        <section class="flex flex-col gap-2 rounded-2xl bg-card px-4 py-3.5">
          <div class="flex items-center justify-between">
            <span class="text-[15px] font-bold">做出来的{{ output?.label }}</span>
            <button v-if="editable.length > 0 && specErrors.length === 0" class="h-11 px-2 text-sm font-bold text-primary" type="button" @click="editing = !editing">
              {{ editing ? '收起' : '不对？改一下' }}
            </button>
          </div>
          <span class="text-[15px]">{{ attrSummary(job.process?.outputStage ?? '', line.attrs, labels) || '—' }}</span>
          <span v-if="specErrors.length > 0" class="text-[13px] text-warning">还差几个规格，请补上：</span>
          <AttrFields
            v-if="showEditor && editable.length > 0"
            v-model="line.attrs"
            :color-choices="['SLICE', 'LAMINATE'].includes(job.process?.code ?? '') ? inputColors : undefined"
            :fields="editable"
            :id-prefix="`wb-${line.key}`"
            :options="job.options!"
          />
          <span v-else class="text-[13px] text-muted-foreground">按领的料自动带出，一般不用改</span>
        </section>
      </template>

      <section v-if="!job.createFinish" class="flex flex-col gap-2">
        <button
          :class="job.finish ? 'border-[3px] border-primary' : 'border-2 border-border'"
          class="flex flex-col gap-0.5 rounded-xl bg-card px-3.5 py-3 text-left"
          type="button"
          @click="job.finish = true"
        >
          <b class="text-base">这批都做完了</b>
          <span class="text-[13px] text-muted-foreground">结束这张单</span>
        </button>
        <button
          :class="!job.finish ? 'border-[3px] border-primary' : 'border-2 border-border'"
          class="flex flex-col gap-0.5 rounded-xl bg-card px-3.5 py-3 text-left"
          type="button"
          @click="job.finish = false"
        >
          <b class="text-base">先报这些，还没做完</b>
          <span class="text-[13px] text-muted-foreground">单子留着，下次接着报</span>
        </button>
      </section>

      <section v-if="!job.createFinish && job.finish && job.order" class="flex flex-col gap-2.5 rounded-2xl bg-card p-4">
        <span class="text-[15px] font-bold">有没用完的料？退回去（没有就不用填）</span>
        <div v-for="input in job.order.inputs ?? []" :key="input.id" class="flex flex-col gap-1.5">
          <span class="text-[13px] text-muted-foreground">
            {{ attrSummary(input.stage, input.item, labels) || input.itemCode }} · 最多退 {{ formatQty((toNumber(input.quantity) ?? 0) - (toNumber(input.returnedQuantity) ?? 0)) }} {{ source?.unit }}
          </span>
          <BigCounter
            :id="`return-${input.id}`"
            v-model="job.returns[input.id]"
            label="退回数量"
            :max="(toNumber(input.quantity) ?? 0) - (toNumber(input.returnedQuantity) ?? 0)"
            :precision="3"
            size="medium"
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
    <footer class="sticky bottom-0 border-t border-border bg-card px-4 pb-5 pt-3">
      <button class="h-14 w-full rounded-xl bg-primary text-lg font-bold text-primary-foreground" type="button" @click="next">
        {{ goodTotal(job) > 0 ? '下一步：确认计件' : '提交' }}
      </button>
    </footer>
  </div>
</template>
