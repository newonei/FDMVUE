<script setup lang="ts">
import type { FdmcaiwuEcProfitApi as Api } from '#/api/fdmcaiwu/ec-profit';
import type { MetricKey } from '../model';

import { computed } from 'vue';

import { Tooltip } from 'ant-design-vue';
import BigNumber from 'bignumber.js';

import { formatMetric } from '../model';

/**
 * 销售额去向：按公式 毛利润 = 销售额 − 采购 − 代发 − 运费 − 推广 − 平台 − 税费，
 * 把销售额拆成七段。历史口径若有差额，单独作为「其他差异」展示，不并入任何一项。
 */
const props = defineProps<{ compact?: boolean; summary?: Api.Metric }>();

const PARTS: { color: string; key: MetricKey; label: string }[] = [
  { key: 'grossProfit', label: '毛利润', color: 'var(--ecp-series-1)' },
  { key: 'purchaseCost', label: '采购成本', color: 'var(--ecp-series-2)' },
  { key: 'dropshipPurchaseCost', label: '代发采购', color: 'var(--ecp-series-3)' },
  { key: 'freightCost', label: '快递运费', color: 'var(--ecp-series-4)' },
  { key: 'promotionCost', label: '推广费', color: 'var(--ecp-series-5)' },
  { key: 'platformFee', label: '平台费用', color: 'var(--ecp-series-6)' },
  { key: 'taxFee', label: '税费', color: 'var(--ecp-series-7)' },
];

function decimal(value: Api.Decimal | undefined) {
  if (value === null || value === undefined || value === '') return null;
  const result = new BigNumber(value);
  return result.isFinite() ? result : null;
}

const model = computed(() => {
  const sales = decimal(props.summary?.salesAmount);
  const parts = PARTS.map((part) => ({
    ...part,
    amount: decimal(props.summary?.[part.key]),
  }));
  if (sales === null || parts.some((part) => part.amount === null)) {
    return { state: 'missing' as const, parts: [] };
  }
  if (sales.lte(0)) return { state: 'no-sales' as const, parts: [] };
  const known = parts.reduce((sum, part) => sum.plus(part.amount!), new BigNumber(0));
  const other = sales.minus(known);
  // 1 元以内视为舍入误差，不单列
  const rows = [
    ...parts,
    ...(other.abs().gte(1)
      ? [{ key: 'other', label: '其他差异', color: 'var(--ecp-other)', amount: other }]
      : []),
  ].map((part) => ({
    ...part,
    share: part.amount!.div(sales),
  }));
  const drawable = rows.every((row) => !row.amount!.isNegative());
  return { state: drawable ? ('ok' as const) : ('negative' as const), parts: rows };
});

function percent(value: BigNumber) {
  return `${value.times(100).toFixed(1)}%`;
}
</script>

<template>
  <div>
    <div
      v-if="model.state === 'missing'"
      class="rounded-lg border border-dashed border-border px-4 py-6 text-center text-sm text-muted-foreground"
    >
      销售额或成本项尚未齐全，暂不能拆分结构
    </div>
    <div
      v-else-if="model.state === 'no-sales'"
      class="rounded-lg border border-dashed border-border px-4 py-6 text-center text-sm text-muted-foreground"
    >
      本范围销售额为 0，无法按销售额拆分
    </div>
    <template v-else>
      <div
        v-if="model.state === 'ok'"
        class="flex h-5 w-full gap-0.5 overflow-hidden rounded"
        role="img"
        :aria-label="
          model.parts.map((part) => `${part.label} ${percent(part.share)}`).join('，')
        "
      >
        <Tooltip
          v-for="part in model.parts.filter((item) => item.share.gt(0))"
          :key="part.key"
          :title="`${part.label}：${formatMetric(part.amount!.toFixed())} 元，占销售额 ${percent(part.share)}`"
        >
          <div
            class="h-full min-w-[2px] first:rounded-l last:rounded-r"
            :style="{
              width: `${part.share.times(100).toFixed(3)}%`,
              background: part.color,
            }"
          ></div>
        </Tooltip>
      </div>
      <p v-else class="mb-0 text-xs text-muted-foreground">
        存在负值（如亏损或冲减），改为明细列表展示。
      </p>
      <div
        class="mt-3 grid gap-x-6 gap-y-1.5"
        :class="compact ? 'grid-cols-1' : 'grid-cols-1 sm:grid-cols-2'"
      >
        <div
          v-for="part in model.parts"
          :key="part.key"
          class="flex items-center gap-2 text-sm"
        >
          <i
            class="inline-block size-2.5 shrink-0 rounded-sm"
            :style="{ background: part.color }"
          ></i>
          <span
            class="min-w-0 flex-1 truncate"
            :class="part.key === 'grossProfit' ? 'font-medium' : 'text-muted-foreground'"
            >{{ part.label }}</span
          >
          <span
            class="tabular-nums"
            :class="part.amount!.isNegative() ? 'text-[var(--ecp-negative)]' : ''"
            >{{ formatMetric(part.amount!.toFixed()) }}</span
          >
          <span class="w-14 text-right text-xs tabular-nums text-muted-foreground">{{
            percent(part.share)
          }}</span>
        </div>
      </div>
    </template>
  </div>
</template>
