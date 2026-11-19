<script setup lang="ts">
import type { LaminationReportDraft } from './lamination-report';

import type { FdmgongchangStageStockApi as Api } from '#/api/fdmgongchang/stage-stock';

import { computed } from 'vue';

import { InputNumber } from 'ant-design-vue';

import { formatQty, makeLabels } from '../stage-stock/model';
import { changeLaminationDefect, changeLaminationGood, laminationLayers } from './lamination-report';

import './report-spec.css';

const props = defineProps<{ compact?: boolean; idPrefix: string; line: LaminationReportDraft; options?: Api.Options; unit?: null | string }>();
const labels = computed(() => makeLabels(props.options));
const layers = computed(() => laminationLayers(props.line));
</script>

<template>
  <section class="rounded-lg border border-border bg-card p-3">
    <div class="mb-2 grid grid-cols-3 gap-2 text-sm font-bold"><span>片材颜色</span><span>良品数量</span><span>瑕疵数量</span></div>
    <div v-for="layer in layers" :key="layer.side" class="grid grid-cols-3 items-center gap-2 border-t border-border py-2">
      <span class="break-words text-sm font-semibold factory-report-spec">{{ layer.side === 'FRONT' ? '正面' : '反面' }} · {{ labels.color(layer.color) }}</span>
      <InputNumber :id="`${idPrefix}-good-${layer.side}`" :value="layer.goodQuantity" :min="0" :precision="0" :controls="false" class="lamination-quantity !w-full" inputmode="numeric" :aria-label="`${layer.side === 'FRONT' ? '正面' : '反面'} ${labels.color(layer.color)} 本次片材良品`" placeholder="填良品" @change="changeLaminationGood(line, layer.side, $event === null || $event === '' ? undefined : Number($event))" />
      <InputNumber :id="`${idPrefix}-defect-${layer.side}`" :value="layer.defectQuantity" :min="0" :precision="0" :controls="false" class="lamination-quantity !w-full" inputmode="numeric" :aria-label="`${layer.side === 'FRONT' ? '正面' : '反面'} ${labels.color(layer.color)} 本次片材残次`" placeholder="0" @change="changeLaminationDefect(line, layer.side, $event === null || $event === '' ? undefined : Number($event))" />
    </div>
    <template v-if="!compact">
      <p class="mb-0 mt-1 text-sm font-semibold">本次贴合良品 {{ formatQty(line.goodQuantity) }} {{ unit || '片' }}</p>
      <p class="mb-0 mt-1 text-sm text-muted-foreground">瑕疵按面扣减，多出的良品可退料。</p>
    </template>
  </section>
</template>

<style scoped>
.lamination-quantity :deep(input) {
  height: 44px;
  padding-inline: 6px;
  font-size: 18px;
  font-weight: 600;
}
</style>
