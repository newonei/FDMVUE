<script setup lang="ts">
import type { FdmgongchangProductionOrderApi as Api, OrderStockTrace } from '#/api/fdmgongchang/production-order';

import { computed, ref, watch } from 'vue';

import { Alert, Button, Spin } from 'ant-design-vue';

import { getOrderStockTrace } from '#/api/fdmgongchang/production-order';

import { num } from '../shared';

const props = defineProps<{ items: Api.Item[]; orderId: number }>();
const opened = ref(false);
const loading = ref(false);
const failed = ref(false);
const trace = ref<OrderStockTrace>();
let version = 0;
const productNames = computed(() => new Map(props.items.map((item) => [item.id, item.productCode || item.productName])));

function formatQuantity(quantity: number | string) {
  return num(quantity).toLocaleString('zh-CN', { maximumFractionDigits: 3 });
}

async function load() {
  const current = ++version;
  loading.value = true;
  failed.value = false;
  try {
    const result = await getOrderStockTrace(props.orderId);
    if (version === current) trace.value = result;
  } catch {
    if (version === current) failed.value = true;
  } finally {
    if (version === current) loading.value = false;
  }
}

watch([() => props.orderId, () => props.items], () => {
  ++version;
  trace.value = undefined;
  failed.value = false;
  loading.value = false;
  if (opened.value) void load();
});

function toggle(event: Event) {
  opened.value = (event.currentTarget as HTMLDetailsElement).open;
  if (opened.value && !trace.value && !loading.value) void load();
}

function stockLocation(line: { aggregated: boolean; batchNo?: null | string; location?: null | string }) {
  return [line.location, line.aggregated ? '按仓库汇总' : line.batchNo].filter(Boolean).join(' · ');
}
</script>

<template>
  <details class="rounded-lg border border-border bg-card" @toggle="toggle">
    <summary class="cursor-pointer px-4 py-3 text-sm font-semibold">本单库存选用与实际领用</summary>
    <div v-if="opened" class="space-y-4 border-t border-border px-4 py-3">
      <Alert v-if="failed" type="warning" show-icon message="库存记录加载失败">
        <template #action><Button size="small" @click="load">重试</Button></template>
      </Alert>
      <Spin :spinning="loading">
        <div v-if="trace" class="flex flex-col gap-4">
          <section>
            <h4 class="m-0 text-xs font-semibold">拆分下发时选用</h4>
            <p v-if="!trace.planned.length" class="mb-0 mt-1 text-xs text-muted-foreground">暂无拆分选用记录。</p>
            <ul v-else class="mb-0 mt-2 grid list-none gap-2 p-0 text-xs">
              <li v-for="(line, index) in trace.planned" :key="`${line.scheduleNo}:${line.itemId}:${line.stockId}:${index}`" class="rounded-md border border-border p-2">
                <p class="m-0 font-medium">{{ productNames.get(line.itemId) || line.itemId }} · {{ line.stageLabel }} · {{ line.itemCode }}</p>
                <p class="mb-0 mt-1 text-muted-foreground">{{ stockLocation(line) }} · 排单 {{ line.scheduleNo }}</p>
                <p class="mb-0 mt-1">
                  计划使用 <b>{{ formatQuantity(line.quantity) }} {{ line.unit }}</b>
                  <span v-if="line.startProcessLabel"> · 从「{{ line.startProcessLabel }}」接做</span>
                </p>
              </li>
            </ul>
          </section>
          <section>
            <div class="flex items-center justify-between gap-2">
              <h4 class="m-0 text-xs font-semibold">实际领料、入库与交货</h4>
              <Button size="small" type="link" @click="load">刷新记录</Button>
            </div>
            <p v-if="!trace.actual.length" class="mb-0 mt-1 text-xs text-muted-foreground">暂无实际库存领用记录。</p>
            <ul v-else class="mb-0 mt-2 grid list-none gap-2 p-0 text-xs">
              <li v-for="(line, index) in trace.actual" :key="`${line.itemId}:${line.stockId}:${line.activity}:${index}`" class="rounded-md border border-border p-2">
                <p class="m-0 font-medium">{{ productNames.get(line.itemId) || line.itemId }} · {{ line.activity }} · {{ line.itemCode }}</p>
                <p class="mb-0 mt-1 text-muted-foreground">{{ line.stageLabel }} · {{ stockLocation(line) }}</p>
                <p class="mb-0 mt-1">实际净用 <b>{{ formatQuantity(line.quantity) }} {{ line.unit }}</b> · {{ line.documentNos.join('、') }}</p>
              </li>
            </ul>
          </section>
        </div>
      </Spin>
    </div>
  </details>
</template>
