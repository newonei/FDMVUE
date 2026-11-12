<script setup lang="ts">
import type { FdmgongchangFactoryApi } from '#/api/fdmgongchang/factory';
import type { FdmgongchangScheduleApi as Api } from '#/api/fdmgongchang/schedule';

import { computed } from 'vue';

import { Button, Empty, InputNumber, Select, Tag } from 'ant-design-vue';

import { dayLabel, groupByDate, PROCESS_LABELS, rescaleMaterials, taskMaterialText } from '../../shared/schedule';
import TaskMaterials from './task-materials.vue';

/** 待确认方案的任务表：按天分组，可以改数量、换人、删任务，或打开表单整条修改。 */
const props = defineProps<{
  editable: boolean;
  workers: FdmgongchangFactoryApi.Worker[];
}>();
const emit = defineEmits<{ edit: [task: Api.PlanTask] }>();
const tasks = defineModel<Api.PlanTask[]>('tasks', { required: true });

const groups = computed(() => groupByDate(tasks.value, (t) => t.date));
const workerOptions = (process: string) =>
  props.workers
    .filter((w) => w.posts.includes(process))
    .map((w) => ({
      label: [w.nickname, w.team].filter(Boolean).join(' · '),
      value: w.userId,
    }));
const nameOf = (id: number) =>
  props.workers.find((w) => w.userId === id)?.nickname ?? String(id);

/** 旧任务的固定物料按数量换算；结构化产出通过完整表单重新计算领料。 */
function setQuantity(task: Api.PlanTask, value: number) {
  const next = rescaleMaterials(task, task.quantity, value);
  task.inputs = next.inputs;
  task.output = next.output;
  task.quantity = value;
  if (task.covers?.length === 1) task.covers[0]!.quantity = value;
}

function remove(task: Api.PlanTask) {
  tasks.value = tasks.value.filter((t) => t !== task);
}
</script>

<template>
  <div class="flex flex-col gap-4">
    <Empty v-if="tasks.length === 0" description="方案里没有任务" />
    <section v-for="[date, list] in groups" :key="date" class="flex flex-col gap-2">
      <h4 class="m-0 text-sm font-semibold">{{ dayLabel(date) }}</h4>
      <div class="overflow-x-auto rounded-md border border-border">
        <table class="w-full min-w-[820px] text-sm">
          <thead class="bg-muted/40 text-xs text-muted-foreground">
            <tr>
              <th class="px-2 py-1.5 text-left font-medium">工序</th>
              <th class="px-2 py-1.5 text-left font-medium">订单用途 / 本工序产出</th>
              <th class="w-32 px-2 py-1.5 text-right font-medium">数量</th>
              <th class="w-64 px-2 py-1.5 text-left font-medium">人员</th>
              <th class="px-2 py-1.5 text-left font-medium">理由</th>
              <th v-if="editable" class="w-20 px-2 py-1.5"></th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="(task, index) in list" :key="index" class="border-t border-border align-top">
              <td class="whitespace-nowrap px-2 py-1.5">
                <Tag class="m-0">{{ task.sequence ?? index + 1 }}</Tag>
                {{ PROCESS_LABELS[task.process] ?? task.process }}
              </td>
              <td class="px-2 py-1.5">
                <div v-if="task.contractCode" class="font-mono text-xs">{{ task.contractCode }}</div>
                <div v-else class="text-xs text-muted-foreground">备货</div>
                <div class="text-xs text-muted-foreground">关联产品：{{ task.product || '备货' }}</div>
                <TaskMaterials v-if="task.output || task.inputs?.length" :task="task" class="mt-1" />
                <div v-else class="text-xs">产出：{{ taskMaterialText(task.output, task.spec) }}</div>
              </td>
              <td class="px-2 py-1.5 text-right">
                <InputNumber
                  v-if="editable && !task.output?.attrs && (task.covers?.length ?? 0) <= 1"
                  :aria-label="`${dayLabel(date)} ${PROCESS_LABELS[task.process]} 数量`"
                  :min="0"
                  :precision="3"
                  :value="Number(task.quantity)"
                  :style="{ width: '6rem' }"
                  size="small"
                  @change="(v) => setQuantity(task, (v as number | null) ?? 0)"
                />
                <b v-else class="tabular-nums">{{ task.quantity }}</b>
                <span class="ml-1 text-xs text-muted-foreground">{{ task.unit }}</span>
              </td>
              <td class="px-2 py-1.5">
                <Select
                  v-if="editable"
                  v-model:value="task.workerIds"
                  :aria-label="`${dayLabel(date)} ${PROCESS_LABELS[task.process]} 人员`"
                  :options="workerOptions(task.process)"
                  class="w-full"
                  mode="multiple"
                  option-filter-prop="label"
                  placeholder="选人（只列有这道工序岗位的）"
                  size="small"
                />
                <span v-else class="text-xs">{{ task.workerIds.map(nameOf).join('、') || '—' }}</span>
              </td>
              <td class="px-2 py-1.5 text-xs text-muted-foreground">{{ task.reason }}</td>
              <td v-if="editable" class="whitespace-nowrap px-2 py-1.5">
                <Button size="small" type="link" @click="emit('edit', task)">改</Button>
                <Button danger size="small" type="link" @click="remove(task)">删</Button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>
  </div>
</template>
