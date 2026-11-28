<script lang="ts" setup>
import type { FactoryOrderBoardApi as Api } from '#/api/fdmgongchang/order-board';

import { computed } from 'vue';

import { formatOrderUnitQuantity, ORDER_SUMMARY_LABELS } from './model';

const props = defineProps<{
  activeScope?: Api.Scope;
  interactive?: boolean;
  loading?: boolean;
  summary?: Api.Summary;
}>();

const emit = defineEmits<{ select: [scope: Api.Scope] }>();

const cards = computed(() => {
  const definitions = [
    { field: 'demandQuantity', hint: '本厂全部有效成品订单', scope: 'DEMAND' },
    { field: 'unfinishedQuantity', hint: '已接单，按净交货 / 入库计算', scope: 'UNFINISHED' },
    { field: 'pendingQuantity', hint: props.summary ? `${props.summary.pendingOrderCount} 张订单待接单` : '待接单订单的成品需求', scope: 'PENDING' },
  ] as const;
  return definitions.map((card) => ({
    ...card,
    quantities: (props.summary?.units ?? []).flatMap((row) => {
      const quantity = Number(row[card.field]);
      return quantity > 0 ? [formatOrderUnitQuantity(quantity, row.unit)] : [];
    }),
  }));
});
</script>

<template>
  <section class="grid grid-cols-1 gap-3 sm:grid-cols-3" aria-label="本厂全部有效成品订单汇总" :aria-busy="loading">
    <component
      :is="interactive ? 'button' : 'div'"
      v-for="card in cards"
      :key="card.scope"
      :type="interactive ? 'button' : undefined"
      :aria-pressed="interactive ? activeScope === card.scope : undefined"
      class="min-w-0 rounded-xl border bg-card p-4 text-left"
      :class="[
        activeScope === card.scope ? 'border-primary' : 'border-border',
        interactive ? 'cursor-pointer transition-colors hover:border-primary focus-visible:outline-primary' : '',
      ]"
      @click="interactive && emit('select', card.scope)"
    >
      <span class="block text-sm font-medium">{{ ORDER_SUMMARY_LABELS[card.scope] }}</span>
      <span class="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xl font-semibold tabular-nums">
        <template v-if="card.quantities.length">
          <span v-for="quantity in card.quantities" :key="quantity">{{ quantity }}</span>
        </template>
        <span v-else>{{ summary ? '0' : '—' }}</span>
      </span>
      <span class="mt-1 block text-xs text-muted-foreground">{{ card.hint }}</span>
    </component>
  </section>
</template>
