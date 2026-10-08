<script setup lang="ts">
import type { FdmgongchangStageStockApi as Api } from '#/api/fdmgongchang/stage-stock';

import { computed } from 'vue';

import { formatQty, toNumber } from '../model';

/**
 * 生产链：宽屏（≥1280）时竖排在页面左侧，阶段之间标出产出下一段的工序和在制数量；
 * 较窄时改为顶部方块网格（1024 起一排 9 格），9 段都能一眼看全，不需要横向滚动。
 */
const props = defineProps<{
  active?: string;
  options: Api.Options;
  summary?: Api.Summary;
}>();

const emit = defineEmits<{ select: [stage: string] }>();

const cells = computed(() =>
  props.options.stages.map((stage, index) => {
    const total = props.summary?.stages.find((s) => s.stage === stage.code);
    const incoming = props.options.processes.find(
      (p) => p.outputStage === stage.code,
    );
    const wip = incoming
      ? props.summary?.processes.find((p) => p.process === incoming.code)
      : undefined;
    const sourceUnit = incoming
      ? props.options.stages.find((s) => s.code === incoming.sources[0])?.unit
      : undefined;
    const quantity = toNumber(total?.quantity) ?? 0;
    return {
      incoming,
      index,
      quantity,
      rowCount: total?.rowCount ?? 0,
      sourceUnit,
      stage,
      wipQuantity:
        (toNumber(wip?.inProgressQuantity) ?? 0) > 0
          ? wip?.inProgressQuantity
          : undefined,
    };
  }),
);

const wipOrders = computed(() =>
  (props.summary?.processes ?? []).reduce(
    (t, p) => t + (p.inProgressCount ?? 0),
    0,
  ),
);
</script>

<template>
  <nav
    aria-label="生产链"
    class="rounded-lg border border-border bg-card"
  >
    <div
      class="flex items-center justify-between gap-2 border-b border-border px-3 py-2"
    >
      <span class="text-sm font-semibold">生产链</span>
      <span
        v-if="wipOrders > 0"
        class="rounded-full bg-warning/15 px-2 text-xs leading-5 text-warning"
      >
        {{ wipOrders }} 张单在制
      </span>
    </div>

    <!-- 宽屏：竖排时间线 -->
    <ol class="m-0 hidden list-none flex-col p-2 xl:flex">
      <template v-for="cell in cells" :key="cell.stage.code">
        <li
          v-if="cell.index > 0"
          class="flex min-h-6 items-center gap-2 pl-[13px] text-[11px] text-muted-foreground"
          aria-hidden="true"
        >
          <span class="h-6 w-0.5 shrink-0 rounded bg-border"></span>
          <span class="truncate">{{ cell.incoming?.label }}</span>
          <span
            v-if="cell.wipQuantity"
            class="ml-auto shrink-0 whitespace-nowrap rounded-full bg-warning/15 px-1.5 leading-[18px] text-warning"
          >
            在制 {{ formatQty(cell.wipQuantity) }} {{ cell.sourceUnit }}
          </span>
        </li>
        <li>
          <button
            type="button"
            class="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left transition-colors"
            :class="
              active === cell.stage.code
                ? 'bg-primary/10 text-primary'
                : 'text-foreground hover:bg-accent'
            "
            :aria-current="active === cell.stage.code ? 'true' : undefined"
            @click="emit('select', cell.stage.code)"
          >
            <span
              class="size-3 shrink-0 rounded-full border-2"
              :class="
                active === cell.stage.code
                  ? 'border-primary bg-primary'
                  : cell.quantity > 0
                    ? 'border-primary/60 bg-card'
                    : 'border-border bg-card'
              "
            ></span>
            <span class="min-w-0 flex-1 truncate text-sm">
              {{ cell.stage.label }}
            </span>
            <span
              class="whitespace-nowrap text-sm font-semibold tabular-nums"
              :class="cell.quantity > 0 ? '' : 'text-muted-foreground'"
            >
              {{ formatQty(cell.quantity) }}
              <small class="text-xs font-normal text-muted-foreground">
                {{ cell.stage.unit }}
              </small>
            </span>
          </button>
        </li>
      </template>
    </ol>

    <!-- 窄屏：方块网格 -->
    <div class="grid grid-cols-3 gap-1.5 p-2 sm:grid-cols-5 lg:grid-cols-9 xl:hidden">
      <button
        v-for="cell in cells"
        :key="cell.stage.code"
        type="button"
        class="flex min-w-0 flex-col items-start rounded-md border px-2 py-1.5 text-left lg:px-1.5"
        :class="
          active === cell.stage.code
            ? 'border-primary bg-primary/10'
            : 'border-border'
        "
        :aria-current="active === cell.stage.code ? 'true' : undefined"
        @click="emit('select', cell.stage.code)"
      >
        <span
          class="w-full text-xs leading-4 text-muted-foreground lg:text-[11px]"
        >
          {{ cell.stage.label }}
        </span>
        <span class="text-sm font-semibold tabular-nums">
          {{ formatQty(cell.quantity) }}
          <small class="text-[11px] font-normal text-muted-foreground">
            {{ cell.stage.unit }}
          </small>
        </span>
        <span
          v-if="cell.wipQuantity"
          class="mt-0.5 truncate text-[11px] text-warning"
        >
          {{ cell.incoming?.label }}在制 {{ formatQty(cell.wipQuantity) }}
        </span>
      </button>
    </div>
  </nav>
</template>
