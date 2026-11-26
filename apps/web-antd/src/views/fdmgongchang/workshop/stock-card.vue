<script setup lang="ts">
import type { FdmgongchangStageStockApi as StockApi } from '#/api/fdmgongchang/stage-stock';
import type { FdmgongchangWorkbenchApi as Api } from '#/api/fdmgongchang/workbench';

import { computed, ref, watch } from 'vue';

import { Button, Input, Pagination, Select } from 'ant-design-vue';

import { getWorkbenchStock } from '#/api/fdmgongchang/workbench';

import { attrSummary, formatQty, makeLabels, stockUnit, toNumber } from '../stage-stock/model';
import { stageOf, useJob } from '../workbench/use-job';

const props = defineProps<{
  factoryId: null | number;
  finishedWarehouse?: boolean;
  mode: 'output' | 'source';
  refreshKey?: Api.My;
  stages: string[];
}>();
defineSlots<{ actions?: (props: { stage: string }) => unknown }>();

const job = useJob();
const stocks = ref<StockApi.Stock[]>([]);
const keyword = ref('');
const page = ref(1);
const pageSize = 5;
const retryKey = ref(0);
const loading = ref(false);
const failed = ref(false);
const preferredStage = ref('');
const selectedStage = computed(() => props.stages.find((stage) => stage === preferredStage.value) ?? props.stages[0] ?? '');
const stageOptions = computed(() => props.stages.map((stage) => ({
  label: stageOf(job, stage)?.label ?? stage,
  value: stage,
})));
const stage = computed(() => stageOf(job, selectedStage.value));
const finished = computed(() => props.mode === 'output' && props.finishedWarehouse);
const title = computed(() => {
  if (props.mode === 'source') return '上道可领库存';
  return finished.value ? '成品库存' : '可供下道的库存';
});
const titleId = computed(() => `workshop-stock-${props.mode}`);
const labels = computed(() => makeLabels(job.options));

function normalizeSearch(value: string) {
  return value.toLocaleLowerCase().replaceAll(/[×*＊]/g, 'x').replaceAll(/\s/g, '');
}

function stockPriority(amount: number) {
  if (amount < 0) return 0;
  return amount > 0 ? 1 : 2;
}

const shortageCount = computed(() => stocks.value.filter((stock) => (toNumber(stock.quantity) ?? 0) < 0).length);
const rows = computed(() => {
  const search = normalizeSearch(keyword.value);
  return stocks.value.map((stock) => ({
    stock,
    amount: toNumber(stock.quantity) ?? 0,
    description: attrSummary(stock.stage, stock.item, labels.value, [], 'mm') || stock.item?.productName || stock.itemCode,
    reference: [...new Set([stock.itemCode, stock.batchNo].filter(Boolean))].join(' · '),
  })).filter(({ amount, description, reference, stock }) => {
    if (props.mode === 'output' && amount === 0) return false;
    return !search || normalizeSearch([
      description, reference, stock.item?.productName, stock.item?.color,
      stock.item?.frontColor, stock.item?.backColor, stock.location,
    ].filter(Boolean).join(' ')).includes(search);
  }).toSorted((a, b) => stockPriority(a.amount) - stockPriority(b.amount));
});
const visibleRows = computed(() => rows.value.slice((page.value - 1) * pageSize, page.value * pageSize));

watch([selectedStage, () => props.factoryId], () => { keyword.value = ''; });
watch(keyword, () => { page.value = 1; });
watch(
  [() => props.factoryId, selectedStage, () => props.refreshKey, finished, retryKey],
  async ([factoryId, stageCode, , finishedWarehouse], _, onCleanup) => {
    stocks.value = [];
    page.value = 1;
    loading.value = false;
    failed.value = false;
    if (factoryId === null || !stageCode || finishedWarehouse) return;

    let current = true;
    onCleanup(() => { current = false; });
    loading.value = true;
    try {
      const result = await getWorkbenchStock(stageCode);
      if (current) stocks.value = result.list;
    } catch {
      if (current) failed.value = true;
    } finally {
      if (current) loading.value = false;
    }
  },
  { immediate: true },
);
</script>

<template>
  <section :aria-labelledby="titleId" class="flex min-w-0 flex-col gap-3 rounded-lg border border-border bg-card p-3 sm:p-4">
    <div class="flex flex-wrap items-center justify-between gap-2">
      <div class="flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-1">
        <h2 :id="titleId" class="m-0 text-base font-semibold">{{ title }}</h2>
        <span v-if="shortageCount" class="text-xs font-medium text-destructive">{{ shortageCount }} 项库存欠账</span>
      </div>
      <slot name="actions" :stage="selectedStage"></slot>
    </div>

    <div v-if="finished" class="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
      完工后，成品按订单入成品仓。
      <a class="font-medium text-primary hover:underline" href="/fdmstock/inventory-stock">查看成品库存</a>
    </div>
    <p v-else-if="!selectedStage" class="m-0 text-sm text-muted-foreground">本工序暂无对应库存阶段</p>
    <template v-else>
      <div class="flex flex-wrap items-center gap-2">
        <Select
          v-if="stageOptions.length > 1"
          :options="stageOptions"
          :value="selectedStage"
          :aria-label="`${title}阶段`"
          class="min-w-28"
          size="small"
          @update:value="(value) => { if (typeof value === 'string') preferredStage = value; }"
        />
        <span v-else class="text-sm font-medium">{{ stage?.label ?? selectedStage }}</span>
        <Input
          v-model:value="keyword"
          :aria-label="`搜索${title}`"
          allow-clear
          class="min-w-32 flex-1"
          placeholder="搜索规格、色号、编码或批次"
          size="small"
        />
      </div>

      <p v-if="loading" class="m-0 py-3 text-sm text-muted-foreground" role="status">正在加载库存…</p>
      <div v-else-if="failed" class="flex items-center gap-2 py-2 text-sm text-muted-foreground" role="alert">
        库存加载失败
        <Button size="small" @click="retryKey++">重试</Button>
      </div>
      <p v-else-if="!rows.length" class="m-0 py-3 text-sm text-muted-foreground" role="status">
        {{ keyword.trim() ? '没有符合条件的库存' : '暂无库存记录' }}
      </p>
      <template v-else>
        <table :aria-labelledby="titleId" class="w-full table-fixed text-sm">
          <thead class="border-b border-border text-xs text-muted-foreground">
            <tr>
              <th class="pb-1 text-left font-medium" scope="col">物料规格</th>
              <th class="w-28 pb-1 text-right font-medium" scope="col">账面库存</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-border">
            <tr v-for="row in visibleRows" :key="row.stock.id">
              <td class="py-1.5 pr-2">
                <div class="break-words font-medium">{{ row.description }}</div>
                <div v-if="row.reference !== row.description" class="break-words text-xs text-muted-foreground">{{ row.reference }}</div>
              </td>
              <td class="py-1.5 text-right tabular-nums">
                <strong :class="{ 'text-destructive': row.amount < 0 }">{{ formatQty(row.amount) }} {{ stockUnit(row.stock.stage, row.stock.item, stage?.unit) }}</strong>
                <div v-if="row.amount < 0" class="text-xs text-destructive">欠账</div>
              </td>
            </tr>
          </tbody>
        </table>
        <Pagination
          v-if="rows.length > pageSize"
          v-model:current="page"
          :page-size="pageSize"
          :show-size-changer="false"
          :total="rows.length"
          class="self-end"
          size="small"
        />
      </template>
    </template>
  </section>
</template>
