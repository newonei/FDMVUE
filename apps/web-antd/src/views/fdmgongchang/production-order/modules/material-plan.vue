<script setup lang="ts">
import type { FdmgongchangMaterialPlanApi as Api } from '#/api/fdmgongchang/production-order';

import { computed, ref, shallowReactive, watch } from 'vue';

import { Alert, Button, Checkbox, message, Select, Spin, Tag } from 'ant-design-vue';

import { getMaterialPlan, getRecipeOptions, saveItemMaterial } from '#/api/fdmgongchang/production-order';

import { dimensionTextInMm } from '../../shared/dimensions';
import { num } from '../shared';

/**
 * 用料逆推（工厂看）：按订单成品规格倒推用什么板材、要几张、要多少原料，系统直接算。
 * 工厂可以给每条明细换配方（决定每张板投多少料、原料比例）和板材规格（默认本厂发泡出板规格，可换模具档案）。
 * 一般不同规格用不同配方，所以给一条明细选了配方或模具，同规格（成品长宽厚一样）的明细默认跟着设成一样的。
 */
interface OrderTarget {
  itemIds?: number[];
  orderId: number;
}

interface OrderPlanState {
  failed: boolean;
  loading: boolean;
  plan?: Api.Plan;
}

type MaterialItem = Api.ItemPlan & { orderId: number; orderNo: string };

const props = defineProps<{
  disabled?: boolean;
  editable: boolean;
  orderId?: number;
  orders?: OrderTarget[];
}>();
const emit = defineEmits<{
  saved: [itemIds: number[]];
  saving: [value: boolean];
}>();

const SETTING = 'SETTING';

const compact = computed(() => props.orders !== undefined);
const targets = computed<OrderTarget[]>(() => {
  const orderId = props.orderId ?? null;
  return props.orders ?? (orderId === null ? [] : [{ orderId }]);
});
const orderPlans = shallowReactive(new Map<number, OrderPlanState>());
const plan = computed(() => {
  const orderId = props.orderId ?? null;
  return orderId === null ? undefined : orderPlans.get(orderId)?.plan;
});
const recipes = ref<Api.RecipeOption[]>();
const recipeLoading = ref(false);
const recipeError = ref(false);
const loading = computed(() => recipeLoading.value || [...orderPlans.values()].some((state) => state.loading));
const loadError = computed(() => recipeError.value || [...orderPlans.values()].some((state) => state.failed));
const saving = ref<'batch' | 'single'>();
const batchOpen = ref(false);
const batchItemIds = ref<number[]>([]);
const batchRecipeCode = ref<string>();
const batchBoardKey = ref<string>();
const batchError = ref('');
/** 选配方、模具时同规格的明细一起改。 */
const syncSameSize = ref(true);
const canEdit = computed(() => props.editable && !props.disabled && !loading.value
  && !recipeError.value && (compact.value || !loadError.value) && !saving.value);
const displayedItems = computed<MaterialItem[]>(() => targets.value.flatMap(({ orderId, itemIds }) => {
  const state = orderPlans.get(orderId);
  if (!state?.plan || (compact.value && state.failed)) return [];
  const ids = itemIds && new Set(itemIds);
  const { items, orderNo } = state.plan;
  return items.filter((item) => !ids || ids.has(item.itemId))
    .map((item) => ({ ...item, orderId, orderNo }));
}));
const batchCandidates = computed(() => displayedItems.value.filter((item) => num(item.quantity) > 0));
const batchItems = computed(() => batchCandidates.value.filter((item) => batchItemIds.value.includes(item.itemId)));
const allBatchItemsSelected = computed(() => batchItems.value.length > 0 && batchItems.value.length === batchCandidates.value.length);
const batchBoardOptions = computed(() => {
  const [first, ...rest] = batchItems.value;
  if (!first) return [];
  const available = rest.map((item) => new Set(item.candidates.map(boardKey)));
  return first.candidates.map(compactBoardOption).filter((option) => available.every((keys) => keys.has(option.value)));
});

