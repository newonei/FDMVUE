<script setup lang="ts">
import type { FdmgongchangMaterialPlanApi as Api } from '#/api/fdmgongchang/production-order';

import { computed, ref, watch } from 'vue';

import { Select, Spin, Tag } from 'ant-design-vue';

import { getMaterialPlan, getRecipeOptions, saveItemMaterial } from '#/api/fdmgongchang/production-order';

import { num } from '../shared';

/**
 * 用料逆推（工厂看）：按订单成品规格倒推用什么板材、要几张、要多少原料，系统直接算。
 * 工厂可以给每条明细换配方（决定每张板投多少料、原料比例）和板材规格（默认本厂密炼出板规格，可换模具档案）。
 */
const props = defineProps<{ editable: boolean; orderId: number }>();

const SETTING = 'SETTING';

const plan = ref<Api.Plan>();
const recipes = ref<Api.RecipeOption[]>([]);
const loading = ref(false);
const saving = ref<number>();

const recipeOptions = computed(() =>
  recipes.value.map((r) => ({
    label: `${r.recipeName}（${r.recipeCode}）`,
    value: r.recipeCode,
  })),
);
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
  try {
    await saveItemMaterial({ itemId: item.itemId, mouldProfileId: mouldProfileId ?? null, recipeCode: recipeCode ?? null });
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
    label: `${b.name} ${b.size}cm · 一张出 ${b.perBoard} 条 · ${b.boards} 张${b.kg ? ` · ${num(b.kg)}kg` : ''}`,
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
    <h3 class="m-0 text-sm font-semibold">用料逆推</h3>
    <Spin :spinning="loading">
      <div v-if="plan" class="flex flex-col gap-3">
        <div v-for="item in plan.items" :key="item.itemId" class="flex flex-col gap-2 rounded-md border border-border p-3">
          <div class="flex flex-wrap items-baseline justify-between gap-2">
            <span class="font-medium">{{ item.productName }}</span>
            <span class="text-xs text-muted-foreground">
              <template v-if="item.targetSize">成品 {{ item.targetSize }}cm · </template>
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
              板材规格
              <Select
                :id="`mp-board-${item.itemId}`"
                :disabled="!editable || saving === item.itemId"
                :options="boardOptions(item)"
                :value="item.board ? boardKey(item.board) : undefined"
                @change="(v) => onBoard(item, v)"
              />
            </label>
          </div>

          <p v-if="item.board" class="m-0 text-sm">
            板材 <b>{{ item.board.size }}cm</b>：开 {{ item.board.layers }} 层 × 每层 {{ item.board.piecesPerLayer }} 条 =
            一张出 {{ item.board.perBoard }} 条 → 要 <b class="tabular-nums">{{ item.board.boards }}</b> 张
            <span class="text-xs text-muted-foreground">（利用率 {{ fmt(item.board.utilization) }}%）</span>
            <template v-if="item.rawKg">
              <br />
              原料 <b class="tabular-nums">{{ fmt(item.rawKg) }}</b> kg（每张 {{ fmt(item.board.kgPerBoard) }}kg）≈ 密炼
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
            {{ item.stock.map((s) => `${s.stageLabel} ${s.itemCode} ${fmt(s.quantity)}${s.unit ?? ''} → ${fmt(s.pieces)} 条`).join('；') }}
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
          按成品长宽厚切板，不算锯缝和切边损耗；原料按配方整锅算。没选板材规格时用「工厂设置」里的密炼出板规格。
        </p>
      </div>
    </Spin>
  </section>
</template>
