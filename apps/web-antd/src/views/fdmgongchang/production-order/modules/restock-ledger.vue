<script setup lang="ts">
import type { FdmgongchangRestockApi as Api } from '#/api/fdmgongchang/restock';

import { ref, watch } from 'vue';

import { Button, Select, Table, Tag } from 'ant-design-vue';

import { getRestockLedger } from '#/api/fdmgongchang/restock';

import { dateText, num } from '../shared';

/**
 * 补库台账：哪张订单用掉了什么常备物料、要补什么、下成了哪张补库订单、补到哪了。
 * 排单下发锁库存时是「预测」，实际领用后确认并下成补库订单；订单结束时没领用的预测作废。
 */
const props = defineProps<{ factoryId: number }>();
const emit = defineEmits<{ openOrder: [id: number] }>();

const STATUS: Record<Api.Status, { color: string; label: string }> = {
  CANCELLED: { color: 'default', label: '已作废' },
  DONE: { color: 'green', label: '已补回' },
  FORECAST: { color: 'blue', label: '预测' },
  ORDERED: { color: 'purple', label: '已下补库单' },
  PENDING_MAP: { color: 'orange', label: '待配置' },
};

const rows = ref<Api.Row[]>([]);
const status = ref<string>();
const loading = ref(false);

async function load() {
  loading.value = true;
  try {
    rows.value = await getRestockLedger(status.value);
  } finally {
    loading.value = false;
  }
}
watch([() => props.factoryId, status], load, { immediate: true });

const fmt = (v: null | number | string | undefined) => num(v).toLocaleString('zh-CN', { maximumFractionDigits: 3 });

const columns = [
  { key: 'source', title: '用掉的' },
  { key: 'target', title: '要补' },
  { align: 'right' as const, key: 'qty', title: '预测 / 确认 / 已下单' },
  { key: 'order', title: '补库订单' },
  { key: 'status', title: '状态', width: 110 },
];
</script>

<template>
  <div class="flex flex-col gap-3">
    <div class="flex flex-wrap items-center gap-2">
      <Select
        id="restock-status"
        v-model:value="status"
        allow-clear
        class="w-40"
        :options="Object.entries(STATUS).map(([value, s]) => ({ label: s.label, value }))"
        placeholder="全部状态"
      />
      <Button :loading="loading" @click="load">刷新</Button>
      <span class="text-xs text-muted-foreground">只补「工厂设置 → 常备物料」里的产品；订单自己的中间产出、账面负数不会触发补库。</span>
    </div>
    <Table :columns="columns" :data-source="rows" :loading="loading" :pagination="{ pageSize: 20 }" row-key="id" size="small">
      <template #bodyCell="{ column, record }">
        <template v-if="column.key === 'source'">
          <div class="flex flex-col">
            <span>{{ record.consumedProductName || record.consumedItemCode }}</span>
            <span class="text-xs text-muted-foreground">订单 {{ record.sourceOrderNo || '—' }}<template v-if="record.remark"> · {{ record.remark }}</template></span>
          </div>
        </template>
        <template v-else-if="column.key === 'target'">
          <span v-if="record.targetProductName || record.targetProductId">{{ record.targetProductName || record.targetProductId }}</span>
          <span v-else class="text-warning">待配置</span>
        </template>
        <template v-else-if="column.key === 'qty'">
          <span class="tabular-nums">{{ fmt(record.forecastQuantity) }} / {{ fmt(record.confirmedQuantity) }} / {{ fmt(record.orderedQuantity) }}</span>
        </template>
        <template v-else-if="column.key === 'order'">
          <div v-if="record.restockOrderId" class="flex flex-col">
            <button class="text-left text-primary hover:underline" type="button" @click="emit('openOrder', record.restockOrderId)">
              {{ record.restockOrderNo }}
            </button>
            <span class="text-xs text-muted-foreground">
              交期 {{ dateText(record.restockRequiredDate) || '—' }} · 已完成 {{ fmt(record.restockCompletedQuantity) }}
            </span>
          </div>
          <span v-else class="text-xs text-muted-foreground">—</span>
        </template>
        <template v-else-if="column.key === 'status'">
          <Tag :color="STATUS[record.status as Api.Status]?.color" class="m-0">{{ STATUS[record.status as Api.Status]?.label ?? record.status }}</Tag>
        </template>
      </template>
    </Table>
  </div>
</template>
