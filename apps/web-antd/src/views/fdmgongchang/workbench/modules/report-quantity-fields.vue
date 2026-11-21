<script setup lang="ts">
import type { OutputDraft } from '../../stage-stock/model';

import { computed } from 'vue';

import { InputNumber } from 'ant-design-vue';

import { quantityPrecision } from '../../shared/quantity';
import { changeReportDefect, changeReportTotal } from '../report-quantity';

const props = defineProps<{ idPrefix?: string; line: OutputDraft; unit?: null | string }>();
const precision = computed(() => quantityPrecision(props.unit));
const totalId = computed(() => `${props.idPrefix ?? ''}total-${props.line.key}`);
const defectId = computed(() => `${props.idPrefix ?? ''}bad-${props.line.key}`);
</script>

<template>
  <div class="grid grid-cols-2 gap-3">
    <div class="flex min-w-0 flex-col gap-1">
      <label :for="totalId" class="text-base font-semibold">
        本次产量<span class="text-sm font-normal">（含瑕疵）</span>
      </label>
      <InputNumber
        :id="totalId"
        :value="line.reportTotal ?? line.goodQuantity"
        :aria-label="`本次产量（含瑕疵）${unit || ''}`"
        :min="0"
        :precision="precision"
        :controls="false"
        :inputmode="precision === 0 ? 'numeric' : 'decimal'"
        class="quantity-field !w-full"
        placeholder="填产量"
        @change="changeReportTotal(line, typeof $event === 'number' ? $event : null)"
      />
    </div>
    <div class="flex min-w-0 flex-col gap-1">
      <label :for="defectId" class="text-base font-semibold">瑕疵数量</label>
      <InputNumber
        :id="defectId"
        :value="line.defectQuantity ?? 0"
        :aria-label="`瑕疵数量 ${unit || ''}`"
        :min="0"
        :precision="precision"
        :controls="false"
        :inputmode="precision === 0 ? 'numeric' : 'decimal'"
        class="quantity-field !w-full"
        placeholder="0"
        @change="changeReportDefect(line, typeof $event === 'number' ? $event : null)"
      />
    </div>
  </div>
</template>

<style scoped>
.quantity-field :deep(input) {
  height: 48px;
  font-size: 24px;
  font-weight: 700;
}
</style>
