<script setup lang="ts">
import type { FdmgongchangProductionOrderApi as OrderApi } from '#/api/fdmgongchang/production-order';
import type { FdmgongchangOrderSplitApi as SplitApi } from '#/api/fdmgongchang/schedule';

import { computed } from 'vue';

import { Alert, Button, InputNumber } from 'ant-design-vue';

import { num } from '../../production-order/shared';
import { quantityPrecision } from '../../shared/quantity';
import { PROCESS_LABELS } from '../../shared/schedule';
import { formatQty } from '../../stage-stock/model';

const props = defineProps<{
  advice?: SplitApi.StockAdvice;
  adviceFeedback: string;
  adviceLoading: boolean;
  canDeliver: boolean;
  canRequestAdvice: boolean;
  disabled: boolean;
  needsRepreview: boolean;
  orders: OrderApi.Order[];
  preview: SplitApi.Preview;
}>();
const emit = defineEmits<{
  generateAdvice: [];
  manualDelivery: [stock: { itemId: number; orderId: number; quantity: number; stockId: number }];
}>();
const picks = defineModel<Array<{ candidate: SplitApi.StockCandidate; quantity: null | number }>>('picks', { required: true });

function stockKey(stock: Pick<SplitApi.StockSelection, 'itemId' | 'stockId'>) {
  return `${stock.itemId}-${stock.stockId}`;
}

function plannedText(stocks: SplitApi.StockPlan[]) {
  const quantities = new Map<string, number>();
  for (const stock of stocks) quantities.set(stock.unit, (quantities.get(stock.unit) ?? 0) + num(stock.quantity));
  return [...quantities].map(([unit, quantity]) => `${formatQty(quantity)} ${unit}`).join('、');
}

const currentCandidates = computed(() => new Map((props.preview.stockCandidates ?? []).map((stock) => [stockKey(stock), stock])));
const selected = computed(() => new Map(picks.value.map((pick) => [stockKey(pick.candidate), pick])));
const adviceByItem = computed(() => new Map((props.advice?.items ?? []).map((item) => [item.itemId, item])));
const groups = computed(() => props.orders.flatMap((order) => order.items.map((item) => {
  const candidates = (props.preview.stockCandidates ?? []).filter((stock) => stock.itemId === item.id);
  const unavailable = picks.value.filter(({ candidate }) => candidate.itemId === item.id && !currentCandidates.value.has(stockKey(candidate)))
    .map(({ candidate }) => ({ ...candidate, available: 0 }));
  const itemAdvice = adviceByItem.value.get(item.id);
  return {
    advice: itemAdvice,
    candidates: [...candidates, ...unavailable],
    coverage: props.preview.stockCoverage?.find((row) => row.itemId === item.id),
    item,
    order,
    pickedCount: picks.value.filter(({ candidate }) => candidate.itemId === item.id).length,
    planned: (props.preview.stockPlan ?? []).filter((stock) => stock.itemId === item.id),
    recommendations: [
      ...(itemAdvice?.recommendations.filter((line) => line.action === 'DELIVER') ?? []),
      ...(itemAdvice?.recommendations.filter((line) => line.action === 'USE') ?? []),
    ],
  };
})).filter((group) => group.candidates.length > 0 || group.coverage || group.planned.length > 0 || group.advice));

function toggle(stock: SplitApi.StockCandidate, checked: boolean) {
  const key = stockKey(stock);
  const other = picks.value.filter((pick) => stockKey(pick.candidate) !== key);
  picks.value = checked ? [...other, { candidate: stock, quantity: null }] : other;
}

function changeQuantity(stock: SplitApi.StockCandidate, quantity: null | number | string) {
  const key = stockKey(stock);
  picks.value = picks.value.map((pick) => stockKey(pick.candidate) === key ? {
    ...pick, quantity: quantity === null ? null : Number(quantity),
  } : pick);
}

function startProcess(stock: Pick<SplitApi.StockAdviceLine, 'startProcess' | 'startProcessLabel'>) {
  return stock.startProcessLabel || (stock.startProcess && (PROCESS_LABELS[stock.startProcess] || stock.startProcess));
}

function batchText(stock: Pick<SplitApi.StockAdviceLine, 'aggregated' | 'batchNo'>) {
  if (stock.aggregated) return '按仓库汇总';
  return stock.batchNo ? `批次 ${stock.batchNo}` : '未记录批次';
}

