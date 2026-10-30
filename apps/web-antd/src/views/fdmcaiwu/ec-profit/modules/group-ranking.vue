<script setup lang="ts">
import type { FdmcaiwuEcProfitApi as Api } from '#/api/fdmcaiwu/ec-profit';
import type { MetricKey } from '../model';

import { computed, ref } from 'vue';

import { Empty, Segmented, Tooltip } from 'ant-design-vue';

import { formatCompact, formatMetric } from '../model';
import { displaySummary, groupRanking } from '../tree-model';

/** 分组贡献排行：单一系列统一用主色，负值用红色并从零点向左延伸。点击行筛选下方明细。 */
const props = defineProps<{ groups: Api.GroupNode[]; selectedKey?: string }>();
const emit = defineEmits<{ select: [key: string | undefined] }>();

const metric = ref<MetricKey>('grossProfit');
const options = [
  { label: '毛利润', value: 'grossProfit' },
  { label: '销售额', value: 'salesAmount' },
  { label: '毛利率', value: 'grossMargin' },
];
const isRate = computed(() => metric.value === 'grossMargin');
const rows = computed(() => groupRanking(props.groups, metric.value));
const scale = computed(() => {
  const values = rows.value.map((row) => row.value ?? 0);
  const max = Math.max(...values, 0);
  const min = Math.min(...values, 0);
  const span = max - min || 1;
  return { zero: (-min / span) * 100, span };
});
function bar(value: null | number) {
  if (value === null) return { left: '0%', width: '0%' };
  const width = (Math.abs(value) / scale.value.span) * 100;
  const left = value >= 0 ? scale.value.zero : scale.value.zero - width;
  return { left: `${left}%`, width: `${Math.max(width, 0.5)}%` };
}
function label(value: null | number) {
  if (value === null) return '—';
  return isRate.value ? formatMetric(value, true) : formatCompact(value);
}
function toggle(key: string) {
  emit('select', props.selectedKey === key ? undefined : key);
}
</script>

<template>
  <div class="flex h-full flex-col">
    <div class="mb-3 flex items-center justify-between gap-2">
      <div>
        <div class="font-medium">分组贡献排行</div>
        <div class="text-xs text-muted-foreground">点击分组筛选下方明细，再次点击取消</div>
      </div>
      <Segmented v-model:value="metric" :options="options" size="small" />
    </div>
    <Empty
      v-if="rows.length === 0"
      :image="Empty.PRESENTED_IMAGE_SIMPLE"
      description="本月暂无分组数据"
    />
    <ol v-else class="m-0 max-h-[292px] list-none space-y-0.5 overflow-y-auto p-0 pr-1">
      <li v-for="row in rows" :key="row.key">
        <Tooltip placement="left">
          <template #title>
            <div>{{ row.name }} · {{ row.node.expectedShopCount }} 家店铺</div>
            <div>销售额 {{ formatMetric(displaySummary(row.node)?.salesAmount) }}</div>
            <div>毛利润 {{ formatMetric(displaySummary(row.node)?.grossProfit) }}</div>
            <div>毛利率 {{ formatMetric(displaySummary(row.node)?.grossMargin, true) }}</div>
            <div v-if="!row.complete">
              已导入 {{ row.node.importedShopCount }} / {{ row.node.expectedShopCount }} 家，数值为已导入小计
            </div>
          </template>
          <button
            type="button"
            class="grid w-full grid-cols-[minmax(0,7.5rem)_1fr_4.5rem] items-center gap-3 rounded-md px-2 py-1.5 text-left transition-colors hover:bg-accent"
            :class="selectedKey === row.key ? 'bg-primary/10 ring-1 ring-primary/40' : ''"
            :aria-pressed="selectedKey === row.key"
            @click="toggle(row.key)"
          >
            <span class="min-w-0">
              <span class="block truncate text-sm">{{ row.name }}</span>
              <span class="block truncate text-[11px] text-muted-foreground"
                >{{ row.node.expectedShopCount }} 家店铺</span
              >
            </span>
            <span class="relative h-2.5 rounded-sm bg-[var(--ecp-track)]">
              <span
                class="absolute inset-y-0 rounded-sm"
                :class="
                  (row.value ?? 0) < 0
                    ? 'bg-[var(--ecp-negative)]'
                    : 'bg-[var(--ecp-series-1)]'
                "
                :style="bar(row.value)"
              ></span>
            </span>
            <span
              class="text-right text-sm tabular-nums"
              :class="(row.value ?? 0) < 0 ? 'text-[var(--ecp-negative)]' : ''"
              >{{ label(row.value)
              }}<span v-if="!row.complete && row.value !== null" class="text-amber-600">*</span></span
            >
          </button>
        </Tooltip>
      </li>
    </ol>
  </div>
</template>
