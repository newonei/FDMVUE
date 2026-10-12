<script setup lang="ts">
import type { FdmgongchangStageStockApi as StockApi } from '#/api/fdmgongchang/stage-stock';

import { computed, onMounted, ref, watch } from 'vue';

import { Empty, message, Spin } from 'ant-design-vue';

import { getWorkbenchRecipePlan, getWorkbenchStock } from '#/api/fdmgongchang/workbench';

import { attrSummary, formatQty, makeLabels, recipePicks, toNumber } from '../../stage-stock/model';
import { stageOf, useJob } from '../use-job';
import BigCounter from './big-counter.vue';
import StepHeader from './step-header.vue';

/**
 * 第 1 步 领材料：列出上道库存，点卡片选料（可以选多种），大按钮填数量。
 * 贴合要领两种片材：第一张是正面，第二张是反面。
 * 密炼可以按配方领：选配方和锅数，自动把每种原料要领多少带出来；补领时按单上的配方补齐还差的。
 */
const emit = defineEmits<{ back: []; next: [] }>();
const job = useJob();

const stocks = ref<StockApi.Stock[]>([]);
const loading = ref(false);
const labels = computed(() => makeLabels(job.options));
const laminate = computed(() => job.process?.code === 'LAMINATE');
const source = computed(() => stageOf(job, job.sourceStage));

async function load() {
  loading.value = true;
  try {
    const page = await getWorkbenchStock(job.sourceStage);
    // 先进先出：批次早的排前面，第一张标「推荐」
    stocks.value = page.list.toSorted((a, b) => a.batchNo.localeCompare(b.batchNo));
  } finally {
    loading.value = false;
  }
}
onMounted(load);
watch(() => job.sourceStage, () => {
  job.picks = [];
  void load();
});

const pickOf = (stock: StockApi.Stock) => job.picks.find((p) => p.stock.id === stock.id);

function toggle(stock: StockApi.Stock) {
  const existing = pickOf(stock);
  if (existing) {
    job.picks = job.picks.filter((p) => p !== existing);
    return;
  }
  const qty = Math.min(toNumber(stock.quantity) ?? 0, 100);
  if (laminate.value) {
    if (job.picks.length >= 2) job.picks = job.picks.slice(1);
    const side = job.picks.some((p) => p.side === 'FRONT') ? 'BACK' : 'FRONT';
    job.picks = [...job.picks, { qty, side, stock }];
  } else {
    // 一次可以领多种料（密炼一个配方要好几种原料）
    job.picks = [...job.picks, { qty, stock }];
  }
}

// ===== 按配方领（密炼） =====
const mixFromRaw = computed(() => job.process?.code === 'MIX' && job.sourceStage === 'RAW');
const recipes = computed(() => (job.options?.recipes ?? []).filter((r) => r.enabled));
const orderRecipe = computed(() => (job.supplement ? job.order?.recipeCode : undefined));
const recipeCode = ref<string | undefined>(job.recipe?.code);
const batches = ref<null | number>(job.recipe?.batches ?? 1);
const recipeLoading = ref(false);
const shortages = ref<string[]>([]);

async function applyRecipe() {
  if (!job.supplement && (!recipeCode.value || !(batches.value && batches.value > 0))) {
    message.warning('先选配方，再填几锅');
    return;
  }
  recipeLoading.value = true;
  try {
    const plan = await getWorkbenchRecipePlan(
      job.supplement && job.order
        ? { orderId: job.order.id }
        : { batches: batches.value!, recipeCode: recipeCode.value },
    );
    job.picks = recipePicks(plan).map((l) => ({
      qty: l.quantity,
      stock: stocks.value.find((s) => s.id === l.stock.id) ?? (l.stock as StockApi.Stock),
    }));
    shortages.value = plan.lines
      .filter((l) => Number(l.shortage) > 0)
      .map((l) => `${l.rawMaterialName || l.rawMaterialCode} 还缺 ${formatQty(l.shortage)} kg`);
    if (!job.supplement) job.recipe = { batches: batches.value!, code: recipeCode.value! };
    if (job.picks.length === 0) message.info(job.supplement ? '按配方已经领够了' : '原料库存里没有这个配方的料');
  } finally {
    recipeLoading.value = false;
  }
}

// 换了配方或锅数，等重新带出后再记到单上
watch([recipeCode, batches], () => {
  if (!job.supplement) job.recipe = undefined;
});

function next() {
  if (job.picks.length === 0) {
    message.warning('先点一下要用的料');
    return;
  }
  // 补领贴合片材可以只补一面
  if (laminate.value && !job.supplement && job.picks.length < 2) {
    message.warning('贴合要选正面和反面两种片材');
    return;
  }
  if (job.picks.some((p) => !(p.qty > 0))) {
    message.warning('请填写领多少');
    return;
  }
  emit('next');
}
</script>

