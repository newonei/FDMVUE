<script setup lang="ts">
import type { ShortageDispatchSeed } from '../../shared/schedule';

import type {
  FdmgongchangProductionOrderApi as Api,
  FdmgongchangSupplyMatchApi as MatchApi,
} from '#/api/fdmgongchang/production-order';

import { computed, ref, watch } from 'vue';

import { Alert, Button } from 'ant-design-vue';

import { getSupplyMatch } from '#/api/fdmgongchang/production-order';

import { num, remainingOrderItemQuantity, specText } from '../shared';

const props = defineProps<{
  canDeliver: boolean;
  canPlanShortage: boolean;
  canViewTasks: boolean;
  items: Api.Item[];
  orderId: number;
  orderNo: string;
  purchase: boolean;
}>();

const emit = defineEmits<{
  configure: [item: Api.Item];
  deliver: [item: Api.Item];
  dispatchShortage: [seed: ShortageDispatchSeed];
  planShortage: [];
  viewTasks: [];
}>();

const root = ref<HTMLElement>();
const openInventoryItem = ref<number>();
const matches = ref<MatchApi.Match[]>([]);
const stockState = ref<'error' | 'idle' | 'loading' | 'ready'>('idle');
const reload = ref(0);
const outstanding = computed(() => props.items
  .map((item) => ({ item, remaining: remainingOrderItemQuantity(item) }))
  .filter(({ remaining }) => remaining > 0));
const matchByItem = computed(() => new Map(matches.value.map((match) => [match.itemId, match])));
const deliveryLabel = computed(() => props.purchase ? '生产入库' : '交货');
const completedLabel = computed(() => props.purchase ? '已入库' : '已交货');
const unitTotals = computed(() => {
  const totals = new Map<string, number>();
  for (const { item, remaining } of outstanding.value) {
    const unit = item.unit?.trim() || '';
    totals.set(unit, (totals.get(unit) ?? 0) + remaining);
  }
  return [...totals].map(([unit, quantity]) => `${fmt(quantity)}${unit}`);
});

watch([() => props.orderId, () => props.items, () => props.canDeliver, reload], async (_, __, onCleanup) => {
  let cancelled = false;
  onCleanup(() => { cancelled = true; });
  matches.value = [];
  stockState.value = 'idle';
  if (!props.canDeliver || outstanding.value.length === 0) return;

  stockState.value = 'loading';
  try {
    const result = await getSupplyMatch(props.orderId, true);
    if (cancelled) return;
    matches.value = result;
    stockState.value = 'ready';
  } catch {
    if (!cancelled) stockState.value = 'error';
  }
}, { immediate: true });

function fmt(quantity: null | number | string | undefined) {
  return num(quantity).toLocaleString('zh-CN', { maximumFractionDigits: 3 });
}

function stockLines(item: Api.Item) {
  return (matchByItem.value.get(item.id)?.lines ?? [])
    .filter((line) => (line.source === 'STOCK' || line.source === 'OWN') && num(line.used) > 0);
}

function lineHasFinishedGoods(item: Api.Item, line: MatchApi.Line) {
  return line.nextProcesses.length === 0 && line.stage === (item.deliveryStage || 'PACKED');
}

