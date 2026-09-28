<script setup lang="ts">
import type { FdmcaiwuEcProfitApi as Api } from '#/api/fdmcaiwu/ec-profit';

import { computed } from 'vue';

import { Skeleton, Tooltip } from 'ant-design-vue';
import dayjs from 'dayjs';

import { formatCompact, formatMetric, toNumber } from '../model';

/** 全年 12 个月的导航条：柱高为当月毛利润，一眼看出哪些月份有数据、走势如何。 */
const props = defineProps<{
  loading: boolean;
  month: string;
  reports: Api.Report[];
}>();
const emit = defineEmits<{ select: [month: string] }>();

const year = computed(() => props.month.slice(0, 4));
const latestMonth = dayjs().format('YYYY-MM');
const cells = computed(() => {
  const byMonth = new Map(props.reports.map((report) => [report.month, report]));
  const profits = props.reports
    .filter((report) => report.status === 'READY')
    .map((report) => Math.abs(toNumber(report.summary?.grossProfit) ?? 0));
  const max = Math.max(...profits, 1);
  return Array.from({ length: 12 }, (_, index) => {
    const month = `${year.value}-${String(index + 1).padStart(2, '0')}`;
    const report = byMonth.get(month);
    const ready = report?.status === 'READY';
    const profit = ready ? toNumber(report?.summary?.grossProfit) : null;
    return {
      month,
      label: `${index + 1}月`,
      report,
      ready,
      profit,
      height: profit === null ? 0 : Math.max((Math.abs(profit) / max) * 100, 4),
      future: month > latestMonth,
    };
  });
});
</script>

<template>
  <div class="rounded-xl border border-border bg-card px-4 pb-3 pt-3">
    <div class="mb-2 flex items-center justify-between text-xs text-muted-foreground">
      <span>{{ year }} 年各月毛利润 · 点击切换月份</span>
      <span class="hidden items-center gap-3 sm:flex">
        <span class="inline-flex items-center gap-1">
          <i class="inline-block size-2 rounded-sm bg-[var(--ecp-series-1)]"></i>已就绪
        </span>
        <span class="inline-flex items-center gap-1">
          <i class="inline-block size-2 rounded-full bg-amber-500"></i>待导入
        </span>
      </span>
    </div>
    <Skeleton v-if="loading && reports.length === 0" active :paragraph="{ rows: 2 }" :title="false" />
    <div v-else class="grid grid-cols-6 gap-1.5 lg:grid-cols-12">
      <Tooltip
        v-for="cell in cells"
        :key="cell.month"
        :title="
          cell.ready
            ? `毛利润 ${formatMetric(cell.report?.summary?.grossProfit)} · 毛利率 ${formatMetric(cell.report?.summary?.grossMargin, true)}`
            : cell.report
              ? '月报已建立，数据待导入'
              : cell.future
                ? '尚未到该月份'
                : '尚未建立月报'
        "
      >
        <button
          type="button"
          class="flex h-[88px] w-full flex-col rounded-lg border px-2 pb-1.5 pt-1.5 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-40"
          :class="
            cell.month === month
              ? 'border-primary bg-primary/5 ring-1 ring-primary'
              : 'border-transparent hover:border-border hover:bg-accent'
          "
          :disabled="cell.future"
          :aria-pressed="cell.month === month"
          :aria-label="`${year}年${cell.label}`"
          @click="emit('select', cell.month)"
        >
          <span
            class="text-xs font-medium"
            :class="cell.month === month ? 'text-primary' : 'text-foreground'"
            >{{ cell.label }}</span
          >
          <span class="flex flex-1 items-end py-1">
            <span
              v-if="cell.ready"
              class="block w-full rounded-t"
              :class="
                (cell.profit ?? 0) < 0
                  ? 'bg-[var(--ecp-negative)]'
                  : 'bg-[var(--ecp-series-1)]'
              "
              :style="{ height: `${cell.height}%` }"
            ></span>
            <span
              v-else
              class="block h-px w-full bg-border"
            ></span>
          </span>
          <span
            class="truncate text-[11px] tabular-nums"
            :class="
              cell.ready
                ? 'text-muted-foreground'
                : cell.report
                  ? 'text-amber-600'
                  : 'text-muted-foreground/60'
            "
            >{{
              cell.ready
                ? formatCompact(cell.report?.summary?.grossProfit)
                : cell.report
                  ? '待导入'
                  : '未建单'
            }}</span
          >
        </button>
      </Tooltip>
    </div>
  </div>
</template>
