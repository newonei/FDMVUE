<script setup lang="ts">
import type { FdmgongchangScheduleApi as Api } from '#/api/fdmgongchang/schedule';

import { computed, ref, watch } from 'vue';

import { Alert } from 'ant-design-vue';

import { getDispatchWageWarning } from '#/api/fdmgongchang/schedule';

import { PROCESS_LABELS } from '../../shared/schedule';

const props = defineProps<{
  tasks: Array<Pick<Api.Task, 'output' | 'process'> & { id?: number }>;
}>();
const pending = ref(true);
const warnings = ref<string[]>([]);
const groups = computed(() => {
  const result = new Map<string, { hasOutput: boolean; ids: number[]; params: Parameters<typeof getDispatchWageWarning>[0]; }>();
  for (const task of props.tasks) {
    const attrs = task.output?.attrs;
    const params = { process: task.process, width: attrs?.width, length: attrs?.length, thickness: attrs?.thickness };
    const key = JSON.stringify([params, !!attrs]);
    const group = result.get(key) ?? { ids: [], params, hasOutput: !!attrs };
    if (task.id) group.ids.push(task.id);
    result.set(key, group);
  }
  return [...result.values()];
});
watch(groups, async (selected, _, onCleanup) => {
  let current = true;
  onCleanup(() => { current = false; });
  warnings.value = [];
  pending.value = true;
  const results = await Promise.all(selected.map(async ({ ids, params, hasOutput }) => {
    const label = [PROCESS_LABELS[params.process] ?? params.process, ids.map(id => `#${  id}`).join('、')].filter(Boolean).join(' ');
    if (!hasOutput) return `${label  }：任务缺少产出规格，无法核对计件`;
    try {
      const warning = await getDispatchWageWarning(params);
      return warning ? `${label  }：${  warning}` : '';
    } catch {
      return `${label  }：计价资料读取失败，请到工厂计价项目核对`;
    }
  }));
  if (current) {
    warnings.value = results.filter(Boolean);
    pending.value = false;
  }
}, { immediate: true });
</script>

<template>
  <p v-if="pending" class="m-0 text-xs text-muted-foreground" role="status">正在核对本厂工序计价…</p>
  <Alert v-else-if="warnings.length" message="计件需核对，可继续派工" show-icon type="warning">
    <template #description><ul class="m-0 list-disc pl-4"><li v-for="item in warnings" :key="item">{{ item }}</li></ul></template>
  </Alert>
  <p v-else class="m-0 text-xs text-muted-foreground" role="status">已匹配当前有效的计价项目和单价。</p>
</template>