function nextStep(item: Api.Item) {
  if (!props.canDeliver) return '请负责入库或交货的同事核对库存和在制任务。';
  if (stockState.value === 'loading') return '正在核对账面库存…';
  if (stockState.value === 'error') return '请重新核对库存，再确认补产起点。';
  const match = matchByItem.value.get(item.id);
  if (match?.pending) return `${match.pending}。先补齐生产参数，再核对库存。`;

  const lines = stockLines(item);
  const starts = [...new Set(lines.flatMap((line) => line.nextProcesses.slice(0, 1)))];
  const actions: string[] = [];
  if (lines.some((line) => lineHasFinishedGoods(item, line))) actions.push(`有匹配的末道库存。核对实物批次后${deliveryLabel.value}。`);
  if (starts.length > 0) actions.push(`有匹配的上游库存。核对批次后按订单工艺从${starts.map((step) => `「${step}」`).join('、')}接做。`);
  const inProgress = item.steps?.filter((step) => step.inProgressCount > 0).map((step) => `「${step.label}」`) ?? [];
  if (inProgress.length > 0) actions.push(`${inProgress.join('、')}有在制工序单，请核对当前报工进度。`);
  if (actions.length === 0) return '暂未匹配到可用现货。先核对在制任务和实物，再补排缺少的工序。';
  if (lines.length > 0 && num(match?.newProduction) > 0) actions.push('其余缺口先核对在制任务，再安排补产。');
  return actions.join('');
}

const oneToOneProcesses = new Set(['ENGRAVE', 'FOLD', 'PACK', 'PUNCH']);

function dispatchShortage(item: Api.Item, remaining: number) {
  const match = matchByItem.value.get(item.id);
  const lines = stockLines(item);
  const label = lines.find((line) => line.nextProcesses.length > 0)?.nextProcesses[0];
  const process = label ? match?.processes.find((step) => step.label === label)?.process
    ?? item.steps?.find((step) => step.label === label)?.process : undefined;
  const suggestedQuantity = process && oneToOneProcesses.has(process)
    ? Math.min(remaining, lines.filter((line) => line.nextProcesses[0] === label && !line.side && num(line.perUnit) === 1)
      .reduce((total, line) => total + num(line.covers), 0))
    : 0;
  emit('dispatchShortage', {
    itemId: item.id,
    orderId: props.orderId,
    orderNo: props.orderNo,
    processes: item.processes ?? undefined,
    remaining,
    suggestedProcess: process,
    suggestedQuantity: suggestedQuantity > 0 ? Number(suggestedQuantity.toFixed(3)) : undefined,
    unit: item.unit,
  });
}

function toggleInventory(id: number) {
  openInventoryItem.value = openInventoryItem.value === id ? undefined : id;
}

function focus() {
  root.value?.focus({ preventScroll: true });
  root.value?.scrollIntoView?.({ block: 'start' });
}

defineExpose({ focus });
</script>

