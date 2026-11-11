<script setup lang="ts">
import { computed } from 'vue';

import { attrSummary, formatQty, makeLabels } from '../../stage-stock/model';
import { issueShortages, useJob } from '../use-job';

const job = useJob();
const shortages = computed(() => issueShortages(job));
const labels = computed(() => makeLabels(job.options));
</script>

<template>
  <section v-if="shortages.length > 0" class="flex flex-col gap-2 rounded-lg border border-warning bg-warning/10 p-3 text-sm" role="alert">
    <b>按实际领料登记，以下库存将暂时为负</b>
    <div v-for="line in shortages" :key="`${line.stock.stage}-${line.stock.id}`" class="flex flex-col gap-0.5">
      <span>{{ attrSummary(line.stock.stage, line.stock.item, labels, [], 'mm') || line.name }} · 批次 {{ line.stock.batchNo }}</span>
      <span class="font-semibold text-destructive">领料后欠账 {{ formatQty(line.amount) }} {{ line.unit }}，需{{ line.action }}</span>
    </div>
    <span class="text-xs text-muted-foreground">可以继续提交实际领取数量，补录对应入库或上工序产出后余额恢复。</span>
  </section>
</template>
