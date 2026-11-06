<script setup lang="ts">
import type { FdmgongchangScheduleApi as Api } from '#/api/fdmgongchang/schedule';

import { computed } from 'vue';

import { materialRows } from '../../shared/schedule';

/**
 * 任务的领料和产出，逐份写规格、数量和对应的半成品编码：
 * 例如开片「领料 板材 … 10张 · BC-TPE-REC001-HY-132X192X4.5」「产出 片材 … 70片 · PC-TPE-HY-132X192X0.6 新规格」。
 * 旧任务没有时不显示。
 */
const props = defineProps<{
  task: Pick<Api.PlanTask, 'inputs' | 'output' | 'quantity'> | Pick<Api.Task, 'inputs' | 'output' | 'plannedQuantity' | 'quantity'>;
}>();

const rows = computed(() => materialRows(props.task));
</script>

<template>
  <ul v-if="rows.length > 0" class="m-0 flex list-none flex-col gap-0.5 p-0 text-xs">
    <li v-for="(row, index) in rows" :key="index" class="flex gap-1.5">
      <span class="shrink-0 text-muted-foreground">{{ row.kind }}</span>
      <span class="min-w-0 break-words">
        {{ row.text }}
        <code v-if="row.code" class="ml-1 rounded bg-muted px-1 font-mono">{{ row.code }}</code>
        <span v-if="row.productCode" class="ml-1 text-muted-foreground">档案 {{ row.productCode }}</span>
        <span v-if="row.note" :class="row.code ? 'text-muted-foreground' : 'text-warning'" class="ml-1">（{{ row.note }}）</span>
      </span>
    </li>
  </ul>
</template>