<template>
  <section
    id="factory-order-fulfillment-panel"
    ref="root"
    aria-labelledby="factory-order-fulfillment-title"
    class="scroll-mt-2 rounded-lg border border-border bg-card focus-visible:outline focus-visible:outline-primary"
    tabindex="-1"
  >
    <div class="flex flex-wrap items-start justify-between gap-3 px-4 py-3">
      <div class="min-w-0">
        <h3 id="factory-order-fulfillment-title" class="m-0 text-base font-semibold">补产指引</h3>
        <p v-if="outstanding.length" class="mb-0 mt-1 text-sm text-warning">
          <b>{{ outstanding.length }} 款待补</b><span v-if="unitTotals.length === 1"> · 还差 {{ unitTotals[0] }}</span>
        </p>
        <p v-else class="mb-0 mt-1 text-sm text-success">
          {{ items.length > 0 ? '全部明细已达量，可以结束这张单。' : '当前没有待交明细。' }}
        </p>
      </div>
      <div v-if="outstanding.length" class="flex flex-wrap gap-2">
        <Button v-if="canViewTasks" size="small" @click="emit('viewTasks')">查看本单任务</Button>
        <Button v-if="canPlanShortage" size="small" @click="emit('planShortage')">去手动派工</Button>
      </div>
      <slot v-else name="completed-action"></slot>
    </div>

    <template v-if="outstanding.length">
      <Alert v-if="stockState === 'error'" class="mx-4 mb-3" type="warning" show-icon message="现货匹配加载失败，待补数量仍可查看。">
        <template #action><Button size="small" @click="reload++">重试</Button></template>
      </Alert>
      <table class="w-full table-fixed border-collapse text-sm">
        <thead class="border-y border-border bg-muted/40 text-xs text-muted-foreground">
          <tr>
            <th scope="col" class="px-4 py-2 text-left font-medium">产品及下一步</th>
            <th scope="col" class="w-28 px-4 py-2 text-right font-medium sm:w-36">数量</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="{ item, remaining } in outstanding" :key="item.id" class="align-top [&:not(:last-child)]:border-b [&:not(:last-child)]:border-border">
            <td class="break-words px-4 py-3">
              <p class="m-0 font-semibold">{{ item.productName }}</p>
              <p v-if="item.productCode || specText(item)" class="mb-0 mt-0.5 text-xs text-muted-foreground">
                {{ [item.productCode, specText(item)].filter(Boolean).join(' · ') }}
              </p>
              <p class="mb-0 mt-1 text-xs">{{ nextStep(item) }}</p>
              <div v-if="canDeliver || canPlanShortage" class="mt-2 flex flex-wrap gap-2">
                <template v-if="canDeliver">
                  <Button size="small" :aria-expanded="openInventoryItem === item.id" @click="toggleInventory(item.id)">
                    {{ openInventoryItem === item.id ? '收起库存' : '核对库存' }}
                  </Button>
                  <Button v-if="matchByItem.get(item.id)?.pending" size="small" @click="emit('configure', item)">修改参数与工艺</Button>
                  <Button
                    size="small"
                    :type="stockLines(item).some((line) => lineHasFinishedGoods(item, line)) ? 'primary' : 'default'"
                    @click="emit('deliver', item)"
                  >
{{ deliveryLabel }}
</Button>
                </template>
                <Button
                  v-if="canPlanShortage"
                  :loading="stockState === 'loading'"
                  size="small"
                  type="primary"
                  ghost
                  @click="dispatchShortage(item, remaining)"
                >
补派工
</Button>
              </div>
              <div v-if="openInventoryItem === item.id" class="mt-2 rounded-md bg-muted/40 p-2 text-xs">
                <ul v-if="stockLines(item).length" class="m-0 list-disc space-y-1 pl-4">
                  <li v-for="(line, index) in stockLines(item)" :key="`${line.stage}-${line.code}-${index}`">
                    {{ line.stageLabel }} {{ line.code }} · 参考用量 {{ fmt(line.used) }} {{ line.unit }}
                    <span v-if="line.nextProcesses.length" class="block text-muted-foreground">后续 {{ line.nextProcesses.join(' → ') }}</span>
                  </li>
                </ul>
                <p class="m-0 text-muted-foreground" :class="{ 'mt-2': stockLines(item).length > 0 }">
                  领料前核对实物批次和库存流水。出现负库存时，先核对前后工序的领料和报工记录。
                </p>
              </div>
            </td>
            <td class="px-4 py-3">
              <dl class="m-0 grid grid-cols-[auto_minmax(0,1fr)] gap-x-1 gap-y-1 text-right text-xs tabular-nums">
                <dt class="text-muted-foreground">应做</dt><dd class="m-0 break-words">{{ fmt(item.quantity) }} {{ item.unit }}</dd>
                <dt class="text-muted-foreground">{{ completedLabel }}</dt><dd class="m-0 break-words">{{ fmt(item.completedQuantity) }} {{ item.unit }}</dd>
                <dt class="font-semibold text-warning">还差</dt><dd class="m-0 break-words font-semibold text-warning">{{ fmt(remaining) }} {{ item.unit }}</dd>
              </dl>
            </td>
          </tr>
        </tbody>
      </table>
      <p class="m-0 border-t border-border px-4 py-2 text-xs text-muted-foreground">
        末道报工请关联对应订单明细。已{{ purchase ? '入库' : '交货' }}的数量会自动更新，全部达量后可结束订单。
      </p>
    </template>
  </section>
</template>
