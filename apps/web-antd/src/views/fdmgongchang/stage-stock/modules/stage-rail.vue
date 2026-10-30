<script setup lang="ts">
import type { FdmgongchangStageStockApi as Api } from '#/api/fdmgongchang/stage-stock';

import { computed } from 'vue';

import { formatQty, groupStages, toNumber } from '../model';

/**
 * 库存阶段目录：按「原料与板材 / 半成品 / 成品」分组，每行显示该阶段的库存合计和单位。
 * 宽屏（≥1024）竖排在库存面板左侧；较窄时改为分组的方块网格，放在明细上方。
 * 每个阶段只有一种单位，合计只在阶段内部相加。
 */
const props = defineProps<{
  active?: string;
  options: Api.Options;
  summary?: Api.Summary;
}>();

const emit = defineEmits<{ select: [stage: string] }>();

const groups = computed(() =>
  groupStages(props.options.stages).map((group) => ({
    label: group.label,
    cells: group.stages.map((stage) => {
      const total = props.summary?.stages.find((s) => s.stage === stage.code);
      return {
        quantity: props.summary ? (toNumber(total?.quantity) ?? 0) : undefined,
        stage,
      };
    }),
  })),
);
</script>

<template>
  <nav aria-label="库存阶段">
    <h2 class="m-0 hidden px-5 pb-2 pt-5 text-base font-semibold lg:block">
      库存阶段
    </h2>
    <div class="flex flex-col gap-3 p-3 lg:gap-4 lg:px-3 lg:pb-5 lg:pt-2">
      <section v-for="group in groups" :key="group.label">
        <h3
          class="m-0 mb-1.5 border-l-[3px] border-primary pl-2 text-[13px] font-medium leading-4 text-muted-foreground lg:mx-2"
        >
          {{ group.label }}
        </h3>
        <ul
          class="stage-rail__list m-0 grid list-none gap-1.5 p-0 lg:flex lg:flex-col lg:gap-0.5"
        >
          <li v-for="cell in group.cells" :key="cell.stage.code">
            <button
              type="button"
              class="stage-rail__item"
              :class="{ 'is-active': active === cell.stage.code }"
              :aria-current="active === cell.stage.code ? 'true' : undefined"
              :title="cell.stage.label"
              @click="emit('select', cell.stage.code)"
            >
              <span class="stage-rail__dot" aria-hidden="true"></span>
              <span class="min-w-0 flex-1 truncate">{{ cell.stage.label }}</span>
              <span class="stage-rail__qty">
                <template v-if="cell.quantity === undefined">—</template>
                <template v-else>{{ formatQty(cell.quantity) }}</template>
                <small>{{ cell.stage.unit }}</small>
              </span>
            </button>
          </li>
        </ul>
      </section>
    </div>
  </nav>
</template>

<style scoped>
.stage-rail__list {
  grid-template-columns: repeat(auto-fill, minmax(172px, 1fr));
}

.stage-rail__item {
  display: flex;
  gap: 8px;
  align-items: center;
  width: 100%;
  min-height: 40px;
  padding: 0 12px;
  font-size: 14px;
  color: hsl(var(--foreground));
  text-align: left;
  cursor: pointer;
  border: 1px solid hsl(var(--border));
  border-radius: 8px;
  transition:
    background-color 0.15s,
    color 0.15s;
}

.stage-rail__item:hover {
  background: hsl(var(--primary) / 6%);
}

.stage-rail__item:focus-visible {
  outline: 2px solid hsl(var(--primary));
  outline-offset: 1px;
}

.stage-rail__item.is-active {
  font-weight: 600;
  color: hsl(var(--primary));
  background: hsl(var(--primary) / 10%);
  border-color: transparent;
}

/* 未选中时是一条细竖线，选中时换成蓝色圆点 */
.stage-rail__dot {
  flex-shrink: 0;
  width: 2px;
  height: 14px;
  background: hsl(var(--border));
  border-radius: 2px;
}

.stage-rail__item.is-active .stage-rail__dot {
  width: 7px;
  height: 7px;
  background: hsl(var(--primary));
  border-radius: 50%;
}

.stage-rail__qty {
  font-weight: 600;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}

.stage-rail__qty small {
  margin-left: 4px;
  font-size: 12px;
  font-weight: 400;
  color: hsl(var(--muted-foreground));
}

.stage-rail__item.is-active .stage-rail__qty small {
  color: hsl(var(--primary) / 75%);
}

@media (min-width: 1024px) {
  .stage-rail__item {
    border-color: transparent;
  }
}
</style>