const recipeOptions = computed(() =>
  (recipes.value ?? []).map((r) => ({
    label: `${r.recipeName}（${r.recipeCode}）`,
    value: r.recipeCode,
  })),
);
/** 同规格的其它明细（成品长宽厚一样）。 */
function sameSize(item: Api.ItemPlan) {
  if (!item.targetSize) return [];
  return (plan.value?.items ?? []).filter((i) => i.itemId !== item.itemId && i.targetSize === item.targetSize);
}
const hasSameSize = computed(() => (plan.value?.items ?? []).some((i) => sameSize(i).length > 0));
const showTotals = computed(() => (plan.value?.items.length ?? 0) > 1 && (plan.value?.totals.length ?? 0) > 0);

async function loadRecipes() {
  if (recipes.value || recipeLoading.value) return;
  recipeLoading.value = true;
  recipeError.value = false;
  try {
    recipes.value = await getRecipeOptions();
  } catch {
    recipeError.value = true;
  } finally {
    recipeLoading.value = false;
  }
}

async function loadPlan(orderId: number) {
  const request = { failed: false, loading: true, plan: orderPlans.get(orderId)?.plan };
  orderPlans.set(orderId, request);
  try {
    const result = await getMaterialPlan(orderId);
    if (orderPlans.get(orderId) === request) {
      orderPlans.set(orderId, { failed: false, loading: false, plan: result });
    }
  } catch {
    if (orderPlans.get(orderId) === request) {
      orderPlans.set(orderId, { ...request, failed: true, loading: false });
    }
  }
}

async function load(orderIds: number[]) {
  await Promise.all([loadRecipes(), ...orderIds.map((orderId) => loadPlan(orderId))]);
}

function reload(orderId?: number) {
  const orderIds = targets.value.map((order) => order.orderId);
  return load(orderId === null || orderId === undefined
    ? orderIds
    : orderIds.filter((id) => id === orderId));
}

function retryLoad() {
  void load([...orderPlans].filter(([, state]) => state.failed).map(([id]) => id));
}

function closeBatch() {
  batchOpen.value = false;
  batchItemIds.value = [];
  batchRecipeCode.value = undefined;
  batchBoardKey.value = undefined;
  batchError.value = '';
}

watch(targets, (orders) => {
  const ids = new Set(orders.map((order) => order.orderId));
  for (const id of orderPlans.keys()) {
    if (!ids.has(id)) orderPlans.delete(id);
  }
  if (compact.value) {
    const itemIds = new Set(orders.flatMap((order) => order.itemIds ?? []));
    batchItemIds.value = batchItemIds.value.filter((id) => itemIds.has(id));
  } else {
    closeBatch();
  }
  const addedIds = [...ids].filter((id) => !orderPlans.has(id));
  if (addedIds.length > 0) void load(addedIds);
}, { immediate: true });

watch(batchBoardOptions, (options) => {
  if (!options.some(({ value }) => value === batchBoardKey.value)) batchBoardKey.value = undefined;
});

function setSaving(value?: 'batch' | 'single') {
  saving.value = value;
  emit('saving', !!value);
}

async function save(item: MaterialItem, recipeCode: null | string | undefined, mouldProfileId: null | number | undefined) {
  if (!canEdit.value) return;
  const { orderId } = item;
  const saved: number[] = [];
  setSaving('single');
  const others = !compact.value && syncSameSize.value ? sameSize(item) : [];
  try {
    // 同规格的明细设成和这条一样的配方、模具
    for (const target of [item, ...others]) {
      if (!orderPlans.has(orderId)) return;
      await saveItemMaterial({ itemId: target.itemId, mouldProfileId: mouldProfileId ?? null, recipeCode: recipeCode ?? null });
      saved.push(target.itemId);
    }
    if (orderPlans.has(orderId) && others.length > 0) message.success(`同规格的 ${others.length} 个产品也设成了一样的配方和板材规格`);
  } catch {
    // 后端错误已由全局提示展示
  } finally {
    if (orderPlans.has(orderId)) await reload(orderId);
    if (saved.length > 0) emit('saved', saved);
    setSaving();
  }
}

function selectBatchItem(itemId: number, checked: boolean) {
  batchItemIds.value = checked
    ? [...batchItemIds.value, itemId]
    : batchItemIds.value.filter((id) => id !== itemId);
}

