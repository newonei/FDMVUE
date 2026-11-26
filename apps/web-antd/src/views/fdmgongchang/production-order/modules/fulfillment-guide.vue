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
  const actions: string[] = [];
  if (lines.some((line) => lineHasFinishedGoods(item, line))) actions.push(`有匹配的末道库存。核对实物批次后${deliveryLabel.value}。`);
  if (lines.some((line) => line.nextProcesses.length > 0)) actions.push('有匹配的上游库存。补派工时选定批次，再预览需要接续的工序。');
  const inProgress = item.steps?.filter((step) => step.inProgressCount > 0).map((step) => `「${step.label}」`) ?? [];
  if (inProgress.length > 0) actions.push(`${inProgress.join('、')}有在制工序单，请核对当前报工进度。`);
  if (actions.length === 0) return '暂未匹配到可用现货。先核对在制任务和实物，再补排缺少的工序。';
  if (lines.length > 0 && num(match?.newProduction) > 0) actions.push('其余缺口先核对在制任务，再安排补产。');
  return actions.join('');
}

function dispatchShortage(item: Api.Item, remaining: number) {
  emit('dispatchShortage', {
    itemId: item.id,
    orderId: props.orderId,
    orderNo: props.orderNo,
    productCode: item.productCode ?? undefined,
    productName: item.productName,
    remaining,
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
    class="scroll-mt-2 overflow-hidden rounded-xl border border-border bg-card focus-visible:outline focus-visible:outline-primary"
    tabindex="-1"
  >
    <header class="flex flex-wrap items-center justify-between gap-4 bg-muted/35 px-4 py-4 sm:px-5">
      <div class="min-w-0">
        <h3 id="factory-order-fulfillment-title" class="m-0 text-lg font-semibold">补产指引</h3>
        <p v-if="outstanding.length" class="mb-0 mt-2 flex flex-wrap items-baseline gap-x-3 gap-y-1 text-sm">
          <strong class="rounded-md border border-warning/40 bg-warning/10 px-2 py-0.5">{{ outstanding.length }} 款待补</strong>
          <span class="text-muted-foreground">
            合计还差 <strong class="break-words text-base tabular-nums text-foreground">{{ unitTotals.join('、') }}</strong>
          </span>
        </p>
        <p v-else class="mb-0 mt-1 text-sm text-success">
          {{ items.length > 0 ? '全部明细已达量，可以结束这张单。' : '当前没有待交明细。' }}
        </p>
      </div>
      <div v-if="outstanding.length" class="flex flex-wrap gap-2">
        <Button v-if="canViewTasks" size="large" @click="emit('viewTasks')">查看本单任务</Button>
        <Button v-if="canPlanShortage" size="large" @click="emit('planShortage')">去手动派工</Button>
      </div>
      <slot v-else name="completed-action"></slot>
    </header>

    <template v-if="outstanding.length">
      <Alert v-if="stockState === 'error'" class="mx-4 mt-4 sm:mx-5" type="warning" show-icon message="现货匹配加载失败，待补数量仍可查看。">
        <template #action><Button @click="reload++">重试</Button></template>
      </Alert>
      <ul aria-label="待补产品" class="m-0 grid list-none gap-3 border-t border-border px-4 py-4 sm:px-5">
        <li v-for="{ item, remaining } in outstanding" :key="item.id" class="min-w-0 rounded-lg border border-border p-3 sm:p-4">
          <div class="grid items-start gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(19rem,36%)]">
            <div class="min-w-0 break-words">
              <h4 class="m-0 text-base font-semibold leading-6">{{ item.productName }}</h4>
              <p v-if="item.productCode || specText(item)" class="mb-0 mt-1 text-sm text-muted-foreground">
                {{ [item.productCode, specText(item)].filter(Boolean).join(' · ') }}
              </p>
            </div>
            <dl class="m-0 grid grid-cols-3 gap-2 text-sm tabular-nums">
              <div class="min-w-0 rounded-md bg-muted/50 px-2 py-2 sm:px-3">
                <dt class="text-muted-foreground">应做</dt>
                <dd class="m-0 break-words text-base font-semibold">{{ fmt(item.quantity) }} <span class="text-sm font-normal">{{ item.unit }}</span></dd>
              </div>
              <div class="min-w-0 rounded-md bg-muted/50 px-2 py-2 sm:px-3">
                <dt class="text-muted-foreground">{{ completedLabel }}</dt>
                <dd class="m-0 break-words text-base font-semibold">{{ fmt(item.completedQuantity) }} <span class="text-sm font-normal">{{ item.unit }}</span></dd>
              </div>
              <div class="min-w-0 rounded-md bg-warning/15 px-2 py-2 sm:px-3">
                <dt class="font-semibold">还差</dt>
                <dd class="m-0 break-words text-base font-semibold">{{ fmt(remaining) }} <span class="text-sm font-normal">{{ item.unit }}</span></dd>
              </div>
            </dl>
          </div>
          <div class="mt-3 rounded-md border-l-2 border-primary/60 bg-primary/5 p-3 text-sm leading-6">
            <p class="m-0"><strong class="mr-2">下一步</strong>{{ nextStep(item) }}</p>
            <div v-if="canDeliver || canPlanShortage" class="mt-2 flex flex-wrap gap-2">
              <template v-if="canDeliver">
                <Button size="large" :aria-expanded="openInventoryItem === item.id" @click="toggleInventory(item.id)">
                  {{ openInventoryItem === item.id ? '收起库存' : '核对库存' }}
                </Button>
                <Button v-if="matchByItem.get(item.id)?.pending" size="large" type="primary" @click="emit('configure', item)">
                  修改参数与工艺
                </Button>
                <Button
                  size="large"
                  :type="stockLines(item).some((line) => lineHasFinishedGoods(item, line)) ? 'primary' : 'default'"
                  @click="emit('deliver', item)"
                >
                  {{ deliveryLabel }}
                </Button>
              </template>
              <Button
                v-if="canPlanShortage"
                size="large"
                type="primary"
                ghost
                @click="dispatchShortage(item, remaining)"
              >
                补派工
              </Button>
            </div>
          </div>
          <div v-if="openInventoryItem === item.id" class="mt-3 rounded-md border border-border bg-muted/30 p-3 text-sm leading-6">
            <h5 class="m-0 font-semibold">匹配的库存批次</h5>
            <ul v-if="stockLines(item).length" class="m-0 mb-2 grid list-disc gap-1 pl-5">
              <li v-for="(line, index) in stockLines(item)" :key="`${line.stage}-${line.code}-${index}`" class="break-words">
                {{ line.stageLabel }} {{ line.code }} · 参考用量 {{ fmt(line.used) }} {{ line.unit }}
                <span v-if="line.nextProcesses.length" class="block text-muted-foreground">后续 {{ line.nextProcesses.join(' → ') }}</span>
              </li>
            </ul>
            <p v-else-if="stockState === 'ready'" class="m-0 mb-2">暂无可用的匹配批次。</p>
            <p class="m-0 text-muted-foreground">
              领料前核对实物批次和库存流水。出现负库存时，先核对前后工序的领料和报工记录。
            </p>
          </div>
        </li>
      </ul>
      <p class="m-0 border-t border-border px-4 py-3 text-sm text-muted-foreground sm:px-5">
        末道报工请关联对应订单明细。已{{ purchase ? '入库' : '交货' }}的数量会自动更新，全部达量后可结束订单。
      </p>
    </template>
  </section>
</template>