<template>
  <div class="flex min-h-full flex-col">
    <StepHeader
      :current="1"
      :subtitle="job.supplement ? `补到 ${job.order?.orderNo ?? ''}，领少了的料在这里再领` : job.task ? `${job.task.contractCode ? `订单 ${job.task.contractCode}` : '备货'} · ${[job.task.product, job.task.spec].filter(Boolean).join(' ')}` : '自己开单'"
      :title="`${job.process?.label} · 第 1 步 ${job.supplement ? '补领' : '领材料'}`"
      :total="job.supplement ? 2 : 3"
      @back="emit('back')"
    />
    <main class="flex flex-1 flex-col gap-3 p-4">
      <section v-if="mixFromRaw && (!job.supplement || orderRecipe)" class="flex flex-col gap-3 rounded-2xl border-2 border-primary/40 bg-card p-4">
        <span class="text-base font-bold">{{ job.supplement ? '按配方补齐' : '按配方领（一次领齐所有原料）' }}</span>
        <template v-if="!job.supplement">
          <div class="flex flex-wrap gap-2">
            <button
              v-for="r in recipes"
              :key="r.code"
              :class="r.code === recipeCode ? 'border-primary bg-primary/10 text-primary' : 'border-border'"
              class="h-11 rounded-lg border-2 px-3 text-[15px] font-bold"
              type="button"
              @click="recipeCode = r.code"
            >
              {{ r.name }}
            </button>
          </div>
          <span class="text-[15px]">做几锅？</span>
          <BigCounter id="recipe-batches" v-model="batches" label="锅数" :precision="1" :step="1" size="medium" />
        </template>
        <span v-else class="text-sm text-muted-foreground">这张单是按配方领的，点下面按配方算出还差哪些料</span>
        <button
          :disabled="recipeLoading"
          class="h-12 rounded-xl bg-primary text-base font-bold text-primary-foreground"
          type="button"
          @click="applyRecipe"
        >
          {{ recipeLoading ? '正在算…' : job.supplement ? '按配方补齐还差的' : '按配方带出要领的料' }}
        </button>
        <p v-for="t in shortages" :key="t" class="m-0 text-sm font-bold text-destructive">{{ t }}，先领有的，到料后再补领</p>
      </section>
      <div v-if="!job.supplement && (job.process?.sources.length ?? 0) > 1" class="flex flex-wrap gap-2">
        <button
          v-for="code in job.process?.sources"
          :key="code"
          :class="code === job.sourceStage ? 'border-primary bg-primary/10 text-primary' : 'border-border'"
          class="h-11 rounded-lg border-2 px-3 text-[15px] font-bold"
          type="button"
          @click="job.sourceStage = code"
        >
          从{{ stageOf(job, code)?.label }}领
        </button>
      </div>
      <p class="m-0 text-[15px] text-muted-foreground">
        {{ laminate ? '先点正面用的片材，再点反面用的片材' : `点你要用的${source?.label}，可以点好几种` }}
      </p>
      <Spin :spinning="loading">
        <Empty v-if="!loading && stocks.length === 0" :description="`${source?.label ?? ''}现在没有库存`" />
        <div class="flex flex-col gap-3">
          <button
            v-for="(s, i) in stocks"
            :key="s.id"
            :class="pickOf(s) ? 'border-[3px] border-primary ring-4 ring-primary/15' : 'border-2 border-border'"
            class="flex flex-col gap-1.5 rounded-2xl bg-card px-4 py-3.5 text-left"
            type="button"
            @click="toggle(s)"
          >
            <span class="flex w-full items-center justify-between gap-2">
              <span class="text-lg font-bold">{{ attrSummary(s.stage, s.item, labels) || s.itemCode }}</span>
              <span v-if="pickOf(s)?.side" class="shrink-0 rounded-full bg-primary px-2 py-0.5 text-xs text-primary-foreground">
                {{ pickOf(s)?.side === 'FRONT' ? '正面' : '反面' }}
              </span>
              <span v-else-if="i === 0" class="shrink-0 rounded-full bg-primary/10 px-2 py-0.5 text-xs text-primary">推荐</span>
            </span>
            <span class="text-[15px]">库里还有 <b>{{ formatQty(s.quantity) }}</b> {{ source?.unit }} · 批次 {{ s.batchNo }}</span>
          </button>
        </div>
      </Spin>

      <section v-for="p in job.picks" :key="p.stock.id" class="flex flex-col gap-3 rounded-2xl bg-card p-4 shadow-sm">
        <span class="text-base font-bold">
          {{ p.side ? (p.side === 'FRONT' ? '正面' : '反面') : '' }}领多少{{ source?.unit }}？
          <span class="text-sm font-normal text-muted-foreground">（最多 {{ formatQty(p.stock.quantity) }}）</span>
        </span>
        <BigCounter :id="`pick-${p.stock.id}`" v-model="p.qty" label="领用数量" :max="toNumber(p.stock.quantity)" :precision="3" :step="10" />
        <div class="grid grid-cols-3 gap-2">
          <button class="h-11 rounded-lg border border-border bg-muted/40 text-[15px]" type="button" @click="p.qty = Math.min(toNumber(p.stock.quantity) ?? 0, 50)">50</button>
          <button class="h-11 rounded-lg border border-border bg-muted/40 text-[15px]" type="button" @click="p.qty = Math.min(toNumber(p.stock.quantity) ?? 0, 100)">100</button>
          <button class="h-11 rounded-lg border border-border bg-muted/40 text-[15px]" type="button" @click="p.qty = toNumber(p.stock.quantity) ?? 0">全部领</button>
        </div>
      </section>
    </main>
    <footer class="sticky bottom-0 border-t border-border bg-card px-4 pb-5 pt-3">
      <button class="h-14 w-full rounded-xl bg-primary text-lg font-bold text-primary-foreground" type="button" @click="next">下一步</button>
    </footer>
  </div>
</template>