function sideText(stock: Pick<SplitApi.StockAdviceLine, 'side'>) {
  return stock.side ? { BACK: '反面层', BOTH: '正反两面', FRONT: '正面层' }[stock.side] : '';
}

function layerYieldText(stock: SplitApi.StockCandidate) {
  if (!['BOARD', 'SHEET'].includes(stock.stage) || !stock.side || stock.side === 'BOTH' || num(stock.perUnit) <= 1) return '';
  return `参考：每${stock.unit}折算 ${stock.perUnit} 片${sideText(stock)}`;
}

function deliveryAction(order: OrderApi.Order) {
  return order.sourceType === 'PURCHASE_ORDER' ? '先生产入库' : '先交货';
}

function validQuantity(stock: SplitApi.StockCandidate) {
  const quantity = selected.value.get(stockKey(stock))?.quantity ?? 0;
  return Number.isFinite(quantity) && quantity > 0 && quantity <= num(stock.available);
}

function deliver(order: OrderApi.Order, stock: SplitApi.StockCandidate) {
  const quantity = selected.value.get(stockKey(stock))?.quantity;
  if (!quantity || !validQuantity(stock)) return;
  emit('manualDelivery', { itemId: stock.itemId, orderId: order.id, quantity, stockId: stock.stockId });
}

function adviceFillCandidate(item: SplitApi.StockAdviceItem, line: SplitApi.StockAdviceLine) {
  const key = stockKey({ itemId: item.itemId, stockId: line.stockId });
  const stock = currentCandidates.value.get(key);
  const chosen = selected.value.get(key);
  const quantity = num(line.quantity);
  if (!props.disabled && stock && chosen && stock.unit === line.unit && stock.deliverable === (line.action === 'DELIVER')
    && quantity > 0 && quantity <= num(stock.available) && quantity !== chosen.quantity
    && item.recommendations.filter((row) => row.stockId === line.stockId).length === 1) return stock;
  return undefined;
}

function fillAdviceQuantity(item: SplitApi.StockAdviceItem, line: SplitApi.StockAdviceLine) {
  const stock = adviceFillCandidate(item, line);
  if (stock) changeQuantity(stock, line.quantity);
}
</script>

