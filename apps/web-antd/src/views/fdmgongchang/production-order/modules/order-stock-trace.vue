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
          <section class="min-w-0">
            <h4 id="planned-stock-trace" class="m-0 text-xs font-semibold">拆分下发时选用</h4>
            <p v-if="!trace.planned.length" class="mb-0 mt-1 text-xs text-muted-foreground">暂无拆分选用记录。</p>
            <div v-else class="mt-2 overflow-x-auto" role="region" aria-labelledby="planned-stock-trace" tabindex="0">
              <table class="trace-table w-full min-w-[760px]" aria-labelledby="planned-stock-trace">
                <thead>
                  <tr>
                    <th scope="col">订单产品</th>
                    <th scope="col">库存阶段</th>
                    <th scope="col">物料编码</th>
                    <th scope="col">库位</th>
                    <th scope="col">库存批次</th>
                    <th scope="col">排单号</th>
                    <th scope="col" class="number-cell">计划使用</th>
                    <th scope="col">接续工序</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="(line, index) in trace.planned" :key="`${line.scheduleNo}:${line.itemId}:${line.stockId}:${index}`">
                    <th scope="row">{{ productNames.get(line.itemId) || line.itemId }}</th>
                    <td>{{ line.stageLabel }}</td>
                    <td>{{ line.itemCode }}</td>
                    <td>{{ line.location || '—' }}</td>
                    <td>{{ line.aggregated ? '按仓库汇总' : line.batchNo || '—' }}</td>
                    <td>{{ line.scheduleNo || '—' }}</td>
                    <td class="number-cell">{{ formatQuantity(line.quantity) }} {{ line.unit }}</td>
                    <td>{{ line.startProcessLabel || '—' }}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </section>
          <section class="min-w-0">
            <div class="flex items-center justify-between gap-2">
              <h4 id="actual-stock-trace" class="m-0 text-xs font-semibold">实际领料、入库与交货</h4>
              <Button size="small" type="link" @click="load">刷新记录</Button>
            </div>
            <p v-if="!trace.actual.length" class="mb-0 mt-1 text-xs text-muted-foreground">暂无实际库存领用记录。</p>
            <div v-else class="mt-2 overflow-x-auto" role="region" aria-labelledby="actual-stock-trace" tabindex="0">
              <table class="trace-table w-full min-w-[760px]" aria-labelledby="actual-stock-trace">
                <thead>
                  <tr>
                    <th scope="col">订单产品</th>
                    <th scope="col">业务</th>
                    <th scope="col">物料编码</th>
                    <th scope="col">库存阶段</th>
                    <th scope="col">库位</th>
                    <th scope="col">库存批次</th>
                    <th scope="col" class="number-cell">实际净用</th>
                    <th scope="col">关联单号</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="(line, index) in trace.actual" :key="`${line.itemId}:${line.stockId}:${line.activity}:${index}`">
                    <th scope="row">{{ productNames.get(line.itemId) || line.itemId }}</th>
                    <td>{{ line.activity }}</td>
                    <td>{{ line.itemCode }}</td>
                    <td>{{ line.stageLabel }}</td>
                    <td>{{ line.location || '—' }}</td>
                    <td>{{ line.aggregated ? '按仓库汇总' : line.batchNo || '—' }}</td>
                    <td class="number-cell">{{ formatQuantity(line.quantity) }} {{ line.unit }}</td>
                    <td>{{ line.documentNos.join('、') || '—' }}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </section>
        </div>
      </Spin>
    </div>
  </details>
</template>

<style scoped>
.trace-table th,
.trace-table td {
  padding: 7px 10px;
  font-size: 12px;
  vertical-align: top;
  text-align: left;
  overflow-wrap: anywhere;
  border: 1px solid hsl(var(--border));
}

.trace-table thead th {
  font-weight: 600;
  white-space: nowrap;
  background: hsl(var(--muted) / 55%);
}

.trace-table .number-cell {
  font-variant-numeric: tabular-nums;
  text-align: right;
  white-space: nowrap;
}
</style>
