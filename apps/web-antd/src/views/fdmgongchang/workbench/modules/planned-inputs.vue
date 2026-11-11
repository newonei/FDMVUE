<script setup lang="ts">
import type { Labels } from '../../stage-stock/model';

import type { FdmgongchangScheduleApi } from '#/api/fdmgongchang/schedule';

import { dimensionTextInMm } from '../../shared/dimensions';
import { TASK_STAGE_LABELS } from '../../shared/schedule';
import { attrSummary, formatQty, toNumber } from '../../stage-stock/model';

defineProps<{
  inputs?: FdmgongchangScheduleApi.Material[] | null;
  labels: Labels;
}>();

const nameOf = (material: FdmgongchangScheduleApi.Material, labels: Labels) => {
  if (['AUX', 'RAW'].includes(material.stage) && material.name) return dimensionTextInMm(material.name);
  const summary = attrSummary(material.stage, material.attrs, labels, [], 'mm');
  return summary ? (material.name?.match(/^(正面|反面)\s/)?.[0] || '') + summary
    : dimensionTextInMm(material.name) || material.code || material.productCode || '待确认物料';
};
</script>

<template>
  <section class="flex flex-col gap-1.5 rounded-md border border-dashed border-border bg-muted/30 p-3 text-sm">
    <b>预计领料</b>
    <span class="text-xs text-muted-foreground">下发任务时的用料计划；实际批次和数量在领料开工时确认。</span>
    <ul v-if="inputs?.length" class="m-0 flex list-none flex-col gap-2 p-0">
      <li v-for="(material, index) in inputs" :key="index" class="flex flex-col gap-0.5">
        <div class="flex flex-wrap items-baseline justify-between gap-x-3">
          <span>{{ TASK_STAGE_LABELS[material.stage] || material.stage }} · {{ nameOf(material, labels) }}</span>
          <b class="shrink-0 tabular-nums">{{ toNumber(material.quantity) === undefined ? '数量待确认' : `${formatQty(material.quantity)} ${material.unit || ''}` }}</b>
        </div>
        <span v-if="material.note" class="text-xs text-muted-foreground">{{ dimensionTextInMm(material.note) }}</span>
      </li>
    </ul>
    <span v-else class="text-xs text-muted-foreground">任务未单独填写预计领料，请参考下面的推荐批次，并按实际领取登记。</span>
    <span class="text-xs text-muted-foreground">预计领料不扣库存；确认实际领料后扣减，报工登记本工序产出。</span>
  </section>
</template>