function selectAllBatchItems(checked: boolean) {
  batchItemIds.value = checked ? batchCandidates.value.map((item) => item.itemId) : [];
}

async function applyBatch() {
  const recipeCode = batchRecipeCode.value;
  const board = batchBoardKey.value;
  const items = batchItems.value;
  if (!canEdit.value || (!recipeCode && !board) || items.length === 0) return;

  const failed: number[] = [];
  const saved: number[] = [];
  const affectedOrders = new Set<number>();
  setSaving('batch');
  batchError.value = '';
  try {
    for (const item of items) {
      if (!orderPlans.has(item.orderId)) continue;
      affectedOrders.add(item.orderId);
      try {
        await saveItemMaterial({
          itemId: item.itemId,
          mouldProfileId: board ? mouldId(board) : item.mouldProfileId ?? null,
          recipeCode: recipeCode ?? configuredRecipe(item),
        });
        saved.push(item.itemId);
      } catch {
        failed.push(item.itemId);
      }
    }
    const orderIds = [...affectedOrders].filter((id) => orderPlans.has(id));
    if (orderIds.length === 0) return;
    batchItemIds.value = failed;
    if (failed.length > 0) {
      batchError.value = `已保存 ${saved.length} 个产品，${failed.length} 个保存失败，已保留勾选，可重试。`;
    } else {
      message.success(`已为 ${saved.length} 个产品${compact.value ? '更新设置' : '应用配方'}`);
      batchRecipeCode.value = undefined;
      batchBoardKey.value = undefined;
    }
    await load(orderIds);
  } finally {
    if (saved.length > 0) emit('saved', saved);
    setSaving();
  }
}

function boardKey(b: Api.Board) {
  return b.source === SETTING ? SETTING : String(b.mouldProfileId);
}

function mouldId(key: string) {
  return key === SETTING ? null : Number(key);
}

function compactBoardOption(board: Api.Board) {
  return { label: `${board.name} · ${dimensionTextInMm(`${board.size}cm`)}`, value: boardKey(board) };
}

function compactBoardValue(item: Api.ItemPlan) {
  const board = item.board;
  return board && (board.mouldProfileId ?? null) === (item.mouldProfileId ?? null) ? boardKey(board) : undefined;
}

function boardSource(item: Api.ItemPlan) {
  if (!item.board) return '';
  if (item.board.source === SETTING) return '工厂默认';
  const mouldProfileId = item.mouldProfileId ?? null;
  return mouldProfileId !== null && item.board.mouldProfileId === mouldProfileId ? '已选' : '推荐模具';
}

function boardOptions(item: Api.ItemPlan) {
  return item.candidates.map((b) => ({
    label: `${b.name} ${b.size}cm · ${b.layerPlans?.length ? '按各层厚度换算' : `一张出 ${b.perBoard} ${b.layersPerProduct === 2 ? '片单层片材' : '条'}`} · ${b.boards} 张${b.kg ? ` · ${num(b.kg)}kg` : ''}`,
    value: boardKey(b),
  }));
}

function configuredRecipe(item: Api.ItemPlan) {
  return compact.value && item.recipeSuggested ? null : item.recipeCode ?? null;
}

function recipePlaceholder(item: Api.ItemPlan) {
  if (!item.recipeSuggested || !item.recipeCode) return '未选配方';
  return item.recipeName ? `${item.recipeName}（${item.recipeCode}）` : item.recipeCode;
}

function onRecipe(item: MaterialItem, value: unknown) {
  return save(item, (value as string | undefined) ?? null, item.mouldProfileId);
}

function onBoard(item: MaterialItem, value: unknown) {
  return save(item, configuredRecipe(item), mouldId(String(value)));
}

function fmt(v: null | number | string | undefined) {
  return num(v).toLocaleString('zh-CN', { maximumFractionDigits: 3 });
}

defineExpose({ reload, saving });
</script>

