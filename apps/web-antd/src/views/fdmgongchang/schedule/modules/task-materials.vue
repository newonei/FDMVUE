<script setup lang="ts">
import type { FdmgongchangScheduleApi as Api } from '#/api/fdmgongchang/schedule';

import { computed } from 'vue';

import { materialRows } from '../../shared/schedule';

/**
 * 任务的领料和产出，逐份写规格、数量和对应的半成品编码：
 * 例如开片「领料 板材 … 10张 · BC-TPE-REC001-HY-132X192X4.5」「产出 已开片板材 … 70片 · PC-TPE-HY-132X192X0.6 新规格」。
 * 旧任务没有时不显示。
 */
const props = defineProps<{
  /** 排单卡片突出物料规格和数量，领料默认收起；其他入口保持紧凑展示。 */
  cardView?: boolean;
  task: Pick<Api.PlanTask, 'inputs' | 'output' | 'quantity'> | Pick<Api.Task, 'inputs' | 'output' | 'plannedQuantity' | 'quantity'>;
}>();

const rows = computed(() => materialRows(props.task));
const groups = computed(() => (['领料', '产出'] as const)
  .map((kind) => ({ kind, rows: rows.value.filter((row) => row.kind === kind) }))
  .filter((group) => group.rows.length > 0));
</script>

<template>
  <div v-if="rows.length > 0" class="flex min-w-0 flex-col text-xs" :class="cardView ? 'gap-2' : 'gap-0.5'">
    <component
      :is="cardView && group.kind === '领料' ? 'details' : 'div'"
      v-for="group in groups"
      :key="group.kind"
      class="group min-w-0"
      :class="cardView && group.kind === '领料' ? 'rounded-md border border-border bg-muted/20' : ''"
    >
      <summary
        v-if="cardView && group.kind === '领料'"
        class="cursor-pointer rounded-md px-2 py-1.5 text-sm font-medium focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary"
      >
        领料明细（<strong class="text-base tabular-nums">{{ group.rows.length }}</strong> 项）
        <span class="ml-1 text-xs text-primary group-open:hidden">展开</span>
        <span class="ml-1 hidden text-xs text-primary group-open:inline">收起</span>
      </summary>
      <ul
        class="m-0 flex list-none flex-col p-0"
        :class="cardView ? ['gap-2', group.kind === '领料' ? 'border-t border-border p-2' : ''] : 'gap-0.5'"
      >
        <li v-for="(row, index) in group.rows" :key="index" class="flex gap-1.5">
          <span class="shrink-0 text-muted-foreground" :class="cardView ? 'pt-1' : ''">{{ row.kind }}</span>
          <span class="min-w-0 break-words">
            <span :class="cardView ? 'text-base font-semibold leading-6 text-foreground tabular-nums' : ''">{{ row.text }}</span>
            <code v-if="row.code" class="rounded bg-muted px-1 font-mono" :class="cardView ? 'mt-1 block w-fit max-w-full break-all text-xs font-normal text-muted-foreground' : 'ml-1'">{{ row.code }}</code>
            <span v-if="row.productCode" class="text-muted-foreground" :class="cardView ? 'mt-1 block break-all' : 'ml-1'">档案 {{ row.productCode }}</span>
            <span v-if="row.note" :class="[row.code ? 'text-muted-foreground' : 'text-warning', cardView ? 'mt-1 block' : 'ml-1']">（{{ row.note }}）</span>
          </span>
        </li>
      </ul>
    </component>
  </div>
</template>
