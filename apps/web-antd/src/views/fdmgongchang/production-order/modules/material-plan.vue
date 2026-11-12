<script setup lang="ts">
import type { FdmgongchangMaterialPlanApi as Api } from '#/api/fdmgongchang/production-order';

import { computed, ref, watch } from 'vue';

import { Checkbox, message, Select, Spin, Tag } from 'ant-design-vue';

import { getMaterialPlan, getRecipeOptions, saveItemMaterial } from '#/api/fdmgongchang/production-order';

import { dimensionTextInMm } from '../../shared/dimensions';
import { num } from '../shared';

/**
 * 用料逆推（工厂看）：按订单成品规格倒推用什么板材、要几张、要多少原料，系统直接算。
 * 工厂可以给每条明细换配方（决定每张板投多少料、原料比例）和板材规格（默认本厂发泡出板规格，可换模具档案）。
 * 一般不同规格用不同配方，所以给一条明细选了配方或模具，同规格（成品长宽厚一样）的明细默认跟着设成一样的。
 */
const props = defineProps<{ editable: boolean; orderId: number }>();

const SETTING = 'SETTING';

const plan = ref<Api.Plan>();
const recipes = ref<Api.RecipeOption[]>([]);
const loading = ref(false);
const saving = ref<number>();
/** 选配方、模具时同规格的明细一起改。 */
const syncSameSize = ref(true);

const recipeOptions = computed(() =>
  recipes.value.map((r) => ({
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

async function load() {
  loading.value = true;
  try {
    const [p, r] = await Promise.all([
      getMaterialPlan(props.orderId),
      recipes.value.length > 0 ? Promise.resolve(recipes.value) : getRecipeOptions(),
    ]);
    plan.value = p;
    recipes.value = r;
  } finally {
    loading.value = false;
  }
}

watch(() => props.orderId, load, { immediate: true });

async function save(item: Api.ItemPlan, recipeCode: null | string | undefined, mouldProfileId: null | number | undefined) {
  saving.value = item.itemId;
  const others = syncSameSize.value ? sameSize(item) : [];
  try {
    // 同规格的明细设成和这条一样的配方、模具
    for (const target of [item, ...others]) {
      await saveItemMaterial({ itemId: target.itemId, mouldProfileId: mouldProfileId ?? null, recipeCode: recipeCode ?? null });
    }
    if (others.length > 0) message.success(`同规格的 ${others.length} 个产品也设成了一样的配方和板材规格`);
    await load();
  } catch {
    // 后端错误已由全局提示展示
  } finally {
    saving.value = undefined;
  }
}

function boardKey(b: Api.Board) {
  return b.source === SETTING ? SETTING : String(b.mouldProfileId);
}

function boardOptions(item: Api.ItemPlan) {
  return item.candidates.map((b) => ({
    label: `${b.name} ${b.size}cm · ${b.layerPlans?.length ? '按各层厚度换算' : `一张出 ${b.perBoard} ${b.layersPerProduct === 2 ? '片单层片材' : '条'}`} · ${b.boards} 张${b.kg ? ` · ${num(b.kg)}kg` : ''}`,
    value: boardKey(b),
  }));
}

function onRecipe(item: Api.ItemPlan, value: unknown) {
  return save(item, (value as string | undefined) ?? null, item.mouldProfileId);
}

function onBoard(item: Api.ItemPlan, value: unknown) {
  return save(item, item.recipeCode, value === SETTING ? null : Number(value));
}

function fmt(v: null | number | string | undefined) {
  return num(v).toLocaleString('zh-CN', { maximumFractionDigits: 3 });
}

defineExpose({ reload: load });
</script>

<template>
  <section class="flex flex-col gap-2">
    <div class="flex flex-wrap items-center justify-between gap-2">
      <h3 class="m-0 text-sm font-semibold">用料逆推</h3>
      <Checkbox v-if="editable && hasSameSize" v-model:checked="syncSameSize" class="text-xs">同规格的产品一起改配方和模具</Checkbox>
    </div>
    <Spin :spinning="loading">
      <div v-if="plan" class="flex flex-col gap-3">
        <div v-for="item in plan.items" :key="item.itemId" class="flex flex-col gap-2 rounded-md border border-border p-3">
          <div class="flex flex-wrap items-baseline justify-between gap-2">
            <span class="font-medium">{{ item.productName }}</span>
            <span class="text-xs text-muted-foreground">
              <template v-if="item.targetSize">成品 {{ item.targetSize }}cm<template v-if="sameSize(item).length > 0">（同规格 {{ sameSize(item).length + 1 }} 个）</template> · </template>
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
                :disabled="!editable || saving === item.itemId"
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
                :disabled="!editable || saving === item.itemId"
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

        <div v-if="showTotals" class="flex flex-col gap-1 rounded-md bg-muted/40 p-3 text-xs">
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
      </div>
    </Spin>
  </section>
</template>