<template>
  <section :aria-label="compact ? '配方和发泡模具' : undefined" class="flex flex-col gap-2">
    <div class="flex flex-wrap items-center justify-between gap-2">
      <h3 class="m-0 text-sm font-semibold">{{ compact ? '配方与发泡模具' : '用料逆推' }}</h3>
      <div class="flex flex-wrap items-center gap-2">
        <Checkbox
          v-if="!compact && editable && hasSameSize && !batchOpen"
          v-model:checked="syncSameSize"
          :disabled="!canEdit"
          class="text-xs"
        >
          同规格的产品一起改配方和模具
        </Checkbox>
        <Button
          v-if="editable && batchCandidates.length > 1 && !batchOpen"
          :disabled="!canEdit"
          size="small"
          @click="batchOpen = true"
        >
          {{ compact ? '批量设置' : '批量选配方' }}
        </Button>
      </div>
    </div>
    <Spin :spinning="loading">
      <Alert v-if="loadError" class="mb-3" :message="compact ? '配方和模具加载失败' : '用料逆推加载失败'" show-icon type="error">
        <template #action><Button size="small" :disabled="loading || !!saving" @click="retryLoad">重新加载</Button></template>
      </Alert>
      <div v-if="compact ? displayedItems.length > 0 : plan" class="flex flex-col gap-3">
        <section v-if="editable && batchOpen" :aria-label="compact ? '批量设置配方和模具' : '批量选配方'" class="space-y-3 rounded-md border border-primary/25 bg-muted/40 p-3">
          <div class="flex flex-wrap items-center justify-between gap-2">
            <span class="text-sm font-medium">{{ compact ? '已选' : '批量选配方 · 已选' }} {{ batchItems.length }} / {{ batchCandidates.length }} 个产品</span>
            <Button :disabled="!!saving" size="small" type="text" @click="closeBatch">退出批量选择</Button>
          </div>
          <div class="max-h-56 overflow-auto rounded-md border border-border bg-background">
            <table class="w-full text-left text-xs">
              <thead class="sticky top-0 z-10 bg-muted text-muted-foreground">
                <tr>
                  <th class="w-px whitespace-nowrap px-3 py-2 font-normal" scope="col">
                    <Checkbox
                      :checked="allBatchItemsSelected"
                      :disabled="!canEdit || batchCandidates.length === 0"
                      :indeterminate="batchItems.length > 0 && !allBatchItemsSelected"
                      @change="(event) => selectAllBatchItems(event.target.checked)"
                    >
                      全选
                    </Checkbox>
                  </th>
                  <th v-if="compact" class="px-3 py-2 font-normal" scope="col">订单号</th>
                  <th class="px-3 py-2 font-normal" scope="col">产品 / 成品规格</th>
                  <th class="px-3 py-2 font-normal" scope="col">当前配方</th>
                  <th v-if="compact" class="px-3 py-2 font-normal" scope="col">当前发泡模具 / 板材规格</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="item in batchCandidates" :key="item.itemId" class="border-t border-border">
                  <td class="px-3 py-2">
                    <Checkbox
                      :aria-label="`勾选 ${compact && targets.length > 1 ? `${item.orderNo} ` : ''}${item.productName}${!compact && item.targetSize ? ` ${item.targetSize}cm` : ''}`"
                      :checked="batchItemIds.includes(item.itemId)"
                      :disabled="!canEdit"
                      @change="(event) => selectBatchItem(item.itemId, event.target.checked)"
                    />
                  </td>
                  <td v-if="compact" class="whitespace-nowrap px-3 py-2 font-mono">{{ item.orderNo }}</td>
                  <td class="px-3 py-2">
                    <div>{{ item.productName }}</div>
                    <div class="mt-0.5 text-muted-foreground">
                      {{ item.targetSize ? `${item.targetSize}cm · ` : '' }}{{ fmt(item.quantity) }} {{ item.unit }}
                    </div>
                  </td>
                  <td class="px-3 py-2">
                    {{ item.recipeName || item.recipeCode || '未选' }}
                    <span v-if="item.recipeSuggested" class="text-muted-foreground">{{ compact ? '（按上次建议）' : '（建议）' }}</span>
                  </td>
                  <td v-if="compact" class="px-3 py-2">
                    {{ item.board ? compactBoardOption(item.board).label : '暂无适用规格' }}
                    <span v-if="item.board" class="text-muted-foreground">（{{ boardSource(item) }}）</span>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
          <div class="flex flex-wrap items-end gap-2">
            <label class="flex min-w-48 flex-1 flex-col gap-1 text-xs text-muted-foreground" :for="compact ? 'split-mp-batch-recipe' : 'mp-batch-recipe'">
              应用配方
              <Select
                :id="compact ? 'split-mp-batch-recipe' : 'mp-batch-recipe'"
                v-model:value="batchRecipeCode"
                :disabled="!canEdit"
                :options="recipeOptions"
                allow-clear
                option-filter-prop="label"
                :placeholder="compact ? '保留各产品原配方' : '搜索或选择配方'"
                show-search
              />
            </label>
            <label v-if="compact" class="flex min-w-48 flex-1 flex-col gap-1 text-xs text-muted-foreground" for="split-mp-batch-board">
              应用发泡模具 / 板材规格
              <Select
                id="split-mp-batch-board"
                v-model:value="batchBoardKey"
                :disabled="!canEdit || batchBoardOptions.length === 0"
                :options="batchBoardOptions"
                :placeholder="batchItems.length > 0 && batchBoardOptions.length === 0 ? '所选产品无共用规格' : '保留各产品原规格'"
                allow-clear
                option-filter-prop="label"
                show-search
              />
            </label>
            <Button
              :disabled="!canEdit || batchItems.length === 0 || (!batchRecipeCode && !batchBoardKey)"
              :loading="saving === 'batch'"
              type="primary"
              @click="applyBatch"
            >
              应用到所选产品
            </Button>
          </div>
          <Alert v-if="batchError" :message="batchError" show-icon type="warning" />
        </section>
        <template v-if="compact">
          <div v-if="displayedItems.length > 0 && !batchOpen" class="max-h-64 overflow-auto rounded-md border border-border">
            <table class="w-full min-w-[840px] table-fixed text-left text-xs">
              <colgroup>
                <col class="w-36" />
                <col class="w-1/4" />
                <col class="w-1/4" />
                <col />
              </colgroup>
              <thead class="sticky top-0 z-10 bg-muted text-muted-foreground">
                <tr>
                  <th class="px-3 py-2 font-normal" scope="col">订单号</th>
                  <th class="px-3 py-2 font-normal" scope="col">产品 / 成品规格</th>
                  <th class="px-3 py-2 font-normal" scope="col">配方</th>
                  <th class="px-3 py-2 font-normal" scope="col">发泡模具 / 板材规格</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="item in displayedItems" :key="item.itemId" class="border-t border-border align-top">
                  <td class="whitespace-nowrap px-3 py-2 font-mono">{{ item.orderNo }}</td>
                  <td class="px-3 py-2">
                    <div class="font-medium">{{ item.productName }}</div>
                    <div class="mt-1 text-muted-foreground">
                      <template v-if="item.targetSize">{{ dimensionTextInMm(`${item.targetSize}cm`) }} · </template>
                      {{ fmt(item.quantity) }} {{ item.unit }}
                    </div>
                  </td>
                  <td class="px-3 py-2">
                    <Select
                      :id="`split-mp-recipe-${item.itemId}`"
                      :aria-label="`${item.orderNo} ${item.productName}的配方`"
                      :disabled="!canEdit"
                      :options="recipeOptions"
                      :value="configuredRecipe(item) ?? undefined"
                      allow-clear
                      class="w-full"
                      option-filter-prop="label"
                      :placeholder="recipePlaceholder(item)"
                      show-search
                      size="small"
                      @change="(v) => onRecipe(item, v)"
                    />
                    <div v-if="item.recipeCode" class="mt-1 text-muted-foreground">{{ item.recipeSuggested ? '按上次建议' : '已选' }}</div>
                  </td>
                  <td class="px-3 py-2">
                    <Select
                      :id="`split-mp-board-${item.itemId}`"
                      :aria-label="`${item.orderNo} ${item.productName}的发泡模具 / 板材规格`"
                      :disabled="!canEdit || item.candidates.length === 0"
                      :options="item.candidates.map(compactBoardOption)"
                      :value="compactBoardValue(item)"
                      class="w-full"
                      option-filter-prop="label"
                      :placeholder="item.board ? compactBoardOption(item.board).label : '暂无适用规格'"
                      show-search
                      size="small"
                      @change="(v) => onBoard(item, v)"
                    />
                    <div v-if="item.board || item.mouldProfileId != null" class="mt-1 text-muted-foreground">
                      <span v-if="item.mouldProfileId != null && item.mouldProfileId !== item.board?.mouldProfileId">已选模具不可用{{ item.board ? '，改用' : '' }}</span>{{ boardSource(item) }}
                    </div>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </template>
        <template v-else>
        <div v-for="item in displayedItems" :key="item.itemId" class="flex flex-col gap-2 rounded-md border border-border p-3">
          <div class="flex flex-wrap items-baseline justify-between gap-2">
            <span class="font-medium">{{ item.productName }}</span>
            <span class="text-xs text-muted-foreground">
              <template v-if="item.targetSize">成品 {{ item.targetSize }}cm<template v-if="sameSize(item).length > 0">（同规格 {{ sameSize(item).length + 1 }} 个）</template> · </template>
              成品数量 <b class="text-foreground tabular-nums">{{ item.quantity == null ? '未填写' : fmt(item.quantity) }}</b> {{ item.unit }} ·
              还要做 <b class="text-foreground tabular-nums">{{ fmt(item.remaining) }}</b> {{ item.unit }}
            </span>
          </div>

          <div class="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <label :for="`mp-recipe-${item.itemId}`" class="flex flex-col gap-1 text-xs text-muted-foreground">
              <span>
                配方
                <Tag v-if="item.recipeSuggested" class="ml-1" color="blue">按上次建议</Tag>
              </span>
              <Select
                :id="`mp-recipe-${item.itemId}`"
                allow-clear
                :disabled="!canEdit || batchOpen"
                :options="recipeOptions"
                placeholder="选配方才能算原料"
                show-search
                option-filter-prop="label"
                :value="item.recipeCode ?? undefined"
                @change="(v) => onRecipe(item, v)"
              />
            </label>
            <label v-if="item.candidates.length > 0" :for="`mp-board-${item.itemId}`" class="flex flex-col gap-1 text-xs text-muted-foreground">
              板材规格（共 {{ item.candidates.length }} 种能切）
              <Select
                :id="`mp-board-${item.itemId}`"
                :disabled="!canEdit || batchOpen"
                :options="boardOptions(item)"
                option-filter-prop="label"
                placeholder="输入模具尺寸搜索，如 780"
                show-search
                :value="item.board ? boardKey(item.board) : undefined"
                @change="(v) => onBoard(item, v)"
              />
            </label>
          </div>

          <p v-if="item.board" class="m-0 text-sm">
            {{ item.board.layersPerProduct === 2 ? '单层片材理论换算' : '成品理论换算' }}：板材 <b>{{ dimensionTextInMm(`${item.board.size }cm`) }}</b>，
            <template v-if="!item.board.layerPlans?.length">{{ item.board.layers }} 层 × 每层 {{ item.board.piecesPerLayer }} {{ item.board.layersPerProduct === 2 ? '片' : '条' }} = 每张理论 {{ item.board.perBoard }} {{ item.board.layersPerProduct === 2 ? '片单层片材' : '条' }} → </template>预计需 <b class="tabular-nums">{{ item.board.boards }}</b> 张
            <span class="text-xs text-muted-foreground">（利用率 {{ fmt(item.board.utilization) }}%）</span>
            <br /><span class="text-xs text-muted-foreground">开片按各制造层的实际厚度计算，长宽沿用板材；立切只裁长宽。双层贴合后厚度相加。</span>
            <span v-for="layer in item.board.layerPlans" :key="layer.side" class="mt-1 block text-xs text-muted-foreground">
              {{ layer.side === 'BOTH' ? '正反同规格层' : layer.side === 'FRONT' ? '正面层' : '反面层' }} · {{ layer.color }} · {{ Number((layer.thickness * 10).toFixed(2)) }} mm：每板开 {{ layer.layers }} 层、出 {{ layer.perBoard }} 片单层片材，需 {{ layer.boards }} 张板<span v-if="layer.perProduct === 2">（每垫 2 片）</span>
            </span>
            <span v-if="item.board.layersPerProduct === 2 && !item.board.layerPlans?.length" class="mt-1 block text-xs text-muted-foreground">
              每条成品需要正反两层各 1 片；分色备板：{{ Object.entries(item.board.boardsByColor ?? {}).map(([color, count]) => `${color} ${count} 张`).join('；') }}
            </span>
            <template v-if="item.rawKg">
              <br />
              原料 <b class="tabular-nums">{{ fmt(item.rawKg) }}</b> kg（每张 {{ fmt(item.board.kgPerBoard) }}kg）≈ 发泡
              <b class="tabular-nums">{{ fmt(item.batches) }}</b> 锅<span class="text-xs text-muted-foreground">（一锅 {{ fmt(item.batchKg) }}kg）</span>
            </template>
          </p>

          <table v-if="item.raws.length > 0" class="w-full text-xs">
            <thead class="text-muted-foreground">
              <tr>
                <th class="py-1 text-left font-normal">原料（按整锅）</th>
                <th class="py-1 text-right font-normal">要</th>
                <th class="py-1 text-right font-normal">库存</th>
                <th class="py-1 text-right font-normal">缺</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="r in item.raws" :key="r.rawMaterialCode" class="border-t border-border">
                <td class="py-1">{{ r.rawMaterialName || r.rawMaterialCode }}</td>
                <td class="py-1 text-right tabular-nums">{{ fmt(r.required) }}kg</td>
                <td class="py-1 text-right tabular-nums">{{ fmt(r.available) }}kg</td>
                <td class="py-1 text-right tabular-nums" :class="num(r.shortage) > 0 ? 'text-destructive' : 'text-muted-foreground'">
                  {{ num(r.shortage) > 0 ? `${fmt(r.shortage)}kg` : '够' }}
                </td>
              </tr>
            </tbody>
          </table>

          <p v-if="item.stock.length > 0" class="m-0 text-xs text-muted-foreground">
            库存里能用的（多张单共用，先用库存可以少做板）：
            {{ item.stock.map((s) => `${s.stageLabel} ${s.itemCode} ${fmt(s.quantity)}${s.unit ?? ''} → ${s.color ? `${s.side ? s.side === 'BOTH' ? '正反同规格 ' : s.side === 'FRONT' ? '正面 ' : '反面 ' : ''}${s.color}${s.thickness != null ? ` ${Number((s.thickness * 10).toFixed(2))} mm` : ''} 单层 ${fmt(s.pieces)} 片` : `${fmt(s.pieces)} 条成品`}`).join('；') }}
          </p>
          <p v-for="w in item.warnings" :key="w" class="m-0 text-xs text-warning">{{ w }}</p>
        </div>

        <div v-if="plan && showTotals" class="flex flex-col gap-1 rounded-md bg-muted/40 p-3 text-xs">
          <span class="font-semibold text-foreground">整张单原料合计</span>
          <span v-for="t in plan.totals" :key="t.rawMaterialCode" class="flex justify-between gap-2">
            <span>{{ t.rawMaterialName || t.rawMaterialCode }}</span>
            <span class="tabular-nums">
              {{ fmt(t.required) }}kg / 库存 {{ fmt(t.available) }}kg
              <b v-if="num(t.shortage) > 0" class="text-destructive">缺 {{ fmt(t.shortage) }}kg</b>
            </span>
          </span>
        </div>
        <p class="m-0 text-xs text-muted-foreground">
          按成品长宽及各层厚度切板，双层按正反面的颜色和厚度分别备料，同色等厚可合并；不算锯缝和切边损耗，原料按配方整锅算。板材下拉列出全部能切的规格，当前用的在最前，其余按用料从少到多。没选板材规格时用「工厂设置」里的发泡出板规格。
        </p>
        </template>
      </div>
    </Spin>
  </section>
</template>
