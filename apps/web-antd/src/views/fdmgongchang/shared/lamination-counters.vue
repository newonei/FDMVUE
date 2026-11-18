<script setup lang="ts">
import type { LaminationReportDraft } from './lamination-report';

import type { FdmgongchangStageStockApi as Api } from '#/api/fdmgongchang/stage-stock';

import { computed } from 'vue';

import { InputNumber } from 'ant-design-vue';

import { formatQty, makeLabels } from '../stage-stock/model';
import { changeLaminationDefect, changeLaminationGood, laminationLayers } from './lamination-report';

const props = defineProps<{ idPrefix: string; line: LaminationReportDraft; options?: Api.Options; unit?: null | string }>();
const labels = computed(() => makeLabels(props.options));
const layers = computed(() => laminationLayers(props.line));
</script>

<template>
  <section class="rounded-lg border border-border bg-card p-3">
    <div class="mb-2 grid grid-cols-[minmax(80px,1fr)_minmax(90px,1fr)_minmax(90px,1fr)] gap-2 text-sm font-bold"><span>片材颜色</span><span>本次片材良品</span><span>本次片材残次</span></div>
    <div v-for="layer in layers" :key="layer.side" class="grid grid-cols-[minmax(80px,1fr)_minmax(90px,1fr)_minmax(90px,1fr)] items-center gap-2 border-t border-border py-2">
      <span class="text-sm" :class="layer.side === 'FRONT' ? 'text-blue-700' : 'text-purple-700'">{{ layer.side === 'FRONT' ? '正面' : '反面' }} · {{ labels.color(layer.color) }}</span>
      <InputNumber :id="`${idPrefix}-good-${layer.side}`" :value="layer.goodQuantity" :min="0" :precision="0" class="!w-full" :addon-after="unit || '片'" :aria-label="`${layer.side === 'FRONT' ? '正面' : '反面'} ${labels.color(layer.color)} 本次片材良品`" placeholder="良品数" @change="changeLaminationGood(line, layer.side, $event === null || $event === '' ? undefined : Number($event))" />
      <InputNumber :id="`${idPrefix}-defect-${layer.side}`" :value="layer.defectQuantity" :min="0" :precision="0" class="!w-full" :addon-after="unit || '片'" :aria-label="`${layer.side === 'FRONT' ? '正面' : '反面'} ${labels.color(layer.color)} 本次片材残次`" placeholder="残次数" @change="changeLaminationDefect(line, layer.side, $event === null || $event === '' ? undefined : Number($event))" />
    </div>
    <p class="mb-0 mt-1 text-sm font-semibold">本次贴合良品 {{ formatQty(line.goodQuantity) }} {{ unit || '片' }}</p>
    <p class="mb-0 mt-1 text-xs text-muted-foreground">残次只扣对应颜色；贴合良品按两色良品中较少的数量计算。多出的好片留作余料，结束生产时请核对退料。</p>
  </section>
</template>