<template>
  <section class="flex flex-col gap-2 rounded-lg border border-border px-3 py-3" aria-labelledby="split-stock-heading">
    <div class="flex flex-wrap items-center justify-between gap-2">
      <h3 id="split-stock-heading" class="m-0 text-sm font-semibold">选用现有库存</h3>
      <Button size="small" :disabled="!canRequestAdvice" :loading="adviceLoading" @click="emit('generateAdvice')">生成 AI 建议</Button>
    </div>
    <p class="m-0 text-xs text-muted-foreground">按实物勾选库存并填写计划用量，重新预览后核对各款覆盖量。车间实际领料时扣减库存。</p>
    <div v-if="advice || adviceFeedback || adviceLoading" class="space-y-1 rounded-md bg-primary/5 px-3 py-2 text-xs" role="status">
      <p v-if="advice?.items.length" class="m-0 font-medium">
        {{ advice.source === 'AI' ? 'AI 解读 · 库存与数量由系统核算' : '系统核算建议' }}
      </p>
      <p v-if="advice?.items.length && needsRepreview" class="m-0 text-warning">以下建议基于上次预览。重新计算后会更新当前覆盖量。</p>
      <p v-if="adviceLoading" class="m-0 text-muted-foreground">AI 正在生成建议，可以继续核对和选择库存。</p>
      <p v-if="advice?.notice" class="m-0 text-muted-foreground">{{ advice.notice }}</p>
      <p v-if="adviceFeedback" class="m-0 text-muted-foreground">{{ adviceFeedback }}</p>
    </div>
    <Alert
      v-if="picks.some(({ candidate }) => candidate.deliverable)"
      type="warning"
      show-icon
      message="已勾选末道现货，请先办理生产入库或交货，再重新预览剩余生产量。"
    />
    <p v-if="groups.length === 0" class="m-0 text-xs text-muted-foreground">当前未匹配到可选库存。</p>
    <details
      v-for="(group, index) in groups"
      :key="group.item.id"
      :open="index === 0"
      class="rounded border border-border bg-card px-3 py-2 text-xs"
    >
      <summary class="cursor-pointer leading-6">
        <span class="font-medium">{{ group.order.orderNo }} · {{ group.item.productName }}</span>
        <span v-if="group.item.productCode" class="ml-2 text-muted-foreground">{{ group.item.productCode }}</span>
        <span class="ml-3">已勾选 {{ group.pickedCount }} 个库存行</span>
        <template v-if="group.coverage">
          <span class="ml-3">{{ needsRepreview ? '上次选用' : '本次选用' }} {{ plannedText(group.planned) || '0' }}</span>
          <span class="ml-3">可覆盖 {{ formatQty(group.coverage.covered) }} {{ group.item.unit || '成品' }}</span>
          <span class="ml-3">需从头做 {{ formatQty(group.coverage.remainingFromStart) }} {{ group.item.unit || '成品' }}</span>
          <span v-if="needsRepreview" class="ml-2 text-warning">上次预览</span>
        </template>
        <span v-if="group.advice" class="ml-3 text-primary">有用库建议</span>
        <span v-if="group.candidates.some((stock) => stock.deliverable)" class="ml-3 font-medium text-warning">有末道现货 · {{ deliveryAction(group.order) }}</span>
      </summary>

      <div v-if="group.advice" :data-stock-advice-item="group.item.id" class="my-2 rounded-md border border-primary/20 bg-primary/5 p-2.5">
        <div class="flex flex-wrap gap-x-4 gap-y-1 text-muted-foreground">
          <span>还差 {{ formatQty(group.advice.remaining) }} {{ group.advice.unit || group.item.unit || '成品' }}</span>
          <span v-if="group.advice.planningBlocked" class="font-medium text-warning">暂不可拆分</span>
          <span v-if="num(group.advice.receiptSuggested) > 0" class="font-medium text-warning">
            建议{{ deliveryAction(group.order) }} {{ formatQty(group.advice.receiptSuggested) }} {{ group.advice.unit || group.item.unit || '成品' }}
          </span>
          <span v-if="num(group.advice.receiptSuggested) > 0 && group.advice.remainingAfterReceipt != null">
            {{ group.order.sourceType === 'PURCHASE_ORDER' ? '预计入库后仍待入库' : '预计交货后仍待交货' }} {{ formatQty(group.advice.remainingAfterReceipt) }} {{ group.advice.unit || group.item.unit || '成品' }}
          </span>
          <span>半成品预计覆盖 {{ formatQty(group.advice.covered) }} {{ group.advice.unit || group.item.unit || '成品' }}</span>
          <span v-if="group.advice.planningBlocked">预计还需从头做 —</span>
          <span v-else>{{ num(group.advice.receiptSuggested) > 0 ? '按建议办理入库或交货后' : '采用建议后' }}预计还需从头做 {{ formatQty(group.advice.remainingFromStart) }} {{ group.advice.unit || group.item.unit || '成品' }}</span>
        </div>
        <p v-if="group.advice.summary" class="mb-0 mt-2">{{ group.advice.summary }}</p>
        <ul v-if="group.recommendations.length" class="mb-0 mt-2 list-disc space-y-1 pl-4">
          <li v-for="(line, index) in group.recommendations" :key="`${line.stockId}-${index}`">
            <b :class="{ 'text-warning': line.action === 'DELIVER' }">{{ line.action === 'DELIVER' ? deliveryAction(group.order) : '建议领用' }}</b>
            {{ formatQty(line.quantity) }} {{ line.unit }} · {{ line.stageLabel }} {{ line.itemCode }} · {{ batchText(line) }}
            <template v-if="line.location"> · {{ line.location }}</template>
            <template v-if="sideText(line)"> · 面别 {{ sideText(line) }}</template>
            <template v-if="line.action === 'USE' && startProcess(line)"> · 从{{ startProcess(line) }}接做</template>
            <span v-if="selected.has(stockKey({ itemId: group.item.id, stockId: line.stockId }))" class="text-muted-foreground">（当前已勾选）</span>
            <Button v-if="adviceFillCandidate(group.advice, line)" class="ml-1" size="small" type="link" @click="fillAdviceQuantity(group.advice, line)">填入建议量</Button>
          </li>
        </ul>
        <p v-else class="mb-0 mt-2 text-muted-foreground">当前无推荐库存行，可继续核对工序预览。</p>
      </div>

      <p v-if="group.item.targetConstructionType === 'DOUBLE_LAYER' || group.candidates.some((stock) => stock.side)" class="my-2 text-muted-foreground">
        单面现货可减少该面前道工序，正反两层配齐后计入成品覆盖。
      </p>
      <ul v-if="group.planned.length" class="my-2 list-disc space-y-1 rounded bg-primary/5 py-2 pl-6 pr-3">
        <li v-for="(stock, lineIndex) in group.planned" :key="`${stockKey(stock)}-${lineIndex}`">
          <span class="font-medium">{{ needsRepreview ? '上次纳入' : '本次纳入' }}</span>
          {{ stock.stageLabel }} {{ stock.itemCode }} · {{ batchText(stock) }}
          <template v-if="stock.location"> · {{ stock.location }}</template>
          <template v-if="sideText(stock)"> · 面别 {{ sideText(stock) }}</template>
          · 计划领用 {{ formatQty(stock.quantity) }} {{ stock.unit }}
          <template v-if="startProcess(stock)"> · 从{{ startProcess(stock) }}接做</template>
        </li>
      </ul>
      <p v-else class="my-2 text-muted-foreground">{{ needsRepreview ? '上次预览未纳入库存。' : '本次未纳入库存。' }}</p>

      <div v-if="group.candidates.length" class="max-h-64 overflow-auto">
        <table class="w-full min-w-[580px] border-collapse text-left">
          <thead class="bg-muted/35 text-muted-foreground">
            <tr><th class="px-2 py-1.5">选用</th><th class="px-2 py-1.5">库存及开工点</th><th class="px-2 py-1.5 text-right">可选数量</th><th class="px-2 py-1.5">计划用量</th><th class="px-2 py-1.5">操作</th></tr>
          </thead>
          <tbody>
            <tr
              v-for="stock in group.candidates"
              :key="stockKey(stock)"
              :data-stock-key="stockKey(stock)"
              class="border-b border-border last:border-none"
              :class="{ 'bg-warning/5': stock.deliverable }"
            >
              <td class="px-2 py-1.5">
                <input
                  type="checkbox"
                  :aria-label="`选择 ${group.order.orderNo} ${group.item.productName} ${batchText(stock)} ${stock.location || ''}`"
                  :checked="selected.has(stockKey(stock))"
                  :disabled="disabled || (!currentCandidates.has(stockKey(stock)) && !selected.has(stockKey(stock)))"
                  @change="(event) => toggle(stock, (event.target as HTMLInputElement).checked)"
                />
              </td>
              <td class="px-2 py-1.5">
                <b>{{ stock.stageLabel }}</b> · {{ stock.itemCode }} · {{ batchText(stock) }}
                <template v-if="stock.location"> · {{ stock.location }}</template>
                <template v-if="sideText(stock)"> · 面别 {{ sideText(stock) }}</template>
                <div v-if="!currentCandidates.has(stockKey(stock))" class="text-warning">此库存行已不可用，请取消勾选</div>
                <div v-else-if="stock.deliverable" class="font-medium text-warning">末道现货 · {{ deliveryAction(group.order) }}</div>
                <div v-else-if="startProcess(stock)" class="text-muted-foreground">从{{ startProcess(stock) }}接做</div>
                <div v-if="layerYieldText(stock)" class="text-muted-foreground">{{ layerYieldText(stock) }}</div>
              </td>
              <td class="whitespace-nowrap px-2 py-1.5 text-right tabular-nums">{{ formatQty(stock.available) }} {{ stock.unit }}</td>
              <td class="whitespace-nowrap px-2 py-1.5">
                <InputNumber
                  :aria-label="`库存行 ${group.item.id}-${stock.stockId} 计划用量`"
                  :disabled="disabled || !selected.has(stockKey(stock)) || !currentCandidates.has(stockKey(stock))"
                  :max="num(stock.available)"
                  :min="0"
                  :precision="quantityPrecision(stock.unit)"
                  :value="selected.get(stockKey(stock))?.quantity ?? undefined"
                  class="w-24"
                  placeholder="填写"
                  size="small"
                  @update:value="(value) => changeQuantity(stock, value ?? null)"
                />
                <span class="ml-1">{{ stock.unit }}</span>
              </td>
              <td class="whitespace-nowrap px-2 py-1.5">
                <Button
                  v-if="stock.deliverable && canDeliver"
                  :disabled="disabled || !validQuantity(stock) || !currentCandidates.has(stockKey(stock))"
                  size="small"
                  type="link"
                  @click="deliver(group.order, stock)"
                >
{{ deliveryAction(group.order) }}
</Button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </details>
  </section>
</template>
