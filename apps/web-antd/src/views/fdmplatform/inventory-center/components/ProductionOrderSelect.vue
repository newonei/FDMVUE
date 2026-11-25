<script setup lang="ts">
import type { ProductionOrderOutboundCandidate } from '#/api/fdmplatform/warehouse';

import { computed } from 'vue';

import { Select } from 'ant-design-vue';

import { qty } from '../../purchase/warehouse/model';

const props = defineProps<{
  candidates: ProductionOrderOutboundCandidate[];
  skuId?: string;
  specVersion?: string;
  value?: number;
}>();
const emit = defineEmits<{ 'update:value': [value: number | undefined] }>();
function updateValue(value: unknown) {
  emit('update:value', typeof value === 'number' ? value : undefined);
}
const options = computed(() =>
  props.candidates
    .filter(
      (row) =>
        row.skuId === props.skuId &&
        (row.specVersion ?? '') === (props.specVersion ?? ''),
    )
    .map((row) => ({
      value: row.productionOrderItemId,
      label: `${row.productName || '生产入库'} · 可出 ${qty(row.availableQuantity)} ${row.unit ?? ''}`,
    })),
);
</script>

<template>
  <Select
    :value="value"
    allow-clear
    show-search
    option-filter-prop="label"
    :options="options"
    :placeholder="
      options.length ? '选择生产订单（选填）' : '无可关联的生产入库'
    "
    :disabled="options.length === 0"
    style="width: 100%; min-width: 240px"
    aria-label="关联生产订单"
    @update:value="updateValue"
  />
</template>
