<script setup lang="ts">
import type { FdmgongchangFactoryApi } from '#/api/fdmgongchang/factory';
import type { FdmgongchangScheduleApi as Api } from '#/api/fdmgongchang/schedule';

import { computed } from 'vue';

import { Button, Empty, InputNumber, Select, Tag } from 'ant-design-vue';

import { dayLabel, groupByDate, PROCESS_LABELS } from '../../shared/schedule';

/** 待确认方案的任务表：按天分组，可以改数量、换人、删任务。 */
const props = defineProps<{
  editable: boolean;
  workers: FdmgongchangFactoryApi.Worker[];
}>();
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
              <th class="px-2 py-1.5 text-left font-medium">订单 / 产品</th>
              <th class="w-32 px-2 py-1.5 text-right font-medium">数量</th>
              <th class="w-64 px-2 py-1.5 text-left font-medium">人员</th>
              <th class="px-2 py-1.5 text-left font-medium">理由</th>
              <th v-if="editable" class="w-12 px-2 py-1.5"></th>
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
                <div class="text-xs">{{ [task.product, task.spec].filter(Boolean).join(' · ') }}</div>
              </td>
              <td class="px-2 py-1.5 text-right">
                <InputNumber
                  v-if="editable"
                  :aria-label="`${dayLabel(date)} ${PROCESS_LABELS[task.process]} 数量`"
                  :min="0"
                  :precision="3"
                  :value="Number(task.quantity)"
                  class="w-24"
                  size="small"
                  @change="(v) => (task.quantity = (v as number | null) ?? 0)"
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
              <td v-if="editable" class="px-2 py-1.5">
                <Button danger size="small" type="link" @click="remove(task)">删</Button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>
  </div>
</template>
