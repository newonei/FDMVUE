<script setup lang="ts">
import type { RouteDraft } from '../shared';

import type { FdmgongchangRouteApi as RouteApi } from '#/api/fdmgongchang/factory';

import { computed } from 'vue';

import { Select } from 'ant-design-vue';

import { routeProblem, sortSteps } from '../shared';

/**
 * 一个产品要走的工序：先选工厂的常用路线，再点工序勾掉或加回。
 * 工序按生产链顺序排列，不能调换先后；跳过工序后接不上时直接提示。
 */
const props = defineProps<{ id: string; options?: RouteApi.Options }>();
const draft = defineModel<RouteDraft>({ required: true });

const processes = computed(() => props.options?.processes ?? []);
const routeOptions = computed(() =>
  (props.options?.routes ?? []).map((r) => ({ label: r.name, value: r.id as number })),
);
const problem = computed(() => (processes.value.length > 0 ? routeProblem(draft.value.steps, processes.value) : ''));

function pickRoute(value: unknown) {
  const route = props.options?.routes.find((r) => r.id === value);
  draft.value = route
    ? { routeId: route.id, steps: sortSteps(route.steps, processes.value) }
    : { routeId: undefined, steps: draft.value.steps };
}

function toggle(code: string) {
  const steps = draft.value.steps.includes(code)
    ? draft.value.steps.filter((s) => s !== code)
    : [...draft.value.steps, code];
  draft.value = { ...draft.value, steps: sortSteps(steps, processes.value) };
}
</script>

<template>
  <div class="flex flex-col gap-1.5">
    <div class="flex flex-wrap items-center gap-2">
      <span class="text-xs text-muted-foreground">工艺</span>
      <Select
        :id="`${id}-route`"
        :options="routeOptions"
        :value="draft.routeId"
        allow-clear
        class="w-44"
        :placeholder="routeOptions.length > 0 ? '选常用路线' : '工厂还没有常用路线'"
        size="small"
        @change="pickRoute"
      />
      <span class="text-xs text-muted-foreground">点工序勾掉或加回</span>
    </div>
    <div class="flex flex-wrap items-center gap-1" role="group" :aria-label="`${id} 要走的工序`">
      <template v-for="(p, index) in processes" :key="p.code">
        <span v-if="index > 0" class="text-xs text-muted-foreground" aria-hidden="true">›</span>
        <button
          type="button"
          class="route-chip"
          :class="{ 'is-on': draft.steps.includes(p.code) }"
          :aria-pressed="draft.steps.includes(p.code)"
          :title="`${p.label}：产出${p.outputStageLabel}`"
          @click="toggle(p.code)"
        >
          {{ p.label }}
        </button>
      </template>
    </div>
    <p v-if="problem" class="m-0 text-xs text-destructive">{{ problem }}</p>
  </div>
</template>

<style scoped>
.route-chip {
  padding: 0 8px;
  font-size: 12px;
  line-height: 22px;
  color: hsl(var(--muted-foreground));
  text-decoration: line-through;
  cursor: pointer;
  border: 1px dashed hsl(var(--border));
  border-radius: 6px;
  transition:
    background-color 0.15s,
    color 0.15s;
}

.route-chip:hover {
  color: hsl(var(--foreground));
}

.route-chip.is-on {
  color: hsl(var(--primary));
  text-decoration: none;
  background: hsl(var(--primary) / 10%);
  border-color: hsl(var(--primary) / 40%);
  border-style: solid;
}
</style>
