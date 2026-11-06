<script setup lang="ts">
import type { FdmgongchangScheduleApi as Api } from '#/api/fdmgongchang/schedule';

import { computed } from 'vue';

import { taskMaterials } from '../../shared/schedule';

/** 任务的领料和产出：例如开片「领料 板材 … 10张」「产出 片材 … 70片」。旧任务没有时不显示。 */
const props = defineProps<{
  task: Pick<Api.PlanTask, 'inputs' | 'output' | 'quantity'> | Pick<Api.Task, 'inputs' | 'output' | 'plannedQuantity' | 'quantity'>;
}>();

const lines = computed(() => taskMaterials(props.task));
</script>

<template>
  <dl v-if="lines" class="m-0 flex flex-col gap-0.5 text-xs">
    <div v-if="lines.input" class="flex gap-1.5">
      <dt class="shrink-0 text-muted-foreground">领料</dt>
      <dd class="m-0 min-w-0 break-words">{{ lines.input }}</dd>
    </div>
    <div v-if="lines.output" class="flex gap-1.5">
      <dt class="shrink-0 text-muted-foreground">产出</dt>
      <dd class="m-0 min-w-0 break-words">{{ lines.output }}</dd>
    </div>
  </dl>
</template>
